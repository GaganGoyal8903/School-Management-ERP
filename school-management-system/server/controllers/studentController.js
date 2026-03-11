const User = require('../models/User');
const Student = require('../models/Student');
const Timetable = require('../models/Timetable');
const { asyncHandler } = require('../middleware/errorMiddleware');
const { generateToken } = require('../middleware/authMiddleware');
const bcrypt = require('bcryptjs');

// @desc    Student Login
// @route   POST /api/student/login
// @access  Public
const studentLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Validate input
  if (!email || !password) {
    console.log('Student Login: Missing email or password');
    return res.status(400).json({ 
      success: false,
      message: 'Please provide email and password' 
    });
  }

  // Find user by email
  const user = await User.findOne({ email });

  // Check if user exists and is a student
  if (!user) {
    console.log(`Student Login: User not found for email: ${email}`);
    return res.status(401).json({ 
      success: false,
      message: 'Invalid credentials' 
    });
  }

  // Verify role is student
  if (user.role !== 'student') {
    console.log(`Student Login: User role is not student. Role: ${user.role}`);
    return res.status(401).json({ 
      success: false,
      message: 'Invalid credentials - not a student account' 
    });
  }

  // Check password
  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    console.log(`Student Login: Invalid password for email: ${email}`);
    return res.status(401).json({ 
      success: false,
      message: 'Invalid credentials' 
    });
  }

  // Get student profile
  const student = await Student.findOne({ userId: user._id });

  if (!student) {
    console.log(`Student Login: Student record not found for user: ${user._id}`);
    return res.status(404).json({ 
      success: false,
      message: 'Student profile not found' 
    });
  }

  // Check if student is active
  if (!student.isActive) {
    console.log(`Student Login: Student account is inactive: ${student._id}`);
    return res.status(401).json({ 
      success: false,
      message: 'Account is inactive. Please contact school administration.' 
    });
  }

  // Generate token
  const token = generateToken(user._id);

  console.log(`Student Login: Success - ${student.fullName} (${student.email})`);

  // Return student data with required fields
  res.json({
    success: true,
    message: 'Login successful',
    token,
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
    guardianPhone: student.guardianPhone
  });
});

// @desc    Get student timetable
// @route   GET /api/student/timetable/:studentId
// @access  Private (Student)
const getStudentTimetable = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { day } = req.query;

  console.log(`Fetching timetable for studentId: ${studentId}`);

  // Find student
  const student = await Student.findById(studentId);

  if (!student) {
    console.log(`Student not found: ${studentId}`);
    return res.status(404).json({ 
      success: false,
      message: 'Student not found' 
    });
  }

  // Build timetable query using student's class and section
  const query = {
    class: student.class,
    section: student.section,
    academicYear: '2024-2025',
    isActive: true
  };

  // If day is specified, filter by day
  if (day) {
    query.day = day;
  }

  console.log(`Timetable query:`, query);

  // Fetch timetable
  const timetable = await Timetable.find(query)
    .populate('periods.subject', 'name code')
    .populate('periods.teacher', 'fullName')
    .sort({ day: 1, 'periods.periodNumber': 1 });

  if (!timetable || timetable.length === 0) {
    console.log(`No timetable found for class: ${student.class}, section: ${student.section}`);
    return res.status(404).json({ 
      success: false,
      message: 'No timetable found for your class',
      class: student.class,
      section: student.section
    });
  }

  // Format the response
  const formattedTimetable = timetable.map(dayEntry => ({
    _id: dayEntry._id,
    class: dayEntry.class,
    section: dayEntry.section,
    day: dayEntry.day,
    academicYear: dayEntry.academicYear,
    periods: dayEntry.periods.map(period => ({
      periodNumber: period.periodNumber,
      subject: period.subject ? period.subject.name : 'N/A',
      subjectCode: period.subject ? period.subject.code : 'N/A',
      teacher: period.teacher ? period.teacher.fullName : 'TBA',
      startTime: period.startTime,
      endTime: period.endTime,
      roomNumber: period.roomNumber || 'TBA'
    }))
  }));

  console.log(`Timetable fetched successfully for ${student.fullName}`);

  res.json({
    success: true,
    message: 'Timetable fetched successfully',
    studentName: student.fullName,
    class: student.class,
    section: student.section,
    timetable: formattedTimetable
  });
});

// @desc    Get all students
// @route   GET /api/students
// @access  Private (Admin, Teacher)
const getStudents = asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    limit = 10, 
    search, 
    class: classFilter, 
    section,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  // Build query
  let query = {};

  if (classFilter) {
    query.class = classFilter;
  }

  if (section) {
    query.section = section;
  }

  if (search) {
    query.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { rollNumber: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }

  // Count total
  const total = await Student.countDocuments(query);

  // Get students with pagination
  const students = await Student.find(query)
    .populate('userId', 'email role')
    .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  res.json({
    success: true,
    students,
    pagination: {
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      limit: parseInt(limit)
    }
  });
});

// @desc    Get single student
// @route   GET /api/students/:id
// @access  Private
const getStudent = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id).populate('userId', 'email role');

  if (!student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  res.json({
    success: true,
    student
  });
});

// @desc    Create student
// @route   POST /api/students
// @access  Private (Admin)
const createStudent = asyncHandler(async (req, res) => {
  const { 
    fullName, 
    email, 
    phone, 
    class: studentClass, 
    section, 
    rollNumber,
    dateOfBirth,
    gender,
    address,
    guardianName,
    guardianPhone,
    bloodGroup,
    guardianRelation,
    password
  } = req.body;

  // Check if email already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(400).json({ message: 'Email already registered' });
  }

  // Check if roll number exists
  const existingRoll = await Student.findOne({ rollNumber });
  if (existingRoll) {
    return res.status(400).json({ message: 'Roll number already exists' });
  }

  // Create user account
  const hashedPassword = await bcrypt.hash(password || 'student123', 10);
  const user = await User.create({
    fullName,
    email,
    password: hashedPassword,
    role: 'student',
    phone
  });

  // Create student profile
  const student = await Student.create({
    userId: user._id,
    fullName,
    email,
    phone,
    class: studentClass,
    section,
    rollNumber,
    dateOfBirth,
    gender,
    address,
    guardianName,
    guardianPhone,
    guardianRelation,
    bloodGroup
  });

  res.status(201).json({
    success: true,
    student
  });
});

// @desc    Update student
// @route   PUT /api/students/:id
// @access  Private (Admin)
const updateStudent = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id);

  if (!student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  const {
    fullName,
    phone,
    class: studentClass,
    section,
    rollNumber,
    dateOfBirth,
    gender,
    address,
    guardianName,
    guardianPhone,
    guardianRelation,
    bloodGroup,
    isActive
  } = req.body;

  // Check if roll number is being changed and if it's unique
  if (rollNumber && rollNumber !== student.rollNumber) {
    const existingRoll = await Student.findOne({ rollNumber });
    if (existingRoll) {
      return res.status(400).json({ message: 'Roll number already exists' });
    }
  }

  // Update student
  const updatedStudent = await Student.findByIdAndUpdate(
    req.params.id,
    {
      fullName,
      phone,
      class: studentClass,
      section,
      rollNumber,
      dateOfBirth,
      gender,
      address,
      guardianName,
      guardianPhone,
      guardianRelation,
      bloodGroup,
      isActive
    },
    { new: true, runValidators: true }
  );

  // Also update user if needed
  if (fullName || phone) {
    await User.findByIdAndUpdate(student.userId, {
      fullName: fullName || undefined,
      phone: phone || undefined
    });
  }

  res.json({
    success: true,
    student: updatedStudent
  });
});

// @desc    Delete student
// @route   DELETE /api/students/:id
// @access  Private (Admin)
const deleteStudent = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id);

  if (!student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  // Delete user account
  await User.findByIdAndDelete(student.userId);

  // Delete student
  await Student.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
    message: 'Student deleted successfully'
  });
});

// @desc    Get students by class
// @route   GET /api/students/class/:class
// @access  Private
const getStudentsByClass = asyncHandler(async (req, res) => {
  const students = await Student.find({ class: req.params.class })
    .select('fullName rollNumber section email');

  res.json({
    success: true,
    students
  });
});

// @desc    Get student count
// @route   GET /api/students/count
// @access  Private
const getStudentCount = asyncHandler(async (req, res) => {
  const count = await Student.countDocuments({ isActive: true });

  res.json({
    success: true,
    count
  });
});

module.exports = {
  studentLogin,
  getStudentTimetable,
  getStudents,
  getStudent,
  createStudent,
  updateStudent,
  deleteStudent,
  getStudentsByClass,
  getStudentCount
};

