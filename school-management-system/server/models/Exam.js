const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Exam name is required'],
    trim: true
  },
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: [true, 'Subject is required']
  },
  class: {
    type: String,
    required: [true, 'Class is required']
  },
  section: {
    type: String,
    trim: true
  },
  examDate: {
    type: Date,
    required: [true, 'Exam date is required']
  },
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  },
  totalMarks: {
    type: Number,
    required: [true, 'Total marks is required'],
    min: 0
  },
  passingMarks: {
    type: Number,
    required: [true, 'Passing marks is required'],
    min: 0
  },
  instructions: {
    type: String,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { 
  timestamps: true 
});

// Index for queries
examSchema.index({ class: 1, examDate: 1 });
examSchema.index({ subject: 1 });

module.exports = mongoose.model('Exam', examSchema);

