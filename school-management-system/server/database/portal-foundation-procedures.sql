CREATE OR ALTER PROCEDURE dbo.spBranchList
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    b.BranchId,
    b.BranchName,
    b.BranchCode,
    b.AddressLine1,
    b.AddressLine2,
    b.City,
    b.State,
    b.PostalCode,
    b.Phone,
    b.Email,
    b.PrincipalName,
    b.Capacity,
    b.IsActive,
    b.CreatedByUserId,
    b.UpdatedByUserId,
    b.CreatedAt,
    b.UpdatedAt,
    StudentCount = (
      SELECT COUNT(1)
      FROM dbo.Students s
      WHERE s.Status = N'Active'
        AND (
          (b.BranchCode IS NOT NULL AND s.AdmissionNumber LIKE CONCAT(b.BranchCode, N'%'))
          OR (b.BranchName IS NOT NULL AND s.AddressLine1 = b.BranchName)
        )
    )
  FROM dbo.Branches b
  ORDER BY b.IsActive DESC, b.BranchName ASC;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spBranchUpsert
  @BranchId INT = NULL,
  @BranchName NVARCHAR(200),
  @BranchCode NVARCHAR(50),
  @AddressLine1 NVARCHAR(255) = NULL,
  @AddressLine2 NVARCHAR(255) = NULL,
  @City NVARCHAR(120) = NULL,
  @State NVARCHAR(120) = NULL,
  @PostalCode NVARCHAR(20) = NULL,
  @Phone NVARCHAR(40) = NULL,
  @Email NVARCHAR(320) = NULL,
  @PrincipalName NVARCHAR(200) = NULL,
  @Capacity INT = 0,
  @IsActive BIT = 1,
  @ActorUserId INT = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF @BranchId IS NULL OR @BranchId = 0
  BEGIN
    INSERT INTO dbo.Branches (
      BranchName, BranchCode, AddressLine1, AddressLine2, City, State, PostalCode,
      Phone, Email, PrincipalName, Capacity, IsActive, CreatedByUserId, UpdatedByUserId,
      CreatedAt, UpdatedAt
    )
    VALUES (
      LTRIM(RTRIM(@BranchName)),
      UPPER(LTRIM(RTRIM(@BranchCode))),
      @AddressLine1, @AddressLine2, @City, @State, @PostalCode,
      @Phone, @Email, @PrincipalName, ISNULL(@Capacity, 0), ISNULL(@IsActive, 1),
      @ActorUserId, @ActorUserId, SYSUTCDATETIME(), SYSUTCDATETIME()
    );

    SET @BranchId = SCOPE_IDENTITY();
  END
  ELSE
  BEGIN
    UPDATE dbo.Branches
    SET BranchName = LTRIM(RTRIM(@BranchName)),
        BranchCode = UPPER(LTRIM(RTRIM(@BranchCode))),
        AddressLine1 = @AddressLine1,
        AddressLine2 = @AddressLine2,
        City = @City,
        State = @State,
        PostalCode = @PostalCode,
        Phone = @Phone,
        Email = @Email,
        PrincipalName = @PrincipalName,
        Capacity = ISNULL(@Capacity, 0),
        IsActive = ISNULL(@IsActive, 1),
        UpdatedByUserId = @ActorUserId,
        UpdatedAt = SYSUTCDATETIME()
    WHERE BranchId = @BranchId;
  END

  EXEC dbo.spBranchList;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spBranchDelete
  @BranchId INT
AS
BEGIN
  SET NOCOUNT ON;
  DELETE FROM dbo.Branches WHERE BranchId = @BranchId;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spParentStudentLinkUpsert
  @ParentUserId INT,
  @StudentId INT,
  @Relation NVARCHAR(50) = NULL,
  @IsPrimary BIT = 1,
  @CreatedByUserId INT = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  IF ISNULL(@IsPrimary, 1) = 1
  BEGIN
    UPDATE dbo.ParentStudentLinks
    SET IsPrimary = 0,
        UpdatedAt = SYSUTCDATETIME()
    WHERE ParentUserId = @ParentUserId
      AND StudentId <> @StudentId;
  END

  MERGE dbo.ParentStudentLinks AS target
  USING (SELECT @ParentUserId AS ParentUserId, @StudentId AS StudentId) AS source
  ON target.ParentUserId = source.ParentUserId AND target.StudentId = source.StudentId
  WHEN MATCHED THEN
    UPDATE SET Relation = @Relation, IsPrimary = ISNULL(@IsPrimary, target.IsPrimary), IsActive = 1, UpdatedAt = SYSUTCDATETIME()
  WHEN NOT MATCHED THEN
    INSERT (ParentUserId, StudentId, Relation, IsPrimary, IsActive, CreatedByUserId, CreatedAt, UpdatedAt)
    VALUES (@ParentUserId, @StudentId, @Relation, ISNULL(@IsPrimary, 1), 1, @CreatedByUserId, SYSUTCDATETIME(), SYSUTCDATETIME());

  SELECT TOP 1 * FROM dbo.ParentStudentLinks
  WHERE ParentUserId = @ParentUserId AND StudentId = @StudentId;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spParentStudentLinkList
  @ParentUserId INT = NULL,
  @RequestingUserId INT = NULL,
  @RequestingRoleName NVARCHAR(50) = NULL,
  @Search NVARCHAR(200) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @NormalizedRole NVARCHAR(50) = LOWER(LTRIM(RTRIM(ISNULL(@RequestingRoleName, N''))));
  DECLARE @NormalizedSearch NVARCHAR(200) = NULLIF(LTRIM(RTRIM(ISNULL(@Search, N''))), N'');

  SELECT
    psl.ParentStudentLinkId,
    psl.ParentUserId,
    parentUser.FullName AS ParentFullName,
    parentUser.Email AS ParentEmail,
    parentUser.Phone AS ParentPhone,
    psl.StudentId,
    studentUser.FullName AS StudentFullName,
    student.AdmissionNumber,
    student.RollNumber,
    class.ClassName,
    section.SectionName,
    psl.Relation,
    psl.IsPrimary,
    psl.IsActive,
    psl.CreatedByUserId,
    psl.CreatedAt,
    psl.UpdatedAt
  FROM dbo.ParentStudentLinks psl
  INNER JOIN dbo.Users parentUser
    ON parentUser.UserId = psl.ParentUserId
  INNER JOIN dbo.Students student
    ON student.StudentId = psl.StudentId
  LEFT JOIN dbo.Users studentUser
    ON studentUser.UserId = student.UserId
  LEFT JOIN dbo.Classes class
    ON class.ClassId = student.ClassId
  LEFT JOIN dbo.Sections section
    ON section.SectionId = student.SectionId
  WHERE psl.IsActive = 1
    AND (
      @NormalizedRole = N'admin'
      OR (@RequestingUserId IS NOT NULL AND psl.ParentUserId = @RequestingUserId)
    )
    AND (@ParentUserId IS NULL OR psl.ParentUserId = @ParentUserId)
    AND (
      @NormalizedSearch IS NULL
      OR parentUser.FullName LIKE N'%' + @NormalizedSearch + N'%'
      OR parentUser.Email LIKE N'%' + @NormalizedSearch + N'%'
      OR studentUser.FullName LIKE N'%' + @NormalizedSearch + N'%'
      OR student.AdmissionNumber LIKE N'%' + @NormalizedSearch + N'%'
      OR student.RollNumber LIKE N'%' + @NormalizedSearch + N'%'
      OR class.ClassName LIKE N'%' + @NormalizedSearch + N'%'
      OR section.SectionName LIKE N'%' + @NormalizedSearch + N'%'
    )
  ORDER BY parentUser.FullName ASC, psl.IsPrimary DESC, studentUser.FullName ASC, psl.ParentStudentLinkId ASC;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spParentStudentLinkSetPrimary
  @ParentStudentLinkId INT,
  @RequestingUserId INT,
  @RequestingRoleName NVARCHAR(50)
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @ParentUserId INT = NULL;
  DECLARE @NormalizedRole NVARCHAR(50) = LOWER(LTRIM(RTRIM(ISNULL(@RequestingRoleName, N''))));

  SELECT TOP 1 @ParentUserId = ParentUserId
  FROM dbo.ParentStudentLinks
  WHERE ParentStudentLinkId = @ParentStudentLinkId
    AND IsActive = 1;

  IF @ParentUserId IS NULL
  BEGIN
    THROW 51000, 'Parent-student link not found.', 1;
  END;

  IF @NormalizedRole <> N'admin' AND @ParentUserId <> @RequestingUserId
  BEGIN
    THROW 51001, 'You are not authorized to update this link.', 1;
  END;

  UPDATE dbo.ParentStudentLinks
  SET IsPrimary = 0,
      UpdatedAt = SYSUTCDATETIME()
  WHERE ParentUserId = @ParentUserId
    AND IsActive = 1;

  UPDATE dbo.ParentStudentLinks
  SET IsPrimary = 1,
      UpdatedAt = SYSUTCDATETIME()
  WHERE ParentStudentLinkId = @ParentStudentLinkId
    AND IsActive = 1;

  EXEC dbo.spParentStudentLinkList
    @ParentUserId = @ParentUserId,
    @RequestingUserId = @RequestingUserId,
    @RequestingRoleName = @RequestingRoleName,
    @Search = NULL;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spParentStudentLinkDeactivate
  @ParentStudentLinkId INT,
  @RequestingUserId INT,
  @RequestingRoleName NVARCHAR(50)
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @ParentUserId INT = NULL;
  DECLARE @WasPrimary BIT = 0;
  DECLARE @NormalizedRole NVARCHAR(50) = LOWER(LTRIM(RTRIM(ISNULL(@RequestingRoleName, N''))));

  SELECT TOP 1
    @ParentUserId = ParentUserId,
    @WasPrimary = IsPrimary
  FROM dbo.ParentStudentLinks
  WHERE ParentStudentLinkId = @ParentStudentLinkId
    AND IsActive = 1;

  IF @ParentUserId IS NULL
  BEGIN
    THROW 51002, 'Parent-student link not found.', 1;
  END;

  IF @NormalizedRole <> N'admin' AND @ParentUserId <> @RequestingUserId
  BEGIN
    THROW 51003, 'You are not authorized to remove this link.', 1;
  END;

  UPDATE dbo.ParentStudentLinks
  SET IsActive = 0,
      IsPrimary = 0,
      UpdatedAt = SYSUTCDATETIME()
  WHERE ParentStudentLinkId = @ParentStudentLinkId;

  IF @WasPrimary = 1
  BEGIN
    UPDATE TOP (1) dbo.ParentStudentLinks
    SET IsPrimary = 1,
        UpdatedAt = SYSUTCDATETIME()
    WHERE ParentUserId = @ParentUserId
      AND IsActive = 1
    ORDER BY CreatedAt ASC, ParentStudentLinkId ASC;
  END;

  EXEC dbo.spParentStudentLinkList
    @ParentUserId = @ParentUserId,
    @RequestingUserId = @RequestingUserId,
    @RequestingRoleName = @RequestingRoleName,
    @Search = NULL;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spPortalNotificationCreate
  @SenderUserId INT = NULL,
  @Title NVARCHAR(200),
  @Message NVARCHAR(2000),
  @NotificationType NVARCHAR(30) = N'info',
  @AudienceRoles NVARCHAR(200) = NULL,
  @RecipientUserIds NVARCHAR(MAX) = NULL,
  @LinkUrl NVARCHAR(500) = NULL,
  @MetadataJson NVARCHAR(MAX) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @SenderFullName NVARCHAR(200) = NULL;
  SELECT TOP 1 @SenderFullName = FullName FROM dbo.Users WHERE UserId = @SenderUserId;

  INSERT INTO dbo.PortalNotifications (
    Title, Message, NotificationType, AudienceRoles, SenderUserId, SenderFullName, LinkUrl, MetadataJson, CreatedAt
  )
  VALUES (
    LTRIM(RTRIM(@Title)),
    LTRIM(RTRIM(@Message)),
    LOWER(LTRIM(RTRIM(ISNULL(@NotificationType, N'info')))),
    @AudienceRoles,
    @SenderUserId,
    @SenderFullName,
    @LinkUrl,
    @MetadataJson,
    SYSUTCDATETIME()
  );

  DECLARE @NotificationId INT = SCOPE_IDENTITY();

  INSERT INTO dbo.PortalNotificationRecipients (NotificationId, UserId, IsRead, CreatedAt)
  SELECT DISTINCT @NotificationId, u.UserId, 0, SYSUTCDATETIME()
  FROM dbo.Users u
  LEFT JOIN dbo.Roles r ON r.RoleId = u.RoleId
  WHERE u.IsActive = 1
    AND (
      (@RecipientUserIds IS NOT NULL AND EXISTS (
        SELECT 1
        FROM STRING_SPLIT(@RecipientUserIds, ',') ss
        WHERE TRY_CAST(LTRIM(RTRIM(ss.value)) AS INT) = u.UserId
      ))
      OR (@AudienceRoles IS NOT NULL AND EXISTS (
        SELECT 1
        FROM STRING_SPLIT(@AudienceRoles, ',') sr
        WHERE LOWER(LTRIM(RTRIM(sr.value))) = LOWER(LTRIM(RTRIM(ISNULL(r.RoleName, N''))))
      ))
    );

  SELECT TOP 1 * FROM dbo.PortalNotifications WHERE NotificationId = @NotificationId;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spPortalNotificationInbox
  @UserId INT,
  @Limit INT = 20
AS
BEGIN
  SET NOCOUNT ON;

  SELECT TOP (CASE WHEN ISNULL(@Limit, 20) < 1 THEN 20 WHEN @Limit > 100 THEN 100 ELSE @Limit END)
    n.NotificationId,
    n.Title,
    n.Message,
    n.NotificationType,
    n.AudienceRoles,
    n.SenderUserId,
    n.SenderFullName,
    n.LinkUrl,
    n.MetadataJson,
    n.CreatedAt,
    nr.IsRead,
    nr.ReadAt
  FROM dbo.PortalNotificationRecipients nr
  INNER JOIN dbo.PortalNotifications n ON n.NotificationId = nr.NotificationId
  WHERE nr.UserId = @UserId
  ORDER BY n.CreatedAt DESC, n.NotificationId DESC;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spPortalNotificationMarkRead
  @NotificationId INT,
  @UserId INT
AS
BEGIN
  SET NOCOUNT ON;

  UPDATE dbo.PortalNotificationRecipients
  SET IsRead = 1,
      ReadAt = SYSUTCDATETIME()
  WHERE NotificationId = @NotificationId
    AND UserId = @UserId;

  EXEC dbo.spPortalNotificationInbox @UserId = @UserId, @Limit = 20;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spPortalContactList
  @UserId INT,
  @RoleName NVARCHAR(50)
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @NormalizedRole NVARCHAR(50) = LOWER(LTRIM(RTRIM(@RoleName)));

  SELECT
    u.UserId,
    u.FullName,
    u.Email,
    u.Phone,
    RoleName = LOWER(LTRIM(RTRIM(r.RoleName)))
  FROM dbo.Users u
  INNER JOIN dbo.Roles r ON r.RoleId = u.RoleId
  WHERE u.IsActive = 1
    AND u.UserId <> @UserId
    AND (
      (@NormalizedRole = N'parent' AND LOWER(r.RoleName) IN (N'teacher', N'admin'))
      OR (@NormalizedRole = N'teacher' AND LOWER(r.RoleName) IN (N'parent', N'admin'))
      OR (@NormalizedRole = N'admin' AND LOWER(r.RoleName) IN (N'teacher', N'parent', N'accountant'))
      OR (@NormalizedRole = N'accountant' AND LOWER(r.RoleName) IN (N'admin'))
      OR (@NormalizedRole NOT IN (N'parent', N'teacher', N'admin', N'accountant'))
    )
  ORDER BY u.FullName ASC;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spPortalConversationList
  @UserId INT
AS
BEGIN
  SET NOCOUNT ON;

  ;WITH ConversationBase AS (
    SELECT
      c.ConversationId,
      c.Subject,
      c.StudentId,
      c.LastMessageAt,
      c.CreatedAt,
      latest.MessageId AS LatestMessageId,
      latest.Body AS LatestMessageBody,
      latest.CreatedAt AS LatestMessageCreatedAt
    FROM dbo.PortalConversations c
    INNER JOIN dbo.PortalConversationParticipants p
      ON p.ConversationId = c.ConversationId AND p.UserId = @UserId
    OUTER APPLY (
      SELECT TOP 1 m.MessageId, m.Body, m.CreatedAt
      FROM dbo.PortalMessages m
      WHERE m.ConversationId = c.ConversationId
      ORDER BY m.CreatedAt DESC, m.MessageId DESC
    ) latest
  )
  SELECT
    cb.ConversationId,
    cb.Subject,
    cb.StudentId,
    cb.LastMessageAt,
    cb.CreatedAt,
    cb.LatestMessageId,
    cb.LatestMessageBody,
    cb.LatestMessageCreatedAt,
    participant.UserId AS ParticipantUserId,
    participant.FullName AS ParticipantFullName,
    participant.RoleName AS ParticipantRoleName
  FROM ConversationBase cb
  OUTER APPLY (
    SELECT TOP 1
      u.UserId,
      u.FullName,
      LOWER(r.RoleName) AS RoleName
    FROM dbo.PortalConversationParticipants cp
    INNER JOIN dbo.Users u ON u.UserId = cp.UserId
    INNER JOIN dbo.Roles r ON r.RoleId = u.RoleId
    WHERE cp.ConversationId = cb.ConversationId
      AND cp.UserId <> @UserId
    ORDER BY u.FullName ASC
  ) participant
  ORDER BY cb.LastMessageAt DESC, cb.ConversationId DESC;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spPortalConversationMessages
  @ConversationId INT,
  @UserId INT
AS
BEGIN
  SET NOCOUNT ON;

  IF NOT EXISTS (
    SELECT 1
    FROM dbo.PortalConversationParticipants
    WHERE ConversationId = @ConversationId
      AND UserId = @UserId
  )
  BEGIN
    THROW 51001, 'Not authorized to access this conversation.', 1;
  END;

  UPDATE dbo.PortalConversationParticipants
  SET LastReadAt = SYSUTCDATETIME()
  WHERE ConversationId = @ConversationId
    AND UserId = @UserId;

  SELECT
    m.MessageId,
    m.ConversationId,
    m.SenderUserId,
    m.SenderFullName,
    SenderRole = LOWER(r.RoleName),
    m.Body,
    m.AttachmentUrl,
    m.CreatedAt
  FROM dbo.PortalMessages m
  INNER JOIN dbo.Users u ON u.UserId = m.SenderUserId
  INNER JOIN dbo.Roles r ON r.RoleId = u.RoleId
  WHERE m.ConversationId = @ConversationId
  ORDER BY m.CreatedAt ASC, m.MessageId ASC;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spPortalMessageSend
  @SenderUserId INT,
  @RecipientUserId INT,
  @Subject NVARCHAR(200) = NULL,
  @Body NVARCHAR(MAX),
  @StudentId INT = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @ConversationId INT = NULL;
  DECLARE @SenderRole NVARCHAR(50) = NULL;
  DECLARE @RecipientRole NVARCHAR(50) = NULL;
  DECLARE @SenderFullName NVARCHAR(200) = NULL;

  SELECT TOP 1 @SenderRole = LOWER(r.RoleName), @SenderFullName = u.FullName
  FROM dbo.Users u
  INNER JOIN dbo.Roles r ON r.RoleId = u.RoleId
  WHERE u.UserId = @SenderUserId;

  SELECT TOP 1 @RecipientRole = LOWER(r.RoleName)
  FROM dbo.Users u
  INNER JOIN dbo.Roles r ON r.RoleId = u.RoleId
  WHERE u.UserId = @RecipientUserId;

  SELECT TOP 1 @ConversationId = c.ConversationId
  FROM dbo.PortalConversations c
  INNER JOIN dbo.PortalConversationParticipants p1
    ON p1.ConversationId = c.ConversationId AND p1.UserId = @SenderUserId
  INNER JOIN dbo.PortalConversationParticipants p2
    ON p2.ConversationId = c.ConversationId AND p2.UserId = @RecipientUserId
  WHERE (@StudentId IS NULL OR c.StudentId = @StudentId)
  ORDER BY c.LastMessageAt DESC, c.ConversationId DESC;

  IF @ConversationId IS NULL
  BEGIN
    INSERT INTO dbo.PortalConversations (
      Subject, StudentId, CreatedByUserId, LastMessageAt, CreatedAt, UpdatedAt
    )
    VALUES (
      NULLIF(LTRIM(RTRIM(@Subject)), N''),
      @StudentId,
      @SenderUserId,
      SYSUTCDATETIME(),
      SYSUTCDATETIME(),
      SYSUTCDATETIME()
    );

    SET @ConversationId = SCOPE_IDENTITY();

    INSERT INTO dbo.PortalConversationParticipants (ConversationId, UserId, RoleName, IsArchived, LastReadAt, CreatedAt)
    VALUES
      (@ConversationId, @SenderUserId, @SenderRole, 0, SYSUTCDATETIME(), SYSUTCDATETIME()),
      (@ConversationId, @RecipientUserId, @RecipientRole, 0, NULL, SYSUTCDATETIME());
  END;

  INSERT INTO dbo.PortalMessages (
    ConversationId, SenderUserId, SenderFullName, Body, CreatedAt
  )
  VALUES (
    @ConversationId,
    @SenderUserId,
    @SenderFullName,
    LTRIM(RTRIM(@Body)),
    SYSUTCDATETIME()
  );

  UPDATE dbo.PortalConversations
  SET Subject = COALESCE(NULLIF(LTRIM(RTRIM(@Subject)), N''), Subject),
      LastMessageAt = SYSUTCDATETIME(),
      UpdatedAt = SYSUTCDATETIME()
  WHERE ConversationId = @ConversationId;

  UPDATE dbo.PortalConversationParticipants
  SET LastReadAt = CASE WHEN UserId = @SenderUserId THEN SYSUTCDATETIME() ELSE LastReadAt END
  WHERE ConversationId = @ConversationId;

  EXEC dbo.spPortalConversationMessages @ConversationId = @ConversationId, @UserId = @SenderUserId;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spPortalMeetingCreate
  @ParentUserId INT,
  @TeacherUserId INT,
  @StudentId INT = NULL,
  @Subject NVARCHAR(200) = NULL,
  @Title NVARCHAR(200),
  @Description NVARCHAR(2000) = NULL,
  @RequestedDate DATE,
  @RequestedTime NVARCHAR(20) = NULL,
  @MeetingMode NVARCHAR(20) = N'offline',
  @ParentNotes NVARCHAR(2000) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  INSERT INTO dbo.PortalMeetings (
    ParentUserId, TeacherUserId, StudentId, Subject, Title, Description, RequestedDate, RequestedTime,
    MeetingMode, ParentNotes, Status, CreatedAt, UpdatedAt
  )
  VALUES (
    @ParentUserId, @TeacherUserId, @StudentId, @Subject,
    LTRIM(RTRIM(@Title)), @Description, @RequestedDate, @RequestedTime,
    LOWER(LTRIM(RTRIM(ISNULL(@MeetingMode, N'offline')))), @ParentNotes, N'pending',
    SYSUTCDATETIME(), SYSUTCDATETIME()
  );

  SELECT TOP 1 * FROM dbo.PortalMeetings WHERE MeetingId = SCOPE_IDENTITY();
END;
GO

CREATE OR ALTER PROCEDURE dbo.spPortalMeetingList
  @UserId INT,
  @RoleName NVARCHAR(50),
  @Status NVARCHAR(20) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @NormalizedRole NVARCHAR(50) = LOWER(LTRIM(RTRIM(@RoleName)));

  SELECT
    m.MeetingId,
    m.ParentUserId,
    parentUser.FullName AS ParentFullName,
    m.TeacherUserId,
    teacherUser.FullName AS TeacherFullName,
    m.StudentId,
    StudentFullName = COALESCE(
      student.FullName,
      LTRIM(RTRIM(CONCAT(ISNULL(student.FirstName, N''), CASE WHEN student.LastName IS NULL OR student.LastName = N'' THEN N'' ELSE N' ' + student.LastName END)))
    ),
    classLookup.ClassName,
    sectionLookup.SectionName,
    m.Subject,
    m.Title,
    m.Description,
    m.RequestedDate,
    m.RequestedTime,
    m.MeetingDate,
    m.MeetingTime,
    m.MeetingMode,
    m.MeetingLink,
    m.Status,
    m.ParentNotes,
    m.TeacherNotes,
    m.ReviewedByUserId,
    reviewer.FullName AS ReviewedByFullName,
    m.ReviewedAt,
    m.CreatedAt,
    m.UpdatedAt
  FROM dbo.PortalMeetings m
  INNER JOIN dbo.Users parentUser ON parentUser.UserId = m.ParentUserId
  INNER JOIN dbo.Users teacherUser ON teacherUser.UserId = m.TeacherUserId
  LEFT JOIN dbo.Users reviewer ON reviewer.UserId = m.ReviewedByUserId
  LEFT JOIN dbo.Students student ON student.StudentId = m.StudentId
  LEFT JOIN dbo.Classes classLookup ON classLookup.ClassId = student.ClassId
  LEFT JOIN dbo.Sections sectionLookup ON sectionLookup.SectionId = student.SectionId
  WHERE (
      (@NormalizedRole = N'parent' AND m.ParentUserId = @UserId)
      OR (@NormalizedRole = N'teacher' AND m.TeacherUserId = @UserId)
      OR (@NormalizedRole = N'admin')
    )
    AND (@Status IS NULL OR m.Status = LOWER(LTRIM(RTRIM(@Status))))
  ORDER BY COALESCE(m.MeetingDate, m.RequestedDate) DESC, m.MeetingId DESC;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spPortalMeetingReview
  @MeetingId INT,
  @ReviewerUserId INT,
  @Status NVARCHAR(20),
  @MeetingDate DATE = NULL,
  @MeetingTime NVARCHAR(20) = NULL,
  @MeetingLink NVARCHAR(500) = NULL,
  @TeacherNotes NVARCHAR(2000) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  UPDATE dbo.PortalMeetings
  SET Status = LOWER(LTRIM(RTRIM(@Status))),
      MeetingDate = COALESCE(@MeetingDate, MeetingDate),
      MeetingTime = COALESCE(@MeetingTime, MeetingTime),
      MeetingLink = COALESCE(@MeetingLink, MeetingLink),
      TeacherNotes = COALESCE(@TeacherNotes, TeacherNotes),
      ReviewedByUserId = @ReviewerUserId,
      ReviewedAt = SYSUTCDATETIME(),
      UpdatedAt = SYSUTCDATETIME()
  WHERE MeetingId = @MeetingId;

  SELECT TOP 1 * FROM dbo.PortalMeetings WHERE MeetingId = @MeetingId;
END;
GO

CREATE OR ALTER PROCEDURE dbo.spPortalMeetingCancel
  @MeetingId INT,
  @UserId INT,
  @RoleName NVARCHAR(50),
  @Notes NVARCHAR(2000) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  UPDATE dbo.PortalMeetings
  SET Status = N'cancelled',
      ParentNotes = CASE WHEN LOWER(LTRIM(RTRIM(@RoleName))) = N'parent' AND @Notes IS NOT NULL THEN @Notes ELSE ParentNotes END,
      TeacherNotes = CASE WHEN LOWER(LTRIM(RTRIM(@RoleName))) IN (N'teacher', N'admin') AND @Notes IS NOT NULL THEN @Notes ELSE TeacherNotes END,
      ReviewedByUserId = CASE WHEN LOWER(LTRIM(RTRIM(@RoleName))) IN (N'teacher', N'admin') THEN @UserId ELSE ReviewedByUserId END,
      ReviewedAt = CASE WHEN LOWER(LTRIM(RTRIM(@RoleName))) IN (N'teacher', N'admin') THEN SYSUTCDATETIME() ELSE ReviewedAt END,
      UpdatedAt = SYSUTCDATETIME()
  WHERE MeetingId = @MeetingId
    AND (
      ParentUserId = @UserId
      OR TeacherUserId = @UserId
      OR LOWER(LTRIM(RTRIM(@RoleName))) = N'admin'
    );

  SELECT TOP 1 * FROM dbo.PortalMeetings WHERE MeetingId = @MeetingId;
END;
GO
