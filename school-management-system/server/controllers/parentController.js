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
const User = require('../models/User');
const mongoose = require('mongoose');
const { getStudentById: getStudentByIdFromSql } = require('../services/studentSqlService');
const { getStudentAttendanceReport } = require('../services/attendanceSqlService');
const { getStudentExamResults } = require('../services/examSqlService');

const isMongoObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));
const parseSqlStudentId = (value) => {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
};

const mapSqlStudentForParent = (student = {}) => ({
  _id: String(student._id || student.id || student.studentId || student.dbId || ''),
  fullName: student.fullName || null,
  email: student.email || null,
  phone: student.phone || null,
  class: student.class || null,
  section: student.section || null,
  rollNumber: student.rollNumber || null,
});

const resolveParentChildStudent = async (childId) => {
  const rawChildId = typeof childId === 'object' && childId !== null && childId._id
    ? childId._id
    : childId;

  if (!rawChildId) {
    return null;
  }

  if (isMongoObjectId(rawChildId)) {
    const mongoStudent = await Student.findById(rawChildId).populate('userId', 'email');
    if (mongoStudent) {
      return {
        source: 'mongo',
        student: mongoStudent,
      };
    }
  }

  const sqlStudentId = parseSqlStudentId(rawChildId);
  if (!sqlStudentId) {
    return null;
  }

  const sqlStudent = await getStudentByIdFromSql(sqlStudentId);
  if (!sqlStudent) {
    return null;
  }

  return {
    source: 'sql',
    student: mapSqlStudentForParent(sqlStudent),
  };
};

const getParentWithResolvedChild = async (userId) => {
  const parent = await Parent.findOne({ userId });
  if (!parent) {
    return null;
  }

  const child = await resolveParentChildStudent(parent.childId);
  return {
    parent,
    child,
  };
};

const buildLinkedStudentsPayload = (resolvedChild) => {
  if (!resolvedChild?.student) {
    return [];
  }

  const student = resolvedChild.student;
  return [{
    studentId: student._id,
    name: student.fullName,
    email: student.email || student.userId?.email || null,
    phone: student.phone || null,
    class: student.class || null,
    section: student.section || null,
    rollNumber: student.rollNumber || null,
  }];
};

const summarizeSqlAttendance = (attendanceRecords = []) => {
  const total = attendanceRecords.length;
  const present = attendanceRecords.filter((record) => record.status === 'Present').length;
  const absent = attendanceRecords.filter((record) => record.status === 'Absent').length;
  const late = attendanceRecords.filter((record) => record.status === 'Late').length;

  return {
    total,
    present,
    absent,
    late,
    percentage: total > 0 ? ((present / total) * 100).toFixed(1) : 0,
  };
};

const normalizeCollection = (payload, keys = []) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  for (const key of keys) {
    if (Array.isArray(payload?.[key])) {
      return payload[key];
    }
  }

  return [];
};

const normalizeSqlAttendanceRecords = (payload) =>
  normalizeCollection(payload, ['attendance', 'records', 'data']).map((record) => ({
    _id: String(record._id || record.id || record.attendanceId || ''),
    date: record.date || record.attendanceDate || null,
    status: record.status || 'Absent',
    remarks: record.remarks || null,
    markedBy: record.markedByName
      ? { fullName: record.markedByName }
      : record.markedBy || null,
  }));

const normalizeSqlGradeRecords = (payload) =>
  normalizeCollection(payload, ['results', 'records', 'data']).map((record) => ({
    _id: String(record._id || record.id || record.resultId || ''),
    subjectId: {
      name: record.subjectName || record.subject || 'Unknown',
    },
    examId: {
      name: record.examName || record.exam || 'Exam',
      examDate: record.examDate || null,
    },
    marksObtained: Number(
      record.marksObtained ?? record.obtainedMarks ?? record.score ?? record.marks ?? 0
    ),
    totalMarks: Number(record.totalMarks ?? record.maxMarks ?? record.fullMarks ?? 0),
    percentage: Number(record.percentage ?? 0),
    grade: record.grade || null,
    remarks: record.remarks || null,
    publishedAt: record.publishedAt || record.createdAt || null,
  }));

const normalizeSqlExamSchedule = (payload) =>
  normalizeCollection(payload, ['schedule', 'exams', 'upcomingExams', 'data']).map((record) => ({
    _id: String(record._id || record.id || record.examId || ''),
    name: record.name || record.examName || record.exam || 'Exam',
    examDate: record.examDate || record.date || null,
    subjectId: {
      name: record.subjectName || record.subject || 'Unknown',
    },
    totalMarks: Number(record.totalMarks ?? record.maxMarks ?? 0),
    status: record.status || null,
  }));

const getSqlAttendanceStats = (payload, attendanceRecords) =>
  payload?.stats || payload?.summary || summarizeSqlAttendance(attendanceRecords);

const buildParentPayload = (parent, resolvedChild) => {
  const parentObject = parent.toObject();
  return {
    ...parentObject,
    childId: resolvedChild?.student || parentObject.childId,
    linkedStudents: buildLinkedStudentsPayload(resolvedChild),
  };
};

const getHomeworkForResolvedChild = async (resolvedChild) => {
  if (!resolvedChild?.student) {
    return [];
  }

  const className = resolvedChild.student.class;
  if (!className) {
    return [];
  }

  const homework = await Homework.find({
    class: className,
    isActive: true,
  })
    .populate('subject', 'name')
    .populate('assignedBy', 'fullName')
    .sort({ dueDate: 1 });

  if (resolvedChild.source !== 'mongo') {
    return homework.map((hw) => ({
      ...hw.toObject(),
      submission: null,
      isSubmitted: false,
      isOverdue: new Date(hw.dueDate) < new Date(),
    }));
  }

  const submissions = await HomeworkSubmission.find({
    studentId: resolvedChild.student._id,
  });

  return homework.map((hw) => {
    const submission = submissions.find((entry) => entry.homeworkId.toString() === hw._id.toString());
    return {
      ...hw.toObject(),
      submission: submission || null,
      isSubmitted: !!submission,
      isOverdue: !submission && new Date(hw.dueDate) < new Date(),
    };
  });
};

const getExamDataForResolvedChild = async (resolvedChild) => {
  if (!resolvedChild?.student) {
    return {
      results: [],
      upcomingExams: [],
      completedExams: [],
    };
  }

  if (resolvedChild.source === 'mongo') {
    const exams = await Exam.find({
      class: resolvedChild.student.class,
      examDate: { $gte: new Date() },
    })
      .populate('subjectId', 'name')
      .sort({ examDate: 1 });

    const grades = await Grade.find({ studentId: resolvedChild.student._id });
    const examResults = grades.map((grade) => grade.examId?.toString()).filter(Boolean);

    return {
      results: grades,
      upcomingExams: exams.filter((exam) => !examResults.includes(exam._id.toString())),
      completedExams: exams.filter((exam) => examResults.includes(exam._id.toString())),
    };
  }

  const studentId = parseSqlStudentId(resolvedChild.student._id);
  if (!studentId) {
    return {
      results: [],
      upcomingExams: [],
      completedExams: [],
    };
  }

  const resultPayload = await getStudentExamResults({ studentId });
  const normalizedResults = normalizeSqlGradeRecords(resultPayload);
  const normalizedSchedule = normalizeSqlExamSchedule(resultPayload);
  const completedNames = new Set(
    normalizedResults
      .map((result) => result.examId?.name)
      .filter(Boolean)
  );
  const now = new Date();

  return {
    results: normalizedResults,
    upcomingExams: normalizedSchedule.filter((exam) => {
      if (!exam.examDate) {
        return !completedNames.has(exam.name);
      }
      return new Date(exam.examDate) >= now && !completedNames.has(exam.name);
    }),
    completedExams: normalizedSchedule.filter((exam) => completedNames.has(exam.name)),
  };
};

// @desc    Get parent profile
// @route   GET /api/parents/profile
// @access  Private (Parent)
const getParentProfile = asyncHandler(async (req, res) => {
  const parentContext = await getParentWithResolvedChild(req.user._id);

  if (!parentContext) {
    return res.status(404).json({ message: 'Parent profile not found' });
  }

  res.json({
    success: true,
    parent: buildParentPayload(parentContext.parent, parentContext.child),
  });
});

// @desc    Get parent's child info
// @route   GET /api/parents/child
// @access  Private (Parent)
const getChildInfo = asyncHandler(async (req, res) => {
  const parentContext = await getParentWithResolvedChild(req.user._id);

  if (!parentContext) {
    return res.status(404).json({ message: 'Parent profile not found' });
  }

  if (!parentContext.child?.student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  res.json({
    success: true,
    student: parentContext.child.student,
  });
});

// @desc    Get child's attendance
// @route   GET /api/parents/attendance
// @access  Private (Parent)
const getChildAttendance = asyncHandler(async (req, res) => {
  const parentContext = await getParentWithResolvedChild(req.user._id);

  if (!parentContext) {
    return res.status(404).json({ message: 'Parent profile not found' });
  }

  if (!parentContext.child?.student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  const { month, year } = req.query;

  if (parentContext.child.source === 'sql') {
    const studentId = parseSqlStudentId(parentContext.child.student._id);
    if (!studentId) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const startDate = month && year ? new Date(year, month - 1, 1) : null;
    const endDate = month && year ? new Date(year, month, 0) : null;
    const attendancePayload = await getStudentAttendanceReport({ studentId, startDate, endDate });
    const attendance = normalizeSqlAttendanceRecords(attendancePayload);

    return res.json({
      success: true,
      attendance,
      stats: getSqlAttendanceStats(attendancePayload, attendance),
    });
  }

  let query = { studentId: parentContext.parent.childId };

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
  const parentContext = await getParentWithResolvedChild(req.user._id);

  if (!parentContext) {
    return res.status(404).json({ message: 'Parent profile not found' });
  }

  if (!parentContext.child?.student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  let grades = [];

  if (parentContext.child.source === 'sql') {
    const studentId = parseSqlStudentId(parentContext.child.student._id);
    const gradePayload = studentId ? await getStudentExamResults({ studentId }) : [];
    grades = normalizeSqlGradeRecords(gradePayload);
  } else {
    grades = await Grade.find({ studentId: parentContext.parent.childId })
      .populate('subjectId', 'name')
      .populate('examId', 'name examDate')
      .sort({ createdAt: -1 });
  }

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
  const parentContext = await getParentWithResolvedChild(req.user._id);

  if (!parentContext) {
    return res.status(404).json({ message: 'Parent profile not found' });
  }

  if (!parentContext.child?.student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  const homeworkWithSubmission = await getHomeworkForResolvedChild(parentContext.child);

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
  const parentContext = await getParentWithResolvedChild(req.user._id);

  if (!parentContext) {
    return res.status(404).json({ message: 'Parent profile not found' });
  }

  if (!parentContext.child?.student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  const { upcomingExams, completedExams, results } = await getExamDataForResolvedChild(parentContext.child);

  res.json({
    success: true,
    upcomingExams,
    completedExams,
    results,
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
  const parentContext = await getParentWithResolvedChild(req.user._id);

  if (!parentContext) {
    return res.status(404).json({ message: 'Parent profile not found' });
  }

  if (!parentContext.child?.student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  const childStudent = parentContext.child.student;
  let attendancePercentage = 0;
  let present = 0;
  let total = 0;
  let recentGrades = [];
  let homework = [];
  let upcomingExams = [];

  if (parentContext.child.source === 'sql') {
    const studentId = parseSqlStudentId(childStudent._id);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const attendancePayload = studentId
      ? await getStudentAttendanceReport({ studentId, startDate: thirtyDaysAgo, endDate: new Date() })
      : [];
    const recentAttendance = normalizeSqlAttendanceRecords(attendancePayload);
    const attendanceStats = getSqlAttendanceStats(attendancePayload, recentAttendance);

    present = Number(attendanceStats.present || 0);
    total = Number(attendanceStats.total || recentAttendance.length || 0);
    attendancePercentage = attendanceStats.percentage || 0;

    const resultPayload = studentId ? await getStudentExamResults({ studentId }) : [];
    recentGrades = normalizeSqlGradeRecords(resultPayload).slice(0, 5);
    homework = (await getHomeworkForResolvedChild(parentContext.child))
      .filter((entry) => new Date(entry.dueDate) >= new Date())
      .slice(0, 5);
    const examData = await getExamDataForResolvedChild(parentContext.child);
    upcomingExams = examData.upcomingExams.slice(0, 5);
  } else {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentAttendance = await Attendance.find({
      studentId: parentContext.parent.childId,
      date: { $gte: thirtyDaysAgo }
    });

    present = recentAttendance.filter((record) => record.status === 'Present').length;
    total = recentAttendance.length;
    attendancePercentage = total > 0 ? ((present / total) * 100).toFixed(1) : 0;

    recentGrades = await Grade.find({ studentId: parentContext.parent.childId })
      .populate('subjectId', 'name')
      .sort({ createdAt: -1 })
      .limit(5);

    homework = await Homework.find({
      class: childStudent.class,
      dueDate: { $gte: new Date() },
      isActive: true
    })
      .populate('subject', 'name')
      .sort({ dueDate: 1 })
      .limit(5);

    upcomingExams = await Exam.find({
      class: childStudent.class,
      examDate: { $gte: new Date() }
    })
      .populate('subjectId', 'name')
      .sort({ examDate: 1 })
      .limit(5);
  }

  // Get unread messages count
  const Message = require('../models/Message');
  const unreadMessages = await Message.countDocuments({
    receiverId: req.user._id,
    isRead: false
  });

  const avgMarks = recentGrades.length > 0
    ? (recentGrades.reduce((sum, grade) => sum + (grade.marksObtained || 0), 0) / recentGrades.length).toFixed(1)
    : 0;

  res.json({
    success: true,
    child: {
      name: childStudent.fullName,
      class: childStudent.class,
      section: childStudent.section,
      rollNumber: childStudent.rollNumber
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

  if (!fullName || !email || !childId || !password) {
    return res.status(400).json({ message: 'Full name, email, child, and password are required' });
  }

  if (String(password).length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters long' });
  }

  // Check if email exists
  const existingUser = await User.findOne({ email, role: 'parent' });
  if (existingUser) {
    return res.status(400).json({ message: 'This email already exists for the selected role' });
  }

  const resolvedChild = await resolveParentChildStudent(childId);
  if (!resolvedChild?.student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  const user = await User.create({
    fullName,
    email,
    password: String(password),
    role: 'parent',
    phone
  });

  // Create parent profile
  const parent = await Parent.create({
    userId: user._id,
    fullName,
    email,
    phone,
    childId: resolvedChild.source === 'mongo'
      ? resolvedChild.student._id
      : parseSqlStudentId(resolvedChild.student._id) || String(resolvedChild.student._id),
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

  const user = await User.findOne({ email, role: 'parent' });

  if (!user) {
    console.log(`Parent Login: Parent user not found for email: ${email}`);
    return res.status(401).json({ 
      success: false,
      message: 'Invalid credentials' 
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
  const parentContext = await getParentWithResolvedChild(user._id);

  if (!parentContext) {
    console.log(`Parent Login: Parent record not found for user: ${user._id}`);
    return res.status(404).json({ 
      success: false,
      message: 'Parent profile not found' 
    });
  }

  const { parent, child } = parentContext;

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

  const linkedStudents = buildLinkedStudentsPayload(child);
  const linkedStudentIds = linkedStudents.map((student) => student.studentId);

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
  const parentContext = await getParentWithResolvedChild(req.user._id);

  if (!parentContext) {
    return res.status(404).json({ 
      success: false,
      message: 'Parent profile not found' 
    });
  }

  const linkedStudents = buildLinkedStudentsPayload(parentContext.child);

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

