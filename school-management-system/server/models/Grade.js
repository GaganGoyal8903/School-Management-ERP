const mongoose = require('mongoose');

const gradeSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: [true, 'Student ID is required']
  },
  examId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    required: [true, 'Exam ID is required']
  },
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: [true, 'Subject ID is required']
  },
  marksObtained: {
    type: Number,
    required: [true, 'Marks obtained is required'],
    min: 0
  },
  totalMarks: {
    type: Number,
    required: [true, 'Total marks is required'],
    min: 0
  },
  grade: {
    type: String,
    enum: ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F']
  },
  remarks: {
    type: String,
    trim: true
  },
  enteredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  class: {
    type: String,
    required: true
  },
  section: {
    type: String,
    trim: true
  }
}, { 
  timestamps: true 
});

// Compound indexes
gradeSchema.index({ studentId: 1, examId: 1 });
gradeSchema.index({ class: 1, subjectId: 1 });

module.exports = mongoose.model('Grade', gradeSchema);

