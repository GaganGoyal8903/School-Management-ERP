const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema({
  studentId: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  studentDbId: {
    type: Number,
    default: null,
  },
  requestedByUserId: {
    type: String,
    default: null,
    trim: true,
  },
  fullName: {
    type: String,
    required: true,
    trim: true,
  },
  admissionNumber: {
    type: String,
    default: null,
    trim: true,
  },
  rollNumber: {
    type: String,
    default: null,
    trim: true,
  },
  className: {
    type: String,
    default: null,
    trim: true,
  },
  sectionName: {
    type: String,
    default: null,
    trim: true,
  },
  leaveType: {
    type: String,
    required: true,
    trim: true,
  },
  fromDate: {
    type: Date,
    required: true,
  },
  toDate: {
    type: Date,
    required: true,
  },
  daysRequested: {
    type: Number,
    required: true,
    min: 1,
  },
  reason: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000,
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending',
    index: true,
  },
  reviewNotes: {
    type: String,
    default: null,
    trim: true,
    maxlength: 2000,
  },
  reviewedAt: {
    type: Date,
    default: null,
  },
  reviewedByUserId: {
    type: String,
    default: null,
    trim: true,
  },
}, {
  timestamps: true,
});

leaveRequestSchema.index({ studentId: 1, createdAt: -1 });
leaveRequestSchema.index({ studentId: 1, fromDate: 1, toDate: 1 });

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);
