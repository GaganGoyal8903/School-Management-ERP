const Timetable = require('../models/Timetable');
const Subject = require('../models/Subject');
const { asyncHandler } = require('../middleware/errorMiddleware');

// @desc    Get timetables
// @route   GET /api/timetables
// @access  Private
const getTimetables = asyncHandler(async (req, res) => {
  const { class: className, section, academicYear, day } = req.query;
  
  const query = {};
  if (className) query.class = className;
  if (section) query.section = section;
  if (academicYear) query.academicYear = academicYear;
  if (day) query.day = day;
  query.isActive = true;

  const timetables = await Timetable.find(query)
    .populate('periods.subject', 'name code')
    .populate('periods.teacher', 'fullName')
    .sort({ day: 1, 'periods.periodNumber': 1 });

  res.status(200).json({ success: true, data: timetables });
});

// @desc    Get single timetable by ID
// @route   GET /api/timetables/:id
// @access  Private
const getTimetableById = asyncHandler(async (req, res) => {
  const timetable = await Timetable.findById(req.params.id)
    .populate('periods.subject', 'name code')
    .populate('periods.teacher', 'fullName email');

  if (!timetable) {
    return res.status(404).json({ success: false, message: 'Timetable not found' });
  }

  res.status(200).json({ success: true, data: timetable });
});

// @desc    Get timetable for a class
// @route   GET /api/timetables/class/:class
// @access  Private
const getTimetableByClass = asyncHandler(async (req, res) => {
  const { section, academicYear } = req.query;
  
  const query = {
    class: req.params.class,
    isActive: true
  };
  
  if (section) query.section = section;
  if (academicYear) query.academicYear = academicYear;

  const timetables = await Timetable.find(query)
    .populate('periods.subject', 'name code')
    .populate('periods.teacher', 'fullName')
    .sort({ day: 1, 'periods.periodNumber': 1 });

  res.status(200).json({ success: true, data: timetables });
});

// @desc    Create new timetable
// @route   POST /api/timetables
// @access  Private (Admin)
const createTimetable = asyncHandler(async (req, res) => {
  const { class: className, section, academicYear, day } = req.body;

  // Check if timetable exists for this class/section/day
  const existing = await Timetable.findOne({
    class: className,
    section: section || 'A',
    academicYear: academicYear || '2024-2025',
    day,
    isActive: true
  });

  if (existing) {
    return res.status(400).json({ 
      success: false, 
      message: 'Timetable already exists for this class/section/day' 
    });
  }

  const timetable = await Timetable.create({
    ...req.body,
    createdBy: req.user._id
  });

  await timetable.populate('periods.subject', 'name code');
  await timetable.populate('periods.teacher', 'fullName');

  res.status(201).json({ success: true, data: timetable });
});

// @desc    Update timetable
// @route   PUT /api/timetables/:id
// @access  Private (Admin)
const updateTimetable = asyncHandler(async (req, res) => {
  let timetable = await Timetable.findById(req.params.id);

  if (!timetable) {
    return res.status(404).json({ success: false, message: 'Timetable not found' });
  }

  timetable = await Timetable.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  )
    .populate('periods.subject', 'name code')
    .populate('periods.teacher', 'fullName');

  res.status(200).json({ success: true, data: timetable });
});

// @desc    Delete timetable
// @route   DELETE /api/timetables/:id
// @access  Private (Admin)
const deleteTimetable = asyncHandler(async (req, res) => {
  const timetable = await Timetable.findById(req.params.id);

  if (!timetable) {
    return res.status(404).json({ success: false, message: 'Timetable not found' });
  }

  timetable.isActive = false;
  await timetable.save();

  res.status(200).json({ success: true, message: 'Timetable deleted successfully' });
});

// @desc    Get teacher's timetable
// @route   GET /api/timetables/teacher/:teacherId
// @access  Private (Teacher)
const getTeacherTimetable = asyncHandler(async (req, res) => {
  const { academicYear, day } = req.query;

  const timetables = await Timetable.find({
    'periods.teacher': req.params.teacherId,
    academicYear: academicYear || '2024-2025',
    isActive: true
  })
    .populate('periods.subject', 'name code')
    .populate('class', 'name')
    .sort({ day: 1, 'periods.periodNumber': 1 });

  if (day) {
    const filtered = timetables.filter(t => t.day === day);
    return res.status(200).json({ success: true, data: filtered });
  }

  res.status(200).json({ success: true, data: timetables });
});

// @desc    Copy timetable to another class/section
// @route   POST /api/timetables/copy
// @access  Private (Admin)
const copyTimetable = asyncHandler(async (req, res) => {
  const { sourceClass, sourceSection, targetClass, targetSection, academicYear } = req.body;

  const sourceTimetables = await Timetable.find({
    class: sourceClass,
    section: sourceSection,
    academicYear,
    isActive: true
  });

  if (sourceTimetables.length === 0) {
    return res.status(404).json({ 
      success: false, 
      message: 'Source timetable not found' 
    });
  }

  const newTimetables = sourceTimetables.map(t => ({
    class: targetClass,
    section: targetSection,
    academicYear,
    day: t.day,
    periods: t.periods,
    createdBy: req.user._id
  }));

  await Timetable.insertMany(newTimetables);

  res.status(201).json({ 
    success: true, 
    message: `Timetable copied to ${targetClass}-${targetSection}` 
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

