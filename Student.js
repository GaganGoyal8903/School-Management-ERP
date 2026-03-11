const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fullName: {
    type: String,
    required: [true, 'Student name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  class: {
    type: String,
    required: [true, 'Class is required'],
    trim: true
  },
  section: {
    type: String,
    trim: true,
    default: 'A'
  },
  rollNumber: {
    type: String,
    required: [true, 'Roll number is required'],
    unique: true,
    trim: true
  },
  dateOfBirth: {
    type: Date
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other']
  },
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String
  },
  guardianName: {
    type: String,
    trim: true
  },
  guardianPhone: {
    type: String,
    trim: true
  },
  guardianRelation: {
    type: String,
    enum: ['Father', 'Mother', 'Guardian', 'Other']
  },
  bloodGroup: {
    type: String,
    enum: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']
  },
  admissionDate: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for classId (alias for class field - useful for frontend)
studentSchema.virtual('classId').get(function() {
  return this.class;
});

// Virtual for sectionId (alias for section field - useful for frontend)
studentSchema.virtual('sectionId').get(function() {
  return this.section;
});

// Virtual for studentId (alias for _id - useful for frontend)
studentSchema.virtual('studentId').get(function() {
  return this._id;
});

// Virtual for attendance percentage
studentSchema.virtual('attendance', {
  ref: 'Attendance',
  localField: '_id',
  foreignField: 'studentId'
});

// Index for better query performance
studentSchema.index({ class: 1, section: 1 });

module.exports = mongoose.model('Student', studentSchema);

