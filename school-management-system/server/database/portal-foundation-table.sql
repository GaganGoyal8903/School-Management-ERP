IF OBJECT_ID(N'dbo.Branches', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.Branches (
    BranchId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    BranchName NVARCHAR(200) NOT NULL,
    BranchCode NVARCHAR(50) NOT NULL,
    AddressLine1 NVARCHAR(255) NULL,
    AddressLine2 NVARCHAR(255) NULL,
    City NVARCHAR(120) NULL,
    State NVARCHAR(120) NULL,
    PostalCode NVARCHAR(20) NULL,
    Phone NVARCHAR(40) NULL,
    Email NVARCHAR(320) NULL,
    PrincipalName NVARCHAR(200) NULL,
    Capacity INT NOT NULL CONSTRAINT DF_Branches_Capacity DEFAULT (0),
    IsActive BIT NOT NULL CONSTRAINT DF_Branches_IsActive DEFAULT (1),
    CreatedByUserId INT NULL,
    UpdatedByUserId INT NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Branches_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Branches_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END;
GO

IF COL_LENGTH(N'dbo.Branches', N'BranchCode') IS NULL
  ALTER TABLE dbo.Branches ADD BranchCode NVARCHAR(50) NULL;
GO
IF COL_LENGTH(N'dbo.Branches', N'AddressLine1') IS NULL
  ALTER TABLE dbo.Branches ADD AddressLine1 NVARCHAR(255) NULL;
GO
IF COL_LENGTH(N'dbo.Branches', N'AddressLine2') IS NULL
  ALTER TABLE dbo.Branches ADD AddressLine2 NVARCHAR(255) NULL;
GO
IF COL_LENGTH(N'dbo.Branches', N'City') IS NULL
  ALTER TABLE dbo.Branches ADD City NVARCHAR(120) NULL;
GO
IF COL_LENGTH(N'dbo.Branches', N'State') IS NULL
  ALTER TABLE dbo.Branches ADD State NVARCHAR(120) NULL;
GO
IF COL_LENGTH(N'dbo.Branches', N'PostalCode') IS NULL
  ALTER TABLE dbo.Branches ADD PostalCode NVARCHAR(20) NULL;
GO
IF COL_LENGTH(N'dbo.Branches', N'Phone') IS NULL
  ALTER TABLE dbo.Branches ADD Phone NVARCHAR(40) NULL;
GO
IF COL_LENGTH(N'dbo.Branches', N'Email') IS NULL
  ALTER TABLE dbo.Branches ADD Email NVARCHAR(320) NULL;
GO
IF COL_LENGTH(N'dbo.Branches', N'PrincipalName') IS NULL
  ALTER TABLE dbo.Branches ADD PrincipalName NVARCHAR(200) NULL;
GO
IF COL_LENGTH(N'dbo.Branches', N'Capacity') IS NULL
  ALTER TABLE dbo.Branches ADD Capacity INT NOT NULL CONSTRAINT DF_Branches_Capacity_Fallback DEFAULT (0);
GO
IF COL_LENGTH(N'dbo.Branches', N'IsActive') IS NULL
  ALTER TABLE dbo.Branches ADD IsActive BIT NOT NULL CONSTRAINT DF_Branches_IsActive_Fallback DEFAULT (1);
GO
IF COL_LENGTH(N'dbo.Branches', N'CreatedByUserId') IS NULL
  ALTER TABLE dbo.Branches ADD CreatedByUserId INT NULL;
GO
IF COL_LENGTH(N'dbo.Branches', N'UpdatedByUserId') IS NULL
  ALTER TABLE dbo.Branches ADD UpdatedByUserId INT NULL;
GO
IF COL_LENGTH(N'dbo.Branches', N'CreatedAt') IS NULL
  ALTER TABLE dbo.Branches ADD CreatedAt DATETIME2(0) NULL;
GO
IF COL_LENGTH(N'dbo.Branches', N'UpdatedAt') IS NULL
  ALTER TABLE dbo.Branches ADD UpdatedAt DATETIME2(0) NULL;
GO

UPDATE dbo.Branches SET CreatedAt = SYSUTCDATETIME() WHERE CreatedAt IS NULL;
GO
UPDATE dbo.Branches SET UpdatedAt = SYSUTCDATETIME() WHERE UpdatedAt IS NULL;
GO
UPDATE dbo.Branches SET BranchCode = CONCAT(N'BR-', BranchId) WHERE BranchCode IS NULL OR LTRIM(RTRIM(BranchCode)) = N'';
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'UX_Branches_Code' AND object_id = OBJECT_ID(N'dbo.Branches')
)
BEGIN
  CREATE UNIQUE INDEX UX_Branches_Code ON dbo.Branches(BranchCode);
END;
GO

IF OBJECT_ID(N'dbo.ParentStudentLinks', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ParentStudentLinks (
    ParentStudentLinkId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ParentUserId INT NOT NULL,
    StudentId INT NOT NULL,
    Relation NVARCHAR(50) NULL,
    IsPrimary BIT NOT NULL CONSTRAINT DF_ParentStudentLinks_IsPrimary DEFAULT (1),
    IsActive BIT NOT NULL CONSTRAINT DF_ParentStudentLinks_IsActive DEFAULT (1),
    CreatedByUserId INT NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_ParentStudentLinks_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_ParentStudentLinks_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END;
GO

IF COL_LENGTH(N'dbo.ParentStudentLinks', N'Relation') IS NULL
  ALTER TABLE dbo.ParentStudentLinks ADD Relation NVARCHAR(50) NULL;
GO
IF COL_LENGTH(N'dbo.ParentStudentLinks', N'IsPrimary') IS NULL
  ALTER TABLE dbo.ParentStudentLinks ADD IsPrimary BIT NOT NULL CONSTRAINT DF_ParentStudentLinks_IsPrimary_Fallback DEFAULT (1);
GO
IF COL_LENGTH(N'dbo.ParentStudentLinks', N'IsActive') IS NULL
  ALTER TABLE dbo.ParentStudentLinks ADD IsActive BIT NOT NULL CONSTRAINT DF_ParentStudentLinks_IsActive_Fallback DEFAULT (1);
GO
IF COL_LENGTH(N'dbo.ParentStudentLinks', N'CreatedByUserId') IS NULL
  ALTER TABLE dbo.ParentStudentLinks ADD CreatedByUserId INT NULL;
GO
IF COL_LENGTH(N'dbo.ParentStudentLinks', N'CreatedAt') IS NULL
  ALTER TABLE dbo.ParentStudentLinks ADD CreatedAt DATETIME2(0) NULL;
GO
IF COL_LENGTH(N'dbo.ParentStudentLinks', N'UpdatedAt') IS NULL
  ALTER TABLE dbo.ParentStudentLinks ADD UpdatedAt DATETIME2(0) NULL;
GO

UPDATE dbo.ParentStudentLinks SET CreatedAt = SYSUTCDATETIME() WHERE CreatedAt IS NULL;
GO
UPDATE dbo.ParentStudentLinks SET UpdatedAt = SYSUTCDATETIME() WHERE UpdatedAt IS NULL;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'UX_ParentStudentLinks_Unique' AND object_id = OBJECT_ID(N'dbo.ParentStudentLinks')
)
BEGIN
  CREATE UNIQUE INDEX UX_ParentStudentLinks_Unique
  ON dbo.ParentStudentLinks(ParentUserId, StudentId);
END;
GO

IF OBJECT_ID(N'dbo.PortalNotifications', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.PortalNotifications (
    NotificationId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Title NVARCHAR(200) NOT NULL,
    Message NVARCHAR(2000) NOT NULL,
    NotificationType NVARCHAR(30) NOT NULL CONSTRAINT DF_PortalNotifications_Type DEFAULT (N'info'),
    AudienceRoles NVARCHAR(200) NULL,
    SenderUserId INT NULL,
    SenderFullName NVARCHAR(200) NULL,
    LinkUrl NVARCHAR(500) NULL,
    MetadataJson NVARCHAR(MAX) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_PortalNotifications_CreatedAt DEFAULT SYSUTCDATETIME()
  );
END;
GO

IF COL_LENGTH(N'dbo.PortalNotifications', N'LinkUrl') IS NULL
  ALTER TABLE dbo.PortalNotifications ADD LinkUrl NVARCHAR(500) NULL;
GO
IF COL_LENGTH(N'dbo.PortalNotifications', N'MetadataJson') IS NULL
  ALTER TABLE dbo.PortalNotifications ADD MetadataJson NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH(N'dbo.PortalNotifications', N'SenderFullName') IS NULL
  ALTER TABLE dbo.PortalNotifications ADD SenderFullName NVARCHAR(200) NULL;
GO

IF OBJECT_ID(N'dbo.PortalNotificationRecipients', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.PortalNotificationRecipients (
    NotificationRecipientId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    NotificationId INT NOT NULL,
    UserId INT NOT NULL,
    IsRead BIT NOT NULL CONSTRAINT DF_PortalNotificationRecipients_IsRead DEFAULT (0),
    ReadAt DATETIME2(0) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_PortalNotificationRecipients_CreatedAt DEFAULT SYSUTCDATETIME()
  );
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'UX_PortalNotificationRecipients_Unique' AND object_id = OBJECT_ID(N'dbo.PortalNotificationRecipients')
)
BEGIN
  CREATE UNIQUE INDEX UX_PortalNotificationRecipients_Unique
  ON dbo.PortalNotificationRecipients(NotificationId, UserId);
END;
GO

IF OBJECT_ID(N'dbo.PortalConversations', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.PortalConversations (
    ConversationId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Subject NVARCHAR(200) NULL,
    StudentId INT NULL,
    CreatedByUserId INT NOT NULL,
    LastMessageAt DATETIME2(0) NOT NULL CONSTRAINT DF_PortalConversations_LastMessageAt DEFAULT SYSUTCDATETIME(),
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_PortalConversations_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_PortalConversations_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END;
GO

IF OBJECT_ID(N'dbo.PortalConversationParticipants', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.PortalConversationParticipants (
    ConversationParticipantId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ConversationId INT NOT NULL,
    UserId INT NOT NULL,
    RoleName NVARCHAR(50) NULL,
    IsArchived BIT NOT NULL CONSTRAINT DF_PortalConversationParticipants_IsArchived DEFAULT (0),
    LastReadAt DATETIME2(0) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_PortalConversationParticipants_CreatedAt DEFAULT SYSUTCDATETIME()
  );
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE name = N'UX_PortalConversationParticipants_Unique' AND object_id = OBJECT_ID(N'dbo.PortalConversationParticipants')
)
BEGIN
  CREATE UNIQUE INDEX UX_PortalConversationParticipants_Unique
  ON dbo.PortalConversationParticipants(ConversationId, UserId);
END;
GO

IF OBJECT_ID(N'dbo.PortalMessages', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.PortalMessages (
    MessageId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ConversationId INT NOT NULL,
    SenderUserId INT NOT NULL,
    SenderFullName NVARCHAR(200) NULL,
    Body NVARCHAR(MAX) NOT NULL,
    AttachmentUrl NVARCHAR(500) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_PortalMessages_CreatedAt DEFAULT SYSUTCDATETIME()
  );
END;
GO

IF OBJECT_ID(N'dbo.PortalMeetings', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.PortalMeetings (
    MeetingId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ParentUserId INT NOT NULL,
    TeacherUserId INT NOT NULL,
    StudentId INT NULL,
    Subject NVARCHAR(200) NULL,
    Title NVARCHAR(200) NOT NULL,
    Description NVARCHAR(2000) NULL,
    RequestedDate DATE NOT NULL,
    RequestedTime NVARCHAR(20) NULL,
    MeetingDate DATE NULL,
    MeetingTime NVARCHAR(20) NULL,
    MeetingMode NVARCHAR(20) NOT NULL CONSTRAINT DF_PortalMeetings_Mode DEFAULT (N'offline'),
    MeetingLink NVARCHAR(500) NULL,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_PortalMeetings_Status DEFAULT (N'pending'),
    ParentNotes NVARCHAR(2000) NULL,
    TeacherNotes NVARCHAR(2000) NULL,
    ReviewedByUserId INT NULL,
    ReviewedAt DATETIME2(0) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_PortalMeetings_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_PortalMeetings_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END;
GO

IF COL_LENGTH(N'dbo.PortalMeetings', N'Subject') IS NULL
  ALTER TABLE dbo.PortalMeetings ADD Subject NVARCHAR(200) NULL;
GO
IF COL_LENGTH(N'dbo.PortalMeetings', N'ParentNotes') IS NULL
  ALTER TABLE dbo.PortalMeetings ADD ParentNotes NVARCHAR(2000) NULL;
GO
IF COL_LENGTH(N'dbo.PortalMeetings', N'TeacherNotes') IS NULL
  ALTER TABLE dbo.PortalMeetings ADD TeacherNotes NVARCHAR(2000) NULL;
GO
IF COL_LENGTH(N'dbo.PortalMeetings', N'ReviewedByUserId') IS NULL
  ALTER TABLE dbo.PortalMeetings ADD ReviewedByUserId INT NULL;
GO
IF COL_LENGTH(N'dbo.PortalMeetings', N'ReviewedAt') IS NULL
  ALTER TABLE dbo.PortalMeetings ADD ReviewedAt DATETIME2(0) NULL;
GO
IF COL_LENGTH(N'dbo.PortalMeetings', N'CreatedAt') IS NULL
  ALTER TABLE dbo.PortalMeetings ADD CreatedAt DATETIME2(0) NULL;
GO
IF COL_LENGTH(N'dbo.PortalMeetings', N'UpdatedAt') IS NULL
  ALTER TABLE dbo.PortalMeetings ADD UpdatedAt DATETIME2(0) NULL;
GO

UPDATE dbo.PortalMeetings SET CreatedAt = SYSUTCDATETIME() WHERE CreatedAt IS NULL;
GO
UPDATE dbo.PortalMeetings SET UpdatedAt = SYSUTCDATETIME() WHERE UpdatedAt IS NULL;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.check_constraints WHERE name = N'CK_PortalMeetings_Status'
)
BEGIN
  ALTER TABLE dbo.PortalMeetings
  ADD CONSTRAINT CK_PortalMeetings_Status
  CHECK (Status IN (N'pending', N'approved', N'rejected', N'cancelled', N'completed'));
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.check_constraints WHERE name = N'CK_PortalNotifications_Type'
)
BEGIN
  ALTER TABLE dbo.PortalNotifications
  ADD CONSTRAINT CK_PortalNotifications_Type
  CHECK (NotificationType IN (N'info', N'success', N'warning', N'error'));
END;
GO

IF OBJECT_ID(N'dbo.Users', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.Users', N'UserId') IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Branches_CreatedByUser')
    ALTER TABLE dbo.Branches ADD CONSTRAINT FK_Branches_CreatedByUser FOREIGN KEY (CreatedByUserId) REFERENCES dbo.Users(UserId);
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Branches_UpdatedByUser')
    ALTER TABLE dbo.Branches ADD CONSTRAINT FK_Branches_UpdatedByUser FOREIGN KEY (UpdatedByUserId) REFERENCES dbo.Users(UserId);
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ParentStudentLinks_ParentUser')
    ALTER TABLE dbo.ParentStudentLinks ADD CONSTRAINT FK_ParentStudentLinks_ParentUser FOREIGN KEY (ParentUserId) REFERENCES dbo.Users(UserId);
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ParentStudentLinks_CreatedByUser')
    ALTER TABLE dbo.ParentStudentLinks ADD CONSTRAINT FK_ParentStudentLinks_CreatedByUser FOREIGN KEY (CreatedByUserId) REFERENCES dbo.Users(UserId);
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PortalNotifications_SenderUser')
    ALTER TABLE dbo.PortalNotifications ADD CONSTRAINT FK_PortalNotifications_SenderUser FOREIGN KEY (SenderUserId) REFERENCES dbo.Users(UserId);
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PortalNotificationRecipients_User')
    ALTER TABLE dbo.PortalNotificationRecipients ADD CONSTRAINT FK_PortalNotificationRecipients_User FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId);
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PortalConversations_CreatedByUser')
    ALTER TABLE dbo.PortalConversations ADD CONSTRAINT FK_PortalConversations_CreatedByUser FOREIGN KEY (CreatedByUserId) REFERENCES dbo.Users(UserId);
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PortalConversationParticipants_User')
    ALTER TABLE dbo.PortalConversationParticipants ADD CONSTRAINT FK_PortalConversationParticipants_User FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId);
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PortalMessages_SenderUser')
    ALTER TABLE dbo.PortalMessages ADD CONSTRAINT FK_PortalMessages_SenderUser FOREIGN KEY (SenderUserId) REFERENCES dbo.Users(UserId);
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PortalMeetings_ParentUser')
    ALTER TABLE dbo.PortalMeetings ADD CONSTRAINT FK_PortalMeetings_ParentUser FOREIGN KEY (ParentUserId) REFERENCES dbo.Users(UserId);
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PortalMeetings_TeacherUser')
    ALTER TABLE dbo.PortalMeetings ADD CONSTRAINT FK_PortalMeetings_TeacherUser FOREIGN KEY (TeacherUserId) REFERENCES dbo.Users(UserId);
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PortalMeetings_ReviewedByUser')
    ALTER TABLE dbo.PortalMeetings ADD CONSTRAINT FK_PortalMeetings_ReviewedByUser FOREIGN KEY (ReviewedByUserId) REFERENCES dbo.Users(UserId);
END;
GO

IF OBJECT_ID(N'dbo.Students', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.Students', N'StudentId') IS NOT NULL
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_ParentStudentLinks_Student')
    ALTER TABLE dbo.ParentStudentLinks ADD CONSTRAINT FK_ParentStudentLinks_Student FOREIGN KEY (StudentId) REFERENCES dbo.Students(StudentId);
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PortalConversations_Student')
    ALTER TABLE dbo.PortalConversations ADD CONSTRAINT FK_PortalConversations_Student FOREIGN KEY (StudentId) REFERENCES dbo.Students(StudentId);
  IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PortalMeetings_Student')
    ALTER TABLE dbo.PortalMeetings ADD CONSTRAINT FK_PortalMeetings_Student FOREIGN KEY (StudentId) REFERENCES dbo.Students(StudentId);
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PortalNotificationRecipients_Notification'
)
BEGIN
  ALTER TABLE dbo.PortalNotificationRecipients
  ADD CONSTRAINT FK_PortalNotificationRecipients_Notification
  FOREIGN KEY (NotificationId) REFERENCES dbo.PortalNotifications(NotificationId);
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PortalConversationParticipants_Conversation'
)
BEGIN
  ALTER TABLE dbo.PortalConversationParticipants
  ADD CONSTRAINT FK_PortalConversationParticipants_Conversation
  FOREIGN KEY (ConversationId) REFERENCES dbo.PortalConversations(ConversationId);
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_PortalMessages_Conversation'
)
BEGIN
  ALTER TABLE dbo.PortalMessages
  ADD CONSTRAINT FK_PortalMessages_Conversation
  FOREIGN KEY (ConversationId) REFERENCES dbo.PortalConversations(ConversationId);
END;
GO
