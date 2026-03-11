const User = require('../models/User');
const Subject = require('../models/Subject');
const { asyncHandler } = require('../middleware/errorMiddleware');
const bcrypt = require('bcryptjs');

// @desc    Get all teachers
// @route   GET /api/teachers
// @access  Private (Admin)
const getTeachers = asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    limit = 10, 
    search,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  // Build query
  let query = { role: 'teacher' };

  if (search) {
    query.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }

  // Count total
  const total = await User.countDocuments(query);

  // Get teachers with pagination
  const teachers = await User.find(query)
    .select('-password')
    .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  // Get subjects taught by each teacher
  const teachersWithSubjects = await Promise.all(
    teachers.map(async (teacher) => {
      const subjects = await Subject.find({ teacher: teacher._id }).select('name grade');
      return {
        ...teacher.toObject(),
        subjects
      };
    })
  );

  res.json({
    success: true,
    teachers: teachersWithSubjects,
    pagination: {
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      limit: parseInt(limit)
    }
  });
});

// @desc    Get single teacher
// @route   GET /api/teachers/:id
// @access  Private
const getTeacher = asyncHandler(async (req, res) => {
  const teacher = await User.findById(req.params.id).select('-password');

  if (!teacher || teacher.role !== 'teacher') {
    return res.status(404).json({ message: 'Teacher not found' });
  }

  // Get subjects
  const subjects = await Subject.find({ teacher: teacher._id });

  res.json({
    success: true,
    teacher: {
      ...teacher.toObject(),
      subjects
    }
  });
});

// @desc    Create teacher
// @route   POST /api/teachers
// @access  Private (Admin)
const createTeacher = asyncHandler(async (req, res) => {
  const { 
    fullName, 
    email, 
    phone, 
    qualification,
    experience,
    subjects,
    password
  } = req.body;

  // Check if email already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(400).json({ message: 'Email already registered' });
  }

  // Create user account
  const hashedPassword = await bcrypt.hash(password || 'teacher123', 10);
  const teacher = await User.create({
    fullName,
    email,
    password: hashedPassword,
    role: 'teacher',
    phone,
    qualification,
    experience
  });

  // Assign subjects if provided
  if (subjects && subjects.length > 0) {
    await Subject.updateMany(
      { _id: { $in: subjects } },
      { teacher: teacher._id }
    );
  }

  res.status(201).json({
    success: true,
    teacher: {
      ...teacher.toObject(),
      subjects: subjects || []
    }
  });
});

// @desc    Update teacher
// @route   PUT /api/teachers/:id
// @access  Private (Admin)
const updateTeacher = asyncHandler(async (req, res) => {
  const { 
    fullName, 
    phone, 
    qualification,
    experience,
    subjects,
    isActive
  } = req.body;

  const teacher = await User.findById(req.params.id);

  if (!teacher || teacher.role !== 'teacher') {
    return res.status(404).json({ message: 'Teacher not found' });
  }

  // Update teacher
  const updatedTeacher = await User.findByIdAndUpdate(
    req.params.id,
    {
      fullName,
      phone,
      qualification,
      experience,
      isActive
    },
    { new: true, runValidators: true }
  ).select('-password');

  // Update subjects if provided
  if (subjects) {
    // Remove teacher from all subjects
    await Subject.updateMany(
      { teacher: teacher._id },
      { teacher: null }
    );
    
    // Assign to new subjects
    await Subject.updateMany(
      { _id: { $in: subjects } },
      { teacher: teacher._id }
    );
  }

  // Get updated subjects
  const teacherSubjects = await Subject.find({ teacher: teacher._id });

  res.json({
    success: true,
    teacher: {
      ...updatedTeacher.toObject(),
      subjects: teacherSubjects
    }
  });
});

// @desc    Delete teacher
// @route   DELETE /api/teachers/:id
// @access  Private (Admin)
const deleteTeacher = asyncHandler(async (req, res) => {
  const teacher = await User.findById(req.params.id);

  if (!teacher || teacher.role !== 'teacher') {
    return res.status(404).json({ message: 'Teacher not found' });
  }

  // Remove teacher from subjects
  await Subject.updateMany(
    { teacher: teacher._id },
    { teacher: null }
  );

  // Delete teacher
  await User.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
    message: 'Teacher deleted successfully'
  });
});

// @desc    Get teacher count
// @route   GET /api/teachers/count
// @access  Private
const getTeacherCount = asyncHandler(async (req, res) => {
  const count = await User.countDocuments({ role: 'teacher', isActive: { $ne: false } });

  res.json({
    success: true,
    count
  });
});

// @desc    Get available teachers (not assigned to a subject)
// @route   GET /api/teachers/available
// @access  Private
const getAvailableTeachers = asyncHandler(async (req, res) => {
  const teachers = await User.find({ role: 'teacher' }).select('fullName');

  res.json({
    success: true,
    teachers
  });
});

module.exports = {
  getTeachers,
  getTeacher,
  createTeacher,
  updateTeacher,
  deleteTeacher,
  getTeacherCount,
  getAvailableTeachers
};

