IF OBJECT_ID(N'dbo.StudentRemarks', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.StudentRemarks (
    RemarkId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    StudentId INT NOT NULL,
    TeacherUserId INT NULL,
    RemarkType NVARCHAR(40) NOT NULL CONSTRAINT DF_StudentRemarks_RemarkType DEFAULT (N'general'),
    Severity NVARCHAR(20) NOT NULL CONSTRAINT DF_StudentRemarks_Severity DEFAULT (N'medium'),
    Category NVARCHAR(40) NOT NULL CONSTRAINT DF_StudentRemarks_Category DEFAULT (N'academic'),
    Title NVARCHAR(200) NOT NULL,
    Notes NVARCHAR(MAX) NOT NULL,
    FollowUpDate DATE NULL,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_StudentRemarks_Status DEFAULT (N'open'),
    ClosedAt DATETIME2(0) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_StudentRemarks_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_StudentRemarks_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END;
GO

IF OBJECT_ID(N'dbo.StudentInterventions', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.StudentInterventions (
    InterventionId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    StudentId INT NOT NULL,
    CreatedByUserId INT NULL,
    Category NVARCHAR(40) NOT NULL CONSTRAINT DF_StudentInterventions_Category DEFAULT (N'academic'),
    RiskLevel NVARCHAR(20) NOT NULL CONSTRAINT DF_StudentInterventions_RiskLevel DEFAULT (N'moderate'),
    TriggerSource NVARCHAR(80) NULL,
    Summary NVARCHAR(500) NOT NULL,
    ActionPlan NVARCHAR(MAX) NULL,
    ParentContactNeeded BIT NOT NULL CONSTRAINT DF_StudentInterventions_ParentContactNeeded DEFAULT (0),
    FollowUpDate DATE NULL,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_StudentInterventions_Status DEFAULT (N'active'),
    ResolvedAt DATETIME2(0) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_StudentInterventions_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_StudentInterventions_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END;
GO

IF COL_LENGTH(N'dbo.StudentRemarks', N'StudentId') IS NULL ALTER TABLE dbo.StudentRemarks ADD StudentId INT NULL;
GO
IF COL_LENGTH(N'dbo.StudentRemarks', N'TeacherUserId') IS NULL ALTER TABLE dbo.StudentRemarks ADD TeacherUserId INT NULL;
GO
IF COL_LENGTH(N'dbo.StudentRemarks', N'RemarkType') IS NULL ALTER TABLE dbo.StudentRemarks ADD RemarkType NVARCHAR(40) NULL;
GO
IF COL_LENGTH(N'dbo.StudentRemarks', N'Severity') IS NULL ALTER TABLE dbo.StudentRemarks ADD Severity NVARCHAR(20) NULL;
GO
IF COL_LENGTH(N'dbo.StudentRemarks', N'Category') IS NULL ALTER TABLE dbo.StudentRemarks ADD Category NVARCHAR(40) NULL;
GO
IF COL_LENGTH(N'dbo.StudentRemarks', N'Title') IS NULL ALTER TABLE dbo.StudentRemarks ADD Title NVARCHAR(200) NULL;
GO
IF COL_LENGTH(N'dbo.StudentRemarks', N'Notes') IS NULL ALTER TABLE dbo.StudentRemarks ADD Notes NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH(N'dbo.StudentRemarks', N'FollowUpDate') IS NULL ALTER TABLE dbo.StudentRemarks ADD FollowUpDate DATE NULL;
GO
IF COL_LENGTH(N'dbo.StudentRemarks', N'Status') IS NULL ALTER TABLE dbo.StudentRemarks ADD Status NVARCHAR(20) NULL;
GO
IF COL_LENGTH(N'dbo.StudentRemarks', N'ClosedAt') IS NULL ALTER TABLE dbo.StudentRemarks ADD ClosedAt DATETIME2(0) NULL;
GO
IF COL_LENGTH(N'dbo.StudentRemarks', N'CreatedAt') IS NULL ALTER TABLE dbo.StudentRemarks ADD CreatedAt DATETIME2(0) NULL;
GO
IF COL_LENGTH(N'dbo.StudentRemarks', N'UpdatedAt') IS NULL ALTER TABLE dbo.StudentRemarks ADD UpdatedAt DATETIME2(0) NULL;
GO

IF COL_LENGTH(N'dbo.StudentInterventions', N'StudentId') IS NULL ALTER TABLE dbo.StudentInterventions ADD StudentId INT NULL;
GO
IF COL_LENGTH(N'dbo.StudentInterventions', N'CreatedByUserId') IS NULL ALTER TABLE dbo.StudentInterventions ADD CreatedByUserId INT NULL;
GO
IF COL_LENGTH(N'dbo.StudentInterventions', N'Category') IS NULL ALTER TABLE dbo.StudentInterventions ADD Category NVARCHAR(40) NULL;
GO
IF COL_LENGTH(N'dbo.StudentInterventions', N'RiskLevel') IS NULL ALTER TABLE dbo.StudentInterventions ADD RiskLevel NVARCHAR(20) NULL;
GO
IF COL_LENGTH(N'dbo.StudentInterventions', N'TriggerSource') IS NULL ALTER TABLE dbo.StudentInterventions ADD TriggerSource NVARCHAR(80) NULL;
GO
IF COL_LENGTH(N'dbo.StudentInterventions', N'Summary') IS NULL ALTER TABLE dbo.StudentInterventions ADD Summary NVARCHAR(500) NULL;
GO
IF COL_LENGTH(N'dbo.StudentInterventions', N'ActionPlan') IS NULL ALTER TABLE dbo.StudentInterventions ADD ActionPlan NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH(N'dbo.StudentInterventions', N'ParentContactNeeded') IS NULL ALTER TABLE dbo.StudentInterventions ADD ParentContactNeeded BIT NULL;
GO
IF COL_LENGTH(N'dbo.StudentInterventions', N'FollowUpDate') IS NULL ALTER TABLE dbo.StudentInterventions ADD FollowUpDate DATE NULL;
GO
IF COL_LENGTH(N'dbo.StudentInterventions', N'Status') IS NULL ALTER TABLE dbo.StudentInterventions ADD Status NVARCHAR(20) NULL;
GO
IF COL_LENGTH(N'dbo.StudentInterventions', N'ResolvedAt') IS NULL ALTER TABLE dbo.StudentInterventions ADD ResolvedAt DATETIME2(0) NULL;
GO
IF COL_LENGTH(N'dbo.StudentInterventions', N'CreatedAt') IS NULL ALTER TABLE dbo.StudentInterventions ADD CreatedAt DATETIME2(0) NULL;
GO
IF COL_LENGTH(N'dbo.StudentInterventions', N'UpdatedAt') IS NULL ALTER TABLE dbo.StudentInterventions ADD UpdatedAt DATETIME2(0) NULL;
GO

UPDATE dbo.StudentRemarks SET Status = N'open' WHERE Status IS NULL;
GO
UPDATE dbo.StudentRemarks SET CreatedAt = SYSUTCDATETIME() WHERE CreatedAt IS NULL;
GO
UPDATE dbo.StudentRemarks SET UpdatedAt = SYSUTCDATETIME() WHERE UpdatedAt IS NULL;
GO
UPDATE dbo.StudentInterventions SET Status = N'active' WHERE Status IS NULL;
GO
UPDATE dbo.StudentInterventions SET ParentContactNeeded = 0 WHERE ParentContactNeeded IS NULL;
GO
UPDATE dbo.StudentInterventions SET CreatedAt = SYSUTCDATETIME() WHERE CreatedAt IS NULL;
GO
UPDATE dbo.StudentInterventions SET UpdatedAt = SYSUTCDATETIME() WHERE UpdatedAt IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_StudentRemarks_Severity')
BEGIN
  ALTER TABLE dbo.StudentRemarks
  ADD CONSTRAINT CK_StudentRemarks_Severity CHECK (Severity IN (N'low', N'medium', N'high'));
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_StudentRemarks_Status')
BEGIN
  ALTER TABLE dbo.StudentRemarks
  ADD CONSTRAINT CK_StudentRemarks_Status CHECK (Status IN (N'open', N'monitored', N'closed'));
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_StudentInterventions_RiskLevel')
BEGIN
  ALTER TABLE dbo.StudentInterventions
  ADD CONSTRAINT CK_StudentInterventions_RiskLevel CHECK (RiskLevel IN (N'low', N'moderate', N'high', N'critical'));
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_StudentInterventions_Status')
BEGIN
  ALTER TABLE dbo.StudentInterventions
  ADD CONSTRAINT CK_StudentInterventions_Status CHECK (Status IN (N'active', N'monitoring', N'resolved', N'cancelled'));
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_StudentRemarks_StudentStatus' AND object_id = OBJECT_ID(N'dbo.StudentRemarks'))
BEGIN
  CREATE INDEX IX_StudentRemarks_StudentStatus ON dbo.StudentRemarks(StudentId, Status, FollowUpDate, CreatedAt DESC);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_StudentInterventions_StudentStatus' AND object_id = OBJECT_ID(N'dbo.StudentInterventions'))
BEGIN
  CREATE INDEX IX_StudentInterventions_StudentStatus ON dbo.StudentInterventions(StudentId, Status, FollowUpDate, CreatedAt DESC);
END;
GO
