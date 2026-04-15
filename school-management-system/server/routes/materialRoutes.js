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
const {
  extractSubjectId,
  getTeacherAssignmentScope,
  paginateItems,
  doesTeacherOwnSubject,
} = require('../services/teacherAssignmentService');

const getRequestRole = (req) => String(req.user?.role || '').trim().toLowerCase();
const isTeacherRequest = (req) => getRequestRole(req) === 'teacher';

router.use(protect);

router.get('/', asyncHandler(async (req, res) => {
  const { subject, grade, search, page = 1, limit = 10 } = req.query;
  const requestPage = parseInt(page, 10) || 1;
  const requestLimit = parseInt(limit, 10) || 10;
  const queryOptions = isTeacherRequest(req)
    ? {
        subject,
        grade,
        search,
        page: 1,
        limit: 5000,
      }
    : {
        subject,
        grade,
        search,
        page: requestPage,
        limit: requestLimit,
      };
  const { materials, total } = await getMaterialList({
    ...queryOptions,
  });

  if (isTeacherRequest(req)) {
    const scope = await getTeacherAssignmentScope({
      teacherUserId: req.user?._id,
      grade,
      search,
    });
    const filteredMaterials = (materials || []).filter((material) => {
      const uploadedByCurrentTeacher = String(material?.uploadedBy?._id || '') === String(req.user?._id || '');
      return uploadedByCurrentTeacher || doesTeacherOwnSubject({
        scope,
        subjectId: material?.subject?._id || material?.subjectId || material?.subject,
      });
    });
    const paginated = paginateItems(filteredMaterials, page, limit);

    return res.json({
      success: true,
      materials: paginated.items,
      pagination: {
        total: paginated.total,
        page: paginated.page,
        pages: Math.ceil(paginated.total / paginated.limit),
      },
    });
  }

  res.json({
    success: true,
    materials,
    pagination: {
      total,
      page: requestPage,
      pages: Math.ceil(total / requestLimit),
    },
  });
}));

router.post('/', authorize('admin', 'teacher'), asyncHandler(async (req, res) => {
  if (isTeacherRequest(req)) {
    const scope = await getTeacherAssignmentScope({ teacherUserId: req.user?._id });
    if (!doesTeacherOwnSubject({ scope, subjectId: req.body.subject })) {
      return res.status(403).json({ message: 'Teachers can only upload materials for their assigned subjects' });
    }
  }

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
  if (isTeacherRequest(req)) {
    const scope = await getTeacherAssignmentScope({ teacherUserId: req.user?._id });
    if (!doesTeacherOwnSubject({ scope, subjectId: req.params.subject })) {
      return res.status(403).json({ message: 'Not authorized to access materials for this subject' });
    }
  }

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

  if (isTeacherRequest(req)) {
    const scope = await getTeacherAssignmentScope({ teacherUserId: req.user?._id });
    const uploadedByCurrentTeacher = String(material?.uploadedBy?._id || '') === String(req.user?._id || '');
    const hasSubjectAccess = doesTeacherOwnSubject({
      scope,
      subjectId: material?.subject?._id || material?.subjectId || material?.subject,
    });

    if (!uploadedByCurrentTeacher && !hasSubjectAccess) {
      return res.status(403).json({ message: 'Not authorized to access this material' });
    }
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
