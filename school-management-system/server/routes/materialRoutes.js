const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { asyncHandler } = require('../middleware/errorMiddleware');
const {
  getMaterialList,
  getMaterialRecordById,
  createMaterialRecord,
  updateMaterialRecord,
  deleteMaterialRecord,
  getMaterialsBySubject,
} = require('../services/materialSqlService');

router.use(protect);

router.get('/', asyncHandler(async (req, res) => {
  const { subject, grade, search, page = 1, limit = 10 } = req.query;
  const { materials, total } = await getMaterialList({
    subject,
    grade,
    search,
    page: parseInt(page, 10) || 1,
    limit: parseInt(limit, 10) || 10,
  });

  res.json({
    success: true,
    materials,
    pagination: {
      total,
      page: parseInt(page, 10) || 1,
      pages: Math.ceil(total / (parseInt(limit, 10) || 10)),
    },
  });
}));

router.post('/', authorize('admin', 'teacher'), asyncHandler(async (req, res) => {
  const material = await createMaterialRecord({
    ...req.body,
    uploadedByUserId: req.user?._id,
  });

  res.status(201).json({
    success: true,
    material,
  });
}));

router.get('/subject/:subject', asyncHandler(async (req, res) => {
  const materials = await getMaterialsBySubject(req.params.subject);
  res.json({
    success: true,
    materials,
  });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const material = await getMaterialRecordById(req.params.id);

  if (!material) {
    return res.status(404).json({ message: 'Material not found' });
  }

  res.json({
    success: true,
    material,
  });
}));

router.put('/:id', authorize('admin', 'teacher'), asyncHandler(async (req, res) => {
  const existingMaterial = await getMaterialRecordById(req.params.id);

  if (!existingMaterial) {
    return res.status(404).json({ message: 'Material not found' });
  }

  if (String(existingMaterial.uploadedBy?._id || '') !== String(req.user?._id || '') && req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Not authorized to update this material' });
  }

  const material = await updateMaterialRecord(req.params.id, req.body);

  res.json({
    success: true,
    material,
  });
}));

router.delete('/:id', authorize('admin', 'teacher'), asyncHandler(async (req, res) => {
  const existingMaterial = await getMaterialRecordById(req.params.id);

  if (!existingMaterial) {
    return res.status(404).json({ message: 'Material not found' });
  }

  if (String(existingMaterial.uploadedBy?._id || '') !== String(req.user?._id || '') && req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Not authorized to delete this material' });
  }

  await deleteMaterialRecord(req.params.id);

  res.json({
    success: true,
    message: 'Material deleted',
  });
}));

module.exports = router;
