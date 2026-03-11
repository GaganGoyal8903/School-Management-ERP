const Homework = require('../models/Homework');
const HomeworkSubmission = require('../models/HomeworkSubmission');
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const { asyncHandler } = require('../middleware/errorMiddleware');

// @desc    Get all homework
// @route   GET /api/homework
// @access  Private (Teacher/Admin)
const getHomework = asyncHandler(async (req, res) => {
  const { class: classFilter, subject, status } = req.query;
  
  let query = {};
  
  if (classFilter) query.class = classFilter;
  if (subject) query.subject = subject;

  const homework = await Homework.find(query)
    .populate('subject', 'name')
    .populate('assignedBy', 'fullName')
    .sort({ dueDate: -1 });

  res.json({
    success: true,
    homework
  });
});

// @desc    Get homework for a specific class
// @route   GET /api/homework/class/:class
// @access  Private
const getHomeworkByClass = asyncHandler(async (req, res) => {
  const { class: className } = req.params;
  const { section } = req.query;
  
  let query = { class: className, isActive: true };
  if (section) query.section = section;

  const homework = await Homework.find(query)
    .populate('subject', 'name')
    .populate('assignedBy', 'fullName')
    .sort({ dueDate: 1 });

  // Get submissions for students in this class
  const students = await Student.find({ class: className, section });
  const studentIds = students.map(s => s._id);
  
  const submissions = await HomeworkSubmission.find({
    studentId: { $in: studentIds }
  });

  // Map submissions to homework
  const homeworkWithStats = homework.map(hw => {
    const classSubmissions = submissions.filter(s => s.homeworkId.toString() === hw._id.toString());
    return {
      ...hw.toObject(),
      totalStudents: students.length,
      submitted: classSubmissions.length,
      pending: students.length - classSubmissions.length
    };
  });

  res.json({
    success: true,
    homework: homeworkWithStats
  });
});

// @desc    Get homework for student
// @route   GET /api/homework/student/:studentId
// @access  Private (Parent/Student)
const getHomeworkByStudent = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  
  const student = await Student.findById(studentId);
  if (!student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  const homework = await Homework.find({ 
    class: student.class,
    isActive: true 
  })
    .populate('subject', 'name')
    .populate('assignedBy', 'fullName')
    .sort({ dueDate: 1 });

  // Get submissions for this student
  const submissions = await HomeworkSubmission.find({ studentId });

  // Map submissions to homework
  const homeworkWithSubmission = homework.map(hw => {
    const submission = submissions.find(s => s.homeworkId.toString() === hw._id.toString());
    return {
      ...hw.toObject(),
      submission: submission || null,
      status: submission ? submission.status : 'not submitted',
      marksObtained: submission?.marksObtained || null
    };
  });

  res.json({
    success: true,
    homework: homeworkWithSubmission
  });
});

// @desc    Create homework
// @route   POST /api/homework
// @access  Private (Teacher/Admin)
const createHomework = asyncHandler(async (req, res) => {
  const { title, description, subject, class: studentClass, section, dueDate, attachmentUrl, attachmentName, totalMarks } = req.body;

  const homework = await Homework.create({
    title,
    description,
    subject,
    class: studentClass,
    section,
    assignedBy: req.user._id,
    dueDate,
    attachmentUrl,
    attachmentName,
    totalMarks
  });

  const populatedHomework = await Homework.findById(homework._id)
    .populate('subject', 'name')
    .populate('assignedBy', 'fullName');

  res.status(201).json({
    success: true,
    homework: populatedHomework
  });
});

// @desc    Update homework
// @route   PUT /api/homework/:id
// @access  Private (Teacher/Admin)
const updateHomework = asyncHandler(async (req, res) => {
  const { title, description, subject, class: studentClass, section, dueDate, attachmentUrl, attachmentName, totalMarks, isActive } = req.body;

  const homework = await Homework.findById(req.params.id);

  if (!homework) {
    return res.status(404).json({ message: 'Homework not found' });
  }

  homework.title = title || homework.title;
  homework.description = description || homework.description;
  homework.subject = subject || homework.subject;
  homework.class = studentClass || homework.class;
  homework.section = section || homework.section;
  homework.dueDate = dueDate || homework.dueDate;
  homework.attachmentUrl = attachmentUrl || homework.attachmentUrl;
  homework.attachmentName = attachmentName || homework.attachmentName;
  homework.totalMarks = totalMarks || homework.totalMarks;
  homework.isActive = isActive !== undefined ? isActive : homework.isActive;

  await homework.save();

  const populatedHomework = await Homework.findById(homework._id)
    .populate('subject', 'name')
    .populate('assignedBy', 'fullName');

  res.json({
    success: true,
    homework: populatedHomework
  });
});

// @desc    Delete homework
// @route   DELETE /api/homework/:id
// @access  Private (Admin)
const deleteHomework = asyncHandler(async (req, res) => {
  const homework = await Homework.findById(req.params.id);

  if (!homework) {
    return res.status(404).json({ message: 'Homework not found' });
  }

  // Delete all submissions for this homework
  await HomeworkSubmission.deleteMany({ homeworkId: req.params.id });
  await Homework.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
    message: 'Homework deleted'
  });
});

// @desc    Submit homework
// @route   POST /api/homework/:id/submit
// @access  Private (Student)
const submitHomework = asyncHandler(async (req, res) => {
  const { submissionText, attachmentUrl, attachmentName } = req.body;
  
  const homework = await Homework.findById(req.params.id);

  if (!homework) {
    return res.status(404).json({ message: 'Homework not found' });
  }

  // Check if already submitted
  const existingSubmission = await HomeworkSubmission.findOne({
    homeworkId: req.params.id,
    studentId: req.body.studentId
  });

  if (existingSubmission) {
    return res.status(400).json({ message: 'Homework already submitted' });
  }

  // Check if late
  const isLate = new Date() > new Date(homework.dueDate);

  const submission = await HomeworkSubmission.create({
    homeworkId: req.params.id,
    studentId: req.body.studentId,
    submissionText,
    attachmentUrl,
    attachmentName,
    status: isLate ? 'late' : 'submitted'
  });

  res.status(201).json({
    success: true,
    submission
  });
});

// @desc    Grade homework submission
// @route   PUT /api/homework/submission/:id/grade
// @access  Private (Teacher)
const gradeSubmission = asyncHandler(async (req, res) => {
  const { marksObtained, feedback } = req.body;

  const submission = await HomeworkSubmission.findById(req.params.id);

  if (!submission) {
    return res.status(404).json({ message: 'Submission not found' });
  }

  submission.marksObtained = marksObtained;
  submission.feedback = feedback;
  submission.status = 'graded';
  submission.gradedBy = req.user._id;
  submission.gradedAt = new Date();

  await submission.save();

  res.json({
    success: true,
    submission
  });
});

// @desc    Get homework submissions
// @route   GET /api/homework/:id/submissions
// @access  Private (Teacher)
const getSubmissions = asyncHandler(async (req, res) => {
  const submissions = await HomeworkSubmission.find({ homeworkId: req.params.id })
    .populate('studentId', 'fullName rollNumber class section')
    .populate('gradedBy', 'fullName')
    .sort({ submittedAt: -1 });

  res.json({
    success: true,
    submissions
  });
});

module.exports = {
  getHomework,
  getHomeworkByClass,
  getHomeworkByStudent,
  createHomework,
  updateHomework,
  deleteHomework,
  submitHomework,
  gradeSubmission,
  getSubmissions
};

