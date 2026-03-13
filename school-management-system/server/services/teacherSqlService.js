const {
  getSqlClient,
  executeQuery,
  executeStoredProcedure,
  getPool,
  executeInTransaction,
} = require('../config/sqlServer');
const { ensureAuthSqlReady } = require('./authSqlService');

const TEACHER_TABLE = 'dbo.SqlTeachers';
let teacherBootstrapPromise = null;

const toNullableString = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
};

const normalizeExperienceValue = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) {
    return null;
  }

  return numericValue;
};

const toNullableDate = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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

const mapTeacherRow = (row) => {
  if (!row) {
    return null;
  }

  return {
    _id: row.MongoUserId,
    fullName: row.FullName,
    email: row.Email || null,
    phone: row.Phone || null,
    qualification: row.Qualification || '',
    experience:
      row.ExperienceYears === null || row.ExperienceYears === undefined
        ? ''
        : Number(row.ExperienceYears),
    role: 'teacher',
    isActive: row.IsActive === true || row.IsActive === 1,
    createdAt: row.CreatedAt ? new Date(row.CreatedAt) : null,
    updatedAt: row.UpdatedAt ? new Date(row.UpdatedAt) : null,
  };
};

const buildTeacherSqlParams = ({ teacherId, fullName, email, phone, qualification, experience, isActive, createdAt, updatedAt }) => {
  const sql = getSqlClient();

  return [
    { name: 'MongoUserId', type: sql.NVarChar(64), value: teacherId },
    { name: 'FullName', type: sql.NVarChar(200), value: fullName },
    { name: 'Email', type: sql.NVarChar(320), value: email },
    { name: 'Phone', type: sql.NVarChar(40), value: phone },
    { name: 'Qualification', type: sql.NVarChar(255), value: qualification },
    { name: 'ExperienceYears', type: sql.Decimal(5, 2), value: experience },
    { name: 'IsActive', type: sql.Bit, value: isActive },
    { name: 'CreatedAt', type: sql.DateTime2(0), value: createdAt || new Date() },
    { name: 'UpdatedAt', type: sql.DateTime2(0), value: updatedAt || new Date() },
  ];
};

const toSqlTeacherPayload = (teacherDocument, overrides = {}) => {
  const teacher = teacherDocument?.toObject ? teacherDocument.toObject() : teacherDocument;

  return {
    teacherId: String(teacher?._id || overrides.teacherId || ''),
    fullName: toNullableString(overrides.fullName ?? teacher?.fullName),
    email: toNullableString(overrides.email ?? teacher?.email),
    phone: toNullableString(overrides.phone ?? teacher?.phone),
    qualification: toNullableString(overrides.qualification),
    experience: normalizeExperienceValue(overrides.experience),
    isActive: overrides.isActive !== undefined ? !!overrides.isActive : teacher?.isActive !== false,
    createdAt: teacher?.createdAt || overrides.createdAt || new Date(),
    updatedAt: overrides.updatedAt || teacher?.updatedAt || new Date(),
  };
};

const REAL_TEACHER_BASE_SELECT = `
  SELECT
    T.TeacherId,
    T.UserId,
    T.EmployeeCode,
    T.Department,
    T.Designation,
    T.Qualification,
    T.ExperienceYears,
    T.JoiningDate,
    T.Salary,
    T.BloodGroup,
    T.EmergencyContact,
    T.Notes,
    T.CreatedAt AS TeacherCreatedAt,
    T.UpdatedAt AS TeacherUpdatedAt,
    U.FullName,
    U.Email,
    U.Phone,
    U.Gender,
    U.DateOfBirth,
    U.ProfileImage,
    U.AddressLine1,
    U.AddressLine2,
    U.City,
    U.State,
    U.PostalCode,
    U.Country,
    U.IsActive,
    U.CreatedAt AS UserCreatedAt,
    U.UpdatedAt AS UserUpdatedAt
  FROM dbo.Teachers T
  JOIN dbo.Users U ON T.UserId = U.UserId
`;

const normalizeTeacherNumericId = (value) => {
  const numericValue = Number(value);
  if (!Number.isInteger(numericValue) || numericValue <= 0) {
    return null;
  }

  return numericValue;
};

const logTeacherSqlRead = (queryName, params = {}) => {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  console.info('[teachers][sql]', queryName, params);
};

const mapTeacherSubjectRow = (row) => ({
  _id: row.ClassSubjectId !== undefined && row.ClassSubjectId !== null ? String(row.ClassSubjectId) : String(row.SubjectId),
  id: row.ClassSubjectId !== undefined && row.ClassSubjectId !== null ? String(row.ClassSubjectId) : String(row.SubjectId),
  classSubjectId: row.ClassSubjectId !== undefined && row.ClassSubjectId !== null ? String(row.ClassSubjectId) : null,
  subjectId: row.SubjectId !== undefined && row.SubjectId !== null ? String(row.SubjectId) : null,
  name: row.SubjectName || null,
  subjectName: row.SubjectName || null,
  code: row.SubjectCode || null,
  className: row.ClassName || null,
  sectionName: row.SectionName || null,
});

const getTeacherSubjectMap = async (teacherIds = []) => {
  const normalizedTeacherIds = [...new Set(
    teacherIds
      .map(normalizeTeacherNumericId)
      .filter(Boolean)
  )];

  if (!normalizedTeacherIds.length) {
    return new Map();
  }

  const result = await executeQuery(`
    SELECT
      CS.ClassSubjectId,
      CS.TeacherId,
      S.SubjectId,
      S.SubjectName,
      S.SubjectCode,
      C.ClassName,
      SEC.SectionName
    FROM dbo.ClassSubjects CS
    JOIN dbo.Subjects S ON CS.SubjectId = S.SubjectId
    LEFT JOIN dbo.Classes C ON CS.ClassId = C.ClassId
    LEFT JOIN dbo.Sections SEC ON CS.SectionId = SEC.SectionId
    WHERE CS.TeacherId IN (${normalizedTeacherIds.join(', ')})
    ORDER BY CS.TeacherId, S.SubjectName, C.ClassName, SEC.SectionName
  `);

  const subjectMap = new Map();
  for (const row of result?.recordset || []) {
    const teacherId = Number(row.TeacherId);
    if (!subjectMap.has(teacherId)) {
      subjectMap.set(teacherId, []);
    }

    const teacherSubjects = subjectMap.get(teacherId);
    const classSubjectId = row.ClassSubjectId !== undefined && row.ClassSubjectId !== null ? String(row.ClassSubjectId) : null;
    if (classSubjectId && teacherSubjects.some((subject) => subject.id === classSubjectId)) {
      continue;
    }

    teacherSubjects.push(mapTeacherSubjectRow(row));
  }

  return subjectMap;
};

const mapRealTeacherRow = (row, subjects = []) => {
  if (!row) {
    return null;
  }

  const teacherId = normalizeTeacherNumericId(row.TeacherId);
  const userId = normalizeTeacherNumericId(row.UserId);
  if (!teacherId || !userId) {
    return null;
  }

  return {
    _id: String(userId),
    id: String(userId),
    userId: String(userId),
    teacherId: String(teacherId),
    dbId: teacherId,
    fullName: row.FullName || null,
    email: row.Email || null,
    phone: row.Phone || null,
    qualification: row.Qualification || '',
    experience:
      row.ExperienceYears === null || row.ExperienceYears === undefined
        ? ''
        : Number(row.ExperienceYears),
    experienceYears:
      row.ExperienceYears === null || row.ExperienceYears === undefined
        ? null
        : Number(row.ExperienceYears),
    department: row.Department || null,
    designation: row.Designation || null,
    employeeCode: row.EmployeeCode || null,
    joiningDate: row.JoiningDate ? new Date(row.JoiningDate) : null,
    salary: row.Salary === null || row.Salary === undefined ? null : Number(row.Salary),
    bloodGroup: row.BloodGroup || null,
    emergencyContact: row.EmergencyContact || null,
    notes: row.Notes || null,
    gender: row.Gender || null,
    dateOfBirth: row.DateOfBirth ? new Date(row.DateOfBirth) : null,
    address: {
      street: row.AddressLine1 || '',
      line2: row.AddressLine2 || '',
      city: row.City || '',
      state: row.State || '',
      pincode: row.PostalCode || '',
      country: row.Country || '',
    },
    profilePhoto: row.ProfileImage || null,
    role: 'teacher',
    isActive: row.IsActive === true || row.IsActive === 1,
    subjects,
    classSubjectIds: subjects.map((subject) => subject.id).filter(Boolean),
    subjectIds: subjects.map((subject) => subject.subjectId || subject.id).filter(Boolean),
    subjectId: subjects[0]?.subjectId || subjects[0]?.id || null,
    subjectName: subjects[0]?.name || null,
    subjectNames: subjects.map((subject) => subject.name).filter(Boolean),
    createdAt: row.TeacherCreatedAt ? new Date(row.TeacherCreatedAt) : (row.UserCreatedAt ? new Date(row.UserCreatedAt) : null),
    updatedAt: row.TeacherUpdatedAt ? new Date(row.TeacherUpdatedAt) : (row.UserUpdatedAt ? new Date(row.UserUpdatedAt) : null),
  };
};

const getRealTeacherRowsByFilter = async ({ lookupId = null, teacherIds = [], lookupPreference = 'user' } = {}) => {
  const sql = getSqlClient();
  const normalizedLookupId = normalizeTeacherNumericId(lookupId);
  const normalizedTeacherIds = [...new Set(
    teacherIds
      .map(normalizeTeacherNumericId)
      .filter(Boolean)
  )];

  if (normalizedLookupId) {
    const preferredColumn = lookupPreference === 'teacher' ? 'T.TeacherId' : 'T.UserId';
    const secondaryColumn = lookupPreference === 'teacher' ? 'T.UserId' : 'T.TeacherId';
    const result = await executeQuery(
      `${REAL_TEACHER_BASE_SELECT}
       WHERE T.TeacherId = @LookupId OR T.UserId = @LookupId
       ORDER BY
         CASE WHEN ${preferredColumn} = @LookupId THEN 0 ELSE 1 END,
         CASE WHEN ${secondaryColumn} = @LookupId THEN 0 ELSE 1 END,
         T.TeacherId DESC`,
      [{ name: 'LookupId', type: sql.Int, value: normalizedLookupId }]
    );

    return result?.recordset || [];
  }

  if (normalizedTeacherIds.length) {
    const result = await executeQuery(`
      ${REAL_TEACHER_BASE_SELECT}
      WHERE T.TeacherId IN (${normalizedTeacherIds.join(', ')})
    `);

    return result?.recordset || [];
  }

  const result = await executeQuery(`
    ${REAL_TEACHER_BASE_SELECT}
  `);

  return result?.recordset || [];
};

const hydrateRealTeacherRows = async (rows = []) => {
  const subjectMap = await getTeacherSubjectMap(rows.map((row) => row.TeacherId));
  return rows
    .map((row) => mapRealTeacherRow(row, subjectMap.get(Number(row.TeacherId)) || []))
    .filter(Boolean);
};

const filterRealTeachers = (teachers = [], { search = null } = {}) => {
  const normalizedSearch = toNullableString(search)?.toLowerCase() || null;
  if (!normalizedSearch) {
    return teachers;
  }

  return teachers.filter((teacher) => {
    const haystack = [
      teacher.fullName,
      teacher.email,
      teacher.phone,
      teacher.employeeCode,
      teacher.department,
      teacher.designation,
      teacher.qualification,
      ...teacher.subjects.map((subject) => subject.name),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalizedSearch);
  });
};

const sortRealTeachers = (teachers = [], sortBy = 'fullName', sortOrder = 'asc') => {
  const normalizedSortBy = String(sortBy || 'fullName').trim().toLowerCase();
  const direction = String(sortOrder || 'asc').trim().toLowerCase() === 'desc' ? -1 : 1;

  const getSortableValue = (teacher) => {
    switch (normalizedSortBy) {
      case 'email':
        return teacher.email || '';
      case 'phone':
        return teacher.phone || '';
      case 'qualification':
        return teacher.qualification || '';
      case 'experience':
      case 'experienceyears':
        return Number(teacher.experience || 0);
      case 'department':
        return teacher.department || '';
      case 'designation':
        return teacher.designation || '';
      case 'createdat':
        return teacher.createdAt ? teacher.createdAt.getTime() : 0;
      case 'updatedat':
        return teacher.updatedAt ? teacher.updatedAt.getTime() : 0;
      default:
        return teacher.fullName || '';
    }
  };

  return [...teachers].sort((left, right) => {
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

const TEACHER_SCHEMA_BATCH = `
IF OBJECT_ID(N'${TEACHER_TABLE}', N'U') IS NULL
BEGIN
  CREATE TABLE ${TEACHER_TABLE} (
    SqlTeacherId INT IDENTITY(1,1) PRIMARY KEY,
    MongoUserId NVARCHAR(64) NOT NULL,
    FullName NVARCHAR(200) NOT NULL,
    Email NVARCHAR(320) NULL,
    Phone NVARCHAR(40) NULL,
    Qualification NVARCHAR(255) NULL,
    ExperienceYears DECIMAL(5,2) NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_SqlTeachers_IsActive DEFAULT (1),
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlTeachers_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlTeachers_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SqlTeachers_MongoUserId' AND object_id = OBJECT_ID(N'${TEACHER_TABLE}'))
BEGIN
  CREATE UNIQUE INDEX UX_SqlTeachers_MongoUserId ON ${TEACHER_TABLE}(MongoUserId);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SqlTeachers_Email' AND object_id = OBJECT_ID(N'${TEACHER_TABLE}'))
BEGIN
  CREATE UNIQUE INDEX UX_SqlTeachers_Email ON ${TEACHER_TABLE}(Email) WHERE Email IS NOT NULL;
END;
`;

const TEACHER_PROCEDURES_BATCH = `
CREATE OR ALTER PROCEDURE dbo.spTeacherUpsertMirror
  @MongoUserId NVARCHAR(64),
  @FullName NVARCHAR(200),
  @Email NVARCHAR(320) = NULL,
  @Phone NVARCHAR(40) = NULL,
  @Qualification NVARCHAR(255) = NULL,
  @ExperienceYears DECIMAL(5,2) = NULL,
  @IsActive BIT,
  @CreatedAt DATETIME2(0),
  @UpdatedAt DATETIME2(0)
AS
BEGIN
  SET NOCOUNT ON;

  IF EXISTS (SELECT 1 FROM ${TEACHER_TABLE} WHERE MongoUserId = @MongoUserId)
  BEGIN
    UPDATE ${TEACHER_TABLE}
    SET FullName = @FullName,
        Email = @Email,
        Phone = COALESCE(@Phone, Phone),
        Qualification = COALESCE(@Qualification, Qualification),
        ExperienceYears = COALESCE(@ExperienceYears, ExperienceYears),
        IsActive = @IsActive,
        UpdatedAt = @UpdatedAt
    WHERE MongoUserId = @MongoUserId;
  END
  ELSE IF EXISTS (SELECT 1 FROM ${TEACHER_TABLE} WHERE Email = @Email AND @Email IS NOT NULL)
  BEGIN
    UPDATE ${TEACHER_TABLE}
    SET MongoUserId = @MongoUserId,
        FullName = @FullName,
        Phone = COALESCE(@Phone, Phone),
        Qualification = COALESCE(@Qualification, Qualification),
        ExperienceYears = COALESCE(@ExperienceYears, ExperienceYears),
        IsActive = @IsActive,
        UpdatedAt = @UpdatedAt
    WHERE Email = @Email;
  END
  ELSE
  BEGIN
    INSERT INTO ${TEACHER_TABLE} (
      MongoUserId,
      FullName,
      Email,
      Phone,
      Qualification,
      ExperienceYears,
      IsActive,
      CreatedAt,
      UpdatedAt
    )
    VALUES (
      @MongoUserId,
      @FullName,
      @Email,
      @Phone,
      @Qualification,
      @ExperienceYears,
      @IsActive,
      @CreatedAt,
      @UpdatedAt
    );
  END;

  SELECT TOP 1 * FROM ${TEACHER_TABLE} WHERE MongoUserId = @MongoUserId;
END;

CREATE OR ALTER PROCEDURE dbo.spTeacherList
  @Page INT = 1,
  @Limit INT = 10,
  @Search NVARCHAR(200) = NULL,
  @SortBy NVARCHAR(50) = N'createdAt',
  @SortOrder NVARCHAR(4) = N'desc'
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @SafeSortBy NVARCHAR(50) =
    CASE LOWER(@SortBy)
      WHEN N'fullname' THEN N'FullName'
      WHEN N'email' THEN N'Email'
      WHEN N'phone' THEN N'Phone'
      WHEN N'qualification' THEN N'Qualification'
      WHEN N'experience' THEN N'ExperienceYears'
      WHEN N'updatedat' THEN N'UpdatedAt'
      ELSE N'CreatedAt'
    END;

  DECLARE @SafeSortOrder NVARCHAR(4) =
    CASE WHEN LOWER(@SortOrder) = N'asc' THEN N'ASC' ELSE N'DESC' END;

  DECLARE @Offset INT = CASE WHEN ISNULL(@Page, 1) <= 1 THEN 0 ELSE (@Page - 1) * ISNULL(@Limit, 10) END;
  DECLARE @Sql NVARCHAR(MAX) = N'
    ;WITH Filtered AS (
      SELECT *
      FROM ${TEACHER_TABLE}
      WHERE (@Search IS NULL OR FullName LIKE N''%'' + @Search + N''%'' OR Email LIKE N''%'' + @Search + N''%'')
    )
    SELECT *,
           COUNT(1) OVER() AS TotalCount
    FROM Filtered
    ORDER BY ' + QUOTENAME(@SafeSortBy) + N' ' + @SafeSortOrder + N'
    OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;';

  EXEC sp_executesql
    @Sql,
    N'@Search NVARCHAR(200), @Offset INT, @Limit INT',
    @Search,
    @Offset,
    @Limit;
END;

CREATE OR ALTER PROCEDURE dbo.spTeacherGetById
  @MongoUserId NVARCHAR(64)
AS
BEGIN
  SET NOCOUNT ON;
  SELECT TOP 1 * FROM ${TEACHER_TABLE} WHERE MongoUserId = @MongoUserId;
END;

CREATE OR ALTER PROCEDURE dbo.spTeacherCreate
  @MongoUserId NVARCHAR(64),
  @FullName NVARCHAR(200),
  @Email NVARCHAR(320) = NULL,
  @Phone NVARCHAR(40) = NULL,
  @Qualification NVARCHAR(255) = NULL,
  @ExperienceYears DECIMAL(5,2) = NULL,
  @IsActive BIT,
  @CreatedAt DATETIME2(0),
  @UpdatedAt DATETIME2(0)
AS
BEGIN
  SET NOCOUNT ON;

  DELETE FROM ${TEACHER_TABLE}
  WHERE MongoUserId = @MongoUserId
     OR (Email = @Email AND @Email IS NOT NULL);

  INSERT INTO ${TEACHER_TABLE} (
    MongoUserId,
    FullName,
    Email,
    Phone,
    Qualification,
    ExperienceYears,
    IsActive,
    CreatedAt,
    UpdatedAt
  )
  VALUES (
    @MongoUserId,
    @FullName,
    @Email,
    @Phone,
    @Qualification,
    @ExperienceYears,
    @IsActive,
    @CreatedAt,
    @UpdatedAt
  );

  SELECT TOP 1 * FROM ${TEACHER_TABLE} WHERE MongoUserId = @MongoUserId;
END;

CREATE OR ALTER PROCEDURE dbo.spTeacherUpdate
  @MongoUserId NVARCHAR(64),
  @FullName NVARCHAR(200),
  @Email NVARCHAR(320) = NULL,
  @Phone NVARCHAR(40) = NULL,
  @Qualification NVARCHAR(255) = NULL,
  @ExperienceYears DECIMAL(5,2) = NULL,
  @IsActive BIT,
  @UpdatedAt DATETIME2(0)
AS
BEGIN
  SET NOCOUNT ON;

  UPDATE ${TEACHER_TABLE}
  SET FullName = @FullName,
      Email = @Email,
      Phone = @Phone,
      Qualification = @Qualification,
      ExperienceYears = @ExperienceYears,
      IsActive = @IsActive,
      UpdatedAt = @UpdatedAt
  WHERE MongoUserId = @MongoUserId;

  SELECT TOP 1 * FROM ${TEACHER_TABLE} WHERE MongoUserId = @MongoUserId;
END;

CREATE OR ALTER PROCEDURE dbo.spTeacherDelete
  @MongoUserId NVARCHAR(64)
AS
BEGIN
  SET NOCOUNT ON;
  DELETE FROM ${TEACHER_TABLE} WHERE MongoUserId = @MongoUserId;
  SELECT N'ok' AS ResultCode;
END;

CREATE OR ALTER PROCEDURE dbo.spTeacherGetFullProfile
  @MongoUserId NVARCHAR(64)
AS
BEGIN
  SET NOCOUNT ON;
  SELECT TOP 1 * FROM ${TEACHER_TABLE} WHERE MongoUserId = @MongoUserId;
END;

CREATE OR ALTER PROCEDURE dbo.spTeacherGetCount
  @OnlyActive BIT = 1
AS
BEGIN
  SET NOCOUNT ON;
  SELECT COUNT(1) AS TotalCount
  FROM ${TEACHER_TABLE}
  WHERE (@OnlyActive = 0 OR IsActive = 1);
END;

CREATE OR ALTER PROCEDURE dbo.spTeacherGetAvailable
AS
BEGIN
  SET NOCOUNT ON;
  SELECT *
  FROM ${TEACHER_TABLE}
  WHERE IsActive = 1
  ORDER BY FullName ASC;
END;
`;

const TEACHER_PROCEDURE_BATCHES = TEACHER_PROCEDURES_BATCH
  .split(/\n(?=CREATE OR ALTER PROCEDURE )/g)
  .map((statement) => statement.trim())
  .filter(Boolean);

const ensureTeacherSqlReady = async () => {
  if (!teacherBootstrapPromise) {
    teacherBootstrapPromise = (async () => {
      await ensureAuthSqlReady();
      const pool = await getPool();
      await pool.request().batch(TEACHER_SCHEMA_BATCH);
      for (const batch of TEACHER_PROCEDURE_BATCHES) {
        await pool.request().batch(batch);
      }
      return true;
    })().catch((error) => {
      teacherBootstrapPromise = null;
      throw error;
    });
  }

  return teacherBootstrapPromise;
};

const syncTeacherMirror = async (teacherDocument, overrides = {}) => {
  if (!teacherDocument) {
    return null;
  }

  await ensureTeacherSqlReady();

  const payload = toSqlTeacherPayload(teacherDocument, overrides);
  const result = await executeStoredProcedure(
    'dbo.spTeacherUpsertMirror',
    buildTeacherSqlParams(payload)
  );

  return mapTeacherRow(result?.recordset?.[0]);
};

const syncTeacherById = async (teacherId) => {
  return null;
};

const syncAllTeachersToSql = async ({ force = false } = {}) => {
  await ensureTeacherSqlReady();
  return null;
};

const getTeacherList = async ({
  page = 1,
  limit = 10,
  search = null,
  sortBy = 'createdAt',
  sortOrder = 'desc',
}) => {
  await ensureTeacherSqlReady();
  const normalizedPage = Math.max(Number(page) || 1, 1);
  const normalizedLimit = Math.max(Number(limit) || 10, 1);
  logTeacherSqlRead('query:TeacherList', {
    page: normalizedPage,
    limit: normalizedLimit,
    search: toNullableString(search),
    sortBy: toNullableString(sortBy) || 'createdAt',
    sortOrder: toNullableString(sortOrder) || 'desc',
  });
  const realRows = await getRealTeacherRowsByFilter();
  const realTeachers = await hydrateRealTeacherRows(realRows);
  const filteredTeachers = filterRealTeachers(realTeachers, { search });
  const sortedTeachers = sortRealTeachers(filteredTeachers, sortBy, sortOrder);
  const total = sortedTeachers.length;
  const startIndex = (normalizedPage - 1) * normalizedLimit;
  const paginatedTeachers = sortedTeachers.slice(startIndex, startIndex + normalizedLimit);

  return {
    teachers: paginatedTeachers,
    total,
    page: normalizedPage,
    limit: normalizedLimit,
    sourceQuery: 'dbo.Teachers+dbo.Users',
  };
};

const getTeacherById = async (teacherId, { lookupPreference = 'user' } = {}) => {
  await ensureTeacherSqlReady();
  const normalizedTeacherId = normalizeTeacherNumericId(teacherId);
  if (!normalizedTeacherId) {
    return null;
  }

  logTeacherSqlRead('query:TeacherLookup', { lookupId: normalizedTeacherId });
  const rows = await getRealTeacherRowsByFilter({
    lookupId: normalizedTeacherId,
    lookupPreference,
  });
  const teacherRow = rows[0] || null;
  if (!teacherRow) {
    return null;
  }

  const teachers = await hydrateRealTeacherRows([teacherRow]);
  return teachers[0] || null;
};

const createTeacherMirror = async (teacherDocument, overrides = {}) => {
  await ensureTeacherSqlReady();
  const payload = toSqlTeacherPayload(teacherDocument, overrides);
  const result = await executeStoredProcedure(
    'dbo.spTeacherCreate',
    buildTeacherSqlParams(payload)
  );

  return mapTeacherRow(result?.recordset?.[0]);
};

const updateTeacherMirror = async (teacherDocument, overrides = {}) => {
  await ensureTeacherSqlReady();
  const payload = toSqlTeacherPayload(teacherDocument, overrides);
  const params = buildTeacherSqlParams(payload).filter((param) => param.name !== 'CreatedAt');
  const result = await executeStoredProcedure('dbo.spTeacherUpdate', params);

  return mapTeacherRow(result?.recordset?.[0]);
};

const deleteTeacherMirror = async (teacherId) => {
  await ensureTeacherSqlReady();
  const sql = getSqlClient();
  await executeStoredProcedure('dbo.spTeacherDelete', [
    { name: 'MongoUserId', type: sql.NVarChar(64), value: String(teacherId) },
  ]);
};

const getTeacherFullProfile = async (teacherId) => {
  await ensureTeacherSqlReady();
  const normalizedTeacherId = normalizeTeacherNumericId(teacherId);
  if (!normalizedTeacherId) {
    return null;
  }

  const sql = getSqlClient();
  const rows = await getRealTeacherRowsByFilter({
    lookupId: normalizedTeacherId,
    lookupPreference: 'user',
  });
  const teacherRow = rows[0] || null;
  if (!teacherRow) {
    return null;
  }
  const teachers = await hydrateRealTeacherRows([teacherRow]);
  const teacher = teachers[0] || null;
  if (!teacher) {
    return null;
  }

  let timetable = [];
  let workload = 0;

  try {
    logTeacherSqlRead('dbo.usp_Teacher_FullProfile', { TeacherId: Number(teacherRow.TeacherId) });
    const result = await executeStoredProcedure('dbo.usp_Teacher_FullProfile', [
      { name: 'TeacherId', type: sql.Int, value: Number(teacherRow.TeacherId) },
    ]);
    const workloadResult = await executeStoredProcedure('dbo.usp_Teacher_Workload', [
      { name: 'TeacherId', type: sql.Int, value: Number(teacherRow.TeacherId) },
    ]);
    timetable = result?.recordsets?.[1] || [];
    workload = Number(workloadResult?.recordset?.[0]?.TotalClasses || 0);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[teachers][sql] teacher profile procedure fallback', {
        teacherId: Number(teacherRow.TeacherId),
        message: error?.message || 'Teacher profile procedure failed',
      });
    }
  }

  return {
    ...teacher,
    timetable,
    workload,
  };
};

const getTeacherCount = async ({ onlyActive = true } = {}) => {
  await ensureTeacherSqlReady();
  const sql = getSqlClient();
  logTeacherSqlRead('query:TeacherCount', { OnlyActive: !!onlyActive });
  const result = await executeQuery(`
    SELECT COUNT(1) AS TotalCount
    FROM dbo.Teachers T
    JOIN dbo.Users U ON T.UserId = U.UserId
    WHERE (@OnlyActive = 0 OR U.IsActive = 1)
  `, [
    { name: 'OnlyActive', type: sql.Bit, value: !!onlyActive },
  ]);

  return Number(result?.recordset?.[0]?.TotalCount || 0);
};

const getAvailableTeachers = async () => {
  await ensureTeacherSqlReady();
  logTeacherSqlRead('query:AvailableTeachers', { onlyActive: true });
  const result = await executeQuery(`
    ${REAL_TEACHER_BASE_SELECT}
    WHERE U.IsActive = 1
  `);
  return hydrateRealTeacherRows(result?.recordset || []);
};

const generateEmployeeCode = async (tx = null) => {
  const runner = tx?.query || executeQuery;
  const result = await runner(`
    SELECT TOP 1 TeacherId
    FROM dbo.Teachers
    ORDER BY TeacherId DESC
  `);
  const nextTeacherId = Number(result?.recordset?.[0]?.TeacherId || 0) + 1;
  return `EMP${String(nextTeacherId).padStart(4, '0')}`;
};

const updateTeacherUserProfile = async ({
  userId,
  gender = null,
  dateOfBirth = null,
  address = {},
}, tx = null) => {
  const normalizedUserId = normalizeTeacherNumericId(userId);
  if (!normalizedUserId) {
    return;
  }

  const normalizedAddress = normalizeAddress(address);
  const sql = getSqlClient();
  const runner = tx?.query || executeQuery;

  await runner(
    `UPDATE dbo.Users
     SET Gender = @Gender,
         DateOfBirth = @DateOfBirth,
         AddressLine1 = @AddressLine1,
         AddressLine2 = @AddressLine2,
         City = @City,
         State = @State,
         PostalCode = @PostalCode,
         Country = @Country,
         UpdatedAt = SYSUTCDATETIME()
     WHERE UserId = @UserId`,
    [
      { name: 'UserId', type: sql.Int, value: normalizedUserId },
      { name: 'Gender', type: sql.NVarChar(40), value: toNullableString(gender) },
      { name: 'DateOfBirth', type: sql.Date, value: toNullableDate(dateOfBirth) },
      { name: 'AddressLine1', type: sql.NVarChar(255), value: normalizedAddress.street },
      { name: 'AddressLine2', type: sql.NVarChar(255), value: normalizedAddress.line2 },
      { name: 'City', type: sql.NVarChar(200), value: normalizedAddress.city },
      { name: 'State', type: sql.NVarChar(200), value: normalizedAddress.state },
      { name: 'PostalCode', type: sql.NVarChar(20), value: normalizedAddress.pincode },
      { name: 'Country', type: sql.NVarChar(200), value: normalizedAddress.country },
    ]
  );
};

const createTeacherRecord = async ({
  userId,
  gender = null,
  dateOfBirth = null,
  address = {},
  qualification = null,
  experience = null,
  department = null,
  designation = null,
  joiningDate = null,
  bloodGroup = null,
  emergencyContact = null,
  notes = null,
} = {}) => {
  await ensureTeacherSqlReady();

  const createdTeacherId = await executeInTransaction(async (tx) => {
    const sql = getSqlClient();
    const normalizedUserId = normalizeTeacherNumericId(userId);
    if (!normalizedUserId) {
      throw new Error('A valid SQL user id is required to create a teacher.');
    }

    await updateTeacherUserProfile({
      userId: normalizedUserId,
      gender,
      dateOfBirth,
      address,
    }, tx);

    const employeeCode = await generateEmployeeCode(tx);
    const result = await tx.query(
      `INSERT INTO dbo.Teachers (
         UserId,
         EmployeeCode,
         Department,
         Designation,
         Qualification,
         ExperienceYears,
         JoiningDate,
         BloodGroup,
         EmergencyContact,
         Notes,
         CreatedAt,
         UpdatedAt
       )
       OUTPUT INSERTED.TeacherId
       VALUES (
         @UserId,
         @EmployeeCode,
         @Department,
         @Designation,
         @Qualification,
         @ExperienceYears,
         @JoiningDate,
         @BloodGroup,
         @EmergencyContact,
         @Notes,
         SYSUTCDATETIME(),
         SYSUTCDATETIME()
       )`,
      [
        { name: 'UserId', type: sql.Int, value: normalizedUserId },
        { name: 'EmployeeCode', type: sql.NVarChar(50), value: employeeCode },
        { name: 'Department', type: sql.NVarChar(200), value: toNullableString(department) },
        { name: 'Designation', type: sql.NVarChar(200), value: toNullableString(designation) },
        { name: 'Qualification', type: sql.NVarChar(255), value: toNullableString(qualification) },
        { name: 'ExperienceYears', type: sql.Decimal(5, 2), value: normalizeExperienceValue(experience) },
        { name: 'JoiningDate', type: sql.Date, value: toNullableDate(joiningDate) },
        { name: 'BloodGroup', type: sql.NVarChar(20), value: toNullableString(bloodGroup) },
        { name: 'EmergencyContact', type: sql.NVarChar(40), value: toNullableString(emergencyContact) },
        { name: 'Notes', type: sql.NVarChar(1000), value: toNullableString(notes) },
      ]
    );

    return normalizeTeacherNumericId(result?.recordset?.[0]?.TeacherId);
  });

  return getTeacherById(createdTeacherId, { lookupPreference: 'teacher' });
};

const updateTeacherRecord = async (teacherLookupId, updates = {}) => {
  await ensureTeacherSqlReady();
  const existingTeacher = await getTeacherById(teacherLookupId);
  if (!existingTeacher?.dbId) {
    return null;
  }

  await executeInTransaction(async (tx) => {
    const sql = getSqlClient();
    await updateTeacherUserProfile({
      userId: existingTeacher.userId,
      gender: updates.gender !== undefined ? updates.gender : existingTeacher.gender,
      dateOfBirth: updates.dateOfBirth !== undefined ? updates.dateOfBirth : existingTeacher.dateOfBirth,
      address: updates.address !== undefined ? updates.address : existingTeacher.address,
    }, tx);

    await tx.query(
      `UPDATE dbo.Teachers
       SET Qualification = @Qualification,
           ExperienceYears = @ExperienceYears,
           Department = @Department,
           Designation = @Designation,
           JoiningDate = @JoiningDate,
           BloodGroup = @BloodGroup,
           EmergencyContact = @EmergencyContact,
           Notes = @Notes,
           UpdatedAt = SYSUTCDATETIME()
       WHERE TeacherId = @TeacherId`,
      [
        { name: 'TeacherId', type: sql.Int, value: Number(existingTeacher.dbId) },
        { name: 'Qualification', type: sql.NVarChar(255), value: updates.qualification !== undefined ? toNullableString(updates.qualification) : toNullableString(existingTeacher.qualification) },
        { name: 'ExperienceYears', type: sql.Decimal(5, 2), value: updates.experience !== undefined ? normalizeExperienceValue(updates.experience) : normalizeExperienceValue(existingTeacher.experience) },
        { name: 'Department', type: sql.NVarChar(200), value: updates.department !== undefined ? toNullableString(updates.department) : toNullableString(existingTeacher.department) },
        { name: 'Designation', type: sql.NVarChar(200), value: updates.designation !== undefined ? toNullableString(updates.designation) : toNullableString(existingTeacher.designation) },
        { name: 'JoiningDate', type: sql.Date, value: updates.joiningDate !== undefined ? toNullableDate(updates.joiningDate) : toNullableDate(existingTeacher.joiningDate) },
        { name: 'BloodGroup', type: sql.NVarChar(20), value: updates.bloodGroup !== undefined ? toNullableString(updates.bloodGroup) : toNullableString(existingTeacher.bloodGroup) },
        { name: 'EmergencyContact', type: sql.NVarChar(40), value: updates.emergencyContact !== undefined ? toNullableString(updates.emergencyContact) : toNullableString(existingTeacher.emergencyContact) },
        { name: 'Notes', type: sql.NVarChar(1000), value: updates.notes !== undefined ? toNullableString(updates.notes) : toNullableString(existingTeacher.notes) },
      ]
    );
  });

  return getTeacherById(existingTeacher.userId || existingTeacher.id || existingTeacher.dbId);
};

const deleteTeacherRecord = async (teacherLookupId) => {
  await ensureTeacherSqlReady();
  const existingTeacher = await getTeacherById(teacherLookupId);
  if (!existingTeacher?.dbId) {
    return { resultCode: 'not_found' };
  }

  const sql = getSqlClient();
  await executeQuery(
    `DELETE FROM dbo.Teachers
     WHERE TeacherId = @TeacherId`,
    [{ name: 'TeacherId', type: sql.Int, value: Number(existingTeacher.dbId) }]
  );

  return { resultCode: 'ok' };
};

module.exports = {
  ensureTeacherSqlReady,
  syncTeacherMirror,
  syncTeacherById,
  syncAllTeachersToSql,
  getTeacherList,
  getTeacherById,
  createTeacherRecord,
  updateTeacherRecord,
  deleteTeacherRecord,
  createTeacherMirror,
  updateTeacherMirror,
  deleteTeacherMirror,
  getTeacherFullProfile,
  getTeacherCount,
  getAvailableTeachers,
};
