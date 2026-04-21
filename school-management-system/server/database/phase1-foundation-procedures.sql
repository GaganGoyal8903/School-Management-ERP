CREATE OR ALTER PROCEDURE dbo.spAppSettingsList
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    AppSettingId,
    SettingGroup,
    SettingKey,
    SettingValue,
    ValueType,
    Description,
    UpdatedByUserId,
    CreatedAt,
    UpdatedAt
  FROM dbo.AppSettings
  ORDER BY SettingGroup ASC, SettingKey ASC;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spAppSettingUpsert
  @SettingGroup NVARCHAR(100),
  @SettingKey NVARCHAR(120),
  @SettingValue NVARCHAR(MAX) = NULL,
  @ValueType NVARCHAR(30) = N'string',
  @Description NVARCHAR(500) = NULL,
  @UpdatedByUserId INT = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  MERGE dbo.AppSettings AS target
  USING (
    SELECT
      LTRIM(RTRIM(@SettingGroup)) AS SettingGroup,
      LTRIM(RTRIM(@SettingKey)) AS SettingKey
  ) AS source
  ON target.SettingGroup = source.SettingGroup
    AND target.SettingKey = source.SettingKey
  WHEN MATCHED THEN
    UPDATE SET
      SettingValue = @SettingValue,
      ValueType = LOWER(LTRIM(RTRIM(ISNULL(@ValueType, N'string')))),
      Description = COALESCE(@Description, target.Description),
      UpdatedByUserId = @UpdatedByUserId,
      UpdatedAt = SYSUTCDATETIME()
  WHEN NOT MATCHED THEN
    INSERT (
      SettingGroup,
      SettingKey,
      SettingValue,
      ValueType,
      Description,
      UpdatedByUserId,
      CreatedAt,
      UpdatedAt
    )
    VALUES (
      LTRIM(RTRIM(@SettingGroup)),
      LTRIM(RTRIM(@SettingKey)),
      @SettingValue,
      LOWER(LTRIM(RTRIM(ISNULL(@ValueType, N'string')))),
      @Description,
      @UpdatedByUserId,
      SYSUTCDATETIME(),
      SYSUTCDATETIME()
    );

  EXEC dbo.spAppSettingsList;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spAuditLogCreate
  @ActorUserId INT = NULL,
  @ActorFullName NVARCHAR(200) = NULL,
  @ActorRole NVARCHAR(50) = NULL,
  @ActionName NVARCHAR(150),
  @EntityName NVARCHAR(120),
  @EntityId NVARCHAR(120) = NULL,
  @Summary NVARCHAR(500) = NULL,
  @DetailsJson NVARCHAR(MAX) = NULL,
  @IpAddress NVARCHAR(64) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  INSERT INTO dbo.AuditLogs (
    ActorUserId,
    ActorFullName,
    ActorRole,
    ActionName,
    EntityName,
    EntityId,
    Summary,
    DetailsJson,
    IpAddress,
    CreatedAt
  )
  VALUES (
    @ActorUserId,
    @ActorFullName,
    LOWER(LTRIM(RTRIM(@ActorRole))),
    LTRIM(RTRIM(@ActionName)),
    LTRIM(RTRIM(@EntityName)),
    @EntityId,
    @Summary,
    @DetailsJson,
    @IpAddress,
    SYSUTCDATETIME()
  );

  SELECT TOP 1 *
  FROM dbo.AuditLogs
  WHERE AuditLogId = SCOPE_IDENTITY();
END;
GO

CREATE OR ALTER PROCEDURE dbo.spAuditLogList
  @EntityName NVARCHAR(120) = NULL,
  @ActionName NVARCHAR(150) = NULL,
  @Page INT = 1,
  @Limit INT = 25
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @SafePage INT = CASE WHEN ISNULL(@Page, 1) < 1 THEN 1 ELSE @Page END;
  DECLARE @SafeLimit INT = CASE
    WHEN ISNULL(@Limit, 25) < 1 THEN 25
    WHEN @Limit > 100 THEN 100
    ELSE @Limit
  END;
  DECLARE @Offset INT = (@SafePage - 1) * @SafeLimit;

  ;WITH Filtered AS (
    SELECT
      AuditLogId,
      ActorUserId,
      ActorFullName,
      ActorRole,
      ActionName,
      EntityName,
      EntityId,
      Summary,
      DetailsJson,
      IpAddress,
      CreatedAt,
      COUNT(1) OVER() AS TotalCount
    FROM dbo.AuditLogs
    WHERE (@EntityName IS NULL OR EntityName = @EntityName)
      AND (@ActionName IS NULL OR ActionName = @ActionName)
  )
  SELECT *
  FROM Filtered
  ORDER BY CreatedAt DESC, AuditLogId DESC
  OFFSET @Offset ROWS FETCH NEXT @SafeLimit ROWS ONLY;
END;
GO
