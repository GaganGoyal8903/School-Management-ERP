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
} = require('../services/examSqlService');

// @desc    Get all exams
// @route   GET /api/exams
// @access  Private
const getExams = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const { exams, total } = await getExamList({
    className: req.query.class || req.query.grade,
    subjectId: req.query.subject,
    date: req.query.date,
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
  const result = await getStudentExamResults({
    studentId: req.params.studentId,
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

  res.json({
    success: true,
    exam: report.exam,
    grades: report.grades,
    statistics: report.statistics,
    meritList: report.meritList,
    topStudents: report.topStudents,
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
};
