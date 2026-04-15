const Timetable = require('../models/Timetable');
const Parent = require('../models/Parent');
const Homework = require('../models/Homework');
const HomeworkSubmission = require('../models/HomeworkSubmission');
const Bus = require('../models/Bus');
const Meeting = require('../models/Meeting');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { generateToken } = require('../middleware/authMiddleware');
const { getSqlClient, executeQuery } = require('../config/sqlServer');
const mongoose = require('mongoose');
const {
  createAuthUser,
  comparePasswordValue,
  getAuthUserByEmailRole,
  getAuthUsersByIds,
  updateAuthUser,
  deleteAuthUser,
} = require('../services/authSqlService');
const {
  ensureStudentSqlReady,
  getStudentList,
  getAllStudents: getAllStudentsFromSql,
  getStudentById: getStudentByIdFromSql,
  createStudentRecord,
  updateStudentRecord,
  deleteStudentRecord,
  getStudentFullProfile,
  getStudentCount: getStudentCountFromSql,
  getStudentsByClass: getStudentsByClassFromSql,
  getStudentByRollNumber,
  getStudentByUserId,
  listStudentPortalProfiles,
  getStudentPortalProfileById,
  updateStudentPortalProfileRecord,
  promoteStudentPortalProfileToStudentRecord,
} = require('../services/studentSqlService');
const { getStudentAttendanceReport } = require('../services/attendanceSqlService');
const { getFeesForStudent } = require('../services/feeSqlService');
const { ensureExamSqlReady, getStudentExamResults } = require('../services/examSqlService');
const { getSubjectsByGrade } = require('../services/academicSqlService');
const { getTimetableByClassFromSql } = require('../services/timetableSqlService');

const parseBooleanInput = (value) => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['true', '1', 'yes', 'y'].includes(normalized);
  }

  return Boolean(value);
};

const parseStudentIdParam = (value) => {
  const numericValue = Number(value);
  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    return null;
  }

  return numericValue;
};

const normalizeStudentRole = (value = '') => String(value || '').trim().toLowerCase();

const resolveStudentSelfAccess = async (req, targetStudentId) => {
  const role = normalizeStudentRole(req.user?.role);
  if (['admin', 'teacher'].includes(role)) {
    return { allowed: true, role, studentProfile: null };
  }

  if (role !== 'student') {
    return { allowed: false, role, reason: 'forbidden', studentProfile: null };
  }

  const studentProfile = await getStudentByUserId(req.user);
  const ownStudentId = parseStudentIdParam(
    studentProfile?._id ?? studentProfile?.id ?? studentProfile?.studentId
  );

  if (!ownStudentId) {
    return { allowed: false, role, reason: 'missing_profile', studentProfile: null };
  }

  if (ownStudentId !== targetStudentId) {
    return { allowed: false, role, reason: 'forbidden', studentProfile };
  }

  return { allowed: true, role, studentProfile };
};

const firstDefinedValue = (...values) => values.find((value) => value !== undefined);

const normalizeStudentAddressInput = (payload = {}) => {
  const rawAddress = payload.address && typeof payload.address === 'object' ? payload.address : {};

  return {
    street: firstDefinedValue(rawAddress.street, rawAddress.addressLine1, payload.addressStreet, payload.addressLine1, payload.street) || '',
    line2: firstDefinedValue(rawAddress.line2, rawAddress.addressLine2, payload.addressLine2, payload.line2) || '',
    city: firstDefinedValue(rawAddress.city, payload.city) || '',
    state: firstDefinedValue(rawAddress.state, payload.state) || '',
    pincode: firstDefinedValue(
      rawAddress.pincode,
      rawAddress.postalCode,
      rawAddress.zipCode,
      payload.addressPincode,
      payload.postalCode,
      payload.zipCode,
      payload.pincode
    ) || '',
    country: firstDefinedValue(rawAddress.country, payload.country) || '',
  };
};

const hasStudentAddressInput = (payload = {}) => {
  const rawAddress = payload.address && typeof payload.address === 'object' ? payload.address : {};

  return [
    rawAddress.street,
    rawAddress.addressLine1,
    rawAddress.line2,
    rawAddress.addressLine2,
    rawAddress.city,
    rawAddress.state,
    rawAddress.pincode,
    rawAddress.postalCode,
    rawAddress.zipCode,
    rawAddress.country,
    payload.addressStreet,
    payload.addressLine1,
    payload.addressLine2,
    payload.street,
    payload.line2,
    payload.city,
    payload.state,
    payload.addressPincode,
    payload.postalCode,
    payload.zipCode,
    payload.pincode,
    payload.country,
  ].some((value) => value !== undefined);
};

const normalizeStudentPayload = (payload = {}) => {
  const derivedFullName = [payload.firstName, payload.lastName]
    .filter((value) => String(value || '').trim())
    .join(' ')
    .trim();

  return {
    fullName: firstDefinedValue(payload.fullName, payload.name, derivedFullName),
    email: firstDefinedValue(payload.email, payload.emailAddress),
    phone: firstDefinedValue(payload.phone, payload.mobile, payload.mobileNumber, payload.contactNumber),
    className: firstDefinedValue(payload.class, payload.className),
    sectionName: firstDefinedValue(payload.section, payload.sectionName),
    rollNumber: firstDefinedValue(payload.rollNumber, payload.rollNo),
    dateOfBirth: firstDefinedValue(payload.dateOfBirth, payload.dob, payload.DOB),
    gender: firstDefinedValue(payload.gender, payload.sex),
    address: hasStudentAddressInput(payload) ? normalizeStudentAddressInput(payload) : undefined,
    guardianName: firstDefinedValue(payload.guardianName, payload.parentName),
    guardianPhone: firstDefinedValue(payload.guardianPhone, payload.parentPhone),
    guardianRelation: firstDefinedValue(payload.guardianRelation, payload.parentRelation, payload.relation),
    bloodGroup: firstDefinedValue(payload.bloodGroup, payload.bloodGroupType),
    password: firstDefinedValue(payload.password, payload.passcode),
    academicYear: firstDefinedValue(payload.academicYear, payload.academicYearName, payload.yearName),
    admissionDate: firstDefinedValue(payload.admissionDate, payload.enrollmentDate),
    isActive: parseBooleanInput(payload.isActive),
  };
};

const normalizeStudentPortalProfilePayload = (payload = {}) => {
  const normalizedStudent = normalizeStudentPayload(payload);

  return {
    fullName: normalizedStudent.fullName,
    email: normalizedStudent.email,
    phone: normalizedStudent.phone,
    className: normalizedStudent.className,
    sectionName: normalizedStudent.sectionName,
    rollNumber: normalizedStudent.rollNumber,
    dateOfBirth: normalizedStudent.dateOfBirth,
    gender: normalizedStudent.gender,
    guardianName: normalizedStudent.guardianName,
    guardianPhone: normalizedStudent.guardianPhone,
    guardianRelation: normalizedStudent.guardianRelation,
    bloodGroup: normalizedStudent.bloodGroup,
    admissionDate: normalizedStudent.admissionDate,
    admissionNumber: firstDefinedValue(payload.admissionNumber, payload.admissionNo),
    notes: firstDefinedValue(payload.notes, payload.profileNote),
    isActive: normalizedStudent.isActive,
  };
};
const DUPLICATE_ROLE_EMAIL_MESSAGE = 'This email already exists for the selected role';
const logStudentAuthDebug = (event, payload = {}) => {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  console.info('[students-auth]', { event, ...payload });
};

const isStudentContextValidationError = (error) => {
  const message = String(error?.message || '');
  return [
    'Class is required.',
    'was not found in SQL Server.',
    'was not found for class',
    'No active academic year was found in SQL Server.',
  ].some((snippet) => message.includes(snippet));
};

const isStoredPasswordMatch = async (inputPassword, storedPassword) =>
  comparePasswordValue(inputPassword, storedPassword);

const mapFeeRecordForDetails = (fee, fallbackAcademicYear = null, referenceDate = new Date()) => {
  const amount = Number(fee?.amount || 0);
  const paidAmount = Number(fee?.paidAmount || 0);
  const pendingAmount = Number(fee?.pendingAmount ?? Math.max(amount - paidAmount, 0));
  const dueDate = fee?.dueDate || null;
  const isOverdue = pendingAmount > 0 && dueDate && new Date(dueDate) < referenceDate;

  return {
    id: fee?.id || fee?._id || null,
    feeType: fee?.feeType || null,
    academicYear: fee?.academicYear || fallbackAcademicYear || null,
    dueDate,
    amount,
    paidAmount,
    pendingAmount,
    status: fee?.status || (pendingAmount > 0 ? 'Pending' : 'Paid'),
    description: fee?.description || null,
    paymentDate: fee?.paymentDate || null,
    paymentMode: fee?.paymentMode || null,
    receiptNumber: fee?.receiptNumber || null,
    transactionId: fee?.transactionId || null,
    remarks: fee?.remarks || null,
    payments: Array.isArray(fee?.payments) ? fee.payments : [],
    isOverdue,
  };
};

const summarizeFeeRecords = (feeRecords = []) => feeRecords.reduce(
  (acc, record) => {
    acc.totalFees += Number(record.amount || 0);
    acc.paidAmount += Number(record.paidAmount || 0);
    acc.pendingAmount += Number(record.pendingAmount || 0);
    if (record.isOverdue) {
      acc.overdueCount += 1;
    }
    return acc;
  },
  {
    totalFees: 0,
    paidAmount: 0,
    pendingAmount: 0,
    overdueCount: 0,
  }
);

const mapExamRecordForDetails = (record) => ({
  id: record?.id || record?._id || null,
  examName: record?.examName || record?.examId?.name || record?.examId?.title || 'Exam',
  examDate: record?.examDate || record?.examId?.examDate || record?.examId?.date || null,
  subject: typeof record?.subject === 'string'
    ? record.subject
    : record?.subject?.name || record?.subjectId?.name || 'Subject',
  marksObtained: Number(record?.marksObtained || record?.marks || 0),
  totalMarks: Number(record?.totalMarks || record?.examId?.totalMarks || 0),
  percentage: Number(record?.percentage || 0),
  grade: record?.grade || null,
  remarks: record?.remarks || null,
  isAbsent: record?.isAbsent === true,
});

const summarizeExamRecords = (examRecords = []) => {
  const totals = examRecords.reduce(
    (acc, record) => {
      acc.totalExams += 1;
      acc.totalMarks += Number(record.totalMarks || 0);
      acc.totalObtained += Number(record.marksObtained || 0);
      acc.percentageTotal += Number(record.percentage || 0);
      return acc;
    },
    {
      totalExams: 0,
      totalMarks: 0,
      totalObtained: 0,
      percentageTotal: 0,
    }
  );

  return {
    totalExams: totals.totalExams,
    totalMarks: totals.totalMarks,
    totalObtained: totals.totalObtained,
    averagePercentage: totals.totalExams > 0
      ? Number((totals.percentageTotal / totals.totalExams).toFixed(2))
      : 0,
  };
};

const formatTimeDisplay = (value) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // SQL `time` values arrive as UTC-based Date objects, so keep the UTC clock intact.
    return `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`;
  }

  const normalized = String(value).trim();
  const timeMatch = normalized.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (timeMatch) {
    return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
  }

  const parsedDate = new Date(normalized);
  if (!Number.isNaN(parsedDate.getTime())) {
    const useUtcClock = /(?:gmt|utc|z|[+-]\d{2}:?\d{2})/i.test(normalized);
    const hours = useUtcClock ? parsedDate.getUTCHours() : parsedDate.getHours();
    const minutes = useUtcClock ? parsedDate.getUTCMinutes() : parsedDate.getMinutes();
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  return normalized;
};

const buildExamScheduleDateTime = (dateValue, timeValue) => {
  if (!dateValue) {
    return null;
  }

  const safeDate = new Date(dateValue);
  if (Number.isNaN(safeDate.getTime())) {
    return null;
  }

  const safeTime = formatTimeDisplay(timeValue) || '00:00';
  const [hoursText, minutesText] = safeTime.split(':');
  safeDate.setHours(Number(hoursText), Number(minutesText), 0, 0);
  return safeDate;
};

const resolveStudentExamScheduleStatus = ({
  examDate = null,
  startTime = null,
  endTime = null,
  attemptStatus = null,
  referenceDate = new Date(),
} = {}) => {
  const normalizedAttemptStatus = String(attemptStatus || '').trim().toLowerCase();
  if (normalizedAttemptStatus === 'submitted') {
    return 'Submitted';
  }

  const startDateTime = buildExamScheduleDateTime(examDate, startTime);
  const endDateTime = buildExamScheduleDateTime(examDate, endTime || startTime);
  const safeEndDateTime = endDateTime && startDateTime && endDateTime < startDateTime
    ? new Date(endDateTime.getTime() + (24 * 60 * 60 * 1000))
    : endDateTime;

  if (startDateTime && referenceDate < startDateTime) {
    return 'Upcoming';
  }

  if (safeEndDateTime && referenceDate > safeEndDateTime) {
    return 'Closed';
  }

  return 'Live';
};

const mapExamScheduleRecordForDetails = (row, referenceDate = new Date()) => {
  if (!row) {
    return null;
  }

  const examDate = row.ExamDate || row.StartDate || null;
  const safeExamDate = examDate ? new Date(examDate) : null;
  const normalizedExamDate = safeExamDate && !Number.isNaN(safeExamDate.getTime()) ? safeExamDate : null;
  const startTime = formatTimeDisplay(row.StartTime);
  const endTime = formatTimeDisplay(row.EndTime);
  const isOnlineEnabled = row.OnlineExamPaperId !== null && row.OnlineExamPaperId !== undefined;
  const questionCount = Number(row.OnlineQuestionCount || 0);
  const attemptStatus = row.AttemptStatus || null;
  const normalizedAttemptStatus = String(attemptStatus || '').trim().toLowerCase();
  const status = resolveStudentExamScheduleStatus({
    examDate: normalizedExamDate,
    startTime,
    endTime,
    attemptStatus,
    referenceDate,
  });

  return {
    id: row.ExamSubjectId ? `exam-subject-${row.ExamSubjectId}` : `exam-${row.ExamId}`,
    examId: row.ExamId ? String(row.ExamId) : null,
    examSubjectId: row.ExamSubjectId ? String(row.ExamSubjectId) : null,
    examName: row.ExamName || 'Exam',
    subject: row.SubjectName || null,
    examDate: normalizedExamDate,
    startTime,
    endTime,
    totalMarks: Number(row.MaxMarks || 0),
    passingMarks: Number(row.PassMarks || 0),
    className: row.ClassName || null,
    sectionName: row.SectionName || null,
    status,
    isOnlineEnabled,
    onlinePaperId: row.OnlineExamPaperId ? String(row.OnlineExamPaperId) : null,
    questionCount,
    attemptStatus,
    canStartTest: isOnlineEnabled && questionCount > 0 && status === 'Live',
    canViewResult: normalizedAttemptStatus === 'submitted' || status === 'Closed',
  };
};

const getExamScheduleForStudentContext = async ({
  className = null,
  sectionName = null,
  studentId = null,
  limit = 12,
  referenceDate = new Date(),
} = {}) => {
  await ensureExamSqlReady();
  const normalizedClassName = String(className || '').trim();
  if (!normalizedClassName) {
    return [];
  }

  const sql = getSqlClient();
  const safeLimit = Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : 12;
  const normalizedSectionName = String(sectionName || '').trim() || null;
  const result = await executeQuery(`
    SELECT TOP (@Limit)
      e.ExamId,
      e.ExamName,
      e.StartDate,
      c.ClassName,
      sec.SectionName,
      es.ExamSubjectId,
      es.ExamDate,
      es.StartTime,
      es.EndTime,
      es.MaxMarks,
      es.PassMarks,
      sub.SubjectName,
      paper.OnlineExamPaperId,
      ISNULL(questionStats.QuestionCount, 0) AS OnlineQuestionCount,
      attempt.OnlineExamAttemptId,
      attempt.Status AS AttemptStatus
    FROM dbo.Exams e
    INNER JOIN dbo.Classes c
      ON c.ClassId = e.ClassId
    LEFT JOIN dbo.Sections sec
      ON sec.SectionId = e.SectionId
    LEFT JOIN dbo.ExamSubjects es
      ON es.ExamId = e.ExamId
    LEFT JOIN dbo.Subjects sub
      ON sub.SubjectId = es.SubjectId
    LEFT JOIN dbo.OnlineExamPapers paper
      ON paper.ExamId = e.ExamId
      AND paper.ExamSubjectId = es.ExamSubjectId
      AND paper.IsActive = 1
    OUTER APPLY (
      SELECT COUNT(1) AS QuestionCount
      FROM dbo.OnlineExamQuestions question
      WHERE question.OnlineExamPaperId = paper.OnlineExamPaperId
        AND question.IsActive = 1
    ) questionStats
    LEFT JOIN dbo.OnlineExamAttempts attempt
      ON attempt.OnlineExamPaperId = paper.OnlineExamPaperId
      AND attempt.StudentId = @StudentId
    WHERE c.ClassName = @ClassName
      AND (
        @SectionName IS NULL
        OR sec.SectionName = @SectionName
        OR sec.SectionName IS NULL
        OR LTRIM(RTRIM(sec.SectionName)) = N''
      )
    ORDER BY
      CASE
        WHEN COALESCE(es.ExamDate, e.StartDate) IS NULL THEN 1
        WHEN CAST(COALESCE(es.ExamDate, e.StartDate) AS DATE) >= CAST(@ReferenceDate AS DATE) THEN 0
        ELSE 1
      END,
      COALESCE(es.ExamDate, e.StartDate) ASC,
      e.ExamId DESC,
      es.ExamSubjectId DESC;
  `, [
    { name: 'Limit', type: sql.Int, value: safeLimit },
    { name: 'ClassName', type: sql.NVarChar(100), value: normalizedClassName },
    { name: 'SectionName', type: sql.NVarChar(50), value: normalizedSectionName },
    { name: 'StudentId', type: sql.Int, value: parseStudentIdParam(studentId) },
    { name: 'ReferenceDate', type: sql.Date, value: referenceDate },
  ]);

  return (result?.recordset || [])
    .map((row) => mapExamScheduleRecordForDetails(row, referenceDate))
    .filter(Boolean);
};

const buildAttendanceSnapshotForDetails = (attendanceRecords = []) => {
  const resolveMarkedByLabel = (record) => {
    const markedBy = record?.markedBy;

    if (markedBy && typeof markedBy === 'object') {
      if (markedBy.fullName && markedBy.role) {
        return `${markedBy.fullName} (${markedBy.role})`;
      }

      return markedBy.fullName || null;
    }

    if (typeof markedBy === 'string' && markedBy.trim() && !/^\d+$/.test(markedBy.trim())) {
      return markedBy.trim();
    }

    return null;
  };

  const summary = attendanceRecords.reduce(
    (acc, record) => {
      const normalizedStatus = String(record?.status || '').trim().toLowerCase();
      acc.total += 1;

      if (normalizedStatus === 'present') {
        acc.present += 1;
      } else if (normalizedStatus === 'absent') {
        acc.absent += 1;
      } else if (normalizedStatus === 'late') {
        acc.late += 1;
      } else if (normalizedStatus === 'half day' || normalizedStatus === 'excused') {
        acc.halfDay += 1;
      }

      return acc;
    },
    {
      total: 0,
      present: 0,
      absent: 0,
      late: 0,
      halfDay: 0,
    }
  );

  return {
    summary: {
      ...summary,
      percentage: summary.total > 0 ? Number(((summary.present / summary.total) * 100).toFixed(2)) : 0,
    },
    recentHistory: attendanceRecords.slice(0, 10).map((record) => ({
      id: record?.id || record?._id || null,
      date: record?.date || null,
      status: record?.status || 'Absent',
      markedBy: resolveMarkedByLabel(record),
      remarks: record?.remarks || '',
    })),
  };
};

const buildTransportDetails = (row) => {
  if (!row) {
    return {
      assigned: false,
    };
  }

  const hasGps = row.GpsLatitude !== null && row.GpsLatitude !== undefined
    && row.GpsLongitude !== null && row.GpsLongitude !== undefined;

  return {
    assigned: true,
    assignmentId: row.AssignmentId ? String(row.AssignmentId) : null,
    busNumber: row.VehicleNumber || null,
    routeName: row.RouteName || null,
    stopName: row.PickupPoint || row.DropPoint || null,
    pickupPoint: row.PickupPoint || null,
    dropPoint: row.DropPoint || null,
    driverName: row.DriverName || null,
    driverPhone: row.DriverPhone || null,
    currentStatus: row.CurrentStatus || row.AssignmentStatus || null,
    gpsLocation: hasGps
      ? {
          latitude: Number(row.GpsLatitude),
          longitude: Number(row.GpsLongitude),
          speed: Number(row.GpsSpeed || 0),
          lastUpdated: row.LastLocationUpdated || null,
        }
      : null,
  };
};

const TIMETABLE_DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DEFAULT_TIMETABLE_ACADEMIC_YEAR = '2024-2025';

const sortTimetableRecordsByDay = (records = []) => [...records].sort((left, right) => {
  const leftIndex = TIMETABLE_DAY_ORDER.indexOf(left.day);
  const rightIndex = TIMETABLE_DAY_ORDER.indexOf(right.day);

  if (leftIndex === -1 && rightIndex === -1) {
    return String(left.day || '').localeCompare(String(right.day || ''));
  }

  if (leftIndex === -1) {
    return 1;
  }

  if (rightIndex === -1) {
    return -1;
  }

  return leftIndex - rightIndex;
});

const mapTimetableRecordForStudent = (dayEntry) => ({
  _id: dayEntry._id,
  class: dayEntry.class,
  section: dayEntry.section,
  day: dayEntry.day,
  academicYear: dayEntry.academicYear,
  periods: (dayEntry.periods || [])
    .map((period) => ({
      periodNumber: Number(period.periodNumber || 0),
      subject: period?.subject?.name || period?.subjectName || (typeof period?.subject === 'string' ? period.subject : 'N/A'),
      subjectCode: period?.subject?.code || period?.subjectCode || 'N/A',
      teacher: period?.teacher?.fullName || period?.teacherName || (typeof period?.teacher === 'string' ? period.teacher : 'TBA'),
      startTime: period.startTime,
      endTime: period.endTime,
      roomNumber: period.roomNumber || 'TBA',
    }))
    .sort((left, right) => Number(left.periodNumber || 0) - Number(right.periodNumber || 0)),
});

const loadLegacyStudentTimetableRecords = async ({ className, sectionName = null, academicYear = null, day = null } = {}) => {
  const query = {
    class: className,
    academicYear,
    isActive: true,
  };

  if (sectionName) {
    query.section = sectionName;
  }

  if (day) {
    query.day = day;
  }

  return Timetable.find(query)
    .populate('periods.subject', 'name code')
    .populate('periods.teacher', 'fullName')
    .sort({ 'periods.periodNumber': 1 });
};

const loadSqlStudentTimetableRecords = async ({ className, sectionName = null, academicYear = null, day = null } = {}) => {
  if (!className) {
    return [];
  }

  return getTimetableByClassFromSql({
    className,
    section: sectionName,
    academicYear,
    day,
  });
};

const resolveLatestSqlTimetableCandidate = async ({ className, sectionName = null } = {}) => {
  const normalizedClassName = String(className || '').trim();
  if (!normalizedClassName) {
    return null;
  }

  const sql = getSqlClient();
  const result = await executeQuery(`
    SELECT TOP 1
      c.ClassName,
      sec.SectionName,
      ay.YearName
    FROM dbo.Timetable tt
    INNER JOIN dbo.Classes c
      ON c.ClassId = tt.ClassId
    LEFT JOIN dbo.Sections sec
      ON sec.SectionId = tt.SectionId
    LEFT JOIN dbo.AcademicYears ay
      ON ay.AcademicYearId = tt.AcademicYearId
    WHERE c.ClassName = @ClassName
      AND (@SectionName IS NULL OR sec.SectionName = @SectionName)
    ORDER BY
      CASE WHEN ay.IsCurrent = 1 THEN 0 ELSE 1 END,
      ay.EndDate DESC,
      ay.AcademicYearId DESC,
      tt.UpdatedAt DESC,
      tt.TimetableId DESC;
  `, [
    { name: 'ClassName', type: sql.NVarChar(100), value: normalizedClassName },
    { name: 'SectionName', type: sql.NVarChar(50), value: sectionName || null },
  ]);

  const row = result?.recordset?.[0] || null;
  if (!row) {
    return null;
  }

  return {
    className: row.ClassName || normalizedClassName,
    sectionName: row.SectionName || null,
    academicYear: row.YearName || null,
  };
};

const resolveLatestLegacyTimetableCandidate = async ({ className, sectionName = null } = {}) => {
  const normalizedClassName = String(className || '').trim();
  if (!normalizedClassName) {
    return null;
  }

  const query = {
    class: normalizedClassName,
    isActive: true,
  };

  if (sectionName) {
    query.section = sectionName;
  }

  const latestRecord = await Timetable.findOne(query)
    .sort({ academicYear: -1, updatedAt: -1, createdAt: -1 })
    .select('class section academicYear')
    .lean();

  if (!latestRecord) {
    return null;
  }

  return {
    className: latestRecord.class || normalizedClassName,
    sectionName: latestRecord.section || null,
    academicYear: latestRecord.academicYear || null,
  };
};

const buildStudentTimetableFallbackNote = ({
  student,
  matchedSection = null,
  matchedAcademicYear = null,
  source = null,
} = {}) => {
  const studentSection = String(student?.section || '').trim() || null;
  const studentAcademicYear = String(student?.academicYear || '').trim() || null;
  const differences = [];

  if (matchedSection && studentSection && matchedSection !== studentSection) {
    differences.push(`section ${matchedSection}`);
  }

  if (matchedAcademicYear && studentAcademicYear && matchedAcademicYear !== studentAcademicYear) {
    differences.push(`academic year ${matchedAcademicYear}`);
  }

  if (!differences.length) {
    return null;
  }

  return {
    id: `timetable-fallback-${student?.id || student?._id || 'student'}`,
    title: 'Timetable fallback in use',
    message: `Showing the latest published timetable from ${differences.join(' and ')} because an exact ${student?.class || 'class'} timetable is not configured yet${source === 'mongo' ? ' in the SQL timetable module' : ''}.`,
  };
};

const loadStudentTimetableRecords = async (student, academicYear, day = null) => {
  const normalizedClassName = String(student?.class || '').trim();
  const normalizedSectionName = String(student?.section || '').trim() || null;
  const normalizedAcademicYear = String(academicYear || student?.academicYear || DEFAULT_TIMETABLE_ACADEMIC_YEAR).trim();

  if (!normalizedClassName) {
    return {
      rows: [],
      matchedSection: normalizedSectionName,
      matchedAcademicYear: normalizedAcademicYear,
      source: null,
    };
  }

  const attempts = [
    { source: 'sql', className: normalizedClassName, sectionName: normalizedSectionName, academicYear: normalizedAcademicYear },
  ];

  if (normalizedSectionName) {
    attempts.push({ source: 'sql', className: normalizedClassName, sectionName: null, academicYear: normalizedAcademicYear });
  }

  const latestSameSectionSql = await resolveLatestSqlTimetableCandidate({
    className: normalizedClassName,
    sectionName: normalizedSectionName,
  });
  if (latestSameSectionSql?.academicYear) {
    attempts.push({ source: 'sql', ...latestSameSectionSql });
  }

  const latestClassSql = await resolveLatestSqlTimetableCandidate({
    className: normalizedClassName,
    sectionName: null,
  });
  if (latestClassSql?.academicYear) {
    attempts.push({ source: 'sql', ...latestClassSql });
  }

  attempts.push({ source: 'mongo', className: normalizedClassName, sectionName: normalizedSectionName, academicYear: normalizedAcademicYear });

  const latestLegacySection = await resolveLatestLegacyTimetableCandidate({
    className: normalizedClassName,
    sectionName: normalizedSectionName,
  });
  if (latestLegacySection?.academicYear) {
    attempts.push({ source: 'mongo', ...latestLegacySection });
  }

  const latestLegacyClass = await resolveLatestLegacyTimetableCandidate({
    className: normalizedClassName,
    sectionName: null,
  });
  if (latestLegacyClass?.academicYear) {
    attempts.push({ source: 'mongo', ...latestLegacyClass });
  }

  const seen = new Set();
  const uniqueAttempts = attempts.filter((attempt) => {
    const key = `${attempt.source}|${attempt.className}|${attempt.sectionName || ''}|${attempt.academicYear || ''}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });

  for (const attempt of uniqueAttempts) {
    const rows = attempt.source === 'sql'
      ? await loadSqlStudentTimetableRecords({
          className: attempt.className,
          sectionName: attempt.sectionName,
          academicYear: attempt.academicYear,
          day,
        })
      : await loadLegacyStudentTimetableRecords({
          className: attempt.className,
          sectionName: attempt.sectionName,
          academicYear: attempt.academicYear,
          day,
        });

    if (Array.isArray(rows) && rows.length > 0) {
      return {
        rows,
        matchedSection: attempt.sectionName,
        matchedAcademicYear: attempt.academicYear,
        source: attempt.source,
      };
    }
  }

  return {
    rows: [],
    matchedSection: normalizedSectionName,
    matchedAcademicYear: normalizedAcademicYear,
    source: null,
  };
};

const buildStudentTimetableSnapshot = async (student) => {
  const fallbackSnapshot = {
    class: student?.class || null,
    section: student?.section || null,
    academicYear: student?.academicYear || DEFAULT_TIMETABLE_ACADEMIC_YEAR,
    source: null,
    note: null,
    today: null,
    records: [],
  };

  if (!student?.class) {
    return fallbackSnapshot;
  }

  let selectedAcademicYear = student.academicYear || DEFAULT_TIMETABLE_ACADEMIC_YEAR;
  let timetableSnapshot = await loadStudentTimetableRecords(student, selectedAcademicYear);

  if (!timetableSnapshot.rows.length && selectedAcademicYear !== DEFAULT_TIMETABLE_ACADEMIC_YEAR) {
    selectedAcademicYear = DEFAULT_TIMETABLE_ACADEMIC_YEAR;
    timetableSnapshot = await loadStudentTimetableRecords(student, selectedAcademicYear);
  }

  const records = sortTimetableRecordsByDay((timetableSnapshot.rows || []).map(mapTimetableRecordForStudent));
  const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });

  return {
    class: student.class,
    section: student.section,
    academicYear: selectedAcademicYear,
    source: timetableSnapshot.source,
    note: buildStudentTimetableFallbackNote({
      student,
      matchedSection: timetableSnapshot.matchedSection,
      matchedAcademicYear: timetableSnapshot.matchedAcademicYear,
      source: timetableSnapshot.source,
    }),
    today: records.find((record) => record.day === todayName) || null,
    records,
  };
};

const buildStudentDetailsPayload = async (studentId) => {
  await ensureStudentSqlReady();

  const sqlSnapshot = await getStudentFullProfile(studentId);
  const student = sqlSnapshot.student;

  if (!student) {
    return null;
  }

  const now = new Date();
  const sql = getSqlClient();
  const [attendanceResult, subjectsResult, transportResult, feesResult, examsResult, examScheduleResult, timetableResult] = await Promise.allSettled([
    getStudentAttendanceReport({ studentId }),
    getSubjectsByGrade(student.class),
    executeQuery(`
      SELECT TOP 1
        sta.AssignmentId,
        sta.PickupPoint,
        sta.DropPoint,
        sta.Status AS AssignmentStatus,
        tv.VehicleNumber,
        tv.RouteName,
        tv.DriverName,
        tv.DriverPhone,
        tv.CurrentStatus,
        tv.GpsLatitude,
        tv.GpsLongitude,
        tv.GpsSpeed,
        tv.LastLocationUpdated
      FROM dbo.StudentTransportAssignments sta
      INNER JOIN dbo.TransportVehicles tv
        ON tv.VehicleId = sta.VehicleId
      WHERE sta.StudentId = @StudentId
        AND sta.Status = N'Active'
        AND ISNULL(tv.IsActive, 1) = 1
      ORDER BY sta.AssignmentId DESC;
    `, [
      { name: 'StudentId', type: sql.Int, value: studentId },
    ]),
    getFeesForStudent(studentId),
    getStudentExamResults({ studentId, className: student.class }),
    getExamScheduleForStudentContext({
      className: student.class,
      sectionName: student.section,
      studentId,
      referenceDate: now,
    }),
    buildStudentTimetableSnapshot(student),
  ]);

  const attendanceRecords = attendanceResult.status === 'fulfilled' ? attendanceResult.value : [];
  const attendance = buildAttendanceSnapshotForDetails(attendanceRecords);
  const academicSubjects = subjectsResult.status === 'fulfilled'
    ? (subjectsResult.value || [])
        .filter((subject) => !subject.sectionName || subject.sectionName === student.section)
        .map((subject) => ({
          id: subject.id || subject._id || null,
          name: subject.name || '-',
          code: subject.code || null,
          teacher: subject.teacherName
            ? {
                fullName: subject.teacherName,
                email: null,
              }
            : null,
        }))
    : [];
  const transport = buildTransportDetails(
    transportResult.status === 'fulfilled' ? transportResult.value?.recordset?.[0] || null : null
  );
  const feeSource = feesResult.status === 'fulfilled'
    ? feesResult.value
    : (sqlSnapshot.feeSnapshot || []);
  const feeRecords = feeSource.map((fee) => mapFeeRecordForDetails(fee, student.academicYear, now));
  const feeSummary = summarizeFeeRecords(feeRecords);
  const paymentHistory = feeRecords
    .flatMap((fee) => (fee.payments || []).map((payment) => ({
      id: payment.id || null,
      feeType: fee.feeType || null,
      amount: Number(payment.amount || 0),
      date: payment.date || null,
      mode: payment.mode || null,
      transactionId: payment.transactionId || null,
      receiptNumber: payment.receiptNumber || null,
      notes: payment.notes || null,
    })))
    .sort((left, right) => new Date(right.date || 0) - new Date(left.date || 0));
  const examSource = examsResult.status === 'fulfilled'
    ? examsResult.value?.grades || []
    : (sqlSnapshot.examSnapshot || []);
  const examRecords = examSource.map(mapExamRecordForDetails);
  const examSchedule = examScheduleResult.status === 'fulfilled'
    ? examScheduleResult.value || []
    : [];
  const examSummaryFromService = examsResult.status === 'fulfilled' ? examsResult.value?.stats || null : null;
  const examSummary = examSummaryFromService
    ? {
        totalExams: Number(examSummaryFromService.totalExams || 0),
        totalMarks: Number(examSummaryFromService.totalMarks || 0),
        totalObtained: Number(examSummaryFromService.totalObtained || 0),
        averagePercentage: Number(examSummaryFromService.average || 0),
        scheduledCount: examSchedule.length,
      }
    : {
        ...summarizeExamRecords(examRecords),
        scheduledCount: examSchedule.length,
      };
  const timetableSnapshot = timetableResult.status === 'fulfilled'
    ? timetableResult.value
    : {
        class: student.class,
        section: student.section,
        academicYear: student.academicYear || DEFAULT_TIMETABLE_ACADEMIC_YEAR,
        source: null,
        note: null,
        today: null,
        records: [],
      };
  const portalNotes = [];
  if (timetableSnapshot.note) {
    portalNotes.push(timetableSnapshot.note);
  }
  const parentDetails = (sqlSnapshot.parentDetails || []).length > 0
    ? sqlSnapshot.parentDetails.map((parent) => ({
        id: parent.id,
        fullName: parent.fullName || null,
        relation: parent.relation || null,
        phone: parent.phone || null,
        alternatePhone: parent.alternatePhone || null,
        email: parent.email || null,
        occupation: parent.occupation || null,
        address: parent.address || {},
        isPrimaryGuardian: parent.isPrimaryGuardian === true,
        isActive: parent.isActive !== false,
      }))
    : (student.parentName || student.parentPhone)
      ? [
          {
            id: `guardian-${student.id}`,
            fullName: student.parentName || student.guardianName || null,
            relation: student.guardianRelation || null,
            phone: student.parentPhone || student.guardianPhone || null,
            alternatePhone: null,
            email: null,
            occupation: null,
            address: student.address || {},
            isPrimaryGuardian: true,
            isActive: true,
          },
        ]
      : [];

  return {
    studentProfile: {
      _id: student.id,
      id: student.id,
      studentId: student.studentId,
      fullName: student.fullName,
      admissionNumber: student.admissionNumber || null,
      rollNumber: student.rollNumber || null,
      class: student.class,
      section: student.section,
      academicYear: student.academicYear || null,
      email: student.email || null,
      phone: student.phone || null,
      dateOfBirth: student.dateOfBirth || null,
      gender: student.gender || null,
      bloodGroup: student.bloodGroup || null,
      admissionDate: student.admissionDate || null,
      isActive: student.isActive,
      address: student.address || {},
      profilePhoto: student.profilePhoto || null,
      parentName: student.parentName || student.guardianName || null,
      parentPhone: student.parentPhone || student.guardianPhone || null,
    },
    parentDetails,
    academicInfo: {
      class: student.class,
      section: student.section,
      academicYear: student.academicYear || null,
      subjects: academicSubjects,
    },
    attendance,
    fees: {
      summary: {
        totalFees: Number(feeSummary.totalFees.toFixed(2)),
        paidAmount: Number(feeSummary.paidAmount.toFixed(2)),
        pendingAmount: Number(feeSummary.pendingAmount.toFixed(2)),
        overdueCount: feeSummary.overdueCount,
      },
      records: feeRecords.map(({ isOverdue, ...fee }) => fee),
      paymentHistory,
    },
    examResults: {
      summary: examSummary,
      records: examRecords,
      schedule: examSchedule,
    },
    homework: {
      summary: {
        total: 0,
        submitted: 0,
        pending: 0,
        overdue: 0,
        graded: 0,
      },
      records: [],
    },
    timetable: timetableSnapshot,
    additionalInfo: {
      transport,
      meetings: [],
      hostel: {
        available: false,
        message: 'Hostel module data is not available in current schema.',
      },
      library: {
        available: false,
        message: 'Library module data is not available in current schema.',
      },
      notes: portalNotes,
      disciplinaryRecords: [],
    },
  };
};

const buildMirrorStudentDetailsPayload = async (student) => {
  if (!student) {
    return null;
  }

  const profileNotes = [];
  if (student.profileNote) {
    profileNotes.push({
      id: `profile-note-${student.id || student._id || 'student'}`,
      title: 'Profile setup pending',
      message: student.profileNote,
    });
  }

  const academicSubjects = (await getSubjectsByGrade(student.class).catch(() => []))
    .filter((subject) => !subject.sectionName || subject.sectionName === student.section)
    .map((subject) => ({
      id: subject.id || subject._id || null,
      name: subject.name || '-',
      code: subject.code || null,
      teacher: subject.teacherName
        ? {
            fullName: subject.teacherName,
            email: null,
          }
        : null,
    }));
  const timetable = await buildStudentTimetableSnapshot(student).catch(() => ({
    class: student.class || null,
    section: student.section || null,
    academicYear: student.academicYear || DEFAULT_TIMETABLE_ACADEMIC_YEAR,
    source: null,
    note: null,
    today: null,
    records: [],
  }));
  if (timetable.note) {
    profileNotes.push(timetable.note);
  }
  const examSchedule = await getExamScheduleForStudentContext({
    className: student.class || null,
    sectionName: student.section || null,
    studentId: student.id || student._id || student.studentId || null,
  }).catch(() => []);

  return {
    studentProfile: {
      _id: student.id || student._id || student.studentId || null,
      id: student.id || student._id || student.studentId || null,
      studentId: student.studentId || student._id || null,
      fullName: student.fullName || null,
      admissionNumber: student.admissionNumber || null,
      rollNumber: student.rollNumber || null,
      class: student.class || null,
      section: student.section || null,
      academicYear: student.academicYear || null,
      email: student.email || null,
      phone: student.phone || null,
      dateOfBirth: student.dateOfBirth || null,
      gender: student.gender || null,
      bloodGroup: student.bloodGroup || null,
      admissionDate: student.admissionDate || null,
      isActive: student.isActive !== false,
      address: student.address || {},
      profilePhoto: student.profilePhoto || null,
      parentName: student.parentName || student.guardianName || null,
      parentPhone: student.parentPhone || student.guardianPhone || null,
    },
    parentDetails: (student.guardianName || student.guardianPhone)
      ? [
          {
            id: `guardian-${student.id || student._id || 'student'}`,
            fullName: student.guardianName || null,
            relation: student.guardianRelation || null,
            phone: student.guardianPhone || null,
            alternatePhone: null,
            email: null,
            occupation: null,
            address: student.address || {},
            isPrimaryGuardian: true,
            isActive: true,
          },
        ]
      : [],
    academicInfo: {
      class: student.class || null,
      section: student.section || null,
      academicYear: student.academicYear || null,
      subjects: academicSubjects,
    },
    attendance: {
      summary: {
        total: 0,
        present: 0,
        absent: 0,
        late: 0,
        halfDay: 0,
        percentage: 0,
      },
      recentHistory: [],
    },
    fees: {
      summary: {
        totalFees: 0,
        paidAmount: 0,
        pendingAmount: 0,
        overdueCount: 0,
      },
      records: [],
      paymentHistory: [],
    },
    examResults: {
      summary: {
        totalExams: 0,
        totalMarks: 0,
        totalObtained: 0,
        averagePercentage: 0,
        scheduledCount: examSchedule.length,
      },
      records: [],
      schedule: examSchedule,
    },
    homework: {
      summary: {
        total: 0,
        submitted: 0,
        pending: 0,
        overdue: 0,
        graded: 0,
      },
      records: [],
    },
    timetable,
    additionalInfo: {
      transport: {
        assigned: false,
      },
      meetings: [],
      hostel: {
        available: false,
        message: 'Hostel module data is not available in current schema.',
      },
      library: {
        available: false,
        message: 'Library module data is not available in current schema.',
      },
      notes: profileNotes,
      disciplinaryRecords: [],
    },
  };
};

const buildProvisionalStudentDetailsPayload = (user) => {
  const normalizedId = String(user?._id || user?.id || 'student-user');
  const normalizedFullName = user?.fullName || 'Student';

  return {
    studentProfile: {
      _id: `provisional-${normalizedId}`,
      id: `provisional-${normalizedId}`,
      studentId: null,
      fullName: normalizedFullName,
      admissionNumber: null,
      rollNumber: null,
      class: null,
      section: null,
      academicYear: null,
      email: user?.email || null,
      phone: user?.phone || null,
      dateOfBirth: null,
      gender: null,
      bloodGroup: null,
      admissionDate: null,
      isActive: user?.isActive !== false,
      address: {},
      profilePhoto: null,
      parentName: null,
      parentPhone: null,
    },
    parentDetails: [],
    academicInfo: {
      class: null,
      section: null,
      academicYear: null,
      subjects: [],
    },
    attendance: {
      summary: {
        total: 0,
        present: 0,
        absent: 0,
        late: 0,
        halfDay: 0,
        percentage: 0,
      },
      recentHistory: [],
    },
    fees: {
      summary: {
        totalFees: 0,
        paidAmount: 0,
        pendingAmount: 0,
        overdueCount: 0,
      },
      records: [],
      paymentHistory: [],
    },
    examResults: {
      summary: {
        totalExams: 0,
        totalMarks: 0,
        totalObtained: 0,
        averagePercentage: 0,
        scheduledCount: 0,
      },
      records: [],
      schedule: [],
    },
    homework: {
      summary: {
        total: 0,
        submitted: 0,
        pending: 0,
        overdue: 0,
        graded: 0,
      },
      records: [],
    },
    timetable: {
      class: null,
      section: null,
      academicYear: null,
      today: null,
      records: [],
    },
    additionalInfo: {
      transport: {
        assigned: false,
      },
      meetings: [],
      hostel: {
        available: false,
        message: 'Hostel module data is not available in current schema.',
      },
      library: {
        available: false,
        message: 'Library module data is not available in current schema.',
      },
      notes: [
        {
          id: `profile-setup-${normalizedId}`,
          title: 'Profile setup pending',
          message: 'This student login is active, but no detailed student profile is linked yet.',
        },
      ],
      disciplinaryRecords: [],
    },
  };
};

// @desc    Student Login
// @route   POST /api/student/login
// @access  Public
const studentLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const role = String(req.body.role || 'student').trim().toLowerCase();

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Please provide email and password',
    });
  }

  if (role !== 'student') {
    return res.status(400).json({
      success: false,
      message: 'Student login requires role "student".',
    });
  }

  logStudentAuthDebug('login.attempt', {
    email,
    role,
    query: 'getAuthUserByEmailRole',
  });

  const user = await getAuthUserByEmailRole(email, 'student');

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'No user found for the selected role.',
    });
  }

  const isMatch = await isStoredPasswordMatch(password, user.password);
  logStudentAuthDebug('login.password-check', {
    email,
    role,
    found: true,
    passwordMatched: isMatch,
  });

  if (!isMatch) {
    return res.status(401).json({
      success: false,
      message: 'Invalid password',
    });
  }

  const student = await getStudentByUserId(user);

  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student profile not found',
    });
  }

  if (!student.isActive) {
    return res.status(401).json({
      success: false,
      message: 'Account is inactive. Please contact school administration.',
    });
  }

  const token = generateToken(user._id);

  res.json({
    success: true,
    message: 'Login successful',
    token,
    user: {
      id: user._id,
      role: user.role,
      email: user.email,
    },
    studentId: student._id,
    name: student.fullName,
    classId: student.class,
    sectionId: student.section,
    email: student.email,
    rollNumber: student.rollNumber,
    class: student.class,
    section: student.section,
    phone: student.phone,
    guardianName: student.guardianName,
    guardianPhone: student.guardianPhone,
  });
});

// @desc    Get student timetable
// @route   GET /api/student/timetable/:studentId
// @access  Private (Student)
const getStudentTimetable = asyncHandler(async (req, res) => {
  const studentId = parseStudentIdParam(req.params.studentId);
  const { day } = req.query;

  if (!studentId) {
    return res.status(400).json({
      success: false,
      message: 'Invalid student ID',
    });
  }

  const access = await resolveStudentSelfAccess(req, studentId);
  if (!access.allowed) {
    if (access.reason === 'missing_profile') {
      return res.status(404).json({
        success: false,
        message: 'Student profile not found for the logged-in account.',
      });
    }

    return res.status(403).json({
      success: false,
      message: 'You can only access your own timetable.',
    });
  }

  const student = access.studentProfile || await getStudentByIdFromSql(studentId);

  if (!student) {
    return res.status(404).json({
      success: false,
      message: 'Student not found',
    });
  }

  const timetableSnapshot = await buildStudentTimetableSnapshot(student);
  const formattedTimetable = day
    ? (timetableSnapshot.records || []).filter((record) => record.day === day)
    : (timetableSnapshot.records || []);

  if (!formattedTimetable.length) {
    return res.status(404).json({
      success: false,
      message: 'No timetable found for your class',
      class: student.class,
      section: student.section,
    });
  }

  res.json({
    success: true,
    message: 'Timetable fetched successfully',
    studentName: student.fullName,
    class: student.class,
    section: student.section,
    academicYear: timetableSnapshot.academicYear || student.academicYear || DEFAULT_TIMETABLE_ACADEMIC_YEAR,
    note: timetableSnapshot.note || null,
    timetable: formattedTimetable,
  });
});

// @desc    Get all students
// @route   GET /api/students
// @access  Private (Admin, Teacher)
const getStudents = asyncHandler(async (req, res) => {
  await ensureStudentSqlReady();

  const {
    page = 1,
    limit = 10,
    search,
    class: classFilter,
    classId,
    section,
    sectionId,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query;

  const result = await getStudentList({
    page,
    limit,
    search,
    className: classFilter,
    sectionName: section,
    classId,
    sectionId,
    sortBy,
    sortOrder,
  });

  if (process.env.NODE_ENV !== 'production') {
    console.info('[students] GET /api/students', {
      source: result.sourceProcedure || 'sql',
      returned: result.students.length,
      total: result.total,
      page: result.page,
      limit: result.limit,
      search: search || null,
      classFilter: classFilter || null,
      classId: classId || null,
      section: section || null,
      sectionId: sectionId || null,
    });
  }

  res.json({
    success: true,
    students: result.students,
    availableClasses: result.availableClasses || [],
    pagination: {
      total: result.total,
      page: result.page,
      pages: Math.ceil(result.total / result.limit),
      limit: result.limit,
    },
  });
});

// @desc    Get all students without pagination
// @route   GET /api/students/all
// @access  Private (Admin, Teacher)
const getAllStudents = asyncHandler(async (req, res) => {
  await ensureStudentSqlReady();
  const students = await getAllStudentsFromSql();

  res.json({
    success: true,
    students,
  });
});

// @desc    Get single student
// @route   GET /api/students/:id
// @access  Private
const getStudent = asyncHandler(async (req, res) => {
  const studentId = parseStudentIdParam(req.params.id);
  if (!studentId) {
    return res.status(400).json({ message: 'Invalid student ID' });
  }

  const access = await resolveStudentSelfAccess(req, studentId);
  if (!access.allowed) {
    if (access.reason === 'missing_profile') {
      return res.status(404).json({ message: 'Student profile not found for the logged-in account.' });
    }

    return res.status(403).json({ message: 'You can only access your own student record.' });
  }

  await ensureStudentSqlReady();
  const student = access.studentProfile || await getStudentByIdFromSql(studentId);

  if (!student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  res.json({
    success: true,
    student,
  });
});

// @desc    Get current student details
// @route   GET /api/students/me/details
// @access  Private (Student)
const getCurrentStudentDetails = asyncHandler(async (req, res) => {
  const student = await getStudentByUserId(req.user);
  if (!student) {
    return res.json({
      success: true,
      ...buildProvisionalStudentDetailsPayload(req.user),
    });
  }

  const studentId = parseStudentIdParam(student?.dbId ?? student?._id ?? student?.id ?? student?.studentId);
  const payload = studentId
    ? await buildStudentDetailsPayload(studentId)
    : await buildMirrorStudentDetailsPayload(student);

  if (!payload) {
    return res.status(404).json({
      success: false,
      message: 'Student not found',
    });
  }

  res.json({
    success: true,
    ...payload,
  });
});

// @desc    List student portal profiles pending full setup
// @route   GET /api/students/portal-profiles
// @access  Private (Admin)
const getStudentPortalProfiles = asyncHandler(async (req, res) => {
  const profiles = await listStudentPortalProfiles({
    search: req.query.search,
    onlyPending: parseBooleanInput(req.query.onlyPending) !== false,
  });

  res.json({
    success: true,
    profiles,
  });
});

// @desc    Get single student portal profile
// @route   GET /api/students/portal-profiles/:profileId
// @access  Private (Admin)
const getStudentPortalProfile = asyncHandler(async (req, res) => {
  const profileId = parseStudentIdParam(req.params.profileId);
  if (!profileId) {
    return res.status(400).json({ message: 'Invalid portal profile ID' });
  }

  const profile = await getStudentPortalProfileById(profileId);
  if (!profile) {
    return res.status(404).json({ message: 'Student portal profile not found' });
  }

  res.json({
    success: true,
    profile,
  });
});

// @desc    Update student portal profile
// @route   PUT /api/students/portal-profiles/:profileId
// @access  Private (Admin)
const updateStudentPortalProfile = asyncHandler(async (req, res) => {
  const profileId = parseStudentIdParam(req.params.profileId);
  if (!profileId) {
    return res.status(400).json({ message: 'Invalid portal profile ID' });
  }

  const existingProfile = await getStudentPortalProfileById(profileId);
  if (!existingProfile) {
    return res.status(404).json({ message: 'Student portal profile not found' });
  }

  const normalizedPayload = normalizeStudentPortalProfilePayload(req.body);
  const updatedProfile = await updateStudentPortalProfileRecord(profileId, normalizedPayload);

  res.json({
    success: true,
    profile: updatedProfile,
  });
});

// @desc    Promote a student portal profile into a master student record
// @route   POST /api/students/portal-profiles/:profileId/promote
// @access  Private (Admin)
const promoteStudentPortalProfile = asyncHandler(async (req, res) => {
  const profileId = parseStudentIdParam(req.params.profileId);
  if (!profileId) {
    return res.status(400).json({ message: 'Invalid portal profile ID' });
  }

  const result = await promoteStudentPortalProfileToStudentRecord(profileId);
  if (!result?.profile) {
    return res.status(404).json({ message: 'Student portal profile not found' });
  }

  if (result.resultCode === 'already_linked') {
    return res.status(409).json({
      success: false,
      message: 'This student portal profile is already linked to a master student record.',
      profile: result.profile,
      student: result.student,
    });
  }

  res.status(201).json({
    success: true,
    message: 'Student portal profile promoted to a master student record.',
    profile: result.profile,
    student: result.student,
  });
});

// @desc    Get complete student details
// @route   GET /api/students/:id/details
// @access  Private (Admin, Teacher)
const getStudentDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const studentId = parseStudentIdParam(id);

  if (!studentId) {
    return res.status(400).json({
      success: false,
      message: 'Invalid student ID',
    });
  }

  const payload = await buildStudentDetailsPayload(studentId);

  if (!payload) {
    return res.status(404).json({
      success: false,
      message: 'Student not found',
    });
  }

  res.json({
    success: true,
    ...payload,
  });
});

// @desc    Create student
// @route   POST /api/students
// @access  Private (Admin)
const createStudent = asyncHandler(async (req, res) => {
  await ensureStudentSqlReady();

  const {
    fullName,
    email,
    phone,
    className: studentClass,
    sectionName: section,
    rollNumber,
    dateOfBirth,
    gender,
    address,
    guardianName,
    guardianPhone,
    bloodGroup,
    guardianRelation,
    password,
    academicYear,
    admissionDate,
    isActive,
  } = normalizeStudentPayload(req.body);

  if (!fullName || !email || !studentClass || !section || !rollNumber || !password) {
    return res.status(400).json({
      success: false,
      message: 'Full name, email, class, section, roll number, and password are required.',
    });
  }

  if (String(password).length < 8) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 8 characters long.',
    });
  }

  logStudentAuthDebug('create.duplicate-check', {
    email,
    role: 'student',
    query: 'getAuthUserByEmailRole',
  });

  const existingStudentUser = await getAuthUserByEmailRole(email, 'student');
  if (existingStudentUser) {
    return res.status(400).json({ message: DUPLICATE_ROLE_EMAIL_MESSAGE });
  }

  const existingRoll = await getStudentByRollNumber(rollNumber);
  if (existingRoll) {
    return res.status(400).json({ message: 'Roll number already exists' });
  }

  const authUser = await createAuthUser({
    fullName,
    email,
    passwordHash: String(password),
    role: 'student',
    phone,
    isActive: isActive !== false,
  });

  let studentResponse;
  try {
    studentResponse = await createStudentRecord({
      userId: authUser._id,
      fullName,
      email,
      phone,
      className: studentClass,
      sectionName: section,
      rollNumber,
      dateOfBirth,
      gender,
      address,
      guardianName,
      guardianPhone,
      guardianRelation,
      bloodGroup,
      admissionDate,
      academicYear,
      isActive: isActive !== false,
    });
  } catch (error) {
    if (isStudentContextValidationError(error)) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    throw error;
  }

  res.status(201).json({
    success: true,
    student: studentResponse,
  });
});

// @desc    Update student
// @route   PUT /api/students/:id
// @access  Private (Admin)
const updateStudent = asyncHandler(async (req, res) => {
  const studentId = parseStudentIdParam(req.params.id);
  if (!studentId) {
    return res.status(400).json({ message: 'Invalid student ID' });
  }

  const student = await getStudentByIdFromSql(studentId);

  if (!student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  const normalizedPayload = normalizeStudentPayload(req.body);
  const {
    fullName,
    email,
    phone,
    className: studentClass,
    sectionName: section,
    rollNumber,
    dateOfBirth,
    gender,
    address,
    guardianName,
    guardianPhone,
    guardianRelation,
    bloodGroup,
    admissionDate,
    academicYear,
    isActive,
  } = normalizedPayload;
  const normalizedIsActive = isActive;

  if (rollNumber && rollNumber !== student.rollNumber) {
    const existingRoll = await getStudentByRollNumber(rollNumber);
    if (existingRoll) {
      return res.status(400).json({ message: 'Roll number already exists' });
    }
  }

  const userId = student.userId?._id || student.userId || null;
  const nextFullName = fullName && String(fullName).trim() ? fullName : student.fullName;
  const nextEmail = email && String(email).trim() ? email : student.email;

  if (nextEmail && nextEmail !== student.email) {
    logStudentAuthDebug('update.duplicate-check', {
      email: nextEmail,
      role: 'student',
      query: 'getAuthUserByEmailRole',
      studentId,
    });

    const existingStudentUser = await getAuthUserByEmailRole(nextEmail, 'student');
    if (existingStudentUser && String(existingStudentUser._id) !== String(userId || '')) {
      return res.status(400).json({ message: DUPLICATE_ROLE_EMAIL_MESSAGE });
    }
  }

  let authUser = null;
  if (userId) {
    authUser = await updateAuthUser(userId, {
      fullName: nextFullName,
      email: nextEmail,
      phone: phone ?? student.phone,
      isActive: normalizedIsActive ?? student.isActive,
    });
  }

  let updatedStudent;
  try {
    updatedStudent = await updateStudentRecord(studentId, {
      userId,
      fullName: nextFullName,
      email: authUser?.email || nextEmail,
      phone: phone ?? student.phone,
      className: studentClass ?? student.class,
      sectionName: section ?? student.section,
      rollNumber: rollNumber ?? student.rollNumber,
      dateOfBirth: dateOfBirth !== undefined ? dateOfBirth || null : student.dateOfBirth,
      gender: gender !== undefined ? gender || null : student.gender,
      address: address !== undefined ? address || {} : student.address,
      guardianName: guardianName ?? student.guardianName,
      guardianPhone: guardianPhone ?? student.guardianPhone,
      guardianRelation: guardianRelation ?? student.guardianRelation,
      bloodGroup: bloodGroup ?? student.bloodGroup,
      admissionDate: admissionDate !== undefined ? admissionDate || null : student.admissionDate,
      academicYear: academicYear ?? student.academicYear,
      isActive: normalizedIsActive !== undefined ? normalizedIsActive : student.isActive,
    });
  } catch (error) {
    if (isStudentContextValidationError(error)) {
      return res.status(400).json({ message: error.message });
    }

    throw error;
  }

  res.json({
    success: true,
    student: updatedStudent,
  });
});

// @desc    Delete student
// @route   DELETE /api/students/:id
// @access  Private (Admin)
const deleteStudent = asyncHandler(async (req, res) => {
  const studentId = parseStudentIdParam(req.params.id);
  if (!studentId) {
    return res.status(400).json({ message: 'Invalid student ID' });
  }

  const student = await getStudentByIdFromSql(studentId);

  if (!student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  const userId = student.userId?._id || student.userId || null;
  if (userId) {
    await deleteAuthUser(userId);
  }
  await deleteStudentRecord(studentId);

  res.json({
    success: true,
    message: 'Student deleted successfully',
  });
});

// @desc    Get students by class
// @route   GET /api/students/class/:class
// @access  Private
const getStudentsByClass = asyncHandler(async (req, res) => {
  await ensureStudentSqlReady();
  const students = await getStudentsByClassFromSql(req.params.class);

  res.json({
    success: true,
    students,
  });
});

// @desc    Get student count
// @route   GET /api/students/count
// @access  Private
const getStudentCount = asyncHandler(async (req, res) => {
  await ensureStudentSqlReady();
  const count = await getStudentCountFromSql({ onlyActive: true });

  res.json({
    success: true,
    count,
  });
});

module.exports = {
  studentLogin,
  getStudentTimetable,
  getStudents,
  getAllStudents,
  getStudent,
  getCurrentStudentDetails,
  getStudentPortalProfiles,
  getStudentPortalProfile,
  getStudentDetails,
  createStudent,
  updateStudent,
  updateStudentPortalProfile,
  promoteStudentPortalProfile,
  deleteStudent,
  getStudentsByClass,
  getStudentCount,
};
