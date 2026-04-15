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
const { getStudentByUserId } = require('../services/studentSqlService');

const parseStudentId = (value) => {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
};

const getRequestRole = (req) => String(req.user?.role || '').trim().toLowerCase();
const STUDENT_PAYMENT_PROVIDER = String(process.env.STUDENT_PAYMENT_PROVIDER || 'mock').trim().toLowerCase();
const STUDENT_PAYMENT_ENVIRONMENT = String(
  process.env.STUDENT_PAYMENT_ENVIRONMENT || (process.env.NODE_ENV === 'production' ? 'live' : 'sandbox')
).trim().toLowerCase();
const STUDENT_PAYMENT_PORTAL_ENABLED = String(
  process.env.ENABLE_STUDENT_PAYMENT_PORTAL || (process.env.NODE_ENV === 'production' ? 'false' : 'true')
).trim().toLowerCase() === 'true';

const createMockStudentPaymentReference = (feeId, userId) => {
  const uniqueSegment = `${Date.now()}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
  return `MOCK-FEE-${feeId}-${userId || 'student'}-${uniqueSegment}`;
};

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
  const requestedStudentId = parseStudentId(req.params.studentId);

  if (!requestedStudentId) {
    return res.status(400).json({ success: false, message: 'Invalid student ID' });
  }

  if (getRequestRole(req) === 'student') {
    const studentProfile = await getStudentByUserId(req.user);
    const ownStudentId = parseStudentId(studentProfile?._id ?? studentProfile?.id ?? studentProfile?.studentId);

    if (!ownStudentId) {
      return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    if (ownStudentId !== requestedStudentId) {
      return res.status(403).json({ success: false, message: 'Not authorized to view other student fee records' });
    }
  }

  const fees = await getFeesForStudent(requestedStudentId);
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
  const requestRole = getRequestRole(req);
  const feeRecord = await getFeeRecordById(req.params.id);

  if (!feeRecord) {
    return res.status(404).json({ success: false, message: 'Fee record not found' });
  }

  let paymentPayload = {
    ...req.body,
    receivedByUserId: req.user?._id ?? req.user?.id ?? null,
  };
  let paymentContext = null;

  if (requestRole === 'student') {
    if (!STUDENT_PAYMENT_PORTAL_ENABLED) {
      return res.status(503).json({
        success: false,
        message: 'Online student fee payments are not enabled in this deployment.',
      });
    }

    const studentProfile = await getStudentByUserId(req.user);
    const ownStudentId = parseStudentId(studentProfile?._id ?? studentProfile?.id ?? studentProfile?.studentId);
    const feeStudentId = parseStudentId(feeRecord.studentId?._id ?? feeRecord.studentId);

    if (!ownStudentId) {
      return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    if (ownStudentId !== feeStudentId) {
      return res.status(403).json({ success: false, message: 'Not authorized to pay another student fee record' });
    }

    if (process.env.NODE_ENV === 'production' || STUDENT_PAYMENT_PROVIDER !== 'mock') {
      return res.status(503).json({
        success: false,
        message: 'A production payment gateway is not configured for student self-service payments.',
      });
    }

    paymentPayload = {
      ...paymentPayload,
      mode: paymentPayload.mode || 'Online',
      transactionId: paymentPayload.transactionId || createMockStudentPaymentReference(req.params.id, req.user?._id ?? req.user?.id),
      notes: paymentPayload.notes || 'Development sandbox payment recorded from student portal.',
      receivedByUserId: req.user?._id ?? req.user?.id ?? null,
    };

    paymentContext = {
      provider: STUDENT_PAYMENT_PROVIDER,
      environment: STUDENT_PAYMENT_ENVIRONMENT,
      chargedRealMoney: false,
      message: 'Development sandbox payment recorded. No real money was charged.',
    };
  }

  const { fee, payment, resultCode, pendingAmount } = await collectFeePaymentRecord(req.params.id, paymentPayload);

  if (resultCode === 'invalid_amount') {
    return res.status(400).json({ success: false, message: 'Invalid payment amount' });
  }

  if (resultCode === 'already_paid') {
    return res.status(400).json({ success: false, message: 'This fee is already fully paid.' });
  }

  if (resultCode === 'exceeds_pending') {
    return res.status(400).json({
      success: false,
      message: 'Payment amount cannot exceed the current pending balance.',
      pendingAmount,
    });
  }

  res.status(200).json({
    success: true,
    fee,
    data: fee,
    receipt: payment,
    paymentContext,
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
