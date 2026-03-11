const User = require('../models/User');
const {
  getSqlClient,
  sqlConfig,
  initSqlServer,
  getPool,
  executeQuery,
  executeStoredProcedure,
} = require('../config/sqlServer');

const AUTH_USER_TABLE = 'dbo.SqlAuthUsers';
const AUTH_SESSION_TABLE = 'dbo.SqlAuthLoginSessions';
const AUTH_ATTEMPT_TABLE = 'dbo.SqlAuthAttempts';

let authBootstrapPromise = null;

const escapeSqlLiteral = (value = '') => String(value).replace(/'/g, "''");
const escapeSqlIdentifier = (value = '') => String(value).replace(/]/g, ']]');

const normalizeSqlDate = (value) => (value ? new Date(value) : null);

const mapSessionRow = (row) => {
  if (!row) {
    return null;
  }

  return {
    sessionToken: row.SessionToken,
    mongoUserId: row.MongoUserId,
    email: row.Email,
    ipAddress: row.IpAddress,
    userAgent: row.UserAgent,
    status: row.Status,
    sessionExpiresAt: normalizeSqlDate(row.SessionExpiresAt),
    captchaHash: row.CaptchaHash,
    captchaExpiresAt: normalizeSqlDate(row.CaptchaExpiresAt),
    captchaAttempts: Number(row.CaptchaAttempts || 0),
    captchaRefreshCount: Number(row.CaptchaRefreshCount || 0),
    captchaVerifiedAt: normalizeSqlDate(row.CaptchaVerifiedAt),
    otpHash: row.OtpHash,
    otpExpiresAt: normalizeSqlDate(row.OtpExpiresAt),
    otpAttempts: Number(row.OtpAttempts || 0),
    otpSendCount: Number(row.OtpSendCount || 0),
    otpLastSentAt: normalizeSqlDate(row.OtpLastSentAt),
    otpVerifiedAt: normalizeSqlDate(row.OtpVerifiedAt),
    completedAt: normalizeSqlDate(row.CompletedAt),
    createdAt: normalizeSqlDate(row.CreatedAt),
    updatedAt: normalizeSqlDate(row.UpdatedAt),
  };
};

const getFirstRecord = (result) => {
  return result?.recordset?.[0] || null;
};

const bootstrapAuthDatabaseIfNeeded = async () => {
  const client = getSqlClient();
  const databaseName = sqlConfig.database;
  const databaseLiteral = escapeSqlLiteral(databaseName);
  const databaseIdentifier = escapeSqlIdentifier(databaseName);
  const masterConfig = {
    ...sqlConfig,
    database: 'master',
  };

  const masterPool = await new client.ConnectionPool(masterConfig).connect();

  try {
    await masterPool
      .request()
      .batch(
        `IF DB_ID(N'${databaseLiteral}') IS NULL
BEGIN
  EXEC(N'CREATE DATABASE [${databaseIdentifier}]');
END`
      );
  } finally {
    await masterPool.close();
  }
};

const AUTH_SCHEMA_BATCH = `
IF OBJECT_ID(N'${AUTH_USER_TABLE}', N'U') IS NULL
BEGIN
  CREATE TABLE ${AUTH_USER_TABLE} (
    AuthUserId INT IDENTITY(1,1) PRIMARY KEY,
    MongoUserId NVARCHAR(64) NOT NULL,
    FullName NVARCHAR(200) NOT NULL,
    Email NVARCHAR(320) NOT NULL,
    PasswordHash NVARCHAR(255) NOT NULL,
    RoleName NVARCHAR(50) NOT NULL,
    Phone NVARCHAR(40) NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_SqlAuthUsers_IsActive DEFAULT (1),
    LastLoginAt DATETIME2(0) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlAuthUsers_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlAuthUsers_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SqlAuthUsers_MongoUserId' AND object_id = OBJECT_ID(N'${AUTH_USER_TABLE}'))
BEGIN
  CREATE UNIQUE INDEX UX_SqlAuthUsers_MongoUserId ON ${AUTH_USER_TABLE}(MongoUserId);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SqlAuthUsers_Email' AND object_id = OBJECT_ID(N'${AUTH_USER_TABLE}'))
BEGIN
  CREATE UNIQUE INDEX UX_SqlAuthUsers_Email ON ${AUTH_USER_TABLE}(Email);
END;

IF OBJECT_ID(N'${AUTH_SESSION_TABLE}', N'U') IS NULL
BEGIN
  CREATE TABLE ${AUTH_SESSION_TABLE} (
    LoginSessionId INT IDENTITY(1,1) PRIMARY KEY,
    SessionToken NVARCHAR(128) NOT NULL,
    MongoUserId NVARCHAR(64) NOT NULL,
    Email NVARCHAR(320) NOT NULL,
    IpAddress NVARCHAR(64) NULL,
    UserAgent NVARCHAR(512) NULL,
    Status NVARCHAR(50) NOT NULL,
    SessionExpiresAt DATETIME2(0) NOT NULL,
    CaptchaHash NVARCHAR(128) NULL,
    CaptchaExpiresAt DATETIME2(0) NULL,
    CaptchaAttempts INT NOT NULL CONSTRAINT DF_SqlAuthLoginSessions_CaptchaAttempts DEFAULT (0),
    CaptchaRefreshCount INT NOT NULL CONSTRAINT DF_SqlAuthLoginSessions_CaptchaRefreshCount DEFAULT (0),
    CaptchaVerifiedAt DATETIME2(0) NULL,
    OtpHash NVARCHAR(128) NULL,
    OtpExpiresAt DATETIME2(0) NULL,
    OtpAttempts INT NOT NULL CONSTRAINT DF_SqlAuthLoginSessions_OtpAttempts DEFAULT (0),
    OtpSendCount INT NOT NULL CONSTRAINT DF_SqlAuthLoginSessions_OtpSendCount DEFAULT (0),
    OtpLastSentAt DATETIME2(0) NULL,
    OtpVerifiedAt DATETIME2(0) NULL,
    CompletedAt DATETIME2(0) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlAuthLoginSessions_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlAuthLoginSessions_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SqlAuthLoginSessions_SessionToken' AND object_id = OBJECT_ID(N'${AUTH_SESSION_TABLE}'))
BEGIN
  CREATE UNIQUE INDEX UX_SqlAuthLoginSessions_SessionToken ON ${AUTH_SESSION_TABLE}(SessionToken);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SqlAuthLoginSessions_MongoUserId' AND object_id = OBJECT_ID(N'${AUTH_SESSION_TABLE}'))
BEGIN
  CREATE INDEX IX_SqlAuthLoginSessions_MongoUserId ON ${AUTH_SESSION_TABLE}(MongoUserId);
END;

IF OBJECT_ID(N'${AUTH_ATTEMPT_TABLE}', N'U') IS NULL
BEGIN
  CREATE TABLE ${AUTH_ATTEMPT_TABLE} (
    AuthAttemptId INT IDENTITY(1,1) PRIMARY KEY,
    ActionName NVARCHAR(100) NOT NULL,
    RateKey NVARCHAR(128) NOT NULL,
    Attempts INT NOT NULL CONSTRAINT DF_SqlAuthAttempts_Attempts DEFAULT (0),
    WindowStart DATETIME2(0) NOT NULL,
    LastAttemptAt DATETIME2(0) NOT NULL,
    BlockedUntil DATETIME2(0) NULL,
    ExpiresAt DATETIME2(0) NOT NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlAuthAttempts_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlAuthAttempts_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SqlAuthAttempts_ActionKey' AND object_id = OBJECT_ID(N'${AUTH_ATTEMPT_TABLE}'))
BEGIN
  CREATE UNIQUE INDEX UX_SqlAuthAttempts_ActionKey ON ${AUTH_ATTEMPT_TABLE}(ActionName, RateKey);
END;
`;

const AUTH_PROCEDURES_BATCH = `
CREATE OR ALTER PROCEDURE dbo.spAuthUpsertUserMirror
  @MongoUserId NVARCHAR(64),
  @FullName NVARCHAR(200),
  @Email NVARCHAR(320),
  @PasswordHash NVARCHAR(255),
  @RoleName NVARCHAR(50),
  @Phone NVARCHAR(40) = NULL,
  @IsActive BIT,
  @LastLoginAt DATETIME2(0) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @Now DATETIME2(0) = SYSUTCDATETIME();

  IF EXISTS (SELECT 1 FROM ${AUTH_USER_TABLE} WHERE MongoUserId = @MongoUserId)
  BEGIN
    UPDATE ${AUTH_USER_TABLE}
    SET FullName = @FullName,
        Email = @Email,
        PasswordHash = @PasswordHash,
        RoleName = @RoleName,
        Phone = @Phone,
        IsActive = @IsActive,
        LastLoginAt = @LastLoginAt,
        UpdatedAt = @Now
    WHERE MongoUserId = @MongoUserId;
  END
  ELSE IF EXISTS (SELECT 1 FROM ${AUTH_USER_TABLE} WHERE Email = @Email)
  BEGIN
    UPDATE ${AUTH_USER_TABLE}
    SET MongoUserId = @MongoUserId,
        FullName = @FullName,
        PasswordHash = @PasswordHash,
        RoleName = @RoleName,
        Phone = @Phone,
        IsActive = @IsActive,
        LastLoginAt = @LastLoginAt,
        UpdatedAt = @Now
    WHERE Email = @Email;
  END
  ELSE
  BEGIN
    INSERT INTO ${AUTH_USER_TABLE} (
      MongoUserId,
      FullName,
      Email,
      PasswordHash,
      RoleName,
      Phone,
      IsActive,
      LastLoginAt,
      CreatedAt,
      UpdatedAt
    )
    VALUES (
      @MongoUserId,
      @FullName,
      @Email,
      @PasswordHash,
      @RoleName,
      @Phone,
      @IsActive,
      @LastLoginAt,
      @Now,
      @Now
    );
  END;

  SELECT TOP 1
    AuthUserId,
    MongoUserId,
    FullName,
    Email,
    PasswordHash,
    RoleName,
    Phone,
    IsActive,
    LastLoginAt
  FROM ${AUTH_USER_TABLE}
  WHERE MongoUserId = @MongoUserId;
END;

CREATE OR ALTER PROCEDURE dbo.spAuthLoginLookup
  @Email NVARCHAR(320)
AS
BEGIN
  SET NOCOUNT ON;

  SELECT TOP 1
    AuthUserId,
    MongoUserId,
    FullName,
    Email,
    PasswordHash,
    RoleName,
    Phone,
    IsActive,
    LastLoginAt
  FROM ${AUTH_USER_TABLE}
  WHERE Email = @Email;
END;

CREATE OR ALTER PROCEDURE dbo.spAuthStartLoginSession
  @SessionToken NVARCHAR(128),
  @MongoUserId NVARCHAR(64),
  @Email NVARCHAR(320),
  @IpAddress NVARCHAR(64) = NULL,
  @UserAgent NVARCHAR(512) = NULL,
  @Status NVARCHAR(50),
  @SessionExpiresAt DATETIME2(0),
  @CaptchaHash NVARCHAR(128),
  @CaptchaExpiresAt DATETIME2(0)
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @Now DATETIME2(0) = SYSUTCDATETIME();

  DELETE FROM ${AUTH_SESSION_TABLE} WHERE SessionToken = @SessionToken;

  INSERT INTO ${AUTH_SESSION_TABLE} (
    SessionToken,
    MongoUserId,
    Email,
    IpAddress,
    UserAgent,
    Status,
    SessionExpiresAt,
    CaptchaHash,
    CaptchaExpiresAt,
    CaptchaAttempts,
    CaptchaRefreshCount,
    OtpAttempts,
    OtpSendCount,
    CreatedAt,
    UpdatedAt
  )
  VALUES (
    @SessionToken,
    @MongoUserId,
    @Email,
    @IpAddress,
    @UserAgent,
    @Status,
    @SessionExpiresAt,
    @CaptchaHash,
    @CaptchaExpiresAt,
    0,
    0,
    0,
    0,
    @Now,
    @Now
  );

  SELECT TOP 1 * FROM ${AUTH_SESSION_TABLE} WHERE SessionToken = @SessionToken;
END;

CREATE OR ALTER PROCEDURE dbo.spAuthRefreshCaptcha
  @SessionToken NVARCHAR(128),
  @CaptchaHash NVARCHAR(128),
  @CaptchaExpiresAt DATETIME2(0),
  @MaxRefresh INT
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @Now DATETIME2(0) = SYSUTCDATETIME();
  DECLARE @CurrentRefreshCount INT;
  DECLARE @CurrentExpiresAt DATETIME2(0);
  DECLARE @CaptchaVerifiedAt DATETIME2(0);

  SELECT
    @CurrentRefreshCount = CaptchaRefreshCount,
    @CurrentExpiresAt = SessionExpiresAt,
    @CaptchaVerifiedAt = CaptchaVerifiedAt
  FROM ${AUTH_SESSION_TABLE}
  WHERE SessionToken = @SessionToken;

  IF @CurrentExpiresAt IS NULL OR @CurrentExpiresAt <= @Now
  BEGIN
    SELECT N'session_expired' AS ResultCode;
    RETURN;
  END;

  IF @CaptchaVerifiedAt IS NOT NULL
  BEGIN
    SELECT N'already_verified' AS ResultCode;
    RETURN;
  END;

  IF ISNULL(@CurrentRefreshCount, 0) >= @MaxRefresh
  BEGIN
    SELECT N'refresh_limit' AS ResultCode;
    RETURN;
  END;

  UPDATE ${AUTH_SESSION_TABLE}
  SET CaptchaHash = @CaptchaHash,
      CaptchaExpiresAt = @CaptchaExpiresAt,
      CaptchaAttempts = 0,
      CaptchaRefreshCount = ISNULL(CaptchaRefreshCount, 0) + 1,
      Status = N'credentials_verified',
      UpdatedAt = @Now
  WHERE SessionToken = @SessionToken;

  SELECT TOP 1
    N'ok' AS ResultCode,
    CaptchaExpiresAt,
    CaptchaRefreshCount
  FROM ${AUTH_SESSION_TABLE}
  WHERE SessionToken = @SessionToken;
END;

CREATE OR ALTER PROCEDURE dbo.spAuthVerifyCaptcha
  @SessionToken NVARCHAR(128),
  @CaptchaHash NVARCHAR(128),
  @MaxAttempts INT,
  @VerifiedAt DATETIME2(0)
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @Now DATETIME2(0) = SYSUTCDATETIME();
  DECLARE @SessionExpiresAt DATETIME2(0);
  DECLARE @StoredCaptchaHash NVARCHAR(128);
  DECLARE @CaptchaExpiresAt DATETIME2(0);
  DECLARE @CaptchaAttempts INT;
  DECLARE @CaptchaVerifiedAt DATETIME2(0);
  DECLARE @NewAttempts INT;

  SELECT
    @SessionExpiresAt = SessionExpiresAt,
    @StoredCaptchaHash = CaptchaHash,
    @CaptchaExpiresAt = CaptchaExpiresAt,
    @CaptchaAttempts = CaptchaAttempts,
    @CaptchaVerifiedAt = CaptchaVerifiedAt
  FROM ${AUTH_SESSION_TABLE}
  WHERE SessionToken = @SessionToken;

  IF @SessionExpiresAt IS NULL OR @SessionExpiresAt <= @Now
  BEGIN
    SELECT N'session_expired' AS ResultCode, 0 AS AttemptsLeft;
    RETURN;
  END;

  IF @CaptchaVerifiedAt IS NOT NULL
  BEGIN
    SELECT N'already_verified' AS ResultCode, @CaptchaAttempts AS CaptchaAttempts, @CaptchaExpiresAt AS CaptchaExpiresAt;
    RETURN;
  END;

  IF @StoredCaptchaHash IS NULL
  BEGIN
    SELECT N'missing_captcha' AS ResultCode, 0 AS AttemptsLeft;
    RETURN;
  END;

  IF ISNULL(@CaptchaAttempts, 0) >= @MaxAttempts
  BEGIN
    SELECT N'captcha_attempt_limit' AS ResultCode, 0 AS AttemptsLeft;
    RETURN;
  END;

  IF @CaptchaExpiresAt IS NULL OR @CaptchaExpiresAt <= @Now
  BEGIN
    SELECT N'captcha_expired' AS ResultCode, 0 AS AttemptsLeft, @CaptchaExpiresAt AS CaptchaExpiresAt;
    RETURN;
  END;

  IF @StoredCaptchaHash <> @CaptchaHash
  BEGIN
    SET @NewAttempts = ISNULL(@CaptchaAttempts, 0) + 1;

    UPDATE ${AUTH_SESSION_TABLE}
    SET CaptchaAttempts = @NewAttempts,
        UpdatedAt = @Now
    WHERE SessionToken = @SessionToken;

    IF @NewAttempts >= @MaxAttempts
    BEGIN
      SELECT N'captcha_attempt_limit' AS ResultCode, 0 AS AttemptsLeft, @NewAttempts AS CaptchaAttempts;
      RETURN;
    END;

    SELECT N'invalid_captcha' AS ResultCode, (@MaxAttempts - @NewAttempts) AS AttemptsLeft, @NewAttempts AS CaptchaAttempts;
    RETURN;
  END;

  UPDATE ${AUTH_SESSION_TABLE}
  SET CaptchaVerifiedAt = @VerifiedAt,
      CaptchaAttempts = 0,
      Status = N'captcha_verified',
      UpdatedAt = @Now
  WHERE SessionToken = @SessionToken;

  SELECT N'ok' AS ResultCode, @VerifiedAt AS CaptchaVerifiedAt, 0 AS AttemptsLeft;
END;

CREATE OR ALTER PROCEDURE dbo.spAuthCheckOtpResendCooldown
  @SessionToken NVARCHAR(128),
  @CooldownMs BIGINT,
  @MaxSends INT
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @Now DATETIME2(0) = SYSUTCDATETIME();
  DECLARE @SessionExpiresAt DATETIME2(0);
  DECLARE @CaptchaVerifiedAt DATETIME2(0);
  DECLARE @OtpSendCount INT;
  DECLARE @OtpLastSentAt DATETIME2(0);
  DECLARE @ElapsedMs BIGINT;

  SELECT
    @SessionExpiresAt = SessionExpiresAt,
    @CaptchaVerifiedAt = CaptchaVerifiedAt,
    @OtpSendCount = OtpSendCount,
    @OtpLastSentAt = OtpLastSentAt
  FROM ${AUTH_SESSION_TABLE}
  WHERE SessionToken = @SessionToken;

  IF @SessionExpiresAt IS NULL OR @SessionExpiresAt <= @Now
  BEGIN
    SELECT N'session_expired' AS ResultCode, 0 AS RetryAfterSeconds, 0 AS RemainingSends;
    RETURN;
  END;

  IF @CaptchaVerifiedAt IS NULL
  BEGIN
    SELECT N'captcha_required' AS ResultCode, 0 AS RetryAfterSeconds, 0 AS RemainingSends;
    RETURN;
  END;

  IF ISNULL(@OtpSendCount, 0) >= @MaxSends
  BEGIN
    SELECT N'send_limit' AS ResultCode, 0 AS RetryAfterSeconds, 0 AS RemainingSends;
    RETURN;
  END;

  IF @OtpLastSentAt IS NOT NULL
  BEGIN
    SET @ElapsedMs = DATEDIFF_BIG(MILLISECOND, @OtpLastSentAt, @Now);

    IF @ElapsedMs < @CooldownMs
    BEGIN
      SELECT
        N'cooldown_active' AS ResultCode,
        CAST(CEILING((@CooldownMs - @ElapsedMs) / 1000.0) AS INT) AS RetryAfterSeconds,
        (@MaxSends - ISNULL(@OtpSendCount, 0)) AS RemainingSends,
        DATEADD(MILLISECOND, @CooldownMs, @OtpLastSentAt) AS ResendAvailableAt;
      RETURN;
    END;
  END;

  SELECT
    N'ok' AS ResultCode,
    0 AS RetryAfterSeconds,
    (@MaxSends - ISNULL(@OtpSendCount, 0)) AS RemainingSends,
    NULL AS ResendAvailableAt;
END;

CREATE OR ALTER PROCEDURE dbo.spAuthCreateOtp
  @SessionToken NVARCHAR(128),
  @OtpHash NVARCHAR(128),
  @OtpExpiresAt DATETIME2(0),
  @SentAt DATETIME2(0),
  @MaxSends INT
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @Now DATETIME2(0) = SYSUTCDATETIME();
  DECLARE @SessionExpiresAt DATETIME2(0);
  DECLARE @CaptchaVerifiedAt DATETIME2(0);
  DECLARE @OtpSendCount INT;

  SELECT
    @SessionExpiresAt = SessionExpiresAt,
    @CaptchaVerifiedAt = CaptchaVerifiedAt,
    @OtpSendCount = OtpSendCount
  FROM ${AUTH_SESSION_TABLE}
  WHERE SessionToken = @SessionToken;

  IF @SessionExpiresAt IS NULL OR @SessionExpiresAt <= @Now
  BEGIN
    SELECT N'session_expired' AS ResultCode, 0 AS RemainingSends;
    RETURN;
  END;

  IF @CaptchaVerifiedAt IS NULL
  BEGIN
    SELECT N'captcha_required' AS ResultCode, 0 AS RemainingSends;
    RETURN;
  END;

  IF ISNULL(@OtpSendCount, 0) >= @MaxSends
  BEGIN
    SELECT N'send_limit' AS ResultCode, 0 AS RemainingSends;
    RETURN;
  END;

  UPDATE ${AUTH_SESSION_TABLE}
  SET OtpHash = @OtpHash,
      OtpExpiresAt = @OtpExpiresAt,
      OtpAttempts = 0,
      OtpSendCount = ISNULL(OtpSendCount, 0) + 1,
      OtpLastSentAt = @SentAt,
      OtpVerifiedAt = NULL,
      CompletedAt = NULL,
      Status = N'otp_sent',
      UpdatedAt = @Now
  WHERE SessionToken = @SessionToken;

  SELECT TOP 1
    N'ok' AS ResultCode,
    OtpExpiresAt,
    OtpSendCount,
    (@MaxSends - OtpSendCount) AS RemainingSends,
    OtpLastSentAt
  FROM ${AUTH_SESSION_TABLE}
  WHERE SessionToken = @SessionToken;
END;

CREATE OR ALTER PROCEDURE dbo.spAuthVerifyOtp
  @SessionToken NVARCHAR(128),
  @OtpHash NVARCHAR(128),
  @MaxAttempts INT,
  @VerifiedAt DATETIME2(0),
  @CompletedAt DATETIME2(0),
  @SessionExpiresAt DATETIME2(0)
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @Now DATETIME2(0) = SYSUTCDATETIME();
  DECLARE @CurrentSessionExpiresAt DATETIME2(0);
  DECLARE @CaptchaVerifiedAt DATETIME2(0);
  DECLARE @StoredOtpHash NVARCHAR(128);
  DECLARE @OtpExpiresAt DATETIME2(0);
  DECLARE @OtpAttempts INT;
  DECLARE @NewAttempts INT;

  SELECT
    @CurrentSessionExpiresAt = SessionExpiresAt,
    @CaptchaVerifiedAt = CaptchaVerifiedAt,
    @StoredOtpHash = OtpHash,
    @OtpExpiresAt = OtpExpiresAt,
    @OtpAttempts = OtpAttempts
  FROM ${AUTH_SESSION_TABLE}
  WHERE SessionToken = @SessionToken;

  IF @CurrentSessionExpiresAt IS NULL OR @CurrentSessionExpiresAt <= @Now
  BEGIN
    SELECT N'session_expired' AS ResultCode, 0 AS AttemptsLeft;
    RETURN;
  END;

  IF @CaptchaVerifiedAt IS NULL
  BEGIN
    SELECT N'captcha_required' AS ResultCode, 0 AS AttemptsLeft;
    RETURN;
  END;

  IF @StoredOtpHash IS NULL OR @OtpExpiresAt IS NULL
  BEGIN
    SELECT N'otp_missing' AS ResultCode, 0 AS AttemptsLeft;
    RETURN;
  END;

  IF ISNULL(@OtpAttempts, 0) >= @MaxAttempts
  BEGIN
    SELECT N'otp_attempt_limit' AS ResultCode, 0 AS AttemptsLeft;
    RETURN;
  END;

  IF @OtpExpiresAt <= @Now
  BEGIN
    SELECT N'otp_expired' AS ResultCode, 0 AS AttemptsLeft, @OtpExpiresAt AS OtpExpiresAt;
    RETURN;
  END;

  IF @StoredOtpHash <> @OtpHash
  BEGIN
    SET @NewAttempts = ISNULL(@OtpAttempts, 0) + 1;

    UPDATE ${AUTH_SESSION_TABLE}
    SET OtpAttempts = @NewAttempts,
        UpdatedAt = @Now
    WHERE SessionToken = @SessionToken;

    IF @NewAttempts >= @MaxAttempts
    BEGIN
      SELECT N'otp_attempt_limit' AS ResultCode, 0 AS AttemptsLeft, @NewAttempts AS OtpAttempts;
      RETURN;
    END;

    SELECT N'invalid_otp' AS ResultCode, (@MaxAttempts - @NewAttempts) AS AttemptsLeft, @NewAttempts AS OtpAttempts;
    RETURN;
  END;

  UPDATE ${AUTH_SESSION_TABLE}
  SET OtpVerifiedAt = @VerifiedAt,
      CompletedAt = @CompletedAt,
      Status = N'completed',
      SessionExpiresAt = @SessionExpiresAt,
      UpdatedAt = @Now
  WHERE SessionToken = @SessionToken;

  SELECT N'ok' AS ResultCode, @VerifiedAt AS OtpVerifiedAt, 0 AS AttemptsLeft;
END;
`;

const AUTH_PROCEDURE_BATCHES = AUTH_PROCEDURES_BATCH
  .split(/\n(?=CREATE OR ALTER PROCEDURE )/g)
  .map((statement) => statement.trim())
  .filter(Boolean);

const ensureAuthSqlReady = async () => {
  if (!authBootstrapPromise) {
    authBootstrapPromise = (async () => {
      await bootstrapAuthDatabaseIfNeeded();
      await initSqlServer();
      const pool = await getPool();
      await pool.request().batch(AUTH_SCHEMA_BATCH);
      for (const procedureBatch of AUTH_PROCEDURE_BATCHES) {
        await pool.request().batch(procedureBatch);
      }
      return true;
    })().catch((error) => {
      authBootstrapPromise = null;
      throw error;
    });
  }

  return authBootstrapPromise;
};

const syncUserAuthRecord = async (userDocument) => {
  if (!userDocument) {
    return null;
  }

  await ensureAuthSqlReady();

  const sql = getSqlClient();
  const user = userDocument.toObject ? userDocument.toObject() : userDocument;
  const result = await executeStoredProcedure('dbo.spAuthUpsertUserMirror', [
    { name: 'MongoUserId', type: sql.NVarChar(64), value: String(user._id) },
    { name: 'FullName', type: sql.NVarChar(200), value: String(user.fullName || '') },
    { name: 'Email', type: sql.NVarChar(320), value: String(user.email || '').trim().toLowerCase() },
    { name: 'PasswordHash', type: sql.NVarChar(255), value: String(user.password || '') },
    { name: 'RoleName', type: sql.NVarChar(50), value: String(user.role || 'student') },
    { name: 'Phone', type: sql.NVarChar(40), value: user.phone ? String(user.phone) : null },
    { name: 'IsActive', type: sql.Bit, value: user.isActive !== false },
    { name: 'LastLoginAt', type: sql.DateTime2(0), value: user.lastLogin || null },
  ]);

  return getFirstRecord(result);
};

const syncUserAuthByEmail = async (email) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    return null;
  }

  return syncUserAuthRecord(user);
};

const syncUserAuthById = async (mongoUserId) => {
  if (!mongoUserId) {
    return null;
  }

  const user = await User.findById(mongoUserId);
  if (!user) {
    return null;
  }

  return syncUserAuthRecord(user);
};

const loginLookup = async (email) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  await syncUserAuthByEmail(normalizedEmail);
  await ensureAuthSqlReady();

  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spAuthLoginLookup', [
    { name: 'Email', type: sql.NVarChar(320), value: normalizedEmail },
  ]);

  return getFirstRecord(result);
};

const startLoginSession = async ({
  sessionToken,
  mongoUserId,
  email,
  ipAddress,
  userAgent,
  status,
  sessionExpiresAt,
  captchaHash,
  captchaExpiresAt,
}) => {
  await ensureAuthSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spAuthStartLoginSession', [
    { name: 'SessionToken', type: sql.NVarChar(128), value: sessionToken },
    { name: 'MongoUserId', type: sql.NVarChar(64), value: String(mongoUserId) },
    { name: 'Email', type: sql.NVarChar(320), value: String(email || '').trim().toLowerCase() },
    { name: 'IpAddress', type: sql.NVarChar(64), value: ipAddress || null },
    { name: 'UserAgent', type: sql.NVarChar(512), value: userAgent || null },
    { name: 'Status', type: sql.NVarChar(50), value: status },
    { name: 'SessionExpiresAt', type: sql.DateTime2(0), value: sessionExpiresAt },
    { name: 'CaptchaHash', type: sql.NVarChar(128), value: captchaHash },
    { name: 'CaptchaExpiresAt', type: sql.DateTime2(0), value: captchaExpiresAt },
  ]);

  return mapSessionRow(getFirstRecord(result));
};

const getActiveLoginSession = async (sessionToken) => {
  const normalizedToken = String(sessionToken || '').trim();
  if (!normalizedToken || normalizedToken.length < 40) {
    return null;
  }

  await ensureAuthSqlReady();

  const sql = getSqlClient();
  const result = await executeQuery(
    `SELECT TOP 1 *
     FROM ${AUTH_SESSION_TABLE}
     WHERE SessionToken = @sessionToken`,
    [{ name: 'sessionToken', type: sql.NVarChar(128), value: normalizedToken }]
  );

  const session = mapSessionRow(getFirstRecord(result));
  if (!session) {
    return null;
  }

  if (session.sessionExpiresAt && session.sessionExpiresAt.getTime() <= Date.now()) {
    await executeQuery(
      `DELETE FROM ${AUTH_SESSION_TABLE} WHERE SessionToken = @sessionToken`,
      [{ name: 'sessionToken', type: sql.NVarChar(128), value: normalizedToken }]
    );
    return null;
  }

  return session;
};

const refreshCaptchaForSession = async ({ sessionToken, captchaHash, captchaExpiresAt, maxRefresh }) => {
  await ensureAuthSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spAuthRefreshCaptcha', [
    { name: 'SessionToken', type: sql.NVarChar(128), value: String(sessionToken || '').trim() },
    { name: 'CaptchaHash', type: sql.NVarChar(128), value: captchaHash },
    { name: 'CaptchaExpiresAt', type: sql.DateTime2(0), value: captchaExpiresAt },
    { name: 'MaxRefresh', type: sql.Int, value: Number(maxRefresh) },
  ]);

  return getFirstRecord(result);
};

const verifyCaptchaForSession = async ({ sessionToken, captchaHash, maxAttempts, verifiedAt }) => {
  await ensureAuthSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spAuthVerifyCaptcha', [
    { name: 'SessionToken', type: sql.NVarChar(128), value: String(sessionToken || '').trim() },
    { name: 'CaptchaHash', type: sql.NVarChar(128), value: captchaHash },
    { name: 'MaxAttempts', type: sql.Int, value: Number(maxAttempts) },
    { name: 'VerifiedAt', type: sql.DateTime2(0), value: verifiedAt },
  ]);

  return getFirstRecord(result);
};

const checkOtpResendCooldown = async ({ sessionToken, cooldownMs, maxSends }) => {
  await ensureAuthSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spAuthCheckOtpResendCooldown', [
    { name: 'SessionToken', type: sql.NVarChar(128), value: String(sessionToken || '').trim() },
    { name: 'CooldownMs', type: sql.BigInt, value: Number(cooldownMs) },
    { name: 'MaxSends', type: sql.Int, value: Number(maxSends) },
  ]);

  return getFirstRecord(result);
};

const createOtpForSession = async ({ sessionToken, otpHash, otpExpiresAt, sentAt, maxSends }) => {
  await ensureAuthSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spAuthCreateOtp', [
    { name: 'SessionToken', type: sql.NVarChar(128), value: String(sessionToken || '').trim() },
    { name: 'OtpHash', type: sql.NVarChar(128), value: otpHash },
    { name: 'OtpExpiresAt', type: sql.DateTime2(0), value: otpExpiresAt },
    { name: 'SentAt', type: sql.DateTime2(0), value: sentAt },
    { name: 'MaxSends', type: sql.Int, value: Number(maxSends) },
  ]);

  return getFirstRecord(result);
};

const verifyOtpForSession = async ({
  sessionToken,
  otpHash,
  maxAttempts,
  verifiedAt,
  completedAt,
  sessionExpiresAt,
}) => {
  await ensureAuthSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spAuthVerifyOtp', [
    { name: 'SessionToken', type: sql.NVarChar(128), value: String(sessionToken || '').trim() },
    { name: 'OtpHash', type: sql.NVarChar(128), value: otpHash },
    { name: 'MaxAttempts', type: sql.Int, value: Number(maxAttempts) },
    { name: 'VerifiedAt', type: sql.DateTime2(0), value: verifiedAt },
    { name: 'CompletedAt', type: sql.DateTime2(0), value: completedAt },
    { name: 'SessionExpiresAt', type: sql.DateTime2(0), value: sessionExpiresAt },
  ]);

  return getFirstRecord(result);
};

module.exports = {
  ensureAuthSqlReady,
  syncUserAuthRecord,
  syncUserAuthByEmail,
  syncUserAuthById,
  loginLookup,
  startLoginSession,
  getActiveLoginSession,
  refreshCaptchaForSession,
  verifyCaptchaForSession,
  checkOtpResendCooldown,
  createOtpForSession,
  verifyOtpForSession,
};
