const { asyncHandler } = require('../middleware/errorMiddleware');
const {
  reviewLeaveRequest,
  getLeaveAuditReport,
} = require('../services/leaveSqlService');
const { getAuthUserByEmailRole } = require('../services/authSqlService');
const {
  getTeacherAssignmentScope,
  isTeacherAllowedForClassSection,
  paginateItems,
} = require('../services/teacherAssignmentService');

const normalizeText = (value) => String(value || '').trim();
const normalizeKey = (value) => normalizeText(value).toLowerCase();

const parsePositiveInt = (value, fallback) => {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : fallback;
};

const parseOptionalDate = (value) => {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue) {
    return null;
  }

  const parsedDate = new Date(normalizedValue);
  return Number.isNaN(parsedDate.getTime()) ? null : normalizedValue;
};

const getAuthenticatedUserId = (user = {}) => {
  const numericValue = Number(user?._id ?? user?.id ?? user?.UserId ?? null);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
};

const getAuthenticatedRole = (user = {}) => normalizeKey(user?.role ?? user?.RoleName ?? user?.roleKey);

const resolveAuthenticatedSqlUserId = async (user = {}) => {
  const directId = getAuthenticatedUserId(user);
  if (directId) {
    return directId;
  }

  const email = normalizeText(user?.email);
  const role = getAuthenticatedRole(user);
  if (!email || !role) {
    return null;
  }

  const resolvedUser = await getAuthUserByEmailRole(email, role);
  return getAuthenticatedUserId(resolvedUser);
};

const buildTeacherScopeCombos = (scope = {}, className = '', sectionName = '') => {
  const requestedClassName = normalizeText(className);
  const requestedSectionName = normalizeText(sectionName);

  if (requestedClassName) {
    const matchingCombos = (scope.subjects || [])
      .map((subject) => ({
        className: normalizeText(subject?.className || subject?.grade),
        sectionName: normalizeText(subject?.sectionName || subject?.section),
      }))
      .filter((combo) => {
        if (!combo.className || normalizeKey(combo.className) !== normalizeKey(requestedClassName)) {
          return false;
        }

        if (!requestedSectionName) {
          return true;
        }

        return normalizeKey(combo.sectionName) === normalizeKey(requestedSectionName);
      });

    const uniqueCombos = Array.from(
      new Map(
        matchingCombos.map((combo) => [`${normalizeKey(combo.className)}|${normalizeKey(combo.sectionName)}`, combo])
      ).values()
    );

    if (!uniqueCombos.length && requestedSectionName) {
      return [{ className: requestedClassName, sectionName: requestedSectionName }];
    }

    if (!uniqueCombos.length) {
      return [{ className: requestedClassName, sectionName: null }];
    }

    return uniqueCombos.map((combo) => ({
      className: combo.className,
      sectionName: combo.sectionName || null,
    }));
  }

  return Array.from(
    new Map(
      (scope.subjects || [])
        .map((subject) => ({
          className: normalizeText(subject?.className || subject?.grade),
          sectionName: normalizeText(subject?.sectionName || subject?.section),
        }))
        .filter((combo) => combo.className)
        .map((combo) => [`${normalizeKey(combo.className)}|${normalizeKey(combo.sectionName)}`, combo])
    ).values()
  ).map((combo) => ({
    className: combo.className,
    sectionName: combo.sectionName || null,
  }));
};

const sortByNewestFirst = (records = []) => [...records].sort((left, right) => {
  const leftTime = new Date(left?.createdAt || 0).getTime();
  const rightTime = new Date(right?.createdAt || 0).getTime();
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return Number(right?.leaveRequestId || 0) - Number(left?.leaveRequestId || 0);
});

const dedupeLeaveRecords = (records = []) => Array.from(
  new Map(
    records
      .filter((record) => record?.leaveRequestId)
      .map((record) => [String(record.leaveRequestId), record])
  ).values()
);

const buildLeaveSummary = (records = []) => records.reduce((summary, record) => {
  summary.total += 1;
  switch (normalizeKey(record?.status)) {
    case 'approved':
      summary.approved += 1;
      break;
    case 'rejected':
      summary.rejected += 1;
      break;
    case 'cancelled':
      summary.cancelled += 1;
      break;
    default:
      summary.pending += 1;
      break;
  }

  return summary;
}, {
  total: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
  cancelled: 0,
});

const applyTeacherScopeToRecords = (records = [], scope = {}) => records.filter((record) => (
  isTeacherAllowedForClassSection({
    scope,
    className: record?.className,
    sectionName: record?.sectionName,
  })
));

const ensureTeacherCanAccessFilter = (scope, className, sectionName) => {
  if (!normalizeText(className)) {
    return true;
  }

  return isTeacherAllowedForClassSection({ scope, className, sectionName });
};

const listPendingLeaveRequests = asyncHandler(async (req, res) => {
  const roleKey = getAuthenticatedRole(req.user);
  const className = normalizeText(req.query.className || req.query.class);
  const sectionName = normalizeText(req.query.sectionName || req.query.section);
  const page = parsePositiveInt(req.query.page, 1);
  const limit = Math.min(parsePositiveInt(req.query.limit, 20), 100);
  let records = await getLeaveAuditReport({
    className: className || null,
    status: 'pending',
  });

  if (sectionName) {
    records = records.filter((record) => normalizeKey(record?.sectionName) === normalizeKey(sectionName));
  }

  if (roleKey === 'teacher') {
    const scope = await getTeacherAssignmentScope({ teacherUserId: req.user?._id ?? req.user?.id });
    if (!ensureTeacherCanAccessFilter(scope, className, sectionName)) {
      return res.status(403).json({
        success: false,
        message: 'You can only review leave requests for your assigned classes and sections.',
      });
    }

    const scopedLeaves = sortByNewestFirst(dedupeLeaveRecords(applyTeacherScopeToRecords(records, scope)));
    const paginated = paginateItems(scopedLeaves, page, limit);

    return res.json({
      success: true,
      summary: buildLeaveSummary(scopedLeaves),
      leaves: paginated.items,
      pagination: {
        page: paginated.page,
        limit: paginated.limit,
        total: paginated.total,
        pages: Math.max(Math.ceil(paginated.total / paginated.limit), 1),
      },
      appliedFilters: {
        className: className || null,
        sectionName: sectionName || null,
      },
    });
  }

  const leaves = sortByNewestFirst(dedupeLeaveRecords(records));
  const total = leaves.length;
  const summary = {
    total,
    pending: total,
    approved: 0,
    rejected: 0,
    cancelled: 0,
  };

  res.json({
    success: true,
    summary,
    leaves,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(Math.ceil(total / limit), 1),
    },
    appliedFilters: {
      className: className || null,
      sectionName: sectionName || null,
    },
  });
});

const getLeaveReviewHistory = asyncHandler(async (req, res) => {
  const roleKey = getAuthenticatedRole(req.user);
  const className = normalizeText(req.query.className || req.query.class);
  const sectionName = normalizeText(req.query.sectionName || req.query.section);
  const status = normalizeKey(req.query.status);
  const page = parsePositiveInt(req.query.page, 1);
  const limit = Math.min(parsePositiveInt(req.query.limit, 20), 100);
  const startDate = parseOptionalDate(req.query.startDate);
  const endDate = parseOptionalDate(req.query.endDate);

  let records = await getLeaveAuditReport({
    startDate,
    endDate,
    className: className || null,
    status: status || null,
  });

  if (sectionName) {
    records = records.filter((record) => normalizeKey(record?.sectionName) === normalizeKey(sectionName));
  }

  if (roleKey === 'teacher') {
    const scope = await getTeacherAssignmentScope({ teacherUserId: req.user?._id ?? req.user?.id });
    if (!ensureTeacherCanAccessFilter(scope, className, sectionName)) {
      return res.status(403).json({
        success: false,
        message: 'You can only access leave records for your assigned classes and sections.',
      });
    }

    records = applyTeacherScopeToRecords(records, scope);
  }

  const sortedRecords = sortByNewestFirst(records);
  const paginated = paginateItems(sortedRecords, page, limit);

  res.json({
    success: true,
    summary: buildLeaveSummary(sortedRecords),
    leaves: paginated.items,
    pagination: {
      page: paginated.page,
      limit: paginated.limit,
      total: paginated.total,
      pages: Math.max(Math.ceil(paginated.total / paginated.limit), 1),
    },
    appliedFilters: {
      className: className || null,
      sectionName: sectionName || null,
      status: status || null,
      startDate,
      endDate,
    },
  });
});

const reviewPendingLeaveRequest = asyncHandler(async (req, res) => {
  const reviewerUserId = await resolveAuthenticatedSqlUserId(req.user);
  if (!reviewerUserId) {
    return res.status(401).json({
      success: false,
      message: 'Authenticated user could not be resolved.',
    });
  }

  const leaveRequestId = parsePositiveInt(req.params.id, null);
  if (!leaveRequestId) {
    return res.status(400).json({
      success: false,
      message: 'Invalid leave request ID.',
    });
  }

  const status = normalizeKey(req.body?.status);
  const reviewNotes = normalizeText(req.body?.reviewNotes);
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'Status must be approved or rejected.',
    });
  }

  const roleKey = getAuthenticatedRole(req.user);
  if (roleKey === 'teacher') {
    const scope = await getTeacherAssignmentScope({ teacherUserId: req.user?._id ?? req.user?.id });
    const pendingRecords = await getLeaveAuditReport({ status: 'pending' });
    const targetRecord = pendingRecords.find((record) => Number(record?.leaveRequestId) === leaveRequestId);

    if (!targetRecord) {
      return res.status(404).json({
        success: false,
        message: 'Pending leave request not found.',
      });
    }

    if (!isTeacherAllowedForClassSection({
      scope,
      className: targetRecord?.className,
      sectionName: targetRecord?.sectionName,
    })) {
      return res.status(403).json({
        success: false,
        message: 'You can only review leave requests for your assigned classes and sections.',
      });
    }
  }

  const reviewedLeave = await reviewLeaveRequest(
    leaveRequestId,
    status,
    reviewNotes || null,
    reviewerUserId
  );

  res.json({
    success: true,
    message: `Leave request ${status} successfully.`,
    leave: reviewedLeave,
  });
});

module.exports = {
  listPendingLeaveRequests,
  getLeaveReviewHistory,
  reviewPendingLeaveRequest,
};
