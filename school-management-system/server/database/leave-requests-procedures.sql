PRINT 'Creating leave request procedures...';
GO

CREATE OR ALTER PROCEDURE dbo.spLeaveRequestCreate
  @StudentId INT,
  @LeaveType NVARCHAR(50),
  @FromDate DATE,
  @ToDate DATE,
  @Reason NVARCHAR(2000),
  @RequestedByUserId INT = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @FromDate IS NULL OR @ToDate IS NULL OR @ToDate < @FromDate
    THROW 50001, 'A valid leave date range is required.', 1;

  IF NULLIF(LTRIM(RTRIM(@LeaveType)), N'') IS NULL
    THROW 50002, 'Leave type is required.', 1;

  IF NULLIF(LTRIM(RTRIM(@Reason)), N'') IS NULL
    THROW 50003, 'Leave reason is required.', 1;

  DECLARE @DaysRequested INT = DATEDIFF(DAY, @FromDate, @ToDate) + 1;
  DECLARE @AdmissionNumber NVARCHAR(50);
  DECLARE @RollNumber NVARCHAR(50);
  DECLARE @StudentFullName NVARCHAR(200);
  DECLARE @ClassId INT;
  DECLARE @ClassName NVARCHAR(100);
  DECLARE @SectionId INT;
  DECLARE @SectionName NVARCHAR(50);

  SELECT TOP 1
    @AdmissionNumber = s.AdmissionNumber,
    @RollNumber = s.RollNumber,
    @StudentFullName = s.FullName,
    @ClassId = s.ClassId,
    @ClassName = c.ClassName,
    @SectionId = s.SectionId,
    @SectionName = sec.SectionName
  FROM dbo.Students s
  LEFT JOIN dbo.Classes c
    ON c.ClassId = s.ClassId
  LEFT JOIN dbo.Sections sec
    ON sec.SectionId = s.SectionId
  WHERE s.StudentId = @StudentId;

  IF @StudentFullName IS NULL
    THROW 50004, 'Student not found.', 1;

  IF EXISTS (
    SELECT 1
    FROM dbo.LeaveRequests lr
    WHERE lr.StudentId = @StudentId
      AND lr.Status IN (N'pending', N'approved')
      AND lr.FromDate <= @ToDate
      AND lr.ToDate >= @FromDate
  )
    THROW 50005, 'A pending or approved leave request already exists for the selected date range.', 1;

  INSERT INTO dbo.LeaveRequests (
    StudentId,
    RequestedByUserId,
    AdmissionNumber,
    RollNumber,
    StudentFullName,
    ClassId,
    ClassName,
    SectionId,
    SectionName,
    LeaveType,
    FromDate,
    ToDate,
    DaysRequested,
    Reason,
    Status,
    CreatedAt,
    UpdatedAt
  )
  VALUES (
    @StudentId,
    @RequestedByUserId,
    @AdmissionNumber,
    @RollNumber,
    @StudentFullName,
    @ClassId,
    @ClassName,
    @SectionId,
    @SectionName,
    LTRIM(RTRIM(@LeaveType)),
    @FromDate,
    @ToDate,
    @DaysRequested,
    LTRIM(RTRIM(@Reason)),
    N'pending',
    SYSUTCDATETIME(),
    SYSUTCDATETIME()
  );

  SELECT
    LeaveRequestId,
    StudentId,
    RequestedByUserId,
    AdmissionNumber,
    RollNumber,
    StudentFullName,
    ClassId,
    ClassName,
    SectionId,
    SectionName,
    LeaveType,
    FromDate,
    ToDate,
    DaysRequested,
    Reason,
    Status,
    ReviewNotes,
    ReviewedByUserId,
    ReviewedByFullName,
    ReviewedByRole,
    ReviewedAt,
    CancelledByUserId,
    CancelledAt,
    CreatedAt,
    UpdatedAt
  FROM dbo.LeaveRequests
  WHERE LeaveRequestId = SCOPE_IDENTITY();
END;
GO

CREATE OR ALTER PROCEDURE dbo.spLeaveRequestReview
  @LeaveRequestId INT,
  @Status NVARCHAR(20),
  @ReviewNotes NVARCHAR(2000) = NULL,
  @ReviewerUserId INT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @NormalizedStatus NVARCHAR(20) = LOWER(LTRIM(RTRIM(@Status)));
  IF @NormalizedStatus NOT IN (N'approved', N'rejected')
    THROW 50006, 'Review status must be approved or rejected.', 1;

  DECLARE @ReviewerFullName NVARCHAR(200);
  DECLARE @ReviewerRole NVARCHAR(50);

  SELECT TOP 1
    @ReviewerFullName = u.FullName,
    @ReviewerRole = LOWER(LTRIM(RTRIM(r.RoleName)))
  FROM dbo.Users u
  LEFT JOIN dbo.Roles r
    ON r.RoleId = u.RoleId
  WHERE u.UserId = @ReviewerUserId;

  IF @ReviewerFullName IS NULL
    THROW 50007, 'Reviewer user not found.', 1;

  IF @ReviewerRole NOT IN (N'admin', N'teacher')
    THROW 50008, 'Only admin or teacher users can review student leave requests.', 1;

  IF NOT EXISTS (
    SELECT 1
    FROM dbo.LeaveRequests
    WHERE LeaveRequestId = @LeaveRequestId
      AND Status = N'pending'
  )
    THROW 50009, 'Only pending leave requests can be reviewed.', 1;

  UPDATE dbo.LeaveRequests
  SET Status = @NormalizedStatus,
      ReviewNotes = NULLIF(LTRIM(RTRIM(@ReviewNotes)), N''),
      ReviewedByUserId = @ReviewerUserId,
      ReviewedByFullName = @ReviewerFullName,
      ReviewedByRole = @ReviewerRole,
      ReviewedAt = SYSUTCDATETIME(),
      UpdatedAt = SYSUTCDATETIME()
  WHERE LeaveRequestId = @LeaveRequestId;

  SELECT
    LeaveRequestId,
    StudentId,
    RequestedByUserId,
    AdmissionNumber,
    RollNumber,
    StudentFullName,
    ClassId,
    ClassName,
    SectionId,
    SectionName,
    LeaveType,
    FromDate,
    ToDate,
    DaysRequested,
    Reason,
    Status,
    ReviewNotes,
    ReviewedByUserId,
    ReviewedByFullName,
    ReviewedByRole,
    ReviewedAt,
    CancelledByUserId,
    CancelledAt,
    CreatedAt,
    UpdatedAt
  FROM dbo.LeaveRequests
  WHERE LeaveRequestId = @LeaveRequestId;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spLeaveRequestCancel
  @LeaveRequestId INT,
  @StudentId INT,
  @CancelledByUserId INT = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF NOT EXISTS (
    SELECT 1
    FROM dbo.LeaveRequests
    WHERE LeaveRequestId = @LeaveRequestId
      AND StudentId = @StudentId
      AND Status = N'pending'
  )
    THROW 50010, 'Only your pending leave request can be cancelled.', 1;

  UPDATE dbo.LeaveRequests
  SET Status = N'cancelled',
      CancelledByUserId = @CancelledByUserId,
      CancelledAt = SYSUTCDATETIME(),
      UpdatedAt = SYSUTCDATETIME()
  WHERE LeaveRequestId = @LeaveRequestId;

  SELECT
    LeaveRequestId,
    StudentId,
    RequestedByUserId,
    AdmissionNumber,
    RollNumber,
    StudentFullName,
    ClassId,
    ClassName,
    SectionId,
    SectionName,
    LeaveType,
    FromDate,
    ToDate,
    DaysRequested,
    Reason,
    Status,
    ReviewNotes,
    ReviewedByUserId,
    ReviewedByFullName,
    ReviewedByRole,
    ReviewedAt,
    CancelledByUserId,
    CancelledAt,
    CreatedAt,
    UpdatedAt
  FROM dbo.LeaveRequests
  WHERE LeaveRequestId = @LeaveRequestId;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spLeavePendingList
  @ViewerUserId INT,
  @ClassName NVARCHAR(100) = NULL,
  @SectionName NVARCHAR(50) = NULL,
  @Page INT = 1,
  @Limit INT = 50
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @ViewerRole NVARCHAR(50);
  SELECT TOP 1
    @ViewerRole = LOWER(LTRIM(RTRIM(r.RoleName)))
  FROM dbo.Users u
  LEFT JOIN dbo.Roles r
    ON r.RoleId = u.RoleId
  WHERE u.UserId = @ViewerUserId;

  IF @ViewerRole NOT IN (N'admin', N'teacher')
    THROW 50011, 'Only admin or teacher users can view pending leave requests.', 1;

  DECLARE @SafePage INT = CASE WHEN ISNULL(@Page, 1) < 1 THEN 1 ELSE @Page END;
  DECLARE @SafeLimit INT = CASE
    WHEN ISNULL(@Limit, 50) < 1 THEN 50
    WHEN @Limit > 200 THEN 200
    ELSE @Limit
  END;
  DECLARE @Offset INT = (@SafePage - 1) * @SafeLimit;

  ;WITH Filtered AS (
    SELECT
      lr.LeaveRequestId,
      lr.StudentId,
      lr.AdmissionNumber,
      lr.RollNumber,
      lr.StudentFullName,
      lr.ClassId,
      lr.ClassName,
      lr.SectionId,
      lr.SectionName,
      lr.LeaveType,
      lr.FromDate,
      lr.ToDate,
      lr.DaysRequested,
      lr.Reason,
      lr.Status,
      lr.CreatedAt,
      COUNT(1) OVER() AS TotalCount
    FROM dbo.LeaveRequests lr
    WHERE lr.Status = N'pending'
      AND (@ClassName IS NULL OR lr.ClassName = @ClassName)
      AND (@SectionName IS NULL OR lr.SectionName = @SectionName)
  )
  SELECT *
  FROM Filtered
  ORDER BY CreatedAt DESC, LeaveRequestId DESC
  OFFSET @Offset ROWS FETCH NEXT @SafeLimit ROWS ONLY;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spLeaveStudentHistory
  @StudentId INT,
  @Limit INT = 20
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @SafeLimit INT = CASE
    WHEN ISNULL(@Limit, 20) < 1 THEN 20
    WHEN @Limit > 200 THEN 200
    ELSE @Limit
  END;

  SELECT TOP (@SafeLimit)
    LeaveRequestId,
    StudentId,
    RequestedByUserId,
    AdmissionNumber,
    RollNumber,
    StudentFullName,
    ClassId,
    ClassName,
    SectionId,
    SectionName,
    LeaveType,
    FromDate,
    ToDate,
    DaysRequested,
    Reason,
    Status,
    ReviewNotes,
    ReviewedByUserId,
    ReviewedByFullName,
    ReviewedByRole,
    ReviewedAt,
    CancelledByUserId,
    CancelledAt,
    CreatedAt,
    UpdatedAt
  FROM dbo.LeaveRequests
  WHERE StudentId = @StudentId
  ORDER BY CreatedAt DESC, LeaveRequestId DESC;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spLeaveAuditReport
  @StartDate DATE = NULL,
  @EndDate DATE = NULL,
  @ClassName NVARCHAR(100) = NULL,
  @Status NVARCHAR(20) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    lr.LeaveRequestId,
    lr.StudentId,
    lr.RequestedByUserId,
    lr.AdmissionNumber,
    lr.RollNumber,
    lr.StudentFullName,
    lr.ClassId,
    lr.ClassName,
    lr.SectionId,
    lr.SectionName,
    lr.LeaveType,
    lr.FromDate,
    lr.ToDate,
    lr.DaysRequested,
    lr.Reason,
    lr.Status,
    lr.ReviewNotes,
    lr.ReviewedByUserId,
    lr.ReviewedByFullName,
    lr.ReviewedByRole,
    lr.ReviewedAt,
    lr.CancelledByUserId,
    lr.CancelledAt,
    lr.CreatedAt,
    lr.UpdatedAt,
    requestor.FullName AS RequestedByFullName,
    reviewer.FullName AS ReviewedByUserFullName
  FROM dbo.LeaveRequests lr
  LEFT JOIN dbo.Users requestor
    ON requestor.UserId = lr.RequestedByUserId
  LEFT JOIN dbo.Users reviewer
    ON reviewer.UserId = lr.ReviewedByUserId
  WHERE (@StartDate IS NULL OR lr.CreatedAt >= @StartDate)
    AND (@EndDate IS NULL OR lr.CreatedAt < DATEADD(DAY, 1, @EndDate))
    AND (@ClassName IS NULL OR lr.ClassName = @ClassName)
    AND (@Status IS NULL OR lr.Status = @Status)
  ORDER BY lr.CreatedAt DESC, lr.LeaveRequestId DESC;
END;
GO

PRINT 'Leave request procedures created successfully.';
GO
