const Message = require('../models/Message');
const Parent = require('../models/Parent');
const User = require('../models/User');
const { asyncHandler } = require('../middleware/errorMiddleware');

// @desc    Send a message
// @route   POST /api/messages
// @access  Private
const sendMessage = asyncHandler(async (req, res) => {
  const { receiverId, subject, message, studentId } = req.body;

  // Get sender info
  const sender = await User.findById(req.user._id);
  
  let parentId = null;
  let teacherId = null;

  // If sender is parent, get their parent profile
  if (sender.role === 'parent') {
    const parent = await Parent.findOne({ userId: req.user._id });
    if (parent) {
      parentId = parent._id;
    }
  }

  // If sender is teacher
  if (sender.role === 'teacher') {
    teacherId = req.user._id;
  }

  const newMessage = await Message.create({
    senderId: req.user._id,
    senderRole: sender.role,
    receiverId,
    subject,
    message,
    studentId,
    parentId,
    teacherId
  });

  const populatedMessage = await Message.findById(newMessage._id)
    .populate('senderId', 'fullName')
    .populate('receiverId', 'fullName');

  res.status(201).json({
    success: true,
    message: populatedMessage
  });
});

// @desc    Get messages for current user
// @route   GET /api/messages
// @access  Private
const getMessages = asyncHandler(async (req, res) => {
  const { type = 'all' } = req.query; // all, sent, received
  
  let query = {};
  
  if (type === 'sent') {
    query = { senderId: req.user._id };
  } else if (type === 'received') {
    query = { receiverId: req.user._id };
  } else {
    query = {
      $or: [
        { senderId: req.user._id },
        { receiverId: req.user._id }
      ]
    };
  }

  const messages = await Message.find(query)
    .populate('senderId', 'fullName role')
    .populate('receiverId', 'fullName role')
    .sort({ createdAt: -1 })
    .limit(50);

  res.json({
    success: true,
    messages
  });
});

// @desc    Get conversation with a specific user
// @route   GET /api/messages/conversation/:userId
// @access  Private
const getConversation = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const messages = await Message.find({
    $or: [
      { senderId: req.user._id, receiverId: userId },
      { senderId: userId, receiverId: req.user._id }
    ]
  })
    .populate('senderId', 'fullName role')
    .populate('receiverId', 'fullName role')
    .sort({ createdAt: 1 });

  // Mark messages as read
  await Message.updateMany(
    { senderId: userId, receiverId: req.user._id, isRead: false },
    { isRead: true }
  );

  res.json({
    success: true,
    messages
  });
});

// @desc    Get unread messages count
// @route   GET /api/messages/unread
// @access  Private
const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Message.countDocuments({
    receiverId: req.user._id,
    isRead: false
  });

  res.json({
    success: true,
    unreadCount: count
  });
});

// @desc    Mark message as read
// @route   PUT /api/messages/:id/read
// @access  Private
const markAsRead = asyncHandler(async (req, res) => {
  const message = await Message.findOneAndUpdate(
    { _id: req.params.id, receiverId: req.user._id },
    { isRead: true },
    { new: true }
  );

  if (!message) {
    return res.status(404).json({ message: 'Message not found' });
  }

  res.json({
    success: true,
    message
  });
});

// @desc    Delete message
// @route   DELETE /api/messages/:id
// @access  Private
const deleteMessage = asyncHandler(async (req, res) => {
  const message = await Message.findOne({
    _id: req.params.id,
    $or: [
      { senderId: req.user._id },
      { receiverId: req.user._id }
    ]
  });

  if (!message) {
    return res.status(404).json({ message: 'Message not found' });
  }

  await Message.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
    message: 'Message deleted'
  });
});

// @desc    Get contacts for messaging
// @route   GET /api/messages/contacts
// @access  Private
const getContacts = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  let contacts = [];

  if (user.role === 'parent') {
    // Get teachers
    const Parent = require('../models/Parent');
    const parent = await Parent.findOne({ userId: req.user._id });
    
    if (parent) {
      const Student = require('../models/Student');
      const student = await Student.findById(parent.childId);
      
      if (student) {
        // Get teachers who teach this class
        const Subject = require('../models/Subject');
        const subjects = await Subject.find({ grade: student.class });
        const subjectTeacherIds = subjects.map(s => s.teacher).filter(Boolean);
        
        contacts = await User.find({
          _id: { $in: subjectTeacherIds },
          role: 'teacher'
        }).select('fullName email role');
      }
    }
  } else if (user.role === 'teacher') {
    // Get all parents
    const Parent = require('../models/Parent');
    const parents = await Parent.find().populate('userId', 'fullName email');
    contacts = parents.map(p => ({
      _id: p.userId._id,
      fullName: p.fullName,
      email: p.email,
      role: 'parent',
      childId: p.childId
    }));
  }

  res.json({
    success: true,
    contacts
  });
});

module.exports = {
  sendMessage,
  getMessages,
  getConversation,
  getUnreadCount,
  markAsRead,
  deleteMessage,
  getContacts
};

