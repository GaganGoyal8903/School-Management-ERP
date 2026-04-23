IF OBJECT_ID(N'dbo.FeeConcessions', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.FeeConcessions (
    ConcessionId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    StudentFeeId INT NOT NULL,
    StudentId INT NULL,
    RequestedByUserId INT NULL,
    ReviewedByUserId INT NULL,
    ConcessionType NVARCHAR(50) NOT NULL,
    Amount DECIMAL(18,2) NOT NULL,
    Reason NVARCHAR(1000) NOT NULL,
    ReviewNotes NVARCHAR(1000) NULL,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_FeeConcessions_Status DEFAULT (N'pending'),
    ReviewedAt DATETIME2(0) NULL,
    AppliedAt DATETIME2(0) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_FeeConcessions_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_FeeConcessions_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END;
GO

IF OBJECT_ID(N'dbo.FeeRefunds', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.FeeRefunds (
    RefundId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    StudentFeeId INT NOT NULL,
    StudentId INT NULL,
    RequestedByUserId INT NULL,
    ReviewedByUserId INT NULL,
    Amount DECIMAL(18,2) NOT NULL,
    RefundMode NVARCHAR(50) NULL,
    TransactionReference NVARCHAR(120) NULL,
    Reason NVARCHAR(1000) NOT NULL,
    ReviewNotes NVARCHAR(1000) NULL,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_FeeRefunds_Status DEFAULT (N'pending'),
    ReviewedAt DATETIME2(0) NULL,
    ProcessedAt DATETIME2(0) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_FeeRefunds_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_FeeRefunds_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END;
GO

IF COL_LENGTH(N'dbo.FeeConcessions', N'StudentFeeId') IS NULL ALTER TABLE dbo.FeeConcessions ADD StudentFeeId INT NULL;
GO
IF COL_LENGTH(N'dbo.FeeConcessions', N'StudentId') IS NULL ALTER TABLE dbo.FeeConcessions ADD StudentId INT NULL;
GO
IF COL_LENGTH(N'dbo.FeeConcessions', N'RequestedByUserId') IS NULL ALTER TABLE dbo.FeeConcessions ADD RequestedByUserId INT NULL;
GO
IF COL_LENGTH(N'dbo.FeeConcessions', N'ReviewedByUserId') IS NULL ALTER TABLE dbo.FeeConcessions ADD ReviewedByUserId INT NULL;
GO
IF COL_LENGTH(N'dbo.FeeConcessions', N'ConcessionType') IS NULL ALTER TABLE dbo.FeeConcessions ADD ConcessionType NVARCHAR(50) NULL;
GO
IF COL_LENGTH(N'dbo.FeeConcessions', N'Amount') IS NULL ALTER TABLE dbo.FeeConcessions ADD Amount DECIMAL(18,2) NULL;
GO
IF COL_LENGTH(N'dbo.FeeConcessions', N'Reason') IS NULL ALTER TABLE dbo.FeeConcessions ADD Reason NVARCHAR(1000) NULL;
GO
IF COL_LENGTH(N'dbo.FeeConcessions', N'ReviewNotes') IS NULL ALTER TABLE dbo.FeeConcessions ADD ReviewNotes NVARCHAR(1000) NULL;
GO
IF COL_LENGTH(N'dbo.FeeConcessions', N'Status') IS NULL ALTER TABLE dbo.FeeConcessions ADD Status NVARCHAR(20) NULL;
GO
IF COL_LENGTH(N'dbo.FeeConcessions', N'ReviewedAt') IS NULL ALTER TABLE dbo.FeeConcessions ADD ReviewedAt DATETIME2(0) NULL;
GO
IF COL_LENGTH(N'dbo.FeeConcessions', N'AppliedAt') IS NULL ALTER TABLE dbo.FeeConcessions ADD AppliedAt DATETIME2(0) NULL;
GO
IF COL_LENGTH(N'dbo.FeeConcessions', N'CreatedAt') IS NULL ALTER TABLE dbo.FeeConcessions ADD CreatedAt DATETIME2(0) NULL;
GO
IF COL_LENGTH(N'dbo.FeeConcessions', N'UpdatedAt') IS NULL ALTER TABLE dbo.FeeConcessions ADD UpdatedAt DATETIME2(0) NULL;
GO

IF COL_LENGTH(N'dbo.FeeRefunds', N'StudentFeeId') IS NULL ALTER TABLE dbo.FeeRefunds ADD StudentFeeId INT NULL;
GO
IF COL_LENGTH(N'dbo.FeeRefunds', N'StudentId') IS NULL ALTER TABLE dbo.FeeRefunds ADD StudentId INT NULL;
GO
IF COL_LENGTH(N'dbo.FeeRefunds', N'RequestedByUserId') IS NULL ALTER TABLE dbo.FeeRefunds ADD RequestedByUserId INT NULL;
GO
IF COL_LENGTH(N'dbo.FeeRefunds', N'ReviewedByUserId') IS NULL ALTER TABLE dbo.FeeRefunds ADD ReviewedByUserId INT NULL;
GO
IF COL_LENGTH(N'dbo.FeeRefunds', N'Amount') IS NULL ALTER TABLE dbo.FeeRefunds ADD Amount DECIMAL(18,2) NULL;
GO
IF COL_LENGTH(N'dbo.FeeRefunds', N'RefundMode') IS NULL ALTER TABLE dbo.FeeRefunds ADD RefundMode NVARCHAR(50) NULL;
GO
IF COL_LENGTH(N'dbo.FeeRefunds', N'TransactionReference') IS NULL ALTER TABLE dbo.FeeRefunds ADD TransactionReference NVARCHAR(120) NULL;
GO
IF COL_LENGTH(N'dbo.FeeRefunds', N'Reason') IS NULL ALTER TABLE dbo.FeeRefunds ADD Reason NVARCHAR(1000) NULL;
GO
IF COL_LENGTH(N'dbo.FeeRefunds', N'ReviewNotes') IS NULL ALTER TABLE dbo.FeeRefunds ADD ReviewNotes NVARCHAR(1000) NULL;
GO
IF COL_LENGTH(N'dbo.FeeRefunds', N'Status') IS NULL ALTER TABLE dbo.FeeRefunds ADD Status NVARCHAR(20) NULL;
GO
IF COL_LENGTH(N'dbo.FeeRefunds', N'ReviewedAt') IS NULL ALTER TABLE dbo.FeeRefunds ADD ReviewedAt DATETIME2(0) NULL;
GO
IF COL_LENGTH(N'dbo.FeeRefunds', N'ProcessedAt') IS NULL ALTER TABLE dbo.FeeRefunds ADD ProcessedAt DATETIME2(0) NULL;
GO
IF COL_LENGTH(N'dbo.FeeRefunds', N'CreatedAt') IS NULL ALTER TABLE dbo.FeeRefunds ADD CreatedAt DATETIME2(0) NULL;
GO
IF COL_LENGTH(N'dbo.FeeRefunds', N'UpdatedAt') IS NULL ALTER TABLE dbo.FeeRefunds ADD UpdatedAt DATETIME2(0) NULL;
GO

UPDATE dbo.FeeConcessions SET Status = N'pending' WHERE Status IS NULL;
GO
UPDATE dbo.FeeConcessions SET CreatedAt = SYSUTCDATETIME() WHERE CreatedAt IS NULL;
GO
UPDATE dbo.FeeConcessions SET UpdatedAt = SYSUTCDATETIME() WHERE UpdatedAt IS NULL;
GO
UPDATE dbo.FeeRefunds SET Status = N'pending' WHERE Status IS NULL;
GO
UPDATE dbo.FeeRefunds SET CreatedAt = SYSUTCDATETIME() WHERE CreatedAt IS NULL;
GO
UPDATE dbo.FeeRefunds SET UpdatedAt = SYSUTCDATETIME() WHERE UpdatedAt IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_FeeConcessions_Status')
BEGIN
  ALTER TABLE dbo.FeeConcessions
  ADD CONSTRAINT CK_FeeConcessions_Status CHECK (Status IN (N'pending', N'approved', N'rejected'));
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_FeeRefunds_Status')
BEGIN
  ALTER TABLE dbo.FeeRefunds
  ADD CONSTRAINT CK_FeeRefunds_Status CHECK (Status IN (N'pending', N'processed', N'rejected'));
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FeeConcessions_Status' AND object_id = OBJECT_ID(N'dbo.FeeConcessions'))
BEGIN
  CREATE INDEX IX_FeeConcessions_Status ON dbo.FeeConcessions(Status, CreatedAt DESC, StudentFeeId);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_FeeRefunds_Status' AND object_id = OBJECT_ID(N'dbo.FeeRefunds'))
BEGIN
  CREATE INDEX IX_FeeRefunds_Status ON dbo.FeeRefunds(Status, CreatedAt DESC, StudentFeeId);
END;
GO
