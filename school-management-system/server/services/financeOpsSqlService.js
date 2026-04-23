const fs = require('fs');
const path = require('path');
const {
  getPool,
  getSqlClient,
  executeStoredProcedure,
} = require('../config/sqlServer');
const { ensureAuthSqlReady } = require('./authSqlService');
const { ensureFeeSqlReady } = require('./feeSqlService');
const { createAuditLog } = require('./phase1SqlService');

const DATABASE_DIR = path.join(__dirname, '..', 'database');
const TABLE_SQL_PATH = path.join(DATABASE_DIR, 'phase2-finance-ops-table.sql');
const PROC_SQL_PATH = path.join(DATABASE_DIR, 'phase2-finance-ops-procedures.sql');

const splitSqlBatches = (sqlText = '') => String(sqlText || '')
  .split(/^\s*GO\s*$/gim)
  .map((batch) => batch.trim())
  .filter(Boolean);

const TABLE_BATCHES = splitSqlBatches(fs.readFileSync(TABLE_SQL_PATH, 'utf8'));
const PROC_BATCHES = splitSqlBatches(fs.readFileSync(PROC_SQL_PATH, 'utf8'));

let bootstrapPromise = null;

const ensureFinanceOpsSqlReady = async () => {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await ensureAuthSqlReady();
      await ensureFeeSqlReady();
      const pool = await getPool();

      for (const batch of TABLE_BATCHES) {
        await pool.request().batch(batch);
      }

      for (const batch of PROC_BATCHES) {
        await pool.request().batch(batch);
      }

      return true;
    })().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }

  return bootstrapPromise;
};

const normalizeInt = (value) => {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
};

const toNullableString = (value) => {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed || null;
};

const mapConcessionRow = (row = {}) => ({
  concessionId: normalizeInt(row.ConcessionId),
  studentFeeId: normalizeInt(row.StudentFeeId),
  studentId: normalizeInt(row.StudentId),
  studentFullName: row.StudentFullName || '',
  className: row.ClassName || '',
  sectionName: row.SectionName || '',
  feeType: row.FeeType || '',
  feeAmount: Number(row.FeeAmount || 0),
  paidAmount: Number(row.PaidAmount || 0),
  discount: Number(row.Discount || 0),
  dueDate: row.DueDate || null,
  concessionType: row.ConcessionType || '',
  amount: Number(row.Amount || 0),
  reason: row.Reason || '',
  reviewNotes: row.ReviewNotes || '',
  status: row.Status || 'pending',
  requestedByUserId: normalizeInt(row.RequestedByUserId),
  requestedByFullName: row.RequestedByFullName || '',
  reviewedByUserId: normalizeInt(row.ReviewedByUserId),
  reviewedByFullName: row.ReviewedByFullName || '',
  reviewedAt: row.ReviewedAt || null,
  appliedAt: row.AppliedAt || null,
  createdAt: row.CreatedAt || null,
  updatedAt: row.UpdatedAt || null,
  totalCount: normalizeInt(row.TotalCount) || 0,
});

const mapRefundRow = (row = {}) => ({
  refundId: normalizeInt(row.RefundId),
  studentFeeId: normalizeInt(row.StudentFeeId),
  studentId: normalizeInt(row.StudentId),
  studentFullName: row.StudentFullName || '',
  className: row.ClassName || '',
  sectionName: row.SectionName || '',
  feeType: row.FeeType || '',
  feeAmount: Number(row.FeeAmount || 0),
  paidAmount: Number(row.PaidAmount || 0),
  discount: Number(row.Discount || 0),
  dueDate: row.DueDate || null,
  amount: Number(row.Amount || 0),
  refundMode: row.RefundMode || '',
  transactionReference: row.TransactionReference || '',
  reason: row.Reason || '',
  reviewNotes: row.ReviewNotes || '',
  status: row.Status || 'pending',
  requestedByUserId: normalizeInt(row.RequestedByUserId),
  requestedByFullName: row.RequestedByFullName || '',
  reviewedByUserId: normalizeInt(row.ReviewedByUserId),
  reviewedByFullName: row.ReviewedByFullName || '',
  reviewedAt: row.ReviewedAt || null,
  processedAt: row.ProcessedAt || null,
  createdAt: row.CreatedAt || null,
  updatedAt: row.UpdatedAt || null,
  totalCount: normalizeInt(row.TotalCount) || 0,
});

const getFinanceOpsSummary = async () => {
  await ensureFinanceOpsSqlReady();
  const result = await executeStoredProcedure('dbo.spFinanceOperationsSummary');
  const row = result?.recordset?.[0] || {};
  return {
    pendingConcessions: Number(row.PendingConcessions || 0),
    approvedConcessionAmount: Number(row.ApprovedConcessionAmount || 0),
    pendingRefunds: Number(row.PendingRefunds || 0),
    processedRefundAmount: Number(row.ProcessedRefundAmount || 0),
  };
};

const listFeeConcessions = async ({ status = null, search = null, page = 1, limit = 25 } = {}) => {
  await ensureFinanceOpsSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spFeeConcessionList', [
    { name: 'Status', type: sql.NVarChar(20), value: toNullableString(status) },
    { name: 'Search', type: sql.NVarChar(200), value: toNullableString(search) },
    { name: 'Page', type: sql.Int, value: Math.max(1, Number(page) || 1) },
    { name: 'Limit', type: sql.Int, value: Math.max(1, Math.min(200, Number(limit) || 25)) },
  ]);

  const rows = (result?.recordset || []).map(mapConcessionRow);
  return { rows, total: rows[0]?.totalCount || 0 };
};

const createFeeConcession = async (payload = {}, actor = {}) => {
  await ensureFinanceOpsSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spFeeConcessionCreate', [
    { name: 'StudentFeeId', type: sql.Int, value: normalizeInt(payload.studentFeeId) },
    { name: 'RequestedByUserId', type: sql.Int, value: normalizeInt(actor.userId) },
    { name: 'ConcessionType', type: sql.NVarChar(50), value: toNullableString(payload.concessionType) || 'General' },
    { name: 'Amount', type: sql.Decimal(18, 2), value: Number(payload.amount || 0) },
    { name: 'Reason', type: sql.NVarChar(1000), value: toNullableString(payload.reason) },
  ]);
  const concession = mapConcessionRow(result?.recordset?.[0] || {});

  await createAuditLog({
    actorUserId: normalizeInt(actor.userId),
    actorFullName: actor.fullName || null,
    actorRole: actor.role || null,
    actionName: 'finance.concession.create',
    entityName: 'FeeConcession',
    entityId: concession.concessionId ? String(concession.concessionId) : null,
    summary: `Concession created for ${concession.studentFullName || 'selected fee'}.`,
    details: concession,
    ipAddress: actor.ipAddress || null,
  }).catch(() => null);

  return concession;
};

const reviewFeeConcession = async (concessionId, payload = {}, actor = {}) => {
  await ensureFinanceOpsSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spFeeConcessionReview', [
    { name: 'ConcessionId', type: sql.Int, value: normalizeInt(concessionId) },
    { name: 'Status', type: sql.NVarChar(20), value: toNullableString(payload.status) },
    { name: 'ReviewNotes', type: sql.NVarChar(1000), value: toNullableString(payload.reviewNotes) },
    { name: 'ReviewedByUserId', type: sql.Int, value: normalizeInt(actor.userId) },
  ]);
  const concession = mapConcessionRow(result?.recordset?.[0] || {});

  await createAuditLog({
    actorUserId: normalizeInt(actor.userId),
    actorFullName: actor.fullName || null,
    actorRole: actor.role || null,
    actionName: 'finance.concession.review',
    entityName: 'FeeConcession',
    entityId: concession.concessionId ? String(concession.concessionId) : String(concessionId),
    summary: `Concession reviewed with status ${payload.status}.`,
    details: { concessionId: concession.concessionId || normalizeInt(concessionId), ...payload },
    ipAddress: actor.ipAddress || null,
  }).catch(() => null);

  return concession;
};

const listFeeRefunds = async ({ status = null, search = null, page = 1, limit = 25 } = {}) => {
  await ensureFinanceOpsSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spFeeRefundList', [
    { name: 'Status', type: sql.NVarChar(20), value: toNullableString(status) },
    { name: 'Search', type: sql.NVarChar(200), value: toNullableString(search) },
    { name: 'Page', type: sql.Int, value: Math.max(1, Number(page) || 1) },
    { name: 'Limit', type: sql.Int, value: Math.max(1, Math.min(200, Number(limit) || 25)) },
  ]);

  const rows = (result?.recordset || []).map(mapRefundRow);
  return { rows, total: rows[0]?.totalCount || 0 };
};

const createFeeRefund = async (payload = {}, actor = {}) => {
  await ensureFinanceOpsSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spFeeRefundCreate', [
    { name: 'StudentFeeId', type: sql.Int, value: normalizeInt(payload.studentFeeId) },
    { name: 'RequestedByUserId', type: sql.Int, value: normalizeInt(actor.userId) },
    { name: 'Amount', type: sql.Decimal(18, 2), value: Number(payload.amount || 0) },
    { name: 'RefundMode', type: sql.NVarChar(50), value: toNullableString(payload.refundMode) },
    { name: 'TransactionReference', type: sql.NVarChar(120), value: toNullableString(payload.transactionReference) },
    { name: 'Reason', type: sql.NVarChar(1000), value: toNullableString(payload.reason) },
  ]);
  const refund = mapRefundRow(result?.recordset?.[0] || {});

  await createAuditLog({
    actorUserId: normalizeInt(actor.userId),
    actorFullName: actor.fullName || null,
    actorRole: actor.role || null,
    actionName: 'finance.refund.create',
    entityName: 'FeeRefund',
    entityId: refund.refundId ? String(refund.refundId) : null,
    summary: `Refund created for ${refund.studentFullName || 'selected fee'}.`,
    details: refund,
    ipAddress: actor.ipAddress || null,
  }).catch(() => null);

  return refund;
};

const reviewFeeRefund = async (refundId, payload = {}, actor = {}) => {
  await ensureFinanceOpsSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spFeeRefundReview', [
    { name: 'RefundId', type: sql.Int, value: normalizeInt(refundId) },
    { name: 'Status', type: sql.NVarChar(20), value: toNullableString(payload.status) },
    { name: 'ReviewNotes', type: sql.NVarChar(1000), value: toNullableString(payload.reviewNotes) },
    { name: 'ReviewedByUserId', type: sql.Int, value: normalizeInt(actor.userId) },
    { name: 'RefundMode', type: sql.NVarChar(50), value: toNullableString(payload.refundMode) },
    { name: 'TransactionReference', type: sql.NVarChar(120), value: toNullableString(payload.transactionReference) },
  ]);
  const refund = mapRefundRow(result?.recordset?.[0] || {});

  await createAuditLog({
    actorUserId: normalizeInt(actor.userId),
    actorFullName: actor.fullName || null,
    actorRole: actor.role || null,
    actionName: 'finance.refund.review',
    entityName: 'FeeRefund',
    entityId: refund.refundId ? String(refund.refundId) : String(refundId),
    summary: `Refund reviewed with status ${payload.status}.`,
    details: { refundId: refund.refundId || normalizeInt(refundId), ...payload },
    ipAddress: actor.ipAddress || null,
  }).catch(() => null);

  return refund;
};

module.exports = {
  ensureFinanceOpsSqlReady,
  getFinanceOpsSummary,
  listFeeConcessions,
  createFeeConcession,
  reviewFeeConcession,
  listFeeRefunds,
  createFeeRefund,
  reviewFeeRefund,
};
