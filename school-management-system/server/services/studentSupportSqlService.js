const fs = require('fs');
const path = require('path');
const {
  getPool,
  getSqlClient,
  executeStoredProcedure,
} = require('../config/sqlServer');
const { ensureAuthSqlReady } = require('./authSqlService');
const { createAuditLog } = require('./phase1SqlService');

const DATABASE_DIR = path.join(__dirname, '..', 'database');
const TABLE_SQL_PATH = path.join(DATABASE_DIR, 'phase2-student-support-table.sql');
const PROC_SQL_PATH = path.join(DATABASE_DIR, 'phase2-student-support-procedures.sql');

const splitSqlBatches = (sqlText = '') => String(sqlText || '')
  .split(/^\s*GO\s*$/gim)
  .map((batch) => batch.trim())
  .filter(Boolean);

const TABLE_BATCHES = splitSqlBatches(fs.readFileSync(TABLE_SQL_PATH, 'utf8'));
const PROC_BATCHES = splitSqlBatches(fs.readFileSync(PROC_SQL_PATH, 'utf8'));

let bootstrapPromise = null;

const ensureStudentSupportSqlReady = async () => {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await ensureAuthSqlReady();
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

const mapRemarkRow = (row = {}) => ({
  remarkId: normalizeInt(row.RemarkId),
  studentId: normalizeInt(row.StudentId),
  studentFullName: row.StudentFullName || '',
  admissionNumber: row.AdmissionNumber || '',
  rollNumber: row.RollNumber || '',
  className: row.ClassName || '',
  sectionName: row.SectionName || '',
  teacherUserId: normalizeInt(row.TeacherUserId),
  teacherFullName: row.TeacherFullName || '',
  remarkType: row.RemarkType || 'general',
  severity: row.Severity || 'medium',
  category: row.Category || 'academic',
  title: row.Title || '',
  notes: row.Notes || '',
  followUpDate: row.FollowUpDate || null,
  status: row.Status || 'open',
  closedAt: row.ClosedAt || null,
  createdAt: row.CreatedAt || null,
  updatedAt: row.UpdatedAt || null,
  totalCount: normalizeInt(row.TotalCount) || 0,
});

const mapInterventionRow = (row = {}) => ({
  interventionId: normalizeInt(row.InterventionId),
  studentId: normalizeInt(row.StudentId),
  studentFullName: row.StudentFullName || '',
  admissionNumber: row.AdmissionNumber || '',
  rollNumber: row.RollNumber || '',
  className: row.ClassName || '',
  sectionName: row.SectionName || '',
  createdByUserId: normalizeInt(row.CreatedByUserId),
  createdByFullName: row.CreatedByFullName || '',
  category: row.Category || 'academic',
  riskLevel: row.RiskLevel || 'moderate',
  triggerSource: row.TriggerSource || '',
  summary: row.Summary || '',
  actionPlan: row.ActionPlan || '',
  parentContactNeeded: row.ParentContactNeeded === true || row.ParentContactNeeded === 1,
  followUpDate: row.FollowUpDate || null,
  status: row.Status || 'active',
  resolvedAt: row.ResolvedAt || null,
  createdAt: row.CreatedAt || null,
  updatedAt: row.UpdatedAt || null,
  totalCount: normalizeInt(row.TotalCount) || 0,
});

const getStudentSupportSummary = async ({ className = null, sectionName = null } = {}) => {
  await ensureStudentSupportSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spStudentSupportSummary', [
    { name: 'ClassName', type: sql.NVarChar(100), value: toNullableString(className) },
    { name: 'SectionName', type: sql.NVarChar(50), value: toNullableString(sectionName) },
  ]);
  const row = result?.recordset?.[0] || {};
  return {
    openRemarks: Number(row.OpenRemarks || 0),
    activeInterventions: Number(row.ActiveInterventions || 0),
    highRiskInterventions: Number(row.HighRiskInterventions || 0),
    upcomingFollowUps: Number(row.UpcomingFollowUps || 0),
  };
};

const listStudentRemarks = async ({
  studentId = null,
  status = null,
  className = null,
  sectionName = null,
  search = null,
  page = 1,
  limit = 25,
} = {}) => {
  await ensureStudentSupportSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spStudentRemarkList', [
    { name: 'StudentId', type: sql.Int, value: normalizeInt(studentId) },
    { name: 'Status', type: sql.NVarChar(20), value: toNullableString(status) },
    { name: 'ClassName', type: sql.NVarChar(100), value: toNullableString(className) },
    { name: 'SectionName', type: sql.NVarChar(50), value: toNullableString(sectionName) },
    { name: 'Search', type: sql.NVarChar(200), value: toNullableString(search) },
    { name: 'Page', type: sql.Int, value: Math.max(1, Number(page) || 1) },
    { name: 'Limit', type: sql.Int, value: Math.max(1, Math.min(200, Number(limit) || 25)) },
  ]);

  const rows = (result?.recordset || []).map(mapRemarkRow);
  return { rows, total: rows[0]?.totalCount || 0 };
};

const createStudentRemark = async (payload = {}, actor = {}) => {
  await ensureStudentSupportSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spStudentRemarkCreate', [
    { name: 'StudentId', type: sql.Int, value: normalizeInt(payload.studentId) },
    { name: 'TeacherUserId', type: sql.Int, value: normalizeInt(actor.userId) },
    { name: 'RemarkType', type: sql.NVarChar(40), value: toNullableString(payload.remarkType) || 'general' },
    { name: 'Severity', type: sql.NVarChar(20), value: toNullableString(payload.severity) || 'medium' },
    { name: 'Category', type: sql.NVarChar(40), value: toNullableString(payload.category) || 'academic' },
    { name: 'Title', type: sql.NVarChar(200), value: toNullableString(payload.title) },
    { name: 'Notes', type: sql.NVarChar(sql.MAX), value: toNullableString(payload.notes) },
    { name: 'FollowUpDate', type: sql.Date, value: payload.followUpDate || null },
  ]);
  const remark = mapRemarkRow(result?.recordset?.[0] || {});

  await createAuditLog({
    actorUserId: normalizeInt(actor.userId),
    actorFullName: actor.fullName || null,
    actorRole: actor.role || null,
    actionName: 'student-support.remark.create',
    entityName: 'StudentRemark',
    entityId: remark.remarkId ? String(remark.remarkId) : null,
    summary: `Remark created for ${remark.studentFullName || 'selected student'}.`,
    details: remark,
    ipAddress: actor.ipAddress || null,
  }).catch(() => null);

  return remark;
};

const updateStudentRemarkStatus = async (remarkId, status, actor = {}) => {
  await ensureStudentSupportSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spStudentRemarkStatusUpdate', [
    { name: 'RemarkId', type: sql.Int, value: normalizeInt(remarkId) },
    { name: 'Status', type: sql.NVarChar(20), value: toNullableString(status) },
  ]);
  const remark = mapRemarkRow(result?.recordset?.[0] || {});

  await createAuditLog({
    actorUserId: normalizeInt(actor.userId),
    actorFullName: actor.fullName || null,
    actorRole: actor.role || null,
    actionName: 'student-support.remark.status',
    entityName: 'StudentRemark',
    entityId: remark.remarkId ? String(remark.remarkId) : String(remarkId),
    summary: `Remark status updated to ${status}.`,
    details: { status, remarkId: remark.remarkId || normalizeInt(remarkId) },
    ipAddress: actor.ipAddress || null,
  }).catch(() => null);

  return remark;
};

const listStudentInterventions = async ({
  studentId = null,
  status = null,
  className = null,
  sectionName = null,
  search = null,
  page = 1,
  limit = 25,
} = {}) => {
  await ensureStudentSupportSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spStudentInterventionList', [
    { name: 'StudentId', type: sql.Int, value: normalizeInt(studentId) },
    { name: 'Status', type: sql.NVarChar(20), value: toNullableString(status) },
    { name: 'ClassName', type: sql.NVarChar(100), value: toNullableString(className) },
    { name: 'SectionName', type: sql.NVarChar(50), value: toNullableString(sectionName) },
    { name: 'Search', type: sql.NVarChar(200), value: toNullableString(search) },
    { name: 'Page', type: sql.Int, value: Math.max(1, Number(page) || 1) },
    { name: 'Limit', type: sql.Int, value: Math.max(1, Math.min(200, Number(limit) || 25)) },
  ]);

  const rows = (result?.recordset || []).map(mapInterventionRow);
  return { rows, total: rows[0]?.totalCount || 0 };
};

const createStudentIntervention = async (payload = {}, actor = {}) => {
  await ensureStudentSupportSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spStudentInterventionCreate', [
    { name: 'StudentId', type: sql.Int, value: normalizeInt(payload.studentId) },
    { name: 'CreatedByUserId', type: sql.Int, value: normalizeInt(actor.userId) },
    { name: 'Category', type: sql.NVarChar(40), value: toNullableString(payload.category) || 'academic' },
    { name: 'RiskLevel', type: sql.NVarChar(20), value: toNullableString(payload.riskLevel) || 'moderate' },
    { name: 'TriggerSource', type: sql.NVarChar(80), value: toNullableString(payload.triggerSource) },
    { name: 'Summary', type: sql.NVarChar(500), value: toNullableString(payload.summary) },
    { name: 'ActionPlan', type: sql.NVarChar(sql.MAX), value: toNullableString(payload.actionPlan) },
    { name: 'ParentContactNeeded', type: sql.Bit, value: payload.parentContactNeeded ? 1 : 0 },
    { name: 'FollowUpDate', type: sql.Date, value: payload.followUpDate || null },
  ]);
  const intervention = mapInterventionRow(result?.recordset?.[0] || {});

  await createAuditLog({
    actorUserId: normalizeInt(actor.userId),
    actorFullName: actor.fullName || null,
    actorRole: actor.role || null,
    actionName: 'student-support.intervention.create',
    entityName: 'StudentIntervention',
    entityId: intervention.interventionId ? String(intervention.interventionId) : null,
    summary: `Intervention created for ${intervention.studentFullName || 'selected student'}.`,
    details: intervention,
    ipAddress: actor.ipAddress || null,
  }).catch(() => null);

  return intervention;
};

const updateStudentInterventionStatus = async (interventionId, status, actor = {}) => {
  await ensureStudentSupportSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spStudentInterventionStatusUpdate', [
    { name: 'InterventionId', type: sql.Int, value: normalizeInt(interventionId) },
    { name: 'Status', type: sql.NVarChar(20), value: toNullableString(status) },
  ]);
  const intervention = mapInterventionRow(result?.recordset?.[0] || {});

  await createAuditLog({
    actorUserId: normalizeInt(actor.userId),
    actorFullName: actor.fullName || null,
    actorRole: actor.role || null,
    actionName: 'student-support.intervention.status',
    entityName: 'StudentIntervention',
    entityId: intervention.interventionId ? String(intervention.interventionId) : String(interventionId),
    summary: `Intervention status updated to ${status}.`,
    details: { status, interventionId: intervention.interventionId || normalizeInt(interventionId) },
    ipAddress: actor.ipAddress || null,
  }).catch(() => null);

  return intervention;
};

module.exports = {
  ensureStudentSupportSqlReady,
  getStudentSupportSummary,
  listStudentRemarks,
  createStudentRemark,
  updateStudentRemarkStatus,
  listStudentInterventions,
  createStudentIntervention,
  updateStudentInterventionStatus,
};
