IF OBJECT_ID(N'dbo.LeaveRequests', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.LeaveRequests (
    LeaveRequestId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    StudentId INT NOT NULL,
    RequestedByUserId INT NULL,
    AdmissionNumber NVARCHAR(50) NULL,
    RollNumber NVARCHAR(50) NULL,
    StudentFullName NVARCHAR(200) NOT NULL,
    ClassId INT NULL,
    ClassName NVARCHAR(100) NULL,
    SectionId INT NULL,
    SectionName NVARCHAR(50) NULL,
    LeaveType NVARCHAR(50) NOT NULL,
    FromDate DATE NOT NULL,
    ToDate DATE NOT NULL,
    DaysRequested INT NOT NULL,
    Reason NVARCHAR(2000) NOT NULL,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_LeaveRequests_Status DEFAULT (N'pending'),
    ReviewNotes NVARCHAR(2000) NULL,
    ReviewedByUserId INT NULL,
    ReviewedByFullName NVARCHAR(200) NULL,
    ReviewedByRole NVARCHAR(50) NULL,
    ReviewedAt DATETIME2(0) NULL,
    CancelledByUserId INT NULL,
    CancelledAt DATETIME2(0) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_LeaveRequests_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_LeaveRequests_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_LeaveRequests_Status CHECK (Status IN (N'pending', N'approved', N'rejected', N'cancelled')),
    CONSTRAINT CK_LeaveRequests_DateRange CHECK (ToDate >= FromDate),
    CONSTRAINT CK_LeaveRequests_DaysRequested CHECK (DaysRequested >= 1),
    CONSTRAINT FK_LeaveRequests_Student FOREIGN KEY (StudentId) REFERENCES dbo.Students(StudentId),
    CONSTRAINT FK_LeaveRequests_RequestedByUser FOREIGN KEY (RequestedByUserId) REFERENCES dbo.Users(UserId),
    CONSTRAINT FK_LeaveRequests_ReviewedByUser FOREIGN KEY (ReviewedByUserId) REFERENCES dbo.Users(UserId),
    CONSTRAINT FK_LeaveRequests_CancelledByUser FOREIGN KEY (CancelledByUserId) REFERENCES dbo.Users(UserId)
  );
END;
GO

IF COL_LENGTH(N'dbo.LeaveRequests', N'StudentId') IS NULL
BEGIN
  ALTER TABLE dbo.LeaveRequests ADD StudentId INT NULL;
END;
GO

IF COL_LENGTH(N'dbo.LeaveRequests', N'RequestedByUserId') IS NULL
BEGIN
  ALTER TABLE dbo.LeaveRequests ADD RequestedByUserId INT NULL;
END;
GO

IF COL_LENGTH(N'dbo.LeaveRequests', N'AdmissionNumber') IS NULL
BEGIN
  ALTER TABLE dbo.LeaveRequests ADD AdmissionNumber NVARCHAR(50) NULL;
END;
GO

IF COL_LENGTH(N'dbo.LeaveRequests', N'RollNumber') IS NULL
BEGIN
  ALTER TABLE dbo.LeaveRequests ADD RollNumber NVARCHAR(50) NULL;
END;
GO

IF COL_LENGTH(N'dbo.LeaveRequests', N'StudentFullName') IS NULL
BEGIN
  ALTER TABLE dbo.LeaveRequests ADD StudentFullName NVARCHAR(200) NULL;
END;
GO

IF COL_LENGTH(N'dbo.LeaveRequests', N'ClassId') IS NULL
BEGIN
  ALTER TABLE dbo.LeaveRequests ADD ClassId INT NULL;
END;
GO

IF COL_LENGTH(N'dbo.LeaveRequests', N'ClassName') IS NULL
BEGIN
  ALTER TABLE dbo.LeaveRequests ADD ClassName NVARCHAR(100) NULL;
END;
GO

IF COL_LENGTH(N'dbo.LeaveRequests', N'SectionId') IS NULL
BEGIN
  ALTER TABLE dbo.LeaveRequests ADD SectionId INT NULL;
END;
GO

IF COL_LENGTH(N'dbo.LeaveRequests', N'SectionName') IS NULL
BEGIN
  ALTER TABLE dbo.LeaveRequests ADD SectionName NVARCHAR(50) NULL;
END;
GO

IF COL_LENGTH(N'dbo.LeaveRequests', N'LeaveType') IS NULL
BEGIN
  ALTER TABLE dbo.LeaveRequests ADD LeaveType NVARCHAR(50) NULL;
END;
GO

IF COL_LENGTH(N'dbo.LeaveRequests', N'FromDate') IS NULL
BEGIN
  ALTER TABLE dbo.LeaveRequests ADD FromDate DATE NULL;
END;
GO

IF COL_LENGTH(N'dbo.LeaveRequests', N'ToDate') IS NULL
BEGIN
  ALTER TABLE dbo.LeaveRequests ADD ToDate DATE NULL;
END;
GO

IF COL_LENGTH(N'dbo.LeaveRequests', N'DaysRequested') IS NULL
BEGIN
  ALTER TABLE dbo.LeaveRequests ADD DaysRequested INT NULL;
END;
GO

IF COL_LENGTH(N'dbo.LeaveRequests', N'Reason') IS NULL
BEGIN
  ALTER TABLE dbo.LeaveRequests ADD Reason NVARCHAR(2000) NULL;
END;
GO

IF COL_LENGTH(N'dbo.LeaveRequests', N'Status') IS NULL
BEGIN
  ALTER TABLE dbo.LeaveRequests ADD Status NVARCHAR(20) NULL;
END;
GO

IF COL_LENGTH(N'dbo.LeaveRequests', N'ReviewNotes') IS NULL
BEGIN
  ALTER TABLE dbo.LeaveRequests ADD ReviewNotes NVARCHAR(2000) NULL;
END;
GO

IF COL_LENGTH(N'dbo.LeaveRequests', N'ReviewedByUserId') IS NULL
BEGIN
  ALTER TABLE dbo.LeaveRequests ADD ReviewedByUserId INT NULL;
END;
GO

IF COL_LENGTH(N'dbo.LeaveRequests', N'ReviewedByFullName') IS NULL
BEGIN
  ALTER TABLE dbo.LeaveRequests ADD ReviewedByFullName NVARCHAR(200) NULL;
END;
GO

IF COL_LENGTH(N'dbo.LeaveRequests', N'ReviewedByRole') IS NULL
BEGIN
  ALTER TABLE dbo.LeaveRequests ADD ReviewedByRole NVARCHAR(50) NULL;
END;
GO

IF COL_LENGTH(N'dbo.LeaveRequests', N'ReviewedAt') IS NULL
BEGIN
  ALTER TABLE dbo.LeaveRequests ADD ReviewedAt DATETIME2(0) NULL;
END;
GO

IF COL_LENGTH(N'dbo.LeaveRequests', N'CancelledByUserId') IS NULL
BEGIN
  ALTER TABLE dbo.LeaveRequests ADD CancelledByUserId INT NULL;
END;
GO

IF COL_LENGTH(N'dbo.LeaveRequests', N'CancelledAt') IS NULL
BEGIN
  ALTER TABLE dbo.LeaveRequests ADD CancelledAt DATETIME2(0) NULL;
END;
GO

IF COL_LENGTH(N'dbo.LeaveRequests', N'CreatedAt') IS NULL
BEGIN
  ALTER TABLE dbo.LeaveRequests ADD CreatedAt DATETIME2(0) NULL;
END;
GO

IF COL_LENGTH(N'dbo.LeaveRequests', N'UpdatedAt') IS NULL
BEGIN
  ALTER TABLE dbo.LeaveRequests ADD UpdatedAt DATETIME2(0) NULL;
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'IX_LeaveRequests_StudentId'
    AND object_id = OBJECT_ID(N'dbo.LeaveRequests')
)
BEGIN
  CREATE INDEX IX_LeaveRequests_StudentId
  ON dbo.LeaveRequests(StudentId, CreatedAt DESC);
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'IX_LeaveRequests_StatusClassSection'
    AND object_id = OBJECT_ID(N'dbo.LeaveRequests')
)
BEGIN
  CREATE INDEX IX_LeaveRequests_StatusClassSection
  ON dbo.LeaveRequests(Status, ClassId, SectionId, CreatedAt DESC);
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'IX_LeaveRequests_DateRange'
    AND object_id = OBJECT_ID(N'dbo.LeaveRequests')
)
BEGIN
  CREATE INDEX IX_LeaveRequests_DateRange
  ON dbo.LeaveRequests(FromDate, ToDate, Status);
END;
GO
