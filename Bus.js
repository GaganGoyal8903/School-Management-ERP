const mongoose = require('mongoose');

const busSchema = new mongoose.Schema({
  busNumber: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  registrationNumber: {
    type: String,
    required: true,
    unique: true
  },
  driverName: {
    type: String,
    required: true
  },
  driverPhone: {
    type: String,
    required: true
  },
  driverLicense: {
    type: String
  },
  routeName: {
    type: String,
    required: true
  },
  routeStops: [{
    name: String,
    arrivalTime: String,
    latitude: Number,
    longitude: Number,
    order: Number
  }],
  capacity: {
    type: Number,
    default: 50
  },
  gpsLocation: {
    latitude: {
      type: Number,
      default: 0
    },
    longitude: {
      type: Number,
      default: 0
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    },
    speed: {
      type: Number,
      default: 0
    }
  },
  currentStatus: {
    type: String,
    enum: ['Active', 'Inactive', 'Maintenance', 'On Route', 'Idle'],
    default: 'Active'
  },
  fuelLevel: {
    type: Number,
    min: 0,
    max: 100,
    default: 100
  },
  insuranceExpiry: {
    type: Date
  },
  permitExpiry: {
    type: Date
  },
  fitnessCertificateExpiry: {
    type: Date
  },
  assignedStudents: [{
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student'
    },
    stopName: String
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for efficient queries
busSchema.index({ routeName: 1 });
busSchema.index({ currentStatus: 1 });

module.exports = mongoose.model('Bus', busSchema);

