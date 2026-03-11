const mongoose = require('mongoose');

const timetableSchema = new mongoose.Schema({
  class: {
    type: String,
    required: true
  },
  section: {
    type: String,
    default: 'A'
  },
  academicYear: {
    type: String,
    required: true,
    default: '2024-2025'
  },
  day: {
    type: String,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    required: true
  },
  periods: [{
    periodNumber: {
      type: Number,
      required: true
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher'
    },
    startTime: {
      type: String,
      required: true
    },
    endTime: {
      type: String,
      required: true
    },
    roomNumber: String
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
timetableSchema.index({ class: 1, section: 1, academicYear: 1, day: 1 });

module.exports = mongoose.model('Timetable', timetableSchema);

