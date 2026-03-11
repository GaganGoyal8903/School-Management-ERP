const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: [true, 'Student ID is required']
  },
  date: {
    type: Date,
    required: [true, 'Date is required'],
    default: Date.now
  },
  status: {
    type: String,
    required: [true, 'Status is required'],
    enum: ['Present', 'Absent', 'Late', 'Half Day'],
    default: 'Present'
  },
  class: {
    type: String,
    required: [true, 'Class is required']
  },
  section: {
    type: String,
    trim: true
  },
  markedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Teacher ID is required']
  },
  remarks: {
    type: String,
    trim: true
  }
}, { 
  timestamps: true 
});

// Compound index for efficient queries
attendanceSchema.index({ studentId: 1, date: -1 });
attendanceSchema.index({ class: 1, date: 1 });
attendanceSchema.index({ date: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);

