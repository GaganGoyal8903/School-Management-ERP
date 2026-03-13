const { asyncHandler } = require('../middleware/errorMiddleware');
const {
  ensureAcademicSqlReady,
  getSectionList,
  getSectionById,
  createSectionRecord,
  updateSectionRecord,
  deleteSectionRecord,
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

const getSections = asyncHandler(async (req, res) => {
  await ensureAcademicSqlReady();
  const { page = 1, limit = 50, search } = req.query;

  const result = await getSectionList({ page, limit, search });

  res.json({
    success: true,
    sections: result.sections,
    pagination: {
      total: result.total,
      page: Number(page) || 1,
      pages: Math.ceil(result.total / (Number(limit) || 50)),
    },
  });
});

const getSectionByIdController = asyncHandler(async (req, res) => {
  await ensureAcademicSqlReady();
  const sectionRecord = await getSectionById(req.params.id);

  if (!sectionRecord) {
    return res.status(404).json({ message: 'Section not found' });
  }

  res.json({
    success: true,
    section: sectionRecord,
  });
});

const createSection = asyncHandler(async (req, res) => {
  await ensureAcademicSqlReady();
  const { name, displayName, sortOrder, isActive } = req.body;

  const sectionRecord = await createSectionRecord({
    name,
    displayName: displayName || name,
    sortOrder: sortOrder !== undefined ? Number(sortOrder) : undefined,
    isActive: parseBooleanInput(isActive) !== false,
  });

  res.status(201).json({
    success: true,
    section: sectionRecord,
  });
});

const updateSection = asyncHandler(async (req, res) => {
  await ensureAcademicSqlReady();
  const currentRecord = await getSectionById(req.params.id);

  if (!currentRecord) {
    return res.status(404).json({ message: 'Section not found' });
  }

  const { name, displayName, sortOrder, isActive } = req.body;
  const sectionRecord = await updateSectionRecord({
    id: req.params.id,
    name: name || currentRecord.name,
    displayName: displayName || currentRecord.displayName,
    sortOrder: sortOrder !== undefined ? Number(sortOrder) : currentRecord.sortOrder,
    isActive: parseBooleanInput(isActive) !== undefined ? parseBooleanInput(isActive) : currentRecord.isActive,
  });

  res.json({
    success: true,
    section: sectionRecord,
  });
});

const deleteSection = asyncHandler(async (req, res) => {
  await ensureAcademicSqlReady();
  const sectionRecord = await getSectionById(req.params.id);

  if (!sectionRecord) {
    return res.status(404).json({ message: 'Section not found' });
  }

  await deleteSectionRecord(req.params.id);

  res.json({
    success: true,
    message: 'Section deleted',
  });
});

module.exports = {
  getSections,
  getSectionById: getSectionByIdController,
  createSection,
  updateSection,
  deleteSection,
};
