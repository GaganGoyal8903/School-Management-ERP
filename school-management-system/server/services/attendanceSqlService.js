const {
  getSqlClient,
  executeQuery,
  executeStoredProcedure,
  executeInTransaction,
  getPool,
} = require('../config/sqlServer');
const { ensureAuthSqlReady } = require('./authSqlService');
const { ensureStudentSqlReady } = require('./studentSqlService');

const ATTENDANCE_HEADER_TABLE = 'dbo.SqlAttendanceHeaders';
const ATTENDANCE_DETAIL_TABLE = 'dbo.SqlAttendanceDetails';
let attendanceBootstrapPromise = null;
const ATTENDANCE_STATUSES = ['Present', 'Absent', 'Late', 'Half Day', 'Excused'];

const parseNumericId = (value) => {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
};

const normalizeDateOnly = (value) => {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const toNullableString = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
};

const normalizeAttendanceStatus = (value) => {
  const normalized = toNullableString(value);
  if (!normalized) {
    return 'Absent';
  }

  const matchedStatus = ATTENDANCE_STATUSES.find(
    (status) => status.toLowerCase() === normalized.toLowerCase()
  );

  return matchedStatus || normalized;
};

const normalizeTimeValue = (value) => {
  const normalized = toNullableString(value);
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return null;
  }

  const [, hoursText, minutesText, secondsText = '00'] = match;
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  const seconds = Number(secondsText);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    !Number.isInteger(seconds) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const buildNumericIdParams = (values, prefix, sqlType) => {
  const params = [];
  const placeholders = [];

  values.forEach((value, index) => {
    const name = `${prefix}${index}`;
    placeholders.push(`@${name}`);
    params.push({ name, type: sqlType, value });
  });

  return {
    placeholders: placeholders.join(', '),
    params,
  };
};

const uniqueBy = (items, getKey) => {
  const map = new Map();

  for (const item of items) {
    const key = getKey(item);
    if (key === null || key === undefined || key === '') {
      continue;
    }
    map.set(key, item);
  }

  return [...map.values()];
};

const createAttendanceValidationError = (message, invalidStudents = []) => {
  const error = new Error(message);
  error.code = 'ATTENDANCE_VALIDATION_FAILED';
  error.statusCode = 400;
  error.invalidStudents = Array.isArray(invalidStudents) ? invalidStudents : [];
  return error;
};

const REAL_ATTENDANCE_SCHEMA_BATCHES = [
  `
IF COL_LENGTH(N'dbo.StudentAttendanceDetails', N'RollNumber') IS NULL
BEGIN
  ALTER TABLE dbo.StudentAttendanceDetails
  ADD RollNumber NVARCHAR(100) NULL;
END;
`,
  `
IF COL_LENGTH(N'dbo.StudentAttendance', N'MarkedByUserId') IS NULL
BEGIN
  ALTER TABLE dbo.StudentAttendance
  ADD MarkedByUserId INT NULL;
END;
`,
  `
UPDATE sad
SET RollNumber = s.RollNumber
FROM dbo.StudentAttendanceDetails sad
INNER JOIN dbo.Students s
  ON s.StudentId = sad.StudentId
WHERE ISNULL(LTRIM(RTRIM(sad.RollNumber)), N'') = N'';
`,
  `
UPDATE sa
SET MarkedByUserId = t.UserId
FROM dbo.StudentAttendance sa
INNER JOIN dbo.Teachers t
  ON t.TeacherId = sa.MarkedByTeacherId
WHERE sa.MarkedByUserId IS NULL
  AND t.UserId IS NOT NULL;
`,
  `
IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'IX_StudentAttendance_AttendanceDateClassSection'
    AND object_id = OBJECT_ID(N'dbo.StudentAttendance')
)
BEGIN
  CREATE INDEX IX_StudentAttendance_AttendanceDateClassSection
  ON dbo.StudentAttendance(AttendanceDate, ClassId, SectionId, AttendanceId DESC);
END;
`,
  `
IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'IX_StudentAttendanceDetails_AttendanceStudent'
    AND object_id = OBJECT_ID(N'dbo.StudentAttendanceDetails')
)
BEGIN
  CREATE INDEX IX_StudentAttendanceDetails_AttendanceStudent
  ON dbo.StudentAttendanceDetails(AttendanceId, StudentId, AttendanceDetailId DESC);
END;
`,
];

const mapAttendanceRow = (row) => {
  if (!row) {
    return null;
  }

  const attendanceDetailId = row.AttendanceDetailId ?? row.MongoAttendanceId ?? null;
  const studentId = row.StudentId ?? row.MongoStudentId ?? null;
  const markedByUserId = row.MarkedByUserId ?? row.TeacherUserId ?? row.MarkedByMongoUserId ?? null;
  const rollNumber = row.RollNumber || row.StudentRollNumber || null;

  return {
    _id: attendanceDetailId !== null && attendanceDetailId !== undefined ? String(attendanceDetailId) : null,
    id: attendanceDetailId !== null && attendanceDetailId !== undefined ? String(attendanceDetailId) : null,
    attendanceId: row.AttendanceId !== undefined && row.AttendanceId !== null ? String(row.AttendanceId) : null,
    studentId: row.StudentFullName
      ? {
          _id: String(studentId),
          fullName: row.StudentFullName,
          rollNumber,
        }
      : (studentId !== null && studentId !== undefined ? String(studentId) : null),
    rollNumber,
    date: row.AttendanceDate ? new Date(row.AttendanceDate) : null,
    academicYearId: row.AcademicYearId ?? null,
    classId: row.ClassId ?? null,
    sectionId: row.SectionId ?? null,
    status: row.Status,
    class: row.ClassName,
    section: row.SectionName || '',
    markedBy: row.MarkedByFullName
      ? {
          _id: markedByUserId !== null && markedByUserId !== undefined ? String(markedByUserId) : null,
          fullName: row.MarkedByFullName,
          role: row.MarkedByRoleName || null,
        }
      : (markedByUserId !== null && markedByUserId !== undefined ? String(markedByUserId) : null),
    markedByUserId: markedByUserId ?? null,
    markedByTeacherId: row.MarkedByTeacherId ?? null,
    remarks: row.Remarks || '',
    createdAt: row.CreatedAt ? new Date(row.CreatedAt) : null,
    updatedAt: row.UpdatedAt ? new Date(row.UpdatedAt) : (row.CreatedAt ? new Date(row.CreatedAt) : null),
    checkInTime: row.CheckInTime || null,
    checkOutTime: row.CheckOutTime || null,
  };
};

const buildAttendanceQueryFilters = ({
  studentId = null,
  classId = null,
  sectionId = null,
  className = null,
  sectionName = null,
  date = null,
  startDate = null,
  endDate = null,
  attendanceDetailId = null,
} = {}) => {
  const sql = getSqlClient();
  const clauses = [];
  const params = [];
  const studentSqlId = parseNumericId(studentId);
  const classSqlId = parseNumericId(classId);
  const sectionSqlId = parseNumericId(sectionId);
  const attendanceSqlId = parseNumericId(attendanceDetailId);

  if (attendanceSqlId) {
    clauses.push('sad.AttendanceDetailId = @AttendanceDetailId');
    params.push({ name: 'AttendanceDetailId', type: sql.Int, value: attendanceSqlId });
  }

  if (studentSqlId) {
    clauses.push('sad.StudentId = @StudentId');
    params.push({ name: 'StudentId', type: sql.Int, value: studentSqlId });
  }

  if (classSqlId) {
    clauses.push('sa.ClassId = @ClassId');
    params.push({ name: 'ClassId', type: sql.Int, value: classSqlId });
  }

  if (sectionSqlId) {
    clauses.push('sa.SectionId = @SectionId');
    params.push({ name: 'SectionId', type: sql.Int, value: sectionSqlId });
  }

  if (className) {
    clauses.push('c.ClassName = @ClassName');
    params.push({ name: 'ClassName', type: sql.NVarChar(100), value: toNullableString(className) });
  }

  if (sectionName) {
    clauses.push('sec.SectionName = @SectionName');
    params.push({ name: 'SectionName', type: sql.NVarChar(50), value: toNullableString(sectionName) });
  }

  if (date) {
    clauses.push('sa.AttendanceDate = @AttendanceDate');
    params.push({ name: 'AttendanceDate', type: sql.Date, value: normalizeDateOnly(date) });
  }

  if (startDate) {
    clauses.push('sa.AttendanceDate >= @StartDate');
    params.push({ name: 'StartDate', type: sql.Date, value: normalizeDateOnly(startDate) });
  }

  if (endDate) {
    clauses.push('sa.AttendanceDate <= @EndDate');
    params.push({ name: 'EndDate', type: sql.Date, value: normalizeDateOnly(endDate) });
  }

  return {
    params,
    whereClause: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
  };
};

const buildAttendanceBaseSelect = ({ includeTotalCount = false } = {}) => `
  SELECT
    sad.AttendanceDetailId,
    sa.AttendanceId,
    sad.StudentId,
    s.FullName AS StudentFullName,
    COALESCE(NULLIF(sad.RollNumber, N''), s.RollNumber) AS StudentRollNumber,
    sa.AttendanceDate,
    sa.AcademicYearId,
    sa.ClassId,
    sa.SectionId,
    sad.Status,
    c.ClassName,
    sec.SectionName,
    markerUser.UserId AS MarkedByUserId,
    sa.MarkedByTeacherId,
    markerUser.FullName AS MarkedByFullName,
    markerRole.RoleName AS MarkedByRoleName,
    COALESCE(NULLIF(sad.Remarks, N''), sa.Remarks, N'') AS Remarks,
    sad.CheckInTime,
    sad.CheckOutTime,
    sa.CreatedAt,
    sa.CreatedAt AS UpdatedAt
    ${includeTotalCount ? ', COUNT(1) OVER() AS TotalCount' : ''}
  FROM dbo.StudentAttendanceDetails sad
  INNER JOIN dbo.StudentAttendance sa
    ON sa.AttendanceId = sad.AttendanceId
  INNER JOIN dbo.Students s
    ON s.StudentId = sad.StudentId
  INNER JOIN dbo.Classes c
    ON c.ClassId = sa.ClassId
  LEFT JOIN dbo.Sections sec
    ON sec.SectionId = sa.SectionId
  LEFT JOIN dbo.Teachers t
    ON t.TeacherId = sa.MarkedByTeacherId
  LEFT JOIN dbo.Users markerUser
    ON markerUser.UserId = COALESCE(sa.MarkedByUserId, t.UserId)
  LEFT JOIN dbo.Roles markerRole
    ON markerRole.RoleId = markerUser.RoleId
`;

const buildAttendanceParams = ({
  mongoAttendanceId,
  mongoStudentId,
  attendanceDate,
  className,
  sectionName,
  status,
  remarks,
  markedByMongoUserId,
  createdAt,
  updatedAt,
}) => {
  const sql = getSqlClient();
  return [
    { name: 'MongoAttendanceId', type: sql.NVarChar(64), value: mongoAttendanceId },
    { name: 'MongoStudentId', type: sql.NVarChar(64), value: mongoStudentId },
    { name: 'AttendanceDate', type: sql.Date, value: attendanceDate },
    { name: 'ClassName', type: sql.NVarChar(100), value: className },
    { name: 'SectionName', type: sql.NVarChar(50), value: sectionName || '' },
    { name: 'Status', type: sql.NVarChar(20), value: status },
    { name: 'Remarks', type: sql.NVarChar(1000), value: remarks },
    { name: 'MarkedByMongoUserId', type: sql.NVarChar(64), value: markedByMongoUserId },
    { name: 'CreatedAt', type: sql.DateTime2(0), value: createdAt || new Date() },
    { name: 'UpdatedAt', type: sql.DateTime2(0), value: updatedAt || new Date() },
  ];
};

const ATTENDANCE_SCHEMA_BATCH = `
IF OBJECT_ID(N'${ATTENDANCE_HEADER_TABLE}', N'U') IS NULL
BEGIN
  CREATE TABLE ${ATTENDANCE_HEADER_TABLE} (
    SqlAttendanceHeaderId INT IDENTITY(1,1) PRIMARY KEY,
    AttendanceDate DATE NOT NULL,
    ClassName NVARCHAR(100) NOT NULL,
    SectionName NVARCHAR(50) NOT NULL CONSTRAINT DF_SqlAttendanceHeaders_SectionName DEFAULT (N''),
    MarkedByMongoUserId NVARCHAR(64) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlAttendanceHeaders_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlAttendanceHeaders_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SqlAttendanceHeaders_DateClassSection' AND object_id = OBJECT_ID(N'${ATTENDANCE_HEADER_TABLE}'))
BEGIN
  CREATE UNIQUE INDEX UX_SqlAttendanceHeaders_DateClassSection
  ON ${ATTENDANCE_HEADER_TABLE}(AttendanceDate, ClassName, SectionName);
END;

IF OBJECT_ID(N'${ATTENDANCE_DETAIL_TABLE}', N'U') IS NULL
BEGIN
  CREATE TABLE ${ATTENDANCE_DETAIL_TABLE} (
    SqlAttendanceDetailId INT IDENTITY(1,1) PRIMARY KEY,
    SqlAttendanceHeaderId INT NOT NULL,
    MongoAttendanceId NVARCHAR(64) NOT NULL,
    MongoStudentId NVARCHAR(64) NOT NULL,
    Status NVARCHAR(20) NOT NULL,
    Remarks NVARCHAR(1000) NULL,
    MarkedByMongoUserId NVARCHAR(64) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlAttendanceDetails_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlAttendanceDetails_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_SqlAttendanceDetails_Header FOREIGN KEY (SqlAttendanceHeaderId) REFERENCES ${ATTENDANCE_HEADER_TABLE}(SqlAttendanceHeaderId) ON DELETE CASCADE
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SqlAttendanceDetails_MongoAttendanceId' AND object_id = OBJECT_ID(N'${ATTENDANCE_DETAIL_TABLE}'))
BEGIN
  CREATE UNIQUE INDEX UX_SqlAttendanceDetails_MongoAttendanceId
  ON ${ATTENDANCE_DETAIL_TABLE}(MongoAttendanceId);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SqlAttendanceDetails_HeaderStudent' AND object_id = OBJECT_ID(N'${ATTENDANCE_DETAIL_TABLE}'))
BEGIN
  CREATE UNIQUE INDEX UX_SqlAttendanceDetails_HeaderStudent
  ON ${ATTENDANCE_DETAIL_TABLE}(SqlAttendanceHeaderId, MongoStudentId);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SqlAttendanceDetails_Student' AND object_id = OBJECT_ID(N'${ATTENDANCE_DETAIL_TABLE}'))
BEGIN
  CREATE INDEX IX_SqlAttendanceDetails_Student
  ON ${ATTENDANCE_DETAIL_TABLE}(MongoStudentId, UpdatedAt);
END;
`;

const ATTENDANCE_PROCEDURES_BATCH = `
CREATE OR ALTER PROCEDURE dbo.spAttendanceUpsertDetail
  @MongoAttendanceId NVARCHAR(64),
  @MongoStudentId NVARCHAR(64),
  @AttendanceDate DATE,
  @ClassName NVARCHAR(100),
  @SectionName NVARCHAR(50) = N'',
  @Status NVARCHAR(20),
  @Remarks NVARCHAR(1000) = NULL,
  @MarkedByMongoUserId NVARCHAR(64) = NULL,
  @CreatedAt DATETIME2(0),
  @UpdatedAt DATETIME2(0)
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @SqlAttendanceHeaderId INT;
  DECLARE @OperationType NVARCHAR(20) = N'created';
  DECLARE @EffectiveSection NVARCHAR(50) = ISNULL(@SectionName, N'');

  SELECT @SqlAttendanceHeaderId = SqlAttendanceHeaderId
  FROM ${ATTENDANCE_HEADER_TABLE}
  WHERE AttendanceDate = @AttendanceDate
    AND ClassName = @ClassName
    AND SectionName = @EffectiveSection;

  IF @SqlAttendanceHeaderId IS NULL
  BEGIN
    INSERT INTO ${ATTENDANCE_HEADER_TABLE} (
      AttendanceDate,
      ClassName,
      SectionName,
      MarkedByMongoUserId,
      CreatedAt,
      UpdatedAt
    )
    VALUES (
      @AttendanceDate,
      @ClassName,
      @EffectiveSection,
      @MarkedByMongoUserId,
      @CreatedAt,
      @UpdatedAt
    );

    SET @SqlAttendanceHeaderId = SCOPE_IDENTITY();
  END
  ELSE
  BEGIN
    UPDATE ${ATTENDANCE_HEADER_TABLE}
    SET MarkedByMongoUserId = @MarkedByMongoUserId,
        UpdatedAt = @UpdatedAt
    WHERE SqlAttendanceHeaderId = @SqlAttendanceHeaderId;
  END;

  IF EXISTS (
    SELECT 1
    FROM ${ATTENDANCE_DETAIL_TABLE}
    WHERE MongoAttendanceId = @MongoAttendanceId
       OR (SqlAttendanceHeaderId = @SqlAttendanceHeaderId AND MongoStudentId = @MongoStudentId)
  )
  BEGIN
    SET @OperationType = N'updated';

    UPDATE ${ATTENDANCE_DETAIL_TABLE}
    SET MongoAttendanceId = @MongoAttendanceId,
        SqlAttendanceHeaderId = @SqlAttendanceHeaderId,
        Status = @Status,
        Remarks = @Remarks,
        MarkedByMongoUserId = @MarkedByMongoUserId,
        UpdatedAt = @UpdatedAt
    WHERE MongoAttendanceId = @MongoAttendanceId
       OR (SqlAttendanceHeaderId = @SqlAttendanceHeaderId AND MongoStudentId = @MongoStudentId);
  END
  ELSE
  BEGIN
    INSERT INTO ${ATTENDANCE_DETAIL_TABLE} (
      SqlAttendanceHeaderId,
      MongoAttendanceId,
      MongoStudentId,
      Status,
      Remarks,
      MarkedByMongoUserId,
      CreatedAt,
      UpdatedAt
    )
    VALUES (
      @SqlAttendanceHeaderId,
      @MongoAttendanceId,
      @MongoStudentId,
      @Status,
      @Remarks,
      @MarkedByMongoUserId,
      @CreatedAt,
      @UpdatedAt
    );
  END;

  SELECT TOP 1
    @OperationType AS OperationType,
    d.MongoAttendanceId,
    d.MongoStudentId,
    h.AttendanceDate,
    h.ClassName,
    h.SectionName,
    d.Status,
    d.Remarks,
    d.MarkedByMongoUserId,
    d.CreatedAt,
    d.UpdatedAt,
    s.FullName AS StudentFullName,
    s.RollNumber AS StudentRollNumber,
    u.FullName AS MarkedByFullName
  FROM ${ATTENDANCE_DETAIL_TABLE} d
  INNER JOIN ${ATTENDANCE_HEADER_TABLE} h
    ON h.SqlAttendanceHeaderId = d.SqlAttendanceHeaderId
  LEFT JOIN dbo.SqlStudents s
    ON s.MongoStudentId = d.MongoStudentId
  LEFT JOIN dbo.SqlAuthUsers u
    ON u.MongoUserId = d.MarkedByMongoUserId
  WHERE d.MongoAttendanceId = @MongoAttendanceId;
END;

CREATE OR ALTER PROCEDURE dbo.spAttendanceGetById
  @MongoAttendanceId NVARCHAR(64)
AS
BEGIN
  SET NOCOUNT ON;

  SELECT TOP 1
    d.MongoAttendanceId,
    d.MongoStudentId,
    h.AttendanceDate,
    h.ClassName,
    h.SectionName,
    d.Status,
    d.Remarks,
    d.MarkedByMongoUserId,
    d.CreatedAt,
    d.UpdatedAt,
    s.FullName AS StudentFullName,
    s.RollNumber AS StudentRollNumber,
    u.FullName AS MarkedByFullName
  FROM ${ATTENDANCE_DETAIL_TABLE} d
  INNER JOIN ${ATTENDANCE_HEADER_TABLE} h
    ON h.SqlAttendanceHeaderId = d.SqlAttendanceHeaderId
  LEFT JOIN dbo.SqlStudents s
    ON s.MongoStudentId = d.MongoStudentId
  LEFT JOIN dbo.SqlAuthUsers u
    ON u.MongoUserId = d.MarkedByMongoUserId
  WHERE d.MongoAttendanceId = @MongoAttendanceId;
END;

CREATE OR ALTER PROCEDURE dbo.spAttendanceGetByStudentDate
  @MongoStudentId NVARCHAR(64),
  @AttendanceDate DATE
AS
BEGIN
  SET NOCOUNT ON;

  SELECT TOP 1
    d.MongoAttendanceId,
    d.MongoStudentId,
    h.AttendanceDate,
    h.ClassName,
    h.SectionName,
    d.Status,
    d.Remarks,
    d.MarkedByMongoUserId,
    d.CreatedAt,
    d.UpdatedAt,
    s.FullName AS StudentFullName,
    s.RollNumber AS StudentRollNumber,
    u.FullName AS MarkedByFullName
  FROM ${ATTENDANCE_DETAIL_TABLE} d
  INNER JOIN ${ATTENDANCE_HEADER_TABLE} h
    ON h.SqlAttendanceHeaderId = d.SqlAttendanceHeaderId
  LEFT JOIN dbo.SqlStudents s
    ON s.MongoStudentId = d.MongoStudentId
  LEFT JOIN dbo.SqlAuthUsers u
    ON u.MongoUserId = d.MarkedByMongoUserId
  WHERE d.MongoStudentId = @MongoStudentId
    AND h.AttendanceDate = @AttendanceDate;
END;

CREATE OR ALTER PROCEDURE dbo.spAttendanceList
  @MongoStudentId NVARCHAR(64) = NULL,
  @ClassName NVARCHAR(100) = NULL,
  @SectionName NVARCHAR(50) = NULL,
  @AttendanceDate DATE = NULL,
  @StartDate DATE = NULL,
  @EndDate DATE = NULL,
  @Page INT = 1,
  @Limit INT = 50
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @Offset INT = CASE WHEN ISNULL(@Page, 1) <= 1 THEN 0 ELSE (@Page - 1) * ISNULL(@Limit, 50) END;

  ;WITH Filtered AS (
    SELECT
      d.MongoAttendanceId,
      d.MongoStudentId,
      h.AttendanceDate,
      h.ClassName,
      h.SectionName,
      d.Status,
      d.Remarks,
      d.MarkedByMongoUserId,
      d.CreatedAt,
      d.UpdatedAt,
      s.FullName AS StudentFullName,
      s.RollNumber AS StudentRollNumber,
      u.FullName AS MarkedByFullName
    FROM ${ATTENDANCE_DETAIL_TABLE} d
    INNER JOIN ${ATTENDANCE_HEADER_TABLE} h
      ON h.SqlAttendanceHeaderId = d.SqlAttendanceHeaderId
    LEFT JOIN dbo.SqlStudents s
      ON s.MongoStudentId = d.MongoStudentId
    LEFT JOIN dbo.SqlAuthUsers u
      ON u.MongoUserId = d.MarkedByMongoUserId
    WHERE (@MongoStudentId IS NULL OR d.MongoStudentId = @MongoStudentId)
      AND (@ClassName IS NULL OR h.ClassName = @ClassName)
      AND (@SectionName IS NULL OR h.SectionName = @SectionName)
      AND (@AttendanceDate IS NULL OR h.AttendanceDate = @AttendanceDate)
      AND (@StartDate IS NULL OR h.AttendanceDate >= @StartDate)
      AND (@EndDate IS NULL OR h.AttendanceDate <= @EndDate)
  )
  SELECT *,
         COUNT(1) OVER() AS TotalCount
  FROM Filtered
  ORDER BY AttendanceDate DESC, UpdatedAt DESC
  OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
END;

CREATE OR ALTER PROCEDURE dbo.spAttendanceStudentReport
  @MongoStudentId NVARCHAR(64),
  @StartDate DATE = NULL,
  @EndDate DATE = NULL
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    d.MongoAttendanceId,
    d.MongoStudentId,
    h.AttendanceDate,
    h.ClassName,
    h.SectionName,
    d.Status,
    d.Remarks,
    d.MarkedByMongoUserId,
    d.CreatedAt,
    d.UpdatedAt,
    s.FullName AS StudentFullName,
    s.RollNumber AS StudentRollNumber,
    u.FullName AS MarkedByFullName
  FROM ${ATTENDANCE_DETAIL_TABLE} d
  INNER JOIN ${ATTENDANCE_HEADER_TABLE} h
    ON h.SqlAttendanceHeaderId = d.SqlAttendanceHeaderId
  LEFT JOIN dbo.SqlStudents s
    ON s.MongoStudentId = d.MongoStudentId
  LEFT JOIN dbo.SqlAuthUsers u
    ON u.MongoUserId = d.MarkedByMongoUserId
  WHERE d.MongoStudentId = @MongoStudentId
    AND (@StartDate IS NULL OR h.AttendanceDate >= @StartDate)
    AND (@EndDate IS NULL OR h.AttendanceDate <= @EndDate)
  ORDER BY h.AttendanceDate DESC, d.UpdatedAt DESC;
END;

CREATE OR ALTER PROCEDURE dbo.spAttendanceClassSummary
  @ClassName NVARCHAR(100) = NULL,
  @SectionName NVARCHAR(50) = NULL,
  @StartDate DATE = NULL,
  @EndDate DATE = NULL
AS
BEGIN
  SET NOCOUNT ON;

  ;WITH Filtered AS (
    SELECT
      d.MongoStudentId,
      d.Status,
      h.AttendanceDate
    FROM ${ATTENDANCE_DETAIL_TABLE} d
    INNER JOIN ${ATTENDANCE_HEADER_TABLE} h
      ON h.SqlAttendanceHeaderId = d.SqlAttendanceHeaderId
    WHERE (@ClassName IS NULL OR h.ClassName = @ClassName)
      AND (@SectionName IS NULL OR h.SectionName = @SectionName)
      AND (@StartDate IS NULL OR h.AttendanceDate >= @StartDate)
      AND (@EndDate IS NULL OR h.AttendanceDate <= @EndDate)
  )
  SELECT
    Status AS _id,
    COUNT(1) AS count
  FROM Filtered
  GROUP BY Status;

  ;WITH Filtered AS (
    SELECT
      d.Status,
      h.AttendanceDate
    FROM ${ATTENDANCE_DETAIL_TABLE} d
    INNER JOIN ${ATTENDANCE_HEADER_TABLE} h
      ON h.SqlAttendanceHeaderId = d.SqlAttendanceHeaderId
    WHERE (@ClassName IS NULL OR h.ClassName = @ClassName)
      AND (@SectionName IS NULL OR h.SectionName = @SectionName)
      AND (@StartDate IS NULL OR h.AttendanceDate >= @StartDate)
      AND (@EndDate IS NULL OR h.AttendanceDate <= @EndDate)
  )
  SELECT
    CONVERT(VARCHAR(10), AttendanceDate, 23) AS _id,
    SUM(CASE WHEN Status = N'Present' THEN 1 ELSE 0 END) AS present,
    SUM(CASE WHEN Status = N'Absent' THEN 1 ELSE 0 END) AS absent,
    SUM(CASE WHEN Status = N'Late' THEN 1 ELSE 0 END) AS late,
    COUNT(1) AS total
  FROM Filtered
  GROUP BY AttendanceDate
  ORDER BY AttendanceDate ASC;

  ;WITH Filtered AS (
    SELECT
      d.MongoStudentId,
      d.Status
    FROM ${ATTENDANCE_DETAIL_TABLE} d
    INNER JOIN ${ATTENDANCE_HEADER_TABLE} h
      ON h.SqlAttendanceHeaderId = d.SqlAttendanceHeaderId
    WHERE (@ClassName IS NULL OR h.ClassName = @ClassName)
      AND (@SectionName IS NULL OR h.SectionName = @SectionName)
      AND (@StartDate IS NULL OR h.AttendanceDate >= @StartDate)
      AND (@EndDate IS NULL OR h.AttendanceDate <= @EndDate)
  )
  SELECT
    f.MongoStudentId AS _id,
    s.FullName AS studentName,
    s.RollNumber AS rollNumber,
    SUM(CASE WHEN f.Status = N'Present' THEN 1 ELSE 0 END) AS present,
    SUM(CASE WHEN f.Status = N'Absent' THEN 1 ELSE 0 END) AS absent,
    SUM(CASE WHEN f.Status = N'Late' THEN 1 ELSE 0 END) AS late,
    COUNT(1) AS total,
    CASE WHEN COUNT(1) = 0
      THEN 0
      ELSE CAST((SUM(CASE WHEN f.Status = N'Present' THEN 1.0 ELSE 0 END) / COUNT(1)) * 100 AS DECIMAL(10,2))
    END AS percentage
  FROM Filtered f
  LEFT JOIN dbo.SqlStudents s
    ON s.MongoStudentId = f.MongoStudentId
  GROUP BY f.MongoStudentId, s.FullName, s.RollNumber
  ORDER BY s.FullName ASC;
END;

CREATE OR ALTER PROCEDURE dbo.spAttendanceDelete
  @MongoAttendanceId NVARCHAR(64)
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @SqlAttendanceHeaderId INT;
  SELECT @SqlAttendanceHeaderId = SqlAttendanceHeaderId
  FROM ${ATTENDANCE_DETAIL_TABLE}
  WHERE MongoAttendanceId = @MongoAttendanceId;

  DELETE FROM ${ATTENDANCE_DETAIL_TABLE}
  WHERE MongoAttendanceId = @MongoAttendanceId;

  IF @SqlAttendanceHeaderId IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM ${ATTENDANCE_DETAIL_TABLE} WHERE SqlAttendanceHeaderId = @SqlAttendanceHeaderId)
  BEGIN
    DELETE FROM ${ATTENDANCE_HEADER_TABLE}
    WHERE SqlAttendanceHeaderId = @SqlAttendanceHeaderId;
  END;

  SELECT N'ok' AS ResultCode;
END;
`;

const ATTENDANCE_PROCEDURE_BATCHES = ATTENDANCE_PROCEDURES_BATCH
  .split(/\n(?=CREATE OR ALTER PROCEDURE )/g)
  .map((statement) => statement.trim())
  .filter(Boolean);

const ensureAttendanceSqlReady = async () => {
  if (!attendanceBootstrapPromise) {
    attendanceBootstrapPromise = (async () => {
      await ensureAuthSqlReady();
      await ensureStudentSqlReady();
      const pool = await getPool();
      for (const batch of REAL_ATTENDANCE_SCHEMA_BATCHES) {
        await pool.request().batch(batch);
      }
      await pool.request().batch(ATTENDANCE_SCHEMA_BATCH);
      for (const batch of ATTENDANCE_PROCEDURE_BATCHES) {
        await pool.request().batch(batch);
      }
      return true;
    })().catch((error) => {
      attendanceBootstrapPromise = null;
      throw error;
    });
  }

  return attendanceBootstrapPromise;
};

const syncAttendanceMirror = async (attendanceDocument) => {
  if (!attendanceDocument) {
    return null;
  }

  await ensureAttendanceSqlReady();

  const attendance = attendanceDocument.toObject ? attendanceDocument.toObject() : attendanceDocument;
  const result = await executeStoredProcedure('dbo.spAttendanceUpsertDetail', buildAttendanceParams({
    mongoAttendanceId: String(attendance._id),
    mongoStudentId: String(attendance.studentId),
    attendanceDate: normalizeDateOnly(attendance.date),
    className: toNullableString(attendance.class),
    sectionName: toNullableString(attendance.section) || '',
    status: attendance.status,
    remarks: toNullableString(attendance.remarks),
    markedByMongoUserId: attendance.markedBy ? String(attendance.markedBy) : null,
    createdAt: attendance.createdAt || new Date(),
    updatedAt: attendance.updatedAt || new Date(),
  }));

  return mapAttendanceRow(result?.recordset?.[0]);
};

const syncAllAttendanceToSql = async ({ force = false } = {}) => {
  await ensureAttendanceSqlReady();
  return null;
};

const getAttendanceById = async (attendanceId) => {
  await ensureAttendanceSqlReady();
  const filter = buildAttendanceQueryFilters({ attendanceDetailId: attendanceId });
  if (!filter.params.length) {
    return null;
  }
  const result = await executeQuery(`
    ${buildAttendanceBaseSelect()}
    ${filter.whereClause};
  `, filter.params);

  return mapAttendanceRow(result?.recordset?.[0]);
};

const getAttendanceByStudentDate = async (studentId, date) => {
  await ensureAttendanceSqlReady();

  const normalizedDate = normalizeDateOnly(date);
  if (!normalizedDate) {
    return null;
  }
  const filter = buildAttendanceQueryFilters({ studentId, date: normalizedDate });
  if (!filter.params.length) {
    return null;
  }
  const result = await executeQuery(`
    ${buildAttendanceBaseSelect()}
    ${filter.whereClause}
    ORDER BY sad.AttendanceDetailId DESC;
  `, filter.params);

  return mapAttendanceRow(result?.recordset?.[0]);
};

const resolveAttendanceContext = async ({ studentId, className, sectionName, markedByUserId }) => {
  const sql = getSqlClient();
  const studentSqlId = parseNumericId(studentId);
  if (!studentSqlId) {
    return null;
  }

  const studentResult = await executeQuery(`
    SELECT TOP 1
      StudentId,
      AcademicYearId,
      ClassId,
      SectionId,
      FullName,
      RollNumber
    FROM dbo.Students
    WHERE StudentId = @StudentId;
  `, [
    { name: 'StudentId', type: sql.Int, value: studentSqlId },
  ]);
  const student = studentResult?.recordset?.[0] || null;
  if (!student) {
    return null;
  }

  let classId = student.ClassId;
  if (className) {
    const classResult = await executeQuery(`
      SELECT TOP 1 ClassId
      FROM dbo.Classes
      WHERE ClassName = @ClassName
        AND IsActive = 1;
    `, [
      { name: 'ClassName', type: sql.NVarChar(100), value: toNullableString(className) },
    ]);
    classId = classResult?.recordset?.[0]?.ClassId || classId;
  }

  let sectionId = student.SectionId ?? null;
  if (sectionName !== undefined && sectionName !== null && String(sectionName).trim() !== '') {
    const sectionResult = await executeQuery(`
      SELECT TOP 1 SectionId
      FROM dbo.Sections
      WHERE ClassId = @ClassId
        AND SectionName = @SectionName
        AND IsActive = 1;
    `, [
      { name: 'ClassId', type: sql.Int, value: classId },
      { name: 'SectionName', type: sql.NVarChar(50), value: toNullableString(sectionName) },
    ]);
    sectionId = sectionResult?.recordset?.[0]?.SectionId || sectionId;
  }

  let markedByTeacherId = null;
  const markedBySqlUserId = parseNumericId(markedByUserId);
  if (markedBySqlUserId) {
    const teacherResult = await executeQuery(`
      SELECT TOP 1 TeacherId
      FROM dbo.Teachers
      WHERE UserId = @UserId;
    `, [
      { name: 'UserId', type: sql.Int, value: markedBySqlUserId },
    ]);
    markedByTeacherId = teacherResult?.recordset?.[0]?.TeacherId || null;
  }

  return {
    student,
    classId,
    sectionId,
    markedByUserId: markedBySqlUserId,
    markedByTeacherId,
  };
};

const resolveTeacherDbId = async ({ markedByTeacherId = null, markedByUserId = null }, tx = null) => {
  const sql = getSqlClient();
  const runner = tx?.query || executeQuery;
  const teacherLookupId = parseNumericId(markedByTeacherId);
  const userLookupId = parseNumericId(markedByUserId);

  if (!teacherLookupId && !userLookupId) {
    return null;
  }

  const teacherResult = await runner(
    `SELECT TOP 1 TeacherId
     FROM dbo.Teachers
     WHERE (@TeacherId IS NOT NULL AND TeacherId = @TeacherId)
        OR (@UserId IS NOT NULL AND UserId = @UserId)
     ORDER BY TeacherId DESC;`,
    [
      { name: 'TeacherId', type: sql.Int, value: teacherLookupId },
      { name: 'UserId', type: sql.Int, value: userLookupId },
    ]
  );

  return parseNumericId(teacherResult?.recordset?.[0]?.TeacherId);
};

const resolveMarkedByUserId = async ({ markedByTeacherId = null, markedByUserId = null }, tx = null) => {
  const userLookupId = parseNumericId(markedByUserId);
  if (userLookupId) {
    return userLookupId;
  }

  const teacherLookupId = parseNumericId(markedByTeacherId);
  if (!teacherLookupId) {
    return null;
  }

  const sql = getSqlClient();
  const runner = tx?.query || executeQuery;
  const teacherResult = await runner(
    `SELECT TOP 1 UserId
     FROM dbo.Teachers
     WHERE TeacherId = @TeacherId
     ORDER BY TeacherId DESC;`,
    [{ name: 'TeacherId', type: sql.Int, value: teacherLookupId }]
  );

  return parseNumericId(teacherResult?.recordset?.[0]?.UserId);
};

const resolveClassIdByName = async (className, tx = null) => {
  const normalizedClassName = toNullableString(className);
  if (!normalizedClassName) {
    return null;
  }

  const sql = getSqlClient();
  const runner = tx?.query || executeQuery;
  const classResult = await runner(
    `SELECT TOP 1 ClassId
     FROM dbo.Classes
     WHERE ClassName = @ClassName
       AND ISNULL(IsActive, 1) = 1
     ORDER BY ClassId DESC;`,
    [{ name: 'ClassName', type: sql.NVarChar(100), value: normalizedClassName }]
  );

  return parseNumericId(classResult?.recordset?.[0]?.ClassId);
};

const resolveClassContext = async ({ classId = null, className = null } = {}, tx = null) => {
  const normalizedClassId = parseNumericId(classId);
  const normalizedClassName = toNullableString(className);

  if (!normalizedClassId && !normalizedClassName) {
    return null;
  }

  const sql = getSqlClient();
  const runner = tx?.query || executeQuery;
  const classResult = await runner(
    `SELECT TOP 1
       ClassId,
       ClassName,
       AcademicYearId
     FROM dbo.Classes
     WHERE ISNULL(IsActive, 1) = 1
       AND (
         (@ClassId IS NOT NULL AND ClassId = @ClassId)
         OR (@ClassId IS NULL AND @ClassName IS NOT NULL AND ClassName = @ClassName)
       )
     ORDER BY ClassId DESC;`,
    [
      { name: 'ClassId', type: sql.Int, value: normalizedClassId },
      { name: 'ClassName', type: sql.NVarChar(100), value: normalizedClassName },
    ]
  );

  const row = classResult?.recordset?.[0] || null;
  if (!row) {
    return null;
  }

  return {
    classId: parseNumericId(row.ClassId),
    className: toNullableString(row.ClassName) || normalizedClassName,
    academicYearId: parseNumericId(row.AcademicYearId),
  };
};

const resolveSectionIdByName = async (classId, sectionName, tx = null) => {
  const normalizedClassId = parseNumericId(classId);
  const normalizedSectionName = toNullableString(sectionName);
  if (!normalizedClassId || !normalizedSectionName) {
    return null;
  }

  const sql = getSqlClient();
  const runner = tx?.query || executeQuery;
  const sectionResult = await runner(
    `SELECT TOP 1 SectionId
     FROM dbo.Sections
     WHERE ClassId = @ClassId
       AND SectionName = @SectionName
       AND ISNULL(IsActive, 1) = 1
     ORDER BY SectionId DESC;`,
    [
      { name: 'ClassId', type: sql.Int, value: normalizedClassId },
      { name: 'SectionName', type: sql.NVarChar(50), value: normalizedSectionName },
    ]
  );

  return parseNumericId(sectionResult?.recordset?.[0]?.SectionId);
};

const resolveSectionContext = async ({ classId, sectionId = null, sectionName = null } = {}, tx = null) => {
  const normalizedClassId = parseNumericId(classId);
  const normalizedSectionId = parseNumericId(sectionId);
  const normalizedSectionName = toNullableString(sectionName);

  if (!normalizedClassId) {
    return null;
  }

  const sql = getSqlClient();
  const runner = tx?.query || executeQuery;

  // First try to find existing section
  let sectionResult = await runner(
    `SELECT TOP 1
       SectionId,
       SectionName
     FROM dbo.Sections
     WHERE ClassId = @ClassId
       AND ISNULL(IsActive, 1) = 1
       AND (
         (@SectionId IS NOT NULL AND SectionId = @SectionId)
         OR (@SectionId IS NULL AND @SectionName IS NOT NULL AND SectionName = @SectionName)
       )
     ORDER BY SectionId DESC;`,
    [
      { name: 'ClassId', type: sql.Int, value: normalizedClassId },
      { name: 'SectionId', type: sql.Int, value: normalizedSectionId },
      { name: 'SectionName', type: sql.NVarChar(50), value: normalizedSectionName },
    ]
  );

  let row = sectionResult?.recordset?.[0] || null;
  
  // Auto-create missing section
  if (!row && normalizedSectionName) {
    const insertResult = await runner(
      `INSERT INTO dbo.Sections (ClassId, SectionName, IsActive, CreatedAt)
       OUTPUT INSERTED.SectionId, INSERTED.SectionName
       VALUES (@ClassId, @SectionName, 1, SYSUTCDATETIME());`,
      [
        { name: 'ClassId', type: sql.Int, value: normalizedClassId },
        { name: 'SectionName', type: sql.NVarChar(50), value: normalizedSectionName },
      ]
    );
    row = insertResult?.recordset?.[0] || null;
  }

  if (!row) {
    return {
      sectionId: null,
      sectionName: normalizedSectionName || '',
    };
  }

  return {
    sectionId: parseNumericId(row.SectionId),
    sectionName: toNullableString(row.SectionName) || normalizedSectionName,
  };
};

const loadSectionsForClass = async (classId, tx = null) => {
  const normalizedClassId = parseNumericId(classId);
  if (!normalizedClassId) {
    return [];
  }

  const sql = getSqlClient();
  const runner = tx?.query || executeQuery;
  const result = await runner(
    `SELECT
       SectionId,
       SectionName
     FROM dbo.Sections
     WHERE ClassId = @ClassId
       AND ISNULL(IsActive, 1) = 1
     ORDER BY SectionName ASC, SectionId ASC;`,
    [{ name: 'ClassId', type: sql.Int, value: normalizedClassId }]
  );

  return (result?.recordset || [])
    .map((row) => ({
      sectionId: parseNumericId(row.SectionId),
      sectionName: toNullableString(row.SectionName),
    }))
    .filter((row) => row.sectionId && row.sectionName);
};

const loadAttendanceStudents = async (studentIds = [], tx = null) => {
  const normalizedIds = uniqueBy(
    studentIds.map((studentId) => parseNumericId(studentId)).filter(Boolean),
    (studentId) => studentId
  );

  if (!normalizedIds.length) {
    return [];
  }

  const sql = getSqlClient();
  const runner = tx?.query || executeQuery;
  const idParams = buildNumericIdParams(normalizedIds, 'StudentId', sql.Int);

  const result = await runner(
    `SELECT
       s.StudentId,
       s.RollNumber,
       s.AcademicYearId,
       s.ClassId,
       s.SectionId,
       s.Status,
       s.FullName,
       c.ClassName,
       sec.SectionName
     FROM dbo.Students s
     LEFT JOIN dbo.Classes c
       ON c.ClassId = s.ClassId
     LEFT JOIN dbo.Sections sec
       ON sec.SectionId = s.SectionId
     WHERE s.StudentId IN (${idParams.placeholders});`,
    idParams.params
  );

  return result?.recordset || [];
};

const loadAttendanceRosterStudents = async ({ classId, sectionId }, tx = null) => {
  const normalizedClassId = parseNumericId(classId);
  const normalizedSectionId = parseNumericId(sectionId);

  if (!normalizedClassId || !normalizedSectionId) {
    return [];
  }

  const sql = getSqlClient();
  const runner = tx?.query || executeQuery;
  const result = await runner(
    `SELECT
       s.StudentId,
       s.RollNumber,
       s.AdmissionNumber,
       s.AcademicYearId,
       s.ClassId,
       s.SectionId,
       s.Status,
       s.FullName,
       s.FirstName,
       s.LastName,
       c.ClassName,
       sec.SectionName
     FROM dbo.Students s
     INNER JOIN dbo.Classes c
       ON c.ClassId = s.ClassId
     INNER JOIN dbo.Sections sec
       ON sec.SectionId = s.SectionId
     WHERE s.ClassId = @ClassId
       AND s.SectionId = @SectionId
       AND (
         s.Status IS NULL
         OR LTRIM(RTRIM(LOWER(s.Status))) <> N'inactive'
       )
     ORDER BY
       CASE WHEN TRY_CONVERT(INT, s.RollNumber) IS NULL THEN 1 ELSE 0 END,
       TRY_CONVERT(INT, s.RollNumber),
       s.RollNumber,
       s.FullName,
       s.StudentId;`,
    [
      { name: 'ClassId', type: sql.Int, value: normalizedClassId },
      { name: 'SectionId', type: sql.Int, value: normalizedSectionId },
    ]
  );

  return result?.recordset || [];
};

const loadExistingAttendanceSession = async ({ attendanceDate, classId, sectionId }, tx = null) => {
  const normalizedDate = normalizeDateOnly(attendanceDate);
  const normalizedClassId = parseNumericId(classId);
  const normalizedSectionId = parseNumericId(sectionId);

  if (!normalizedDate || !normalizedClassId || !normalizedSectionId) {
    return {
      attendanceId: null,
      academicYearId: null,
      markedByUserId: null,
      markedByTeacherId: null,
      remarks: null,
      detailMap: new Map(),
    };
  }

  const sql = getSqlClient();
  const runner = tx?.query || executeQuery;
  const headerResult = await runner(
    `SELECT
       AttendanceId,
       AcademicYearId,
       MarkedByUserId,
       MarkedByTeacherId,
       Remarks
     FROM dbo.StudentAttendance
     WHERE AttendanceDate = @AttendanceDate
       AND ClassId = @ClassId
       AND SectionId = @SectionId
     ORDER BY AttendanceId DESC;`,
    [
      { name: 'AttendanceDate', type: sql.Date, value: normalizedDate },
      { name: 'ClassId', type: sql.Int, value: normalizedClassId },
      { name: 'SectionId', type: sql.Int, value: normalizedSectionId },
    ]
  );

  const headerRows = headerResult?.recordset || [];
  const headerIds = headerRows
    .map((row) => parseNumericId(row.AttendanceId))
    .filter(Boolean);

  if (!headerIds.length) {
    return {
      attendanceId: null,
      academicYearId: null,
      markedByUserId: null,
      markedByTeacherId: null,
      remarks: null,
      detailMap: new Map(),
    };
  }

  const idParams = buildNumericIdParams(headerIds, 'AttendanceHeaderId', sql.Int);
  const detailResult = await runner(
    `SELECT
       sad.AttendanceDetailId,
       sad.AttendanceId,
       sad.StudentId,
       COALESCE(NULLIF(sad.RollNumber, N''), s.RollNumber) AS RollNumber,
       sad.Status,
       sad.Remarks,
       sad.CheckInTime,
       sad.CheckOutTime
     FROM dbo.StudentAttendanceDetails sad
     LEFT JOIN dbo.Students s
       ON s.StudentId = sad.StudentId
     WHERE sad.AttendanceId IN (${idParams.placeholders})
     ORDER BY sad.AttendanceId DESC, sad.AttendanceDetailId DESC;`,
    idParams.params
  );

  const detailMap = new Map();
  for (const row of detailResult?.recordset || []) {
    const studentId = parseNumericId(row.StudentId);
    if (!studentId || detailMap.has(studentId)) {
      continue;
    }

    detailMap.set(studentId, {
      attendanceDetailId: parseNumericId(row.AttendanceDetailId),
      attendanceId: parseNumericId(row.AttendanceId),
      studentId,
      rollNumber: toNullableString(row.RollNumber),
      status: normalizeAttendanceStatus(row.Status),
      remarks: toNullableString(row.Remarks) || '',
      checkInTime: row.CheckInTime || null,
      checkOutTime: row.CheckOutTime || null,
    });
  }

  return {
    attendanceId: parseNumericId(headerRows[0]?.AttendanceId),
    academicYearId: parseNumericId(headerRows[0]?.AcademicYearId),
    markedByUserId: parseNumericId(headerRows[0]?.MarkedByUserId),
    markedByTeacherId: parseNumericId(headerRows[0]?.MarkedByTeacherId),
    remarks: toNullableString(headerRows[0]?.Remarks),
    detailMap,
  };
};

const mapAttendanceSessionStudent = (studentRow, attendanceDetail = null) => {
  const studentId = parseNumericId(studentRow?.StudentId);
  if (!studentId) {
    return null;
  }

  return {
    _id: String(studentId),
    id: String(studentId),
    studentId: String(studentId),
    dbId: studentId,
    admissionNumber: toNullableString(studentRow.AdmissionNumber),
    fullName:
      toNullableString(studentRow.FullName)
      || [studentRow.FirstName, studentRow.LastName]
        .map((value) => toNullableString(value))
        .filter(Boolean)
        .join(' '),
    rollNumber: toNullableString(studentRow.RollNumber),
    rollNo: toNullableString(studentRow.RollNumber),
    academicYearId: parseNumericId(studentRow.AcademicYearId),
    classDbId: parseNumericId(studentRow.ClassId),
    sectionDbId: parseNumericId(studentRow.SectionId),
    className: toNullableString(studentRow.ClassName),
    class: toNullableString(studentRow.ClassName),
    sectionName: toNullableString(studentRow.SectionName),
    section: toNullableString(studentRow.SectionName),
    currentStatus: attendanceDetail?.status || '',
    currentRemarks: attendanceDetail?.remarks || '',
    currentCheckInTime: attendanceDetail?.checkInTime || '',
    currentCheckOutTime: attendanceDetail?.checkOutTime || '',
    attendanceId: attendanceDetail?.attendanceId ? String(attendanceDetail.attendanceId) : null,
    attendanceDetailId: attendanceDetail?.attendanceDetailId ? String(attendanceDetail.attendanceDetailId) : null,
  };
};

const saveAttendanceSession = async ({
  attendanceDate,
  academicYearId = null,
  classId = null,
  sectionId = null,
  className = null,
  sectionName = null,
  markedByTeacherId = null,
  markedByUserId = null,
  remarks = null,
  students = [],
} = {}) => {
  await ensureAttendanceSqlReady();

  const sql = getSqlClient();
  const normalizedDate = normalizeDateOnly(attendanceDate);
  if (!normalizedDate) {
    throw new Error('A valid attendance date is required.');
  }

  const normalizedStudents = uniqueBy(
    (Array.isArray(students) ? students : [])
      .map((student) => {
        const studentId = parseNumericId(student?.studentId ?? student?._id ?? student?.id);
        if (!studentId) {
          return null;
        }

        return {
          studentId,
          rollNumber: toNullableString(student.rollNumber),
          status: normalizeAttendanceStatus(student.status),
          remarks: toNullableString(student.remarks),
          checkInTime: normalizeTimeValue(student.checkInTime),
          checkOutTime: normalizeTimeValue(student.checkOutTime),
        };
      })
      .filter(Boolean),
    (student) => student.studentId
  );

  if (!normalizedStudents.length) {
    throw new Error('At least one student attendance row is required.');
  }

  const saveResult = await executeInTransaction(async (tx) => {
    const studentRows = await loadAttendanceStudents(
      normalizedStudents.map((student) => student.studentId),
      tx
    );
    const studentMap = new Map(
      studentRows.map((student) => [parseNumericId(student.StudentId), student])
    );
    const requestedClassId = parseNumericId(classId);
    const requestedClassName = toNullableString(className);
    const requestedSectionId = parseNumericId(sectionId);
    const requestedSectionName = toNullableString(sectionName);

    let classContext = await resolveClassContext({ classId, className }, tx);
    if (!classContext) {
      if (requestedClassId || requestedClassName) {
        throw createAttendanceValidationError('Selected class was not found.', []);
      }

      const classIds = new Set(studentRows.map((student) => parseNumericId(student.ClassId)).filter(Boolean));
      if (classIds.size !== 1) {
        throw new Error('Please select a single class before saving attendance.');
      }

      const fallbackClassId = [...classIds][0];
      classContext = await resolveClassContext({ classId: fallbackClassId }, tx) || {
        classId: fallbackClassId,
        className: toNullableString(
          studentRows.find((student) => parseNumericId(student.ClassId) === fallbackClassId)?.ClassName
        ),
        academicYearId: null,
      };
    }

    let sectionContext = await resolveSectionContext(
      { classId: classContext.classId, sectionId, sectionName },
      tx
    );
    
    // Allow NULL sections now - auto-created or student-based
    if (!sectionContext?.sectionId && !requestedSectionId && !requestedSectionName) {
      const sectionIds = new Set(studentRows.map((student) => parseNumericId(student.SectionId)).filter(Boolean));
      if (sectionIds.size === 1) {
        const fallbackSectionId = [...sectionIds][0];
        sectionContext = await resolveSectionContext(
          { classId: classContext.classId, sectionId: fallbackSectionId },
          tx
        );
      }
    }
    
    if (!sectionContext) {
      throw createAttendanceValidationError(`Section resolution failed for class ${classContext.className}. Available sections: ` + 
        (await loadSectionsForClass(classContext.classId, tx)).map(s => s.sectionName).join(', ') || 'none', []);
    }

    const resolvedClassId = classContext.classId;
    const resolvedSectionId = sectionContext.sectionId;
    const rosterStudents = await loadAttendanceRosterStudents(
      { classId: resolvedClassId, sectionId: resolvedSectionId },
      tx
    );

    if (!rosterStudents.length) {
      throw createAttendanceValidationError('No students found for the selected class and section.', []);
    }

    const rosterStudentIds = new Set(
      rosterStudents.map((student) => parseNumericId(student.StudentId)).filter(Boolean)
    );
    const invalidStudents = [];

    for (const student of normalizedStudents) {
      const studentRow = studentMap.get(student.studentId);
      let reason = null;

      if (!studentRow) {
        reason = 'Student record not found';
      } else if (!parseNumericId(studentRow.ClassId) || !parseNumericId(studentRow.SectionId)) {
        reason = 'Student is missing class or section mapping';
      } else if (
        parseNumericId(studentRow.ClassId) !== resolvedClassId
        && parseNumericId(studentRow.SectionId) !== resolvedSectionId
      ) {
        reason = 'Mapped to different class and section';
      } else if (parseNumericId(studentRow.ClassId) !== resolvedClassId) {
        reason = 'Mapped to different class';
      } else if (parseNumericId(studentRow.SectionId) !== resolvedSectionId) {
        reason = 'Mapped to different section';
      } else if (!rosterStudentIds.has(student.studentId)) {
        reason = 'Student is inactive or unavailable in the selected class/section';
      } else if (student.rollNumber && student.rollNumber !== toNullableString(studentRow.RollNumber)) {
        reason = 'Roll number mismatch';
      }

      if (reason) {
        const actualClassId = parseNumericId(studentRow?.ClassId);
        const actualSectionId = parseNumericId(studentRow?.SectionId);
        invalidStudents.push({
          studentId: student.studentId,
          reason,
          actualClassId,
          actualSectionId,
        });
        console.warn('[attendance][validation]', {
          studentId: student.studentId,
          selectedClassId: resolvedClassId,
          selectedSectionId: resolvedSectionId,
          actualClassId,
          actualSectionId,
          reason,
        });
      }
    }

    if (invalidStudents.length) {
      console.warn('[attendance][save-session-invalid]', {
        attendanceDate: normalizedDate.toISOString().slice(0, 10),
        requestedClassId: requestedClassId || null,
        requestedSectionId: requestedSectionId || null,
        resolvedClassId,
        resolvedSectionId,
        submittedStudentIds: normalizedStudents.map((student) => student.studentId),
        invalidStudents,
      });
      throw createAttendanceValidationError(
        'One or more students do not belong to the selected class/section.',
        invalidStudents
      );
    }

    let resolvedAcademicYearId = parseNumericId(academicYearId) || classContext.academicYearId;
    if (!resolvedAcademicYearId) {
      const rosterAcademicYearIds = new Set(
        rosterStudents.map((student) => parseNumericId(student.AcademicYearId)).filter(Boolean)
      );
      if (rosterAcademicYearIds.size === 1) {
        resolvedAcademicYearId = [...rosterAcademicYearIds][0];
      }
    }

    if (!resolvedAcademicYearId) {
      const submittedAcademicYearIds = new Set(
        studentRows.map((student) => parseNumericId(student.AcademicYearId)).filter(Boolean)
      );
      if (submittedAcademicYearIds.size === 1) {
        resolvedAcademicYearId = [...submittedAcademicYearIds][0];
      }
    }

    if (!resolvedAcademicYearId) {
      throw new Error('A valid academic year is required to save attendance.');
    }

    const resolvedMarkedByTeacherId = await resolveTeacherDbId(
      { markedByTeacherId, markedByUserId },
      tx
    );
    const resolvedMarkedByUserId = await resolveMarkedByUserId(
      { markedByTeacherId, markedByUserId },
      tx
    );

    const existingHeaders = await tx.query(
      `SELECT AttendanceId
       FROM dbo.StudentAttendance WITH (UPDLOCK, HOLDLOCK)
       WHERE AttendanceDate = @AttendanceDate
         AND ClassId = @ClassId
         AND SectionId = @SectionId
       ORDER BY AttendanceId DESC;`,
      [
        { name: 'AttendanceDate', type: sql.Date, value: normalizedDate },
        { name: 'ClassId', type: sql.Int, value: resolvedClassId },
        { name: 'SectionId', type: sql.Int, value: resolvedSectionId },
      ]
    );

    const headerIds = (existingHeaders?.recordset || [])
      .map((row) => parseNumericId(row.AttendanceId))
      .filter(Boolean);
    let attendanceId = headerIds[0] || null;

    if (!attendanceId) {
      const insertHeader = await tx.query(
        `INSERT INTO dbo.StudentAttendance (
           AttendanceDate,
           AcademicYearId,
           ClassId,
           SectionId,
           MarkedByUserId,
           MarkedByTeacherId,
           Remarks,
           CreatedAt
         )
         VALUES (
           @AttendanceDate,
           @AcademicYearId,
           @ClassId,
           @SectionId,
           @MarkedByUserId,
           @MarkedByTeacherId,
           @Remarks,
           SYSUTCDATETIME()
         );

         SELECT CAST(SCOPE_IDENTITY() AS INT) AS AttendanceId;`,
        [
          { name: 'AttendanceDate', type: sql.Date, value: normalizedDate },
          { name: 'AcademicYearId', type: sql.Int, value: resolvedAcademicYearId },
          { name: 'ClassId', type: sql.Int, value: resolvedClassId },
          { name: 'SectionId', type: sql.Int, value: resolvedSectionId },
          { name: 'MarkedByUserId', type: sql.Int, value: resolvedMarkedByUserId },
          { name: 'MarkedByTeacherId', type: sql.Int, value: resolvedMarkedByTeacherId },
          { name: 'Remarks', type: sql.NVarChar(1000), value: toNullableString(remarks) },
        ]
      );
      attendanceId = parseNumericId(insertHeader?.recordset?.[0]?.AttendanceId);
    } else {
      await tx.query(
        `UPDATE dbo.StudentAttendance
         SET AcademicYearId = @AcademicYearId,
             MarkedByUserId = @MarkedByUserId,
             MarkedByTeacherId = @MarkedByTeacherId,
             Remarks = @Remarks
         WHERE AttendanceId = @AttendanceId;`,
        [
          { name: 'AcademicYearId', type: sql.Int, value: resolvedAcademicYearId },
          { name: 'MarkedByUserId', type: sql.Int, value: resolvedMarkedByUserId },
          { name: 'MarkedByTeacherId', type: sql.Int, value: resolvedMarkedByTeacherId },
          { name: 'Remarks', type: sql.NVarChar(1000), value: toNullableString(remarks) },
          { name: 'AttendanceId', type: sql.Int, value: attendanceId },
        ]
      );
    }

    const duplicateHeaderIds = headerIds.slice(1);
    if (duplicateHeaderIds.length) {
      const duplicateParams = buildNumericIdParams(duplicateHeaderIds, 'DuplicateHeaderId', sql.Int);

      await tx.query(
        `UPDATE dbo.StudentAttendanceDetails
         SET AttendanceId = @PrimaryAttendanceId
         WHERE AttendanceId IN (${duplicateParams.placeholders});`,
        [{ name: 'PrimaryAttendanceId', type: sql.Int, value: attendanceId }, ...duplicateParams.params]
      );

      await tx.query(
        `DELETE FROM dbo.StudentAttendance
         WHERE AttendanceId IN (${duplicateParams.placeholders});`,
        duplicateParams.params
      );
    }

    const existingDetailRows = await tx.query(
      `SELECT AttendanceDetailId, StudentId
       FROM dbo.StudentAttendanceDetails
       WHERE AttendanceId = @AttendanceId
       ORDER BY AttendanceDetailId DESC;`,
      [{ name: 'AttendanceId', type: sql.Int, value: attendanceId }]
    );

    const existingDetailsByStudent = new Map();
    const detailIdsToDelete = [];
    for (const row of existingDetailRows?.recordset || []) {
      const detailId = parseNumericId(row.AttendanceDetailId);
      const currentStudentId = parseNumericId(row.StudentId);
      if (!detailId || !currentStudentId) {
        continue;
      }

      if (!rosterStudentIds.has(currentStudentId)) {
        detailIdsToDelete.push(detailId);
        continue;
      }

      if (!existingDetailsByStudent.has(currentStudentId)) {
        existingDetailsByStudent.set(currentStudentId, detailId);
        continue;
      }

      detailIdsToDelete.push(detailId);
    }

    if (detailIdsToDelete.length) {
      const duplicateDetailParams = buildNumericIdParams(detailIdsToDelete, 'DuplicateDetailId', sql.Int);
      await tx.query(
        `DELETE FROM dbo.StudentAttendanceDetails
         WHERE AttendanceDetailId IN (${duplicateDetailParams.placeholders});`,
        duplicateDetailParams.params
      );
    }

    for (const student of normalizedStudents) {
      const studentRow = studentMap.get(student.studentId);
      const nextRollNumber = student.rollNumber || toNullableString(studentRow.RollNumber);
      const detailId = existingDetailsByStudent.get(student.studentId);

      if (detailId) {
        await tx.query(
          `UPDATE dbo.StudentAttendanceDetails
           SET RollNumber = @RollNumber,
               Status = @Status,
               CheckInTime = @CheckInTime,
               CheckOutTime = @CheckOutTime,
               Remarks = @Remarks
           WHERE AttendanceDetailId = @AttendanceDetailId;`,
          [
            { name: 'RollNumber', type: sql.NVarChar(100), value: nextRollNumber },
            { name: 'Status', type: sql.NVarChar(20), value: student.status },
            { name: 'CheckInTime', type: sql.Time(0), value: student.checkInTime },
            { name: 'CheckOutTime', type: sql.Time(0), value: student.checkOutTime },
            { name: 'Remarks', type: sql.NVarChar(1000), value: student.remarks },
            { name: 'AttendanceDetailId', type: sql.Int, value: detailId },
          ]
        );
        continue;
      }

      await tx.query(
        `INSERT INTO dbo.StudentAttendanceDetails (
           AttendanceId,
           StudentId,
           RollNumber,
           Status,
           CheckInTime,
           CheckOutTime,
           Remarks
         )
         VALUES (
           @AttendanceId,
           @StudentId,
           @RollNumber,
           @Status,
           @CheckInTime,
           @CheckOutTime,
           @Remarks
         );`,
        [
          { name: 'AttendanceId', type: sql.Int, value: attendanceId },
          { name: 'StudentId', type: sql.Int, value: student.studentId },
          { name: 'RollNumber', type: sql.NVarChar(100), value: nextRollNumber },
          { name: 'Status', type: sql.NVarChar(20), value: student.status },
          { name: 'CheckInTime', type: sql.Time(0), value: student.checkInTime },
          { name: 'CheckOutTime', type: sql.Time(0), value: student.checkOutTime },
          { name: 'Remarks', type: sql.NVarChar(1000), value: student.remarks },
        ]
      );
    }

    return {
      attendanceId,
      savedCount: normalizedStudents.length,
    };
  });

  return saveResult;
};

const upsertAttendanceRecord = async ({
  attendanceId,
  studentId,
  date,
  status,
  className,
  sectionName,
  markedByUserId,
  remarks,
}) => {
  await ensureAttendanceSqlReady();

  const normalizedDate = normalizeDateOnly(date);
  const sql = getSqlClient();
  if (!normalizedDate) {
    return { attendance: null, operationType: 'invalid_date' };
  }

  const context = await resolveAttendanceContext({
    studentId,
    className,
    sectionName,
    markedByUserId,
  });
  if (!context) {
    return { attendance: null, operationType: 'student_not_found' };
  }

  const requestedAttendanceDetailId = parseNumericId(attendanceId);
  const now = new Date();
  const writeResult = await executeInTransaction(async (tx) => {
    const existingDetailResult = requestedAttendanceDetailId
      ? await tx.query(`
          SELECT TOP 1 AttendanceDetailId, AttendanceId
          FROM dbo.StudentAttendanceDetails
          WHERE AttendanceDetailId = @AttendanceDetailId;
        `, [
          { name: 'AttendanceDetailId', type: sql.Int, value: requestedAttendanceDetailId },
        ])
      : await tx.query(`
          SELECT TOP 1 sad.AttendanceDetailId, sad.AttendanceId
          FROM dbo.StudentAttendanceDetails sad
          INNER JOIN dbo.StudentAttendance sa
            ON sa.AttendanceId = sad.AttendanceId
          WHERE sad.StudentId = @StudentId
            AND sa.AttendanceDate = @AttendanceDate
          ORDER BY sad.AttendanceDetailId DESC;
        `, [
          { name: 'StudentId', type: sql.Int, value: context.student.StudentId },
          { name: 'AttendanceDate', type: sql.Date, value: normalizedDate },
        ]);

    const existingDetailId = existingDetailResult?.recordset?.[0]?.AttendanceDetailId || null;
    let attendanceHeaderId = existingDetailResult?.recordset?.[0]?.AttendanceId || null;

    if (!attendanceHeaderId) {
      const headerResult = await tx.query(`
        SELECT TOP 1 AttendanceId
        FROM dbo.StudentAttendance
        WHERE AttendanceDate = @AttendanceDate
          AND ClassId = @ClassId
          AND (
            (SectionId IS NULL AND @SectionId IS NULL)
            OR SectionId = @SectionId
          )
        ORDER BY AttendanceId DESC;
      `, [
        { name: 'AttendanceDate', type: sql.Date, value: normalizedDate },
        { name: 'ClassId', type: sql.Int, value: context.classId },
        { name: 'SectionId', type: sql.Int, value: context.sectionId },
      ]);

      attendanceHeaderId = headerResult?.recordset?.[0]?.AttendanceId || null;
    }

    if (!attendanceHeaderId) {
      const insertHeader = await tx.query(`
        INSERT INTO dbo.StudentAttendance (
          AttendanceDate,
          AcademicYearId,
          ClassId,
          SectionId,
          MarkedByUserId,
          MarkedByTeacherId,
          Remarks,
          CreatedAt
        )
        VALUES (
          @AttendanceDate,
          @AcademicYearId,
          @ClassId,
          @SectionId,
          @MarkedByUserId,
          @MarkedByTeacherId,
          @Remarks,
          @CreatedAt
        );

        SELECT CAST(SCOPE_IDENTITY() AS INT) AS AttendanceId;
      `, [
        { name: 'AttendanceDate', type: sql.Date, value: normalizedDate },
        { name: 'AcademicYearId', type: sql.Int, value: context.student.AcademicYearId },
        { name: 'ClassId', type: sql.Int, value: context.classId },
        { name: 'SectionId', type: sql.Int, value: context.sectionId },
        { name: 'MarkedByUserId', type: sql.Int, value: context.markedByUserId },
        { name: 'MarkedByTeacherId', type: sql.Int, value: context.markedByTeacherId },
        { name: 'Remarks', type: sql.NVarChar(1000), value: toNullableString(remarks) },
        { name: 'CreatedAt', type: sql.DateTime2(0), value: now },
      ]);
      attendanceHeaderId = insertHeader?.recordset?.[0]?.AttendanceId || null;
    } else {
      await tx.query(`
        UPDATE dbo.StudentAttendance
        SET MarkedByUserId = @MarkedByUserId,
            MarkedByTeacherId = @MarkedByTeacherId,
            Remarks = @Remarks
        WHERE AttendanceId = @AttendanceId;
      `, [
        { name: 'AttendanceId', type: sql.Int, value: attendanceHeaderId },
        { name: 'MarkedByUserId', type: sql.Int, value: context.markedByUserId },
        { name: 'MarkedByTeacherId', type: sql.Int, value: context.markedByTeacherId },
        { name: 'Remarks', type: sql.NVarChar(1000), value: toNullableString(remarks) },
      ]);
    }
    if (existingDetailId) {
      await tx.query(`
        UPDATE dbo.StudentAttendanceDetails
        SET AttendanceId = @AttendanceId,
            StudentId = @StudentId,
            RollNumber = @RollNumber,
            Status = @Status,
            Remarks = @Remarks
        WHERE AttendanceDetailId = @AttendanceDetailId;
      `, [
        { name: 'AttendanceId', type: sql.Int, value: attendanceHeaderId },
        { name: 'StudentId', type: sql.Int, value: context.student.StudentId },
        { name: 'RollNumber', type: sql.NVarChar(100), value: toNullableString(context.student.RollNumber) },
        { name: 'Status', type: sql.NVarChar(20), value: toNullableString(status) || 'Absent' },
        { name: 'Remarks', type: sql.NVarChar(1000), value: toNullableString(remarks) },
        { name: 'AttendanceDetailId', type: sql.Int, value: existingDetailId },
      ]);

      return {
        attendanceDetailId: existingDetailId,
        operationType: 'updated',
      };
    }

    const insertDetail = await tx.query(`
      INSERT INTO dbo.StudentAttendanceDetails (
        AttendanceId,
        StudentId,
        RollNumber,
        Status,
        CheckInTime,
        CheckOutTime,
        Remarks
      )
      VALUES (
        @AttendanceId,
        @StudentId,
        @RollNumber,
        @Status,
        NULL,
        NULL,
        @Remarks
      );

      SELECT CAST(SCOPE_IDENTITY() AS INT) AS AttendanceDetailId;
    `, [
      { name: 'AttendanceId', type: sql.Int, value: attendanceHeaderId },
      { name: 'StudentId', type: sql.Int, value: context.student.StudentId },
      { name: 'RollNumber', type: sql.NVarChar(100), value: toNullableString(context.student.RollNumber) },
      { name: 'Status', type: sql.NVarChar(20), value: toNullableString(status) || 'Absent' },
      { name: 'Remarks', type: sql.NVarChar(1000), value: toNullableString(remarks) },
    ]);

    return {
      attendanceDetailId: insertDetail?.recordset?.[0]?.AttendanceDetailId || null,
      operationType: 'created',
    };
  });

  const attendance = writeResult?.attendanceDetailId
    ? await getAttendanceById(writeResult.attendanceDetailId)
    : null;

  return {
    attendance,
    operationType: writeResult?.operationType || 'created',
  };
};

const getAttendanceSession = async ({
  attendanceDate,
  classId = null,
  sectionId = null,
  className = null,
  sectionName = null,
} = {}) => {
  await ensureAttendanceSqlReady();

  const normalizedDate = normalizeDateOnly(attendanceDate || new Date());
  if (!normalizedDate) {
    throw new Error('A valid attendance date is required.');
  }

  const classContext = await resolveClassContext({ classId, className });
  if (!classContext?.classId) {
    return {
      attendanceDate: normalizedDate,
      classId: parseNumericId(classId),
      className: toNullableString(className),
      sectionId: parseNumericId(sectionId),
      sectionName: toNullableString(sectionName),
      academicYearId: null,
      attendanceId: null,
      alreadyMarked: false,
      remarks: null,
      sections: [],
      students: [],
      summary: {
        totalStudents: 0,
        present: 0,
        absent: 0,
        late: 0,
        notMarked: 0,
      },
    };
  }

  const sections = await loadSectionsForClass(classContext.classId);
  let effectiveSectionContext = await resolveSectionContext(
    { classId: classContext.classId, sectionId, sectionName },
    null
  );

  if (!effectiveSectionContext && sections.length) {
    effectiveSectionContext = sections[0];
  }

  if (!effectiveSectionContext?.sectionId) {
    return {
      attendanceDate: normalizedDate,
      classId: classContext.classId,
      className: classContext.className,
      sectionId: parseNumericId(sectionId),
      sectionName: toNullableString(sectionName),
      academicYearId: classContext.academicYearId,
      attendanceId: null,
      alreadyMarked: false,
      remarks: null,
      sections: sections.map((section) => ({
        id: String(section.sectionId),
        sectionId: section.sectionId,
        name: section.sectionName,
        sectionName: section.sectionName,
      })),
      students: [],
      summary: {
        totalStudents: 0,
        present: 0,
        absent: 0,
        late: 0,
        notMarked: 0,
      },
    };
  }

  const rosterStudents = await loadAttendanceRosterStudents({
    classId: classContext.classId,
    sectionId: effectiveSectionContext.sectionId,
  });
  const existingSession = await loadExistingAttendanceSession({
    attendanceDate: normalizedDate,
    classId: classContext.classId,
    sectionId: effectiveSectionContext.sectionId,
  });

  const students = rosterStudents
    .map((student) => mapAttendanceSessionStudent(
      student,
      existingSession.detailMap.get(parseNumericId(student.StudentId)) || null
    ))
    .filter(Boolean);

  const summary = students.reduce(
    (acc, student) => {
      acc.totalStudents += 1;

      if (student.currentStatus === 'Present') {
        acc.present += 1;
      } else if (student.currentStatus === 'Absent') {
        acc.absent += 1;
      } else if (student.currentStatus === 'Late') {
        acc.late += 1;
      } else {
        acc.notMarked += 1;
      }

      return acc;
    },
    {
      totalStudents: 0,
      present: 0,
      absent: 0,
      late: 0,
      notMarked: 0,
    }
  );

  const academicYearIds = new Set(
    rosterStudents.map((student) => parseNumericId(student.AcademicYearId)).filter(Boolean)
  );

  return {
    attendanceDate: normalizedDate,
    classId: classContext.classId,
    className: classContext.className,
    sectionId: effectiveSectionContext.sectionId,
    sectionName: effectiveSectionContext.sectionName,
    academicYearId:
      existingSession.academicYearId
      || classContext.academicYearId
      || (academicYearIds.size === 1 ? [...academicYearIds][0] : null),
    attendanceId: existingSession.attendanceId ? String(existingSession.attendanceId) : null,
    alreadyMarked: existingSession.detailMap.size > 0,
    remarks: existingSession.remarks || null,
    sections: sections.map((section) => ({
      id: String(section.sectionId),
      sectionId: section.sectionId,
      name: section.sectionName,
      sectionName: section.sectionName,
    })),
    students,
    summary,
  };
};

const getAttendanceList = async ({
  studentId = null,
  classId = null,
  sectionId = null,
  className = null,
  sectionName = null,
  date = null,
  startDate = null,
  endDate = null,
  page = 1,
  limit = 50,
}) => {
  await ensureAttendanceSqlReady();

  const sql = getSqlClient();
  const safePage = Number(page) || 1;
  const safeLimit = Number(limit) || 50;
  const offset = Math.max(safePage - 1, 0) * safeLimit;
  const filter = buildAttendanceQueryFilters({
    studentId,
    classId,
    sectionId,
    className,
    sectionName,
    date,
    startDate,
    endDate,
  });
  const result = await executeQuery(`
    ${buildAttendanceBaseSelect({ includeTotalCount: true })}
    ${filter.whereClause}
    ORDER BY sa.AttendanceDate DESC, sad.AttendanceDetailId DESC
    OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
  `, [
    ...filter.params,
    { name: 'Offset', type: sql.Int, value: offset },
    { name: 'Limit', type: sql.Int, value: safeLimit },
  ]);

  const rows = result?.recordset || [];
  const total = rows.length ? Number(rows[0].TotalCount || 0) : 0;

  return {
    attendances: rows.map(mapAttendanceRow),
    total,
  };
};

const getStudentAttendanceReport = async ({ studentId, startDate = null, endDate = null }) => {
  await ensureAttendanceSqlReady();
  const filter = buildAttendanceQueryFilters({
    studentId,
    startDate,
    endDate,
  });
  if (!filter.params.length) {
    return [];
  }
  const result = await executeQuery(`
    ${buildAttendanceBaseSelect()}
    ${filter.whereClause}
    ORDER BY sa.AttendanceDate DESC, sad.AttendanceDetailId DESC;
  `, filter.params);

  return (result?.recordset || []).map(mapAttendanceRow);
};

const getClassAttendanceSummary = async ({ className = null, sectionName = null, startDate = null, endDate = null }) => {
  await ensureAttendanceSqlReady();
  const filter = buildAttendanceQueryFilters({
    className,
    sectionName,
    startDate,
    endDate,
  });
  const statusStats = await executeQuery(`
    SELECT
      sad.Status AS status,
      COUNT(1) AS count
    FROM dbo.StudentAttendanceDetails sad
    INNER JOIN dbo.StudentAttendance sa
      ON sa.AttendanceId = sad.AttendanceId
    INNER JOIN dbo.Classes c
      ON c.ClassId = sa.ClassId
    LEFT JOIN dbo.Sections sec
      ON sec.SectionId = sa.SectionId
    ${filter.whereClause}
    GROUP BY sad.Status
    ORDER BY sad.Status;
  `, filter.params);
  const dailyStats = await executeQuery(`
    SELECT
      sa.AttendanceDate AS attendanceDate,
      COUNT(1) AS total,
      SUM(CASE WHEN sad.Status = N'Present' THEN 1 ELSE 0 END) AS present,
      SUM(CASE WHEN sad.Status = N'Absent' THEN 1 ELSE 0 END) AS absent,
      SUM(CASE WHEN sad.Status = N'Late' THEN 1 ELSE 0 END) AS late,
      CAST(
        CASE WHEN COUNT(1) = 0 THEN 0
        ELSE (SUM(CASE WHEN sad.Status = N'Present' THEN 1.0 ELSE 0 END) / COUNT(1)) * 100
        END
        AS DECIMAL(10, 2)
      ) AS percentage
    FROM dbo.StudentAttendanceDetails sad
    INNER JOIN dbo.StudentAttendance sa
      ON sa.AttendanceId = sad.AttendanceId
    INNER JOIN dbo.Classes c
      ON c.ClassId = sa.ClassId
    LEFT JOIN dbo.Sections sec
      ON sec.SectionId = sa.SectionId
    ${filter.whereClause}
    GROUP BY sa.AttendanceDate
    ORDER BY sa.AttendanceDate DESC;
  `, filter.params);
  const studentStats = await executeQuery(`
    SELECT
      sad.StudentId AS studentId,
      s.FullName AS studentName,
      s.RollNumber AS rollNumber,
      COUNT(1) AS total,
      SUM(CASE WHEN sad.Status = N'Present' THEN 1 ELSE 0 END) AS present,
      SUM(CASE WHEN sad.Status = N'Absent' THEN 1 ELSE 0 END) AS absent,
      SUM(CASE WHEN sad.Status = N'Late' THEN 1 ELSE 0 END) AS late,
      CAST(
        CASE WHEN COUNT(1) = 0 THEN 0
        ELSE (SUM(CASE WHEN sad.Status = N'Present' THEN 1.0 ELSE 0 END) / COUNT(1)) * 100
        END
        AS DECIMAL(10, 2)
      ) AS percentage
    FROM dbo.StudentAttendanceDetails sad
    INNER JOIN dbo.StudentAttendance sa
      ON sa.AttendanceId = sad.AttendanceId
    INNER JOIN dbo.Classes c
      ON c.ClassId = sa.ClassId
    LEFT JOIN dbo.Sections sec
      ON sec.SectionId = sa.SectionId
    INNER JOIN dbo.Students s
      ON s.StudentId = sad.StudentId
    ${filter.whereClause}
    GROUP BY sad.StudentId, s.FullName, s.RollNumber
    ORDER BY s.FullName;
  `, filter.params);

  return {
    statusStats: statusStats?.recordset || [],
    dailyStats: dailyStats?.recordset || [],
    studentStats: studentStats?.recordset || [],
  };
};

const deleteAttendanceRecord = async (attendanceId) => {
  await ensureAttendanceSqlReady();
  const sql = getSqlClient();
  const attendanceSqlId = parseNumericId(attendanceId);
  if (!attendanceSqlId) {
    return;
  }

  await executeInTransaction(async (tx) => {
    const detailResult = await tx.query(`
      SELECT TOP 1 AttendanceId
      FROM dbo.StudentAttendanceDetails
      WHERE AttendanceDetailId = @AttendanceDetailId;
    `, [
      { name: 'AttendanceDetailId', type: sql.Int, value: attendanceSqlId },
    ]);
    const headerId = detailResult?.recordset?.[0]?.AttendanceId || null;

    await tx.query(`
      DELETE FROM dbo.StudentAttendanceDetails
      WHERE AttendanceDetailId = @AttendanceDetailId;
    `, [
      { name: 'AttendanceDetailId', type: sql.Int, value: attendanceSqlId },
    ]);

    if (headerId) {
      const remainingResult = await tx.query(`
        SELECT COUNT(1) AS RemainingCount
        FROM dbo.StudentAttendanceDetails
        WHERE AttendanceId = @AttendanceId;
      `, [
        { name: 'AttendanceId', type: sql.Int, value: headerId },
      ]);
      const remainingCount = Number(remainingResult?.recordset?.[0]?.RemainingCount || 0);
      if (remainingCount === 0) {
        await tx.query(`
          DELETE FROM dbo.StudentAttendance
          WHERE AttendanceId = @AttendanceId;
        `, [
          { name: 'AttendanceId', type: sql.Int, value: headerId },
        ]);
      }
    }
  });
};

module.exports = {
  ensureAttendanceSqlReady,
  syncAttendanceMirror,
  syncAllAttendanceToSql,
  getAttendanceById,
  getAttendanceByStudentDate,
  upsertAttendanceRecord,
  saveAttendanceSession,
  getAttendanceSession,
  getAttendanceList,
  getStudentAttendanceReport,
  getClassAttendanceSummary,
  deleteAttendanceRecord,
};
