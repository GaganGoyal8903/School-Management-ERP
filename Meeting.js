const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Parent',
    required: true
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject'
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String
  },
  requestedDate: {
    type: Date,
    required: true
  },
  requestedTime: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'completed', 'cancelled'],
    default: 'pending'
  },
  meetingDate: {
    type: Date
  },
  meetingTime: {
    type: String
  },
  meetingLink: {
    type: String
  },
  meetingPlatform: {
    type: String,
    enum: ['googleMeet', 'zoom', 'teams', 'webRTC', 'other'],
    default: 'other'
  },
  teacherNotes: {
    type: String
  },
  parentNotes: {
    type: String
  },
  isOnline: {
    type: Boolean,
    default: true
  }
}, { 
  timestamps: true 
});

// Index for faster queries
meetingSchema.index({ parentId: 1, status: 1 });
meetingSchema.index({ teacherId: 1, status: 1 });

module.exports = mongoose.model('Meeting', meetingSchema);

