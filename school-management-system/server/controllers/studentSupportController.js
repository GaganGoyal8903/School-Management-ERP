const { asyncHandler } = require('../middleware/errorMiddleware');
const { getAuthUserByEmailRole } = require('../services/authSqlService');
const {
  getStudentSupportSummary,
  listStudentRemarks,
  createStudentRemark,
  updateStudentRemarkStatus,
  listStudentInterventions,
  createStudentIntervention,
  updateStudentInterventionStatus,
} = require('../services/studentSupportSqlService');

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

const getSupportSummary = asyncHandler(async (req, res) => {
  const summary = await getStudentSupportSummary({
    className: req.query.className || req.query.class || null,
    sectionName: req.query.sectionName || req.query.section || null,
  });

  res.status(200).json({ success: true, summary, data: summary });
});

const getRemarks = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 25;
  const { rows, total } = await listStudentRemarks({
    studentId: req.query.studentId || null,
    status: req.query.status || null,
    className: req.query.className || req.query.class || null,
    sectionName: req.query.sectionName || req.query.section || null,
    search: req.query.search || null,
    page,
    limit,
  });

  res.status(200).json({
    success: true,
    remarks: rows,
    data: rows,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

const postRemark = asyncHandler(async (req, res) => {
  const remark = await createStudentRemark(req.body || {}, await buildActorContext(req));
  res.status(201).json({ success: true, remark, data: remark });
});

const patchRemarkStatus = asyncHandler(async (req, res) => {
  const remark = await updateStudentRemarkStatus(req.params.id, req.body?.status, await buildActorContext(req));
  res.status(200).json({ success: true, remark, data: remark });
});

const getInterventions = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 25;
  const { rows, total } = await listStudentInterventions({
    studentId: req.query.studentId || null,
    status: req.query.status || null,
    className: req.query.className || req.query.class || null,
    sectionName: req.query.sectionName || req.query.section || null,
    search: req.query.search || null,
    page,
    limit,
  });

  res.status(200).json({
    success: true,
    interventions: rows,
    data: rows,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

const postIntervention = asyncHandler(async (req, res) => {
  const intervention = await createStudentIntervention(req.body || {}, await buildActorContext(req));
  res.status(201).json({ success: true, intervention, data: intervention });
});

const patchInterventionStatus = asyncHandler(async (req, res) => {
  const intervention = await updateStudentInterventionStatus(req.params.id, req.body?.status, await buildActorContext(req));
  res.status(200).json({ success: true, intervention, data: intervention });
});

module.exports = {
  getSupportSummary,
  getRemarks,
  postRemark,
  patchRemarkStatus,
  getInterventions,
  postIntervention,
  patchInterventionStatus,
};
