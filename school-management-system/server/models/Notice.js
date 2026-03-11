const mongoose = require('mongoose');

const noticeSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Notice title is required'],
    trim: true
  },
  content: {
    type: String,
    required: [true, 'Notice content is required']
  },
  priority: {
    type: String,
    enum: ['Low', 'Normal', 'High', 'Urgent'],
    default: 'Normal'
  },
  noticeType: {
    type: String,
    enum: ['General', 'Academic', 'Event', 'Holiday', 'Fee', 'Exam', 'Other'],
    default: 'General'
  },
  targetAudience: {
    type: String,
    enum: ['All', 'Students', 'Teachers', 'Parents', 'Staff'],
    default: 'All'
  },
  class: {
    type: String,
    trim: true
  },
  section: {
    type: String,
    trim: true
  },
  validFrom: {
    type: Date,
    default: Date.now
  },
  validUntil: {
    type: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  attachments: [{
    name: String,
    url: String
  }]
}, { 
  timestamps: true 
});

// Index for queries
noticeSchema.index({ priority: -1, createdAt: -1 });
noticeSchema.index({ targetAudience: 1, isActive: 1 });

module.exports = mongoose.model('Notice', noticeSchema);

