const express = require('express');
const router = express.Router();
const Material = require('../models/Material');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { asyncHandler } = require('../middleware/errorMiddleware');

// All routes require authentication
router.use(protect);

// @desc    Get all materials
// @route   GET /api/materials
// @access  Private
router.get('/', asyncHandler(async (req, res) => {
  const { subject, grade, search, page = 1, limit = 10 } = req.query;

  let query = {};

  if (subject) {
    query.subject = subject;
  }

  if (grade) {
    query.grade = grade;
  }

  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }

  const total = await Material.countDocuments(query);

  const materials = await Material.find(query)
    .populate('uploadedBy', 'fullName')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  res.json({
    success: true,
    materials,
    pagination: {
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit)
    }
  });
}));

// @desc    Get single material
// @route   GET /api/materials/:id
// @access  Private
router.get('/:id', asyncHandler(async (req, res) => {
  const material = await Material.findById(req.params.id)
    .populate('uploadedBy', 'fullName email');

  if (!material) {
    return res.status(404).json({ message: 'Material not found' });
  }

  res.json({
    success: true,
    material
  });
}));

// @desc    Create material
// @route   POST /api/materials
// @access  Private (Admin, Teacher)
router.post('/', authorize('admin', 'teacher'), asyncHandler(async (req, res) => {
  const { title, subject, grade, description, fileUrl, fileName } = req.body;

  const material = await Material.create({
    title,
    subject,
    grade,
    description,
    fileUrl,
    fileName,
    uploadedBy: req.user._id
  });

  await material.populate('uploadedBy', 'fullName');

  res.status(201).json({
    success: true,
    material
  });
}));

// @desc    Update material
// @route   PUT /api/materials/:id
// @access  Private (Admin, Teacher)
router.put('/:id', authorize('admin', 'teacher'), asyncHandler(async (req, res) => {
  const { title, subject, grade, description, fileUrl, fileName } = req.body;

  const material = await Material.findById(req.params.id);

  if (!material) {
    return res.status(404).json({ message: 'Material not found' });
  }

  // Check ownership
  if (material.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Not authorized to update this material' });
  }

  const updatedMaterial = await Material.findByIdAndUpdate(
    req.params.id,
    { title, subject, grade, description, fileUrl, fileName },
    { new: true, runValidators: true }
  ).populate('uploadedBy', 'fullName');

  res.json({
    success: true,
    material: updatedMaterial
  });
}));

// @desc    Delete material
// @route   DELETE /api/materials/:id
// @access  Private (Admin, Teacher)
router.delete('/:id', authorize('admin', 'teacher'), asyncHandler(async (req, res) => {
  const material = await Material.findById(req.params.id);

  if (!material) {
    return res.status(404).json({ message: 'Material not found' });
  }

  // Check ownership
  if (material.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Not authorized to delete this material' });
  }

  await material.deleteOne();

  res.json({
    success: true,
    message: 'Material deleted'
  });
}));

// @desc    Get materials by subject
// @route   GET /api/materials/subject/:subject
// @access  Private
router.get('/subject/:subject', asyncHandler(async (req, res) => {
  const materials = await Material.find({ subject: req.params.subject })
    .populate('uploadedBy', 'fullName')
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    materials
  });
}));

module.exports = router;

