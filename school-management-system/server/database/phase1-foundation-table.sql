IF OBJECT_ID(N'dbo.AppSettings', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.AppSettings (
    AppSettingId INT IDENTITY(1,1) PRIMARY KEY,
    SettingGroup NVARCHAR(100) NOT NULL,
    SettingKey NVARCHAR(120) NOT NULL,
    SettingValue NVARCHAR(MAX) NULL,
    ValueType NVARCHAR(30) NOT NULL CONSTRAINT DF_AppSettings_ValueType DEFAULT (N'string'),
    Description NVARCHAR(500) NULL,
    UpdatedByUserId INT NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_AppSettings_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_AppSettings_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'UX_AppSettings_GroupKey'
    AND object_id = OBJECT_ID(N'dbo.AppSettings')
)
BEGIN
  CREATE UNIQUE INDEX UX_AppSettings_GroupKey
  ON dbo.AppSettings(SettingGroup, SettingKey);
END;
GO

IF OBJECT_ID(N'dbo.AuditLogs', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.AuditLogs (
    AuditLogId INT IDENTITY(1,1) PRIMARY KEY,
    ActorUserId INT NULL,
    ActorFullName NVARCHAR(200) NULL,
    ActorRole NVARCHAR(50) NULL,
    ActionName NVARCHAR(150) NOT NULL,
    EntityName NVARCHAR(120) NOT NULL,
    EntityId NVARCHAR(120) NULL,
    Summary NVARCHAR(500) NULL,
    DetailsJson NVARCHAR(MAX) NULL,
    IpAddress NVARCHAR(64) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_AuditLogs_CreatedAt DEFAULT SYSUTCDATETIME()
  );
END;
GO

IF COL_LENGTH(N'dbo.AuditLogs', N'ActorUserId') IS NULL
BEGIN
  ALTER TABLE dbo.AuditLogs ADD ActorUserId INT NULL;
END;
GO

IF COL_LENGTH(N'dbo.AuditLogs', N'ActorFullName') IS NULL
BEGIN
  ALTER TABLE dbo.AuditLogs ADD ActorFullName NVARCHAR(200) NULL;
END;
GO

IF COL_LENGTH(N'dbo.AuditLogs', N'ActorRole') IS NULL
BEGIN
  ALTER TABLE dbo.AuditLogs ADD ActorRole NVARCHAR(50) NULL;
END;
GO

IF COL_LENGTH(N'dbo.AuditLogs', N'ActionName') IS NULL
BEGIN
  ALTER TABLE dbo.AuditLogs ADD ActionName NVARCHAR(150) NULL;
END;
GO

IF COL_LENGTH(N'dbo.AuditLogs', N'EntityName') IS NULL
BEGIN
  ALTER TABLE dbo.AuditLogs ADD EntityName NVARCHAR(120) NULL;
END;
GO

IF COL_LENGTH(N'dbo.AuditLogs', N'EntityId') IS NULL
BEGIN
  ALTER TABLE dbo.AuditLogs ADD EntityId NVARCHAR(120) NULL;
END;
GO

IF COL_LENGTH(N'dbo.AuditLogs', N'Summary') IS NULL
BEGIN
  ALTER TABLE dbo.AuditLogs ADD Summary NVARCHAR(500) NULL;
END;
GO

IF COL_LENGTH(N'dbo.AuditLogs', N'DetailsJson') IS NULL
BEGIN
  ALTER TABLE dbo.AuditLogs ADD DetailsJson NVARCHAR(MAX) NULL;
END;
GO

IF COL_LENGTH(N'dbo.AuditLogs', N'IpAddress') IS NULL
BEGIN
  ALTER TABLE dbo.AuditLogs ADD IpAddress NVARCHAR(64) NULL;
END;
GO

IF COL_LENGTH(N'dbo.AuditLogs', N'CreatedAt') IS NULL
BEGIN
  ALTER TABLE dbo.AuditLogs ADD CreatedAt DATETIME2(0) NULL;
END;
GO

UPDATE dbo.AuditLogs
SET CreatedAt = SYSUTCDATETIME()
WHERE CreatedAt IS NULL;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'IX_AuditLogs_EntityCreatedAt'
    AND object_id = OBJECT_ID(N'dbo.AuditLogs')
)
BEGIN
  CREATE INDEX IX_AuditLogs_EntityCreatedAt
  ON dbo.AuditLogs(EntityName, CreatedAt DESC);
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'IX_AuditLogs_ActorCreatedAt'
    AND object_id = OBJECT_ID(N'dbo.AuditLogs')
)
BEGIN
  CREATE INDEX IX_AuditLogs_ActorCreatedAt
  ON dbo.AuditLogs(ActorUserId, CreatedAt DESC);
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM dbo.AppSettings
  WHERE SettingGroup = N'system'
    AND SettingKey = N'schoolName'
)
BEGIN
  INSERT INTO dbo.AppSettings (
    SettingGroup, SettingKey, SettingValue, ValueType, Description
  )
  VALUES
    (N'system', N'schoolName', N'Mayo College', N'string', N'Displayed school name across the portal'),
    (N'system', N'academicYear', N'2024-2025', N'string', N'Active academic year shown in dashboards'),
    (N'system', N'appVersion', N'1.0.0', N'string', N'Visible application version'),
    (N'system', N'contactEmail', N'info@mayocollege.edu', N'string', N'Default school contact email'),
    (N'system', N'contactPhone', N'+91 00000 00000', N'string', N'Default school contact phone'),
    (N'system', N'address', N'Ajmer, Rajasthan', N'string', N'Default school address'),
    (N'system', N'notificationsEnabled', N'true', N'boolean', N'Global notification delivery toggle'),
    (N'system', N'parentPortalEnabled', N'true', N'boolean', N'Global parent portal visibility toggle');
END;
GO
