CREATE OR ALTER PROCEDURE dbo.spFeeReceiptUpsert
  @FeePaymentId INT,
  @StudentFeeId INT,
  @StudentId INT,
  @ReceiptNumber NVARCHAR(100) = NULL,
  @ReceiptDate DATETIME2(0) = NULL,
  @AcademicYear NVARCHAR(20) = NULL,
  @StudentName NVARCHAR(200),
  @RollNumber NVARCHAR(50) = NULL,
  @AdmissionNumber NVARCHAR(50) = NULL,
  @ClassName NVARCHAR(100) = NULL,
  @SectionName NVARCHAR(50) = NULL,
  @FeeType NVARCHAR(100) = NULL,
  @DueDate DATE = NULL,
  @BaseAmount DECIMAL(18,2) = 0,
  @FineAmount DECIMAL(18,2) = 0,
  @DiscountAmount DECIMAL(18,2) = 0,
  @TotalFeeAmount DECIMAL(18,2) = 0,
  @AmountPaidThisReceipt DECIMAL(18,2) = 0,
  @PaidAmountBefore DECIMAL(18,2) = 0,
  @PaidAmountAfter DECIMAL(18,2) = 0,
  @PendingAmountAfter DECIMAL(18,2) = 0,
  @PaymentMode NVARCHAR(50) = NULL,
  @TransactionReference NVARCHAR(255) = NULL,
  @Notes NVARCHAR(1000) = NULL,
  @GeneratedByUserId INT = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @Now DATETIME2(0) = SYSUTCDATETIME();
  DECLARE @EffectiveReceiptNumber NVARCHAR(100) = NULLIF(LTRIM(RTRIM(@ReceiptNumber)), N'');
  DECLARE @EffectiveReceiptDate DATETIME2(0) = ISNULL(@ReceiptDate, @Now);

  IF @EffectiveReceiptNumber IS NULL
  BEGIN
    SELECT TOP 1 @EffectiveReceiptNumber = ReceiptNumber
    FROM dbo.FeeReceipts
    WHERE FeePaymentId = @FeePaymentId;
  END;

  IF @EffectiveReceiptNumber IS NULL
  BEGIN
    SET @EffectiveReceiptNumber =
      CONCAT(
        N'FEE-RCPT-',
        DATEDIFF_BIG(MILLISECOND, '1970-01-01', @Now),
        N'-',
        RIGHT(CONCAT(N'00000', ABS(CHECKSUM(NEWID())) % 100000), 5)
      );
  END;

  IF EXISTS (SELECT 1 FROM dbo.FeeReceipts WHERE FeePaymentId = @FeePaymentId)
  BEGIN
    UPDATE dbo.FeeReceipts
    SET
      StudentFeeId = @StudentFeeId,
      StudentId = @StudentId,
      ReceiptNumber = @EffectiveReceiptNumber,
      ReceiptDate = @EffectiveReceiptDate,
      AcademicYear = @AcademicYear,
      StudentName = @StudentName,
      RollNumber = @RollNumber,
      AdmissionNumber = @AdmissionNumber,
      ClassName = @ClassName,
      SectionName = @SectionName,
      FeeType = @FeeType,
      DueDate = @DueDate,
      BaseAmount = @BaseAmount,
      FineAmount = @FineAmount,
      DiscountAmount = @DiscountAmount,
      TotalFeeAmount = @TotalFeeAmount,
      AmountPaidThisReceipt = @AmountPaidThisReceipt,
      PaidAmountBefore = @PaidAmountBefore,
      PaidAmountAfter = @PaidAmountAfter,
      PendingAmountAfter = @PendingAmountAfter,
      PaymentMode = @PaymentMode,
      TransactionReference = @TransactionReference,
      Notes = @Notes,
      GeneratedByUserId = @GeneratedByUserId,
      UpdatedAt = @Now
    WHERE FeePaymentId = @FeePaymentId;
  END
  ELSE
  BEGIN
    INSERT INTO dbo.FeeReceipts (
      FeePaymentId,
      StudentFeeId,
      StudentId,
      ReceiptNumber,
      ReceiptDate,
      AcademicYear,
      StudentName,
      RollNumber,
      AdmissionNumber,
      ClassName,
      SectionName,
      FeeType,
      DueDate,
      BaseAmount,
      FineAmount,
      DiscountAmount,
      TotalFeeAmount,
      AmountPaidThisReceipt,
      PaidAmountBefore,
      PaidAmountAfter,
      PendingAmountAfter,
      PaymentMode,
      TransactionReference,
      Notes,
      GeneratedByUserId,
      CreatedAt,
      UpdatedAt
    )
    VALUES (
      @FeePaymentId,
      @StudentFeeId,
      @StudentId,
      @EffectiveReceiptNumber,
      @EffectiveReceiptDate,
      @AcademicYear,
      @StudentName,
      @RollNumber,
      @AdmissionNumber,
      @ClassName,
      @SectionName,
      @FeeType,
      @DueDate,
      @BaseAmount,
      @FineAmount,
      @DiscountAmount,
      @TotalFeeAmount,
      @AmountPaidThisReceipt,
      @PaidAmountBefore,
      @PaidAmountAfter,
      @PendingAmountAfter,
      @PaymentMode,
      @TransactionReference,
      @Notes,
      @GeneratedByUserId,
      @Now,
      @Now
    );
  END;

  SELECT TOP 1
    fr.FeeReceiptId,
    fr.FeePaymentId,
    fr.StudentFeeId,
    fr.StudentId,
    fr.ReceiptNumber,
    fr.ReceiptDate,
    fr.AcademicYear,
    fr.StudentName,
    fr.RollNumber,
    fr.AdmissionNumber,
    fr.ClassName,
    fr.SectionName,
    fr.FeeType,
    fr.DueDate,
    fr.BaseAmount,
    fr.FineAmount,
    fr.DiscountAmount,
    fr.TotalFeeAmount,
    fr.AmountPaidThisReceipt,
    fr.PaidAmountBefore,
    fr.PaidAmountAfter,
    fr.PendingAmountAfter,
    fr.PaymentMode,
    fr.TransactionReference,
    fr.Notes,
    fr.GeneratedByUserId,
    u.FullName AS GeneratedByFullName,
    fr.CreatedAt,
    fr.UpdatedAt
  FROM dbo.FeeReceipts fr
  LEFT JOIN dbo.Users u
    ON u.UserId = fr.GeneratedByUserId
  WHERE fr.FeePaymentId = @FeePaymentId
  ORDER BY fr.FeeReceiptId DESC;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spFeeReceiptGetByPaymentId
  @FeePaymentId INT
AS
BEGIN
  SET NOCOUNT ON;

  SELECT TOP 1
    fr.FeeReceiptId,
    fr.FeePaymentId,
    fr.StudentFeeId,
    fr.StudentId,
    fr.ReceiptNumber,
    fr.ReceiptDate,
    fr.AcademicYear,
    fr.StudentName,
    fr.RollNumber,
    fr.AdmissionNumber,
    fr.ClassName,
    fr.SectionName,
    fr.FeeType,
    fr.DueDate,
    fr.BaseAmount,
    fr.FineAmount,
    fr.DiscountAmount,
    fr.TotalFeeAmount,
    fr.AmountPaidThisReceipt,
    fr.PaidAmountBefore,
    fr.PaidAmountAfter,
    fr.PendingAmountAfter,
    fr.PaymentMode,
    fr.TransactionReference,
    fr.Notes,
    fr.GeneratedByUserId,
    u.FullName AS GeneratedByFullName,
    fr.CreatedAt,
    fr.UpdatedAt
  FROM dbo.FeeReceipts fr
  LEFT JOIN dbo.Users u
    ON u.UserId = fr.GeneratedByUserId
  WHERE fr.FeePaymentId = @FeePaymentId
  ORDER BY fr.FeeReceiptId DESC;
END;
GO
