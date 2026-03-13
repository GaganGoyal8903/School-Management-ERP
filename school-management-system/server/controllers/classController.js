const { asyncHandler } = require('../middleware/errorMiddleware');
const {
  ensureAcademicSqlReady,
  getClassList,
  getClassById,
  createClassRecord,
  updateClassRecord,
  deleteClassRecord,
} = require('../services/academicSqlService');

const parseBooleanInput = (value) => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'y'].includes(value.trim().toLowerCase());
  }

  return Boolean(value);
};

const getClasses = asyncHandler(async (req, res) => {
  await ensureAcademicSqlReady();
  const { page = 1, limit = 50, search } = req.query;

  const result = await getClassList({ page, limit, search });

  res.json({
    success: true,
    classes: result.classes,
    pagination: {
      total: result.total,
      page: Number(page) || 1,
      pages: Math.ceil(result.total / (Number(limit) || 50)),
    },
  });
});

const getClassByIdController = asyncHandler(async (req, res) => {
  await ensureAcademicSqlReady();
  const classRecord = await getClassById(req.params.id);

  if (!classRecord) {
    return res.status(404).json({ message: 'Class not found' });
  }

  res.json({
    success: true,
    class: classRecord,
  });
});

const createClass = asyncHandler(async (req, res) => {
  await ensureAcademicSqlReady();
  const { name, displayName, sortOrder, isActive } = req.body;

  const classRecord = await createClassRecord({
    name,
    displayName: displayName || name,
    sortOrder: sortOrder !== undefined ? Number(sortOrder) : undefined,
    isActive: parseBooleanInput(isActive) !== false,
  });

  res.status(201).json({
    success: true,
    class: classRecord,
  });
});

const updateClass = asyncHandler(async (req, res) => {
  await ensureAcademicSqlReady();
  const currentRecord = await getClassById(req.params.id);

  if (!currentRecord) {
    return res.status(404).json({ message: 'Class not found' });
  }

  const { name, displayName, sortOrder, isActive } = req.body;
  const classRecord = await updateClassRecord({
    id: req.params.id,
    name: name || currentRecord.name,
    displayName: displayName || currentRecord.displayName,
    sortOrder: sortOrder !== undefined ? Number(sortOrder) : currentRecord.sortOrder,
    isActive: parseBooleanInput(isActive) !== undefined ? parseBooleanInput(isActive) : currentRecord.isActive,
  });

  res.json({
    success: true,
    class: classRecord,
  });
});

const deleteClass = asyncHandler(async (req, res) => {
  await ensureAcademicSqlReady();
  const classRecord = await getClassById(req.params.id);

  if (!classRecord) {
    return res.status(404).json({ message: 'Class not found' });
  }

  await deleteClassRecord(req.params.id);

  res.json({
    success: true,
    message: 'Class deleted',
  });
});

module.exports = {
  getClasses,
  getClassById: getClassByIdController,
  createClass,
  updateClass,
  deleteClass,
};
