const fs = require('fs');
const path = require('path');
const {
  getPool,
  getSqlClient,
  executeQuery,
  executeStoredProcedure,
} = require('../config/sqlServer');
const {
  ensureAuthSqlReady,
  getAuthUserByEmailRole,
  getAuthUserById,
  updateAuthUser,
} = require('./authSqlService');

const DATABASE_DIR = path.join(__dirname, '..', 'database');
const TABLE_SQL_PATH = path.join(DATABASE_DIR, 'phase1-foundation-table.sql');
const PROC_SQL_PATH = path.join(DATABASE_DIR, 'phase1-foundation-procedures.sql');

const splitSqlBatches = (sqlText = '') => String(sqlText || '')
  .split(/^\s*GO\s*$/gim)
  .map((batch) => batch.trim())
  .filter(Boolean);

const TABLE_BATCHES = splitSqlBatches(fs.readFileSync(TABLE_SQL_PATH, 'utf8'));
const PROC_BATCHES = splitSqlBatches(fs.readFileSync(PROC_SQL_PATH, 'utf8'));

let phase1BootstrapPromise = null;

const ensurePhase1SqlReady = async () => {
  if (!phase1BootstrapPromise) {
    phase1BootstrapPromise = (async () => {
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
      phase1BootstrapPromise = null;
      throw error;
    });
  }

  return phase1BootstrapPromise;
};

const normalizeInteger = (value) => {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
};

const normalizeBoolean = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalizedValue = String(value || '').trim().toLowerCase();
  return ['true', '1', 'yes', 'on'].includes(normalizedValue);
};

const normalizeSettingValue = (setting = {}) => {
  const valueType = String(setting.ValueType || setting.valueType || 'string').trim().toLowerCase();
  const rawValue = setting.SettingValue ?? setting.settingValue ?? null;

  if (rawValue == null) {
    return null;
  }

  if (valueType === 'boolean') {
    return normalizeBoolean(rawValue);
  }

  if (valueType === 'number') {
    const numericValue = Number(rawValue);
    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  if (valueType === 'json') {
    try {
      return JSON.parse(String(rawValue));
    } catch (error) {
      return null;
    }
  }

  return String(rawValue);
};

const mapSettingsRows = (rows = []) => {
  return rows.reduce((result, row) => {
    const settingGroup = row.SettingGroup || 'system';
    if (!result[settingGroup]) {
      result[settingGroup] = {};
    }

    result[settingGroup][row.SettingKey] = {
      id: normalizeInteger(row.AppSettingId),
      key: row.SettingKey,
      group: settingGroup,
      value: normalizeSettingValue(row),
      valueType: String(row.ValueType || 'string').trim().toLowerCase(),
      description: row.Description || '',
      updatedByUserId: normalizeInteger(row.UpdatedByUserId),
      updatedAt: row.UpdatedAt || null,
    };

    return result;
  }, {});
};

const mapAuditLogRow = (row = {}) => ({
  auditLogId: normalizeInteger(row.AuditLogId),
  actorUserId: normalizeInteger(row.ActorUserId),
  actorFullName: row.ActorFullName || '',
  actorRole: String(row.ActorRole || '').trim().toLowerCase(),
  actionName: row.ActionName || '',
  entityName: row.EntityName || '',
  entityId: row.EntityId || '',
  summary: row.Summary || '',
  detailsJson: row.DetailsJson || null,
  ipAddress: row.IpAddress || '',
  createdAt: row.CreatedAt || null,
  totalCount: normalizeInteger(row.TotalCount) || 0,
});

const getAppSettings = async () => {
  await ensurePhase1SqlReady();
  const result = await executeStoredProcedure('dbo.spAppSettingsList');
  const rows = result?.recordset || [];
  return mapSettingsRows(rows);
};

const updateAppSettings = async (settingsPayload = {}, actorUserId = null) => {
  await ensurePhase1SqlReady();
  const sql = getSqlClient();
  const entries = [];

  Object.entries(settingsPayload || {}).forEach(([groupKey, groupValue]) => {
    Object.entries(groupValue || {}).forEach(([settingKey, settingValue]) => {
      let valueType = 'string';
      let value = settingValue;

      if (typeof settingValue === 'boolean') {
        valueType = 'boolean';
        value = settingValue ? 'true' : 'false';
      } else if (typeof settingValue === 'number') {
        valueType = 'number';
        value = String(settingValue);
      } else if (settingValue && typeof settingValue === 'object' && !Array.isArray(settingValue)) {
        valueType = String(settingValue.valueType || (typeof settingValue.value === 'boolean' ? 'boolean' : 'string')).trim().toLowerCase();
        value = settingValue.value;
        if (valueType === 'json') {
          value = JSON.stringify(value ?? null);
        } else if (valueType === 'boolean') {
          value = normalizeBoolean(value) ? 'true' : 'false';
        } else if (valueType === 'number') {
          value = String(Number(value || 0));
        } else {
          value = value == null ? null : String(value);
        }
      } else {
        value = value == null ? null : String(value);
      }

      entries.push({
        group: groupKey,
        key: settingKey,
        value,
        valueType,
      });
    });
  });

  for (const entry of entries) {
    await executeStoredProcedure('dbo.spAppSettingUpsert', [
      { name: 'SettingGroup', type: sql.NVarChar(100), value: entry.group },
      { name: 'SettingKey', type: sql.NVarChar(120), value: entry.key },
      { name: 'SettingValue', type: sql.NVarChar(sql.MAX), value: entry.value },
      { name: 'ValueType', type: sql.NVarChar(30), value: entry.valueType },
      { name: 'Description', type: sql.NVarChar(500), value: null },
      { name: 'UpdatedByUserId', type: sql.Int, value: normalizeInteger(actorUserId) },
    ]);
  }

  return getAppSettings();
};

const createAuditLog = async ({
  actorUserId = null,
  actorFullName = null,
  actorRole = null,
  actionName,
  entityName,
  entityId = null,
  summary = null,
  details = null,
  ipAddress = null,
} = {}) => {
  await ensurePhase1SqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spAuditLogCreate', [
    { name: 'ActorUserId', type: sql.Int, value: normalizeInteger(actorUserId) },
    { name: 'ActorFullName', type: sql.NVarChar(200), value: actorFullName ? String(actorFullName).trim() : null },
    { name: 'ActorRole', type: sql.NVarChar(50), value: actorRole ? String(actorRole).trim().toLowerCase() : null },
    { name: 'ActionName', type: sql.NVarChar(150), value: String(actionName || '').trim() || null },
    { name: 'EntityName', type: sql.NVarChar(120), value: String(entityName || '').trim() || null },
    { name: 'EntityId', type: sql.NVarChar(120), value: entityId ? String(entityId).trim() : null },
    { name: 'Summary', type: sql.NVarChar(500), value: summary ? String(summary).trim() : null },
    { name: 'DetailsJson', type: sql.NVarChar(sql.MAX), value: details ? JSON.stringify(details) : null },
    { name: 'IpAddress', type: sql.NVarChar(64), value: ipAddress ? String(ipAddress).trim() : null },
  ]);

  return mapAuditLogRow(result?.recordset?.[0] || {});
};

const listAuditLogs = async ({ entityName = null, actionName = null, page = 1, limit = 25 } = {}) => {
  await ensurePhase1SqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spAuditLogList', [
    { name: 'EntityName', type: sql.NVarChar(120), value: entityName ? String(entityName).trim() : null },
    { name: 'ActionName', type: sql.NVarChar(150), value: actionName ? String(actionName).trim() : null },
    { name: 'Page', type: sql.Int, value: Number(page) || 1 },
    { name: 'Limit', type: sql.Int, value: Number(limit) || 25 },
  ]);
  const rows = (result?.recordset || []).map(mapAuditLogRow);
  return {
    rows,
    total: rows[0]?.totalCount || 0,
  };
};

const listAuthUsers = async ({ role = null, search = null, limit = 50 } = {}) => {
  await ensurePhase1SqlReady();
  const sql = getSqlClient();
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
  const normalizedRole = role ? String(role).trim().toLowerCase() : null;
  const normalizedSearch = search ? `%${String(search).trim().toLowerCase()}%` : null;

  const result = await executeQuery(
    `SELECT TOP (@Limit)
       u.UserId,
       u.FullName,
       u.Email,
       u.Phone,
       u.IsActive,
       u.LastLoginAt,
       r.RoleName
     FROM dbo.Users u
     LEFT JOIN dbo.Roles r ON r.RoleId = u.RoleId
     WHERE (@RoleName IS NULL OR LOWER(LTRIM(RTRIM(r.RoleName))) = @RoleName)
       AND (
         @Search IS NULL
         OR LOWER(LTRIM(RTRIM(ISNULL(u.FullName, N'')))) LIKE @Search
         OR LOWER(LTRIM(RTRIM(ISNULL(u.Email, N'')))) LIKE @Search
       )
     ORDER BY u.FullName ASC, u.UserId ASC`,
    [
      { name: 'Limit', type: sql.Int, value: safeLimit },
      { name: 'RoleName', type: sql.NVarChar(50), value: normalizedRole },
      { name: 'Search', type: sql.NVarChar(320), value: normalizedSearch },
    ]
  );

  return (result?.recordset || []).map((row) => ({
    userId: normalizeInteger(row.UserId),
    fullName: row.FullName || '',
    email: row.Email || '',
    phone: row.Phone || '',
    role: String(row.RoleName || '').trim().toLowerCase(),
    isActive: row.IsActive === true || row.IsActive === 1,
    lastLoginAt: row.LastLoginAt || null,
  }));
};

const resetAuthUserPassword = async ({ targetUserId = null, email = null, role = null, newPassword }) => {
  await ensurePhase1SqlReady();

  let targetUser = null;
  const normalizedTargetUserId = normalizeInteger(targetUserId);
  if (normalizedTargetUserId) {
    targetUser = await getAuthUserById(normalizedTargetUserId);
  } else if (email && role) {
    targetUser = await getAuthUserByEmailRole(email, role);
  }

  if (!targetUser?._id) {
    throw new Error('Target user not found.');
  }

  const updatedUser = await updateAuthUser(targetUser._id, { password: String(newPassword || '') });
  return updatedUser;
};

module.exports = {
  ensurePhase1SqlReady,
  getAppSettings,
  updateAppSettings,
  createAuditLog,
  listAuditLogs,
  listAuthUsers,
  resetAuthUserPassword,
};
