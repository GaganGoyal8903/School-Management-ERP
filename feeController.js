const Fee = require('../models/Fee');
const Student = require('../models/Student');
const { asyncHandler } = require('../middleware/errorMiddleware');

// @desc    Get all fees with pagination
// @route   GET /api/fees
// @access  Private (Admin, Teacher)
const getFees = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const query = {};
  
  if (req.query.class) query.class = req.query.class;
  if (req.query.status) query.status = req.query.status;
  if (req.query.studentId) query.studentId = req.query.studentId;
  if (req.query.academicYear) query.academicYear = req.query.academicYear;

  const total = await Fee.countDocuments(query);
  const fees = await Fee.find(query)
    .populate('studentId', 'fullName class section rollNumber')
    .populate('createdBy', 'fullName')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.status(200).json({
    success: true,
    data: fees,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

// @desc    Get single fee by ID
// @route   GET /api/fees/:id
// @access  Private
const getFeeById = asyncHandler(async (req, res) => {
  const fee = await Fee.findById(req.params.id)
    .populate('studentId', 'fullName class section rollNumber email phone guardianName guardianPhone')
    .populate('createdBy', 'fullName');

  if (!fee) {
    return res.status(404).json({ success: false, message: 'Fee record not found' });
  }

  res.status(200).json({ success: true, data: fee });
});

// @desc    Get fee by student ID
// @route   GET /api/fees/student/:studentId
// @access  Private
const getFeesByStudent = asyncHandler(async (req, res) => {
  const fees = await Fee.find({ studentId: req.params.studentId })
    .populate('createdBy', 'fullName')
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, data: fees });
});

// @desc    Create new fee
// @route   POST /api/fees
// @access  Private (Admin)
const createFee = asyncHandler(async (req, res) => {
  const fee = await Fee.create({
    ...req.body,
    createdBy: req.user._id
  });

  await fee.populate('studentId', 'fullName class section rollNumber');

  res.status(201).json({ success: true, data: fee });
});

// @desc    Update fee
// @route   PUT /api/fees/:id
// @access  Private (Admin)
const updateFee = asyncHandler(async (req, res) => {
  let fee = await Fee.findById(req.params.id);

  if (!fee) {
    return res.status(404).json({ success: false, message: 'Fee record not found' });
  }

  fee = await Fee.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  ).populate('studentId', 'fullName class section rollNumber');

  res.status(200).json({ success: true, data: fee });
});

// @desc    Collect fee payment
// @route   POST /api/fees/:id/pay
// @access  Private (Admin)
const collectPayment = asyncHandler(async (req, res) => {
  const { amount, mode, transactionId, notes } = req.body;

  const fee = await Fee.findById(req.params.id);

  if (!fee) {
    return res.status(404).json({ success: false, message: 'Fee record not found' });
  }

  // Generate receipt number
  const receiptNumber = `RCPT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  // Add payment
  const payment = {
    amount,
    date: new Date(),
    mode,
    transactionId,
    receiptNumber,
    notes
  };

  fee.payments.push(payment);
  fee.paidAmount += amount;
  fee.paymentMode = mode;
  fee.paymentDate = new Date();
  fee.transactionId = transactionId;
  fee.receiptNumber = receiptNumber;

  // Update status
  const pendingAmount = fee.amount + fee.lateFee - fee.discount - fee.paidAmount;
  if (pendingAmount <= 0) {
    fee.status = 'Paid';
  } else if (fee.paidAmount > 0) {
    fee.status = 'Partial';
  }

  await fee.save();

  res.status(200).json({ 
    success: true, 
    data: fee,
    receipt: payment
  });
});

// @desc    Delete fee
// @route   DELETE /api/fees/:id
// @access  Private (Admin)
const deleteFee = asyncHandler(async (req, res) => {
  const fee = await Fee.findById(req.params.id);

  if (!fee) {
    return res.status(404).json({ success: false, message: 'Fee record not found' });
  }

  // Don't allow deletion if payment has been made
  if (fee.paidAmount > 0) {
    return res.status(400).json({ 
      success: false, 
      message: 'Cannot delete fee record with payments' 
    });
  }

  await fee.deleteOne();

  res.status(200).json({ success: true, message: 'Fee record deleted' });
});

// @desc    Get fee statistics
// @route   GET /api/fees/stats
// @access  Private (Admin)
const getFeeStats = asyncHandler(async (req, res) => {
  const { academicYear } = req.query;
  
  const matchQuery = academicYear ? { academicYear } : {};

  const stats = await Fee.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: '$status',
        total: { $sum: '$amount' },
        paid: { $sum: '$paidAmount' },
        count: { $sum: 1 }
      }
    }
  ]);

  const totalFees = stats.reduce((acc, s) => acc + s.total, 0);
  const collectedFees = stats.reduce((acc, s) => acc + s.paid, 0);
  const pendingFees = totalFees - collectedFees;

  // Get overdue fees
  const overdueCount = await Fee.countDocuments({
    ...matchQuery,
    status: { $in: ['Pending', 'Partial'] },
    dueDate: { $lt: new Date() }
  });

  // Return in format expected by frontend
  res.status(200).json({
    success: true,
    data: {
      totalFees,
      collectedFees,
      pendingFees,
      totalPaid: collectedFees,
      totalPending: pendingFees,
      overdueCount,
      byStatus: stats
    }
  });
});

// @desc    Bulk create fees for a class
// @route   POST /api/fees/bulk
// @access  Private (Admin)
const bulkCreateFees = asyncHandler(async (req, res) => {
  const { class: className, academicYear, feeType, amount, dueDate } = req.body;

  // Get all students in the class
  const students = await Student.find({ class: className, isActive: true });

  if (students.length === 0) {
    return res.status(404).json({ 
      success: false, 
      message: 'No active students found in this class' 
    });
  }

  const fees = students.map(student => ({
    studentId: student._id,
    academicYear,
    class: className,
    feeType,
    amount,
    dueDate,
    status: 'Pending',
    createdBy: req.user._id
  }));

  const createdFees = await Fee.insertMany(fees);

  res.status(201).json({ 
    success: true, 
    count: createdFees.length,
    data: createdFees 
  });
});

module.exports = {
  getFees,
  getFeeById,
  getFeesByStudent,
  createFee,
  updateFee,
  collectPayment,
  deleteFee,
  getFeeStats,
  bulkCreateFees
};

