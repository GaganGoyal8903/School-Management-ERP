const { initSqlServer, getPool } = require('../config/sqlServer');

const ROLE_EMAIL_UNIQUENESS_BATCH = `
IF EXISTS (
  SELECT 1
  FROM dbo.Users
  GROUP BY Email, RoleId
  HAVING COUNT(*) > 1
)
BEGIN
  THROW 51000, 'Duplicate email+role rows exist in dbo.Users. Resolve conflicts before applying role-aware email uniqueness.', 1;
END;

IF EXISTS (
  SELECT 1
  FROM dbo.SqlAuthUsers
  GROUP BY Email, RoleName
  HAVING COUNT(*) > 1
)
BEGIN
  THROW 51001, 'Duplicate email+role rows exist in dbo.SqlAuthUsers. Resolve conflicts before applying role-aware email uniqueness.', 1;
END;

DECLARE @usersEmailConstraint SYSNAME = NULL;
DECLARE @sqlAuthEmailIndex SYSNAME = NULL;
DECLARE @statement NVARCHAR(MAX);

SELECT TOP 1
  @usersEmailConstraint = kc.name
FROM sys.key_constraints kc
INNER JOIN sys.index_columns ic
  ON kc.parent_object_id = ic.object_id
 AND kc.unique_index_id = ic.index_id
INNER JOIN sys.columns c
  ON ic.object_id = c.object_id
 AND ic.column_id = c.column_id
WHERE kc.parent_object_id = OBJECT_ID(N'dbo.Users')
  AND kc.type = 'UQ'
GROUP BY kc.name
HAVING COUNT(*) = 1
   AND MAX(CASE WHEN c.name = 'Email' THEN 1 ELSE 0 END) = 1;

IF @usersEmailConstraint IS NOT NULL
BEGIN
  SET @statement = N'ALTER TABLE dbo.Users DROP CONSTRAINT ' + QUOTENAME(@usersEmailConstraint) + N';';
  EXEC sp_executesql @statement;
END;

SELECT TOP 1
  @sqlAuthEmailIndex = i.name
FROM sys.indexes i
INNER JOIN sys.index_columns ic
  ON i.object_id = ic.object_id
 AND i.index_id = ic.index_id
INNER JOIN sys.columns c
  ON ic.object_id = c.object_id
 AND ic.column_id = c.column_id
WHERE i.object_id = OBJECT_ID(N'dbo.SqlAuthUsers')
  AND i.is_unique = 1
  AND i.is_primary_key = 0
  AND i.is_unique_constraint = 0
GROUP BY i.name
HAVING COUNT(*) = 1
   AND MAX(CASE WHEN c.name = 'Email' THEN 1 ELSE 0 END) = 1;

IF @sqlAuthEmailIndex IS NOT NULL
BEGIN
  SET @statement = N'DROP INDEX ' + QUOTENAME(@sqlAuthEmailIndex) + N' ON dbo.SqlAuthUsers;';
  EXEC sp_executesql @statement;
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'UX_Users_EmailRoleId'
    AND object_id = OBJECT_ID(N'dbo.Users')
)
BEGIN
  CREATE UNIQUE INDEX UX_Users_EmailRoleId ON dbo.Users (Email, RoleId);
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'UX_SqlAuthUsers_EmailRoleName'
    AND object_id = OBJECT_ID(N'dbo.SqlAuthUsers')
)
BEGIN
  CREATE UNIQUE INDEX UX_SqlAuthUsers_EmailRoleName ON dbo.SqlAuthUsers (Email, RoleName);
END;
`;

async function migrateEmailRoleUniqueness() {
  await initSqlServer();
  const pool = await getPool();
  await pool.request().batch(ROLE_EMAIL_UNIQUENESS_BATCH);
  return true;
}

module.exports = {
  migrateEmailRoleUniqueness,
};
