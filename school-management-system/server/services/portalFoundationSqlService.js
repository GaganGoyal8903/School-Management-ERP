const fs = require('fs');
const path = require('path');
const {
  getSqlClient,
  executeStoredProcedure,
  executeQuery,
  getPool,
} = require('../config/sqlServer');
const { ensureAuthSqlReady } = require('./authSqlService');
const { ensureStudentSqlReady, getStudentFullProfile } = require('./studentSqlService');
const { getStudentAttendanceReport } = require('./attendanceSqlService');
const { getFeesForStudent } = require('./feeSqlService');
const { getTimetableByClassFromSql } = require('./timetableSqlService');
const { getStudentLeaveHistory } = require('./leaveSqlService');

const DATABASE_DIR = path.join(__dirname, '..', 'database');
const PORTAL_TABLE_SQL_PATH = path.join(DATABASE_DIR, 'portal-foundation-table.sql');
const PORTAL_PROC_SQL_PATH = path.join(DATABASE_DIR, 'portal-foundation-procedures.sql');

const splitSqlBatches = (sqlText = '') => String(sqlText || '')
  .split(/^\s*GO\s*$/gim)
  .map((batch) => batch.trim())
  .filter(Boolean);

const readSqlBatches = (filePath) => splitSqlBatches(fs.readFileSync(filePath, 'utf8'));

const PORTAL_TABLE_BATCHES = readSqlBatches(PORTAL_TABLE_SQL_PATH);
const PORTAL_PROC_BATCHES = readSqlBatches(PORTAL_PROC_SQL_PATH);

let portalBootstrapPromise = null;

const ensurePortalFoundationSqlReady = async () => {
  if (!portalBootstrapPromise) {
    portalBootstrapPromise = (async () => {
      await ensureAuthSqlReady();
      await ensureStudentSqlReady();
      const pool = await getPool();

      for (const batch of PORTAL_TABLE_BATCHES) {
        await pool.request().batch(batch);
      }

      for (const batch of PORTAL_PROC_BATCHES) {
        await pool.request().batch(batch);
      }

      return true;
    })().catch((error) => {
      portalBootstrapPromise = null;
      throw error;
    });
  }

  return portalBootstrapPromise;
};

const normalizeInteger = (value) => {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
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

const normalizeCsv = (values = []) => (Array.isArray(values) ? values : String(values || '').split(','))
  .map((value) => String(value || '').trim())
  .filter(Boolean)
  .join(',');

const mapBranchRow = (row = {}) => ({
  branchId: normalizeInteger(row.BranchId),
  name: row.BranchName || '',
  code: row.BranchCode || '',
  addressLine1: row.AddressLine1 || '',
  addressLine2: row.AddressLine2 || '',
  city: row.City || '',
  state: row.State || '',
  postalCode: row.PostalCode || '',
  phone: row.Phone || '',
  email: row.Email || '',
  principalName: row.PrincipalName || '',
  capacity: Number(row.Capacity || 0),
  isActive: row.IsActive === true || row.IsActive === 1,
  studentCount: Number(row.StudentCount || 0),
  createdAt: row.CreatedAt || null,
  updatedAt: row.UpdatedAt || null,
});

const mapNotificationRow = (row = {}) => ({
  notificationId: normalizeInteger(row.NotificationId),
  title: row.Title || '',
  message: row.Message || '',
  type: row.NotificationType || 'info',
  audienceRoles: String(row.AudienceRoles || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  senderUserId: normalizeInteger(row.SenderUserId),
  senderFullName: row.SenderFullName || '',
  linkUrl: row.LinkUrl || '',
  metadataJson: row.MetadataJson || null,
  isRead: row.IsRead === true || row.IsRead === 1,
  readAt: row.ReadAt || null,
  createdAt: row.CreatedAt || null,
});

const mapContactRow = (row = {}) => ({
  userId: normalizeInteger(row.UserId),
  fullName: row.FullName || '',
  email: row.Email || '',
  phone: row.Phone || '',
  role: String(row.RoleName || '').trim().toLowerCase(),
});

const mapConversationSummaryRow = (row = {}) => ({
  conversationId: normalizeInteger(row.ConversationId),
  subject: row.Subject || '',
  studentId: normalizeInteger(row.StudentId),
  lastMessageAt: row.LastMessageAt || row.LatestMessageCreatedAt || null,
  latestMessage: row.LatestMessageBody || '',
  participantUserId: normalizeInteger(row.ParticipantUserId),
  participantFullName: row.ParticipantFullName || 'Conversation',
  participantRoleName: String(row.ParticipantRoleName || '').trim().toLowerCase(),
  createdAt: row.CreatedAt || null,
});

const mapMessageRow = (row = {}) => ({
  messageId: normalizeInteger(row.MessageId),
  conversationId: normalizeInteger(row.ConversationId),
  senderUserId: normalizeInteger(row.SenderUserId),
  senderFullName: row.SenderFullName || '',
  senderRole: String(row.SenderRole || '').trim().toLowerCase(),
  body: row.Body || '',
  attachmentUrl: row.AttachmentUrl || '',
  createdAt: row.CreatedAt || null,
});

const mapMeetingRow = (row = {}) => ({
  meetingId: normalizeInteger(row.MeetingId),
  parentUserId: normalizeInteger(row.ParentUserId),
  parentFullName: row.ParentFullName || '',
  teacherUserId: normalizeInteger(row.TeacherUserId),
  teacherFullName: row.TeacherFullName || '',
  studentId: normalizeInteger(row.StudentId),
  studentFullName: row.StudentFullName || '',
  className: row.ClassName || '',
  sectionName: row.SectionName || '',
  subject: row.Subject || '',
  title: row.Title || '',
  description: row.Description || '',
  requestedDate: row.RequestedDate || null,
  requestedTime: row.RequestedTime || '',
  meetingDate: row.MeetingDate || null,
  meetingTime: row.MeetingTime || '',
  meetingMode: row.MeetingMode || 'offline',
  meetingLink: row.MeetingLink || '',
  status: row.Status || 'pending',
  parentNotes: row.ParentNotes || '',
  teacherNotes: row.TeacherNotes || '',
  reviewedByUserId: normalizeInteger(row.ReviewedByUserId),
  reviewedByFullName: row.ReviewedByFullName || '',
  reviewedAt: row.ReviewedAt || null,
  createdAt: row.CreatedAt || null,
  updatedAt: row.UpdatedAt || null,
});

const listBranches = async () => {
  await ensurePortalFoundationSqlReady();
  const result = await executeStoredProcedure('dbo.spBranchList');
  return (result?.recordset || []).map(mapBranchRow);
};

const upsertBranch = async (payload = {}, actorUserId = null) => {
  await ensurePortalFoundationSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spBranchUpsert', [
    { name: 'BranchId', type: sql.Int, value: normalizeInteger(payload.branchId || payload.id) },
    { name: 'BranchName', type: sql.NVarChar(200), value: String(payload.name || '').trim() || null },
    { name: 'BranchCode', type: sql.NVarChar(50), value: String(payload.code || '').trim() || null },
    { name: 'AddressLine1', type: sql.NVarChar(255), value: String(payload.addressLine1 || payload.address || '').trim() || null },
    { name: 'AddressLine2', type: sql.NVarChar(255), value: String(payload.addressLine2 || '').trim() || null },
    { name: 'City', type: sql.NVarChar(120), value: String(payload.city || '').trim() || null },
    { name: 'State', type: sql.NVarChar(120), value: String(payload.state || '').trim() || null },
    { name: 'PostalCode', type: sql.NVarChar(20), value: String(payload.postalCode || payload.pincode || '').trim() || null },
    { name: 'Phone', type: sql.NVarChar(40), value: String(payload.phone || '').trim() || null },
    { name: 'Email', type: sql.NVarChar(320), value: String(payload.email || '').trim() || null },
    { name: 'PrincipalName', type: sql.NVarChar(200), value: String(payload.principalName || payload.principal || '').trim() || null },
    { name: 'Capacity', type: sql.Int, value: Number(payload.capacity || 0) || 0 },
    { name: 'IsActive', type: sql.Bit, value: payload.isActive !== false },
    { name: 'ActorUserId', type: sql.Int, value: normalizeInteger(actorUserId) },
  ]);
  return (result?.recordset || []).map(mapBranchRow);
};

const deleteBranch = async (branchId) => {
  await ensurePortalFoundationSqlReady();
  const sql = getSqlClient();
  await executeStoredProcedure('dbo.spBranchDelete', [
    { name: 'BranchId', type: sql.Int, value: normalizeInteger(branchId) },
  ]);
  return true;
};

const createParentStudentLink = async ({ parentUserId, studentId, relation = null, isPrimary = true, createdByUserId = null }) => {
  await ensurePortalFoundationSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spParentStudentLinkUpsert', [
    { name: 'ParentUserId', type: sql.Int, value: normalizeInteger(parentUserId) },
    { name: 'StudentId', type: sql.Int, value: normalizeInteger(studentId) },
    { name: 'Relation', type: sql.NVarChar(50), value: relation ? String(relation).trim() : null },
    { name: 'IsPrimary', type: sql.Bit, value: isPrimary !== false },
    { name: 'CreatedByUserId', type: sql.Int, value: normalizeInteger(createdByUserId) },
  ]);
  return result?.recordset?.[0] || null;
};

const createNotification = async ({
  senderUserId = null,
  title,
  message,
  notificationType = 'info',
  audienceRoles = [],
  recipientUserIds = [],
  linkUrl = null,
  metadataJson = null,
} = {}) => {
  await ensurePortalFoundationSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spPortalNotificationCreate', [
    { name: 'SenderUserId', type: sql.Int, value: normalizeInteger(senderUserId) },
    { name: 'Title', type: sql.NVarChar(200), value: String(title || '').trim() || null },
    { name: 'Message', type: sql.NVarChar(2000), value: String(message || '').trim() || null },
    { name: 'NotificationType', type: sql.NVarChar(30), value: String(notificationType || 'info').trim().toLowerCase() },
    { name: 'AudienceRoles', type: sql.NVarChar(200), value: normalizeCsv(audienceRoles) || null },
    { name: 'RecipientUserIds', type: sql.NVarChar(sql.MAX), value: normalizeCsv(recipientUserIds) || null },
    { name: 'LinkUrl', type: sql.NVarChar(500), value: linkUrl ? String(linkUrl).trim() : null },
    { name: 'MetadataJson', type: sql.NVarChar(sql.MAX), value: metadataJson ? String(metadataJson) : null },
  ]);
  return mapNotificationRow(result?.recordset?.[0] || null);
};

const getNotificationInbox = async (userId, limit = 20) => {
  await ensurePortalFoundationSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spPortalNotificationInbox', [
    { name: 'UserId', type: sql.Int, value: normalizeInteger(userId) },
    { name: 'Limit', type: sql.Int, value: Number(limit) || 20 },
  ]);
  return (result?.recordset || []).map(mapNotificationRow);
};

const markNotificationRead = async (notificationId, userId) => {
  await ensurePortalFoundationSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spPortalNotificationMarkRead', [
    { name: 'NotificationId', type: sql.Int, value: normalizeInteger(notificationId) },
    { name: 'UserId', type: sql.Int, value: normalizeInteger(userId) },
  ]);
  return (result?.recordset || []).map(mapNotificationRow);
};

const getPortalContacts = async (userId, roleName) => {
  await ensurePortalFoundationSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spPortalContactList', [
    { name: 'UserId', type: sql.Int, value: normalizeInteger(userId) },
    { name: 'RoleName', type: sql.NVarChar(50), value: String(roleName || '').trim().toLowerCase() || null },
  ]);
  return (result?.recordset || []).map(mapContactRow);
};

const getConversationList = async (userId) => {
  await ensurePortalFoundationSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spPortalConversationList', [
    { name: 'UserId', type: sql.Int, value: normalizeInteger(userId) },
  ]);
  return (result?.recordset || []).map(mapConversationSummaryRow);
};

const getConversationMessages = async (conversationId, userId) => {
  await ensurePortalFoundationSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spPortalConversationMessages', [
    { name: 'ConversationId', type: sql.Int, value: normalizeInteger(conversationId) },
    { name: 'UserId', type: sql.Int, value: normalizeInteger(userId) },
  ]);
  return (result?.recordset || []).map(mapMessageRow);
};

const sendPortalMessage = async ({
  senderUserId,
  recipientUserId,
  subject = null,
  body,
  studentId = null,
} = {}) => {
  await ensurePortalFoundationSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spPortalMessageSend', [
    { name: 'SenderUserId', type: sql.Int, value: normalizeInteger(senderUserId) },
    { name: 'RecipientUserId', type: sql.Int, value: normalizeInteger(recipientUserId) },
    { name: 'Subject', type: sql.NVarChar(200), value: subject ? String(subject).trim() : null },
    { name: 'Body', type: sql.NVarChar(sql.MAX), value: String(body || '').trim() || null },
    { name: 'StudentId', type: sql.Int, value: normalizeInteger(studentId) },
  ]);
  return (result?.recordset || []).map(mapMessageRow);
};

const listPortalMeetings = async (userId, roleName, status = null) => {
  await ensurePortalFoundationSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spPortalMeetingList', [
    { name: 'UserId', type: sql.Int, value: normalizeInteger(userId) },
    { name: 'RoleName', type: sql.NVarChar(50), value: String(roleName || '').trim().toLowerCase() || null },
    { name: 'Status', type: sql.NVarChar(20), value: status ? String(status).trim().toLowerCase() : null },
  ]);
  return (result?.recordset || []).map(mapMeetingRow);
};

const createPortalMeeting = async (payload = {}) => {
  await ensurePortalFoundationSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spPortalMeetingCreate', [
    { name: 'ParentUserId', type: sql.Int, value: normalizeInteger(payload.parentUserId) },
    { name: 'TeacherUserId', type: sql.Int, value: normalizeInteger(payload.teacherUserId) },
    { name: 'StudentId', type: sql.Int, value: normalizeInteger(payload.studentId) },
    { name: 'Subject', type: sql.NVarChar(200), value: payload.subject ? String(payload.subject).trim() : null },
    { name: 'Title', type: sql.NVarChar(200), value: String(payload.title || '').trim() || null },
    { name: 'Description', type: sql.NVarChar(2000), value: payload.description ? String(payload.description).trim() : null },
    { name: 'RequestedDate', type: sql.Date, value: parseDateInput(payload.requestedDate) },
    { name: 'RequestedTime', type: sql.NVarChar(20), value: payload.requestedTime ? String(payload.requestedTime).trim() : null },
    { name: 'MeetingMode', type: sql.NVarChar(20), value: String(payload.meetingMode || 'offline').trim().toLowerCase() },
    { name: 'ParentNotes', type: sql.NVarChar(2000), value: payload.parentNotes ? String(payload.parentNotes).trim() : null },
  ]);
  return mapMeetingRow(result?.recordset?.[0] || null);
};

const reviewPortalMeeting = async (meetingId, reviewerUserId, payload = {}) => {
  await ensurePortalFoundationSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spPortalMeetingReview', [
    { name: 'MeetingId', type: sql.Int, value: normalizeInteger(meetingId) },
    { name: 'ReviewerUserId', type: sql.Int, value: normalizeInteger(reviewerUserId) },
    { name: 'Status', type: sql.NVarChar(20), value: String(payload.status || '').trim().toLowerCase() || null },
    { name: 'MeetingDate', type: sql.Date, value: parseDateInput(payload.meetingDate) },
    { name: 'MeetingTime', type: sql.NVarChar(20), value: payload.meetingTime ? String(payload.meetingTime).trim() : null },
    { name: 'MeetingLink', type: sql.NVarChar(500), value: payload.meetingLink ? String(payload.meetingLink).trim() : null },
    { name: 'TeacherNotes', type: sql.NVarChar(2000), value: payload.teacherNotes ? String(payload.teacherNotes).trim() : null },
  ]);
  return mapMeetingRow(result?.recordset?.[0] || null);
};

const cancelPortalMeeting = async (meetingId, userId, roleName, notes = null) => {
  await ensurePortalFoundationSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spPortalMeetingCancel', [
    { name: 'MeetingId', type: sql.Int, value: normalizeInteger(meetingId) },
    { name: 'UserId', type: sql.Int, value: normalizeInteger(userId) },
    { name: 'RoleName', type: sql.NVarChar(50), value: String(roleName || '').trim().toLowerCase() || null },
    { name: 'Notes', type: sql.NVarChar(2000), value: notes ? String(notes).trim() : null },
  ]);
  return mapMeetingRow(result?.recordset?.[0] || null);
};

const resolveParentLinkedStudentId = async (user = {}) => {
  await ensurePortalFoundationSqlReady();
  const userId = normalizeInteger(user?.id || user?.UserId || user?.userId || user?._id);
  if (!userId) {
    return null;
  }

  const sql = getSqlClient();
  const normalizedEmail = String(user?.email || user?.Email || '').trim().toLowerCase() || null;
  const normalizedPhone = String(user?.phone || user?.Phone || '').replace(/\D+/g, '') || null;

  const result = await executeQuery(`
    SELECT TOP 1 PSL.StudentId
    FROM dbo.ParentStudentLinks PSL
    WHERE PSL.ParentUserId = @UserId
      AND PSL.IsActive = 1
    ORDER BY PSL.IsPrimary DESC, PSL.ParentStudentLinkId ASC;

    SELECT TOP 1 G.StudentId
    FROM dbo.Guardians G
    WHERE (
        (@Email IS NOT NULL AND LOWER(LTRIM(RTRIM(ISNULL(G.Email, N'')))) = @Email)
        OR (
          @Phone IS NOT NULL
          AND REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(G.Phone, N''), N' ', N''), N'-', N''), N'+', N''), N'(', N''), N')', N'') = @Phone
        )
      )
    ORDER BY G.IsPrimaryGuardian DESC, G.GuardianId ASC;
  `, [
    { name: 'UserId', type: sql.Int, value: userId },
    { name: 'Email', type: sql.NVarChar(320), value: normalizedEmail },
    { name: 'Phone', type: sql.NVarChar(40), value: normalizedPhone },
  ]);

  const directLinkId = normalizeInteger(result?.recordsets?.[0]?.[0]?.StudentId);
  if (directLinkId) {
    return directLinkId;
  }

  return normalizeInteger(result?.recordsets?.[1]?.[0]?.StudentId);
};

const getParentPortalSnapshot = async (user = {}) => {
  const studentId = await resolveParentLinkedStudentId(user);
  const notifications = await getNotificationInbox(user?.id || user?.UserId || user?.userId || user?._id, 8).catch(() => []);
  const meetings = await listPortalMeetings(user?.id || user?.UserId || user?.userId || user?._id, 'parent').catch(() => []);

  if (!studentId) {
    return {
      studentId: null,
      student: null,
      attendance: { records: [], stats: { total: 0, present: 0, absent: 0, late: 0, percentage: 0 } },
      fees: [],
      leaves: [],
      timetable: [],
      meetings,
      notifications,
    };
  }

  const [profile, attendancePayload, feeRecords, leaves] = await Promise.all([
    getStudentFullProfile(studentId),
    getStudentAttendanceReport({ studentId }).catch(() => ({ attendance: [], stats: { total: 0, present: 0, absent: 0, late: 0, percentage: 0 } })),
    getFeesForStudent(studentId).catch(() => []),
    getStudentLeaveHistory(studentId, 10).catch(() => []),
  ]);

  const student = profile?.student || null;
  const timetable = student?.className
    ? await getTimetableByClassFromSql({
        className: student.className,
        section: student.sectionName || null,
      }).catch(() => [])
    : [];

  return {
    studentId,
    student,
    attendance: {
      records: Array.isArray(attendancePayload?.attendance) ? attendancePayload.attendance : Array.isArray(attendancePayload) ? attendancePayload : [],
      stats: attendancePayload?.stats || attendancePayload?.summary || { total: 0, present: 0, absent: 0, late: 0, percentage: 0 },
    },
    fees: Array.isArray(feeRecords) ? feeRecords : [],
    leaves: Array.isArray(leaves) ? leaves : [],
    timetable: Array.isArray(timetable) ? timetable : [],
    meetings,
    notifications,
  };
};

module.exports = {
  ensurePortalFoundationSqlReady,
  listBranches,
  upsertBranch,
  deleteBranch,
  createParentStudentLink,
  createNotification,
  getNotificationInbox,
  markNotificationRead,
  getPortalContacts,
  getConversationList,
  getConversationMessages,
  sendPortalMessage,
  listPortalMeetings,
  createPortalMeeting,
  reviewPortalMeeting,
  cancelPortalMeeting,
  resolveParentLinkedStudentId,
  getParentPortalSnapshot,
  normalizeInteger,
  parseDateInput,
};
