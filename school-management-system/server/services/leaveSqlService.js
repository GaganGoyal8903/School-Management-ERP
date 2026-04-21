const fs = require('fs');
const path = require('path');
const {
  getSqlClient,
  executeStoredProcedure,
  getPool,
} = require('../config/sqlServer');
const { ensureStudentSqlReady } = require('./studentSqlService');

const DATABASE_DIR = path.join(__dirname, '..', 'database');
const LEAVE_TABLE_SQL_PATH = path.join(DATABASE_DIR, 'leave-requests-table.sql');
const LEAVE_PROC_SQL_PATH = path.join(DATABASE_DIR, 'leave-requests-procedures.sql');

const splitSqlBatches = (sqlText = '') => String(sqlText || '')
  .split(/^\s*GO\s*$/gim)
  .map((batch) => batch.trim())
  .filter(Boolean);

const readSqlBatches = (filePath) => splitSqlBatches(
  fs.readFileSync(filePath, 'utf8')
);

const LEAVE_TABLE_BATCHES = readSqlBatches(LEAVE_TABLE_SQL_PATH);
const LEAVE_PROC_BATCHES = readSqlBatches(LEAVE_PROC_SQL_PATH);

let leaveBootstrapPromise = null;

const ensureLeaveSqlReady = async () => {
  if (!leaveBootstrapPromise) {
    leaveBootstrapPromise = (async () => {
      await ensureStudentSqlReady();
      const pool = await getPool();

      for (const batch of LEAVE_TABLE_BATCHES) {
        await pool.request().batch(batch);
      }

      for (const batch of LEAVE_PROC_BATCHES) {
        await pool.request().batch(batch);
      }

      return true;
    })().catch((error) => {
      leaveBootstrapPromise = null;
      throw error;
    });
  }

  return leaveBootstrapPromise;
};

const parseDateInput = (value) => {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
};

const normalizeLeaveType = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return 'Other';
  }

  const supportedTypes = ['Medical', 'Sick', 'Family', 'Personal', 'Emergency', 'Other'];
  return supportedTypes.find((type) => type.toLowerCase() === normalized.toLowerCase()) || normalized;
};

const mapLeaveRow = (row = {}) => {
  if (!row) {
    return null;
  }

  return {
    leaveRequestId: Number(row.LeaveRequestId || 0) || null,
    studentId: Number(row.StudentId || 0) || null,
    requestedByUserId: row.RequestedByUserId != null ? Number(row.RequestedByUserId) : null,
    admissionNumber: row.AdmissionNumber || null,
    rollNumber: row.RollNumber || null,
    studentFullName: row.StudentFullName || null,
    classId: row.ClassId != null ? Number(row.ClassId) : null,
    className: row.ClassName || null,
    sectionId: row.SectionId != null ? Number(row.SectionId) : null,
    sectionName: row.SectionName || null,
    leaveType: row.LeaveType || null,
    fromDate: row.FromDate || null,
    toDate: row.ToDate || null,
    daysRequested: row.DaysRequested != null ? Number(row.DaysRequested) : 0,
    reason: row.Reason || null,
    status: row.Status || null,
    reviewNotes: row.ReviewNotes || null,
    reviewedByUserId: row.ReviewedByUserId != null ? Number(row.ReviewedByUserId) : null,
    reviewedByFullName: row.ReviewedByFullName || row.ReviewedByUserFullName || null,
    reviewedByRole: row.ReviewedByRole || null,
    reviewedAt: row.ReviewedAt || null,
    cancelledByUserId: row.CancelledByUserId != null ? Number(row.CancelledByUserId) : null,
    cancelledAt: row.CancelledAt || null,
    createdAt: row.CreatedAt || null,
    updatedAt: row.UpdatedAt || null,
    requestedByFullName: row.RequestedByFullName || null,
  };
};

const createLeaveRequest = async (
  studentId,
  { leaveType, fromDate, toDate, reason, requestedByUserId = null } = {}
) => {
  await ensureLeaveSqlReady();

  const sql = getSqlClient();
  const safeFromDate = parseDateInput(fromDate);
  const safeToDate = parseDateInput(toDate);

  if (!safeFromDate || !safeToDate || safeToDate < safeFromDate) {
    throw new Error('A valid leave date range is required.');
  }

  const result = await executeStoredProcedure('dbo.spLeaveRequestCreate', [
    { name: 'StudentId', type: sql.Int, value: Number(studentId) || null },
    { name: 'LeaveType', type: sql.NVarChar(50), value: normalizeLeaveType(leaveType) },
    { name: 'FromDate', type: sql.Date, value: safeFromDate },
    { name: 'ToDate', type: sql.Date, value: safeToDate },
    { name: 'Reason', type: sql.NVarChar(2000), value: String(reason || '').trim() || null },
    { name: 'RequestedByUserId', type: sql.Int, value: requestedByUserId != null ? Number(requestedByUserId) : null },
  ]);

  return mapLeaveRow(result?.recordset?.[0] || null);
};

const reviewLeaveRequest = async (
  leaveRequestId,
  status,
  reviewNotes,
  reviewerUserId
) => {
  await ensureLeaveSqlReady();

  const normalizedStatus = String(status || '').trim().toLowerCase();
  if (!['approved', 'rejected'].includes(normalizedStatus)) {
    throw new Error('Status must be approved or rejected.');
  }

  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spLeaveRequestReview', [
    { name: 'LeaveRequestId', type: sql.Int, value: Number(leaveRequestId) || null },
    { name: 'Status', type: sql.NVarChar(20), value: normalizedStatus },
    { name: 'ReviewNotes', type: sql.NVarChar(2000), value: String(reviewNotes || '').trim() || null },
    { name: 'ReviewerUserId', type: sql.Int, value: Number(reviewerUserId) || null },
  ]);

  return mapLeaveRow(result?.recordset?.[0] || null);
};

const cancelLeaveRequest = async (
  leaveRequestId,
  studentId,
  cancelledByUserId = null
) => {
  await ensureLeaveSqlReady();

  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spLeaveRequestCancel', [
    { name: 'LeaveRequestId', type: sql.Int, value: Number(leaveRequestId) || null },
    { name: 'StudentId', type: sql.Int, value: Number(studentId) || null },
    { name: 'CancelledByUserId', type: sql.Int, value: cancelledByUserId != null ? Number(cancelledByUserId) : null },
  ]);

  return mapLeaveRow(result?.recordset?.[0] || null);
};

const getPendingLeaves = async (
  viewerUserId,
  { className = null, sectionName = null, page = 1, limit = 50 } = {}
) => {
  await ensureLeaveSqlReady();

  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spLeavePendingList', [
    { name: 'ViewerUserId', type: sql.Int, value: Number(viewerUserId) || null },
    { name: 'ClassName', type: sql.NVarChar(100), value: className || null },
    { name: 'SectionName', type: sql.NVarChar(50), value: sectionName || null },
    { name: 'Page', type: sql.Int, value: Number(page) || 1 },
    { name: 'Limit', type: sql.Int, value: Number(limit) || 50 },
  ]);

  const rows = result?.recordset || [];
  return {
    leaves: rows.map(mapLeaveRow).filter(Boolean),
    pagination: {
      page: Number(page) || 1,
      limit: Number(limit) || 50,
      total: rows.length ? Number(rows[0].TotalCount || 0) : 0,
    },
  };
};

const getStudentLeaveHistory = async (studentId, limit = 20) => {
  await ensureLeaveSqlReady();

  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spLeaveStudentHistory', [
    { name: 'StudentId', type: sql.Int, value: Number(studentId) || null },
    { name: 'Limit', type: sql.Int, value: Number(limit) || 20 },
  ]);

  return (result?.recordset || []).map(mapLeaveRow).filter(Boolean);
};

const getLeaveAuditReport = async ({
  startDate = null,
  endDate = null,
  className = null,
  status = null,
} = {}) => {
  await ensureLeaveSqlReady();

  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spLeaveAuditReport', [
    { name: 'StartDate', type: sql.Date, value: parseDateInput(startDate) },
    { name: 'EndDate', type: sql.Date, value: parseDateInput(endDate) },
    { name: 'ClassName', type: sql.NVarChar(100), value: className || null },
    { name: 'Status', type: sql.NVarChar(20), value: status ? String(status).trim().toLowerCase() : null },
  ]);

  return (result?.recordset || []).map(mapLeaveRow).filter(Boolean);
};

const summarizeLeaveRequests = (requests = []) => requests.reduce((summary, request) => {
  summary.total += 1;
  switch (String(request?.status || '').trim().toLowerCase()) {
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

module.exports = {
  ensureLeaveSqlReady,
  createLeaveRequest,
  reviewLeaveRequest,
  cancelLeaveRequest,
  getPendingLeaves,
  getStudentLeaveHistory,
  getLeaveAuditReport,
  summarizeLeaveRequests,
  parseDateInput,
  normalizeLeaveType,
  mapLeaveRow,
};
