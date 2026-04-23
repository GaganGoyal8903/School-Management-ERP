const { asyncHandler } = require('../middleware/errorMiddleware');
const { getAuthUserByEmailRole } = require('../services/authSqlService');
const {
  getFinanceOpsSummary,
  listFeeConcessions,
  createFeeConcession,
  reviewFeeConcession,
  listFeeRefunds,
  createFeeRefund,
  reviewFeeRefund,
} = require('../services/financeOpsSqlService');

const normalizeRole = (value = '') => String(value || '').trim().toLowerCase();

const resolveAuthUserId = async (req) => {
  const rawValue = req.user?.id ?? req.user?.UserId ?? req.user?.userId ?? req.user?._id;
  const numericValue = Number(rawValue);
  if (Number.isInteger(numericValue) && numericValue > 0) {
    return numericValue;
  }

  const email = String(req.user?.email || '').trim().toLowerCase();
  const role = normalizeRole(req.user?.roleKey || req.user?.role);
  if (!email || !role) {
    return null;
  }

  const resolvedUser = await getAuthUserByEmailRole(email, role);
  const resolvedId = Number(resolvedUser?._id ?? resolvedUser?.UserId ?? resolvedUser?.id ?? null);
  return Number.isInteger(resolvedId) && resolvedId > 0 ? resolvedId : null;
};

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || null;
};

const buildActorContext = async (req) => ({
  userId: await resolveAuthUserId(req),
  fullName: req.user?.fullName || req.user?.FullName || null,
  role: req.user?.roleKey || req.user?.role || null,
  ipAddress: getClientIp(req),
});

const getSummary = asyncHandler(async (_req, res) => {
  const summary = await getFinanceOpsSummary();
  res.status(200).json({ success: true, summary, data: summary });
});

const getConcessions = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 25;
  const { rows, total } = await listFeeConcessions({
    status: req.query.status || null,
    search: req.query.search || null,
    page,
    limit,
  });

  res.status(200).json({
    success: true,
    concessions: rows,
    data: rows,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

const postConcession = asyncHandler(async (req, res) => {
  const concession = await createFeeConcession(req.body || {}, await buildActorContext(req));
  res.status(201).json({ success: true, concession, data: concession });
});

const patchConcessionReview = asyncHandler(async (req, res) => {
  const concession = await reviewFeeConcession(req.params.id, req.body || {}, await buildActorContext(req));
  res.status(200).json({ success: true, concession, data: concession });
});

const getRefunds = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 25;
  const { rows, total } = await listFeeRefunds({
    status: req.query.status || null,
    search: req.query.search || null,
    page,
    limit,
  });

  res.status(200).json({
    success: true,
    refunds: rows,
    data: rows,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

const postRefund = asyncHandler(async (req, res) => {
  const refund = await createFeeRefund(req.body || {}, await buildActorContext(req));
  res.status(201).json({ success: true, refund, data: refund });
});

const patchRefundReview = asyncHandler(async (req, res) => {
  const refund = await reviewFeeRefund(req.params.id, req.body || {}, await buildActorContext(req));
  res.status(200).json({ success: true, refund, data: refund });
});

module.exports = {
  getSummary,
  getConcessions,
  postConcession,
  patchConcessionReview,
  getRefunds,
  postRefund,
  patchRefundReview,
};
