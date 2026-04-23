CREATE OR ALTER PROCEDURE dbo.spFinanceOperationsSummary
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    (SELECT COUNT(1) FROM dbo.FeeConcessions WHERE Status = N'pending') AS PendingConcessions,
    (SELECT ISNULL(SUM(Amount), 0) FROM dbo.FeeConcessions WHERE Status = N'approved') AS ApprovedConcessionAmount,
    (SELECT COUNT(1) FROM dbo.FeeRefunds WHERE Status = N'pending') AS PendingRefunds,
    (SELECT ISNULL(SUM(Amount), 0) FROM dbo.FeeRefunds WHERE Status = N'processed') AS ProcessedRefundAmount;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spFeeConcessionList
  @Status NVARCHAR(20) = NULL,
  @Search NVARCHAR(200) = NULL,
  @Page INT = 1,
  @Limit INT = 25
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @SafePage INT = CASE WHEN ISNULL(@Page, 1) < 1 THEN 1 ELSE @Page END;
  DECLARE @SafeLimit INT = CASE WHEN ISNULL(@Limit, 25) < 1 THEN 25 WHEN @Limit > 200 THEN 200 ELSE @Limit END;
  DECLARE @Offset INT = (@SafePage - 1) * @SafeLimit;

  ;WITH Filtered AS (
    SELECT
      c.ConcessionId,
      c.StudentFeeId,
      c.StudentId,
      sf.FeeType,
      sf.Amount AS FeeAmount,
      sf.PaidAmount,
      sf.Discount,
      sf.DueDate,
      st.StudentFullName,
      st.ClassName,
      st.SectionName,
      c.ConcessionType,
      c.Amount,
      c.Reason,
      c.ReviewNotes,
      c.Status,
      c.RequestedByUserId,
      req.FullName AS RequestedByFullName,
      c.ReviewedByUserId,
      rev.FullName AS ReviewedByFullName,
      c.ReviewedAt,
      c.AppliedAt,
      c.CreatedAt,
      c.UpdatedAt,
      COUNT(1) OVER() AS TotalCount
    FROM dbo.FeeConcessions c
    LEFT JOIN dbo.StudentFees sf ON sf.StudentFeeId = c.StudentFeeId
    LEFT JOIN (
      SELECT
        s.StudentId,
        CONCAT(ISNULL(s.FirstName, N''), CASE WHEN ISNULL(s.LastName, N'') = N'' THEN N'' ELSE N' ' + s.LastName END) AS StudentFullName,
        cl.ClassName,
        sec.SectionName
      FROM dbo.Students s
      LEFT JOIN dbo.Classes cl ON cl.ClassId = s.ClassId
      LEFT JOIN dbo.Sections sec ON sec.SectionId = s.SectionId
    ) st ON st.StudentId = c.StudentId
    LEFT JOIN dbo.Users req ON req.UserId = c.RequestedByUserId
    LEFT JOIN dbo.Users rev ON rev.UserId = c.ReviewedByUserId
    WHERE (@Status IS NULL OR c.Status = @Status)
      AND (
        @Search IS NULL
        OR ISNULL(st.StudentFullName, N'') LIKE N'%' + @Search + N'%'
        OR ISNULL(c.Reason, N'') LIKE N'%' + @Search + N'%'
        OR ISNULL(c.ConcessionType, N'') LIKE N'%' + @Search + N'%'
      )
  )
  SELECT *
  FROM Filtered
  ORDER BY CreatedAt DESC, ConcessionId DESC
  OFFSET @Offset ROWS FETCH NEXT @SafeLimit ROWS ONLY;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spFeeConcessionCreate
  @StudentFeeId INT,
  @RequestedByUserId INT = NULL,
  @ConcessionType NVARCHAR(50),
  @Amount DECIMAL(18,2),
  @Reason NVARCHAR(1000)
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @StudentId INT;

  SELECT TOP 1 @StudentId = StudentId
  FROM dbo.StudentFees
  WHERE StudentFeeId = @StudentFeeId;

  IF @StudentId IS NULL
    THROW 54001, 'Fee record not found.', 1;

  IF ISNULL(@Amount, 0) <= 0
    THROW 54002, 'Concession amount must be greater than zero.', 1;

  INSERT INTO dbo.FeeConcessions (
    StudentFeeId, StudentId, RequestedByUserId, ConcessionType, Amount, Reason, Status, CreatedAt, UpdatedAt
  )
  VALUES (
    @StudentFeeId,
    @StudentId,
    @RequestedByUserId,
    LTRIM(RTRIM(@ConcessionType)),
    @Amount,
    LTRIM(RTRIM(@Reason)),
    N'pending',
    SYSUTCDATETIME(),
    SYSUTCDATETIME()
  );

  EXEC dbo.spFeeConcessionList @Page = 1, @Limit = 1;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spFeeConcessionReview
  @ConcessionId INT,
  @Status NVARCHAR(20),
  @ReviewNotes NVARCHAR(1000) = NULL,
  @ReviewedByUserId INT = NULL
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @StudentFeeId INT;
  DECLARE @Amount DECIMAL(18,2);
  DECLARE @Reason NVARCHAR(1000);
  DECLARE @FeeAmount DECIMAL(18,2);
  DECLARE @LateFee DECIMAL(18,2);
  DECLARE @Discount DECIMAL(18,2);
  DECLARE @PaidAmount DECIMAL(18,2);
  DECLARE @DueDate DATE;

  SELECT TOP 1
    @StudentFeeId = c.StudentFeeId,
    @Amount = c.Amount,
    @Reason = c.Reason
  FROM dbo.FeeConcessions c
  WHERE c.ConcessionId = @ConcessionId
    AND c.Status = N'pending';

  IF @StudentFeeId IS NULL
    THROW 54003, 'Pending concession not found.', 1;

  IF LOWER(LTRIM(RTRIM(@Status))) = N'approved'
  BEGIN
    SELECT TOP 1
      @FeeAmount = Amount,
      @LateFee = ISNULL(LateFee, 0),
      @Discount = ISNULL(Discount, 0),
      @PaidAmount = ISNULL(PaidAmount, 0),
      @DueDate = DueDate
    FROM dbo.StudentFees
    WHERE StudentFeeId = @StudentFeeId;

    UPDATE dbo.StudentFees
    SET Discount = ISNULL(Discount, 0) + @Amount,
        DiscountReason = LTRIM(RTRIM(CONCAT(COALESCE(NULLIF(DiscountReason, N'' ) + N'; ', N''), @Reason))),
        Status = CASE
          WHEN (@FeeAmount + ISNULL(@LateFee, 0) - (ISNULL(@Discount, 0) + @Amount) - ISNULL(@PaidAmount, 0)) <= 0 THEN N'Paid'
          WHEN ISNULL(@PaidAmount, 0) > 0 THEN N'Partial'
          ELSE N'Pending'
        END,
        UpdatedAt = SYSUTCDATETIME()
    WHERE StudentFeeId = @StudentFeeId;
  END

  UPDATE dbo.FeeConcessions
  SET Status = LOWER(LTRIM(RTRIM(@Status))),
      ReviewNotes = NULLIF(LTRIM(RTRIM(@ReviewNotes)), N''),
      ReviewedByUserId = @ReviewedByUserId,
      ReviewedAt = SYSUTCDATETIME(),
      AppliedAt = CASE WHEN LOWER(LTRIM(RTRIM(@Status))) = N'approved' THEN SYSUTCDATETIME() ELSE NULL END,
      UpdatedAt = SYSUTCDATETIME()
  WHERE ConcessionId = @ConcessionId;

  EXEC dbo.spFeeConcessionList @Page = 1, @Limit = 1;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spFeeRefundList
  @Status NVARCHAR(20) = NULL,
  @Search NVARCHAR(200) = NULL,
  @Page INT = 1,
  @Limit INT = 25
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @SafePage INT = CASE WHEN ISNULL(@Page, 1) < 1 THEN 1 ELSE @Page END;
  DECLARE @SafeLimit INT = CASE WHEN ISNULL(@Limit, 25) < 1 THEN 25 WHEN @Limit > 200 THEN 200 ELSE @Limit END;
  DECLARE @Offset INT = (@SafePage - 1) * @SafeLimit;

  ;WITH Filtered AS (
    SELECT
      r.RefundId,
      r.StudentFeeId,
      r.StudentId,
      sf.FeeType,
      sf.Amount AS FeeAmount,
      sf.PaidAmount,
      sf.Discount,
      sf.DueDate,
      st.StudentFullName,
      st.ClassName,
      st.SectionName,
      r.Amount,
      r.RefundMode,
      r.TransactionReference,
      r.Reason,
      r.ReviewNotes,
      r.Status,
      r.RequestedByUserId,
      req.FullName AS RequestedByFullName,
      r.ReviewedByUserId,
      rev.FullName AS ReviewedByFullName,
      r.ReviewedAt,
      r.ProcessedAt,
      r.CreatedAt,
      r.UpdatedAt,
      COUNT(1) OVER() AS TotalCount
    FROM dbo.FeeRefunds r
    LEFT JOIN dbo.StudentFees sf ON sf.StudentFeeId = r.StudentFeeId
    LEFT JOIN (
      SELECT
        s.StudentId,
        CONCAT(ISNULL(s.FirstName, N''), CASE WHEN ISNULL(s.LastName, N'') = N'' THEN N'' ELSE N' ' + s.LastName END) AS StudentFullName,
        cl.ClassName,
        sec.SectionName
      FROM dbo.Students s
      LEFT JOIN dbo.Classes cl ON cl.ClassId = s.ClassId
      LEFT JOIN dbo.Sections sec ON sec.SectionId = s.SectionId
    ) st ON st.StudentId = r.StudentId
    LEFT JOIN dbo.Users req ON req.UserId = r.RequestedByUserId
    LEFT JOIN dbo.Users rev ON rev.UserId = r.ReviewedByUserId
    WHERE (@Status IS NULL OR r.Status = @Status)
      AND (
        @Search IS NULL
        OR ISNULL(st.StudentFullName, N'') LIKE N'%' + @Search + N'%'
        OR ISNULL(r.Reason, N'') LIKE N'%' + @Search + N'%'
        OR ISNULL(r.TransactionReference, N'') LIKE N'%' + @Search + N'%'
      )
  )
  SELECT *
  FROM Filtered
  ORDER BY CreatedAt DESC, RefundId DESC
  OFFSET @Offset ROWS FETCH NEXT @SafeLimit ROWS ONLY;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spFeeRefundCreate
  @StudentFeeId INT,
  @RequestedByUserId INT = NULL,
  @Amount DECIMAL(18,2),
  @RefundMode NVARCHAR(50) = NULL,
  @TransactionReference NVARCHAR(120) = NULL,
  @Reason NVARCHAR(1000)
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @StudentId INT;

  SELECT TOP 1 @StudentId = StudentId
  FROM dbo.StudentFees
  WHERE StudentFeeId = @StudentFeeId;

  IF @StudentId IS NULL
    THROW 54004, 'Fee record not found.', 1;

  IF ISNULL(@Amount, 0) <= 0
    THROW 54005, 'Refund amount must be greater than zero.', 1;

  INSERT INTO dbo.FeeRefunds (
    StudentFeeId, StudentId, RequestedByUserId, Amount, RefundMode, TransactionReference, Reason, Status, CreatedAt, UpdatedAt
  )
  VALUES (
    @StudentFeeId,
    @StudentId,
    @RequestedByUserId,
    @Amount,
    NULLIF(LTRIM(RTRIM(@RefundMode)), N''),
    NULLIF(LTRIM(RTRIM(@TransactionReference)), N''),
    LTRIM(RTRIM(@Reason)),
    N'pending',
    SYSUTCDATETIME(),
    SYSUTCDATETIME()
  );

  EXEC dbo.spFeeRefundList @Page = 1, @Limit = 1;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spFeeRefundReview
  @RefundId INT,
  @Status NVARCHAR(20),
  @ReviewNotes NVARCHAR(1000) = NULL,
  @ReviewedByUserId INT = NULL,
  @RefundMode NVARCHAR(50) = NULL,
  @TransactionReference NVARCHAR(120) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @StudentFeeId INT;
  DECLARE @Amount DECIMAL(18,2);
  DECLARE @FeeAmount DECIMAL(18,2);
  DECLARE @LateFee DECIMAL(18,2);
  DECLARE @Discount DECIMAL(18,2);
  DECLARE @PaidAmount DECIMAL(18,2);

  SELECT TOP 1
    @StudentFeeId = r.StudentFeeId,
    @Amount = r.Amount
  FROM dbo.FeeRefunds r
  WHERE r.RefundId = @RefundId
    AND r.Status = N'pending';

  IF @StudentFeeId IS NULL
    THROW 54006, 'Pending refund not found.', 1;

  IF LOWER(LTRIM(RTRIM(@Status))) = N'processed'
  BEGIN
    SELECT TOP 1
      @FeeAmount = Amount,
      @LateFee = ISNULL(LateFee, 0),
      @Discount = ISNULL(Discount, 0),
      @PaidAmount = ISNULL(PaidAmount, 0)
    FROM dbo.StudentFees
    WHERE StudentFeeId = @StudentFeeId;

    IF ISNULL(@PaidAmount, 0) < ISNULL(@Amount, 0)
      THROW 54007, 'Refund amount cannot exceed the paid amount on this fee record.', 1;

    UPDATE dbo.StudentFees
    SET PaidAmount = ISNULL(PaidAmount, 0) - @Amount,
        Status = CASE
          WHEN (ISNULL(@PaidAmount, 0) - @Amount) <= 0 THEN N'Pending'
          WHEN (@FeeAmount + ISNULL(@LateFee, 0) - ISNULL(@Discount, 0) - (ISNULL(@PaidAmount, 0) - @Amount)) <= 0 THEN N'Paid'
          ELSE N'Partial'
        END,
        UpdatedAt = SYSUTCDATETIME()
    WHERE StudentFeeId = @StudentFeeId;
  END

  UPDATE dbo.FeeRefunds
  SET Status = LOWER(LTRIM(RTRIM(@Status))),
      ReviewNotes = NULLIF(LTRIM(RTRIM(@ReviewNotes)), N''),
      ReviewedByUserId = @ReviewedByUserId,
      ReviewedAt = SYSUTCDATETIME(),
      ProcessedAt = CASE WHEN LOWER(LTRIM(RTRIM(@Status))) = N'processed' THEN SYSUTCDATETIME() ELSE NULL END,
      RefundMode = COALESCE(NULLIF(LTRIM(RTRIM(@RefundMode)), N''), RefundMode),
      TransactionReference = COALESCE(NULLIF(LTRIM(RTRIM(@TransactionReference)), N''), TransactionReference),
      UpdatedAt = SYSUTCDATETIME()
  WHERE RefundId = @RefundId;

  EXEC dbo.spFeeRefundList @Page = 1, @Limit = 1;
END;
GO
