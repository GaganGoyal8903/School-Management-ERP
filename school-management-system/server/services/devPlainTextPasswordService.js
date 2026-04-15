const User = require('../models/User');
const { getSqlClient, executeQuery } = require('../config/sqlServer');
const { ensureAuthSqlReady } = require('./authSqlService');

const BCRYPT_PREFIX_REGEX = /^\$2[aby]\$\d{2}\$/;
const DEFAULT_DEVELOPMENT_PASSWORD = 'Mayo@123';
const ROLE_DEFAULT_PASSWORDS = Object.freeze({
  admin: DEFAULT_DEVELOPMENT_PASSWORD,
  teacher: DEFAULT_DEVELOPMENT_PASSWORD,
  student: DEFAULT_DEVELOPMENT_PASSWORD,
  parent: 'parent123',
});
let normalizationPromise = null;

const isBcryptHash = (value = '') => BCRYPT_PREFIX_REGEX.test(String(value || ''));
const normalizeEmail = (value = '') => String(value || '').trim().toLowerCase();
const normalizeRole = (value = '') => String(value || '').trim().toLowerCase();

const resolveDevelopmentPassword = ({ email = '', role = '', currentPassword = '' } = {}) => {
  const normalizedPassword = String(currentPassword || '');
  if (normalizedPassword && !isBcryptHash(normalizedPassword)) {
    return normalizedPassword;
  }

  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail === 'gagangoyal878@gmail.com') {
    return DEFAULT_DEVELOPMENT_PASSWORD;
  }

  return ROLE_DEFAULT_PASSWORDS[normalizeRole(role)] || DEFAULT_DEVELOPMENT_PASSWORD;
};

const normalizeMongoUserPasswords = async () => {
  const users = await User.find({
    password: { $exists: true, $ne: null },
  })
    .select('_id email role password')
    .lean();

  const usersToUpdate = users
    .map((user) => ({
      ...user,
      nextPassword: resolveDevelopmentPassword({
        email: user.email,
        role: user.role,
        currentPassword: user.password,
      }),
    }))
    .filter((user) => String(user.password || '') !== user.nextPassword);

  if (!usersToUpdate.length) {
    return {
      scanned: users.length,
      updated: 0,
    };
  }

  const operations = usersToUpdate.map((user) => ({
    updateOne: {
      filter: { _id: user._id },
      update: {
        $set: {
          password: user.nextPassword,
        },
      },
    },
  }));

  const result = await User.bulkWrite(operations, { ordered: false });
  return {
    scanned: users.length,
    updated: Number(result?.modifiedCount || 0),
  };
};

const updateSqlPasswords = async ({ selectQuery, tableName, idColumn }) => {
  await ensureAuthSqlReady();

  const sql = getSqlClient();
  const result = await executeQuery(selectQuery);
  const rows = result?.recordset || [];
  const rowsToUpdate = rows
    .map((row) => ({
      rowId: Number(row.RowId),
      nextPassword: resolveDevelopmentPassword({
        email: row.Email,
        role: row.RoleName,
        currentPassword: row.PasswordHash,
      }),
      currentPassword: String(row.PasswordHash || ''),
    }))
    .filter((row) => row.rowId > 0 && row.currentPassword !== row.nextPassword);

  for (const row of rowsToUpdate) {
    await executeQuery(
      `UPDATE ${tableName}
       SET PasswordHash = @PasswordHash,
           UpdatedAt = SYSUTCDATETIME()
       WHERE ${idColumn} = @RowId`,
      [
        { name: 'PasswordHash', type: sql.NVarChar(255), value: row.nextPassword },
        { name: 'RowId', type: sql.Int, value: row.rowId },
      ]
    );
  }

  return {
    scanned: rows.length,
    updated: rowsToUpdate.length,
  };
};

const normalizePrimarySqlPasswords = async () =>
  updateSqlPasswords({
    selectQuery: `
      SELECT
        u.UserId AS RowId,
        u.Email,
        r.RoleName,
        u.PasswordHash
      FROM dbo.Users u
      LEFT JOIN dbo.Roles r ON r.RoleId = u.RoleId
      WHERE u.PasswordHash IS NOT NULL
        AND LEN(LTRIM(RTRIM(u.PasswordHash))) > 0`,
    tableName: 'dbo.Users',
    idColumn: 'UserId',
  });

const normalizeMirrorSqlPasswords = async () =>
  updateSqlPasswords({
    selectQuery: `
      SELECT
        AuthUserId AS RowId,
        Email,
        RoleName,
        PasswordHash
      FROM dbo.SqlAuthUsers
      WHERE PasswordHash IS NOT NULL
        AND LEN(LTRIM(RTRIM(PasswordHash))) > 0`,
    tableName: 'dbo.SqlAuthUsers',
    idColumn: 'AuthUserId',
  });

const normalizeDevelopmentPlainTextPasswords = async () => {
  if (!normalizationPromise) {
    normalizationPromise = (async () => {
      // WARNING: Plain text password storage - for development only
      const mongo = await normalizeMongoUserPasswords();
      const primary = await normalizePrimarySqlPasswords();
      const mirror = await normalizeMirrorSqlPasswords();

      return {
        mongo,
        sql: {
          primary,
          mirror,
        },
      };
    })().catch((error) => {
      normalizationPromise = null;
      throw error;
    });
  }

  return normalizationPromise;
};

module.exports = {
  normalizeDevelopmentPlainTextPasswords,
};
