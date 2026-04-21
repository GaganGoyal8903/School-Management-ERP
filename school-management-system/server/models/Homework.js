const mongoose = require('mongoose');

const homeworkSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: false
  },
  subjectName: {
    type: String,
    trim: true
  },
  class: {
    type: String,
    required: true
  },
  section: {
    type: String,
    trim: true
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  assignedByName: {
    type: String,
    trim: true
  },
  dueDate: {
    type: Date,
    required: true
  },
  attachmentUrl: {
    type: String
  },
  attachmentName: {
    type: String
  },
  totalMarks: {
    type: Number,
    default: 100
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { 
  timestamps: true 
});

// Index for faster queries
homeworkSchema.index({ class: 1, dueDate: 1 });

module.exports = mongoose.model('Homework', homeworkSchema);

