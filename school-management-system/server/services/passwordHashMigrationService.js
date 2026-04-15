const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { getSqlClient, executeQuery } = require('../config/sqlServer');
const { ensureAuthSqlReady, isBcryptHash } = require('./authSqlService');

const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
const PRIMARY_USER_TABLE = 'dbo.Users';
const MIRROR_USER_TABLE = 'dbo.SqlAuthUsers';

const hashPasswordValue = async (value = '') => {
  const normalizedValue = String(value || '');
  if (!normalizedValue) {
    return normalizedValue;
  }

  return bcrypt.hash(normalizedValue, BCRYPT_SALT_ROUNDS);
};

const migrateMongoUserPasswords = async () => {
  const users = await User.find({
    password: { $exists: true, $nin: [null, ''] },
  }).select('_id password');

  let updated = 0;

  for (const user of users) {
    const storedPassword = String(user.password || '');
    if (!storedPassword || isBcryptHash(storedPassword)) {
      continue;
    }

    user.password = await hashPasswordValue(storedPassword);
    await user.save({ validateBeforeSave: false });
    updated += 1;
  }

  return {
    scanned: users.length,
    updated,
  };
};

const migrateSqlPasswordTable = async ({ tableName, idColumnName }) => {
  await ensureAuthSqlReady();

  const sql = getSqlClient();
  const result = await executeQuery(
    `SELECT ${idColumnName} AS RecordId, PasswordHash
     FROM ${tableName}
     WHERE PasswordHash IS NOT NULL
       AND LTRIM(RTRIM(PasswordHash)) <> N''`
  );

  const rows = result?.recordset || [];
  let updated = 0;

  for (const row of rows) {
    const storedPassword = String(row.PasswordHash || '');
    if (!storedPassword || isBcryptHash(storedPassword)) {
      continue;
    }

    const hashedPassword = await hashPasswordValue(storedPassword);
    await executeQuery(
      `UPDATE ${tableName}
       SET PasswordHash = @PasswordHash,
           UpdatedAt = SYSUTCDATETIME()
       WHERE ${idColumnName} = @RecordId`,
      [
        { name: 'PasswordHash', type: sql.NVarChar(255), value: hashedPassword },
        { name: 'RecordId', type: sql.Int, value: Number(row.RecordId) },
      ]
    );
    updated += 1;
  }

  return {
    scanned: rows.length,
    updated,
  };
};

const migrateLegacyPasswordHashes = async () => {
  const mongo = await migrateMongoUserPasswords();
  const primary = await migrateSqlPasswordTable({
    tableName: PRIMARY_USER_TABLE,
    idColumnName: 'UserId',
  });
  const mirror = await migrateSqlPasswordTable({
    tableName: MIRROR_USER_TABLE,
    idColumnName: 'AuthUserId',
  });

  return {
    mongo,
    sql: {
      primary,
      mirror,
    },
  };
};

module.exports = {
  migrateLegacyPasswordHashes,
};
