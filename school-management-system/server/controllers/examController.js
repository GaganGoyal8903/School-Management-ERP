const Exam = require('../models/Exam');
const Grade = require('../models/Grade');
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const { asyncHandler } = require('../middleware/errorMiddleware');

// @desc    Get all exams
// @route   GET /api/exams
// @access  Private
const getExams = asyncHandler(async (req, res) => {
  const { class: classFilter, subject, date, page = 1, limit = 10 } = req.query;

  let query = {};

  if (classFilter) {
    query.class = classFilter;
  }

  if (subject) {
    query.subject = subject;
  }

  if (date) {
    const dateObj = new Date(date);
    const nextDay = new Date(dateObj);
    nextDay.setDate(nextDay.getDate() + 1);
    query.examDate = { $gte: dateObj, $lt: nextDay };
  }

  const total = await Exam.countDocuments(query);

  const exams = await Exam.find(query)
    .populate('subject', 'name')
    .populate('createdBy', 'fullName')
    .sort({ examDate: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  res.json({
    success: true,
    exams,
    pagination: {
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit)
    }
  });
});

// @desc    Get single exam
// @route   GET /api/exams/:id
// @access  Private
const getExam = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id)
    .populate('subject', 'name')
    .populate('createdBy', 'fullName');

  if (!exam) {
    return res.status(404).json({ message: 'Exam not found' });
  }

  // Get grades for this exam
  const grades = await Grade.find({ examId: exam._id })
    .populate('studentId', 'fullName rollNumber');

  res.json({
    success: true,
    exam,
    grades
  });
});

// @desc    Create exam
// @route   POST /api/exams
// @access  Private (Admin, Teacher)
const createExam = asyncHandler(async (req, res) => {
  const {
    name,
    subject,
    class: studentClass,
    section,
    examDate,
    startTime,
    endTime,
    totalMarks,
    passingMarks,
    instructions
  } = req.body;

  const exam = await Exam.create({
    name,
    subject,
    class: studentClass,
    section,
    examDate,
    startTime,
    endTime,
    totalMarks,
    passingMarks,
    instructions,
    createdBy: req.user._id
  });

  await exam.populate('subject', 'name');

  res.status(201).json({
    success: true,
    exam
  });
});

// @desc    Update exam
// @route   PUT /api/exams/:id
// @access  Private (Admin, Teacher)
const updateExam = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id);

  if (!exam) {
    return res.status(404).json({ message: 'Exam not found' });
  }

  const updatedExam = await Exam.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  ).populate('subject', 'name');

  res.json({
    success: true,
    exam: updatedExam
  });
});

// @desc    Delete exam
// @route   DELETE /api/exams/:id
// @access  Private (Admin)
const deleteExam = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.id);

  if (!exam) {
    return res.status(404).json({ message: 'Exam not found' });
  }

  // Delete associated grades
  await Grade.deleteMany({ examId: exam._id });

  await exam.deleteOne();

  res.json({
    success: true,
    message: 'Exam deleted'
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

  const exam = await Exam.findById(req.params.id);

  if (!exam) {
    return res.status(404).json({ message: 'Exam not found' });
  }

  const results = [];
  const errors = [];

  for (const record of marks) {
    try {
      const student = await Student.findById(record.studentId);
      if (!student) {
        errors.push({ studentId: record.studentId, message: 'Student not found' });
        continue;
      }

      // Calculate grade
      const percentage = (record.marksObtained / exam.totalMarks) * 100;
      let grade = '';
      if (percentage >= 90) grade = 'A+';
      else if (percentage >= 80) grade = 'A';
      else if (percentage >= 70) grade = 'B+';
      else if (percentage >= 60) grade = 'B';
      else if (percentage >= 50) grade = 'C+';
      else if (percentage >= 40) grade = 'C';
      else if (percentage >= 30) grade = 'D';
      else grade = 'F';

      // Check if marks already entered
      const existingGrade = await Grade.findOne({
        studentId: record.studentId,
        examId: exam._id
      });

      if (existingGrade) {
        existingGrade.marksObtained = record.marksObtained;
        existingGrade.grade = grade;
        existingGrade.remarks = record.remarks;
        existingGrade.enteredBy = req.user._id;
        await existingGrade.save();
        results.push(existingGrade);
      } else {
        const newGrade = await Grade.create({
          studentId: record.studentId,
          examId: exam._id,
          subjectId: exam.subject,
          marksObtained: record.marksObtained,
          totalMarks: exam.totalMarks,
          grade,
          remarks: record.remarks,
          enteredBy: req.user._id,
          class: exam.class,
          section: exam.section
        });
        results.push(newGrade);
      }
    } catch (error) {
      errors.push({ studentId: record.studentId, message: error.message });
    }
  }

  res.status(201).json({
    success: true,
    entered: results.length,
    errors: errors.length > 0 ? errors : undefined,
    grades: results
  });
});

// @desc    Get student results
// @route   GET /api/exams/results/:studentId
// @access  Private
const getStudentResults = asyncHandler(async (req, res) => {
  const { examId, class: classFilter } = req.query;

  let query = { studentId: req.params.studentId };

  if (examId) {
    query.examId = examId;
  }

  if (classFilter) {
    query.class = classFilter;
  }

  const grades = await Grade.find(query)
    .populate('examId', 'name examDate totalMarks')
    .populate('subjectId', 'name')
    .sort({ createdAt: -1 });

  // Calculate stats
  let totalMarks = 0;
  let totalObtained = 0;

  grades.forEach(g => {
    totalMarks += g.totalMarks;
    totalObtained += g.marksObtained;
  });

  const average = grades.length > 0 ? (totalObtained / totalMarks * 100).toFixed(2) : 0;

  res.json({
    success: true,
    grades,
    stats: {
      totalExams: grades.length,
      totalMarks,
      totalObtained,
      average
    }
  });
});

// @desc    Generate class report
// @route   GET /api/exams/report/:examId
// @access  Private
const getExamReport = asyncHandler(async (req, res) => {
  const exam = await Exam.findById(req.params.examId)
    .populate('subject', 'name');

  if (!exam) {
    return res.status(404).json({ message: 'Exam not found' });
  }

  const grades = await Grade.find({ examId: exam._id })
    .populate('studentId', 'fullName rollNumber');

  // Calculate statistics
  const marks = grades.map(g => g.marksObtained);
  const totalMarks = marks.reduce((a, b) => a + b, 0);
  const average = marks.length > 0 ? (totalMarks / marks.length).toFixed(2) : 0;
  const highest = marks.length > 0 ? Math.max(...marks) : 0;
  const lowest = marks.length > 0 ? Math.min(...marks) : 0;
  const passed = grades.filter(g => g.marksObtained >= exam.passingMarks).length;
  const passPercentage = marks.length > 0 ? ((passed / marks.length) * 100).toFixed(2) : 0;

  // Grade distribution
  const gradeDistribution = {
    'A+': grades.filter(g => g.grade === 'A+').length,
    'A': grades.filter(g => g.grade === 'A').length,
    'B+': grades.filter(g => g.grade === 'B+').length,
    'B': grades.filter(g => g.grade === 'B').length,
    'C+': grades.filter(g => g.grade === 'C+').length,
    'C': grades.filter(g => g.grade === 'C').length,
    'D': grades.filter(g => g.grade === 'D').length,
    'F': grades.filter(g => g.grade === 'F').length
  };

  res.json({
    success: true,
    exam,
    grades,
    statistics: {
      totalStudents: marks.length,
      average,
      highest,
      lowest,
      passed,
      passPercentage,
      gradeDistribution
    }
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
  getExamReport
};

