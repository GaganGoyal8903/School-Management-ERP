const { asyncHandler } = require('../middleware/errorMiddleware');
const { getAuthUserByEmailRole } = require('../services/authSqlService');
const {
  getAppSettings,
  updateAppSettings,
  createAuditLog,
  listAuditLogs,
  listAuthUsers,
  resetAuthUserPassword,
} = require('../services/phase1SqlService');

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

const getSettingsSnapshot = asyncHandler(async (req, res) => {
  const settings = await getAppSettings();
  res.status(200).json({ success: true, settings, data: settings });
});

const saveSettingsSnapshot = asyncHandler(async (req, res) => {
  const actorUserId = await resolveAuthUserId(req);
  const settings = await updateAppSettings(req.body?.settings || {}, actorUserId);

  await createAuditLog({
    actorUserId,
    actorFullName: req.user?.fullName || req.user?.FullName || null,
    actorRole: req.user?.roleKey || req.user?.role || null,
    actionName: 'settings.update',
    entityName: 'AppSettings',
    entityId: 'system',
    summary: 'System settings were updated from the admin settings screen.',
    details: { updatedGroups: Object.keys(req.body?.settings || {}) },
    ipAddress: getClientIp(req),
  });

  res.status(200).json({ success: true, settings, data: settings });
});

const getAuditLogFeed = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 25;
  const { rows, total } = await listAuditLogs({
    entityName: req.query.entityName || null,
    actionName: req.query.actionName || null,
    page,
    limit,
  });

  res.status(200).json({
    success: true,
    logs: rows,
    data: rows,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

const getSettingsUsers = asyncHandler(async (req, res) => {
  const users = await listAuthUsers({
    role: req.query.role || null,
    search: req.query.search || null,
    limit: Number(req.query.limit) || 50,
  });

  res.status(200).json({ success: true, users, data: users });
});

const adminResetPassword = asyncHandler(async (req, res) => {
  const actorUserId = await resolveAuthUserId(req);
  const targetUser = await resetAuthUserPassword({
    targetUserId: req.body?.userId,
    email: req.body?.email,
    role: req.body?.role,
    newPassword: req.body?.newPassword,
  });

  await createAuditLog({
    actorUserId,
    actorFullName: req.user?.fullName || req.user?.FullName || null,
    actorRole: req.user?.roleKey || req.user?.role || null,
    actionName: 'users.reset-password',
    entityName: 'AuthUser',
    entityId: String(targetUser?._id || ''),
    summary: `Password reset completed for ${targetUser?.email || 'selected user'}.`,
    details: {
      targetEmail: targetUser?.email || null,
      targetRole: targetUser?.role || null,
    },
    ipAddress: getClientIp(req),
  });

  res.status(200).json({
    success: true,
    message: 'Password reset successfully.',
    user: {
      id: targetUser?._id || null,
      email: targetUser?.email || null,
      role: targetUser?.role || null,
      fullName: targetUser?.fullName || null,
    },
  });
});

module.exports = {
  getSettingsSnapshot,
  saveSettingsSnapshot,
  getAuditLogFeed,
  getSettingsUsers,
  adminResetPassword,
};
