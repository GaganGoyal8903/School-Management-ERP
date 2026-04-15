const {
  getSqlClient,
  executeQuery,
  executeStoredProcedure,
  getPool,
  executeInTransaction,
} = require('../config/sqlServer');
const Student = require('../models/Student');
const User = require('../models/User');
const { ensureAuthSqlReady, syncUserAuthRecord } = require('./authSqlService');

const STUDENT_TABLE = 'dbo.SqlStudents';
const STUDENT_PORTAL_PROFILE_TABLE = 'dbo.StudentPortalProfiles';
const STUDENT_SYNC_TTL_MS = 30000;
let studentBootstrapPromise = null;
let studentSyncPromise = null;
let lastStudentSyncAt = 0;

const toNullableString = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
};

const normalizeAddress = (value) => {
  if (!value || typeof value !== 'object') {
    return {
      street: null,
      line2: null,
      city: null,
      state: null,
      pincode: null,
      country: null,
    };
  }

  return {
    street: toNullableString(value.street || value.addressLine1),
    line2: toNullableString(value.line2 || value.addressLine2),
    city: toNullableString(value.city),
    state: toNullableString(value.state),
    pincode: toNullableString(value.pincode || value.postalCode || value.zipCode),
    country: toNullableString(value.country),
  };
};

const toNullableDate = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const splitFullName = (fullName) => {
  const normalizedFullName = String(fullName || '').trim();
  if (!normalizedFullName) {
    return { firstName: '', lastName: null, fullName: null };
  }

  const [firstName, ...rest] = normalizedFullName.split(/\s+/);
  return {
    firstName,
    lastName: rest.length ? rest.join(' ') : null,
    fullName: normalizedFullName,
  };
};

const escapeSqlLiteral = (value = '') => String(value).replace(/'/g, "''");

const toSqlStudentPayload = (studentDocument, userDocument = null) => {
  const student = studentDocument?.toObject ? studentDocument.toObject() : studentDocument;
  const user = userDocument?.toObject ? userDocument.toObject() : userDocument;
  const address = normalizeAddress(student?.address);

  return {
    mongoStudentId: String(student?._id || ''),
    mongoUserId: student?.userId ? String(student.userId) : user?._id ? String(user._id) : null,
    fullName: toNullableString(student?.fullName),
    email: toNullableString(student?.email || user?.email),
    phone: toNullableString(student?.phone || user?.phone),
    className: toNullableString(student?.class),
    sectionName: toNullableString(student?.section) || 'A',
    rollNumber: toNullableString(student?.rollNumber),
    dateOfBirth: student?.dateOfBirth || null,
    gender: toNullableString(student?.gender),
    addressStreet: address.street,
    addressCity: address.city,
    addressState: address.state,
    addressPincode: address.pincode,
    guardianName: toNullableString(student?.guardianName),
    guardianPhone: toNullableString(student?.guardianPhone),
    guardianRelation: toNullableString(student?.guardianRelation),
    bloodGroup: toNullableString(student?.bloodGroup),
    admissionDate: student?.admissionDate || null,
    isActive: student?.isActive !== false,
    createdAt: student?.createdAt || new Date(),
    updatedAt: student?.updatedAt || new Date(),
  };
};

const mapStudentRow = (row) => {
  if (!row) {
    return null;
  }

  const isActive = row.IsActive === true || row.IsActive === 1;

  return {
    _id: row.MongoStudentId,
    studentId: row.MongoStudentId,
    userId: row.MongoUserId
      ? {
          _id: row.MongoUserId,
          email: row.Email || null,
          role: 'student',
        }
      : null,
    fullName: row.FullName,
    email: row.Email || null,
    phone: row.Phone || null,
    class: row.ClassName,
    classId: row.ClassName,
    section: row.SectionName,
    sectionId: row.SectionName,
    rollNumber: row.RollNumber,
    dateOfBirth: row.DateOfBirth ? new Date(row.DateOfBirth) : null,
    gender: row.Gender || null,
    address: {
      street: row.AddressStreet || '',
      city: row.AddressCity || '',
      state: row.AddressState || '',
      pincode: row.AddressPincode || '',
    },
    guardianName: row.GuardianName || '',
    guardianPhone: row.GuardianPhone || '',
    guardianRelation: row.GuardianRelation || '',
    bloodGroup: row.BloodGroup || '',
    admissionDate: row.AdmissionDate ? new Date(row.AdmissionDate) : null,
    isActive,
    createdAt: row.CreatedAt ? new Date(row.CreatedAt) : null,
    updatedAt: row.UpdatedAt ? new Date(row.UpdatedAt) : null,
  };
};

const mapStudentPortalProfileRow = (row) => {
  if (!row) {
    return null;
  }

  const portalProfileId = Number(row.StudentPortalProfileId);
  const numericUserId = Number(row.UserId);
  const portalRecordId = Number.isInteger(portalProfileId) && portalProfileId > 0
    ? `portal-${portalProfileId}`
    : `portal-${row.Email || 'student'}`;
  const isActive = row.IsActive === true || row.IsActive === 1;

  return {
    _id: portalRecordId,
    id: portalRecordId,
    studentId: null,
    portalProfileId: Number.isInteger(portalProfileId) && portalProfileId > 0 ? portalProfileId : null,
    source: 'portal_profile',
    userId: Number.isInteger(numericUserId) && numericUserId > 0
      ? {
          _id: String(numericUserId),
          email: row.Email || null,
          role: 'student',
        }
      : row.MongoUserId
        ? {
            _id: row.MongoUserId,
            email: row.Email || null,
            role: 'student',
          }
        : null,
    admissionNumber: row.AdmissionNumber || null,
    rollNumber: row.RollNumber || null,
    fullName: row.FullName || null,
    gender: row.Gender || null,
    dateOfBirth: row.DateOfBirth ? new Date(row.DateOfBirth) : null,
    admissionDate: row.AdmissionDate ? new Date(row.AdmissionDate) : null,
    bloodGroup: row.BloodGroup || null,
    phone: row.Phone || null,
    email: row.Email || null,
    class: row.ClassName || null,
    className: row.ClassName || null,
    classId: row.ClassName || null,
    section: row.SectionName || null,
    sectionName: row.SectionName || null,
    sectionId: row.SectionName || null,
    address: {},
    parentName: row.GuardianName || null,
    parentPhone: row.GuardianPhone || null,
    guardianName: row.GuardianName || '',
    guardianPhone: row.GuardianPhone || '',
    guardianRelation: row.GuardianRelation || '',
    isActive,
    profileNote: row.Notes || null,
    hasLinkedStudentRecord: row.HasLinkedStudentRecord === true || row.HasLinkedStudentRecord === 1,
    linkedStudentId: normalizeStudentNumericId(row.LinkedStudentId),
    createdAt: row.CreatedAt ? new Date(row.CreatedAt) : null,
    updatedAt: row.UpdatedAt ? new Date(row.UpdatedAt) : null,
  };
};

const STUDENT_SCHEMA_BATCH = `
IF OBJECT_ID(N'${STUDENT_TABLE}', N'U') IS NULL
BEGIN
  CREATE TABLE ${STUDENT_TABLE} (
    SqlStudentId INT IDENTITY(1,1) PRIMARY KEY,
    MongoStudentId NVARCHAR(64) NOT NULL,
    MongoUserId NVARCHAR(64) NULL,
    FullName NVARCHAR(200) NOT NULL,
    Email NVARCHAR(320) NULL,
    Phone NVARCHAR(40) NULL,
    ClassName NVARCHAR(100) NOT NULL,
    SectionName NVARCHAR(50) NOT NULL,
    RollNumber NVARCHAR(100) NOT NULL,
    DateOfBirth DATE NULL,
    Gender NVARCHAR(20) NULL,
    AddressStreet NVARCHAR(255) NULL,
    AddressCity NVARCHAR(120) NULL,
    AddressState NVARCHAR(120) NULL,
    AddressPincode NVARCHAR(20) NULL,
    GuardianName NVARCHAR(200) NULL,
    GuardianPhone NVARCHAR(40) NULL,
    GuardianRelation NVARCHAR(50) NULL,
    BloodGroup NVARCHAR(20) NULL,
    AdmissionDate DATE NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_SqlStudents_IsActive DEFAULT (1),
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlStudents_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlStudents_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SqlStudents_MongoStudentId' AND object_id = OBJECT_ID(N'${STUDENT_TABLE}'))
BEGIN
  CREATE UNIQUE INDEX UX_SqlStudents_MongoStudentId ON ${STUDENT_TABLE}(MongoStudentId);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SqlStudents_RollNumber' AND object_id = OBJECT_ID(N'${STUDENT_TABLE}'))
BEGIN
  CREATE UNIQUE INDEX UX_SqlStudents_RollNumber ON ${STUDENT_TABLE}(RollNumber);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SqlStudents_ClassSection' AND object_id = OBJECT_ID(N'${STUDENT_TABLE}'))
BEGIN
  CREATE INDEX IX_SqlStudents_ClassSection ON ${STUDENT_TABLE}(ClassName, SectionName, IsActive);
END;

IF OBJECT_ID(N'${STUDENT_PORTAL_PROFILE_TABLE}', N'U') IS NULL
BEGIN
  CREATE TABLE ${STUDENT_PORTAL_PROFILE_TABLE} (
    StudentPortalProfileId INT IDENTITY(1,1) PRIMARY KEY,
    UserId INT NULL,
    MongoUserId NVARCHAR(64) NULL,
    Email NVARCHAR(320) NOT NULL,
    FullName NVARCHAR(200) NOT NULL,
    Phone NVARCHAR(40) NULL,
    AdmissionNumber NVARCHAR(50) NULL,
    RollNumber NVARCHAR(100) NULL,
    ClassName NVARCHAR(100) NULL,
    SectionName NVARCHAR(50) NULL,
    DateOfBirth DATE NULL,
    Gender NVARCHAR(20) NULL,
    GuardianName NVARCHAR(200) NULL,
    GuardianPhone NVARCHAR(40) NULL,
    GuardianRelation NVARCHAR(50) NULL,
    BloodGroup NVARCHAR(20) NULL,
    AdmissionDate DATE NULL,
    Notes NVARCHAR(500) NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_StudentPortalProfiles_IsActive DEFAULT (1),
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_StudentPortalProfiles_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_StudentPortalProfiles_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_StudentPortalProfiles_UserId' AND object_id = OBJECT_ID(N'${STUDENT_PORTAL_PROFILE_TABLE}'))
BEGIN
  CREATE UNIQUE INDEX UX_StudentPortalProfiles_UserId
  ON ${STUDENT_PORTAL_PROFILE_TABLE}(UserId)
  WHERE UserId IS NOT NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_StudentPortalProfiles_MongoUserId' AND object_id = OBJECT_ID(N'${STUDENT_PORTAL_PROFILE_TABLE}'))
BEGIN
  CREATE UNIQUE INDEX UX_StudentPortalProfiles_MongoUserId
  ON ${STUDENT_PORTAL_PROFILE_TABLE}(MongoUserId)
  WHERE MongoUserId IS NOT NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_StudentPortalProfiles_Email' AND object_id = OBJECT_ID(N'${STUDENT_PORTAL_PROFILE_TABLE}'))
BEGIN
  CREATE INDEX IX_StudentPortalProfiles_Email ON ${STUDENT_PORTAL_PROFILE_TABLE}(Email, UpdatedAt DESC);
END;
`;

const STUDENT_PROCEDURES_BATCH = `
CREATE OR ALTER PROCEDURE dbo.spStudentUpsertMirror
  @MongoStudentId NVARCHAR(64),
  @MongoUserId NVARCHAR(64) = NULL,
  @FullName NVARCHAR(200),
  @Email NVARCHAR(320) = NULL,
  @Phone NVARCHAR(40) = NULL,
  @ClassName NVARCHAR(100),
  @SectionName NVARCHAR(50),
  @RollNumber NVARCHAR(100),
  @DateOfBirth DATE = NULL,
  @Gender NVARCHAR(20) = NULL,
  @AddressStreet NVARCHAR(255) = NULL,
  @AddressCity NVARCHAR(120) = NULL,
  @AddressState NVARCHAR(120) = NULL,
  @AddressPincode NVARCHAR(20) = NULL,
  @GuardianName NVARCHAR(200) = NULL,
  @GuardianPhone NVARCHAR(40) = NULL,
  @GuardianRelation NVARCHAR(50) = NULL,
  @BloodGroup NVARCHAR(20) = NULL,
  @AdmissionDate DATE = NULL,
  @IsActive BIT,
  @CreatedAt DATETIME2(0),
  @UpdatedAt DATETIME2(0)
AS
BEGIN
  SET NOCOUNT ON;

  IF EXISTS (SELECT 1 FROM ${STUDENT_TABLE} WHERE MongoStudentId = @MongoStudentId)
  BEGIN
    UPDATE ${STUDENT_TABLE}
    SET MongoUserId = @MongoUserId,
        FullName = @FullName,
        Email = @Email,
        Phone = @Phone,
        ClassName = @ClassName,
        SectionName = @SectionName,
        RollNumber = @RollNumber,
        DateOfBirth = @DateOfBirth,
        Gender = @Gender,
        AddressStreet = @AddressStreet,
        AddressCity = @AddressCity,
        AddressState = @AddressState,
        AddressPincode = @AddressPincode,
        GuardianName = @GuardianName,
        GuardianPhone = @GuardianPhone,
        GuardianRelation = @GuardianRelation,
        BloodGroup = @BloodGroup,
        AdmissionDate = @AdmissionDate,
        IsActive = @IsActive,
        UpdatedAt = @UpdatedAt
    WHERE MongoStudentId = @MongoStudentId;
  END
  ELSE
  BEGIN
    INSERT INTO ${STUDENT_TABLE} (
      MongoStudentId,
      MongoUserId,
      FullName,
      Email,
      Phone,
      ClassName,
      SectionName,
      RollNumber,
      DateOfBirth,
      Gender,
      AddressStreet,
      AddressCity,
      AddressState,
      AddressPincode,
      GuardianName,
      GuardianPhone,
      GuardianRelation,
      BloodGroup,
      AdmissionDate,
      IsActive,
      CreatedAt,
      UpdatedAt
    )
    VALUES (
      @MongoStudentId,
      @MongoUserId,
      @FullName,
      @Email,
      @Phone,
      @ClassName,
      @SectionName,
      @RollNumber,
      @DateOfBirth,
      @Gender,
      @AddressStreet,
      @AddressCity,
      @AddressState,
      @AddressPincode,
      @GuardianName,
      @GuardianPhone,
      @GuardianRelation,
      @BloodGroup,
      @AdmissionDate,
      @IsActive,
      @CreatedAt,
      @UpdatedAt
    );
  END;

  SELECT TOP 1 * FROM ${STUDENT_TABLE} WHERE MongoStudentId = @MongoStudentId;
END;

CREATE OR ALTER PROCEDURE dbo.spStudentList
  @Page INT = 1,
  @Limit INT = 10,
  @Search NVARCHAR(200) = NULL,
  @ClassName NVARCHAR(100) = NULL,
  @SectionName NVARCHAR(50) = NULL,
  @SortBy NVARCHAR(50) = N'createdAt',
  @SortOrder NVARCHAR(4) = N'desc'
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @SafeSortBy NVARCHAR(50) =
    CASE LOWER(@SortBy)
      WHEN N'fullname' THEN N'FullName'
      WHEN N'rollnumber' THEN N'RollNumber'
      WHEN N'email' THEN N'Email'
      WHEN N'class' THEN N'ClassName'
      WHEN N'section' THEN N'SectionName'
      WHEN N'updatedat' THEN N'UpdatedAt'
      ELSE N'CreatedAt'
    END;

  DECLARE @SafeSortOrder NVARCHAR(4) =
    CASE WHEN LOWER(@SortOrder) = N'asc' THEN N'ASC' ELSE N'DESC' END;

  DECLARE @Offset INT = CASE WHEN ISNULL(@Page, 1) <= 1 THEN 0 ELSE (@Page - 1) * ISNULL(@Limit, 10) END;
  DECLARE @Sql NVARCHAR(MAX) = N'
    ;WITH Filtered AS (
      SELECT *
      FROM ${STUDENT_TABLE}
      WHERE (@Search IS NULL OR FullName LIKE N''%'' + @Search + N''%'' OR RollNumber LIKE N''%'' + @Search + N''%'' OR Email LIKE N''%'' + @Search + N''%'')
        AND (@ClassName IS NULL OR ClassName = @ClassName)
        AND (@SectionName IS NULL OR SectionName = @SectionName)
    )
    SELECT *,
           COUNT(1) OVER() AS TotalCount
    FROM Filtered
    ORDER BY ' + QUOTENAME(@SafeSortBy) + N' ' + @SafeSortOrder + N'
    OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;';

  EXEC sp_executesql
    @Sql,
    N'@Search NVARCHAR(200), @ClassName NVARCHAR(100), @SectionName NVARCHAR(50), @Offset INT, @Limit INT',
    @Search,
    @ClassName,
    @SectionName,
    @Offset,
    @Limit;
END;

CREATE OR ALTER PROCEDURE dbo.spStudentGetById
  @MongoStudentId NVARCHAR(64)
AS
BEGIN
  SET NOCOUNT ON;
  SELECT TOP 1 * FROM ${STUDENT_TABLE} WHERE MongoStudentId = @MongoStudentId;
END;

CREATE OR ALTER PROCEDURE dbo.spStudentCreate
  @MongoStudentId NVARCHAR(64),
  @MongoUserId NVARCHAR(64) = NULL,
  @FullName NVARCHAR(200),
  @Email NVARCHAR(320) = NULL,
  @Phone NVARCHAR(40) = NULL,
  @ClassName NVARCHAR(100),
  @SectionName NVARCHAR(50),
  @RollNumber NVARCHAR(100),
  @DateOfBirth DATE = NULL,
  @Gender NVARCHAR(20) = NULL,
  @AddressStreet NVARCHAR(255) = NULL,
  @AddressCity NVARCHAR(120) = NULL,
  @AddressState NVARCHAR(120) = NULL,
  @AddressPincode NVARCHAR(20) = NULL,
  @GuardianName NVARCHAR(200) = NULL,
  @GuardianPhone NVARCHAR(40) = NULL,
  @GuardianRelation NVARCHAR(50) = NULL,
  @BloodGroup NVARCHAR(20) = NULL,
  @AdmissionDate DATE = NULL,
  @IsActive BIT,
  @CreatedAt DATETIME2(0),
  @UpdatedAt DATETIME2(0)
AS
BEGIN
  SET NOCOUNT ON;
  DELETE FROM ${STUDENT_TABLE}
  WHERE MongoStudentId = @MongoStudentId
     OR RollNumber = @RollNumber
     OR (@MongoUserId IS NOT NULL AND MongoUserId = @MongoUserId);

  INSERT INTO ${STUDENT_TABLE} (
    MongoStudentId,
    MongoUserId,
    FullName,
    Email,
    Phone,
    ClassName,
    SectionName,
    RollNumber,
    DateOfBirth,
    Gender,
    AddressStreet,
    AddressCity,
    AddressState,
    AddressPincode,
    GuardianName,
    GuardianPhone,
    GuardianRelation,
    BloodGroup,
    AdmissionDate,
    IsActive,
    CreatedAt,
    UpdatedAt
  )
  VALUES (
    @MongoStudentId,
    @MongoUserId,
    @FullName,
    @Email,
    @Phone,
    @ClassName,
    @SectionName,
    @RollNumber,
    @DateOfBirth,
    @Gender,
    @AddressStreet,
    @AddressCity,
    @AddressState,
    @AddressPincode,
    @GuardianName,
    @GuardianPhone,
    @GuardianRelation,
    @BloodGroup,
    @AdmissionDate,
    @IsActive,
    @CreatedAt,
    @UpdatedAt
  );

  SELECT TOP 1 * FROM ${STUDENT_TABLE} WHERE MongoStudentId = @MongoStudentId;
END;

CREATE OR ALTER PROCEDURE dbo.spStudentUpdate
  @MongoStudentId NVARCHAR(64),
  @MongoUserId NVARCHAR(64) = NULL,
  @FullName NVARCHAR(200),
  @Email NVARCHAR(320) = NULL,
  @Phone NVARCHAR(40) = NULL,
  @ClassName NVARCHAR(100),
  @SectionName NVARCHAR(50),
  @RollNumber NVARCHAR(100),
  @DateOfBirth DATE = NULL,
  @Gender NVARCHAR(20) = NULL,
  @AddressStreet NVARCHAR(255) = NULL,
  @AddressCity NVARCHAR(120) = NULL,
  @AddressState NVARCHAR(120) = NULL,
  @AddressPincode NVARCHAR(20) = NULL,
  @GuardianName NVARCHAR(200) = NULL,
  @GuardianPhone NVARCHAR(40) = NULL,
  @GuardianRelation NVARCHAR(50) = NULL,
  @BloodGroup NVARCHAR(20) = NULL,
  @AdmissionDate DATE = NULL,
  @IsActive BIT,
  @UpdatedAt DATETIME2(0)
AS
BEGIN
  SET NOCOUNT ON;

  UPDATE ${STUDENT_TABLE}
  SET MongoUserId = @MongoUserId,
      FullName = @FullName,
      Email = @Email,
      Phone = @Phone,
      ClassName = @ClassName,
      SectionName = @SectionName,
      RollNumber = @RollNumber,
      DateOfBirth = @DateOfBirth,
      Gender = @Gender,
      AddressStreet = @AddressStreet,
      AddressCity = @AddressCity,
      AddressState = @AddressState,
      AddressPincode = @AddressPincode,
      GuardianName = @GuardianName,
      GuardianPhone = @GuardianPhone,
      GuardianRelation = @GuardianRelation,
      BloodGroup = @BloodGroup,
      AdmissionDate = @AdmissionDate,
      IsActive = @IsActive,
      UpdatedAt = @UpdatedAt
  WHERE MongoStudentId = @MongoStudentId;

  SELECT TOP 1 * FROM ${STUDENT_TABLE} WHERE MongoStudentId = @MongoStudentId;
END;

CREATE OR ALTER PROCEDURE dbo.spStudentDelete
  @MongoStudentId NVARCHAR(64)
AS
BEGIN
  SET NOCOUNT ON;
  DELETE FROM ${STUDENT_TABLE} WHERE MongoStudentId = @MongoStudentId;
  SELECT N'ok' AS ResultCode;
END;

CREATE OR ALTER PROCEDURE dbo.spStudentGetFullProfile
  @MongoStudentId NVARCHAR(64)
AS
BEGIN
  SET NOCOUNT ON;

  SELECT TOP 1 * FROM ${STUDENT_TABLE} WHERE MongoStudentId = @MongoStudentId;

  SELECT TOP 1
    MongoStudentId AS StudentId,
    GuardianName,
    GuardianPhone,
    GuardianRelation,
    AddressStreet,
    AddressCity,
    AddressState,
    AddressPincode
  FROM ${STUDENT_TABLE}
  WHERE MongoStudentId = @MongoStudentId
    AND (GuardianName IS NOT NULL OR GuardianPhone IS NOT NULL);

  SELECT TOP 1
    MongoStudentId AS StudentId,
    ClassName,
    SectionName,
    IsActive
  FROM ${STUDENT_TABLE}
  WHERE MongoStudentId = @MongoStudentId;
END;

CREATE OR ALTER PROCEDURE dbo.spStudentGetCount
  @OnlyActive BIT = 1
AS
BEGIN
  SET NOCOUNT ON;
  SELECT COUNT(1) AS TotalCount
  FROM ${STUDENT_TABLE}
  WHERE (@OnlyActive = 0 OR IsActive = 1);
END;

CREATE OR ALTER PROCEDURE dbo.spStudentListByClass
  @ClassName NVARCHAR(100)
AS
BEGIN
  SET NOCOUNT ON;
  SELECT
    MongoStudentId,
    FullName,
    RollNumber,
    SectionName,
    Email,
    Phone,
    GuardianName,
    GuardianPhone,
    IsActive
  FROM ${STUDENT_TABLE}
  WHERE ClassName = @ClassName
  ORDER BY FullName ASC;
END;

CREATE OR ALTER PROCEDURE dbo.spStudentPortalProfileUpsert
  @UserId INT = NULL,
  @MongoUserId NVARCHAR(64) = NULL,
  @Email NVARCHAR(320),
  @FullName NVARCHAR(200),
  @Phone NVARCHAR(40) = NULL,
  @AdmissionNumber NVARCHAR(50) = NULL,
  @RollNumber NVARCHAR(100) = NULL,
  @ClassName NVARCHAR(100) = NULL,
  @SectionName NVARCHAR(50) = NULL,
  @DateOfBirth DATE = NULL,
  @Gender NVARCHAR(20) = NULL,
  @GuardianName NVARCHAR(200) = NULL,
  @GuardianPhone NVARCHAR(40) = NULL,
  @GuardianRelation NVARCHAR(50) = NULL,
  @BloodGroup NVARCHAR(20) = NULL,
  @AdmissionDate DATE = NULL,
  @Notes NVARCHAR(500) = NULL,
  @IsActive BIT = 1
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @ExistingId INT = NULL;

  IF @FullName IS NULL OR LEN(LTRIM(RTRIM(@FullName))) = 0
  BEGIN
    SET @FullName = @Email;
  END;

  SELECT TOP 1 @ExistingId = StudentPortalProfileId
  FROM ${STUDENT_PORTAL_PROFILE_TABLE}
  WHERE (@UserId IS NOT NULL AND UserId = @UserId)
     OR (@MongoUserId IS NOT NULL AND MongoUserId = @MongoUserId)
     OR LOWER(LTRIM(RTRIM(Email))) = LOWER(LTRIM(RTRIM(@Email)))
  ORDER BY UpdatedAt DESC, StudentPortalProfileId DESC;

  IF @ExistingId IS NULL
  BEGIN
    INSERT INTO ${STUDENT_PORTAL_PROFILE_TABLE} (
      UserId,
      MongoUserId,
      Email,
      FullName,
      Phone,
      AdmissionNumber,
      RollNumber,
      ClassName,
      SectionName,
      DateOfBirth,
      Gender,
      GuardianName,
      GuardianPhone,
      GuardianRelation,
      BloodGroup,
      AdmissionDate,
      Notes,
      IsActive,
      CreatedAt,
      UpdatedAt
    )
    VALUES (
      @UserId,
      @MongoUserId,
      @Email,
      @FullName,
      @Phone,
      @AdmissionNumber,
      @RollNumber,
      @ClassName,
      @SectionName,
      @DateOfBirth,
      @Gender,
      @GuardianName,
      @GuardianPhone,
      @GuardianRelation,
      @BloodGroup,
      @AdmissionDate,
      COALESCE(NULLIF(LTRIM(RTRIM(@Notes)), N''), N'This portal profile was generated from the student login account because no linked student master record exists yet.'),
      ISNULL(@IsActive, 1),
      SYSUTCDATETIME(),
      SYSUTCDATETIME()
    );

    SET @ExistingId = SCOPE_IDENTITY();
  END
  ELSE
  BEGIN
    UPDATE ${STUDENT_PORTAL_PROFILE_TABLE}
    SET UserId = COALESCE(@UserId, UserId),
        MongoUserId = COALESCE(@MongoUserId, MongoUserId),
        Email = COALESCE(@Email, Email),
        FullName = COALESCE(NULLIF(LTRIM(RTRIM(@FullName)), N''), FullName),
        Phone = COALESCE(NULLIF(LTRIM(RTRIM(@Phone)), N''), Phone),
        AdmissionNumber = COALESCE(NULLIF(LTRIM(RTRIM(@AdmissionNumber)), N''), AdmissionNumber),
        RollNumber = COALESCE(NULLIF(LTRIM(RTRIM(@RollNumber)), N''), RollNumber),
        ClassName = COALESCE(NULLIF(LTRIM(RTRIM(@ClassName)), N''), ClassName),
        SectionName = COALESCE(NULLIF(LTRIM(RTRIM(@SectionName)), N''), SectionName),
        DateOfBirth = COALESCE(@DateOfBirth, DateOfBirth),
        Gender = COALESCE(NULLIF(LTRIM(RTRIM(@Gender)), N''), Gender),
        GuardianName = COALESCE(NULLIF(LTRIM(RTRIM(@GuardianName)), N''), GuardianName),
        GuardianPhone = COALESCE(NULLIF(LTRIM(RTRIM(@GuardianPhone)), N''), GuardianPhone),
        GuardianRelation = COALESCE(NULLIF(LTRIM(RTRIM(@GuardianRelation)), N''), GuardianRelation),
        BloodGroup = COALESCE(NULLIF(LTRIM(RTRIM(@BloodGroup)), N''), BloodGroup),
        AdmissionDate = COALESCE(@AdmissionDate, AdmissionDate),
        Notes = COALESCE(NULLIF(LTRIM(RTRIM(@Notes)), N''), Notes),
        IsActive = COALESCE(@IsActive, IsActive),
        UpdatedAt = SYSUTCDATETIME()
    WHERE StudentPortalProfileId = @ExistingId;
  END;

  SELECT TOP 1 *
  FROM ${STUDENT_PORTAL_PROFILE_TABLE}
  WHERE StudentPortalProfileId = @ExistingId;
END;

CREATE OR ALTER PROCEDURE dbo.spStudentPortalProfileGetByAuthUser
  @UserId INT = NULL,
  @MongoUserId NVARCHAR(64) = NULL,
  @Email NVARCHAR(320) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  SELECT TOP 1 *
  FROM ${STUDENT_PORTAL_PROFILE_TABLE}
  WHERE (@UserId IS NOT NULL AND UserId = @UserId)
     OR (@MongoUserId IS NOT NULL AND MongoUserId = @MongoUserId)
     OR (@Email IS NOT NULL AND LOWER(LTRIM(RTRIM(Email))) = LOWER(LTRIM(RTRIM(@Email))))
  ORDER BY
    CASE
      WHEN @UserId IS NOT NULL AND UserId = @UserId THEN 0
      WHEN @MongoUserId IS NOT NULL AND MongoUserId = @MongoUserId THEN 1
      ELSE 2
    END,
    UpdatedAt DESC,
    StudentPortalProfileId DESC;
END;
`;

const STUDENT_PROCEDURE_BATCHES = STUDENT_PROCEDURES_BATCH
  .split(/\n(?=CREATE OR ALTER PROCEDURE )/g)
  .map((statement) => statement.trim())
  .filter(Boolean);

const buildStudentSqlParams = (payload) => {
  const sql = getSqlClient();

  return [
    { name: 'MongoStudentId', type: sql.NVarChar(64), value: payload.mongoStudentId },
    { name: 'MongoUserId', type: sql.NVarChar(64), value: payload.mongoUserId },
    { name: 'FullName', type: sql.NVarChar(200), value: payload.fullName },
    { name: 'Email', type: sql.NVarChar(320), value: payload.email },
    { name: 'Phone', type: sql.NVarChar(40), value: payload.phone },
    { name: 'ClassName', type: sql.NVarChar(100), value: payload.className },
    { name: 'SectionName', type: sql.NVarChar(50), value: payload.sectionName },
    { name: 'RollNumber', type: sql.NVarChar(100), value: payload.rollNumber },
    { name: 'DateOfBirth', type: sql.Date, value: payload.dateOfBirth || null },
    { name: 'Gender', type: sql.NVarChar(20), value: payload.gender },
    { name: 'AddressStreet', type: sql.NVarChar(255), value: payload.addressStreet },
    { name: 'AddressCity', type: sql.NVarChar(120), value: payload.addressCity },
    { name: 'AddressState', type: sql.NVarChar(120), value: payload.addressState },
    { name: 'AddressPincode', type: sql.NVarChar(20), value: payload.addressPincode },
    { name: 'GuardianName', type: sql.NVarChar(200), value: payload.guardianName },
    { name: 'GuardianPhone', type: sql.NVarChar(40), value: payload.guardianPhone },
    { name: 'GuardianRelation', type: sql.NVarChar(50), value: payload.guardianRelation },
    { name: 'BloodGroup', type: sql.NVarChar(20), value: payload.bloodGroup },
    { name: 'AdmissionDate', type: sql.Date, value: payload.admissionDate || null },
    { name: 'IsActive', type: sql.Bit, value: payload.isActive },
    { name: 'CreatedAt', type: sql.DateTime2(0), value: payload.createdAt || new Date() },
    { name: 'UpdatedAt', type: sql.DateTime2(0), value: payload.updatedAt || new Date() },
  ];
};

const buildStudentPortalProfileSqlParams = (payload = {}) => {
  const sql = getSqlClient();

  return [
    { name: 'UserId', type: sql.Int, value: payload.userId || null },
    { name: 'MongoUserId', type: sql.NVarChar(64), value: payload.mongoUserId || null },
    { name: 'Email', type: sql.NVarChar(320), value: payload.email || null },
    { name: 'FullName', type: sql.NVarChar(200), value: payload.fullName || null },
    { name: 'Phone', type: sql.NVarChar(40), value: payload.phone || null },
    { name: 'AdmissionNumber', type: sql.NVarChar(50), value: payload.admissionNumber || null },
    { name: 'RollNumber', type: sql.NVarChar(100), value: payload.rollNumber || null },
    { name: 'ClassName', type: sql.NVarChar(100), value: payload.className || null },
    { name: 'SectionName', type: sql.NVarChar(50), value: payload.sectionName || null },
    { name: 'DateOfBirth', type: sql.Date, value: payload.dateOfBirth || null },
    { name: 'Gender', type: sql.NVarChar(20), value: payload.gender || null },
    { name: 'GuardianName', type: sql.NVarChar(200), value: payload.guardianName || null },
    { name: 'GuardianPhone', type: sql.NVarChar(40), value: payload.guardianPhone || null },
    { name: 'GuardianRelation', type: sql.NVarChar(50), value: payload.guardianRelation || null },
    { name: 'BloodGroup', type: sql.NVarChar(20), value: payload.bloodGroup || null },
    { name: 'AdmissionDate', type: sql.Date, value: payload.admissionDate || null },
    { name: 'Notes', type: sql.NVarChar(500), value: payload.notes || null },
    { name: 'IsActive', type: sql.Bit, value: payload.isActive !== false },
  ];
};

const buildStudentPortalProfileLookupParams = (payload = {}) => {
  const sql = getSqlClient();

  return [
    { name: 'UserId', type: sql.Int, value: payload.userId || null },
    { name: 'MongoUserId', type: sql.NVarChar(64), value: payload.mongoUserId || null },
    { name: 'Email', type: sql.NVarChar(320), value: payload.email || null },
  ];
};

const REAL_STUDENT_LIST_PAGE_SIZE = 10000;
const REAL_STUDENT_BASE_SELECT = `
  SELECT
    S.StudentId,
    S.UserId,
    S.AdmissionNumber,
    S.RollNumber,
    S.AcademicYearId,
    S.ClassId,
    S.SectionId,
    S.FirstName,
    S.LastName,
    S.FullName,
    S.Gender,
    S.DateOfBirth,
    S.BloodGroup,
    S.Phone,
    S.Email,
    S.AddressLine1,
    S.AddressLine2,
    S.City,
    S.State,
    S.PostalCode,
    S.Country,
    S.AdmissionDate,
    S.Status,
    S.ProfileImage,
    S.CreatedAt,
    S.UpdatedAt,
    C.ClassName,
    SEC.SectionName,
    AY.YearName
  FROM dbo.Students S
  LEFT JOIN dbo.Classes C ON S.ClassId = C.ClassId
  LEFT JOIN dbo.Sections SEC ON S.SectionId = SEC.SectionId
  LEFT JOIN dbo.AcademicYears AY ON S.AcademicYearId = AY.AcademicYearId
`;

const normalizeStudentNumericId = (value) => {
  const numericValue = Number(value);
  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    return null;
  }

  return numericValue;
};

const extractAuthUserKeys = (user = null) => {
  const candidates = [
    user?._id,
    user?.id,
    user?.userId,
    user?.UserId,
  ]
    .map((value) => toNullableString(value))
    .filter(Boolean);

  return {
    userId: candidates.map(normalizeStudentNumericId).find(Boolean) || null,
    mongoUserId: toNullableString(user?.MongoUserId)
      || candidates.find((value) => !normalizeStudentNumericId(value))
      || null,
  };
};

const buildStudentPortalProfilePayload = (user = {}, overrides = {}) => {
  const authKeys = extractAuthUserKeys(user);
  const email = toNullableString(overrides.email ?? user?.email ?? user?.Email);

  if (!email && !authKeys.userId && !authKeys.mongoUserId) {
    return null;
  }

  return {
    userId: authKeys.userId,
    mongoUserId: authKeys.mongoUserId,
    email,
    fullName: toNullableString(overrides.fullName ?? user?.fullName ?? user?.FullName) || email || 'Student',
    phone: toNullableString(overrides.phone ?? user?.phone ?? user?.Phone),
    admissionNumber: toNullableString(overrides.admissionNumber),
    rollNumber: toNullableString(overrides.rollNumber),
    className: toNullableString(overrides.className ?? overrides.class),
    sectionName: toNullableString(overrides.sectionName ?? overrides.section),
    dateOfBirth: toNullableDate(overrides.dateOfBirth),
    gender: toNullableString(overrides.gender),
    guardianName: toNullableString(overrides.guardianName),
    guardianPhone: toNullableString(overrides.guardianPhone),
    guardianRelation: toNullableString(overrides.guardianRelation),
    bloodGroup: toNullableString(overrides.bloodGroup),
    admissionDate: toNullableDate(overrides.admissionDate),
    notes: toNullableString(overrides.notes),
    isActive: overrides.isActive !== undefined ? Boolean(overrides.isActive) : user?.isActive !== false,
  };
};

const normalizeStudentPortalProfileId = (value) => {
  const numericValue = Number(value);
  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    return null;
  }

  return numericValue;
};

const STUDENT_PORTAL_PROFILE_SELECT = `
  SELECT
    p.*,
    s.StudentId AS LinkedStudentId,
    CAST(CASE WHEN s.StudentId IS NULL THEN 0 ELSE 1 END AS BIT) AS HasLinkedStudentRecord
  FROM ${STUDENT_PORTAL_PROFILE_TABLE} p
  LEFT JOIN dbo.Students s
    ON s.UserId = p.UserId
`;

const isSqlStudentActive = (status) => {
  if (status === undefined || status === null) {
    return true;
  }

  return String(status).trim().toLowerCase() !== 'inactive';
};

const logStudentSqlRead = (procedureName, params = {}) => {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  console.info('[students][sql]', procedureName, params);
};

const executeStudentReadProcedure = async (procedureName, params = []) => {
  logStudentSqlRead(procedureName, Object.fromEntries(params.map((param) => [param.name, param.value ?? null])));
  return executeStoredProcedure(procedureName, params);
};

const getPrimaryGuardiansByStudentIds = async (studentIds = []) => {
  const normalizedIds = [...new Set(
    studentIds
      .map(normalizeStudentNumericId)
      .filter(Boolean)
  )];

  if (!normalizedIds.length) {
    return new Map();
  }

  const inClause = normalizedIds.join(', ');
  const result = await executeQuery(`
    ;WITH RankedGuardians AS (
      SELECT
        G.*,
        ROW_NUMBER() OVER (
          PARTITION BY G.StudentId
          ORDER BY CASE WHEN G.IsPrimaryGuardian = 1 THEN 0 ELSE 1 END, G.GuardianId ASC
        ) AS GuardianRank
      FROM dbo.Guardians G
      WHERE G.StudentId IN (${inClause})
    )
    SELECT *
    FROM RankedGuardians
    WHERE GuardianRank = 1
  `);

  return new Map(
    (result?.recordset || []).map((row) => [Number(row.StudentId), row])
  );
};

const mapGuardianAddress = (row) => ({
  street: row?.AddressLine1 || '',
  city: row?.City || '',
  state: row?.State || '',
  pincode: row?.PostalCode || '',
  country: row?.Country || '',
});

const mapRealGuardianRow = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: String(row.GuardianId),
    fullName: row.FullName || null,
    relation: row.Relation || null,
    phone: row.Phone || null,
    alternatePhone: row.AlternatePhone || null,
    email: row.Email || null,
    occupation: row.Occupation || null,
    address: mapGuardianAddress(row),
    isPrimaryGuardian: row.IsPrimaryGuardian === true || row.IsPrimaryGuardian === 1,
    isActive: true,
    createdAt: row.CreatedAt ? new Date(row.CreatedAt) : null,
    updatedAt: row.UpdatedAt ? new Date(row.UpdatedAt) : null,
  };
};

const mapRealStudentRow = (row, guardianRow = null) => {
  if (!row) {
    return null;
  }

  const studentId = normalizeStudentNumericId(row.StudentId);
  if (!studentId) {
    return null;
  }

  const primaryGuardian = guardianRow ? mapRealGuardianRow(guardianRow) : null;
  const studentPhone = row.Phone || null;
  const guardianPhone = primaryGuardian?.phone || null;
  const className = row.ClassName || '';
  const sectionName = row.SectionName || '';

  return {
    _id: String(studentId),
    id: String(studentId),
    studentId: String(studentId),
    dbId: studentId,
    userId: row.UserId !== undefined && row.UserId !== null
      ? {
          _id: String(row.UserId),
          email: row.Email || null,
          role: 'student',
        }
      : null,
    admissionNumber: row.AdmissionNumber || null,
    rollNumber: row.RollNumber || null,
    firstName: row.FirstName || null,
    lastName: row.LastName || null,
    fullName: row.FullName || [row.FirstName, row.LastName].filter(Boolean).join(' ') || null,
    gender: row.Gender || null,
    dateOfBirth: row.DateOfBirth ? new Date(row.DateOfBirth) : null,
    admissionDate: row.AdmissionDate ? new Date(row.AdmissionDate) : null,
    bloodGroup: row.BloodGroup || null,
    phone: studentPhone || guardianPhone,
    email: row.Email || null,
    class: className,
    className,
    classId: className,
    classDbId: row.ClassId ?? null,
    section: sectionName,
    sectionName,
    sectionId: sectionName,
    sectionDbId: row.SectionId ?? null,
    academicYear: row.YearName || null,
    academicYearId: row.AcademicYearId ?? null,
    address: {
      street: row.AddressLine1 || '',
      city: row.City || '',
      state: row.State || '',
      pincode: row.PostalCode || '',
      country: row.Country || '',
      line2: row.AddressLine2 || '',
    },
    parentName: primaryGuardian?.fullName || null,
    parentPhone: primaryGuardian?.phone || null,
    guardianName: primaryGuardian?.fullName || '',
    guardianPhone: primaryGuardian?.phone || '',
    guardianRelation: primaryGuardian?.relation || '',
    isActive: isSqlStudentActive(row.Status),
    status: row.Status || null,
    profilePhoto: row.ProfileImage || null,
    createdAt: row.CreatedAt ? new Date(row.CreatedAt) : null,
    updatedAt: row.UpdatedAt ? new Date(row.UpdatedAt) : null,
  };
};

const hydrateRealStudentRows = async (rows = []) => {
  const guardianMap = await getPrimaryGuardiansByStudentIds(rows.map((row) => row.StudentId));
  return rows
    .map((row) => mapRealStudentRow(row, guardianMap.get(Number(row.StudentId)) || null))
    .filter(Boolean);
};

const getRealStudentRowsByIds = async (studentIds = []) => {
  const normalizedIds = [...new Set(
    studentIds
      .map(normalizeStudentNumericId)
      .filter(Boolean)
  )];

  if (!normalizedIds.length) {
    return [];
  }

  const result = await executeQuery(`
    ${REAL_STUDENT_BASE_SELECT}
    WHERE S.StudentId IN (${normalizedIds.join(', ')})
  `);

  return result?.recordset || [];
};

const getFeeStructureMap = async (feeStructureIds = []) => {
  const normalizedIds = [...new Set(
    feeStructureIds
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
  )];

  if (!normalizedIds.length) {
    return new Map();
  }

  const result = await executeQuery(`
    SELECT FeeStructureId, FeeType, Amount, DueDate, Description
    FROM dbo.FeeStructures
    WHERE FeeStructureId IN (${normalizedIds.join(', ')})
  `);

  return new Map((result?.recordset || []).map((row) => [Number(row.FeeStructureId), row]));
};

const getExamMetaMap = async (examSubjectIds = []) => {
  const normalizedIds = [...new Set(
    examSubjectIds
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
  )];

  if (!normalizedIds.length) {
    return new Map();
  }

  const result = await executeQuery(`
    SELECT
      ES.ExamSubjectId,
      ES.MaxMarks,
      ES.PassMarks,
      ES.ExamDate,
      E.ExamName,
      SUB.SubjectName
    FROM dbo.ExamSubjects ES
    LEFT JOIN dbo.Exams E ON ES.ExamId = E.ExamId
    LEFT JOIN dbo.Subjects SUB ON ES.SubjectId = SUB.SubjectId
    WHERE ES.ExamSubjectId IN (${normalizedIds.join(', ')})
  `);

  return new Map((result?.recordset || []).map((row) => [Number(row.ExamSubjectId), row]));
};

const mapRealStudentFeeRow = (row, feeStructureMap = new Map()) => {
  const structure = feeStructureMap.get(Number(row?.FeeStructureId)) || null;
  const amount = Number(row?.TotalAmount || structure?.Amount || 0);
  const paidAmount = Number(row?.PaidAmount || 0);
  const pendingAmount = Number(row?.BalanceAmount ?? Math.max(amount - paidAmount, 0));

  return {
    id: String(row.StudentFeeId),
    feeType: structure?.FeeType || `Fee #${row.FeeStructureId}`,
    academicYear: null,
    dueDate: row.DueDate || structure?.DueDate || null,
    amount,
    paidAmount,
    pendingAmount,
    status: row.Status || (pendingAmount > 0 ? 'Pending' : 'Paid'),
    description: structure?.Description || null,
    paymentDate: null,
    paymentMode: null,
    receiptNumber: null,
    transactionId: null,
    remarks: null,
  };
};

const mapRealExamResultRow = (row, examMetaMap = new Map()) => {
  const meta = examMetaMap.get(Number(row?.ExamSubjectId)) || null;
  const marksObtained = Number(row?.MarksObtained || 0);
  const totalMarks = Number(meta?.MaxMarks || 0);
  const percentage = totalMarks > 0
    ? Number(((marksObtained / totalMarks) * 100).toFixed(2))
    : 0;

  return {
    id: String(row.ExamResultId),
    examName: meta?.ExamName || 'Exam',
    subject: meta?.SubjectName || 'Subject',
    examDate: meta?.ExamDate || null,
    marksObtained,
    totalMarks,
    percentage,
    grade: row.Grade || null,
    remarks: row.Remarks || null,
    isAbsent: row.IsAbsent === true || row.IsAbsent === 1,
  };
};

const filterRealStudents = (
  students,
  {
    search = null,
    className = null,
    sectionName = null,
    classId = null,
    sectionId = null,
  }
) => {
  const normalizedSearch = toNullableString(search)?.toLowerCase() || null;
  const normalizedClass = toNullableString(className);
  const normalizedSection = toNullableString(sectionName);
  const normalizedClassId = normalizeStudentNumericId(classId);
  const normalizedSectionId = normalizeStudentNumericId(sectionId);

  return students.filter((student) => {
    if (
      normalizedClassId
      && normalizeStudentNumericId(student.classDbId) !== normalizedClassId
    ) {
      return false;
    }

    if (normalizedClass && student.className !== normalizedClass) {
      return false;
    }

    if (
      normalizedSectionId
      && normalizeStudentNumericId(student.sectionDbId) !== normalizedSectionId
    ) {
      return false;
    }

    if (normalizedSection && student.sectionName !== normalizedSection) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    const haystack = [
      student.fullName,
      student.rollNumber,
      student.admissionNumber,
      student.email,
      student.phone,
      student.parentName,
      student.className,
      student.sectionName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalizedSearch);
  });
};

const sortRealStudents = (students, sortBy = 'fullName', sortOrder = 'asc') => {
  const normalizedSortBy = String(sortBy || 'fullName').trim().toLowerCase();
  const direction = String(sortOrder || 'asc').trim().toLowerCase() === 'desc' ? -1 : 1;

  const getSortableValue = (student) => {
    switch (normalizedSortBy) {
      case 'rollnumber':
        return student.rollNumber || '';
      case 'email':
        return student.email || '';
      case 'class':
      case 'classname':
        return student.className || '';
      case 'section':
      case 'sectionname':
        return student.sectionName || '';
      case 'updatedat':
        return student.updatedAt ? student.updatedAt.getTime() : 0;
      case 'createdat':
        return student.createdAt ? student.createdAt.getTime() : 0;
      case 'id':
      case 'studentid':
        return Number(student.dbId || 0);
      default:
        return student.fullName || '';
    }
  };

  return [...students].sort((left, right) => {
    const leftValue = getSortableValue(left);
    const rightValue = getSortableValue(right);

    if (leftValue < rightValue) {
      return -1 * direction;
    }

    if (leftValue > rightValue) {
      return 1 * direction;
    }

    return 0;
  });
};

const getStudentByIdFromSqlRecord = async (studentId) => {
  const normalizedStudentId = normalizeStudentNumericId(studentId);
  if (!normalizedStudentId) {
    return null;
  }

  const sql = getSqlClient();
  logStudentSqlRead('query:StudentsById', { StudentId: normalizedStudentId });
  const result = await executeQuery(
    `${REAL_STUDENT_BASE_SELECT}
     WHERE S.StudentId = @StudentId`,
    [{ name: 'StudentId', type: sql.Int, value: normalizedStudentId }]
  );

  const row = result?.recordset?.[0] || null;
  if (!row) {
    return null;
  }

  const guardianMap = await getPrimaryGuardiansByStudentIds([normalizedStudentId]);
  return mapRealStudentRow(row, guardianMap.get(normalizedStudentId) || null);
};

const getStudentFullProfileFromSqlRecord = async (studentId) => {
  const normalizedStudentId = normalizeStudentNumericId(studentId);
  if (!normalizedStudentId) {
    return {
      student: null,
      parentSnapshot: null,
      academicSnapshot: null,
      parentDetails: [],
      feeSnapshot: [],
      examSnapshot: [],
    };
  }

  const sql = getSqlClient();
  const result = await executeStudentReadProcedure('dbo.usp_Student_FullProfile', [
    { name: 'StudentId', type: sql.Int, value: normalizedStudentId },
  ]);

  const recordsets = result?.recordsets || [];
  const studentRow = recordsets[0]?.[0] || null;
  const guardianRows = recordsets[1] || [];
  const feeRows = recordsets[2] || [];
  const examRows = recordsets[3] || [];
  const primaryGuardianRow = guardianRows.find((row) => row.IsPrimaryGuardian === true || row.IsPrimaryGuardian === 1) || guardianRows[0] || null;
  const feeStructureMap = await getFeeStructureMap(feeRows.map((row) => row.FeeStructureId));
  const examMetaMap = await getExamMetaMap(examRows.map((row) => row.ExamSubjectId));

  return {
    student: mapRealStudentRow(studentRow, primaryGuardianRow),
    parentSnapshot: primaryGuardianRow
      ? {
          GuardianName: primaryGuardianRow.FullName || null,
          GuardianPhone: primaryGuardianRow.Phone || null,
          GuardianRelation: primaryGuardianRow.Relation || null,
          AddressStreet: primaryGuardianRow.AddressLine1 || '',
          AddressCity: primaryGuardianRow.City || '',
          AddressState: primaryGuardianRow.State || '',
          AddressPincode: primaryGuardianRow.PostalCode || '',
        }
      : null,
    academicSnapshot: studentRow
      ? {
          ClassName: studentRow.ClassName || null,
          SectionName: studentRow.SectionName || null,
          YearName: studentRow.YearName || null,
          IsActive: isSqlStudentActive(studentRow.Status),
        }
      : null,
    parentDetails: guardianRows.map(mapRealGuardianRow).filter(Boolean),
    feeSnapshot: feeRows.map((row) => mapRealStudentFeeRow(row, feeStructureMap)),
    examSnapshot: examRows.map((row) => mapRealExamResultRow(row, examMetaMap)),
  };
};

const getStudentPortalProfileByAuthUser = async (user = {}) => {
  await ensureStudentSqlReady();
  const payload = buildStudentPortalProfilePayload(user, {
    notes: null,
  });

  if (!payload) {
    return null;
  }

  const result = await executeStoredProcedure(
    'dbo.spStudentPortalProfileGetByAuthUser',
    buildStudentPortalProfileLookupParams(payload)
  );

  return mapStudentPortalProfileRow(result?.recordset?.[0] || null);
};

const ensureStudentPortalProfileForAuthUser = async (user = {}) => {
  await ensureStudentSqlReady();
  const payload = buildStudentPortalProfilePayload(user);
  if (!payload?.email) {
    return getStudentPortalProfileByAuthUser(user);
  }

  const result = await executeStoredProcedure(
    'dbo.spStudentPortalProfileUpsert',
    buildStudentPortalProfileSqlParams(payload)
  );

  return mapStudentPortalProfileRow(result?.recordset?.[0] || null);
};

const getStudentPortalProfileById = async (profileId) => {
  await ensureStudentSqlReady();
  const normalizedProfileId = normalizeStudentPortalProfileId(profileId);
  if (!normalizedProfileId) {
    return null;
  }

  const sql = getSqlClient();
  logStudentSqlRead('query:StudentPortalProfileById', { StudentPortalProfileId: normalizedProfileId });
  const result = await executeQuery(
    `${STUDENT_PORTAL_PROFILE_SELECT}
     WHERE p.StudentPortalProfileId = @StudentPortalProfileId`,
    [{ name: 'StudentPortalProfileId', type: sql.Int, value: normalizedProfileId }]
  );

  return mapStudentPortalProfileRow(result?.recordset?.[0] || null);
};

const listStudentPortalProfiles = async ({ search = null, onlyPending = true } = {}) => {
  await ensureStudentSqlReady();
  const sql = getSqlClient();
  const normalizedSearch = toNullableString(search);
  const searchPattern = normalizedSearch ? `%${normalizedSearch.toLowerCase()}%` : null;

  logStudentSqlRead('query:StudentPortalProfileList', {
    search: normalizedSearch,
    onlyPending: onlyPending !== false,
  });

  const result = await executeQuery(
    `${STUDENT_PORTAL_PROFILE_SELECT}
     WHERE (@OnlyPending = 0 OR s.StudentId IS NULL)
       AND (
         @SearchPattern IS NULL
         OR LOWER(LTRIM(RTRIM(ISNULL(p.FullName, N'')))) LIKE @SearchPattern
         OR LOWER(LTRIM(RTRIM(ISNULL(p.Email, N'')))) LIKE @SearchPattern
         OR LOWER(LTRIM(RTRIM(ISNULL(p.Phone, N'')))) LIKE @SearchPattern
         OR LOWER(LTRIM(RTRIM(ISNULL(p.ClassName, N'')))) LIKE @SearchPattern
         OR LOWER(LTRIM(RTRIM(ISNULL(p.SectionName, N'')))) LIKE @SearchPattern
         OR LOWER(LTRIM(RTRIM(ISNULL(p.RollNumber, N'')))) LIKE @SearchPattern
       )
     ORDER BY p.UpdatedAt DESC, p.StudentPortalProfileId DESC`,
    [
      { name: 'OnlyPending', type: sql.Bit, value: onlyPending !== false },
      { name: 'SearchPattern', type: sql.NVarChar(220), value: searchPattern },
    ]
  );

  return (result?.recordset || []).map(mapStudentPortalProfileRow).filter(Boolean);
};

const updateStudentPortalProfileRecord = async (profileId, updates = {}) => {
  await ensureStudentSqlReady();
  const normalizedProfileId = normalizeStudentPortalProfileId(profileId);
  if (!normalizedProfileId) {
    return null;
  }

  const existingProfile = await getStudentPortalProfileById(normalizedProfileId);
  if (!existingProfile) {
    return null;
  }

  const sql = getSqlClient();
  const existingUserId = normalizeStudentNumericId(existingProfile.userId?._id || existingProfile.userId);
  const existingMongoUserId = existingProfile.userId && !existingUserId
    ? toNullableString(existingProfile.userId?._id || existingProfile.userId)
    : null;

  const mergedPayload = {
    userId: existingUserId,
    mongoUserId: existingMongoUserId,
    email: toNullableString(updates.email) ?? existingProfile.email ?? null,
    fullName: toNullableString(updates.fullName) ?? existingProfile.fullName ?? null,
    phone: toNullableString(updates.phone) ?? existingProfile.phone ?? null,
    admissionNumber: toNullableString(updates.admissionNumber) ?? existingProfile.admissionNumber ?? null,
    rollNumber: toNullableString(updates.rollNumber) ?? existingProfile.rollNumber ?? null,
    className: toNullableString(updates.className ?? updates.class) ?? existingProfile.className ?? null,
    sectionName: toNullableString(updates.sectionName ?? updates.section) ?? existingProfile.sectionName ?? null,
    dateOfBirth: updates.dateOfBirth !== undefined ? toNullableDate(updates.dateOfBirth) : (existingProfile.dateOfBirth || null),
    gender: toNullableString(updates.gender) ?? existingProfile.gender ?? null,
    guardianName: toNullableString(updates.guardianName) ?? existingProfile.guardianName ?? null,
    guardianPhone: toNullableString(updates.guardianPhone) ?? existingProfile.guardianPhone ?? null,
    guardianRelation: toNullableString(updates.guardianRelation) ?? existingProfile.guardianRelation ?? null,
    bloodGroup: toNullableString(updates.bloodGroup) ?? existingProfile.bloodGroup ?? null,
    admissionDate: updates.admissionDate !== undefined ? toNullableDate(updates.admissionDate) : (existingProfile.admissionDate || null),
    notes: toNullableString(updates.notes ?? updates.profileNote) ?? existingProfile.profileNote ?? null,
    isActive: updates.isActive !== undefined ? Boolean(updates.isActive) : existingProfile.isActive !== false,
  };

  if (!mergedPayload.email || !mergedPayload.fullName) {
    throw new Error('Student portal profile requires email and full name.');
  }

  await executeQuery(
    `UPDATE ${STUDENT_PORTAL_PROFILE_TABLE}
     SET Email = @Email,
         FullName = @FullName,
         Phone = @Phone,
         AdmissionNumber = @AdmissionNumber,
         RollNumber = @RollNumber,
         ClassName = @ClassName,
         SectionName = @SectionName,
         DateOfBirth = @DateOfBirth,
         Gender = @Gender,
         GuardianName = @GuardianName,
         GuardianPhone = @GuardianPhone,
         GuardianRelation = @GuardianRelation,
         BloodGroup = @BloodGroup,
         AdmissionDate = @AdmissionDate,
         Notes = @Notes,
         IsActive = @IsActive,
         UpdatedAt = SYSUTCDATETIME()
     WHERE StudentPortalProfileId = @StudentPortalProfileId`,
    [
      { name: 'StudentPortalProfileId', type: sql.Int, value: normalizedProfileId },
      ...buildStudentPortalProfileSqlParams(mergedPayload),
    ]
  );

  return getStudentPortalProfileById(normalizedProfileId);
};

const getStudentByUserIdFromSqlRecord = async (mongoUserId) => {
  const normalizedUserId = normalizeStudentNumericId(
    typeof mongoUserId === 'object'
      ? mongoUserId?._id ?? mongoUserId?.id ?? mongoUserId?.userId ?? mongoUserId?.UserId
      : mongoUserId
  );
  const normalizedEmail = toNullableString(
    typeof mongoUserId === 'object'
      ? mongoUserId?.email ?? mongoUserId?.Email
      : null
  );

  if (!normalizedUserId && !normalizedEmail) {
    return null;
  }

  if (normalizedUserId) {
    const sql = getSqlClient();
    logStudentSqlRead('query:StudentsByUserId', { UserId: normalizedUserId });
    const result = await executeQuery(
      `${REAL_STUDENT_BASE_SELECT}
       WHERE S.UserId = @UserId`,
      [{ name: 'UserId', type: sql.Int, value: normalizedUserId }]
    );

    const row = result?.recordset?.[0] || null;
    if (row) {
      const guardianMap = await getPrimaryGuardiansByStudentIds([row.StudentId]);
      return mapRealStudentRow(row, guardianMap.get(Number(row.StudentId)) || null);
    }
  }

  if (!normalizedEmail) {
    return getStudentPortalProfileByAuthUser(
      typeof mongoUserId === 'object'
        ? mongoUserId
        : {
            id: normalizedUserId,
            role: 'student',
          }
    );
  }

  const sql = getSqlClient();
  logStudentSqlRead('query:StudentsByEmailFallback', {
    Email: normalizedEmail,
    UserId: normalizedUserId,
  });
  const emailResult = await executeQuery(
    `${REAL_STUDENT_BASE_SELECT}
     WHERE LOWER(LTRIM(RTRIM(S.Email))) = LOWER(LTRIM(RTRIM(@Email)))`,
    [{ name: 'Email', type: sql.NVarChar(320), value: normalizedEmail }]
  );

  const row = emailResult?.recordset?.[0] || null;
  if (!row) {
    const mirrorResult = await executeQuery(
      `SELECT TOP 1 *
       FROM ${STUDENT_TABLE}
       WHERE LOWER(LTRIM(RTRIM(Email))) = LOWER(LTRIM(RTRIM(@Email)))
       ORDER BY UpdatedAt DESC`,
      [{ name: 'Email', type: sql.NVarChar(320), value: normalizedEmail }]
    );

    const mirrorRow = mirrorResult?.recordset?.[0] || null;
    if (mirrorRow) {
      return mapStudentRow(mirrorRow);
    }

    return ensureStudentPortalProfileForAuthUser(
      typeof mongoUserId === 'object'
        ? mongoUserId
        : {
            id: normalizedUserId,
            email: normalizedEmail,
            role: 'student',
          }
    );
  }

  const guardianMap = await getPrimaryGuardiansByStudentIds([row.StudentId]);
  return mapRealStudentRow(row, guardianMap.get(Number(row.StudentId)) || null);
};

const getStudentByRollNumberFromSqlRecord = async (rollNumber) => {
  const normalizedRollNumber = toNullableString(rollNumber);
  if (!normalizedRollNumber) {
    return null;
  }

  const sql = getSqlClient();
  logStudentSqlRead('query:StudentsByRollNumber', { RollNumber: normalizedRollNumber });
  const result = await executeQuery(
    `${REAL_STUDENT_BASE_SELECT}
     WHERE S.RollNumber = @RollNumber`,
    [{ name: 'RollNumber', type: sql.NVarChar(50), value: normalizedRollNumber }]
  );

  const row = result?.recordset?.[0] || null;
  if (!row) {
    return null;
  }

  const guardianMap = await getPrimaryGuardiansByStudentIds([row.StudentId]);
  return mapRealStudentRow(row, guardianMap.get(Number(row.StudentId)) || null);
};

const getStudentByAdmissionNumberFromSqlRecord = async (admissionNumber) => {
  const normalizedAdmissionNumber = toNullableString(admissionNumber);
  if (!normalizedAdmissionNumber) {
    return null;
  }

  const sql = getSqlClient();
  logStudentSqlRead('query:StudentsByAdmissionNumber', { AdmissionNumber: normalizedAdmissionNumber });
  const result = await executeQuery(
    `${REAL_STUDENT_BASE_SELECT}
     WHERE S.AdmissionNumber = @AdmissionNumber`,
    [{ name: 'AdmissionNumber', type: sql.NVarChar(50), value: normalizedAdmissionNumber }]
  );

  const row = result?.recordset?.[0] || null;
  if (!row) {
    return null;
  }

  const guardianMap = await getPrimaryGuardiansByStudentIds([row.StudentId]);
  return mapRealStudentRow(row, guardianMap.get(Number(row.StudentId)) || null);
};

const loadUsersForStudents = async (studentDocuments = []) => {
  const userIds = [...new Set(
    studentDocuments
      .map((student) => student?.userId ? String(student.userId) : '')
      .filter(Boolean)
  )];

  if (!userIds.length) {
    return new Map();
  }

  const users = await User.find({ _id: { $in: userIds } }).lean();
  return new Map(users.map((user) => [String(user._id), user]));
};

const syncStudentSnapshot = async (studentDocument, userDocument = null) => {
  if (!studentDocument?._id) {
    return null;
  }

  if (userDocument) {
    await syncUserAuthRecord(userDocument);
  }

  const payload = toSqlStudentPayload(studentDocument, userDocument);
  const result = await executeStoredProcedure('dbo.spStudentCreate', buildStudentSqlParams(payload));
  return mapStudentRow(result?.recordset?.[0]);
};

const pruneDeletedStudentsFromMirror = async (studentIds = []) => {
  if (!studentIds.length) {
    await executeQuery(`DELETE FROM ${STUDENT_TABLE}`);
    return;
  }

  const safeIds = studentIds
    .map((studentId) => escapeSqlLiteral(studentId))
    .filter(Boolean)
    .map((studentId) => `N'${studentId}'`)
    .join(', ');

  await executeQuery(`DELETE FROM ${STUDENT_TABLE} WHERE MongoStudentId NOT IN (${safeIds})`);
};

const ensureStudentSqlReady = async () => {
  if (!studentBootstrapPromise) {
    studentBootstrapPromise = (async () => {
      await ensureAuthSqlReady();
      const pool = await getPool();
      await pool.request().batch(STUDENT_SCHEMA_BATCH);
      for (const batch of STUDENT_PROCEDURE_BATCHES) {
        await pool.request().batch(batch);
      }
      return true;
    })().catch((error) => {
      studentBootstrapPromise = null;
      throw error;
    });
  }

  return studentBootstrapPromise;
};

const syncStudentMirror = async (studentDocument, userDocument = null) => {
  if (!studentDocument) {
    return null;
  }

  await ensureStudentSqlReady();

  const payload = toSqlStudentPayload(studentDocument, userDocument);
  const result = await executeStoredProcedure('dbo.spStudentUpsertMirror', buildStudentSqlParams(payload));
  lastStudentSyncAt = Date.now();
  return mapStudentRow(result?.recordset?.[0]);
};

const syncStudentById = async (studentId) => {
  if (!studentId) {
    return null;
  }

  await ensureStudentSqlReady();

  const studentDocument = await Student.findById(studentId).lean();
  if (!studentDocument) {
    await deleteStudentMirror(studentId);
    return null;
  }

  const userDocument = studentDocument.userId
    ? await User.findById(studentDocument.userId).lean()
    : null;

  const syncedStudent = await syncStudentSnapshot(studentDocument, userDocument);
  lastStudentSyncAt = Date.now();
  return syncedStudent;
};

const syncAllStudentsToSql = async ({ force = false } = {}) => {
  await ensureStudentSqlReady();

  if (!force && Date.now() - lastStudentSyncAt < STUDENT_SYNC_TTL_MS) {
    return true;
  }

  if (!studentSyncPromise) {
    studentSyncPromise = (async () => {
      const studentDocuments = await Student.find({}).sort({ createdAt: 1 }).lean();
      const userMap = await loadUsersForStudents(studentDocuments);
      const syncedStudentIds = [];

      for (const studentDocument of studentDocuments) {
        const userDocument = studentDocument.userId
          ? userMap.get(String(studentDocument.userId)) || null
          : null;

        await syncStudentSnapshot(studentDocument, userDocument);
        syncedStudentIds.push(String(studentDocument._id));
      }

      await pruneDeletedStudentsFromMirror(syncedStudentIds);
      lastStudentSyncAt = Date.now();
      return true;
    })().finally(() => {
      studentSyncPromise = null;
    });
  }

  return studentSyncPromise;
};

const getStudentList = async ({
  page = 1,
  limit = 10,
  search = null,
  className = null,
  sectionName = null,
  classId = null,
  sectionId = null,
  sortBy = 'createdAt',
  sortOrder = 'desc',
}) => {
  await ensureStudentSqlReady();
  const sql = getSqlClient();
  const normalizedPage = Math.max(Number(page) || 1, 1);
  const normalizedLimit = Math.max(Number(limit) || 10, 1);
  const listResult = await executeStudentReadProcedure('dbo.usp_Student_List', [
    { name: 'Page', type: sql.Int, value: 1 },
    { name: 'PageSize', type: sql.Int, value: REAL_STUDENT_LIST_PAGE_SIZE },
  ]);
  const listRows = listResult?.recordset || [];
  const realRows = await getRealStudentRowsByIds(listRows.map((row) => row.StudentId));
  const realStudents = await hydrateRealStudentRows(realRows);
  const availableClasses = [...new Set(
    realStudents
      .map((student) => student.className)
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right));
  const filteredStudents = filterRealStudents(realStudents, {
    search,
    className,
    sectionName,
    classId,
    sectionId,
  });
  const sortedStudents = sortRealStudents(filteredStudents, sortBy, sortOrder);
  const total = sortedStudents.length;
  const startIndex = (normalizedPage - 1) * normalizedLimit;
  const paginatedStudents = sortedStudents.slice(startIndex, startIndex + normalizedLimit);

  return {
    students: paginatedStudents,
    total,
    page: normalizedPage,
    limit: normalizedLimit,
    availableClasses,
    sourceProcedure: 'dbo.usp_Student_List',
  };
};

const getAllStudents = async () => {
  const list = await getStudentList({ page: 1, limit: 10000, sortBy: 'fullName', sortOrder: 'asc' });
  return list.students;
};

const getStudentById = async (studentId) => {
  await ensureStudentSqlReady();
  return getStudentByIdFromSqlRecord(studentId);
};

const createStudentMirror = async (studentDocument, userDocument = null) => {
  await ensureStudentSqlReady();
  const payload = toSqlStudentPayload(studentDocument, userDocument);
  const result = await executeStoredProcedure('dbo.spStudentCreate', buildStudentSqlParams(payload));
  lastStudentSyncAt = Date.now();
  return mapStudentRow(result?.recordset?.[0]);
};

const updateStudentMirror = async (studentDocument, userDocument = null) => {
  await ensureStudentSqlReady();
  const sql = getSqlClient();
  const payload = toSqlStudentPayload(studentDocument, userDocument);
  const params = buildStudentSqlParams(payload)
    .filter((param) => param.name !== 'CreatedAt');
  const result = await executeStoredProcedure('dbo.spStudentUpdate', params);
  lastStudentSyncAt = Date.now();
  return mapStudentRow(result?.recordset?.[0]);
};

const deleteStudentMirror = async (studentId) => {
  await ensureStudentSqlReady();
  const sql = getSqlClient();
  await executeStoredProcedure('dbo.spStudentDelete', [
    { name: 'MongoStudentId', type: sql.NVarChar(64), value: String(studentId) },
  ]);
  lastStudentSyncAt = Date.now();
};

const getStudentFullProfile = async (studentId) => {
  await ensureStudentSqlReady();
  return getStudentFullProfileFromSqlRecord(studentId);
};

const getStudentCount = async ({ onlyActive = true } = {}) => {
  await ensureStudentSqlReady();
  const sql = getSqlClient();
  logStudentSqlRead('query:StudentsCount', { OnlyActive: !!onlyActive });
  const result = await executeQuery(`
    SELECT COUNT(1) AS TotalCount
    FROM dbo.Students S
    WHERE (
      @OnlyActive = 0
      OR S.Status IS NULL
      OR LTRIM(RTRIM(LOWER(S.Status))) <> 'inactive'
    )
  `, [
    { name: 'OnlyActive', type: sql.Bit, value: !!onlyActive },
  ]);

  return Number(result?.recordset?.[0]?.TotalCount || 0);
};

const getStudentsByClass = async (className) => {
  const normalizedClassName = toNullableString(className);
  if (!normalizedClassName) {
    return [];
  }

  await ensureStudentSqlReady();
  const sql = getSqlClient();
  logStudentSqlRead('query:ClassIdByName', { ClassName: normalizedClassName });
  const classLookup = await executeQuery(`
    SELECT TOP 1 ClassId
    FROM dbo.Classes
    WHERE ClassName = @ClassName
  `, [
    { name: 'ClassName', type: sql.NVarChar(100), value: normalizedClassName },
  ]);
  const classId = normalizeStudentNumericId(classLookup?.recordset?.[0]?.ClassId);
  if (!classId) {
    return [];
  }

  const result = await executeStudentReadProcedure('dbo.usp_Class_Students', [
    { name: 'ClassId', type: sql.Int, value: classId },
  ]);

  const realRows = await getRealStudentRowsByIds((result?.recordset || []).map((row) => row.StudentId));
  const students = await hydrateRealStudentRows(realRows);
  return sortRealStudents(
    students.filter((student) => (student.className || student.class) === normalizedClassName),
    'fullName',
    'asc'
  );
};

const getStudentByUserId = async (mongoUserId) => {
  if (!mongoUserId) {
    return null;
  }

  await ensureStudentSqlReady();
  return getStudentByUserIdFromSqlRecord(mongoUserId);
};

const getStudentByRollNumber = async (rollNumber) => {
  const normalizedRollNumber = toNullableString(rollNumber);
  if (!normalizedRollNumber) {
    return null;
  }

  await ensureStudentSqlReady();
  return getStudentByRollNumberFromSqlRecord(normalizedRollNumber);
};

const getCurrentAcademicYearId = async (tx = null, preferredYearName = null) => {
  const sql = getSqlClient();
  const runner = tx?.query || executeQuery;
  const normalizedYearName = toNullableString(preferredYearName);

  if (normalizedYearName) {
    const preferredYear = await runner(
      `SELECT TOP 1 AcademicYearId
       FROM dbo.AcademicYears
       WHERE YearName = @YearName`,
      [{ name: 'YearName', type: sql.NVarChar(20), value: normalizedYearName }]
    );
    const preferredYearId = normalizeStudentNumericId(preferredYear?.recordset?.[0]?.AcademicYearId);
    if (preferredYearId) {
      return preferredYearId;
    }
  }

  const currentYear = await runner(`
    SELECT TOP 1 AcademicYearId
    FROM dbo.AcademicYears
    WHERE IsCurrent = 1
    ORDER BY AcademicYearId DESC
  `);

  return normalizeStudentNumericId(currentYear?.recordset?.[0]?.AcademicYearId);
};

const resolveClassSectionContext = async ({ className, sectionName, academicYear = null }, tx = null) => {
  const normalizedClassName = toNullableString(className);
  const normalizedSectionName = toNullableString(sectionName) || 'A';
  if (!normalizedClassName) {
    throw new Error('Class is required.');
  }

  const sql = getSqlClient();
  const runner = tx?.query || executeQuery;
  const classLookup = await runner(
    `SELECT TOP 1
       c.ClassId,
       c.AcademicYearId,
       sec.SectionId
     FROM dbo.Classes c
     LEFT JOIN dbo.Sections sec
       ON sec.ClassId = c.ClassId
      AND sec.SectionName = @SectionName
     WHERE c.ClassName = @ClassName
       AND ISNULL(c.IsActive, 1) = 1
     ORDER BY c.ClassId DESC`,
    [
      { name: 'ClassName', type: sql.NVarChar(100), value: normalizedClassName },
      { name: 'SectionName', type: sql.NVarChar(50), value: normalizedSectionName },
    ]
  );

  const row = classLookup?.recordset?.[0] || null;
  const classId = normalizeStudentNumericId(row?.ClassId);
  if (!classId) {
    throw new Error(`Class '${normalizedClassName}' was not found in SQL Server.`);
  }

  const sectionId = normalizeStudentNumericId(row?.SectionId);
  if (!sectionId) {
    throw new Error(`Section '${normalizedSectionName}' was not found for class '${normalizedClassName}'.`);
  }

  const academicYearId =
    normalizeStudentNumericId(row?.AcademicYearId) ||
    await getCurrentAcademicYearId(tx, academicYear);

  if (!academicYearId) {
    throw new Error('No active academic year was found in SQL Server.');
  }

  return {
    classId,
    sectionId,
    academicYearId,
    className: normalizedClassName,
    sectionName: normalizedSectionName,
  };
};

const generateAdmissionNumber = async (tx = null) => {
  const runner = tx?.query || executeQuery;
  const result = await runner(`
    SELECT TOP 1 StudentId
    FROM dbo.Students
    ORDER BY StudentId DESC
  `);
  const nextStudentId = Number(result?.recordset?.[0]?.StudentId || 0) + 1;
  return `ADM${String(nextStudentId).padStart(5, '0')}`;
};

const upsertPrimaryGuardian = async ({ studentId, guardianName, guardianPhone, guardianRelation, address = {} }, tx = null) => {
  const normalizedStudentId = normalizeStudentNumericId(studentId);
  if (!normalizedStudentId) {
    return;
  }

  const normalizedGuardianName = toNullableString(guardianName);
  const normalizedGuardianPhone = toNullableString(guardianPhone);
  const normalizedGuardianRelation = toNullableString(guardianRelation) || 'Guardian';
  if (!normalizedGuardianName && !normalizedGuardianPhone) {
    return;
  }

  const normalizedAddress = normalizeAddress(address);
  const sql = getSqlClient();
  const runner = tx?.query || executeQuery;
  const existingGuardian = await runner(
    `SELECT TOP 1 GuardianId
     FROM dbo.Guardians
     WHERE StudentId = @StudentId
     ORDER BY IsPrimaryGuardian DESC, GuardianId ASC`,
    [{ name: 'StudentId', type: sql.Int, value: normalizedStudentId }]
  );
  const guardianId = normalizeStudentNumericId(existingGuardian?.recordset?.[0]?.GuardianId);

  if (guardianId) {
    await runner(
      `UPDATE dbo.Guardians
       SET FullName = @FullName,
           Relation = @Relation,
           Phone = @Phone,
           AddressLine1 = @AddressLine1,
           City = @City,
           State = @State,
           PostalCode = @PostalCode,
           UpdatedAt = SYSUTCDATETIME()
       WHERE GuardianId = @GuardianId`,
      [
        { name: 'GuardianId', type: sql.Int, value: guardianId },
        { name: 'FullName', type: sql.NVarChar(200), value: normalizedGuardianName || 'Guardian' },
        { name: 'Relation', type: sql.NVarChar(50), value: normalizedGuardianRelation },
        { name: 'Phone', type: sql.NVarChar(40), value: normalizedGuardianPhone },
        { name: 'AddressLine1', type: sql.NVarChar(255), value: normalizedAddress.street },
        { name: 'City', type: sql.NVarChar(120), value: normalizedAddress.city },
        { name: 'State', type: sql.NVarChar(120), value: normalizedAddress.state },
        { name: 'PostalCode', type: sql.NVarChar(20), value: normalizedAddress.pincode },
      ]
    );
    return;
  }

  await runner(
    `INSERT INTO dbo.Guardians (
       StudentId,
       FullName,
       Relation,
       Phone,
       AddressLine1,
       City,
       State,
       PostalCode,
       IsPrimaryGuardian,
       CreatedAt,
       UpdatedAt
     )
     VALUES (
       @StudentId,
       @FullName,
       @Relation,
       @Phone,
       @AddressLine1,
       @City,
       @State,
       @PostalCode,
       1,
       SYSUTCDATETIME(),
       SYSUTCDATETIME()
     )`,
    [
      { name: 'StudentId', type: sql.Int, value: normalizedStudentId },
      { name: 'FullName', type: sql.NVarChar(200), value: normalizedGuardianName || 'Guardian' },
      { name: 'Relation', type: sql.NVarChar(50), value: normalizedGuardianRelation },
      { name: 'Phone', type: sql.NVarChar(40), value: normalizedGuardianPhone },
      { name: 'AddressLine1', type: sql.NVarChar(255), value: normalizedAddress.street },
      { name: 'City', type: sql.NVarChar(120), value: normalizedAddress.city },
      { name: 'State', type: sql.NVarChar(120), value: normalizedAddress.state },
      { name: 'PostalCode', type: sql.NVarChar(20), value: normalizedAddress.pincode },
    ]
  );
};

const createStudentRecord = async ({
  userId = null,
  fullName,
  email,
  phone,
  admissionNumber = null,
  className,
  sectionName,
  rollNumber,
  dateOfBirth = null,
  gender = null,
  address = {},
  guardianName = null,
  guardianPhone = null,
  guardianRelation = null,
  bloodGroup = null,
  admissionDate = null,
  academicYear = null,
  isActive = true,
} = {}) => {
  await ensureStudentSqlReady();

  const normalizedRollNumber = toNullableString(rollNumber);
  if (!normalizedRollNumber) {
    throw new Error('Roll number is required.');
  }

  const createdStudentId = await executeInTransaction(async (tx) => {
    const sql = getSqlClient();
    const context = await resolveClassSectionContext({ className, sectionName, academicYear }, tx);
    const nameParts = splitFullName(fullName);
    const normalizedAddress = normalizeAddress(address);
    const resolvedAdmissionNumber = toNullableString(admissionNumber) || await generateAdmissionNumber(tx);
    const result = await tx.query(
      `INSERT INTO dbo.Students (
         UserId,
         AdmissionNumber,
         RollNumber,
         AcademicYearId,
         ClassId,
         SectionId,
         FirstName,
         LastName,
         Gender,
         DateOfBirth,
         BloodGroup,
         Phone,
         Email,
         AddressLine1,
         AddressLine2,
         City,
         State,
         PostalCode,
         Country,
         AdmissionDate,
         Status,
         CreatedAt,
         UpdatedAt
       )
       OUTPUT INSERTED.StudentId
       VALUES (
         @UserId,
         @AdmissionNumber,
         @RollNumber,
         @AcademicYearId,
         @ClassId,
         @SectionId,
         @FirstName,
         @LastName,
         @Gender,
         @DateOfBirth,
         @BloodGroup,
         @Phone,
         @Email,
         @AddressLine1,
         @AddressLine2,
         @City,
         @State,
         @PostalCode,
         @Country,
         @AdmissionDate,
         @Status,
         SYSUTCDATETIME(),
         SYSUTCDATETIME()
       )`,
      [
        { name: 'UserId', type: sql.Int, value: normalizeStudentNumericId(userId) },
        { name: 'AdmissionNumber', type: sql.NVarChar(50), value: resolvedAdmissionNumber },
        { name: 'RollNumber', type: sql.NVarChar(50), value: normalizedRollNumber },
        { name: 'AcademicYearId', type: sql.Int, value: context.academicYearId },
        { name: 'ClassId', type: sql.Int, value: context.classId },
        { name: 'SectionId', type: sql.Int, value: context.sectionId },
        { name: 'FirstName', type: sql.NVarChar(100), value: nameParts.firstName || 'Student' },
        { name: 'LastName', type: sql.NVarChar(100), value: nameParts.lastName },
        { name: 'Gender', type: sql.NVarChar(20), value: toNullableString(gender) },
        { name: 'DateOfBirth', type: sql.Date, value: toNullableDate(dateOfBirth) },
        { name: 'BloodGroup', type: sql.NVarChar(20), value: toNullableString(bloodGroup) },
        { name: 'Phone', type: sql.NVarChar(20), value: toNullableString(phone) },
        { name: 'Email', type: sql.NVarChar(150), value: toNullableString(email) },
        { name: 'AddressLine1', type: sql.NVarChar(255), value: normalizedAddress.street },
        { name: 'AddressLine2', type: sql.NVarChar(255), value: normalizedAddress.line2 },
        { name: 'City', type: sql.NVarChar(120), value: normalizedAddress.city },
        { name: 'State', type: sql.NVarChar(120), value: normalizedAddress.state },
        { name: 'PostalCode', type: sql.NVarChar(20), value: normalizedAddress.pincode },
        { name: 'Country', type: sql.NVarChar(100), value: normalizedAddress.country },
        { name: 'AdmissionDate', type: sql.Date, value: toNullableDate(admissionDate) },
        { name: 'Status', type: sql.NVarChar(20), value: isActive === false ? 'Inactive' : 'Active' },
      ]
    );

    const studentId = normalizeStudentNumericId(result?.recordset?.[0]?.StudentId);
    if (!studentId) {
      throw new Error('Failed to create student row in SQL Server.');
    }

    await upsertPrimaryGuardian({
      studentId,
      guardianName,
      guardianPhone,
      guardianRelation,
      address: normalizedAddress,
    }, tx);

    return studentId;
  });

  return getStudentByIdFromSqlRecord(createdStudentId);
};

const promoteStudentPortalProfileToStudentRecord = async (profileId) => {
  await ensureStudentSqlReady();

  const portalProfile = await getStudentPortalProfileById(profileId);
  if (!portalProfile) {
    return { profile: null, student: null, resultCode: 'not_found' };
  }

  if (portalProfile.hasLinkedStudentRecord && portalProfile.linkedStudentId) {
    return {
      profile: portalProfile,
      student: await getStudentByIdFromSqlRecord(portalProfile.linkedStudentId),
      resultCode: 'already_linked',
    };
  }

  const authUserId = normalizeStudentNumericId(portalProfile.userId?._id || portalProfile.userId);
  if (!authUserId) {
    throw new Error('This portal profile is not linked to a SQL student login user.');
  }

  const requiredFieldMap = {
    fullName: 'full name',
    email: 'email',
    className: 'class',
    sectionName: 'section',
    rollNumber: 'roll number',
  };
  const missingFields = Object.entries(requiredFieldMap)
    .filter(([key]) => !toNullableString(portalProfile[key]))
    .map(([, label]) => label);

  if (missingFields.length) {
    throw new Error(`Complete the portal profile before promotion. Missing: ${missingFields.join(', ')}.`);
  }

  const existingByUserId = await executeQuery(
    `SELECT TOP 1 StudentId
     FROM dbo.Students
     WHERE UserId = @UserId`,
    [{ name: 'UserId', type: getSqlClient().Int, value: authUserId }]
  );
  if (normalizeStudentNumericId(existingByUserId?.recordset?.[0]?.StudentId)) {
    return {
      profile: await getStudentPortalProfileById(profileId),
      student: await getStudentByIdFromSqlRecord(existingByUserId.recordset[0].StudentId),
      resultCode: 'already_linked',
    };
  }

  const existingRoll = await getStudentByRollNumberFromSqlRecord(portalProfile.rollNumber);
  if (existingRoll) {
    throw new Error('Roll number already exists in the master student records.');
  }

  if (portalProfile.admissionNumber) {
    const existingAdmission = await getStudentByAdmissionNumberFromSqlRecord(portalProfile.admissionNumber);
    if (existingAdmission) {
      throw new Error('Admission number already exists in the master student records.');
    }
  }

  const createdStudent = await createStudentRecord({
    userId: authUserId,
    fullName: portalProfile.fullName,
    email: portalProfile.email,
    phone: portalProfile.phone,
    admissionNumber: portalProfile.admissionNumber || null,
    className: portalProfile.className,
    sectionName: portalProfile.sectionName,
    rollNumber: portalProfile.rollNumber,
    dateOfBirth: portalProfile.dateOfBirth,
    gender: portalProfile.gender,
    address: {},
    guardianName: portalProfile.guardianName,
    guardianPhone: portalProfile.guardianPhone,
    guardianRelation: portalProfile.guardianRelation,
    bloodGroup: portalProfile.bloodGroup,
    admissionDate: portalProfile.admissionDate,
    isActive: portalProfile.isActive !== false,
  });

  return {
    profile: await getStudentPortalProfileById(profileId),
    student: createdStudent,
    resultCode: 'promoted',
  };
};

const updateStudentRecord = async (studentId, updates = {}) => {
  await ensureStudentSqlReady();
  const normalizedStudentId = normalizeStudentNumericId(studentId);
  if (!normalizedStudentId) {
    return null;
  }

  const existingStudent = await getStudentByIdFromSqlRecord(normalizedStudentId);
  if (!existingStudent) {
    return null;
  }

  await executeInTransaction(async (tx) => {
    const sql = getSqlClient();
    const context = await resolveClassSectionContext({
      className: updates.className ?? existingStudent.class,
      sectionName: updates.sectionName ?? existingStudent.section,
      academicYear: updates.academicYear ?? existingStudent.academicYear,
    }, tx);
    const nextFullName = toNullableString(updates.fullName) || existingStudent.fullName;
    const nameParts = splitFullName(nextFullName);
    const nextAddress = normalizeAddress(updates.address !== undefined ? updates.address : existingStudent.address);
    const nextIsActive = updates.isActive !== undefined ? updates.isActive !== false : existingStudent.isActive;

    await tx.query(
      `UPDATE dbo.Students
       SET UserId = @UserId,
           RollNumber = @RollNumber,
           AcademicYearId = @AcademicYearId,
           ClassId = @ClassId,
           SectionId = @SectionId,
           FirstName = @FirstName,
           LastName = @LastName,
           Gender = @Gender,
           DateOfBirth = @DateOfBirth,
           BloodGroup = @BloodGroup,
           Phone = @Phone,
           Email = @Email,
           AddressLine1 = @AddressLine1,
           AddressLine2 = @AddressLine2,
           City = @City,
           State = @State,
           PostalCode = @PostalCode,
           Country = @Country,
           AdmissionDate = @AdmissionDate,
           Status = @Status,
           UpdatedAt = SYSUTCDATETIME()
       WHERE StudentId = @StudentId`,
      [
        { name: 'StudentId', type: sql.Int, value: normalizedStudentId },
        { name: 'UserId', type: sql.Int, value: normalizeStudentNumericId(updates.userId ?? existingStudent.userId?._id) },
        { name: 'RollNumber', type: sql.NVarChar(50), value: toNullableString(updates.rollNumber) || existingStudent.rollNumber },
        { name: 'AcademicYearId', type: sql.Int, value: context.academicYearId },
        { name: 'ClassId', type: sql.Int, value: context.classId },
        { name: 'SectionId', type: sql.Int, value: context.sectionId },
        { name: 'FirstName', type: sql.NVarChar(100), value: nameParts.firstName || existingStudent.firstName || 'Student' },
        { name: 'LastName', type: sql.NVarChar(100), value: nameParts.lastName },
        { name: 'Gender', type: sql.NVarChar(20), value: updates.gender !== undefined ? toNullableString(updates.gender) : toNullableString(existingStudent.gender) },
        { name: 'DateOfBirth', type: sql.Date, value: updates.dateOfBirth !== undefined ? toNullableDate(updates.dateOfBirth) : toNullableDate(existingStudent.dateOfBirth) },
        { name: 'BloodGroup', type: sql.NVarChar(20), value: updates.bloodGroup !== undefined ? toNullableString(updates.bloodGroup) : toNullableString(existingStudent.bloodGroup) },
        { name: 'Phone', type: sql.NVarChar(20), value: updates.phone !== undefined ? toNullableString(updates.phone) : toNullableString(existingStudent.phone) },
        { name: 'Email', type: sql.NVarChar(150), value: updates.email !== undefined ? toNullableString(updates.email) : toNullableString(existingStudent.email) },
        { name: 'AddressLine1', type: sql.NVarChar(255), value: nextAddress.street },
        { name: 'AddressLine2', type: sql.NVarChar(255), value: nextAddress.line2 },
        { name: 'City', type: sql.NVarChar(120), value: nextAddress.city },
        { name: 'State', type: sql.NVarChar(120), value: nextAddress.state },
        { name: 'PostalCode', type: sql.NVarChar(20), value: nextAddress.pincode },
        { name: 'Country', type: sql.NVarChar(100), value: nextAddress.country },
        { name: 'AdmissionDate', type: sql.Date, value: updates.admissionDate !== undefined ? toNullableDate(updates.admissionDate) : toNullableDate(existingStudent.admissionDate) },
        { name: 'Status', type: sql.NVarChar(20), value: nextIsActive ? 'Active' : 'Inactive' },
      ]
    );

    await upsertPrimaryGuardian({
      studentId: normalizedStudentId,
      guardianName: updates.guardianName !== undefined ? updates.guardianName : existingStudent.guardianName,
      guardianPhone: updates.guardianPhone !== undefined ? updates.guardianPhone : existingStudent.guardianPhone,
      guardianRelation: updates.guardianRelation !== undefined ? updates.guardianRelation : existingStudent.guardianRelation,
      address: nextAddress,
    }, tx);
  });

  return getStudentByIdFromSqlRecord(normalizedStudentId);
};

const deleteStudentRecord = async (studentId) => {
  await ensureStudentSqlReady();
  const normalizedStudentId = normalizeStudentNumericId(studentId);
  if (!normalizedStudentId) {
    return { resultCode: 'not_found' };
  }

  const student = await getStudentByIdFromSqlRecord(normalizedStudentId);
  if (!student) {
    return { resultCode: 'not_found' };
  }

  const sql = getSqlClient();
  await executeQuery(
    `UPDATE dbo.Students
     SET Status = N'Inactive',
         UpdatedAt = SYSUTCDATETIME()
     WHERE StudentId = @StudentId`,
    [{ name: 'StudentId', type: sql.Int, value: normalizedStudentId }]
  );

  return { resultCode: 'ok' };
};

const syncSectionsFromStudents = async () => {
  await ensureStudentSqlReady();

  const sql = getSqlClient();
  // Get all unique class/section combos from SQL Students (populated from Mongo)
  const studentCombos = await executeQuery(`
    SELECT DISTINCT 
      ClassName, 
      SectionName
    FROM ${STUDENT_TABLE}
    WHERE ClassName IS NOT NULL 
      AND SectionName IS NOT NULL 
      AND LEN(LTRIM(RTRIM(ClassName))) > 0
      AND LEN(LTRIM(RTRIM(SectionName))) > 0
  `);

  const createdSections = [];
  for (const combo of studentCombos.recordset || []) {
    const className = toNullableString(combo.ClassName);
    const sectionName = toNullableString(combo.SectionName);
    
    if (!className || !sectionName) continue;

    // Resolve class ID first
    const classResult = await executeQuery(
      `SELECT TOP 1 ClassId FROM dbo.Classes 
       WHERE ClassName = @ClassName AND ISNULL(IsActive, 1) = 1`,
      [{ name: 'ClassName', type: sql.NVarChar(100), value: className }]
    );
    
    const classId = normalizeStudentNumericId(classResult?.recordset?.[0]?.ClassId);
    if (!classId) continue;

    // Check if section exists
    const existingSection = await executeQuery(
      `SELECT TOP 1 SectionId FROM dbo.Sections 
       WHERE ClassId = @ClassId AND SectionName = @SectionName AND ISNULL(IsActive, 1) = 1`,
      [
        { name: 'ClassId', type: sql.Int, value: classId },
        { name: 'SectionName', type: sql.NVarChar(50), value: sectionName }
      ]
    );

    if (!existingSection?.recordset?.[0]) {
      // Auto-create section
      const insertResult = await executeQuery(
        `INSERT INTO dbo.Sections (ClassId, SectionName, IsActive, CreatedAt)
         OUTPUT INSERTED.SectionId
         VALUES (@ClassId, @SectionName, 1, SYSUTCDATETIME())`,
        [
          { name: 'ClassId', type: sql.Int, value: classId },
          { name: 'SectionName', type: sql.NVarChar(50), value: sectionName }
        ]
      );
      const sectionId = normalizeStudentNumericId(insertResult?.recordset?.[0]?.SectionId);
      createdSections.push({ className, sectionName, classId, sectionId });
    }
  }

  console.log(`✅ Synced ${studentCombos.recordset?.length || 0} class/section combos. Created ${createdSections.length} new sections.`);
  return { totalCombos: studentCombos.recordset?.length || 0, createdSections };
};

module.exports = {
  ensureStudentSqlReady,
  syncStudentMirror,
  syncStudentById,
  syncAllStudentsToSql,
  syncSectionsFromStudents,  // ← NEW: Attendance fix sync
  getStudentList,
  getAllStudents,
  getStudentById,
  createStudentRecord,
  promoteStudentPortalProfileToStudentRecord,
  updateStudentRecord,
  deleteStudentRecord,
  createStudentMirror,
  updateStudentMirror,
  deleteStudentMirror,
  getStudentFullProfile,
  getStudentCount,
  getStudentsByClass,
  getStudentByUserId,
  getStudentByRollNumber,
  getStudentPortalProfileById,
  listStudentPortalProfiles,
  updateStudentPortalProfileRecord,
};
