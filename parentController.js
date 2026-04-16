const Parent = require('../models/Parent');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const Grade = require('../models/Grade');
const Homework = require('../models/Homework');
const HomeworkSubmission = require('../models/HomeworkSubmission');
const Exam = require('../models/Exam');
const Notice = require('../models/Notice');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { generateToken } = require('../middleware/authMiddleware');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// @desc    Get parent profile
// @route   GET /api/parents/profile
// @access  Private (Parent)
const getParentProfile = asyncHandler(async (req, res) => {
  const parent = await Parent.findOne({ userId: req.user._id })
    .populate('childId', 'fullName email phone class section rollNumber');
  
  if (!parent) {
    return res.status(404).json({ message: 'Parent profile not found' });
  }

  res.json({
    success: true,
    parent
  });
});

// @desc    Get parent's child info
// @route   GET /api/parents/child
// @access  Private (Parent)
const getChildInfo = asyncHandler(async (req, res) => {
  const parent = await Parent.findOne({ userId: req.user._id });
  
  if (!parent) {
    return res.status(404).json({ message: 'Parent profile not found' });
  }

  const student = await Student.findById(parent.childId)
    .populate('userId', 'email');
  
  if (!student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  res.json({
    success: true,
    student
  });
});

// @desc    Get child's attendance
// @route   GET /api/parents/attendance
// @access  Private (Parent)
const getChildAttendance = asyncHandler(async (req, res) => {
  const parent = await Parent.findOne({ userId: req.user._id });
  
  if (!parent) {
    return res.status(404).json({ message: 'Parent profile not found' });
  }

  const { month, year } = req.query;
  
  let query = { studentId: parent.childId };
  
  if (month && year) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    query.date = { $gte: startDate, $lte: endDate };
  }

  const attendance = await Attendance.find(query)
    .populate('markedBy', 'fullName')
    .sort({ date: -1 });

  // Calculate statistics
  const total = attendance.length;
  const present = attendance.filter(a => a.status === 'Present').length;
  const absent = attendance.filter(a => a.status === 'Absent').length;
  const late = attendance.filter(a => a.status === 'Late').length;
  const percentage = total > 0 ? ((present / total) * 100).toFixed(1) : 0;

  res.json({
    success: true,
    attendance,
    stats: {
      total,
      present,
      absent,
      late,
      percentage
    }
  });
});

// @desc    Get child's grades/marks
// @route   GET /api/parents/grades
// @access  Private (Parent)
const getChildGrades = asyncHandler(async (req, res) => {
  const parent = await Parent.findOne({ userId: req.user._id });
  
  if (!parent) {
    return res.status(404).json({ message: 'Parent profile not found' });
  }

  const grades = await Grade.find({ studentId: parent.childId })
    .populate('subjectId', 'name')
    .populate('examId', 'name examDate')
    .sort({ createdAt: -1 });

  // Calculate average
  const totalMarks = grades.reduce((sum, g) => sum + (g.marksObtained || 0), 0);
  const average = grades.length > 0 ? (totalMarks / grades.length).toFixed(1) : 0;

  // Group by subject
  const bySubject = grades.reduce((acc, grade) => {
    const subjectName = grade.subjectId?.name || 'Unknown';
    if (!acc[subjectName]) {
      acc[subjectName] = [];
    }
    acc[subjectName].push(grade);
    return acc;
  }, {});

  res.json({
    success: true,
    grades,
    bySubject,
    average,
    totalExams: grades.length
  });
});

// @desc    Get child's homework
// @route   GET /api/parents/homework
// @access  Private (Parent)
const getChildHomework = asyncHandler(async (req, res) => {
  const parent = await Parent.findOne({ userId: req.user._id });
  
  if (!parent) {
    return res.status(404).json({ message: 'Parent profile not found' });
  }

  const student = await Student.findById(parent.childId);
  
  const homework = await Homework.find({ 
    class: student.class,
    isActive: true 
  })
    .populate('subject', 'name')
    .populate('assignedBy', 'fullName')
    .sort({ dueDate: 1 });

  // Get submissions for child's homework
  const submissions = await HomeworkSubmission.find({ 
    studentId: parent.childId 
  });

  // Map submissions to homework
  const homeworkWithSubmission = homework.map(hw => {
    const submission = submissions.find(s => s.homeworkId.toString() === hw._id.toString());
    return {
      ...hw.toObject(),
      submission: submission || null,
      isSubmitted: !!submission,
      isOverdue: !submission && new Date(hw.dueDate) < new Date()
    };
  });

  res.json({
    success: true,
    homework: homeworkWithSubmission,
    pending: homeworkWithSubmission.filter(hw => !hw.isSubmitted).length,
    submitted: homeworkWithSubmission.filter(hw => hw.isSubmitted).length
  });
});

// @desc    Get upcoming exams for child
// @route   GET /api/parents/exams
// @access  Private (Parent)
const getChildExams = asyncHandler(async (req, res) => {
  const parent = await Parent.findOne({ userId: req.user._id });
  
  if (!parent) {
    return res.status(404).json({ message: 'Parent profile not found' });
  }

  const student = await Student.findById(parent.childId);
  
  const exams = await Exam.find({ 
    class: student.class,
    examDate: { $gte: new Date() }
  })
    .populate('subjectId', 'name')
    .sort({ examDate: 1 });

  // Get results for completed exams
  const grades = await Grade.find({ studentId: parent.childId });
  const examResults = grades.map(g => g.examId?.toString());

  const upcomingExams = exams.filter(e => !examResults.includes(e._id.toString()));
  const completedExams = exams.filter(e => examResults.includes(e._id.toString()));

  res.json({
    success: true,
    upcomingExams,
    completedExams,
    results: grades
  });
});

// @desc    Get announcements
// @route   GET /api/parents/announcements
// @access  Private (Parent)
const getAnnouncements = asyncHandler(async (req, res) => {
  const notices = await Notice.find({ 
    isActive: true 
  })
    .populate('postedBy', 'fullName')
    .sort({ createdAt: -1 })
    .limit(20);

  res.json({
    success: true,
    announcements: notices
  });
});

// @desc    Get parent dashboard stats
// @route   GET /api/parents/dashboard
// @access  Private (Parent)
const getParentDashboard = asyncHandler(async (req, res) => {
  const parent = await Parent.findOne({ userId: req.user._id });
  
  if (!parent) {
    return res.status(404).json({ message: 'Parent profile not found' });
  }

  const student = await Student.findById(parent.childId);
  
  // Get attendance stats
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const recentAttendance = await Attendance.find({
    studentId: parent.childId,
    date: { $gte: thirtyDaysAgo }
  });
  
  const present = recentAttendance.filter(a => a.status === 'Present').length;
  const total = recentAttendance.length;
  const attendancePercentage = total > 0 ? ((present / total) * 100).toFixed(1) : 0;

  // Get recent grades
  const recentGrades = await Grade.find({ studentId: parent.childId })
    .populate('subjectId', 'name')
    .sort({ createdAt: -1 })
    .limit(5);

  const avgMarks = recentGrades.length > 0 
    ? (recentGrades.reduce((sum, g) => sum + g.marksObtained, 0) / recentGrades.length).toFixed(1)
    : 0;

  // Get upcoming homework
  const homework = await Homework.find({
    class: student.class,
    dueDate: { $gte: new Date() },
    isActive: true
  })
    .populate('subject', 'name')
    .sort({ dueDate: 1 })
    .limit(5);

  // Get upcoming exams
  const upcomingExams = await Exam.find({
    class: student.class,
    examDate: { $gte: new Date() }
  })
    .populate('subjectId', 'name')
    .sort({ examDate: 1 })
    .limit(5);

  // Get unread messages count
  const Message = require('../models/Message');
  const unreadMessages = await Message.countDocuments({
    receiverId: req.user._id,
    isRead: false
  });

  res.json({
    success: true,
    child: {
      name: student.fullName,
      class: student.class,
      section: student.section,
      rollNumber: student.rollNumber
    },
    stats: {
      attendancePercentage,
      recentAttendance: present,
      totalDays: total,
      avgMarks,
      totalGrades: recentGrades.length,
      pendingHomework: homework.length,
      upcomingExams: upcomingExams.length,
      unreadMessages
    },
    recentGrades,
    upcomingHomework: homework,
    upcomingExams
  });
});

// @desc    Create parent profile
// @route   POST /api/parents
// @access  Private (Admin)
const createParent = asyncHandler(async (req, res) => {
  const { fullName, email, phone, childId, relation, occupation, address, password } = req.body;

  // Check if email exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(400).json({ message: 'Email already registered' });
  }

  // Check if child exists
  const student = await Student.findById(childId);
  if (!student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  // Create user account
  const hashedPassword = await bcrypt.hash(password || 'parent123', 10);
  const user = await User.create({
    fullName,
    email,
    password: hashedPassword,
    role: 'parent',
    phone
  });

  // Create parent profile
  const parent = await Parent.create({
    userId: user._id,
    fullName,
    email,
    phone,
    childId,
    relation,
    occupation,
    address
  });

  res.status(201).json({
    success: true,
    parent,
    user: {
      id: user._id,
      email: user.email,
      role: user.role
    }
  });
});

// @desc    Update parent profile
// @route   PUT /api/parents/profile
// @access  Private (Parent)
const updateParentProfile = asyncHandler(async (req, res) => {
  const { fullName, phone, occupation, address } = req.body;
  
  const parent = await Parent.findOne({ userId: req.user._id });
  
  if (!parent) {
    return res.status(404).json({ message: 'Parent profile not found' });
  }

  // Update parent profile
  if (fullName) parent.fullName = fullName;
  if (phone) parent.phone = phone;
  if (occupation) parent.occupation = occupation;
  if (address) parent.address = address;

  await parent.save();

  // Update user phone if provided
  if (phone) {
    await User.findByIdAndUpdate(parent.userId, { phone });
  }

  res.json({
    success: true,
    parent
  });
});

// @desc    Parent Login
// @route   POST /api/parent/login
// @access  Public
const parentLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validate input
  if (!email || !password) {
    console.log('Parent Login: Missing email or password');
    return res.status(400).json({ 
      success: false,
      message: 'Please provide email and password' 
    });
  }

  // Find user by email
  const user = await User.findOne({ email });

  // Check if user exists
  if (!user) {
    console.log(`Parent Login: User not found for email: ${email}`);
    return res.status(401).json({ 
      success: false,
      message: 'Invalid credentials' 
    });
  }

  // Verify role is parent
  if (user.role !== 'parent') {
    console.log(`Parent Login: User role is not parent. Role: ${user.role}`);
    return res.status(401).json({ 
      success: false,
      message: 'Invalid credentials - not a parent account' 
    });
  }

  // Check password
  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    console.log(`Parent Login: Invalid password for email: ${email}`);
    return res.status(401).json({ 
      success: false,
      message: 'Invalid credentials' 
    });
  }

  // Get parent profile with linked students
  const parent = await Parent.findOne({ userId: user._id })
    .populate('childId', 'fullName email phone class section rollNumber');

  if (!parent) {
    console.log(`Parent Login: Parent record not found for user: ${user._id}`);
    return res.status(404).json({ 
      success: false,
      message: 'Parent profile not found' 
    });
  }

  // Check if parent is active
  if (!parent.isActive) {
    console.log(`Parent Login: Parent account is inactive: ${parent._id}`);
    return res.status(401).json({ 
      success: false,
      message: 'Account is inactive. Please contact school administration.' 
    });
  }

  // Generate token
  const token = generateToken(user._id);

  // Get all linked student IDs
  const linkedStudentIds = parent.childId ? [parent.childId._id] : [];
  
  // Get student details for the linked children
  const linkedStudents = parent.childId ? [{
    studentId: parent.childId._id,
    name: parent.childId.fullName,
    email: parent.childId.email,
    phone: parent.childId.phone,
    class: parent.childId.class,
    section: parent.childId.section,
    rollNumber: parent.childId.rollNumber
  }] : [];

  console.log(`Parent Login: Success - ${parent.fullName} (${parent.email})`);

  // Return parent data with required fields
  res.json({
    success: true,
    message: 'Login successful',
    token,
    parentId: parent._id,
    name: parent.fullName,
    email: parent.email,
    phone: parent.phone,
    relation: parent.relation,
    occupation: parent.occupation,
    linkedStudentIds: linkedStudentIds,
    linkedStudents: linkedStudents
  });
});

// @desc    Get linked students for parent
// @route   GET /api/parent/students
// @access  Private (Parent)
const getLinkedStudents = asyncHandler(async (req, res) => {
  const parent = await Parent.findOne({ userId: req.user._id })
    .populate('childId', 'fullName email phone class section rollNumber');

  if (!parent) {
    return res.status(404).json({ 
      success: false,
      message: 'Parent profile not found' 
    });
  }

  const linkedStudents = parent.childId ? [{
    studentId: parent.childId._id,
    name: parent.childId.fullName,
    email: parent.childId.email,
    phone: parent.childId.phone,
    class: parent.childId.class,
    section: parent.childId.section,
    rollNumber: parent.childId.rollNumber
  }] : [];

  res.json({
    success: true,
    linkedStudents: linkedStudents
  });
});

module.exports = {
  parentLogin,
  getLinkedStudents,
  getParentProfile,
  getChildInfo,
  getChildAttendance,
  getChildGrades,
  getChildHomework,
  getChildExams,
  getAnnouncements,
  getParentDashboard,
  createParent,
  updateParentProfile
};

