const mongoose = require('mongoose');
const Student = require('../models/Student');
const User = require('../models/User');
const {
  getSqlClient,
  executeQuery,
  executeStoredProcedure,
  getPool,
} = require('../config/sqlServer');
const { ensureAuthSqlReady } = require('./authSqlService');

const STUDENT_TABLE = 'dbo.SqlStudents';
const FULL_SYNC_TTL_MS = 30000;

let studentBootstrapPromise = null;
let studentMirrorSyncPromise = null;
let lastStudentMirrorSyncAt = 0;

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
      city: null,
      state: null,
      pincode: null,
    };
  }

  return {
    street: toNullableString(value.street),
    city: toNullableString(value.city),
    state: toNullableString(value.state),
    pincode: toNullableString(value.pincode),
  };
};

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

const escapeSqlLiteral = (value = '') => String(value).replace(/'/g, "''");

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
  DELETE FROM ${STUDENT_TABLE} WHERE MongoStudentId = @MongoStudentId;

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
  return mapStudentRow(result?.recordset?.[0]);
};

const syncStudentById = async (studentId) => {
  if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
    return null;
  }

  const student = await Student.findById(studentId);
  if (!student) {
    return null;
  }

  const user = student.userId ? await User.findById(student.userId) : null;
  return syncStudentMirror(student, user);
};

const pruneDeletedStudentsFromMirror = async (studentIds) => {
  const sql = getSqlClient();

  if (!studentIds.length) {
    await executeQuery(`DELETE FROM ${STUDENT_TABLE}`);
    return;
  }

  const safeIds = studentIds
    .map((id) => escapeSqlLiteral(id))
    .filter(Boolean)
    .map((id) => `N'${id}'`)
    .join(', ');

  await executeQuery(
    `DELETE FROM ${STUDENT_TABLE} WHERE MongoStudentId NOT IN (${safeIds})`
  );
};

const syncAllStudentsToSql = async ({ force = false } = {}) => {
  if (!force && Date.now() - lastStudentMirrorSyncAt < FULL_SYNC_TTL_MS) {
    return;
  }

  if (!studentMirrorSyncPromise) {
    studentMirrorSyncPromise = (async () => {
      await ensureStudentSqlReady();

      const students = await Student.find({}).lean();
      const studentIds = students.map((student) => String(student._id));

      if (!students.length) {
        await pruneDeletedStudentsFromMirror([]);
        lastStudentMirrorSyncAt = Date.now();
        return;
      }

      const userIds = [
        ...new Set(
          students
            .map((student) => (student.userId ? String(student.userId) : null))
            .filter(Boolean)
        ),
      ];

      const users = userIds.length
        ? await User.find({ _id: { $in: userIds } }).lean()
        : [];
      const userMap = new Map(users.map((user) => [String(user._id), user]));

      for (const student of students) {
        const user = student.userId ? userMap.get(String(student.userId)) : null;
        await syncStudentMirror(student, user);
      }

      await pruneDeletedStudentsFromMirror(studentIds);
      lastStudentMirrorSyncAt = Date.now();
    })().finally(() => {
      studentMirrorSyncPromise = null;
    });
  }

  return studentMirrorSyncPromise;
};

const getStudentList = async ({
  page = 1,
  limit = 10,
  search = null,
  className = null,
  sectionName = null,
  sortBy = 'createdAt',
  sortOrder = 'desc',
}) => {
  await syncAllStudentsToSql();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spStudentList', [
    { name: 'Page', type: sql.Int, value: Number(page) || 1 },
    { name: 'Limit', type: sql.Int, value: Number(limit) || 10 },
    { name: 'Search', type: sql.NVarChar(200), value: toNullableString(search) },
    { name: 'ClassName', type: sql.NVarChar(100), value: toNullableString(className) },
    { name: 'SectionName', type: sql.NVarChar(50), value: toNullableString(sectionName) },
    { name: 'SortBy', type: sql.NVarChar(50), value: toNullableString(sortBy) || 'createdAt' },
    { name: 'SortOrder', type: sql.NVarChar(4), value: toNullableString(sortOrder) || 'desc' },
  ]);

  const rows = result?.recordset || [];
  const total = rows.length ? Number(rows[0].TotalCount || 0) : 0;

  return {
    students: rows.map(mapStudentRow),
    total,
    page: Number(page) || 1,
    limit: Number(limit) || 10,
  };
};

const getAllStudents = async () => {
  const list = await getStudentList({ page: 1, limit: 10000, sortBy: 'fullName', sortOrder: 'asc' });
  return list.students;
};

const getStudentById = async (studentId) => {
  await ensureStudentSqlReady();
  await syncStudentById(studentId);

  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spStudentGetById', [
    { name: 'MongoStudentId', type: sql.NVarChar(64), value: String(studentId) },
  ]);

  return mapStudentRow(result?.recordset?.[0]);
};

const createStudentMirror = async (studentDocument, userDocument = null) => {
  await ensureStudentSqlReady();
  const payload = toSqlStudentPayload(studentDocument, userDocument);
  const result = await executeStoredProcedure('dbo.spStudentCreate', buildStudentSqlParams(payload));
  lastStudentMirrorSyncAt = Date.now();
  return mapStudentRow(result?.recordset?.[0]);
};

const updateStudentMirror = async (studentDocument, userDocument = null) => {
  await ensureStudentSqlReady();
  const sql = getSqlClient();
  const payload = toSqlStudentPayload(studentDocument, userDocument);
  const params = buildStudentSqlParams(payload)
    .filter((param) => param.name !== 'CreatedAt');
  const result = await executeStoredProcedure('dbo.spStudentUpdate', params);
  lastStudentMirrorSyncAt = Date.now();
  return mapStudentRow(result?.recordset?.[0]);
};

const deleteStudentMirror = async (studentId) => {
  await ensureStudentSqlReady();
  const sql = getSqlClient();
  await executeStoredProcedure('dbo.spStudentDelete', [
    { name: 'MongoStudentId', type: sql.NVarChar(64), value: String(studentId) },
  ]);
  lastStudentMirrorSyncAt = 0;
};

const getStudentFullProfile = async (studentId) => {
  await ensureStudentSqlReady();
  await syncStudentById(studentId);

  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spStudentGetFullProfile', [
    { name: 'MongoStudentId', type: sql.NVarChar(64), value: String(studentId) },
  ]);

  const recordsets = result?.recordsets || [];
  return {
    student: mapStudentRow(recordsets[0]?.[0]),
    parentSnapshot: recordsets[1]?.[0] || null,
    academicSnapshot: recordsets[2]?.[0] || null,
  };
};

const getStudentCount = async ({ onlyActive = true } = {}) => {
  await syncAllStudentsToSql();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spStudentGetCount', [
    { name: 'OnlyActive', type: sql.Bit, value: !!onlyActive },
  ]);

  return Number(result?.recordset?.[0]?.TotalCount || 0);
};

const getStudentsByClass = async (className) => {
  await syncAllStudentsToSql();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spStudentListByClass', [
    { name: 'ClassName', type: sql.NVarChar(100), value: String(className || '') },
  ]);

  return (result?.recordset || []).map((row) => ({
    _id: row.MongoStudentId,
    studentId: row.MongoStudentId,
    fullName: row.FullName,
    rollNumber: row.RollNumber,
    section: row.SectionName,
    sectionId: row.SectionName,
    email: row.Email || null,
    phone: row.Phone || null,
    guardianName: row.GuardianName || '',
    guardianPhone: row.GuardianPhone || '',
    isActive: row.IsActive === true || row.IsActive === 1,
  }));
};

module.exports = {
  ensureStudentSqlReady,
  syncStudentMirror,
  syncStudentById,
  syncAllStudentsToSql,
  getStudentList,
  getAllStudents,
  getStudentById,
  createStudentMirror,
  updateStudentMirror,
  deleteStudentMirror,
  getStudentFullProfile,
  getStudentCount,
  getStudentsByClass,
};
