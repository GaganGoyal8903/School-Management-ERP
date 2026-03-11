const Meeting = require('../models/Meeting');
const Parent = require('../models/Parent');
const Student = require('../models/Student');
const User = require('../models/User');
const { asyncHandler } = require('../middleware/errorMiddleware');

// @desc    Request a meeting
// @route   POST /api/meetings
// @access  Private (Parent)
const requestMeeting = asyncHandler(async (req, res) => {
  const { teacherId, subjectId, title, description, requestedDate, requestedTime, isOnline } = req.body;

  // Get parent profile
  const parent = await Parent.findOne({ userId: req.user._id });
  if (!parent) {
    return res.status(404).json({ message: 'Parent profile not found' });
  }

  // Get student
  const student = await Student.findById(parent.childId);
  if (!student) {
    return res.status(404).json({ message: 'Student not found' });
  }

  const meeting = await Meeting.create({
    parentId: parent._id,
    teacherId,
    studentId: student._id,
    subject: subjectId,
    title,
    description,
    requestedDate,
    requestedTime,
    isOnline
  });

  const populatedMeeting = await Meeting.findById(meeting._id)
    .populate('teacherId', 'fullName email')
    .populate('studentId', 'fullName rollNumber class')
    .populate('parentId', 'fullName phone');

  res.status(201).json({
    success: true,
    meeting: populatedMeeting
  });
});

// @desc    Get meetings for parent
// @route   GET /api/meetings
// @access  Private (Parent)
const getParentMeetings = asyncHandler(async (req, res) => {
  const parent = await Parent.findOne({ userId: req.user._id });
  if (!parent) {
    return res.status(404).json({ message: 'Parent profile not found' });
  }

  const { status } = req.query;
  let query = { parentId: parent._id };
  if (status) query.status = status;

  const meetings = await Meeting.find(query)
    .populate('teacherId', 'fullName email')
    .populate('subject', 'name')
    .populate('studentId', 'fullName rollNumber class')
    .sort({ requestedDate: -1 });

  res.json({
    success: true,
    meetings
  });
});

// @desc    Get meetings for teacher
// @route   GET /api/meetings/teacher
// @access  Private (Teacher)
const getTeacherMeetings = asyncHandler(async (req, res) => {
  const { status } = req.query;
  let query = { teacherId: req.user._id };
  if (status) query.status = status;

  const meetings = await Meeting.find(query)
    .populate('parentId', 'fullName phone')
    .populate('studentId', 'fullName rollNumber class section')
    .populate('subject', 'name')
    .sort({ requestedDate: -1 });

  res.json({
    success: true,
    meetings
  });
});

// @desc    Update meeting status (approve/reject)
// @route   PUT /api/meetings/:id/status
// @access  Private (Teacher)
const updateMeetingStatus = asyncHandler(async (req, res) => {
  const { status, meetingDate, meetingTime, meetingLink, meetingPlatform, teacherNotes } = req.body;

  const meeting = await Meeting.findOne({
    _id: req.params.id,
    teacherId: req.user._id
  });

  if (!meeting) {
    return res.status(404).json({ message: 'Meeting not found' });
  }

  meeting.status = status;
  if (meetingDate) meeting.meetingDate = meetingDate;
  if (meetingTime) meeting.meetingTime = meetingTime;
  if (meetingLink) meeting.meetingLink = meetingLink;
  if (meetingPlatform) meeting.meetingPlatform = meetingPlatform;
  if (teacherNotes) meeting.teacherNotes = teacherNotes;

  await meeting.save();

  const populatedMeeting = await Meeting.findById(meeting._id)
    .populate('teacherId', 'fullName email')
    .populate('parentId', 'fullName phone')
    .populate('studentId', 'fullName rollNumber class')
    .populate('subject', 'name');

  res.json({
    success: true,
    meeting: populatedMeeting
  });
});

// @desc    Cancel meeting
// @route   PUT /api/meetings/:id/cancel
// @access  Private (Parent/Teacher)
const cancelMeeting = asyncHandler(async (req, res) => {
  const { notes, cancelledBy } = req.body;

  const meeting = await Meeting.findOne({
    _id: req.params.id,
    $or: [
      { teacherId: req.user._id },
      { parentId: req.user._id }
    ]
  });

  if (!meeting) {
    return res.status(404).json({ message: 'Meeting not found' });
  }

  meeting.status = 'cancelled';
  if (cancelledBy === 'parent') {
    meeting.parentNotes = notes;
  } else {
    meeting.teacherNotes = notes;
  }

  await meeting.save();

  res.json({
    success: true,
    meeting
  });
});

// @desc    Complete meeting
// @route   PUT /api/meetings/:id/complete
// @access  Private (Teacher)
const completeMeeting = asyncHandler(async (req, res) => {
  const { teacherNotes } = req.body;

  const meeting = await Meeting.findOne({
    _id: req.params.id,
    teacherId: req.user._id
  });

  if (!meeting) {
    return res.status(404).json({ message: 'Meeting not found' });
  }

  meeting.status = 'completed';
  meeting.teacherNotes = teacherNotes || meeting.teacherNotes;

  await meeting.save();

  res.json({
    success: true,
    meeting
  });
});

// @desc    Get single meeting
// @route   GET /api/meetings/:id
// @access  Private
const getMeeting = asyncHandler(async (req, res) => {
  const meeting = await Meeting.findOne({
    _id: req.params.id,
    $or: [
      { teacherId: req.user._id },
      { parentId: req.user._id }
    ]
  })
    .populate('teacherId', 'fullName email')
    .populate('parentId', 'fullName phone')
    .populate('studentId', 'fullName rollNumber class section')
    .populate('subject', 'name');

  if (!meeting) {
    return res.status(404).json({ message: 'Meeting not found' });
  }

  res.json({
    success: true,
    meeting
  });
});

module.exports = {
  requestMeeting,
  getParentMeetings,
  getTeacherMeetings,
  updateMeetingStatus,
  cancelMeeting,
  completeMeeting,
  getMeeting
};

