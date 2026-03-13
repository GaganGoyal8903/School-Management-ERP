const { asyncHandler } = require('../middleware/errorMiddleware');
const {
  getFeeList,
  getFeeRecordById,
  getFeesForStudent,
  createFeeRecord,
  updateFeeRecord,
  collectFeePaymentRecord,
  deleteFeeRecord,
  getFeeStatistics,
  bulkCreateFeeRecords,
} = require('../services/feeSqlService');

// @desc    Get all fees with pagination
// @route   GET /api/fees
// @access  Private (Admin, Teacher)
const getFees = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;

  const { fees, total } = await getFeeList({
    page,
    limit,
    search: req.query.search,
    className: req.query.class,
    status: req.query.status,
    studentId: req.query.studentId,
    academicYear: req.query.academicYear,
  });

  res.status(200).json({
    success: true,
    fees,
    data: fees,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

// @desc    Get single fee by ID
// @route   GET /api/fees/:id
// @access  Private
const getFeeById = asyncHandler(async (req, res) => {
  const fee = await getFeeRecordById(req.params.id);

  if (!fee) {
    return res.status(404).json({ success: false, message: 'Fee record not found' });
  }

  res.status(200).json({ success: true, fee, data: fee });
});

// @desc    Get fee by student ID
// @route   GET /api/fees/student/:studentId
// @access  Private
const getFeesByStudent = asyncHandler(async (req, res) => {
  const fees = await getFeesForStudent(req.params.studentId);
  res.status(200).json({ success: true, fees, data: fees });
});

// @desc    Create new fee
// @route   POST /api/fees
// @access  Private (Admin)
const createFee = asyncHandler(async (req, res) => {
  const fee = await createFeeRecord(req.body, req.user._id);

  if (!fee) {
    return res.status(404).json({ success: false, message: 'Student not found' });
  }

  res.status(201).json({ success: true, fee, data: fee });
});

// @desc    Update fee
// @route   PUT /api/fees/:id
// @access  Private (Admin)
const updateFee = asyncHandler(async (req, res) => {
  const fee = await updateFeeRecord(req.params.id, req.body);

  if (!fee) {
    return res.status(404).json({ success: false, message: 'Fee record not found' });
  }

  res.status(200).json({ success: true, fee, data: fee });
});

// @desc    Collect fee payment
// @route   POST /api/fees/:id/pay
// @access  Private (Admin)
const collectPayment = asyncHandler(async (req, res) => {
  const { fee, payment, resultCode } = await collectFeePaymentRecord(req.params.id, {
    ...req.body,
    receivedByUserId: req.user?._id ?? null,
  });

  if (resultCode === 'not_found') {
    return res.status(404).json({ success: false, message: 'Fee record not found' });
  }

  if (resultCode === 'invalid_amount') {
    return res.status(400).json({ success: false, message: 'Invalid payment amount' });
  }

  res.status(200).json({
    success: true,
    fee,
    data: fee,
    receipt: payment,
  });
});

// @desc    Delete fee
// @route   DELETE /api/fees/:id
// @access  Private (Admin)
const deleteFee = asyncHandler(async (req, res) => {
  const { resultCode } = await deleteFeeRecord(req.params.id);

  if (resultCode === 'not_found') {
    return res.status(404).json({ success: false, message: 'Fee record not found' });
  }

  if (resultCode === 'has_payments') {
    return res.status(400).json({
      success: false,
      message: 'Cannot delete fee record with payments',
    });
  }

  res.status(200).json({ success: true, message: 'Fee record deleted' });
});

// @desc    Get fee statistics
// @route   GET /api/fees/stats
// @access  Private (Admin)
const getFeeStats = asyncHandler(async (req, res) => {
  const stats = await getFeeStatistics({ academicYear: req.query.academicYear });

  res.status(200).json({
    success: true,
    stats,
    data: stats,
  });
});

// @desc    Bulk create fees for a class
// @route   POST /api/fees/bulk
// @access  Private (Admin)
const bulkCreateFees = asyncHandler(async (req, res) => {
  const createdFees = await bulkCreateFeeRecords({
    className: req.body.class,
    academicYear: req.body.academicYear,
    feeType: req.body.feeType,
    amount: req.body.amount,
    dueDate: req.body.dueDate,
    createdByUserId: req.user._id,
  });

  if (!createdFees.length) {
    return res.status(404).json({
      success: false,
      message: 'No active students found in this class',
    });
  }

  res.status(201).json({
    success: true,
    count: createdFees.length,
    fees: createdFees,
    data: createdFees,
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
  bulkCreateFees,
};
