const { asyncHandler } = require('../middleware/errorMiddleware');
const {
  getExamList,
  getExamRecordById,
  createExamRecord,
  updateExamRecord,
  deleteExamRecord,
  enterExamMarks,
  getStudentExamResults,
  getExamReportData,
  loadOnlineExamPaperContext,
  saveOnlineExamPaper,
  startStudentOnlineExam,
  submitStudentOnlineExam,
} = require('../services/examSqlService');
const { getStudentByUserId } = require('../services/studentSqlService');
const {
  extractSubjectId,
  getTeacherAssignmentScope,
  paginateItems,
  doesTeacherOwnSubject,
  isTeacherAllowedForClassSection,
} = require('../services/teacherAssignmentService');

const parseStudentId = (value) => {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
};

const getRequestRole = (req) => String(req.user?.role || '').trim().toLowerCase();
const isTeacherRequest = (req) => getRequestRole(req) === 'teacher';

const getExamSubjectId = (exam = {}) => extractSubjectId(
  exam?.subjectId ??
  exam?.subject ??
  exam
);

const ensureTeacherOwnsSubject = async (req, subjectId) => {
  if (!isTeacherRequest(req)) {
    return true;
  }

  const scope = await getTeacherAssignmentScope({ teacherUserId: req.user?._id });
  return doesTeacherOwnSubject({ scope, subjectId });
};

const ensureTeacherOwnsExam = async (req, exam) => {
  if (!isTeacherRequest(req)) {
    return true;
  }

  const requestUserId = String(req.user?._id || '');
  const examCreatorId = String(exam?.createdBy?._id || exam?.createdBy || '');

  if (requestUserId && examCreatorId && requestUserId === examCreatorId) {
    return true;
  }

  const scope = await getTeacherAssignmentScope({ teacherUserId: req.user?._id });
  if (doesTeacherOwnSubject({ scope, subjectId: getExamSubjectId(exam) })) {
    return true;
  }

  return isTeacherAllowedForClassSection({
    scope,
    className: exam?.class || exam?.grade,
    sectionName: exam?.section,
  });
};

// @desc    Get all exams
// @route   GET /api/exams
// @access  Private
const getExams = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const filters = {
    className: req.query.class || req.query.grade,
    subjectId: req.query.subject,
    date: req.query.date,
  };

  if (isTeacherRequest(req)) {
    const scope = await getTeacherAssignmentScope({ teacherUserId: req.user?._id });
    const teacherSubjectId = filters.subjectId ? extractSubjectId(filters.subjectId) : '';

    if (teacherSubjectId && !doesTeacherOwnSubject({ scope, subjectId: teacherSubjectId })) {
      return res.json({
        success: true,
        exams: [],
        pagination: {
          total: 0,
          page,
          pages: 0,
        },
      });
    }

    const result = await getExamList({
      ...filters,
      page: 1,
      limit: 5000,
    });
    const teacherExams = (result.exams || []).filter((exam) =>
      doesTeacherOwnSubject({ scope, subjectId: getExamSubjectId(exam) })
    );
    const paginated = paginateItems(teacherExams, page, limit);

    return res.json({
      success: true,
      exams: paginated.items,
      pagination: {
        total: paginated.total,
        page,
        pages: Math.ceil(paginated.total / limit),
      },
    });
  }

  const { exams, total } = await getExamList({
    ...filters,
    page,
    limit,
  });

  res.json({
    success: true,
    exams,
    pagination: {
      total,
      page,
      pages: Math.ceil(total / limit),
    },
  });
});

// @desc    Get single exam
// @route   GET /api/exams/:id
// @access  Private
const getExam = asyncHandler(async (req, res) => {
  const examBundle = await getExamRecordById(req.params.id);

  if (!examBundle?.exam) {
    return res.status(404).json({ message: 'Exam not found' });
  }

  if (!(await ensureTeacherOwnsExam(req, examBundle.exam))) {
    return res.status(403).json({ message: 'Not authorized to access this exam' });
  }

  res.json({
    success: true,
    exam: examBundle.exam,
    grades: examBundle.grades,
  });
});

// @desc    Create exam
// @route   POST /api/exams
// @access  Private (Admin, Teacher)
const createExam = asyncHandler(async (req, res) => {
  if (!(await ensureTeacherOwnsSubject(req, req.body.subject))) {
    return res.status(403).json({ message: 'Teachers can only create exams for their assigned subjects' });
  }

  const result = await createExamRecord(req.body, req.user._id);

  if (result?.errorCode === 'subject_not_found') {
    return res.status(404).json({ message: 'Subject not found' });
  }

  if (result?.errorCode === 'invalid_payload') {
    return res.status(400).json({ message: 'Please provide valid exam details' });
  }

  res.status(201).json({
    success: true,
    exam: result.exam,
  });
});

// @desc    Update exam
// @route   PUT /api/exams/:id
// @access  Private (Admin, Teacher)
const updateExam = asyncHandler(async (req, res) => {
  const existingExamBundle = await getExamRecordById(req.params.id);
  if (!existingExamBundle?.exam) {
    return res.status(404).json({ message: 'Exam not found' });
  }

  if (!(await ensureTeacherOwnsExam(req, existingExamBundle.exam))) {
    return res.status(403).json({ message: 'Not authorized to update this exam' });
  }

  if (req.body.subject && !(await ensureTeacherOwnsSubject(req, req.body.subject))) {
    return res.status(403).json({ message: 'Teachers can only assign their own subjects to exams' });
  }

  const result = await updateExamRecord(req.params.id, req.body);

  if (result?.errorCode === 'not_found') {
    return res.status(404).json({ message: 'Exam not found' });
  }

  if (result?.errorCode === 'subject_not_found') {
    return res.status(404).json({ message: 'Subject not found' });
  }

  if (result?.errorCode === 'invalid_payload') {
    return res.status(400).json({ message: 'Please provide valid exam details' });
  }

  res.json({
    success: true,
    exam: result.exam,
  });
});

// @desc    Delete exam
// @route   DELETE /api/exams/:id
// @access  Private (Admin)
const deleteExam = asyncHandler(async (req, res) => {
  const { resultCode } = await deleteExamRecord(req.params.id);

  if (resultCode === 'not_found') {
    return res.status(404).json({ message: 'Exam not found' });
  }

  res.json({
    success: true,
    message: 'Exam deleted',
  });
});

// @desc    Enter marks
// @route   POST /api/exams/:id/marks
// @access  Private (Admin, Teacher)
const enterMarks = asyncHandler(async (req, res) => {
  const { marks } = req.body;

  if (!marks || !Array.isArray(marks)) {
    return res.status(400).json({ message: 'Please provide marks array' });
  }

  const examBundle = await getExamRecordById(req.params.id);
  if (!examBundle?.exam) {
    return res.status(404).json({ message: 'Exam not found' });
  }

  if (!(await ensureTeacherOwnsExam(req, examBundle.exam))) {
    return res.status(403).json({ message: 'Not authorized to enter marks for this exam' });
  }

  const result = await enterExamMarks({
    examId: req.params.id,
    marks,
    enteredByUserId: req.user._id,
  });

  if (result?.errorCode === 'exam_not_found') {
    return res.status(404).json({ message: 'Exam not found' });
  }

  res.status(201).json({
    success: true,
    entered: result.entered,
    errors: result.errors.length > 0 ? result.errors : undefined,
    grades: result.grades,
  });
});

// @desc    Get student results
// @route   GET /api/exams/results/:studentId
// @access  Private
const getStudentResults = asyncHandler(async (req, res) => {
  const requestedStudentId = parseStudentId(req.params.studentId);

  if (!requestedStudentId) {
    return res.status(400).json({ message: 'Invalid student ID' });
  }

  if (getRequestRole(req) === 'student') {
    const studentProfile = await getStudentByUserId(req.user);
    const ownStudentId = parseStudentId(studentProfile?._id ?? studentProfile?.id ?? studentProfile?.studentId);

    if (!ownStudentId) {
      return res.status(404).json({ message: 'Student profile not found' });
    }

    if (ownStudentId !== requestedStudentId) {
      return res.status(403).json({ message: 'Not authorized to view other student exam results' });
    }
  }

  const result = await getStudentExamResults({
    studentId: requestedStudentId,
    examId: req.query.examId,
    className: req.query.class || req.query.grade,
  });

  res.json({
    success: true,
    grades: result.grades,
    stats: result.stats,
  });
});

// @desc    Generate class report
// @route   GET /api/exams/report/:examId
// @access  Private
const getExamReport = asyncHandler(async (req, res) => {
  const report = await getExamReportData(req.params.examId);

  if (!report) {
    return res.status(404).json({ message: 'Exam not found' });
  }

  if (!(await ensureTeacherOwnsExam(req, report.exam))) {
    return res.status(403).json({ message: 'Not authorized to access this exam report' });
  }

  res.json({
    success: true,
    exam: report.exam,
    grades: report.grades,
    statistics: report.statistics,
    meritList: report.meritList,
    topStudents: report.topStudents,
  });
});

// @desc    Get online exam paper for admin/teacher management
// @route   GET /api/exams/:id/paper
// @access  Private (Admin, Teacher)
const getExamPaper = asyncHandler(async (req, res) => {
  const result = await loadOnlineExamPaperContext({
    examId: req.params.id,
    includeAnswerKey: true,
  });

  if (result?.errorCode === 'exam_not_found') {
    return res.status(404).json({ message: 'Exam not found' });
  }

  if (result?.errorCode === 'exam_subject_not_found') {
    return res.status(404).json({ message: 'Exam subject not found' });
  }

  if (!(await ensureTeacherOwnsExam(req, result.exam))) {
    return res.status(403).json({ message: 'Not authorized to access this exam paper' });
  }

  res.json({
    success: true,
    exam: result.exam,
    paper: result.paper,
    questions: result.questions,
  });
});

// @desc    Create or update online exam paper
// @route   PUT /api/exams/:id/paper
// @access  Private (Admin, Teacher)
const updateExamPaper = asyncHandler(async (req, res) => {
  const examBundle = await getExamRecordById(req.params.id);
  if (!examBundle?.exam) {
    return res.status(404).json({ message: 'Exam not found' });
  }

  if (!(await ensureTeacherOwnsExam(req, examBundle.exam))) {
    return res.status(403).json({ message: 'Not authorized to update this exam paper' });
  }

  const result = await saveOnlineExamPaper({
    examId: req.params.id,
    title: req.body.title,
    instructions: req.body.instructions,
    durationMinutes: req.body.durationMinutes,
    allowInstantResult: req.body.allowInstantResult,
    questions: req.body.questions,
    updatedByUserId: req.user._id,
  });

  if (result?.errorCode === 'exam_not_found') {
    return res.status(404).json({ message: 'Exam not found' });
  }

  if (result?.errorCode === 'exam_subject_not_found') {
    return res.status(404).json({ message: 'Exam subject not found' });
  }

  if (result?.errorCode === 'invalid_questions') {
    return res.status(400).json({ message: 'Please provide at least one valid question with an answer key.' });
  }

  if (result?.errorCode === 'paper_locked') {
    return res.status(409).json({ message: 'This exam paper is already in use and can no longer be changed.' });
  }

  res.json({
    success: true,
    message: 'Online exam paper saved successfully.',
    exam: result.exam,
    paper: result.paper,
    questions: result.questions,
  });
});

// @desc    Start online exam session for student
// @route   POST /api/exams/:id/online-session/start
// @access  Private (Student)
const startOnlineExamSession = asyncHandler(async (req, res) => {
  const studentProfile = await getStudentByUserId(req.user);
  const studentId = parseStudentId(studentProfile?._id ?? studentProfile?.id ?? studentProfile?.studentId);

  if (!studentId) {
    return res.status(404).json({ message: 'Student profile not found' });
  }

  const result = await startStudentOnlineExam({
    examId: req.params.id,
    studentId,
  });

  if (result?.errorCode === 'exam_not_found') {
    return res.status(404).json({ message: 'Exam not found' });
  }

  if (result?.errorCode === 'paper_not_ready') {
    return res.status(404).json({ message: 'Online exam paper is not ready for this exam yet.' });
  }

  if (result?.errorCode === 'student_not_found') {
    return res.status(404).json({ message: 'Student profile not found' });
  }

  if (result?.errorCode === 'forbidden') {
    return res.status(403).json({ message: 'This online test is not assigned to the logged-in student.' });
  }

  if (result?.errorCode === 'not_started') {
    return res.status(400).json({ message: 'This online test is not open yet.' });
  }

  if (result?.errorCode === 'expired') {
    return res.status(400).json({ message: 'This online test window has already closed.' });
  }

  if (result?.resultCode === 'already_submitted') {
    return res.json({
      success: true,
      alreadySubmitted: true,
      exam: result.exam,
      paper: result.paper,
      attempt: result.attempt,
      breakdown: result.breakdown,
    });
  }

  res.json({
    success: true,
    exam: result.exam,
    paper: result.paper,
    attempt: result.attempt,
    questions: result.questions,
  });
});

// @desc    Submit online exam answers for student
// @route   POST /api/exams/:id/online-session/submit
// @access  Private (Student)
const submitOnlineExamSession = asyncHandler(async (req, res) => {
  const studentProfile = await getStudentByUserId(req.user);
  const studentId = parseStudentId(studentProfile?._id ?? studentProfile?.id ?? studentProfile?.studentId);

  if (!studentId) {
    return res.status(404).json({ message: 'Student profile not found' });
  }

  const result = await submitStudentOnlineExam({
    examId: req.params.id,
    studentId,
    answers: req.body.answers,
  });

  if (result?.errorCode === 'exam_not_found') {
    return res.status(404).json({ message: 'Exam not found' });
  }

  if (result?.errorCode === 'paper_not_ready') {
    return res.status(404).json({ message: 'Online exam paper is not ready for this exam yet.' });
  }

  if (result?.errorCode === 'student_not_found') {
    return res.status(404).json({ message: 'Student profile not found' });
  }

  if (result?.resultCode === 'already_submitted') {
    return res.json({
      success: true,
      alreadySubmitted: true,
      exam: result.exam,
      paper: result.paper,
      attempt: result.attempt,
      breakdown: result.breakdown,
    });
  }

  res.json({
    success: true,
    message: 'Online test submitted and graded successfully.',
    exam: result.exam,
    paper: result.paper,
    attempt: result.attempt,
    breakdown: result.breakdown,
  });
});

module.exports = {
  getExams,
  getExam,
  createExam,
  updateExam,
  deleteExam,
  enterMarks,
  getStudentResults,
  getExamReport,
  getExamPaper,
  updateExamPaper,
  startOnlineExamSession,
  submitOnlineExamSession,
};
