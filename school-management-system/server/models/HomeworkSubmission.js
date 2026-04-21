const mongoose = require('mongoose');

const homeworkSubmissionSchema = new mongoose.Schema({
  homeworkId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Homework',
    required: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: false
  },
  studentSqlId: {
    type: Number
  },
  studentFullName: {
    type: String,
    trim: true
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  submissionText: {
    type: String
  },
  attachmentUrl: {
    type: String
  },
  attachmentName: {
    type: String
  },
  status: {
    type: String,
    enum: ['submitted', 'late', 'graded', 'not submitted'],
    default: 'submitted'
  },
  marksObtained: {
    type: Number
  },
  feedback: {
    type: String
  },
  gradedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  gradedByName: {
    type: String,
    trim: true
  },
  gradedAt: {
    type: Date
  }
}, { 
  timestamps: true 
});

// Index for faster queries
homeworkSubmissionSchema.index({ homeworkId: 1, studentId: 1 });
homeworkSubmissionSchema.index({ homeworkId: 1, studentSqlId: 1 });
homeworkSubmissionSchema.index({ studentId: 1, status: 1 });
homeworkSubmissionSchema.index({ studentSqlId: 1, status: 1 });

module.exports = mongoose.model('HomeworkSubmission', homeworkSubmissionSchema);

