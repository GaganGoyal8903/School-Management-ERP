const mongoose = require('mongoose');
const {
  getSqlClient,
  executeQuery,
  executeStoredProcedure,
  executeInTransaction,
  getPool,
} = require('../config/sqlServer');
const { ensureAuthSqlReady } = require('./authSqlService');
const { ensureStudentSqlReady, getStudentById } = require('./studentSqlService');
const { ensureAcademicSqlReady, getSubjectById, syncSubjectById } = require('./academicSqlService');

const EXAM_TABLE = 'dbo.SqlExams';
const EXAM_SUBJECT_TABLE = 'dbo.SqlExamSubjects';
const EXAM_RESULT_TABLE = 'dbo.SqlExamResults';
const ONLINE_EXAM_PAPER_TABLE = 'dbo.OnlineExamPapers';
const ONLINE_EXAM_QUESTION_TABLE = 'dbo.OnlineExamQuestions';
const ONLINE_EXAM_ATTEMPT_TABLE = 'dbo.OnlineExamAttempts';
const ONLINE_EXAM_ATTEMPT_ANSWER_TABLE = 'dbo.OnlineExamAttemptAnswers';
const DEFAULT_START_TIME = '09:00';
const DEFAULT_DURATION_MINUTES = 60;
const ONLINE_QUESTION_TYPES = new Set(['mcq', 'short_answer']);

let examBootstrapPromise = null;
let examSyncPromise = null;

const parseNumericId = (value) => {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
};

const toNullableString = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
};

const toNumber = (value, fallback = 0) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const normalizeDateOnly = (value) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const normalizeDateTime = (value) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const escapeSqlLiteral = (value = '') => String(value).replace(/'/g, "''");

const parseTimeToMinutes = (timeText) => {
  const text = String(timeText || '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return (hours * 60) + minutes;
};

const formatMinutesToTime = (minutes) => {
  const safeMinutes = ((Number(minutes) || 0) % (24 * 60) + (24 * 60)) % (24 * 60);
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const normalizeClockTime = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // SQL `time` values are returned as UTC-based Date objects anchored to 1970-01-01.
    return `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`;
  }

  const text = String(value || '').trim();
  const timeMatch = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (timeMatch) {
    return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
  }

  const parsedDate = new Date(text);
  if (!Number.isNaN(parsedDate.getTime())) {
    const useUtcClock = /(?:gmt|utc|z|[+-]\d{2}:?\d{2})/i.test(text);
    const hours = useUtcClock ? parsedDate.getUTCHours() : parsedDate.getHours();
    const minutes = useUtcClock ? parsedDate.getUTCMinutes() : parsedDate.getMinutes();
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  return null;
};

const formatSqlTime = (value) => {
  return normalizeClockTime(value);
};

const buildExamDateTime = (dateValue, timeValue = DEFAULT_START_TIME) => {
  const safeDate = normalizeDateOnly(dateValue);
  const safeTime = normalizeClockTime(timeValue) || DEFAULT_START_TIME;
  if (!safeDate) {
    return null;
  }

  const [hoursText, minutesText] = safeTime.split(':');
  const date = new Date(safeDate);
  date.setHours(Number(hoursText), Number(minutesText), 0, 0);
  return date;
};

const getExamWindowStatus = ({ examDate, startTime, endTime, referenceDate = new Date() }) => {
  const safeExamDate = normalizeDateOnly(examDate);
  if (!safeExamDate) {
    return 'upcoming';
  }

  const startDateTime = buildExamDateTime(safeExamDate, startTime || DEFAULT_START_TIME);
  const endDateTime = buildExamDateTime(safeExamDate, endTime || startTime || DEFAULT_START_TIME);
  const safeEndDateTime = endDateTime && startDateTime && endDateTime < startDateTime
    ? new Date(endDateTime.getTime() + (24 * 60 * 60 * 1000))
    : endDateTime;

  if (startDateTime && referenceDate < startDateTime) {
    return 'upcoming';
  }

  if (safeEndDateTime && referenceDate > safeEndDateTime) {
    return 'closed';
  }

  return 'live';
};

const normalizeQuestionType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'short' || normalized === 'shortanswer' || normalized === 'short-answer') {
    return 'short_answer';
  }

  return ONLINE_QUESTION_TYPES.has(normalized) ? normalized : 'mcq';
};

const normalizeOptionKey = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  return ['A', 'B', 'C', 'D'].includes(normalized) ? normalized : null;
};

const normalizeAnswerText = (value) => String(value || '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLowerCase();

const deriveExamTimes = ({ startTime, endTime, duration }) => {
  const startMinutes = parseTimeToMinutes(startTime) ?? parseTimeToMinutes(DEFAULT_START_TIME);
  const endMinutes = parseTimeToMinutes(endTime);
  let durationMinutes = Math.max(1, Math.round(toNumber(duration, 0)));

  if (endMinutes !== null && startMinutes !== null) {
    const derivedDuration = endMinutes >= startMinutes
      ? endMinutes - startMinutes
      : (24 * 60 - startMinutes) + endMinutes;

    if (!durationMinutes) {
      durationMinutes = derivedDuration || DEFAULT_DURATION_MINUTES;
    }
  }

  if (!durationMinutes) {
    durationMinutes = DEFAULT_DURATION_MINUTES;
  }

  const computedEndMinutes = endMinutes ?? (startMinutes + durationMinutes);

  return {
    startTime: formatMinutesToTime(startMinutes),
    endTime: formatMinutesToTime(computedEndMinutes),
    durationMinutes,
  };
};

const calculateGradeLetter = (marksObtained, totalMarks) => {
  const safeTotal = Math.max(toNumber(totalMarks, 0), 0);
  const safeMarks = Math.max(toNumber(marksObtained, 0), 0);
  const percentage = safeTotal > 0 ? (safeMarks / safeTotal) * 100 : 0;

  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B+';
  if (percentage >= 60) return 'B';
  if (percentage >= 50) return 'C+';
  if (percentage >= 40) return 'C';
  if (percentage >= 30) return 'D';
  return 'F';
};

const mapExamSubjectRow = (row) => {
  if (!row) {
    return null;
  }

  return {
    _id: row.ExamSubjectId !== undefined && row.ExamSubjectId !== null
      ? String(row.ExamSubjectId)
      : String(row.MongoSubjectId),
    examSubjectId: row.ExamSubjectId !== undefined && row.ExamSubjectId !== null
      ? String(row.ExamSubjectId)
      : null,
    subjectId: row.SubjectId !== undefined && row.SubjectId !== null
      ? String(row.SubjectId)
      : (row.MongoSubjectId ? String(row.MongoSubjectId) : null),
    name: row.SubjectName || null,
    totalMarks: toNumber(row.MaxMarks ?? row.TotalMarks, 0),
    passingMarks: toNumber(row.PassMarks ?? row.PassingMarks, 0),
    date: row.ExamDate ? new Date(row.ExamDate) : null,
    startTime: formatSqlTime(row.StartTime) || row.StartTime || null,
    endTime: formatSqlTime(row.EndTime) || row.EndTime || null,
    sortOrder: Number(row.SortOrder || row.ExamSubjectId || 1),
  };
};

const mapExamRow = (row) => {
  if (!row) {
    return null;
  }

  const examId = row.ExamId ?? row.MongoExamId ?? null;
  const subjectId = row.SubjectId ?? row.MongoSubjectId ?? null;
  const createdByUserId = row.CreatedByUserId ?? row.CreatedByMongoUserId ?? null;
  const startTime = formatSqlTime(row.StartTime) || row.StartTime || null;
  const endTime = formatSqlTime(row.EndTime) || row.EndTime || null;
  const durationFromTimes =
    parseTimeToMinutes(endTime) !== null && parseTimeToMinutes(startTime) !== null
      ? Math.max(parseTimeToMinutes(endTime) - parseTimeToMinutes(startTime), 0)
      : 0;

  return {
    _id: examId !== null && examId !== undefined ? String(examId) : String(row.MongoExamId),
    id: examId !== null && examId !== undefined ? String(examId) : String(row.MongoExamId),
    title: row.ExamName || row.Name,
    name: row.ExamName || row.Name,
    subject: row.SubjectName
      ? {
          _id: subjectId !== null && subjectId !== undefined ? String(subjectId) : String(row.MongoSubjectId),
          name: row.SubjectName,
          grade: row.SubjectGradeName || row.ClassName || null,
        }
      : (subjectId !== null && subjectId !== undefined ? String(subjectId) : (row.MongoSubjectId || null)),
    subjectId: subjectId !== null && subjectId !== undefined ? String(subjectId) : (row.MongoSubjectId || null),
    grade: row.ClassName,
    class: row.ClassName,
    section: row.SectionName || '',
    date: row.ExamDate ? new Date(row.ExamDate) : (row.StartDate ? new Date(row.StartDate) : null),
    examDate: row.ExamDate ? new Date(row.ExamDate) : (row.StartDate ? new Date(row.StartDate) : null),
    duration: Number(row.DurationMinutes || durationFromTimes || 0),
    startTime,
    endTime,
    totalMarks: toNumber(row.MaxMarks ?? row.TotalMarks, 0),
    passingMarks: toNumber(row.PassMarks ?? row.PassingMarks, 0),
    instructions: row.Instructions || row.Description || '',
    createdBy: row.CreatedByFullName
      ? {
          _id: createdByUserId !== null && createdByUserId !== undefined ? String(createdByUserId) : null,
          fullName: row.CreatedByFullName,
        }
      : (createdByUserId !== null && createdByUserId !== undefined ? String(createdByUserId) : null),
    isActive: row.IsActive === undefined ? true : (row.IsActive === true || row.IsActive === 1),
    createdAt: row.CreatedAt ? new Date(row.CreatedAt) : null,
    updatedAt: row.UpdatedAt ? new Date(row.UpdatedAt) : null,
  };
};

const mapResultRow = (row) => {
  if (!row) {
    return null;
  }

  const percentage = Number(row.Percentage !== undefined ? row.Percentage : 0);
  const examResultId = row.ExamResultId ?? row.MongoGradeId ?? null;
  const studentId = row.StudentId ?? row.MongoStudentId ?? null;
  const examId = row.ExamId ?? row.MongoExamId ?? null;
  const subjectId = row.SubjectId ?? row.MongoSubjectId ?? null;
  const totalMarks = toNumber(row.MaxMarks ?? row.TotalMarks, 0);
  const marksObtained = toNumber(row.MarksObtained, 0);
  const mapped = {
    _id: examResultId !== null && examResultId !== undefined ? String(examResultId) : String(row.MongoGradeId),
    studentId: row.StudentFullName
      ? {
          _id: studentId !== null && studentId !== undefined ? String(studentId) : String(row.MongoStudentId),
          fullName: row.StudentFullName,
          rollNumber: row.StudentRollNumber || null,
        }
      : (studentId !== null && studentId !== undefined ? String(studentId) : row.MongoStudentId),
    examId: row.ExamName
      ? {
          _id: examId !== null && examId !== undefined ? String(examId) : String(row.MongoExamId),
          name: row.ExamName,
          title: row.ExamName,
          examDate: row.ExamDate ? new Date(row.ExamDate) : null,
          date: row.ExamDate ? new Date(row.ExamDate) : null,
          totalMarks,
          passingMarks: toNumber(row.PassMarks ?? row.PassingMarks, 0),
        }
      : (examId !== null && examId !== undefined ? String(examId) : row.MongoExamId),
    subjectId: row.SubjectName
      ? {
          _id: subjectId !== null && subjectId !== undefined ? String(subjectId) : String(row.MongoSubjectId),
          name: row.SubjectName,
        }
      : (subjectId !== null && subjectId !== undefined ? String(subjectId) : row.MongoSubjectId),
    subject: row.SubjectName
      ? {
          _id: subjectId !== null && subjectId !== undefined ? String(subjectId) : String(row.MongoSubjectId),
          name: row.SubjectName,
        }
      : (subjectId !== null && subjectId !== undefined ? String(subjectId) : row.MongoSubjectId),
    marksObtained,
    marks: marksObtained,
    totalMarks,
    grade: row.Grade || row.GradeLetter || '',
    remarks: row.Remarks || '',
    enteredBy: row.EnteredByFullName
      ? {
          _id: row.EnteredByMongoUserId,
          fullName: row.EnteredByFullName,
        }
      : row.EnteredByMongoUserId || null,
    class: row.ClassName,
    section: row.SectionName || '',
    percentage: Number.isFinite(percentage) && percentage
      ? Number(percentage.toFixed(2))
      : (totalMarks > 0 ? Number(((marksObtained / totalMarks) * 100).toFixed(2)) : 0),
    rank: row.ResultRank ? Number(row.ResultRank) : null,
    createdAt: row.CreatedAt ? new Date(row.CreatedAt) : null,
    updatedAt: row.UpdatedAt ? new Date(row.UpdatedAt) : null,
  };

  return mapped;
};

const mapOnlineExamPaperRow = (row) => {
  if (!row) {
    return null;
  }

  return {
    paperId: row.OnlineExamPaperId ? String(row.OnlineExamPaperId) : null,
    examId: row.ExamId ? String(row.ExamId) : null,
    examSubjectId: row.ExamSubjectId ? String(row.ExamSubjectId) : null,
    title: row.Title || null,
    instructions: row.Instructions || '',
    durationMinutes: Number(row.DurationMinutes || 0),
    totalMarks: toNumber(row.TotalMarks, 0),
    allowInstantResult: row.AllowInstantResult === true || row.AllowInstantResult === 1,
    questionCount: Number(row.QuestionCount || 0),
    isActive: row.IsActive === true || row.IsActive === 1,
    createdAt: row.CreatedAt ? new Date(row.CreatedAt) : null,
    updatedAt: row.UpdatedAt ? new Date(row.UpdatedAt) : null,
  };
};

const mapOnlineExamQuestionRow = (row, { includeAnswerKey = true } = {}) => {
  if (!row) {
    return null;
  }

  const questionType = normalizeQuestionType(row.QuestionType);
  const mapped = {
    questionId: row.QuestionId ? String(row.QuestionId) : null,
    paperId: row.OnlineExamPaperId ? String(row.OnlineExamPaperId) : null,
    questionText: row.QuestionText || '',
    questionType,
    marks: toNumber(row.Marks, 0),
    sortOrder: Number(row.SortOrder || 0),
    options: questionType === 'mcq'
      ? ['A', 'B', 'C', 'D']
          .map((key) => ({
            key,
            text: row[`Option${key}`] || '',
          }))
          .filter((option) => option.text)
      : [],
  };

  if (includeAnswerKey) {
    mapped.correctAnswer = row.CorrectAnswer || '';
  }

  return mapped;
};

const mapOnlineExamAttemptRow = (row) => {
  if (!row) {
    return null;
  }

  return {
    attemptId: row.OnlineExamAttemptId ? String(row.OnlineExamAttemptId) : null,
    paperId: row.OnlineExamPaperId ? String(row.OnlineExamPaperId) : null,
    examId: row.ExamId ? String(row.ExamId) : null,
    examSubjectId: row.ExamSubjectId ? String(row.ExamSubjectId) : null,
    studentId: row.StudentId ? String(row.StudentId) : null,
    status: row.Status || 'Started',
    startedAt: row.StartedAt ? new Date(row.StartedAt) : null,
    submittedAt: row.SubmittedAt ? new Date(row.SubmittedAt) : null,
    marksObtained: toNumber(row.MarksObtained, 0),
    totalMarks: toNumber(row.TotalMarks, 0),
    percentage: toNumber(row.Percentage, 0),
    grade: row.Grade || null,
    correctAnswers: Number(row.CorrectAnswers || 0),
    incorrectAnswers: Number(row.IncorrectAnswers || 0),
  };
};

const normalizeOnlineExamQuestions = (questions = []) => {
  const normalizedQuestions = (Array.isArray(questions) ? questions : [])
    .map((question, index) => {
      const questionType = normalizeQuestionType(question?.questionType);
      const questionText = toNullableString(question?.questionText);
      const marks = Number(toNumber(question?.marks, NaN));
      const baseQuestion = {
        questionText,
        questionType,
        marks,
        sortOrder: Number(question?.sortOrder || index + 1),
      };

      if (!questionText || !Number.isFinite(marks) || marks <= 0) {
        return null;
      }

      if (questionType === 'mcq') {
        const options = ['A', 'B', 'C', 'D']
          .map((key) => ({
            key,
            text: toNullableString(question?.options?.find((option) => option?.key === key)?.text || question?.[`option${key}`]),
          }))
          .filter((option) => option.text);
        const correctAnswer = normalizeOptionKey(question?.correctAnswer);

        if (options.length < 2 || !correctAnswer || !options.some((option) => option.key === correctAnswer)) {
          return null;
        }

        return {
          ...baseQuestion,
          options,
          correctAnswer,
        };
      }

      const correctAnswer = toNullableString(question?.correctAnswer);
      if (!correctAnswer) {
        return null;
      }

      return {
        ...baseQuestion,
        options: [],
        correctAnswer,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.sortOrder - right.sortOrder);

  return normalizedQuestions;
};

const buildExamListFilters = ({ className = null, subjectId = null, date = null, examId = null } = {}) => {
  const sql = getSqlClient();
  const clauses = [];
  const params = [];
  const subjectSqlId = parseNumericId(subjectId);
  const examSqlId = parseNumericId(examId);

  if (className) {
    clauses.push('c.ClassName = @ClassName');
    params.push({ name: 'ClassName', type: sql.NVarChar(100), value: toNullableString(className) });
  }

  if (subjectSqlId) {
    clauses.push('es.SubjectId = @SubjectId');
    params.push({ name: 'SubjectId', type: sql.Int, value: subjectSqlId });
  }

  if (date) {
    clauses.push('CAST(COALESCE(es.ExamDate, e.StartDate) AS DATE) = @ExamDate');
    params.push({ name: 'ExamDate', type: sql.Date, value: normalizeDateOnly(date) });
  }

  if (examSqlId) {
    clauses.push('e.ExamId = @ExamId');
    params.push({ name: 'ExamId', type: sql.Int, value: examSqlId });
  }

  return {
    params,
    whereClause: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
  };
};

const buildExamParams = (payload, { includeCreatedAt = true } = {}) => {
  const sql = getSqlClient();
  const params = [
    { name: 'MongoExamId', type: sql.NVarChar(64), value: payload.mongoExamId },
    { name: 'Name', type: sql.NVarChar(200), value: payload.name },
    { name: 'ClassName', type: sql.NVarChar(100), value: payload.className },
    { name: 'SectionName', type: sql.NVarChar(50), value: payload.sectionName || '' },
    { name: 'ExamDate', type: sql.Date, value: payload.examDate },
    { name: 'StartTime', type: sql.NVarChar(10), value: payload.startTime },
    { name: 'EndTime', type: sql.NVarChar(10), value: payload.endTime },
    { name: 'DurationMinutes', type: sql.Int, value: payload.durationMinutes },
    { name: 'TotalMarks', type: sql.Decimal(10, 2), value: toNumber(payload.totalMarks, 0) },
    { name: 'PassingMarks', type: sql.Decimal(10, 2), value: toNumber(payload.passingMarks, 0) },
    { name: 'Instructions', type: sql.NVarChar(2000), value: payload.instructions },
    { name: 'CreatedByMongoUserId', type: sql.NVarChar(64), value: payload.createdByMongoUserId },
    { name: 'IsActive', type: sql.Bit, value: payload.isActive !== false },
    { name: 'UpdatedAt', type: sql.DateTime2(0), value: payload.updatedAt || new Date() },
  ];

  if (includeCreatedAt) {
    params.splice(params.length - 1, 0, {
      name: 'CreatedAt',
      type: sql.DateTime2(0),
      value: payload.createdAt || new Date(),
    });
  }

  return params;
};

const buildExamSubjectParams = ({ mongoExamId, mongoSubjectId, sortOrder = 1, totalMarks, passingMarks }) => {
  const sql = getSqlClient();
  return [
    { name: 'MongoExamId', type: sql.NVarChar(64), value: mongoExamId },
    { name: 'MongoSubjectId', type: sql.NVarChar(64), value: mongoSubjectId },
    { name: 'SortOrder', type: sql.Int, value: Number(sortOrder) || 1 },
    { name: 'TotalMarks', type: sql.Decimal(10, 2), value: toNumber(totalMarks, 0) },
    { name: 'PassingMarks', type: sql.Decimal(10, 2), value: toNumber(passingMarks, 0) },
  ];
};

const buildResultParams = (payload, { includeCreatedAt = true } = {}) => {
  const sql = getSqlClient();
  const params = [
    { name: 'MongoGradeId', type: sql.NVarChar(64), value: payload.mongoGradeId },
    { name: 'MongoExamId', type: sql.NVarChar(64), value: payload.mongoExamId },
    { name: 'MongoStudentId', type: sql.NVarChar(64), value: payload.mongoStudentId },
    { name: 'MongoSubjectId', type: sql.NVarChar(64), value: payload.mongoSubjectId },
    { name: 'MarksObtained', type: sql.Decimal(10, 2), value: toNumber(payload.marksObtained, 0) },
    { name: 'TotalMarks', type: sql.Decimal(10, 2), value: toNumber(payload.totalMarks, 0) },
    { name: 'GradeLetter', type: sql.NVarChar(10), value: payload.gradeLetter },
    { name: 'Remarks', type: sql.NVarChar(1000), value: payload.remarks },
    { name: 'EnteredByMongoUserId', type: sql.NVarChar(64), value: payload.enteredByMongoUserId },
    { name: 'ClassName', type: sql.NVarChar(100), value: payload.className },
    { name: 'SectionName', type: sql.NVarChar(50), value: payload.sectionName || '' },
    { name: 'UpdatedAt', type: sql.DateTime2(0), value: payload.updatedAt || new Date() },
  ];

  if (includeCreatedAt) {
    params.splice(params.length - 1, 0, {
      name: 'CreatedAt',
      type: sql.DateTime2(0),
      value: payload.createdAt || new Date(),
    });
  }

  return params;
};

const EXAM_SCHEMA_BATCH = `
IF OBJECT_ID(N'${EXAM_TABLE}', N'U') IS NULL
BEGIN
  CREATE TABLE ${EXAM_TABLE} (
    SqlExamId INT IDENTITY(1,1) PRIMARY KEY,
    MongoExamId NVARCHAR(64) NOT NULL,
    Name NVARCHAR(200) NOT NULL,
    ClassName NVARCHAR(100) NOT NULL,
    SectionName NVARCHAR(50) NOT NULL CONSTRAINT DF_SqlExams_SectionName DEFAULT (N''),
    ExamDate DATE NOT NULL,
    StartTime NVARCHAR(10) NOT NULL,
    EndTime NVARCHAR(10) NOT NULL,
    DurationMinutes INT NOT NULL CONSTRAINT DF_SqlExams_Duration DEFAULT (60),
    TotalMarks DECIMAL(10,2) NOT NULL,
    PassingMarks DECIMAL(10,2) NOT NULL,
    Instructions NVARCHAR(2000) NULL,
    CreatedByMongoUserId NVARCHAR(64) NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_SqlExams_IsActive DEFAULT (1),
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlExams_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlExams_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SqlExams_MongoExamId' AND object_id = OBJECT_ID(N'${EXAM_TABLE}'))
BEGIN
  CREATE UNIQUE INDEX UX_SqlExams_MongoExamId ON ${EXAM_TABLE}(MongoExamId);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SqlExams_ClassDate' AND object_id = OBJECT_ID(N'${EXAM_TABLE}'))
BEGIN
  CREATE INDEX IX_SqlExams_ClassDate ON ${EXAM_TABLE}(ClassName, ExamDate, IsActive);
END;

IF OBJECT_ID(N'${EXAM_SUBJECT_TABLE}', N'U') IS NULL
BEGIN
  CREATE TABLE ${EXAM_SUBJECT_TABLE} (
    SqlExamSubjectId INT IDENTITY(1,1) PRIMARY KEY,
    MongoExamId NVARCHAR(64) NOT NULL,
    MongoSubjectId NVARCHAR(64) NOT NULL,
    SortOrder INT NOT NULL CONSTRAINT DF_SqlExamSubjects_SortOrder DEFAULT (1),
    TotalMarks DECIMAL(10,2) NOT NULL,
    PassingMarks DECIMAL(10,2) NOT NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlExamSubjects_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlExamSubjects_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SqlExamSubjects_ExamSubject' AND object_id = OBJECT_ID(N'${EXAM_SUBJECT_TABLE}'))
BEGIN
  CREATE UNIQUE INDEX UX_SqlExamSubjects_ExamSubject ON ${EXAM_SUBJECT_TABLE}(MongoExamId, MongoSubjectId);
END;

IF OBJECT_ID(N'${EXAM_RESULT_TABLE}', N'U') IS NULL
BEGIN
  CREATE TABLE ${EXAM_RESULT_TABLE} (
    SqlExamResultId INT IDENTITY(1,1) PRIMARY KEY,
    MongoGradeId NVARCHAR(64) NOT NULL,
    MongoExamId NVARCHAR(64) NOT NULL,
    MongoStudentId NVARCHAR(64) NOT NULL,
    MongoSubjectId NVARCHAR(64) NOT NULL,
    MarksObtained DECIMAL(10,2) NOT NULL,
    TotalMarks DECIMAL(10,2) NOT NULL,
    GradeLetter NVARCHAR(10) NULL,
    Remarks NVARCHAR(1000) NULL,
    EnteredByMongoUserId NVARCHAR(64) NULL,
    ClassName NVARCHAR(100) NOT NULL,
    SectionName NVARCHAR(50) NOT NULL CONSTRAINT DF_SqlExamResults_SectionName DEFAULT (N''),
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlExamResults_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlExamResults_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SqlExamResults_MongoGradeId' AND object_id = OBJECT_ID(N'${EXAM_RESULT_TABLE}'))
BEGIN
  CREATE UNIQUE INDEX UX_SqlExamResults_MongoGradeId ON ${EXAM_RESULT_TABLE}(MongoGradeId);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SqlExamResults_ExamStudentSubject' AND object_id = OBJECT_ID(N'${EXAM_RESULT_TABLE}'))
BEGIN
  CREATE UNIQUE INDEX UX_SqlExamResults_ExamStudentSubject ON ${EXAM_RESULT_TABLE}(MongoExamId, MongoStudentId, MongoSubjectId);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SqlExamResults_Student' AND object_id = OBJECT_ID(N'${EXAM_RESULT_TABLE}'))
BEGIN
  CREATE INDEX IX_SqlExamResults_Student ON ${EXAM_RESULT_TABLE}(MongoStudentId, UpdatedAt);
END;

IF OBJECT_ID(N'${ONLINE_EXAM_PAPER_TABLE}', N'U') IS NULL
BEGIN
  CREATE TABLE ${ONLINE_EXAM_PAPER_TABLE} (
    OnlineExamPaperId INT IDENTITY(1,1) PRIMARY KEY,
    ExamId INT NOT NULL,
    ExamSubjectId INT NOT NULL,
    Title NVARCHAR(200) NULL,
    Instructions NVARCHAR(2000) NULL,
    DurationMinutes INT NOT NULL CONSTRAINT DF_OnlineExamPapers_Duration DEFAULT (60),
    TotalMarks DECIMAL(10,2) NOT NULL CONSTRAINT DF_OnlineExamPapers_TotalMarks DEFAULT (0),
    AllowInstantResult BIT NOT NULL CONSTRAINT DF_OnlineExamPapers_AllowInstantResult DEFAULT (1),
    IsActive BIT NOT NULL CONSTRAINT DF_OnlineExamPapers_IsActive DEFAULT (1),
    CreatedByUserId INT NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_OnlineExamPapers_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_OnlineExamPapers_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_OnlineExamPapers_Exam FOREIGN KEY (ExamId) REFERENCES dbo.Exams(ExamId) ON DELETE CASCADE,
    CONSTRAINT FK_OnlineExamPapers_ExamSubject FOREIGN KEY (ExamSubjectId) REFERENCES dbo.ExamSubjects(ExamSubjectId) ON DELETE CASCADE
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_OnlineExamPapers_ExamSubject' AND object_id = OBJECT_ID(N'${ONLINE_EXAM_PAPER_TABLE}'))
BEGIN
  CREATE UNIQUE INDEX UX_OnlineExamPapers_ExamSubject ON ${ONLINE_EXAM_PAPER_TABLE}(ExamSubjectId);
END;

IF OBJECT_ID(N'${ONLINE_EXAM_QUESTION_TABLE}', N'U') IS NULL
BEGIN
  CREATE TABLE ${ONLINE_EXAM_QUESTION_TABLE} (
    QuestionId INT IDENTITY(1,1) PRIMARY KEY,
    OnlineExamPaperId INT NOT NULL,
    QuestionType NVARCHAR(20) NOT NULL CONSTRAINT DF_OnlineExamQuestions_Type DEFAULT (N'mcq'),
    QuestionText NVARCHAR(MAX) NOT NULL,
    OptionA NVARCHAR(1000) NULL,
    OptionB NVARCHAR(1000) NULL,
    OptionC NVARCHAR(1000) NULL,
    OptionD NVARCHAR(1000) NULL,
    CorrectAnswer NVARCHAR(1000) NOT NULL,
    Marks DECIMAL(10,2) NOT NULL,
    SortOrder INT NOT NULL CONSTRAINT DF_OnlineExamQuestions_SortOrder DEFAULT (1),
    IsActive BIT NOT NULL CONSTRAINT DF_OnlineExamQuestions_IsActive DEFAULT (1),
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_OnlineExamQuestions_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_OnlineExamQuestions_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_OnlineExamQuestions_Paper FOREIGN KEY (OnlineExamPaperId) REFERENCES ${ONLINE_EXAM_PAPER_TABLE}(OnlineExamPaperId) ON DELETE CASCADE
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_OnlineExamQuestions_PaperSort' AND object_id = OBJECT_ID(N'${ONLINE_EXAM_QUESTION_TABLE}'))
BEGIN
  CREATE INDEX IX_OnlineExamQuestions_PaperSort ON ${ONLINE_EXAM_QUESTION_TABLE}(OnlineExamPaperId, SortOrder, QuestionId);
END;

IF OBJECT_ID(N'${ONLINE_EXAM_ATTEMPT_TABLE}', N'U') IS NULL
BEGIN
  CREATE TABLE ${ONLINE_EXAM_ATTEMPT_TABLE} (
    OnlineExamAttemptId INT IDENTITY(1,1) PRIMARY KEY,
    OnlineExamPaperId INT NOT NULL,
    ExamId INT NOT NULL,
    ExamSubjectId INT NOT NULL,
    StudentId INT NOT NULL,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_OnlineExamAttempts_Status DEFAULT (N'Started'),
    StartedAt DATETIME2(0) NOT NULL CONSTRAINT DF_OnlineExamAttempts_StartedAt DEFAULT SYSUTCDATETIME(),
    SubmittedAt DATETIME2(0) NULL,
    CorrectAnswers INT NOT NULL CONSTRAINT DF_OnlineExamAttempts_CorrectAnswers DEFAULT (0),
    IncorrectAnswers INT NOT NULL CONSTRAINT DF_OnlineExamAttempts_IncorrectAnswers DEFAULT (0),
    MarksObtained DECIMAL(10,2) NOT NULL CONSTRAINT DF_OnlineExamAttempts_MarksObtained DEFAULT (0),
    TotalMarks DECIMAL(10,2) NOT NULL CONSTRAINT DF_OnlineExamAttempts_TotalMarks DEFAULT (0),
    Percentage DECIMAL(10,2) NOT NULL CONSTRAINT DF_OnlineExamAttempts_Percentage DEFAULT (0),
    Grade NVARCHAR(10) NULL,
    ResultRemarks NVARCHAR(1000) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_OnlineExamAttempts_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_OnlineExamAttempts_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_OnlineExamAttempts_Paper FOREIGN KEY (OnlineExamPaperId) REFERENCES ${ONLINE_EXAM_PAPER_TABLE}(OnlineExamPaperId) ON DELETE CASCADE,
    CONSTRAINT FK_OnlineExamAttempts_Exam FOREIGN KEY (ExamId) REFERENCES dbo.Exams(ExamId) ON DELETE NO ACTION,
    CONSTRAINT FK_OnlineExamAttempts_ExamSubject FOREIGN KEY (ExamSubjectId) REFERENCES dbo.ExamSubjects(ExamSubjectId) ON DELETE NO ACTION,
    CONSTRAINT FK_OnlineExamAttempts_Student FOREIGN KEY (StudentId) REFERENCES dbo.Students(StudentId) ON DELETE CASCADE
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_OnlineExamAttempts_PaperStudent' AND object_id = OBJECT_ID(N'${ONLINE_EXAM_ATTEMPT_TABLE}'))
BEGIN
  CREATE UNIQUE INDEX UX_OnlineExamAttempts_PaperStudent ON ${ONLINE_EXAM_ATTEMPT_TABLE}(OnlineExamPaperId, StudentId);
END;

IF OBJECT_ID(N'${ONLINE_EXAM_ATTEMPT_ANSWER_TABLE}', N'U') IS NULL
BEGIN
  CREATE TABLE ${ONLINE_EXAM_ATTEMPT_ANSWER_TABLE} (
    OnlineExamAttemptAnswerId INT IDENTITY(1,1) PRIMARY KEY,
    OnlineExamAttemptId INT NOT NULL,
    QuestionId INT NOT NULL,
    StudentAnswer NVARCHAR(MAX) NULL,
    CorrectAnswerSnapshot NVARCHAR(1000) NULL,
    IsCorrect BIT NOT NULL CONSTRAINT DF_OnlineExamAttemptAnswers_IsCorrect DEFAULT (0),
    MarksAwarded DECIMAL(10,2) NOT NULL CONSTRAINT DF_OnlineExamAttemptAnswers_MarksAwarded DEFAULT (0),
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_OnlineExamAttemptAnswers_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_OnlineExamAttemptAnswers_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_OnlineExamAttemptAnswers_Attempt FOREIGN KEY (OnlineExamAttemptId) REFERENCES ${ONLINE_EXAM_ATTEMPT_TABLE}(OnlineExamAttemptId) ON DELETE CASCADE,
    CONSTRAINT FK_OnlineExamAttemptAnswers_Question FOREIGN KEY (QuestionId) REFERENCES ${ONLINE_EXAM_QUESTION_TABLE}(QuestionId)
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_OnlineExamAttemptAnswers_AttemptQuestion' AND object_id = OBJECT_ID(N'${ONLINE_EXAM_ATTEMPT_ANSWER_TABLE}'))
BEGIN
  CREATE UNIQUE INDEX UX_OnlineExamAttemptAnswers_AttemptQuestion ON ${ONLINE_EXAM_ATTEMPT_ANSWER_TABLE}(OnlineExamAttemptId, QuestionId);
END;
`;

const EXAM_SELECT = `
  SELECT TOP 1
    e.MongoExamId,
    e.Name,
    e.ClassName,
    e.SectionName,
    e.ExamDate,
    e.StartTime,
    e.EndTime,
    e.DurationMinutes,
    e.TotalMarks,
    e.PassingMarks,
    e.Instructions,
    e.CreatedByMongoUserId,
    e.IsActive,
    e.CreatedAt,
    e.UpdatedAt,
    es.MongoSubjectId,
    s.Name AS SubjectName,
    s.GradeName AS SubjectGradeName,
    u.FullName AS CreatedByFullName
  FROM ${EXAM_TABLE} e
  OUTER APPLY (
    SELECT TOP 1 *
    FROM ${EXAM_SUBJECT_TABLE}
    WHERE MongoExamId = e.MongoExamId
    ORDER BY SortOrder ASC, SqlExamSubjectId ASC
  ) es
  LEFT JOIN dbo.SqlSubjects s ON s.MongoSubjectId = es.MongoSubjectId
  LEFT JOIN dbo.SqlAuthUsers u ON u.MongoUserId = e.CreatedByMongoUserId
`;

const RESULT_SELECT = `
  SELECT
    r.MongoGradeId,
    r.MongoExamId,
    r.MongoStudentId,
    r.MongoSubjectId,
    r.MarksObtained,
    r.TotalMarks,
    r.GradeLetter,
    r.Remarks,
    r.EnteredByMongoUserId,
    r.ClassName,
    r.SectionName,
    r.CreatedAt,
    r.UpdatedAt,
    e.Name AS ExamName,
    e.ExamDate,
    e.PassingMarks,
    s.Name AS SubjectName,
    st.FullName AS StudentFullName,
    st.RollNumber AS StudentRollNumber,
    u.FullName AS EnteredByFullName,
    CAST(CASE WHEN ISNULL(r.TotalMarks, 0) = 0 THEN 0 ELSE (r.MarksObtained * 100.0) / r.TotalMarks END AS DECIMAL(10,2)) AS Percentage
  FROM ${EXAM_RESULT_TABLE} r
  LEFT JOIN ${EXAM_TABLE} e ON e.MongoExamId = r.MongoExamId
  LEFT JOIN dbo.SqlSubjects s ON s.MongoSubjectId = r.MongoSubjectId
  LEFT JOIN dbo.SqlStudents st ON st.MongoStudentId = r.MongoStudentId
  LEFT JOIN dbo.SqlAuthUsers u ON u.MongoUserId = r.EnteredByMongoUserId
`;
const EXAM_PROCEDURES_BATCH = `
CREATE OR ALTER PROCEDURE dbo.spExamUpsertMirror
  @MongoExamId NVARCHAR(64),
  @Name NVARCHAR(200),
  @ClassName NVARCHAR(100),
  @SectionName NVARCHAR(50),
  @ExamDate DATE,
  @StartTime NVARCHAR(10),
  @EndTime NVARCHAR(10),
  @DurationMinutes INT,
  @TotalMarks DECIMAL(10,2),
  @PassingMarks DECIMAL(10,2),
  @Instructions NVARCHAR(2000) = NULL,
  @CreatedByMongoUserId NVARCHAR(64) = NULL,
  @IsActive BIT,
  @CreatedAt DATETIME2(0),
  @UpdatedAt DATETIME2(0)
AS
BEGIN
  SET NOCOUNT ON;

  IF EXISTS (SELECT 1 FROM ${EXAM_TABLE} WHERE MongoExamId = @MongoExamId)
  BEGIN
    UPDATE ${EXAM_TABLE}
    SET Name = @Name,
        ClassName = @ClassName,
        SectionName = @SectionName,
        ExamDate = @ExamDate,
        StartTime = @StartTime,
        EndTime = @EndTime,
        DurationMinutes = @DurationMinutes,
        TotalMarks = @TotalMarks,
        PassingMarks = @PassingMarks,
        Instructions = @Instructions,
        CreatedByMongoUserId = @CreatedByMongoUserId,
        IsActive = @IsActive,
        UpdatedAt = @UpdatedAt
    WHERE MongoExamId = @MongoExamId;
  END
  ELSE
  BEGIN
    INSERT INTO ${EXAM_TABLE} (
      MongoExamId,
      Name,
      ClassName,
      SectionName,
      ExamDate,
      StartTime,
      EndTime,
      DurationMinutes,
      TotalMarks,
      PassingMarks,
      Instructions,
      CreatedByMongoUserId,
      IsActive,
      CreatedAt,
      UpdatedAt
    )
    VALUES (
      @MongoExamId,
      @Name,
      @ClassName,
      @SectionName,
      @ExamDate,
      @StartTime,
      @EndTime,
      @DurationMinutes,
      @TotalMarks,
      @PassingMarks,
      @Instructions,
      @CreatedByMongoUserId,
      @IsActive,
      @CreatedAt,
      @UpdatedAt
    );
  END;

  ${EXAM_SELECT}
  WHERE e.MongoExamId = @MongoExamId;
END;

CREATE OR ALTER PROCEDURE dbo.spExamSubjectReplace
  @MongoExamId NVARCHAR(64),
  @MongoSubjectId NVARCHAR(64),
  @SortOrder INT = 1,
  @TotalMarks DECIMAL(10,2),
  @PassingMarks DECIMAL(10,2)
AS
BEGIN
  SET NOCOUNT ON;

  DELETE FROM ${EXAM_SUBJECT_TABLE}
  WHERE MongoExamId = @MongoExamId;

  IF @MongoSubjectId IS NOT NULL
  BEGIN
    INSERT INTO ${EXAM_SUBJECT_TABLE} (
      MongoExamId,
      MongoSubjectId,
      SortOrder,
      TotalMarks,
      PassingMarks,
      CreatedAt,
      UpdatedAt
    )
    VALUES (
      @MongoExamId,
      @MongoSubjectId,
      @SortOrder,
      @TotalMarks,
      @PassingMarks,
      SYSUTCDATETIME(),
      SYSUTCDATETIME()
    );
  END;

  SELECT
    es.SqlExamSubjectId,
    es.MongoExamId,
    es.MongoSubjectId,
    es.SortOrder,
    es.TotalMarks,
    es.PassingMarks,
    s.Name AS SubjectName,
    s.GradeName AS SubjectGradeName
  FROM ${EXAM_SUBJECT_TABLE} es
  LEFT JOIN dbo.SqlSubjects s ON s.MongoSubjectId = es.MongoSubjectId
  WHERE es.MongoExamId = @MongoExamId
  ORDER BY es.SortOrder ASC, es.SqlExamSubjectId ASC;
END;

CREATE OR ALTER PROCEDURE dbo.spExamList
  @Page INT = 1,
  @Limit INT = 10,
  @ClassName NVARCHAR(100) = NULL,
  @MongoSubjectId NVARCHAR(64) = NULL,
  @ExamDate DATE = NULL
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @Offset INT = CASE WHEN ISNULL(@Page, 1) <= 1 THEN 0 ELSE (@Page - 1) * ISNULL(@Limit, 10) END;

  ;WITH Filtered AS (
    SELECT
      e.MongoExamId,
      e.Name,
      e.ClassName,
      e.SectionName,
      e.ExamDate,
      e.StartTime,
      e.EndTime,
      e.DurationMinutes,
      e.TotalMarks,
      e.PassingMarks,
      e.Instructions,
      e.CreatedByMongoUserId,
      e.IsActive,
      e.CreatedAt,
      e.UpdatedAt,
      es.MongoSubjectId,
      s.Name AS SubjectName,
      s.GradeName AS SubjectGradeName,
      u.FullName AS CreatedByFullName
    FROM ${EXAM_TABLE} e
    OUTER APPLY (
      SELECT TOP 1 *
      FROM ${EXAM_SUBJECT_TABLE}
      WHERE MongoExamId = e.MongoExamId
      ORDER BY SortOrder ASC, SqlExamSubjectId ASC
    ) es
    LEFT JOIN dbo.SqlSubjects s ON s.MongoSubjectId = es.MongoSubjectId
    LEFT JOIN dbo.SqlAuthUsers u ON u.MongoUserId = e.CreatedByMongoUserId
    WHERE e.IsActive = 1
      AND (@ClassName IS NULL OR e.ClassName = @ClassName)
      AND (@MongoSubjectId IS NULL OR es.MongoSubjectId = @MongoSubjectId)
      AND (@ExamDate IS NULL OR e.ExamDate = @ExamDate)
  )
  SELECT *, COUNT(1) OVER() AS TotalCount
  FROM Filtered
  ORDER BY ExamDate DESC, CreatedAt DESC
  OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
END;

CREATE OR ALTER PROCEDURE dbo.spExamGetById
  @MongoExamId NVARCHAR(64)
AS
BEGIN
  SET NOCOUNT ON;

  ${EXAM_SELECT}
  WHERE e.MongoExamId = @MongoExamId;

  SELECT
    es.SqlExamSubjectId,
    es.MongoExamId,
    es.MongoSubjectId,
    es.SortOrder,
    es.TotalMarks,
    es.PassingMarks,
    s.Name AS SubjectName,
    s.GradeName AS SubjectGradeName
  FROM ${EXAM_SUBJECT_TABLE} es
  LEFT JOIN dbo.SqlSubjects s ON s.MongoSubjectId = es.MongoSubjectId
  WHERE es.MongoExamId = @MongoExamId
  ORDER BY es.SortOrder ASC, es.SqlExamSubjectId ASC;

  SELECT
    results.*,
    ROW_NUMBER() OVER (ORDER BY results.MarksObtained DESC, results.CreatedAt ASC) AS ResultRank
  FROM (
    ${RESULT_SELECT}
    WHERE r.MongoExamId = @MongoExamId
  ) results
  ORDER BY results.MarksObtained DESC, results.CreatedAt ASC;
END;

CREATE OR ALTER PROCEDURE dbo.spExamCreate
  @MongoExamId NVARCHAR(64),
  @Name NVARCHAR(200),
  @ClassName NVARCHAR(100),
  @SectionName NVARCHAR(50),
  @ExamDate DATE,
  @StartTime NVARCHAR(10),
  @EndTime NVARCHAR(10),
  @DurationMinutes INT,
  @TotalMarks DECIMAL(10,2),
  @PassingMarks DECIMAL(10,2),
  @Instructions NVARCHAR(2000) = NULL,
  @CreatedByMongoUserId NVARCHAR(64) = NULL,
  @IsActive BIT,
  @CreatedAt DATETIME2(0),
  @UpdatedAt DATETIME2(0)
AS
BEGIN
  SET NOCOUNT ON;

  INSERT INTO ${EXAM_TABLE} (
    MongoExamId,
    Name,
    ClassName,
    SectionName,
    ExamDate,
    StartTime,
    EndTime,
    DurationMinutes,
    TotalMarks,
    PassingMarks,
    Instructions,
    CreatedByMongoUserId,
    IsActive,
    CreatedAt,
    UpdatedAt
  )
  VALUES (
    @MongoExamId,
    @Name,
    @ClassName,
    @SectionName,
    @ExamDate,
    @StartTime,
    @EndTime,
    @DurationMinutes,
    @TotalMarks,
    @PassingMarks,
    @Instructions,
    @CreatedByMongoUserId,
    @IsActive,
    @CreatedAt,
    @UpdatedAt
  );

  ${EXAM_SELECT}
  WHERE e.MongoExamId = @MongoExamId;
END;

CREATE OR ALTER PROCEDURE dbo.spExamUpdate
  @MongoExamId NVARCHAR(64),
  @Name NVARCHAR(200),
  @ClassName NVARCHAR(100),
  @SectionName NVARCHAR(50),
  @ExamDate DATE,
  @StartTime NVARCHAR(10),
  @EndTime NVARCHAR(10),
  @DurationMinutes INT,
  @TotalMarks DECIMAL(10,2),
  @PassingMarks DECIMAL(10,2),
  @Instructions NVARCHAR(2000) = NULL,
  @CreatedByMongoUserId NVARCHAR(64) = NULL,
  @IsActive BIT,
  @UpdatedAt DATETIME2(0)
AS
BEGIN
  SET NOCOUNT ON;

  UPDATE ${EXAM_TABLE}
  SET Name = @Name,
      ClassName = @ClassName,
      SectionName = @SectionName,
      ExamDate = @ExamDate,
      StartTime = @StartTime,
      EndTime = @EndTime,
      DurationMinutes = @DurationMinutes,
      TotalMarks = @TotalMarks,
      PassingMarks = @PassingMarks,
      Instructions = @Instructions,
      CreatedByMongoUserId = @CreatedByMongoUserId,
      IsActive = @IsActive,
      UpdatedAt = @UpdatedAt
  WHERE MongoExamId = @MongoExamId;

  ${EXAM_SELECT}
  WHERE e.MongoExamId = @MongoExamId;
END;

CREATE OR ALTER PROCEDURE dbo.spExamDelete
  @MongoExamId NVARCHAR(64)
AS
BEGIN
  SET NOCOUNT ON;

  IF NOT EXISTS (SELECT 1 FROM ${EXAM_TABLE} WHERE MongoExamId = @MongoExamId)
  BEGIN
    SELECT N'not_found' AS ResultCode;
    RETURN;
  END;

  DELETE FROM ${EXAM_RESULT_TABLE} WHERE MongoExamId = @MongoExamId;
  DELETE FROM ${EXAM_SUBJECT_TABLE} WHERE MongoExamId = @MongoExamId;
  DELETE FROM ${EXAM_TABLE} WHERE MongoExamId = @MongoExamId;

  SELECT N'ok' AS ResultCode;
END;

CREATE OR ALTER PROCEDURE dbo.spExamResultGetExisting
  @MongoExamId NVARCHAR(64),
  @MongoStudentId NVARCHAR(64),
  @MongoSubjectId NVARCHAR(64)
AS
BEGIN
  SET NOCOUNT ON;
  ${RESULT_SELECT}
  WHERE r.MongoExamId = @MongoExamId
    AND r.MongoStudentId = @MongoStudentId
    AND r.MongoSubjectId = @MongoSubjectId;
END;

CREATE OR ALTER PROCEDURE dbo.spExamResultUpsert
  @MongoGradeId NVARCHAR(64),
  @MongoExamId NVARCHAR(64),
  @MongoStudentId NVARCHAR(64),
  @MongoSubjectId NVARCHAR(64),
  @MarksObtained DECIMAL(10,2),
  @TotalMarks DECIMAL(10,2),
  @GradeLetter NVARCHAR(10),
  @Remarks NVARCHAR(1000) = NULL,
  @EnteredByMongoUserId NVARCHAR(64) = NULL,
  @ClassName NVARCHAR(100),
  @SectionName NVARCHAR(50),
  @CreatedAt DATETIME2(0),
  @UpdatedAt DATETIME2(0)
AS
BEGIN
  SET NOCOUNT ON;

  IF EXISTS (SELECT 1 FROM ${EXAM_RESULT_TABLE} WHERE MongoGradeId = @MongoGradeId)
  BEGIN
    UPDATE ${EXAM_RESULT_TABLE}
    SET MongoExamId = @MongoExamId,
        MongoStudentId = @MongoStudentId,
        MongoSubjectId = @MongoSubjectId,
        MarksObtained = @MarksObtained,
        TotalMarks = @TotalMarks,
        GradeLetter = @GradeLetter,
        Remarks = @Remarks,
        EnteredByMongoUserId = @EnteredByMongoUserId,
        ClassName = @ClassName,
        SectionName = @SectionName,
        UpdatedAt = @UpdatedAt
    WHERE MongoGradeId = @MongoGradeId;
  END
  ELSE IF EXISTS (
    SELECT 1
    FROM ${EXAM_RESULT_TABLE}
    WHERE MongoExamId = @MongoExamId
      AND MongoStudentId = @MongoStudentId
      AND MongoSubjectId = @MongoSubjectId
  )
  BEGIN
    UPDATE ${EXAM_RESULT_TABLE}
    SET MongoGradeId = @MongoGradeId,
        MarksObtained = @MarksObtained,
        TotalMarks = @TotalMarks,
        GradeLetter = @GradeLetter,
        Remarks = @Remarks,
        EnteredByMongoUserId = @EnteredByMongoUserId,
        ClassName = @ClassName,
        SectionName = @SectionName,
        UpdatedAt = @UpdatedAt
    WHERE MongoExamId = @MongoExamId
      AND MongoStudentId = @MongoStudentId
      AND MongoSubjectId = @MongoSubjectId;
  END
  ELSE
  BEGIN
    INSERT INTO ${EXAM_RESULT_TABLE} (
      MongoGradeId,
      MongoExamId,
      MongoStudentId,
      MongoSubjectId,
      MarksObtained,
      TotalMarks,
      GradeLetter,
      Remarks,
      EnteredByMongoUserId,
      ClassName,
      SectionName,
      CreatedAt,
      UpdatedAt
    )
    VALUES (
      @MongoGradeId,
      @MongoExamId,
      @MongoStudentId,
      @MongoSubjectId,
      @MarksObtained,
      @TotalMarks,
      @GradeLetter,
      @Remarks,
      @EnteredByMongoUserId,
      @ClassName,
      @SectionName,
      @CreatedAt,
      @UpdatedAt
    );
  END;

  ${RESULT_SELECT}
  WHERE r.MongoGradeId = @MongoGradeId;
END;

CREATE OR ALTER PROCEDURE dbo.spExamStudentResults
  @MongoStudentId NVARCHAR(64),
  @MongoExamId NVARCHAR(64) = NULL,
  @ClassName NVARCHAR(100) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  ${RESULT_SELECT}
  WHERE r.MongoStudentId = @MongoStudentId
    AND (@MongoExamId IS NULL OR r.MongoExamId = @MongoExamId)
    AND (@ClassName IS NULL OR r.ClassName = @ClassName)
  ORDER BY r.CreatedAt DESC, r.UpdatedAt DESC;
END;

CREATE OR ALTER PROCEDURE dbo.spExamReport
  @MongoExamId NVARCHAR(64)
AS
BEGIN
  SET NOCOUNT ON;

  ${EXAM_SELECT}
  WHERE e.MongoExamId = @MongoExamId;

  SELECT
    results.*,
    ROW_NUMBER() OVER (ORDER BY results.MarksObtained DESC, results.CreatedAt ASC) AS ResultRank
  FROM (
    ${RESULT_SELECT}
    WHERE r.MongoExamId = @MongoExamId
  ) results
  ORDER BY results.MarksObtained DESC, results.CreatedAt ASC;
END;
`;

const EXAM_PROCEDURE_BATCHES = EXAM_PROCEDURES_BATCH
  .split(/\n(?=CREATE OR ALTER PROCEDURE )/g)
  .map((statement) => statement.trim())
  .filter(Boolean);
const ensureExamSqlReady = async () => {
  if (!examBootstrapPromise) {
    examBootstrapPromise = (async () => {
      await ensureAuthSqlReady();
      await ensureStudentSqlReady();
      await ensureAcademicSqlReady();
      const pool = await getPool();
      await pool.request().batch(EXAM_SCHEMA_BATCH);
      for (const batch of EXAM_PROCEDURE_BATCHES) {
        await pool.request().batch(batch);
      }
      return true;
    })().catch((error) => {
      examBootstrapPromise = null;
      throw error;
    });
  }

  return examBootstrapPromise;
};

const runStoredProcedure = async (procedureName, params, tx = null) => {
  if (tx?.executeStoredProcedure) {
    return tx.executeStoredProcedure(procedureName, params);
  }
  return executeStoredProcedure(procedureName, params);
};

const toSqlExamPayload = (examDocument, overrides = {}) => {
  const exam = examDocument?.toObject ? examDocument.toObject() : examDocument;
  const subjectId = typeof (overrides.subject ?? exam?.subject) === 'object'
    ? (overrides.subject ?? exam?.subject)?._id
    : (overrides.subject ?? exam?.subject);
  const timing = deriveExamTimes({
    startTime: overrides.startTime ?? exam?.startTime,
    endTime: overrides.endTime ?? exam?.endTime,
    duration: overrides.durationMinutes ?? overrides.duration ?? exam?.duration,
  });
  const totalMarks = toNumber(overrides.totalMarks ?? exam?.totalMarks, 100);
  const passingMarks = toNumber(overrides.passingMarks ?? exam?.passingMarks, Math.round(totalMarks * 0.4));

  return {
    mongoExamId: String(overrides.mongoExamId ?? exam?._id ?? new mongoose.Types.ObjectId()),
    name: toNullableString(overrides.name ?? overrides.title ?? exam?.name ?? exam?.title),
    mongoSubjectId: subjectId ? String(subjectId) : null,
    className: toNullableString(overrides.className ?? overrides.class ?? overrides.grade ?? exam?.class ?? exam?.grade),
    sectionName: toNullableString(overrides.section ?? exam?.section) || '',
    examDate: normalizeDateOnly(overrides.examDate ?? overrides.date ?? exam?.examDate ?? exam?.date),
    startTime: timing.startTime,
    endTime: timing.endTime,
    durationMinutes: timing.durationMinutes,
    totalMarks,
    passingMarks,
    instructions: toNullableString(overrides.instructions ?? exam?.instructions),
    createdByMongoUserId: overrides.createdByMongoUserId
      ? String(overrides.createdByMongoUserId)
      : exam?.createdBy
      ? String(exam.createdBy)
      : null,
    isActive: overrides.isActive ?? exam?.isActive ?? true,
    createdAt: normalizeDateTime(overrides.createdAt ?? exam?.createdAt) || new Date(),
    updatedAt: normalizeDateTime(overrides.updatedAt ?? exam?.updatedAt) || new Date(),
  };
};

const toSqlResultPayload = (gradeDocument, overrides = {}) => {
  const grade = gradeDocument?.toObject ? gradeDocument.toObject() : gradeDocument;
  const marksObtained = toNumber(overrides.marksObtained ?? overrides.marks ?? grade?.marksObtained ?? grade?.marks, 0);
  const totalMarks = toNumber(overrides.totalMarks ?? grade?.totalMarks, 100);

  return {
    mongoGradeId: String(overrides.mongoGradeId ?? grade?._id ?? new mongoose.Types.ObjectId()),
    mongoExamId: String(overrides.mongoExamId ?? grade?.examId ?? ''),
    mongoStudentId: String(overrides.mongoStudentId ?? grade?.studentId ?? ''),
    mongoSubjectId: String(overrides.mongoSubjectId ?? grade?.subjectId ?? ''),
    marksObtained,
    totalMarks,
    gradeLetter: toNullableString(overrides.gradeLetter ?? overrides.grade ?? grade?.grade) || calculateGradeLetter(marksObtained, totalMarks),
    remarks: toNullableString(overrides.remarks ?? grade?.remarks),
    enteredByMongoUserId: overrides.enteredByMongoUserId
      ? String(overrides.enteredByMongoUserId)
      : grade?.enteredBy
      ? String(grade.enteredBy)
      : null,
    className: toNullableString(overrides.className ?? overrides.class ?? grade?.class),
    sectionName: toNullableString(overrides.sectionName ?? overrides.section ?? grade?.section) || '',
    createdAt: normalizeDateTime(overrides.createdAt ?? grade?.createdAt) || new Date(),
    updatedAt: normalizeDateTime(overrides.updatedAt ?? grade?.updatedAt) || new Date(),
  };
};

const syncMongoExamSnapshot = async (examRecord) => {
  return examRecord || null;
};

const syncMongoGradeSnapshot = async (gradeRecord) => {
  return gradeRecord || null;
};

const syncMongoGradeSnapshots = async (gradeRecords = []) => {
  return gradeRecords;
};

const syncExamMirror = async (examDocument) => {
  if (!examDocument) {
    return null;
  }

  await ensureExamSqlReady();
  const payload = toSqlExamPayload(examDocument);

  if (payload.mongoSubjectId) {
    await syncSubjectById(payload.mongoSubjectId);
  }

  const result = await executeInTransaction(async (tx) => {
    const examResult = await tx.executeStoredProcedure('dbo.spExamUpsertMirror', buildExamParams(payload));
    await tx.executeStoredProcedure('dbo.spExamSubjectReplace', buildExamSubjectParams({
      mongoExamId: payload.mongoExamId,
      mongoSubjectId: payload.mongoSubjectId,
      totalMarks: payload.totalMarks,
      passingMarks: payload.passingMarks,
    }));
    return examResult;
  });

  return mapExamRow(result?.recordset?.[0]);
};

const syncExamResultMirror = async (gradeDocument) => {
  if (!gradeDocument) {
    return null;
  }

  await ensureExamSqlReady();
  const payload = toSqlResultPayload(gradeDocument);
  if (!payload.mongoExamId || !payload.mongoStudentId || !payload.mongoSubjectId) {
    return null;
  }

  await executeStoredProcedure('dbo.spExamResultUpsert', buildResultParams(payload));
  const result = await executeStoredProcedure('dbo.spExamResultGetExisting', [
    { name: 'MongoExamId', type: getSqlClient().NVarChar(64), value: payload.mongoExamId },
    { name: 'MongoStudentId', type: getSqlClient().NVarChar(64), value: payload.mongoStudentId },
    { name: 'MongoSubjectId', type: getSqlClient().NVarChar(64), value: payload.mongoSubjectId },
  ]);

  return mapResultRow(result?.recordset?.[0]);
};

const syncAllExamsToSql = async ({ force = false } = {}) => {
  await ensureExamSqlReady();
  return null;
};
const getExamList = async ({ className = null, subjectId = null, date = null, page = 1, limit = 10 } = {}) => {
  await ensureExamSqlReady();
  await syncAllExamsToSql();

  const sql = getSqlClient();
  const safePage = Number(page) || 1;
  const safeLimit = Number(limit) || 10;
  const offset = Math.max(safePage - 1, 0) * safeLimit;
  const filter = buildExamListFilters({ className, subjectId, date });
  const result = await executeQuery(`
    WITH RankedExams AS (
      SELECT
        e.ExamId,
        e.ExamName,
        e.StartDate,
        e.EndDate,
        e.Description,
        e.CreatedAt,
        e.UpdatedAt,
        c.ClassName,
        sec.SectionName,
        es.ExamSubjectId,
        es.SubjectId,
        s.SubjectName,
        es.MaxMarks,
        es.PassMarks,
        es.ExamDate,
        es.StartTime,
        es.EndTime,
        ROW_NUMBER() OVER (PARTITION BY e.ExamId ORDER BY es.ExamSubjectId) AS SubjectRowNumber
      FROM dbo.Exams e
      INNER JOIN dbo.Classes c
        ON c.ClassId = e.ClassId
      LEFT JOIN dbo.Sections sec
        ON sec.SectionId = e.SectionId
      LEFT JOIN dbo.ExamSubjects es
        ON es.ExamId = e.ExamId
      LEFT JOIN dbo.Subjects s
        ON s.SubjectId = es.SubjectId
      ${filter.whereClause}
    )
    SELECT *,
           COUNT(1) OVER() AS TotalCount
    FROM RankedExams
    WHERE SubjectRowNumber = 1
    ORDER BY COALESCE(ExamDate, StartDate) DESC, ExamId DESC
    OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
  `, [
    ...filter.params,
    { name: 'Offset', type: sql.Int, value: offset },
    { name: 'Limit', type: sql.Int, value: safeLimit },
  ]);

  const rows = result?.recordset || [];
  const total = rows.length ? Number(rows[0].TotalCount || 0) : 0;

  return {
    exams: rows.map(mapExamRow),
    total,
    page: Number(page) || 1,
    limit: Number(limit) || 10,
  };
};

const getExamRecordById = async (examId) => {
  await ensureExamSqlReady();
  await syncAllExamsToSql();
  const examSqlId = parseNumericId(examId);
  if (!examSqlId) {
    return { exam: null, grades: [], examSubjects: [] };
  }

  const sql = getSqlClient();
  const examResult = await executeQuery(`
    SELECT
      e.ExamId,
      e.ExamName,
      e.StartDate,
      e.EndDate,
      e.Description,
      e.CreatedAt,
      e.UpdatedAt,
      c.ClassName,
      sec.SectionName,
      es.ExamSubjectId,
      es.SubjectId,
      s.SubjectName,
      es.MaxMarks,
      es.PassMarks,
      es.ExamDate,
      es.StartTime,
      es.EndTime
    FROM dbo.Exams e
    INNER JOIN dbo.Classes c
      ON c.ClassId = e.ClassId
    LEFT JOIN dbo.Sections sec
      ON sec.SectionId = e.SectionId
    LEFT JOIN dbo.ExamSubjects es
      ON es.ExamId = e.ExamId
    LEFT JOIN dbo.Subjects s
      ON s.SubjectId = es.SubjectId
    WHERE e.ExamId = @ExamId
    ORDER BY es.ExamSubjectId;
  `, [
    { name: 'ExamId', type: sql.Int, value: examSqlId },
  ]);
  const examRows = examResult?.recordset || [];
  const exam = mapExamRow(examRows[0]);
  const examSubjects = examRows.map(mapExamSubjectRow).filter(Boolean);
  const gradeResult = await executeQuery(`
    SELECT
      er.ExamResultId,
      er.StudentId,
      st.FullName AS StudentFullName,
      st.RollNumber AS StudentRollNumber,
      e.ExamId,
      e.ExamName,
      es.ExamDate,
      es.SubjectId,
      sub.SubjectName,
      er.MarksObtained,
      es.MaxMarks,
      es.PassMarks,
      er.Grade,
      er.Remarks,
      c.ClassName,
      sec.SectionName,
      er.CreatedAt,
      er.UpdatedAt
    FROM dbo.ExamResults er
    INNER JOIN dbo.ExamSubjects es
      ON es.ExamSubjectId = er.ExamSubjectId
    INNER JOIN dbo.Exams e
      ON e.ExamId = es.ExamId
    INNER JOIN dbo.Students st
      ON st.StudentId = er.StudentId
    INNER JOIN dbo.Classes c
      ON c.ClassId = e.ClassId
    LEFT JOIN dbo.Sections sec
      ON sec.SectionId = e.SectionId
    LEFT JOIN dbo.Subjects sub
      ON sub.SubjectId = es.SubjectId
    WHERE e.ExamId = @ExamId
    ORDER BY er.MarksObtained DESC, st.FullName;
  `, [
    { name: 'ExamId', type: sql.Int, value: examSqlId },
  ]);
  const grades = (gradeResult?.recordset || []).map(mapResultRow);

  if (exam) {
    exam.subjects = examSubjects;
    if (!exam.subject && examSubjects[0]) {
      exam.subject = {
        _id: examSubjects[0]._id,
        name: examSubjects[0].name,
      };
      exam.subjectId = examSubjects[0]._id;
    }
  }

  return { exam, grades, examSubjects };
};

const loadOnlineExamPaperContext = async ({ examId, studentId = null, includeAnswerKey = false } = {}) => {
  await ensureExamSqlReady();
  const examBundle = await getExamRecordById(examId);
  if (!examBundle?.exam) {
    return { errorCode: 'exam_not_found' };
  }

  const exam = examBundle.exam;
  const examSubject = examBundle.examSubjects?.[0] || null;
  const examSubjectId = parseNumericId(examSubject?.examSubjectId || examSubject?._id);

  if (!examSubjectId) {
    return { errorCode: 'exam_subject_not_found' };
  }

  const sql = getSqlClient();
  const paperResult = await executeQuery(`
    SELECT
      p.OnlineExamPaperId,
      p.ExamId,
      p.ExamSubjectId,
      p.Title,
      p.Instructions,
      p.DurationMinutes,
      p.TotalMarks,
      p.AllowInstantResult,
      p.IsActive,
      p.CreatedAt,
      p.UpdatedAt,
      COUNT(q.QuestionId) AS QuestionCount
    FROM ${ONLINE_EXAM_PAPER_TABLE} p
    LEFT JOIN ${ONLINE_EXAM_QUESTION_TABLE} q
      ON q.OnlineExamPaperId = p.OnlineExamPaperId
      AND q.IsActive = 1
    WHERE p.ExamId = @ExamId
      AND p.ExamSubjectId = @ExamSubjectId
      AND p.IsActive = 1
    GROUP BY
      p.OnlineExamPaperId,
      p.ExamId,
      p.ExamSubjectId,
      p.Title,
      p.Instructions,
      p.DurationMinutes,
      p.TotalMarks,
      p.AllowInstantResult,
      p.IsActive,
      p.CreatedAt,
      p.UpdatedAt;
  `, [
    { name: 'ExamId', type: sql.Int, value: parseNumericId(exam.id || examId) },
    { name: 'ExamSubjectId', type: sql.Int, value: examSubjectId },
  ]);

  const paper = mapOnlineExamPaperRow(paperResult?.recordset?.[0] || null);
  if (!paper) {
    return {
      examBundle,
      exam,
      examSubject,
      paper: null,
      questions: [],
      attempt: null,
      attemptAnswers: [],
    };
  }

  const questionResult = await executeQuery(`
    SELECT
      QuestionId,
      OnlineExamPaperId,
      QuestionType,
      QuestionText,
      OptionA,
      OptionB,
      OptionC,
      OptionD,
      CorrectAnswer,
      Marks,
      SortOrder
    FROM ${ONLINE_EXAM_QUESTION_TABLE}
    WHERE OnlineExamPaperId = @OnlineExamPaperId
      AND IsActive = 1
    ORDER BY SortOrder ASC, QuestionId ASC;
  `, [
    { name: 'OnlineExamPaperId', type: sql.Int, value: parseNumericId(paper.paperId) },
  ]);

  let attempt = null;
  let attemptAnswers = [];

  if (parseNumericId(studentId)) {
    const attemptResult = await executeQuery(`
      SELECT TOP 1
        OnlineExamAttemptId,
        OnlineExamPaperId,
        ExamId,
        ExamSubjectId,
        StudentId,
        Status,
        StartedAt,
        SubmittedAt,
        CorrectAnswers,
        IncorrectAnswers,
        MarksObtained,
        TotalMarks,
        Percentage,
        Grade
      FROM ${ONLINE_EXAM_ATTEMPT_TABLE}
      WHERE OnlineExamPaperId = @OnlineExamPaperId
        AND StudentId = @StudentId
      ORDER BY OnlineExamAttemptId DESC;
    `, [
      { name: 'OnlineExamPaperId', type: sql.Int, value: parseNumericId(paper.paperId) },
      { name: 'StudentId', type: sql.Int, value: parseNumericId(studentId) },
    ]);

    attempt = mapOnlineExamAttemptRow(attemptResult?.recordset?.[0] || null);

    if (attempt?.attemptId) {
      const answerResult = await executeQuery(`
        SELECT
          OnlineExamAttemptAnswerId,
          OnlineExamAttemptId,
          QuestionId,
          StudentAnswer,
          CorrectAnswerSnapshot,
          IsCorrect,
          MarksAwarded
        FROM ${ONLINE_EXAM_ATTEMPT_ANSWER_TABLE}
        WHERE OnlineExamAttemptId = @OnlineExamAttemptId
        ORDER BY QuestionId ASC;
      `, [
        { name: 'OnlineExamAttemptId', type: sql.Int, value: parseNumericId(attempt.attemptId) },
      ]);

      attemptAnswers = answerResult?.recordset || [];
    }
  }

  return {
    examBundle,
    exam,
    examSubject,
    paper,
    questions: (questionResult?.recordset || []).map((row) => mapOnlineExamQuestionRow(row, { includeAnswerKey })),
    attempt,
    attemptAnswers,
  };
};

const buildOnlineAttemptBreakdown = ({ questions = [], answerRows = [] } = {}) => {
  const answerMap = new Map(
    (answerRows || []).map((row) => [String(row.QuestionId), row])
  );

  return questions.map((question) => {
    const answer = answerMap.get(String(question.questionId)) || null;
    return {
      questionId: question.questionId,
      questionText: question.questionText,
      questionType: question.questionType,
      options: question.options || [],
      studentAnswer: answer?.StudentAnswer || '',
      correctAnswer: answer?.CorrectAnswerSnapshot || question.correctAnswer || '',
      isCorrect: answer ? (answer.IsCorrect === true || answer.IsCorrect === 1) : false,
      marks: toNumber(question.marks, 0),
      marksAwarded: toNumber(answer?.MarksAwarded, 0),
    };
  });
};

const saveOnlineExamPaper = async ({ examId, title = null, instructions = null, durationMinutes = null, allowInstantResult = true, questions = [], updatedByUserId = null } = {}) => {
  await ensureExamSqlReady();
  const context = await loadOnlineExamPaperContext({ examId, includeAnswerKey: true });
  if (context?.errorCode) {
    return context;
  }

  const normalizedQuestions = normalizeOnlineExamQuestions(questions);
  if (!normalizedQuestions.length) {
    return { errorCode: 'invalid_questions' };
  }

  const paperTitle = toNullableString(title) || context.exam?.name || 'Online Test';
  const paperInstructions = toNullableString(instructions ?? context.exam?.instructions);
  const totalMarks = Number(
    normalizedQuestions.reduce((sum, question) => sum + toNumber(question.marks, 0), 0).toFixed(2)
  );
  const resolvedDuration = Math.max(
    1,
    Math.round(toNumber(durationMinutes ?? context.examSubject?.duration ?? context.exam?.duration, DEFAULT_DURATION_MINUTES))
  );
  const resolvedPassingMarks = Number((Math.max(totalMarks, 0) * 0.4).toFixed(2));
  const paperId = parseNumericId(context.paper?.paperId);
  const examSqlId = parseNumericId(context.exam?.id || examId);
  const examSubjectId = parseNumericId(context.examSubject?.examSubjectId || context.examSubject?._id);
  const sql = getSqlClient();

  try {
    await executeInTransaction(async (tx) => {
      let activePaperId = paperId;

      if (activePaperId) {
        const attemptCountResult = await tx.query(
          `SELECT COUNT(1) AS AttemptCount
           FROM ${ONLINE_EXAM_ATTEMPT_TABLE}
           WHERE OnlineExamPaperId = @OnlineExamPaperId`,
          [{ name: 'OnlineExamPaperId', type: sql.Int, value: activePaperId }]
        );
        const attemptCount = Number(attemptCountResult?.recordset?.[0]?.AttemptCount || 0);
        if (attemptCount > 0) {
          const lockedError = new Error('Online exam paper is already in use.');
          lockedError.code = 'paper_locked';
          throw lockedError;
        }

        await tx.query(
          `UPDATE ${ONLINE_EXAM_PAPER_TABLE}
           SET Title = @Title,
               Instructions = @Instructions,
               DurationMinutes = @DurationMinutes,
               TotalMarks = @TotalMarks,
               AllowInstantResult = @AllowInstantResult,
               CreatedByUserId = @CreatedByUserId,
               UpdatedAt = SYSUTCDATETIME()
           WHERE OnlineExamPaperId = @OnlineExamPaperId`,
          [
            { name: 'OnlineExamPaperId', type: sql.Int, value: activePaperId },
            { name: 'Title', type: sql.NVarChar(200), value: paperTitle },
            { name: 'Instructions', type: sql.NVarChar(2000), value: paperInstructions },
            { name: 'DurationMinutes', type: sql.Int, value: resolvedDuration },
            { name: 'TotalMarks', type: sql.Decimal(10, 2), value: totalMarks },
            { name: 'AllowInstantResult', type: sql.Bit, value: allowInstantResult !== false },
            { name: 'CreatedByUserId', type: sql.Int, value: parseNumericId(updatedByUserId) },
          ]
        );

        await tx.query(
          `DELETE FROM ${ONLINE_EXAM_QUESTION_TABLE}
           WHERE OnlineExamPaperId = @OnlineExamPaperId`,
          [{ name: 'OnlineExamPaperId', type: sql.Int, value: activePaperId }]
        );
      } else {
        const insertedPaper = await tx.query(
          `INSERT INTO ${ONLINE_EXAM_PAPER_TABLE} (
             ExamId,
             ExamSubjectId,
             Title,
             Instructions,
             DurationMinutes,
             TotalMarks,
             AllowInstantResult,
             CreatedByUserId,
             CreatedAt,
             UpdatedAt
           )
           OUTPUT INSERTED.OnlineExamPaperId
           VALUES (
             @ExamId,
             @ExamSubjectId,
             @Title,
             @Instructions,
             @DurationMinutes,
             @TotalMarks,
             @AllowInstantResult,
             @CreatedByUserId,
             SYSUTCDATETIME(),
             SYSUTCDATETIME()
           )`,
          [
            { name: 'ExamId', type: sql.Int, value: examSqlId },
            { name: 'ExamSubjectId', type: sql.Int, value: examSubjectId },
            { name: 'Title', type: sql.NVarChar(200), value: paperTitle },
            { name: 'Instructions', type: sql.NVarChar(2000), value: paperInstructions },
            { name: 'DurationMinutes', type: sql.Int, value: resolvedDuration },
            { name: 'TotalMarks', type: sql.Decimal(10, 2), value: totalMarks },
            { name: 'AllowInstantResult', type: sql.Bit, value: allowInstantResult !== false },
            { name: 'CreatedByUserId', type: sql.Int, value: parseNumericId(updatedByUserId) },
          ]
        );

        activePaperId = parseNumericId(insertedPaper?.recordset?.[0]?.OnlineExamPaperId);
      }

      for (const question of normalizedQuestions) {
        await tx.query(
          `INSERT INTO ${ONLINE_EXAM_QUESTION_TABLE} (
             OnlineExamPaperId,
             QuestionType,
             QuestionText,
             OptionA,
             OptionB,
             OptionC,
             OptionD,
             CorrectAnswer,
             Marks,
             SortOrder,
             CreatedAt,
             UpdatedAt
           )
           VALUES (
             @OnlineExamPaperId,
             @QuestionType,
             @QuestionText,
             @OptionA,
             @OptionB,
             @OptionC,
             @OptionD,
             @CorrectAnswer,
             @Marks,
             @SortOrder,
             SYSUTCDATETIME(),
             SYSUTCDATETIME()
           )`,
          [
            { name: 'OnlineExamPaperId', type: sql.Int, value: activePaperId },
            { name: 'QuestionType', type: sql.NVarChar(20), value: question.questionType },
            { name: 'QuestionText', type: sql.NVarChar(sql.MAX), value: question.questionText },
            { name: 'OptionA', type: sql.NVarChar(1000), value: question.options.find((entry) => entry.key === 'A')?.text || null },
            { name: 'OptionB', type: sql.NVarChar(1000), value: question.options.find((entry) => entry.key === 'B')?.text || null },
            { name: 'OptionC', type: sql.NVarChar(1000), value: question.options.find((entry) => entry.key === 'C')?.text || null },
            { name: 'OptionD', type: sql.NVarChar(1000), value: question.options.find((entry) => entry.key === 'D')?.text || null },
            { name: 'CorrectAnswer', type: sql.NVarChar(1000), value: question.correctAnswer },
            { name: 'Marks', type: sql.Decimal(10, 2), value: question.marks },
            { name: 'SortOrder', type: sql.Int, value: question.sortOrder },
          ]
        );
      }

      await tx.query(
        `UPDATE dbo.ExamSubjects
         SET MaxMarks = @TotalMarks,
             PassMarks = @PassingMarks
         WHERE ExamSubjectId = @ExamSubjectId`,
        [
          { name: 'ExamSubjectId', type: sql.Int, value: examSubjectId },
          { name: 'TotalMarks', type: sql.Decimal(10, 2), value: totalMarks },
          { name: 'PassingMarks', type: sql.Decimal(10, 2), value: resolvedPassingMarks },
        ]
      );

      await tx.query(
        `UPDATE dbo.Exams
         SET Description = @Description,
             UpdatedAt = SYSUTCDATETIME()
         WHERE ExamId = @ExamId`,
        [
          { name: 'ExamId', type: sql.Int, value: examSqlId },
          { name: 'Description', type: sql.NVarChar(2000), value: paperInstructions },
        ]
      );
    });
  } catch (error) {
    if (error?.code === 'paper_locked') {
      return { errorCode: 'paper_locked' };
    }
    throw error;
  }

  return loadOnlineExamPaperContext({ examId, includeAnswerKey: true });
};

const evaluateOnlineExamQuestion = (question, submittedAnswer) => {
  const safeAnswer = String(submittedAnswer || '').trim();
  const questionType = normalizeQuestionType(question?.questionType);

  if (questionType === 'mcq') {
    const expectedOptionKey = normalizeOptionKey(question?.correctAnswer);
    const submittedOptionKey = normalizeOptionKey(safeAnswer);
    const expectedOptionText = question?.options?.find((option) => option.key === expectedOptionKey)?.text || '';
    const matched = (submittedOptionKey && expectedOptionKey && submittedOptionKey === expectedOptionKey)
      || (normalizeAnswerText(safeAnswer) && normalizeAnswerText(safeAnswer) === normalizeAnswerText(expectedOptionText));

    return {
      isCorrect: Boolean(matched),
      normalizedAnswer: submittedOptionKey || normalizeAnswerText(safeAnswer),
      correctAnswerSnapshot: expectedOptionKey || question?.correctAnswer || '',
      displayCorrectAnswer: expectedOptionText || expectedOptionKey || question?.correctAnswer || '',
    };
  }

  const matched = normalizeAnswerText(safeAnswer) === normalizeAnswerText(question?.correctAnswer);
  return {
    isCorrect: matched,
    normalizedAnswer: normalizeAnswerText(safeAnswer),
    correctAnswerSnapshot: question?.correctAnswer || '',
    displayCorrectAnswer: question?.correctAnswer || '',
  };
};

const startStudentOnlineExam = async ({ examId, studentId }) => {
  await ensureExamSqlReady();
  const context = await loadOnlineExamPaperContext({ examId, studentId, includeAnswerKey: true });
  if (context?.errorCode) {
    return context;
  }

  if (!context.paper || !context.questions.length) {
    return { errorCode: 'paper_not_ready' };
  }

  const student = await getStudentById(studentId);
  if (!student) {
    return { errorCode: 'student_not_found' };
  }

  const examSection = String(context.exam?.section || '').trim();
  if (String(student.class || '').trim() !== String(context.exam?.class || '').trim()
      || (examSection && examSection !== String(student.section || '').trim())) {
    return { errorCode: 'forbidden' };
  }

  const windowStatus = getExamWindowStatus({
    examDate: context.examSubject?.date || context.exam?.date,
    startTime: context.examSubject?.startTime || context.exam?.startTime,
    endTime: context.examSubject?.endTime || context.exam?.endTime,
  });

  if (windowStatus === 'upcoming') {
    return { errorCode: 'not_started' };
  }

  if (windowStatus === 'closed' && context.attempt?.status !== 'Submitted') {
    return { errorCode: 'expired' };
  }

  if (context.attempt?.status === 'Submitted') {
    return {
      resultCode: 'already_submitted',
      exam: context.exam,
      paper: context.paper,
      attempt: context.attempt,
      breakdown: buildOnlineAttemptBreakdown({
        questions: context.questions,
        answerRows: context.attemptAnswers,
      }),
    };
  }

  const sql = getSqlClient();
  let attemptId = parseNumericId(context.attempt?.attemptId);

  if (!attemptId) {
    const insertedAttempt = await executeQuery(
      `INSERT INTO ${ONLINE_EXAM_ATTEMPT_TABLE} (
         OnlineExamPaperId,
         ExamId,
         ExamSubjectId,
         StudentId,
         Status,
         StartedAt,
         TotalMarks,
         CreatedAt,
         UpdatedAt
       )
       OUTPUT INSERTED.OnlineExamAttemptId
       VALUES (
         @OnlineExamPaperId,
         @ExamId,
         @ExamSubjectId,
         @StudentId,
         N'Started',
         SYSUTCDATETIME(),
         @TotalMarks,
         SYSUTCDATETIME(),
         SYSUTCDATETIME()
       )`,
      [
        { name: 'OnlineExamPaperId', type: sql.Int, value: parseNumericId(context.paper.paperId) },
        { name: 'ExamId', type: sql.Int, value: parseNumericId(context.exam.id || examId) },
        { name: 'ExamSubjectId', type: sql.Int, value: parseNumericId(context.examSubject?.examSubjectId || context.examSubject?._id) },
        { name: 'StudentId', type: sql.Int, value: parseNumericId(studentId) },
        { name: 'TotalMarks', type: sql.Decimal(10, 2), value: toNumber(context.paper.totalMarks, 0) },
      ]
    );

    attemptId = parseNumericId(insertedAttempt?.recordset?.[0]?.OnlineExamAttemptId);
  }

  return {
    resultCode: 'ok',
    exam: context.exam,
    paper: context.paper,
    attempt: {
      ...context.attempt,
      attemptId: attemptId ? String(attemptId) : null,
      status: context.attempt?.status || 'Started',
    },
    questions: context.questions.map((question) => ({
      ...question,
      correctAnswer: undefined,
    })),
  };
};

const submitStudentOnlineExam = async ({ examId, studentId, answers = [] }) => {
  await ensureExamSqlReady();
  const context = await loadOnlineExamPaperContext({ examId, studentId, includeAnswerKey: true });
  if (context?.errorCode) {
    return context;
  }

  if (!context.paper || !context.questions.length) {
    return { errorCode: 'paper_not_ready' };
  }

  const student = await getStudentById(studentId);
  if (!student) {
    return { errorCode: 'student_not_found' };
  }

  if (context.attempt?.status === 'Submitted') {
    return {
      resultCode: 'already_submitted',
      exam: context.exam,
      paper: context.paper,
      attempt: context.attempt,
      breakdown: buildOnlineAttemptBreakdown({
        questions: context.questions,
        answerRows: context.attemptAnswers,
      }),
    };
  }

  const answerMap = new Map(
    (Array.isArray(answers) ? answers : [])
      .map((answer) => [String(answer?.questionId || ''), answer?.answer ?? answer?.studentAnswer ?? ''])
  );

  const evaluatedAnswers = context.questions.map((question) => {
    const studentAnswer = String(answerMap.get(String(question.questionId)) || '').trim();
    const evaluation = evaluateOnlineExamQuestion(question, studentAnswer);
    return {
      question,
      studentAnswer,
      ...evaluation,
      marksAwarded: evaluation.isCorrect ? toNumber(question.marks, 0) : 0,
    };
  });

  const totalMarks = Number(
    evaluatedAnswers.reduce((sum, entry) => sum + toNumber(entry.question.marks, 0), 0).toFixed(2)
  );
  const marksObtained = Number(
    evaluatedAnswers.reduce((sum, entry) => sum + toNumber(entry.marksAwarded, 0), 0).toFixed(2)
  );
  const correctAnswers = evaluatedAnswers.filter((entry) => entry.isCorrect).length;
  const incorrectAnswers = evaluatedAnswers.length - correctAnswers;
  const percentage = totalMarks > 0 ? Number(((marksObtained / totalMarks) * 100).toFixed(2)) : 0;
  const gradeLetter = calculateGradeLetter(marksObtained, totalMarks);
  const sql = getSqlClient();

  const savedAttemptId = await executeInTransaction(async (tx) => {
    let attemptId = parseNumericId(context.attempt?.attemptId);

    if (attemptId) {
      await tx.query(
        `UPDATE ${ONLINE_EXAM_ATTEMPT_TABLE}
         SET Status = N'Submitted',
             SubmittedAt = SYSUTCDATETIME(),
             CorrectAnswers = @CorrectAnswers,
             IncorrectAnswers = @IncorrectAnswers,
             MarksObtained = @MarksObtained,
             TotalMarks = @TotalMarks,
             Percentage = @Percentage,
             Grade = @Grade,
             ResultRemarks = @ResultRemarks,
             UpdatedAt = SYSUTCDATETIME()
         WHERE OnlineExamAttemptId = @OnlineExamAttemptId`,
        [
          { name: 'OnlineExamAttemptId', type: sql.Int, value: attemptId },
          { name: 'CorrectAnswers', type: sql.Int, value: correctAnswers },
          { name: 'IncorrectAnswers', type: sql.Int, value: incorrectAnswers },
          { name: 'MarksObtained', type: sql.Decimal(10, 2), value: marksObtained },
          { name: 'TotalMarks', type: sql.Decimal(10, 2), value: totalMarks },
          { name: 'Percentage', type: sql.Decimal(10, 2), value: percentage },
          { name: 'Grade', type: sql.NVarChar(10), value: gradeLetter },
          { name: 'ResultRemarks', type: sql.NVarChar(1000), value: 'Auto-evaluated from online exam paper.' },
        ]
      );

      await tx.query(
        `DELETE FROM ${ONLINE_EXAM_ATTEMPT_ANSWER_TABLE}
         WHERE OnlineExamAttemptId = @OnlineExamAttemptId`,
        [{ name: 'OnlineExamAttemptId', type: sql.Int, value: attemptId }]
      );
    } else {
      const insertedAttempt = await tx.query(
        `INSERT INTO ${ONLINE_EXAM_ATTEMPT_TABLE} (
           OnlineExamPaperId,
           ExamId,
           ExamSubjectId,
           StudentId,
           Status,
           StartedAt,
           SubmittedAt,
           CorrectAnswers,
           IncorrectAnswers,
           MarksObtained,
           TotalMarks,
           Percentage,
           Grade,
           ResultRemarks,
           CreatedAt,
           UpdatedAt
         )
         OUTPUT INSERTED.OnlineExamAttemptId
         VALUES (
           @OnlineExamPaperId,
           @ExamId,
           @ExamSubjectId,
           @StudentId,
           N'Submitted',
           SYSUTCDATETIME(),
           SYSUTCDATETIME(),
           @CorrectAnswers,
           @IncorrectAnswers,
           @MarksObtained,
           @TotalMarks,
           @Percentage,
           @Grade,
           @ResultRemarks,
           SYSUTCDATETIME(),
           SYSUTCDATETIME()
         )`,
        [
          { name: 'OnlineExamPaperId', type: sql.Int, value: parseNumericId(context.paper.paperId) },
          { name: 'ExamId', type: sql.Int, value: parseNumericId(context.exam.id || examId) },
          { name: 'ExamSubjectId', type: sql.Int, value: parseNumericId(context.examSubject?.examSubjectId || context.examSubject?._id) },
          { name: 'StudentId', type: sql.Int, value: parseNumericId(studentId) },
          { name: 'CorrectAnswers', type: sql.Int, value: correctAnswers },
          { name: 'IncorrectAnswers', type: sql.Int, value: incorrectAnswers },
          { name: 'MarksObtained', type: sql.Decimal(10, 2), value: marksObtained },
          { name: 'TotalMarks', type: sql.Decimal(10, 2), value: totalMarks },
          { name: 'Percentage', type: sql.Decimal(10, 2), value: percentage },
          { name: 'Grade', type: sql.NVarChar(10), value: gradeLetter },
          { name: 'ResultRemarks', type: sql.NVarChar(1000), value: 'Auto-evaluated from online exam paper.' },
        ]
      );

      attemptId = parseNumericId(insertedAttempt?.recordset?.[0]?.OnlineExamAttemptId);
    }

    for (const answer of evaluatedAnswers) {
      await tx.query(
        `INSERT INTO ${ONLINE_EXAM_ATTEMPT_ANSWER_TABLE} (
           OnlineExamAttemptId,
           QuestionId,
           StudentAnswer,
           CorrectAnswerSnapshot,
           IsCorrect,
           MarksAwarded,
           CreatedAt,
           UpdatedAt
         )
         VALUES (
           @OnlineExamAttemptId,
           @QuestionId,
           @StudentAnswer,
           @CorrectAnswerSnapshot,
           @IsCorrect,
           @MarksAwarded,
           SYSUTCDATETIME(),
           SYSUTCDATETIME()
         )`,
        [
          { name: 'OnlineExamAttemptId', type: sql.Int, value: attemptId },
          { name: 'QuestionId', type: sql.Int, value: parseNumericId(answer.question.questionId) },
          { name: 'StudentAnswer', type: sql.NVarChar(sql.MAX), value: answer.studentAnswer || null },
          { name: 'CorrectAnswerSnapshot', type: sql.NVarChar(1000), value: answer.displayCorrectAnswer || answer.correctAnswerSnapshot || null },
          { name: 'IsCorrect', type: sql.Bit, value: answer.isCorrect },
          { name: 'MarksAwarded', type: sql.Decimal(10, 2), value: answer.marksAwarded },
        ]
      );
    }

    const existingResult = await tx.query(
      `SELECT TOP 1 ExamResultId
       FROM dbo.ExamResults
       WHERE ExamSubjectId = @ExamSubjectId
         AND StudentId = @StudentId`,
      [
        { name: 'ExamSubjectId', type: sql.Int, value: parseNumericId(context.examSubject?.examSubjectId || context.examSubject?._id) },
        { name: 'StudentId', type: sql.Int, value: parseNumericId(studentId) },
      ]
    );

    const existingResultId = parseNumericId(existingResult?.recordset?.[0]?.ExamResultId);
    if (existingResultId) {
      await tx.query(
        `UPDATE dbo.ExamResults
         SET MarksObtained = @MarksObtained,
             Grade = @Grade,
             Remarks = @Remarks,
             IsAbsent = 0,
             EvaluatedByTeacherId = NULL,
             UpdatedAt = SYSUTCDATETIME()
         WHERE ExamResultId = @ExamResultId`,
        [
          { name: 'ExamResultId', type: sql.Int, value: existingResultId },
          { name: 'MarksObtained', type: sql.Decimal(10, 2), value: marksObtained },
          { name: 'Grade', type: sql.NVarChar(10), value: gradeLetter },
          { name: 'Remarks', type: sql.NVarChar(1000), value: 'Auto-evaluated from online exam paper.' },
        ]
      );
    } else {
      await tx.query(
        `INSERT INTO dbo.ExamResults (
           ExamSubjectId,
           StudentId,
           MarksObtained,
           Grade,
           Remarks,
           IsAbsent,
           EvaluatedByTeacherId,
           CreatedAt,
           UpdatedAt
         )
         VALUES (
           @ExamSubjectId,
           @StudentId,
           @MarksObtained,
           @Grade,
           @Remarks,
           0,
           NULL,
           SYSUTCDATETIME(),
           SYSUTCDATETIME()
         )`,
        [
          { name: 'ExamSubjectId', type: sql.Int, value: parseNumericId(context.examSubject?.examSubjectId || context.examSubject?._id) },
          { name: 'StudentId', type: sql.Int, value: parseNumericId(studentId) },
          { name: 'MarksObtained', type: sql.Decimal(10, 2), value: marksObtained },
          { name: 'Grade', type: sql.NVarChar(10), value: gradeLetter },
          { name: 'Remarks', type: sql.NVarChar(1000), value: 'Auto-evaluated from online exam paper.' },
        ]
      );
    }

    return attemptId;
  });

  const refreshed = await loadOnlineExamPaperContext({ examId, studentId, includeAnswerKey: true });
  const attempt = refreshed.attempt || {
    attemptId: savedAttemptId ? String(savedAttemptId) : null,
    status: 'Submitted',
    marksObtained,
    totalMarks,
    percentage,
    grade: gradeLetter,
    correctAnswers,
    incorrectAnswers,
  };

  return {
    resultCode: 'ok',
    exam: refreshed.exam,
    paper: refreshed.paper,
    attempt,
    breakdown: buildOnlineAttemptBreakdown({
      questions: refreshed.questions,
      answerRows: refreshed.attemptAnswers,
    }),
  };
};

const resolveAcademicYearId = async (academicYear = null, tx = null) => {
  const sql = getSqlClient();
  const runner = tx?.query || executeQuery;
  const normalizedAcademicYear = toNullableString(academicYear);

  if (normalizedAcademicYear) {
    const exactMatch = await runner(
      `SELECT TOP 1 AcademicYearId
       FROM dbo.AcademicYears
       WHERE YearName = @YearName
       ORDER BY AcademicYearId DESC`,
      [{ name: 'YearName', type: sql.NVarChar(20), value: normalizedAcademicYear }]
    );
    const academicYearId = parseNumericId(exactMatch?.recordset?.[0]?.AcademicYearId);
    if (academicYearId) {
      return academicYearId;
    }
  }

  const fallback = await runner(`
    SELECT TOP 1 AcademicYearId
    FROM dbo.AcademicYears
    ORDER BY
      CASE WHEN IsCurrent = 1 THEN 0 ELSE 1 END,
      CASE WHEN CAST(GETUTCDATE() AS DATE) BETWEEN StartDate AND EndDate THEN 0 ELSE 1 END,
      EndDate DESC,
      AcademicYearId DESC;
  `);

  return parseNumericId(fallback?.recordset?.[0]?.AcademicYearId);
};

const resolveClassIdByName = async (className, tx = null) => {
  const normalizedClassName = toNullableString(className);
  if (!normalizedClassName) {
    return null;
  }

  const sql = getSqlClient();
  const runner = tx?.query || executeQuery;
  const result = await runner(
    `SELECT TOP 1 ClassId
     FROM dbo.Classes
     WHERE ClassName = @ClassName
       AND ISNULL(IsActive, 1) = 1`,
    [{ name: 'ClassName', type: sql.NVarChar(100), value: normalizedClassName }]
  );

  return parseNumericId(result?.recordset?.[0]?.ClassId);
};

const resolveSectionIdByName = async (sectionName, tx = null) => {
  const normalizedSectionName = toNullableString(sectionName);
  if (!normalizedSectionName) {
    return null;
  }

  const sql = getSqlClient();
  const runner = tx?.query || executeQuery;
  const result = await runner(
    `SELECT TOP 1 SectionId
     FROM dbo.Sections
     WHERE SectionName = @SectionName
       AND ISNULL(IsActive, 1) = 1`,
    [{ name: 'SectionName', type: sql.NVarChar(50), value: normalizedSectionName }]
  );

  return parseNumericId(result?.recordset?.[0]?.SectionId);
};

const resolveTeacherDbId = async (teacherLookupId, tx = null) => {
  const normalizedLookupId = parseNumericId(teacherLookupId);
  if (!normalizedLookupId) {
    return null;
  }

  const sql = getSqlClient();
  const runner = tx?.query || executeQuery;
  const result = await runner(
    `SELECT TOP 1 TeacherId
     FROM dbo.Teachers
     WHERE TeacherId = @LookupId OR UserId = @LookupId`,
    [{ name: 'LookupId', type: sql.Int, value: normalizedLookupId }]
  );

  return parseNumericId(result?.recordset?.[0]?.TeacherId);
};

const buildPrimaryExamPayload = async (input = {}, existingExam = null) => {
  const subjectLookupId = parseNumericId(
    input.subject ?? input.subjectId ?? existingExam?.subject?._id ?? existingExam?.subjectId ?? null
  );
  const subject = subjectLookupId ? await getSubjectById(subjectLookupId) : null;
  if (!subject) {
    return { errorCode: 'subject_not_found' };
  }

  const name = toNullableString(input.title ?? input.name ?? existingExam?.title ?? existingExam?.name);
  const className = toNullableString(input.grade ?? input.class ?? existingExam?.class ?? existingExam?.grade ?? subject.grade);
  const sectionName = toNullableString(input.section ?? existingExam?.section);
  const academicYear = toNullableString(input.academicYear ?? existingExam?.academicYear);
  const examDate = normalizeDateOnly(input.date ?? input.examDate ?? existingExam?.date ?? existingExam?.examDate);
  const totalMarks = toNumber(input.totalMarks ?? existingExam?.totalMarks, NaN);
  const suppliedPassingMarks = toNumber(input.passingMarks ?? existingExam?.passingMarks, NaN);
  const passingMarks = Number.isFinite(suppliedPassingMarks)
    ? suppliedPassingMarks
    : Number((Math.max(totalMarks, 0) * 0.4).toFixed(2));
  const instructions = toNullableString(input.instructions ?? existingExam?.instructions);
  const derivedTimes = deriveExamTimes({
    startTime: input.startTime ?? existingExam?.startTime,
    endTime: input.endTime ?? existingExam?.endTime,
    duration: input.duration ?? existingExam?.duration,
  });
  const subjectId = parseNumericId(subject.subjectId || subjectLookupId);

  if (!name || !className || !examDate || !subjectId || !Number.isFinite(totalMarks) || totalMarks <= 0) {
    return { errorCode: 'invalid_payload' };
  }

  return {
    name,
    className,
    sectionName,
    academicYear,
    examDate,
    totalMarks,
    passingMarks,
    instructions,
    startTime: derivedTimes.startTime,
    endTime: derivedTimes.endTime,
    durationMinutes: derivedTimes.durationMinutes,
    subjectId,
  };
};

const createExamRecord = async (input, createdByUserId) => {
  await ensureExamSqlReady();
  const payload = await buildPrimaryExamPayload(input);
  if (payload?.errorCode) {
    return payload;
  }

  const createdExamId = await executeInTransaction(async (tx) => {
    const sql = getSqlClient();
    const classId = await resolveClassIdByName(payload.className, tx);
    const sectionId = await resolveSectionIdByName(payload.sectionName, tx);
    const academicYearId = await resolveAcademicYearId(payload.academicYear, tx);
    if (!classId || !academicYearId) {
      throw new Error('Unable to resolve the SQL class or academic year for this exam.');
    }

    const createdExam = await tx.query(
      `INSERT INTO dbo.Exams (
         ExamName,
         AcademicYearId,
         ClassId,
         SectionId,
         StartDate,
         EndDate,
         Description,
         CreatedAt,
         UpdatedAt
       )
       OUTPUT INSERTED.ExamId
       VALUES (
         @ExamName,
         @AcademicYearId,
         @ClassId,
         @SectionId,
         @StartDate,
         @EndDate,
         @Description,
         SYSUTCDATETIME(),
         SYSUTCDATETIME()
       )`,
      [
        { name: 'ExamName', type: sql.NVarChar(200), value: payload.name },
        { name: 'AcademicYearId', type: sql.Int, value: academicYearId },
        { name: 'ClassId', type: sql.Int, value: classId },
        { name: 'SectionId', type: sql.Int, value: sectionId },
        { name: 'StartDate', type: sql.Date, value: payload.examDate },
        { name: 'EndDate', type: sql.Date, value: payload.examDate },
        { name: 'Description', type: sql.NVarChar(2000), value: payload.instructions },
      ]
    );

    const examId = parseNumericId(createdExam?.recordset?.[0]?.ExamId);
    await tx.query(
      `INSERT INTO dbo.ExamSubjects (
         ExamId,
         SubjectId,
         MaxMarks,
         PassMarks,
         ExamDate,
         StartTime,
         EndTime
       )
       VALUES (
         @ExamId,
         @SubjectId,
         @MaxMarks,
         @PassMarks,
         @ExamDate,
         CAST(@StartTime AS time(0)),
         CAST(@EndTime AS time(0))
       )`,
      [
        { name: 'ExamId', type: sql.Int, value: examId },
        { name: 'SubjectId', type: sql.Int, value: payload.subjectId },
        { name: 'MaxMarks', type: sql.Decimal(10, 2), value: payload.totalMarks },
        { name: 'PassMarks', type: sql.Decimal(10, 2), value: payload.passingMarks },
        { name: 'ExamDate', type: sql.Date, value: payload.examDate },
        { name: 'StartTime', type: sql.NVarChar(10), value: payload.startTime },
        { name: 'EndTime', type: sql.NVarChar(10), value: payload.endTime },
      ]
    );

    return examId;
  });

  return getExamRecordById(createdExamId);
};

const updateExamRecord = async (examId, input) => {
  await ensureExamSqlReady();
  const existing = await getExamRecordById(examId);
  if (!existing?.exam) {
    return { errorCode: 'not_found' };
  }

  const payload = await buildPrimaryExamPayload(input, existing.exam);
  if (payload?.errorCode) {
    return payload;
  }

  const examSqlId = parseNumericId(examId);
  const primaryExamSubjectId = parseNumericId(existing.examSubjects?.[0]?.examSubjectId || existing.examSubjects?.[0]?._id);

  await executeInTransaction(async (tx) => {
    const sql = getSqlClient();
    const classId = await resolveClassIdByName(payload.className, tx);
    const sectionId = await resolveSectionIdByName(payload.sectionName, tx);
    const academicYearId = await resolveAcademicYearId(payload.academicYear, tx);
    if (!classId || !academicYearId) {
      throw new Error('Unable to resolve the SQL class or academic year for this exam.');
    }

    await tx.query(
      `UPDATE dbo.Exams
       SET ExamName = @ExamName,
           AcademicYearId = @AcademicYearId,
           ClassId = @ClassId,
           SectionId = @SectionId,
           StartDate = @StartDate,
           EndDate = @EndDate,
           Description = @Description,
           UpdatedAt = SYSUTCDATETIME()
       WHERE ExamId = @ExamId`,
      [
        { name: 'ExamId', type: sql.Int, value: examSqlId },
        { name: 'ExamName', type: sql.NVarChar(200), value: payload.name },
        { name: 'AcademicYearId', type: sql.Int, value: academicYearId },
        { name: 'ClassId', type: sql.Int, value: classId },
        { name: 'SectionId', type: sql.Int, value: sectionId },
        { name: 'StartDate', type: sql.Date, value: payload.examDate },
        { name: 'EndDate', type: sql.Date, value: payload.examDate },
        { name: 'Description', type: sql.NVarChar(2000), value: payload.instructions },
      ]
    );

    if (primaryExamSubjectId) {
      await tx.query(
        `UPDATE dbo.ExamSubjects
         SET SubjectId = @SubjectId,
             MaxMarks = @MaxMarks,
             PassMarks = @PassMarks,
             ExamDate = @ExamDate,
             StartTime = CAST(@StartTime AS time(0)),
             EndTime = CAST(@EndTime AS time(0))
         WHERE ExamSubjectId = @ExamSubjectId`,
        [
          { name: 'ExamSubjectId', type: sql.Int, value: primaryExamSubjectId },
          { name: 'SubjectId', type: sql.Int, value: payload.subjectId },
          { name: 'MaxMarks', type: sql.Decimal(10, 2), value: payload.totalMarks },
          { name: 'PassMarks', type: sql.Decimal(10, 2), value: payload.passingMarks },
          { name: 'ExamDate', type: sql.Date, value: payload.examDate },
          { name: 'StartTime', type: sql.NVarChar(10), value: payload.startTime },
          { name: 'EndTime', type: sql.NVarChar(10), value: payload.endTime },
        ]
      );
    } else {
      await tx.query(
        `INSERT INTO dbo.ExamSubjects (
           ExamId,
           SubjectId,
           MaxMarks,
           PassMarks,
           ExamDate,
           StartTime,
           EndTime
         )
         VALUES (
           @ExamId,
           @SubjectId,
           @MaxMarks,
           @PassMarks,
           @ExamDate,
           CAST(@StartTime AS time(0)),
           CAST(@EndTime AS time(0))
         )`,
        [
          { name: 'ExamId', type: sql.Int, value: examSqlId },
          { name: 'SubjectId', type: sql.Int, value: payload.subjectId },
          { name: 'MaxMarks', type: sql.Decimal(10, 2), value: payload.totalMarks },
          { name: 'PassMarks', type: sql.Decimal(10, 2), value: payload.passingMarks },
          { name: 'ExamDate', type: sql.Date, value: payload.examDate },
          { name: 'StartTime', type: sql.NVarChar(10), value: payload.startTime },
          { name: 'EndTime', type: sql.NVarChar(10), value: payload.endTime },
        ]
      );
    }
  });

  return getExamRecordById(examSqlId);
};

const deleteExamRecord = async (examId) => {
  await ensureExamSqlReady();
  const examSqlId = parseNumericId(examId);
  if (!examSqlId) {
    return { resultCode: 'not_found' };
  }

  const existing = await getExamRecordById(examSqlId);
  if (!existing?.exam) {
    return { resultCode: 'not_found' };
  }

  const sql = getSqlClient();
  await executeInTransaction(async (tx) => {
    await tx.query(
      `DELETE er
       FROM dbo.ExamResults er
       INNER JOIN dbo.ExamSubjects es
         ON es.ExamSubjectId = er.ExamSubjectId
       WHERE es.ExamId = @ExamId`,
      [{ name: 'ExamId', type: sql.Int, value: examSqlId }]
    );

    await tx.query(
      `DELETE FROM dbo.ExamSubjects WHERE ExamId = @ExamId`,
      [{ name: 'ExamId', type: sql.Int, value: examSqlId }]
    );

    await tx.query(
      `DELETE FROM dbo.Exams WHERE ExamId = @ExamId`,
      [{ name: 'ExamId', type: sql.Int, value: examSqlId }]
    );
  });

  return { resultCode: 'ok' };
};

const enterExamMarks = async ({ examId, marks = [], enteredByUserId }) => {
  await ensureExamSqlReady();
  const examBundle = await getExamRecordById(examId);
  if (!examBundle?.exam) {
    return { errorCode: 'exam_not_found' };
  }

  const exam = examBundle.exam;
  const defaultExamSubject = examBundle.examSubjects?.[0] || null;
  const results = [];
  const errors = [];
  const sql = getSqlClient();
  const evaluatedByTeacherId = await resolveTeacherDbId(enteredByUserId);

  for (const record of marks) {
    try {
      const studentId = parseNumericId(record?.studentId);
      if (!studentId) {
        errors.push({ studentId: null, message: 'Student ID is required' });
        continue;
      }

      const student = await getStudentById(studentId);
      if (!student) {
        errors.push({ studentId, message: 'Student not found' });
        continue;
      }

      const marksObtained = toNumber(record.marksObtained ?? record.marks, NaN);
      if (!Number.isFinite(marksObtained) || marksObtained < 0) {
        errors.push({ studentId, message: 'Invalid marks obtained' });
        continue;
      }

      const requestedExamSubject = parseNumericId(record?.examSubjectId || record?.subjectId);
      const matchedExamSubject = examBundle.examSubjects.find((entry) =>
        parseNumericId(entry.examSubjectId || entry._id) === requestedExamSubject
        || parseNumericId(entry.subjectId) === requestedExamSubject
      ) || defaultExamSubject;

      const examSubjectId = parseNumericId(matchedExamSubject?.examSubjectId || matchedExamSubject?._id);
      if (!examSubjectId) {
        errors.push({ studentId, message: 'Exam subject not found' });
        continue;
      }

      const existingResult = await executeQuery(
        `SELECT TOP 1 ExamResultId
         FROM dbo.ExamResults
         WHERE ExamSubjectId = @ExamSubjectId
           AND StudentId = @StudentId`,
        [
          { name: 'ExamSubjectId', type: sql.Int, value: examSubjectId },
          { name: 'StudentId', type: sql.Int, value: studentId },
        ]
      );

      const existingResultId = parseNumericId(existingResult?.recordset?.[0]?.ExamResultId);
      const gradeLetter = calculateGradeLetter(marksObtained, matchedExamSubject?.totalMarks || exam.totalMarks);
      const isAbsent = record?.isAbsent === true;

      if (existingResultId) {
        await executeQuery(
          `UPDATE dbo.ExamResults
           SET MarksObtained = @MarksObtained,
               Grade = @Grade,
               Remarks = @Remarks,
               IsAbsent = @IsAbsent,
               EvaluatedByTeacherId = @EvaluatedByTeacherId,
               UpdatedAt = SYSUTCDATETIME()
           WHERE ExamResultId = @ExamResultId`,
          [
            { name: 'ExamResultId', type: sql.Int, value: existingResultId },
            { name: 'MarksObtained', type: sql.Decimal(10, 2), value: marksObtained },
            { name: 'Grade', type: sql.NVarChar(10), value: gradeLetter },
            { name: 'Remarks', type: sql.NVarChar(1000), value: toNullableString(record.remarks) },
            { name: 'IsAbsent', type: sql.Bit, value: isAbsent },
            { name: 'EvaluatedByTeacherId', type: sql.Int, value: evaluatedByTeacherId },
          ]
        );
      } else {
        await executeQuery(
          `INSERT INTO dbo.ExamResults (
             ExamSubjectId,
             StudentId,
             MarksObtained,
             Grade,
             Remarks,
             IsAbsent,
             EvaluatedByTeacherId,
             CreatedAt,
             UpdatedAt
           )
           VALUES (
             @ExamSubjectId,
             @StudentId,
             @MarksObtained,
             @Grade,
             @Remarks,
             @IsAbsent,
             @EvaluatedByTeacherId,
             SYSUTCDATETIME(),
             SYSUTCDATETIME()
           )`,
          [
            { name: 'ExamSubjectId', type: sql.Int, value: examSubjectId },
            { name: 'StudentId', type: sql.Int, value: studentId },
            { name: 'MarksObtained', type: sql.Decimal(10, 2), value: marksObtained },
            { name: 'Grade', type: sql.NVarChar(10), value: gradeLetter },
            { name: 'Remarks', type: sql.NVarChar(1000), value: toNullableString(record.remarks) },
            { name: 'IsAbsent', type: sql.Bit, value: isAbsent },
            { name: 'EvaluatedByTeacherId', type: sql.Int, value: evaluatedByTeacherId },
          ]
        );
      }

      const refreshedBundle = await getExamRecordById(examId);
      const mappedResult = (refreshedBundle?.grades || []).find((grade) => {
        const gradeStudentId = parseNumericId(grade?.studentId?._id || grade?.studentId);
        const gradeSubjectId = parseNumericId(grade?.subjectId?._id || grade?.subjectId);
        return gradeStudentId === studentId && gradeSubjectId === parseNumericId(matchedExamSubject.subjectId);
      });

      if (mappedResult) {
        results.push(mappedResult);
      }
    } catch (error) {
      errors.push({ studentId: record?.studentId || null, message: error.message });
    }
  }

  return {
    entered: results.length,
    grades: results,
    errors,
  };
};

const getStudentExamResults = async ({ studentId, examId = null, className = null } = {}) => {
  await ensureExamSqlReady();
  await syncAllExamsToSql();

  const sql = getSqlClient();
  const studentSqlId = parseNumericId(studentId);
  if (!studentSqlId) {
    return { grades: [], stats: { totalExams: 0, totalMarks: 0, totalObtained: 0, average: 0 } };
  }
  const examSqlId = parseNumericId(examId);
  const clauses = ['er.StudentId = @StudentId'];
  const params = [
    { name: 'StudentId', type: sql.Int, value: studentSqlId },
  ];
  if (examSqlId) {
    clauses.push('e.ExamId = @ExamId');
    params.push({ name: 'ExamId', type: sql.Int, value: examSqlId });
  }
  if (className) {
    clauses.push('c.ClassName = @ClassName');
    params.push({ name: 'ClassName', type: sql.NVarChar(100), value: toNullableString(className) });
  }
  const result = await executeQuery(`
    SELECT
      er.ExamResultId,
      er.StudentId,
      st.FullName AS StudentFullName,
      st.RollNumber AS StudentRollNumber,
      e.ExamId,
      e.ExamName,
      es.ExamDate,
      es.SubjectId,
      sub.SubjectName,
      er.MarksObtained,
      es.MaxMarks,
      es.PassMarks,
      er.Grade,
      er.Remarks,
      c.ClassName,
      sec.SectionName,
      er.CreatedAt,
      er.UpdatedAt
    FROM dbo.ExamResults er
    INNER JOIN dbo.ExamSubjects es
      ON es.ExamSubjectId = er.ExamSubjectId
    INNER JOIN dbo.Exams e
      ON e.ExamId = es.ExamId
    INNER JOIN dbo.Students st
      ON st.StudentId = er.StudentId
    INNER JOIN dbo.Classes c
      ON c.ClassId = e.ClassId
    LEFT JOIN dbo.Sections sec
      ON sec.SectionId = e.SectionId
    LEFT JOIN dbo.Subjects sub
      ON sub.SubjectId = es.SubjectId
    WHERE ${clauses.join(' AND ')}
    ORDER BY es.ExamDate DESC, e.ExamId DESC;
  `, params);

  const grades = (result?.recordset || []).map(mapResultRow);
  const stats = grades.reduce((acc, grade) => {
    acc.totalMarks += toNumber(grade.totalMarks, 0);
    acc.totalObtained += toNumber(grade.marksObtained, 0);
    return acc;
  }, { totalMarks: 0, totalObtained: 0 });

  return {
    grades,
    stats: {
      totalExams: grades.length,
      totalMarks: stats.totalMarks,
      totalObtained: stats.totalObtained,
      average: stats.totalMarks > 0 ? Number(((stats.totalObtained / stats.totalMarks) * 100).toFixed(2)) : 0,
    },
  };
};

const getExamReportData = async (examId) => {
  await ensureExamSqlReady();
  await syncAllExamsToSql();
  const examBundle = await getExamRecordById(examId);
  const exam = examBundle?.exam || null;
  const grades = examBundle?.grades || [];

  if (!exam) {
    return null;
  }

  const marks = grades.map((grade) => toNumber(grade.marksObtained, 0));
  const totalMarksSum = marks.reduce((sum, value) => sum + value, 0);
  const highest = marks.length ? Math.max(...marks) : 0;
  const lowest = marks.length ? Math.min(...marks) : 0;
  const average = marks.length ? Number((totalMarksSum / marks.length).toFixed(2)) : 0;
  const passed = grades.filter((grade) => toNumber(grade.marksObtained, 0) >= toNumber(exam.passingMarks, 0)).length;
  const passPercentage = marks.length ? Number(((passed / marks.length) * 100).toFixed(2)) : 0;
  const gradeDistribution = {
    'A+': grades.filter((grade) => grade.grade === 'A+').length,
    A: grades.filter((grade) => grade.grade === 'A').length,
    'B+': grades.filter((grade) => grade.grade === 'B+').length,
    B: grades.filter((grade) => grade.grade === 'B').length,
    'C+': grades.filter((grade) => grade.grade === 'C+').length,
    C: grades.filter((grade) => grade.grade === 'C').length,
    D: grades.filter((grade) => grade.grade === 'D').length,
    F: grades.filter((grade) => grade.grade === 'F').length,
  };

  const meritList = grades
    .slice()
    .sort((left, right) => {
      const marksDelta = toNumber(right.marksObtained, 0) - toNumber(left.marksObtained, 0);
      if (marksDelta !== 0) {
        return marksDelta;
      }
      return String(left.studentId?.fullName || '').localeCompare(String(right.studentId?.fullName || ''));
    })
    .map((grade, index) => ({
      ...grade,
      rank: index + 1,
    }));

  return {
    exam,
    grades: meritList,
    statistics: {
      totalStudents: marks.length,
      average,
      highest,
      lowest,
      passed,
      passPercentage,
      gradeDistribution,
    },
    meritList: meritList.slice(0, 10),
    topStudents: meritList.slice(0, 10),
  };
};

module.exports = {
  ensureExamSqlReady,
  syncExamMirror,
  syncExamResultMirror,
  syncAllExamsToSql,
  getExamList,
  getExamRecordById,
  loadOnlineExamPaperContext,
  createExamRecord,
  updateExamRecord,
  deleteExamRecord,
  saveOnlineExamPaper,
  startStudentOnlineExam,
  submitStudentOnlineExam,
  enterExamMarks,
  getStudentExamResults,
  getExamReportData,
};
