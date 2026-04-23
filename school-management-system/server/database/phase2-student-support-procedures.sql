CREATE OR ALTER PROCEDURE dbo.spStudentSupportSummary
  @ClassName NVARCHAR(100) = NULL,
  @SectionName NVARCHAR(50) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  ;WITH StudentScope AS (
    SELECT s.StudentId
    FROM dbo.Students s
    LEFT JOIN dbo.Classes c ON c.ClassId = s.ClassId
    LEFT JOIN dbo.Sections sec ON sec.SectionId = s.SectionId
    WHERE (@ClassName IS NULL OR c.ClassName = @ClassName)
      AND (@SectionName IS NULL OR sec.SectionName = @SectionName)
  )
  SELECT
    (SELECT COUNT(1) FROM dbo.StudentRemarks r INNER JOIN StudentScope ss ON ss.StudentId = r.StudentId WHERE r.Status IN (N'open', N'monitored')) AS OpenRemarks,
    (SELECT COUNT(1) FROM dbo.StudentInterventions i INNER JOIN StudentScope ss ON ss.StudentId = i.StudentId WHERE i.Status IN (N'active', N'monitoring')) AS ActiveInterventions,
    (SELECT COUNT(1) FROM dbo.StudentInterventions i INNER JOIN StudentScope ss ON ss.StudentId = i.StudentId WHERE i.Status IN (N'active', N'monitoring') AND i.RiskLevel IN (N'high', N'critical')) AS HighRiskInterventions,
    (SELECT COUNT(1) FROM dbo.StudentInterventions i INNER JOIN StudentScope ss ON ss.StudentId = i.StudentId WHERE i.FollowUpDate IS NOT NULL AND i.FollowUpDate <= DATEADD(DAY, 7, CAST(GETDATE() AS DATE)) AND i.Status IN (N'active', N'monitoring')) AS UpcomingFollowUps;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spStudentRemarkList
  @StudentId INT = NULL,
  @Status NVARCHAR(20) = NULL,
  @ClassName NVARCHAR(100) = NULL,
  @SectionName NVARCHAR(50) = NULL,
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
      r.RemarkId,
      r.StudentId,
      CONCAT(ISNULL(s.FirstName, N''), CASE WHEN ISNULL(s.LastName, N'') = N'' THEN N'' ELSE N' ' + s.LastName END) AS StudentFullName,
      s.AdmissionNumber,
      s.RollNumber,
      c.ClassName,
      sec.SectionName,
      r.TeacherUserId,
      u.FullName AS TeacherFullName,
      r.RemarkType,
      r.Severity,
      r.Category,
      r.Title,
      r.Notes,
      r.FollowUpDate,
      r.Status,
      r.ClosedAt,
      r.CreatedAt,
      r.UpdatedAt,
      COUNT(1) OVER() AS TotalCount
    FROM dbo.StudentRemarks r
    INNER JOIN dbo.Students s ON s.StudentId = r.StudentId
    LEFT JOIN dbo.Classes c ON c.ClassId = s.ClassId
    LEFT JOIN dbo.Sections sec ON sec.SectionId = s.SectionId
    LEFT JOIN dbo.Users u ON u.UserId = r.TeacherUserId
    WHERE (@StudentId IS NULL OR r.StudentId = @StudentId)
      AND (@Status IS NULL OR r.Status = @Status)
      AND (@ClassName IS NULL OR c.ClassName = @ClassName)
      AND (@SectionName IS NULL OR sec.SectionName = @SectionName)
      AND (
        @Search IS NULL
        OR CONCAT(ISNULL(s.FirstName, N''), N' ', ISNULL(s.LastName, N'')) LIKE N'%' + @Search + N'%'
        OR ISNULL(r.Title, N'') LIKE N'%' + @Search + N'%'
        OR ISNULL(r.Notes, N'') LIKE N'%' + @Search + N'%'
      )
  )
  SELECT *
  FROM Filtered
  ORDER BY CreatedAt DESC, RemarkId DESC
  OFFSET @Offset ROWS FETCH NEXT @SafeLimit ROWS ONLY;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spStudentRemarkCreate
  @StudentId INT,
  @TeacherUserId INT = NULL,
  @RemarkType NVARCHAR(40),
  @Severity NVARCHAR(20),
  @Category NVARCHAR(40),
  @Title NVARCHAR(200),
  @Notes NVARCHAR(MAX),
  @FollowUpDate DATE = NULL
AS
BEGIN
  SET NOCOUNT ON;

  IF NOT EXISTS (SELECT 1 FROM dbo.Students WHERE StudentId = @StudentId)
    THROW 53001, 'Student not found.', 1;

  INSERT INTO dbo.StudentRemarks (
    StudentId, TeacherUserId, RemarkType, Severity, Category, Title, Notes, FollowUpDate, Status, CreatedAt, UpdatedAt
  )
  VALUES (
    @StudentId,
    @TeacherUserId,
    LOWER(LTRIM(RTRIM(ISNULL(@RemarkType, N'general')))),
    LOWER(LTRIM(RTRIM(ISNULL(@Severity, N'medium')))),
    LOWER(LTRIM(RTRIM(ISNULL(@Category, N'academic')))),
    LTRIM(RTRIM(@Title)),
    LTRIM(RTRIM(@Notes)),
    @FollowUpDate,
    N'open',
    SYSUTCDATETIME(),
    SYSUTCDATETIME()
  );

  EXEC dbo.spStudentRemarkList @StudentId = @StudentId, @Page = 1, @Limit = 1;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spStudentRemarkStatusUpdate
  @RemarkId INT,
  @Status NVARCHAR(20)
AS
BEGIN
  SET NOCOUNT ON;

  UPDATE dbo.StudentRemarks
  SET Status = LOWER(LTRIM(RTRIM(@Status))),
      ClosedAt = CASE WHEN LOWER(LTRIM(RTRIM(@Status))) = N'closed' THEN SYSUTCDATETIME() ELSE NULL END,
      UpdatedAt = SYSUTCDATETIME()
  WHERE RemarkId = @RemarkId;

  EXEC dbo.spStudentRemarkList @Page = 1, @Limit = 1, @Search = NULL, @Status = NULL, @StudentId = (SELECT StudentId FROM dbo.StudentRemarks WHERE RemarkId = @RemarkId);
END;
GO

CREATE OR ALTER PROCEDURE dbo.spStudentInterventionList
  @StudentId INT = NULL,
  @Status NVARCHAR(20) = NULL,
  @ClassName NVARCHAR(100) = NULL,
  @SectionName NVARCHAR(50) = NULL,
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
      i.InterventionId,
      i.StudentId,
      CONCAT(ISNULL(s.FirstName, N''), CASE WHEN ISNULL(s.LastName, N'') = N'' THEN N'' ELSE N' ' + s.LastName END) AS StudentFullName,
      s.AdmissionNumber,
      s.RollNumber,
      c.ClassName,
      sec.SectionName,
      i.CreatedByUserId,
      u.FullName AS CreatedByFullName,
      i.Category,
      i.RiskLevel,
      i.TriggerSource,
      i.Summary,
      i.ActionPlan,
      i.ParentContactNeeded,
      i.FollowUpDate,
      i.Status,
      i.ResolvedAt,
      i.CreatedAt,
      i.UpdatedAt,
      COUNT(1) OVER() AS TotalCount
    FROM dbo.StudentInterventions i
    INNER JOIN dbo.Students s ON s.StudentId = i.StudentId
    LEFT JOIN dbo.Classes c ON c.ClassId = s.ClassId
    LEFT JOIN dbo.Sections sec ON sec.SectionId = s.SectionId
    LEFT JOIN dbo.Users u ON u.UserId = i.CreatedByUserId
    WHERE (@StudentId IS NULL OR i.StudentId = @StudentId)
      AND (@Status IS NULL OR i.Status = @Status)
      AND (@ClassName IS NULL OR c.ClassName = @ClassName)
      AND (@SectionName IS NULL OR sec.SectionName = @SectionName)
      AND (
        @Search IS NULL
        OR CONCAT(ISNULL(s.FirstName, N''), N' ', ISNULL(s.LastName, N'')) LIKE N'%' + @Search + N'%'
        OR ISNULL(i.Summary, N'') LIKE N'%' + @Search + N'%'
        OR ISNULL(i.ActionPlan, N'') LIKE N'%' + @Search + N'%'
      )
  )
  SELECT *
  FROM Filtered
  ORDER BY CreatedAt DESC, InterventionId DESC
  OFFSET @Offset ROWS FETCH NEXT @SafeLimit ROWS ONLY;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spStudentInterventionCreate
  @StudentId INT,
  @CreatedByUserId INT = NULL,
  @Category NVARCHAR(40),
  @RiskLevel NVARCHAR(20),
  @TriggerSource NVARCHAR(80) = NULL,
  @Summary NVARCHAR(500),
  @ActionPlan NVARCHAR(MAX) = NULL,
  @ParentContactNeeded BIT = 0,
  @FollowUpDate DATE = NULL
AS
BEGIN
  SET NOCOUNT ON;

  IF NOT EXISTS (SELECT 1 FROM dbo.Students WHERE StudentId = @StudentId)
    THROW 53002, 'Student not found.', 1;

  INSERT INTO dbo.StudentInterventions (
    StudentId, CreatedByUserId, Category, RiskLevel, TriggerSource, Summary, ActionPlan,
    ParentContactNeeded, FollowUpDate, Status, CreatedAt, UpdatedAt
  )
  VALUES (
    @StudentId,
    @CreatedByUserId,
    LOWER(LTRIM(RTRIM(ISNULL(@Category, N'academic')))),
    LOWER(LTRIM(RTRIM(ISNULL(@RiskLevel, N'moderate')))),
    NULLIF(LTRIM(RTRIM(@TriggerSource)), N''),
    LTRIM(RTRIM(@Summary)),
    NULLIF(LTRIM(RTRIM(@ActionPlan)), N''),
    ISNULL(@ParentContactNeeded, 0),
    @FollowUpDate,
    N'active',
    SYSUTCDATETIME(),
    SYSUTCDATETIME()
  );

  EXEC dbo.spStudentInterventionList @StudentId = @StudentId, @Page = 1, @Limit = 1;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spStudentInterventionStatusUpdate
  @InterventionId INT,
  @Status NVARCHAR(20)
AS
BEGIN
  SET NOCOUNT ON;

  UPDATE dbo.StudentInterventions
  SET Status = LOWER(LTRIM(RTRIM(@Status))),
      ResolvedAt = CASE WHEN LOWER(LTRIM(RTRIM(@Status))) = N'resolved' THEN SYSUTCDATETIME() ELSE NULL END,
      UpdatedAt = SYSUTCDATETIME()
  WHERE InterventionId = @InterventionId;

  EXEC dbo.spStudentInterventionList @Page = 1, @Limit = 1, @Search = NULL, @Status = NULL, @StudentId = (SELECT StudentId FROM dbo.StudentInterventions WHERE InterventionId = @InterventionId);
END;
GO
