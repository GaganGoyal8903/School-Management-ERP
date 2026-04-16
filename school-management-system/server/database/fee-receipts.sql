IF OBJECT_ID(N'dbo.FeeReceipts', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.FeeReceipts (
    FeeReceiptId INT IDENTITY(1,1) PRIMARY KEY,
    FeePaymentId INT NOT NULL,
    StudentFeeId INT NOT NULL,
    StudentId INT NOT NULL,
    ReceiptNumber NVARCHAR(100) NOT NULL,
    ReceiptDate DATETIME2(0) NOT NULL CONSTRAINT DF_FeeReceipts_ReceiptDate DEFAULT SYSUTCDATETIME(),
    AcademicYear NVARCHAR(20) NULL,
    StudentName NVARCHAR(200) NOT NULL,
    RollNumber NVARCHAR(50) NULL,
    AdmissionNumber NVARCHAR(50) NULL,
    ClassName NVARCHAR(100) NULL,
    SectionName NVARCHAR(50) NULL,
    FeeType NVARCHAR(100) NULL,
    DueDate DATE NULL,
    BaseAmount DECIMAL(18,2) NOT NULL CONSTRAINT DF_FeeReceipts_BaseAmount DEFAULT (0),
    FineAmount DECIMAL(18,2) NOT NULL CONSTRAINT DF_FeeReceipts_FineAmount DEFAULT (0),
    DiscountAmount DECIMAL(18,2) NOT NULL CONSTRAINT DF_FeeReceipts_DiscountAmount DEFAULT (0),
    TotalFeeAmount DECIMAL(18,2) NOT NULL CONSTRAINT DF_FeeReceipts_TotalFeeAmount DEFAULT (0),
    AmountPaidThisReceipt DECIMAL(18,2) NOT NULL CONSTRAINT DF_FeeReceipts_AmountPaid DEFAULT (0),
    PaidAmountBefore DECIMAL(18,2) NOT NULL CONSTRAINT DF_FeeReceipts_PaidAmountBefore DEFAULT (0),
    PaidAmountAfter DECIMAL(18,2) NOT NULL CONSTRAINT DF_FeeReceipts_PaidAmountAfter DEFAULT (0),
    PendingAmountAfter DECIMAL(18,2) NOT NULL CONSTRAINT DF_FeeReceipts_PendingAmountAfter DEFAULT (0),
    PaymentMode NVARCHAR(50) NULL,
    TransactionReference NVARCHAR(255) NULL,
    Notes NVARCHAR(1000) NULL,
    GeneratedByUserId INT NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_FeeReceipts_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_FeeReceipts_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_FeeReceipts_FeePayment FOREIGN KEY (FeePaymentId) REFERENCES dbo.FeePayments(FeePaymentId) ON DELETE CASCADE,
    CONSTRAINT FK_FeeReceipts_StudentFee FOREIGN KEY (StudentFeeId) REFERENCES dbo.StudentFees(StudentFeeId),
    CONSTRAINT FK_FeeReceipts_Student FOREIGN KEY (StudentId) REFERENCES dbo.Students(StudentId),
    CONSTRAINT FK_FeeReceipts_GeneratedByUser FOREIGN KEY (GeneratedByUserId) REFERENCES dbo.Users(UserId)
  );
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'UX_FeeReceipts_FeePaymentId'
    AND object_id = OBJECT_ID(N'dbo.FeeReceipts')
)
BEGIN
  CREATE UNIQUE INDEX UX_FeeReceipts_FeePaymentId
  ON dbo.FeeReceipts(FeePaymentId);
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'UX_FeeReceipts_ReceiptNumber'
    AND object_id = OBJECT_ID(N'dbo.FeeReceipts')
)
BEGIN
  CREATE UNIQUE INDEX UX_FeeReceipts_ReceiptNumber
  ON dbo.FeeReceipts(ReceiptNumber);
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'IX_FeeReceipts_StudentId'
    AND object_id = OBJECT_ID(N'dbo.FeeReceipts')
)
BEGIN
  CREATE INDEX IX_FeeReceipts_StudentId
  ON dbo.FeeReceipts(StudentId, ReceiptDate DESC);
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'IX_FeeReceipts_StudentFeeId'
    AND object_id = OBJECT_ID(N'dbo.FeeReceipts')
)
BEGIN
  CREATE INDEX IX_FeeReceipts_StudentFeeId
  ON dbo.FeeReceipts(StudentFeeId, ReceiptDate DESC);
END;
