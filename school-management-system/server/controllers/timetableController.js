const { asyncHandler } = require('../middleware/errorMiddleware');
const {
  getTimetableList,
  getTimetableByIdFromSql,
  getTimetableByClassFromSql,
  getTeacherTimetableFromSql,
  createTimetableRecord,
  updateTimetableRecord,
  deleteTimetableRecord,
  copyTimetableRecord,
} = require('../services/timetableSqlService');

// @desc    Get timetables
// @route   GET /api/timetables
// @access  Private
const getTimetables = asyncHandler(async (req, res) => {
  const { class: className, section, academicYear, day } = req.query;

  const timetables = await getTimetableList({
    className,
    section,
    academicYear,
    day,
  });

  res.status(200).json({ success: true, timetables, data: timetables });
});

// @desc    Get single timetable by ID
// @route   GET /api/timetables/:id
// @access  Private
const getTimetableById = asyncHandler(async (req, res) => {
  const timetable = await getTimetableByIdFromSql(req.params.id);

  if (!timetable) {
    return res.status(404).json({ success: false, message: 'Timetable not found' });
  }

  res.status(200).json({ success: true, timetable, data: timetable });
});

// @desc    Get timetable for a class
// @route   GET /api/timetables/class/:class
// @access  Private
const getTimetableByClass = asyncHandler(async (req, res) => {
  const { section, academicYear } = req.query;

  const timetables = await getTimetableByClassFromSql({
    className: req.params.class,
    section,
    academicYear,
  });

  res.status(200).json({ success: true, timetables, data: timetables });
});

// @desc    Create new timetable
// @route   POST /api/timetables
// @access  Private (Admin)
const createTimetable = asyncHandler(async (req, res) => {
  const result = await createTimetableRecord(req.body);

  if (result?.resultCode === 'already_exists') {
    return res.status(400).json({
      success: false,
      message: 'Timetable already exists for this class/section/day',
    });
  }

  if (result?.resultCode === 'invalid_payload') {
    return res.status(400).json({ success: false, message: 'Please add at least one complete timetable period.' });
  }

  res.status(201).json({ success: true, timetable: result.timetable, data: result.timetable });
});

// @desc    Update timetable
// @route   PUT /api/timetables/:id
// @access  Private (Admin)
const updateTimetable = asyncHandler(async (req, res) => {
  const result = await updateTimetableRecord(req.params.id, req.body);

  if (result?.resultCode === 'not_found') {
    return res.status(404).json({ success: false, message: 'Timetable not found' });
  }

  if (result?.resultCode === 'already_exists') {
    return res.status(400).json({
      success: false,
      message: 'Target timetable already exists for this class/section/day',
    });
  }

  if (result?.resultCode === 'invalid_payload') {
    return res.status(400).json({ success: false, message: 'Please add at least one complete timetable period.' });
  }

  res.status(200).json({ success: true, timetable: result.timetable, data: result.timetable });
});

// @desc    Delete timetable
// @route   DELETE /api/timetables/:id
// @access  Private (Admin)
const deleteTimetable = asyncHandler(async (req, res) => {
  const result = await deleteTimetableRecord(req.params.id);

  if (result?.resultCode === 'not_found') {
    return res.status(404).json({ success: false, message: 'Timetable not found' });
  }

  res.status(200).json({ success: true, message: 'Timetable deleted successfully' });
});

// @desc    Get teacher's timetable
// @route   GET /api/timetables/teacher/:teacherId
// @access  Private (Teacher)
const getTeacherTimetable = asyncHandler(async (req, res) => {
  const { academicYear, day } = req.query;
  const timetables = await getTeacherTimetableFromSql({
    teacherId: req.params.teacherId,
    academicYear,
    day,
  });

  res.status(200).json({ success: true, timetables, data: timetables });
});

// @desc    Copy timetable to another class/section
// @route   POST /api/timetables/copy
// @access  Private (Admin)
const copyTimetable = asyncHandler(async (req, res) => {
  const result = await copyTimetableRecord(req.body);

  if (result?.resultCode === 'source_not_found') {
    return res.status(404).json({
      success: false,
      message: 'Source timetable not found',
    });
  }

  if (result?.resultCode === 'already_exists') {
    return res.status(400).json({
      success: false,
      message: 'Target timetable already exists',
    });
  }

  res.status(201).json({ 
    success: true, 
    message: `Timetable copied to ${req.body.targetClass}-${req.body.targetSection}` 
  });
});

module.exports = {
  getTimetables,
  getTimetableById,
  getTimetableByClass,
  createTimetable,
  updateTimetable,
  deleteTimetable,
  getTeacherTimetable,
  copyTimetable
};

