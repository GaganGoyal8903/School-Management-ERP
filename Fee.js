const mongoose = require('mongoose');

const feeSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  academicYear: {
    type: String,
    required: true,
    default: '2024-2025'
  },
  class: {
    type: String,
    required: true
  },
  feeType: {
    type: String,
    enum: ['Tuition', 'Transport', 'Hostel', 'Books', 'Uniform', 'Examination', 'Other'],
    default: 'Tuition'
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  paidAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  dueDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['Pending', 'Partial', 'Paid', 'Overdue', 'Exempted'],
    default: 'Pending'
  },
  paymentMode: {
    type: String,
    enum: ['Cash', 'Online', 'Cheque', 'DD', 'Bank Transfer', 'UPI'],
    default: null
  },
  paymentDate: {
    type: Date,
    default: null
  },
  receiptNumber: {
    type: String,
    unique: true,
    sparse: true
  },
  transactionId: {
    type: String
  },
  payments: [{
    amount: Number,
    date: Date,
    mode: String,
    transactionId: String,
    receiptNumber: String,
    notes: String
  }],
  lateFee: {
    type: Number,
    default: 0
  },
  discount: {
    type: Number,
    default: 0
  },
  discountReason: {
    type: String
  },
  remarks: {
    type: String
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Generate receipt number before saving
feeSchema.pre('save', async function(next) {
  if (!this.receiptNumber) {
    const count = await this.constructor.countDocuments();
    this.receiptNumber = `RCPT-${Date.now()}-${count + 1}`;
  }
  next();
});

// Virtual for remaining amount
feeSchema.virtual('pendingAmount').get(function() {
  return this.amount + this.lateFee - this.discount - this.paidAmount;
});

// Index for efficient queries
feeSchema.index({ studentId: 1, academicYear: 1 });
feeSchema.index({ class: 1, status: 1 });
feeSchema.index({ dueDate: 1 });

module.exports = mongoose.model('Fee', feeSchema);

