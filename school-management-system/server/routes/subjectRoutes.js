const express = require('express');
const router = express.Router();
const Subject = require('../models/Subject');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { asyncHandler } = require('../middleware/errorMiddleware');

// @desc    Get all subjects
// @route   GET /api/subjects
// @access  Private
router.get('/', protect, asyncHandler(async (req, res) => {
  const { grade, search, page = 1, limit = 10 } = req.query;

  let query = {};

  if (grade) {
    query.grade = grade;
  }

  if (search) {
    query.name = { $regex: search, $options: 'i' };
  }

  const total = await Subject.countDocuments(query);

  const subjects = await Subject.find(query)
    .populate('teacher', 'fullName email')
    .sort({ name: 1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  res.json({
    success: true,
    subjects,
    pagination: {
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit)
    }
  });
}));

// @desc    Get single subject
// @route   GET /api/subjects/:id
// @access  Private
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const subject = await Subject.findById(req.params.id)
    .populate('teacher', 'fullName email phone');

  if (!subject) {
    return res.status(404).json({ message: 'Subject not found' });
  }

  res.json({
    success: true,
    subject
  });
}));

// @desc    Create subject
// @route   POST /api/subjects
// @access  Private (Admin)
router.post('/', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const { name, grade, description, teacher } = req.body;

  const subject = await Subject.create({
    name,
    grade,
    description,
    teacher
  });

  await subject.populate('teacher', 'fullName email');

  res.status(201).json({
    success: true,
    subject
  });
}));

// @desc    Update subject
// @route   PUT /api/subjects/:id
// @access  Private (Admin)
router.put('/:id', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const { name, grade, description, teacher } = req.body;

  const subject = await Subject.findById(req.params.id);

  if (!subject) {
    return res.status(404).json({ message: 'Subject not found' });
  }

  const updatedSubject = await Subject.findByIdAndUpdate(
    req.params.id,
    { name, grade, description, teacher },
    { new: true, runValidators: true }
  ).populate('teacher', 'fullName email');

  res.json({
    success: true,
    subject: updatedSubject
  });
}));

// @desc    Delete subject
// @route   DELETE /api/subjects/:id
// @access  Private (Admin)
router.delete('/:id', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const subject = await Subject.findById(req.params.id);

  if (!subject) {
    return res.status(404).json({ message: 'Subject not found' });
  }

  await subject.deleteOne();

  res.json({
    success: true,
    message: 'Subject deleted'
  });
}));

// @desc    Get subjects by grade
// @route   GET /api/subjects/grade/:grade
// @access  Private
router.get('/grade/:grade', protect, asyncHandler(async (req, res) => {
  const subjects = await Subject.find({ grade: req.params.grade })
    .populate('teacher', 'fullName');

  res.json({
    success: true,
    subjects
  });
}));

// @desc    Get subject count
// @route   GET /api/subjects/count
// @access  Private
router.get('/count', protect, asyncHandler(async (req, res) => {
  const count = await Subject.countDocuments();

  res.json({
    success: true,
    count
  });
}));

// @desc    Assign teacher to subject
// @route   PUT /api/subjects/:id/assign-teacher
// @access  Private (Admin)
router.put('/:id/assign-teacher', protect, authorize('admin'), asyncHandler(async (req, res) => {
  const { teacherId } = req.body;

  const subject = await Subject.findByIdAndUpdate(
    req.params.id,
    { teacher: teacherId },
    { new: true }
  ).populate('teacher', 'fullName email');

  if (!subject) {
    return res.status(404).json({ message: 'Subject not found' });
  }

  res.json({
    success: true,
    subject
  });
}));

module.exports = router;

