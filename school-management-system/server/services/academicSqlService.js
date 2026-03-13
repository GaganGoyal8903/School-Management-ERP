const {
  getSqlClient,
  executeQuery,
  executeStoredProcedure,
  getPool,
  executeInTransaction,
} = require('../config/sqlServer');
const { ensureAuthSqlReady } = require('./authSqlService');

const CLASS_TABLE = 'dbo.SqlClasses';
const SECTION_TABLE = 'dbo.SqlSections';
const SUBJECT_TABLE = 'dbo.SqlSubjects';
let academicBootstrapPromise = null;

const toNullableString = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
};

const parseNumericId = (value) => {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
};

const deriveClassSortOrder = (value) => {
  const text = String(value || '').trim();
  const match = text.match(/(\d+)/);
  if (!match) {
    return 999;
  }

  return Number(match[1]);
};

const deriveSectionSortOrder = (value) => {
  const text = String(value || '').trim().toUpperCase();
  if (!text) {
    return 999;
  }

  return text.charCodeAt(0) - 64;
};

const mapClassRow = (row) => {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.SqlClassId),
    name: row.Name,
    displayName: row.DisplayName || row.Name,
    sortOrder: Number(row.SortOrder || 0),
    isActive: row.IsActive === true || row.IsActive === 1,
    createdAt: row.CreatedAt ? new Date(row.CreatedAt) : null,
    updatedAt: row.UpdatedAt ? new Date(row.UpdatedAt) : null,
  };
};

const mapSectionRow = (row) => {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.SqlSectionId),
    name: row.Name,
    displayName: row.DisplayName || row.Name,
    sortOrder: Number(row.SortOrder || 0),
    isActive: row.IsActive === true || row.IsActive === 1,
    createdAt: row.CreatedAt ? new Date(row.CreatedAt) : null,
    updatedAt: row.UpdatedAt ? new Date(row.UpdatedAt) : null,
  };
};

const mapSubjectRow = (row) => {
  if (!row) {
    return null;
  }

  const subjectId = row.SubjectId ?? row.SqlSubjectId ?? row.MongoSubjectId ?? null;
  const classSubjectId = row.ClassSubjectId ?? null;
  const rowId = classSubjectId !== null && classSubjectId !== undefined
    ? String(classSubjectId)
    : (subjectId !== null && subjectId !== undefined ? String(subjectId) : String(row.MongoSubjectId));
  const teacherUserId = row.TeacherUserId ?? row.UserId ?? row.TeacherMongoUserId ?? null;

  return {
    _id: rowId,
    id: rowId,
    subjectId: subjectId !== null && subjectId !== undefined ? String(subjectId) : null,
    classSubjectId: classSubjectId !== null && classSubjectId !== undefined ? String(classSubjectId) : null,
    name: row.SubjectName || row.Name,
    code: row.SubjectCode || null,
    grade: row.ClassName || row.GradeName || null,
    className: row.ClassName || row.GradeName || null,
    sectionName: row.SectionName || '',
    description: row.Description || '',
    teacher: teacherUserId !== null && teacherUserId !== undefined ? String(teacherUserId) : null,
    teacherName: row.TeacherName || null,
    weeklyHours: row.WeeklyHours !== undefined && row.WeeklyHours !== null ? Number(row.WeeklyHours) : null,
    isOptional: row.IsOptional === true || row.IsOptional === 1,
    isActive: row.IsActive === undefined ? true : (row.IsActive === true || row.IsActive === 1),
    createdAt: row.CreatedAt ? new Date(row.CreatedAt) : null,
    updatedAt: row.UpdatedAt ? new Date(row.UpdatedAt) : null,
  };
};

const buildSubjectQueryFilters = ({ grade = null, search = null, lookupId = null } = {}) => {
  const sql = getSqlClient();
  const clauses = [
    's.IsActive = 1',
    'c.IsActive = 1',
  ];
  const params = [];

  if (grade) {
    clauses.push('c.ClassName = @GradeName');
    params.push({ name: 'GradeName', type: sql.NVarChar(100), value: toNullableString(grade) });
  }

  if (search) {
    clauses.push(`(
      s.SubjectName LIKE '%' + @Search + '%'
      OR ISNULL(s.SubjectCode, N'') LIKE '%' + @Search + '%'
      OR c.ClassName LIKE '%' + @Search + '%'
      OR ISNULL(sec.SectionName, N'') LIKE '%' + @Search + '%'
      OR ISNULL(u.FullName, N'') LIKE '%' + @Search + '%'
    )`);
    params.push({ name: 'Search', type: sql.NVarChar(200), value: toNullableString(search) });
  }

  if (lookupId !== null && lookupId !== undefined) {
    clauses.push('(cs.ClassSubjectId = @LookupId OR s.SubjectId = @LookupId)');
    params.push({ name: 'LookupId', type: sql.Int, value: lookupId });
  }

  return {
    params,
    whereClause: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
  };
};

const buildSubjectBaseSelect = ({ includeTotalCount = false } = {}) => `
  SELECT
    cs.ClassSubjectId,
    s.SubjectId,
    s.SubjectName,
    s.SubjectCode,
    s.Description,
    s.IsOptional,
    s.IsActive,
    c.ClassName,
    sec.SectionName,
    cs.WeeklyHours,
    t.TeacherId,
    u.UserId AS TeacherUserId,
    u.FullName AS TeacherName,
    cs.CreatedAt,
    cs.UpdatedAt
    ${includeTotalCount ? ', COUNT(1) OVER() AS TotalCount' : ''}
  FROM dbo.ClassSubjects cs
  INNER JOIN dbo.Subjects s
    ON s.SubjectId = cs.SubjectId
  INNER JOIN dbo.Classes c
    ON c.ClassId = cs.ClassId
  LEFT JOIN dbo.Sections sec
    ON sec.SectionId = cs.SectionId
  LEFT JOIN dbo.Teachers t
    ON t.TeacherId = cs.TeacherId
  LEFT JOIN dbo.Users u
    ON u.UserId = t.UserId
`;

const buildClassParams = ({ name, displayName, sortOrder, isActive, createdAt, updatedAt, sqlClassId }) => {
  const sql = getSqlClient();
  const params = [
    { name: 'Name', type: sql.NVarChar(100), value: name },
    { name: 'DisplayName', type: sql.NVarChar(120), value: displayName },
    { name: 'SortOrder', type: sql.Int, value: Number(sortOrder) || 0 },
    { name: 'IsActive', type: sql.Bit, value: isActive !== false },
    { name: 'CreatedAt', type: sql.DateTime2(0), value: createdAt || new Date() },
    { name: 'UpdatedAt', type: sql.DateTime2(0), value: updatedAt || new Date() },
  ];

  if (sqlClassId !== undefined) {
    params.unshift({ name: 'SqlClassId', type: sql.Int, value: sqlClassId });
  }

  return params;
};

const buildSectionParams = ({ name, displayName, sortOrder, isActive, createdAt, updatedAt, sqlSectionId }) => {
  const sql = getSqlClient();
  const params = [
    { name: 'Name', type: sql.NVarChar(50), value: name },
    { name: 'DisplayName', type: sql.NVarChar(80), value: displayName },
    { name: 'SortOrder', type: sql.Int, value: Number(sortOrder) || 0 },
    { name: 'IsActive', type: sql.Bit, value: isActive !== false },
    { name: 'CreatedAt', type: sql.DateTime2(0), value: createdAt || new Date() },
    { name: 'UpdatedAt', type: sql.DateTime2(0), value: updatedAt || new Date() },
  ];

  if (sqlSectionId !== undefined) {
    params.unshift({ name: 'SqlSectionId', type: sql.Int, value: sqlSectionId });
  }

  return params;
};

const buildSubjectParams = ({ mongoSubjectId, name, grade, description, teacherMongoUserId, isActive, createdAt, updatedAt }) => {
  const sql = getSqlClient();
  return [
    { name: 'MongoSubjectId', type: sql.NVarChar(64), value: mongoSubjectId },
    { name: 'Name', type: sql.NVarChar(200), value: name },
    { name: 'GradeName', type: sql.NVarChar(100), value: grade },
    { name: 'Description', type: sql.NVarChar(1000), value: description },
    { name: 'TeacherMongoUserId', type: sql.NVarChar(64), value: teacherMongoUserId },
    { name: 'IsActive', type: sql.Bit, value: isActive !== false },
    { name: 'CreatedAt', type: sql.DateTime2(0), value: createdAt || new Date() },
    { name: 'UpdatedAt', type: sql.DateTime2(0), value: updatedAt || new Date() },
  ];
};

const ACADEMIC_SCHEMA_BATCH = `
IF OBJECT_ID(N'${CLASS_TABLE}', N'U') IS NULL
BEGIN
  CREATE TABLE ${CLASS_TABLE} (
    SqlClassId INT IDENTITY(1,1) PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL,
    DisplayName NVARCHAR(120) NOT NULL,
    SortOrder INT NOT NULL CONSTRAINT DF_SqlClasses_SortOrder DEFAULT (0),
    IsActive BIT NOT NULL CONSTRAINT DF_SqlClasses_IsActive DEFAULT (1),
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlClasses_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlClasses_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SqlClasses_Name' AND object_id = OBJECT_ID(N'${CLASS_TABLE}'))
BEGIN
  CREATE UNIQUE INDEX UX_SqlClasses_Name ON ${CLASS_TABLE}(Name);
END;

IF OBJECT_ID(N'${SECTION_TABLE}', N'U') IS NULL
BEGIN
  CREATE TABLE ${SECTION_TABLE} (
    SqlSectionId INT IDENTITY(1,1) PRIMARY KEY,
    Name NVARCHAR(50) NOT NULL,
    DisplayName NVARCHAR(80) NOT NULL,
    SortOrder INT NOT NULL CONSTRAINT DF_SqlSections_SortOrder DEFAULT (0),
    IsActive BIT NOT NULL CONSTRAINT DF_SqlSections_IsActive DEFAULT (1),
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlSections_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlSections_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SqlSections_Name' AND object_id = OBJECT_ID(N'${SECTION_TABLE}'))
BEGIN
  CREATE UNIQUE INDEX UX_SqlSections_Name ON ${SECTION_TABLE}(Name);
END;

IF OBJECT_ID(N'${SUBJECT_TABLE}', N'U') IS NULL
BEGIN
  CREATE TABLE ${SUBJECT_TABLE} (
    SqlSubjectId INT IDENTITY(1,1) PRIMARY KEY,
    MongoSubjectId NVARCHAR(64) NOT NULL,
    Name NVARCHAR(200) NOT NULL,
    GradeName NVARCHAR(100) NOT NULL,
    Description NVARCHAR(1000) NULL,
    TeacherMongoUserId NVARCHAR(64) NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_SqlSubjects_IsActive DEFAULT (1),
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlSubjects_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlSubjects_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SqlSubjects_MongoSubjectId' AND object_id = OBJECT_ID(N'${SUBJECT_TABLE}'))
BEGIN
  CREATE UNIQUE INDEX UX_SqlSubjects_MongoSubjectId ON ${SUBJECT_TABLE}(MongoSubjectId);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SqlSubjects_GradeName' AND object_id = OBJECT_ID(N'${SUBJECT_TABLE}'))
BEGIN
  CREATE INDEX IX_SqlSubjects_GradeName ON ${SUBJECT_TABLE}(GradeName, Name);
END;
`;

const ACADEMIC_PROCEDURES_BATCH = `
CREATE OR ALTER PROCEDURE dbo.spClassUpsertMirror
  @Name NVARCHAR(100),
  @DisplayName NVARCHAR(120),
  @SortOrder INT,
  @IsActive BIT,
  @CreatedAt DATETIME2(0),
  @UpdatedAt DATETIME2(0)
AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (SELECT 1 FROM ${CLASS_TABLE} WHERE Name = @Name)
  BEGIN
    UPDATE ${CLASS_TABLE}
    SET DisplayName = @DisplayName,
        SortOrder = @SortOrder,
        IsActive = @IsActive,
        UpdatedAt = @UpdatedAt
    WHERE Name = @Name;
  END
  ELSE
  BEGIN
    INSERT INTO ${CLASS_TABLE}(Name, DisplayName, SortOrder, IsActive, CreatedAt, UpdatedAt)
    VALUES (@Name, @DisplayName, @SortOrder, @IsActive, @CreatedAt, @UpdatedAt);
  END;

  SELECT TOP 1 * FROM ${CLASS_TABLE} WHERE Name = @Name;
END;

CREATE OR ALTER PROCEDURE dbo.spClassList
  @Page INT = 1,
  @Limit INT = 50,
  @Search NVARCHAR(100) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @Offset INT = CASE WHEN ISNULL(@Page, 1) <= 1 THEN 0 ELSE (@Page - 1) * ISNULL(@Limit, 50) END;

  ;WITH Filtered AS (
    SELECT *
    FROM ${CLASS_TABLE}
    WHERE (@Search IS NULL OR Name LIKE N'%' + @Search + N'%' OR DisplayName LIKE N'%' + @Search + N'%')
  )
  SELECT *,
         COUNT(1) OVER() AS TotalCount
  FROM Filtered
  ORDER BY SortOrder ASC, DisplayName ASC
  OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
END;

CREATE OR ALTER PROCEDURE dbo.spClassGetById
  @SqlClassId INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT TOP 1 * FROM ${CLASS_TABLE} WHERE SqlClassId = @SqlClassId;
END;

CREATE OR ALTER PROCEDURE dbo.spClassCreate
  @Name NVARCHAR(100),
  @DisplayName NVARCHAR(120),
  @SortOrder INT,
  @IsActive BIT,
  @CreatedAt DATETIME2(0),
  @UpdatedAt DATETIME2(0)
AS
BEGIN
  SET NOCOUNT ON;
  INSERT INTO ${CLASS_TABLE}(Name, DisplayName, SortOrder, IsActive, CreatedAt, UpdatedAt)
  VALUES (@Name, @DisplayName, @SortOrder, @IsActive, @CreatedAt, @UpdatedAt);

  SELECT TOP 1 * FROM ${CLASS_TABLE} WHERE SqlClassId = SCOPE_IDENTITY();
END;

CREATE OR ALTER PROCEDURE dbo.spClassUpdate
  @SqlClassId INT,
  @Name NVARCHAR(100),
  @DisplayName NVARCHAR(120),
  @SortOrder INT,
  @IsActive BIT,
  @UpdatedAt DATETIME2(0)
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE ${CLASS_TABLE}
  SET Name = @Name,
      DisplayName = @DisplayName,
      SortOrder = @SortOrder,
      IsActive = @IsActive,
      UpdatedAt = @UpdatedAt
  WHERE SqlClassId = @SqlClassId;

  SELECT TOP 1 * FROM ${CLASS_TABLE} WHERE SqlClassId = @SqlClassId;
END;

CREATE OR ALTER PROCEDURE dbo.spClassDelete
  @SqlClassId INT
AS
BEGIN
  SET NOCOUNT ON;
  DELETE FROM ${CLASS_TABLE} WHERE SqlClassId = @SqlClassId;
  SELECT N'ok' AS ResultCode;
END;

CREATE OR ALTER PROCEDURE dbo.spSectionUpsertMirror
  @Name NVARCHAR(50),
  @DisplayName NVARCHAR(80),
  @SortOrder INT,
  @IsActive BIT,
  @CreatedAt DATETIME2(0),
  @UpdatedAt DATETIME2(0)
AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (SELECT 1 FROM ${SECTION_TABLE} WHERE Name = @Name)
  BEGIN
    UPDATE ${SECTION_TABLE}
    SET DisplayName = @DisplayName,
        SortOrder = @SortOrder,
        IsActive = @IsActive,
        UpdatedAt = @UpdatedAt
    WHERE Name = @Name;
  END
  ELSE
  BEGIN
    INSERT INTO ${SECTION_TABLE}(Name, DisplayName, SortOrder, IsActive, CreatedAt, UpdatedAt)
    VALUES (@Name, @DisplayName, @SortOrder, @IsActive, @CreatedAt, @UpdatedAt);
  END;

  SELECT TOP 1 * FROM ${SECTION_TABLE} WHERE Name = @Name;
END;

CREATE OR ALTER PROCEDURE dbo.spSectionList
  @Page INT = 1,
  @Limit INT = 50,
  @Search NVARCHAR(100) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @Offset INT = CASE WHEN ISNULL(@Page, 1) <= 1 THEN 0 ELSE (@Page - 1) * ISNULL(@Limit, 50) END;

  ;WITH Filtered AS (
    SELECT *
    FROM ${SECTION_TABLE}
    WHERE (@Search IS NULL OR Name LIKE N'%' + @Search + N'%' OR DisplayName LIKE N'%' + @Search + N'%')
  )
  SELECT *,
         COUNT(1) OVER() AS TotalCount
  FROM Filtered
  ORDER BY SortOrder ASC, DisplayName ASC
  OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
END;

CREATE OR ALTER PROCEDURE dbo.spSectionGetById
  @SqlSectionId INT
AS
BEGIN
  SET NOCOUNT ON;
  SELECT TOP 1 * FROM ${SECTION_TABLE} WHERE SqlSectionId = @SqlSectionId;
END;

CREATE OR ALTER PROCEDURE dbo.spSectionCreate
  @Name NVARCHAR(50),
  @DisplayName NVARCHAR(80),
  @SortOrder INT,
  @IsActive BIT,
  @CreatedAt DATETIME2(0),
  @UpdatedAt DATETIME2(0)
AS
BEGIN
  SET NOCOUNT ON;
  INSERT INTO ${SECTION_TABLE}(Name, DisplayName, SortOrder, IsActive, CreatedAt, UpdatedAt)
  VALUES (@Name, @DisplayName, @SortOrder, @IsActive, @CreatedAt, @UpdatedAt);

  SELECT TOP 1 * FROM ${SECTION_TABLE} WHERE SqlSectionId = SCOPE_IDENTITY();
END;

CREATE OR ALTER PROCEDURE dbo.spSectionUpdate
  @SqlSectionId INT,
  @Name NVARCHAR(50),
  @DisplayName NVARCHAR(80),
  @SortOrder INT,
  @IsActive BIT,
  @UpdatedAt DATETIME2(0)
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE ${SECTION_TABLE}
  SET Name = @Name,
      DisplayName = @DisplayName,
      SortOrder = @SortOrder,
      IsActive = @IsActive,
      UpdatedAt = @UpdatedAt
  WHERE SqlSectionId = @SqlSectionId;

  SELECT TOP 1 * FROM ${SECTION_TABLE} WHERE SqlSectionId = @SqlSectionId;
END;

CREATE OR ALTER PROCEDURE dbo.spSectionDelete
  @SqlSectionId INT
AS
BEGIN
  SET NOCOUNT ON;
  DELETE FROM ${SECTION_TABLE} WHERE SqlSectionId = @SqlSectionId;
  SELECT N'ok' AS ResultCode;
END;

CREATE OR ALTER PROCEDURE dbo.spSubjectUpsertMirror
  @MongoSubjectId NVARCHAR(64),
  @Name NVARCHAR(200),
  @GradeName NVARCHAR(100),
  @Description NVARCHAR(1000) = NULL,
  @TeacherMongoUserId NVARCHAR(64) = NULL,
  @IsActive BIT,
  @CreatedAt DATETIME2(0),
  @UpdatedAt DATETIME2(0)
AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (SELECT 1 FROM ${SUBJECT_TABLE} WHERE MongoSubjectId = @MongoSubjectId)
  BEGIN
    UPDATE ${SUBJECT_TABLE}
    SET Name = @Name,
        GradeName = @GradeName,
        Description = @Description,
        TeacherMongoUserId = @TeacherMongoUserId,
        IsActive = @IsActive,
        UpdatedAt = @UpdatedAt
    WHERE MongoSubjectId = @MongoSubjectId;
  END
  ELSE
  BEGIN
    INSERT INTO ${SUBJECT_TABLE}(
      MongoSubjectId,
      Name,
      GradeName,
      Description,
      TeacherMongoUserId,
      IsActive,
      CreatedAt,
      UpdatedAt
    )
    VALUES (
      @MongoSubjectId,
      @Name,
      @GradeName,
      @Description,
      @TeacherMongoUserId,
      @IsActive,
      @CreatedAt,
      @UpdatedAt
    );
  END;

  SELECT TOP 1 * FROM ${SUBJECT_TABLE} WHERE MongoSubjectId = @MongoSubjectId;
END;

CREATE OR ALTER PROCEDURE dbo.spSubjectList
  @Page INT = 1,
  @Limit INT = 10,
  @GradeName NVARCHAR(100) = NULL,
  @Search NVARCHAR(200) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @Offset INT = CASE WHEN ISNULL(@Page, 1) <= 1 THEN 0 ELSE (@Page - 1) * ISNULL(@Limit, 10) END;

  ;WITH Filtered AS (
    SELECT *
    FROM ${SUBJECT_TABLE}
    WHERE IsActive = 1
      AND (@GradeName IS NULL OR GradeName = @GradeName)
      AND (@Search IS NULL OR Name LIKE N'%' + @Search + N'%')
  )
  SELECT *,
         COUNT(1) OVER() AS TotalCount
  FROM Filtered
  ORDER BY Name ASC
  OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
END;

CREATE OR ALTER PROCEDURE dbo.spSubjectGetById
  @MongoSubjectId NVARCHAR(64)
AS
BEGIN
  SET NOCOUNT ON;
  SELECT TOP 1 * FROM ${SUBJECT_TABLE} WHERE MongoSubjectId = @MongoSubjectId AND IsActive = 1;
END;

CREATE OR ALTER PROCEDURE dbo.spSubjectCreate
  @MongoSubjectId NVARCHAR(64),
  @Name NVARCHAR(200),
  @GradeName NVARCHAR(100),
  @Description NVARCHAR(1000) = NULL,
  @TeacherMongoUserId NVARCHAR(64) = NULL,
  @IsActive BIT,
  @CreatedAt DATETIME2(0),
  @UpdatedAt DATETIME2(0)
AS
BEGIN
  SET NOCOUNT ON;
  DELETE FROM ${SUBJECT_TABLE} WHERE MongoSubjectId = @MongoSubjectId;

  INSERT INTO ${SUBJECT_TABLE}(
    MongoSubjectId,
    Name,
    GradeName,
    Description,
    TeacherMongoUserId,
    IsActive,
    CreatedAt,
    UpdatedAt
  )
  VALUES (
    @MongoSubjectId,
    @Name,
    @GradeName,
    @Description,
    @TeacherMongoUserId,
    @IsActive,
    @CreatedAt,
    @UpdatedAt
  );

  SELECT TOP 1 * FROM ${SUBJECT_TABLE} WHERE MongoSubjectId = @MongoSubjectId;
END;

CREATE OR ALTER PROCEDURE dbo.spSubjectUpdate
  @MongoSubjectId NVARCHAR(64),
  @Name NVARCHAR(200),
  @GradeName NVARCHAR(100),
  @Description NVARCHAR(1000) = NULL,
  @TeacherMongoUserId NVARCHAR(64) = NULL,
  @IsActive BIT,
  @UpdatedAt DATETIME2(0)
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE ${SUBJECT_TABLE}
  SET Name = @Name,
      GradeName = @GradeName,
      Description = @Description,
      TeacherMongoUserId = @TeacherMongoUserId,
      IsActive = @IsActive,
      UpdatedAt = @UpdatedAt
  WHERE MongoSubjectId = @MongoSubjectId;

  SELECT TOP 1 * FROM ${SUBJECT_TABLE} WHERE MongoSubjectId = @MongoSubjectId;
END;

CREATE OR ALTER PROCEDURE dbo.spSubjectDelete
  @MongoSubjectId NVARCHAR(64)
AS
BEGIN
  SET NOCOUNT ON;
  DELETE FROM ${SUBJECT_TABLE} WHERE MongoSubjectId = @MongoSubjectId;
  SELECT N'ok' AS ResultCode;
END;

CREATE OR ALTER PROCEDURE dbo.spSubjectListByGrade
  @GradeName NVARCHAR(100)
AS
BEGIN
  SET NOCOUNT ON;
  SELECT *
  FROM ${SUBJECT_TABLE}
  WHERE IsActive = 1 AND GradeName = @GradeName
  ORDER BY Name ASC;
END;

CREATE OR ALTER PROCEDURE dbo.spSubjectGetCount
AS
BEGIN
  SET NOCOUNT ON;
  SELECT COUNT(1) AS TotalCount
  FROM ${SUBJECT_TABLE}
  WHERE IsActive = 1;
END;

CREATE OR ALTER PROCEDURE dbo.spSubjectAssignTeacher
  @MongoSubjectId NVARCHAR(64),
  @TeacherMongoUserId NVARCHAR(64) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE ${SUBJECT_TABLE}
  SET TeacherMongoUserId = @TeacherMongoUserId,
      UpdatedAt = SYSUTCDATETIME()
  WHERE MongoSubjectId = @MongoSubjectId;

  SELECT TOP 1 * FROM ${SUBJECT_TABLE} WHERE MongoSubjectId = @MongoSubjectId;
END;
`;

const ACADEMIC_PROCEDURE_BATCHES = ACADEMIC_PROCEDURES_BATCH
  .split(/\n(?=CREATE OR ALTER PROCEDURE )/g)
  .map((statement) => statement.trim())
  .filter(Boolean);

const ensureAcademicSqlReady = async () => {
  if (!academicBootstrapPromise) {
    academicBootstrapPromise = (async () => {
      await ensureAuthSqlReady();
      const pool = await getPool();
      await pool.request().batch(ACADEMIC_SCHEMA_BATCH);
      for (const batch of ACADEMIC_PROCEDURE_BATCHES) {
        await pool.request().batch(batch);
      }
      return true;
    })().catch((error) => {
      academicBootstrapPromise = null;
      throw error;
    });
  }

  return academicBootstrapPromise;
};

const syncSubjectMirror = async (subjectDocument) => {
  if (!subjectDocument) {
    return null;
  }

  await ensureAcademicSqlReady();

  const subject = subjectDocument.toObject ? subjectDocument.toObject() : subjectDocument;
  const result = await executeStoredProcedure('dbo.spSubjectUpsertMirror', buildSubjectParams({
    mongoSubjectId: String(subject._id),
    name: toNullableString(subject.name),
    grade: toNullableString(subject.grade),
    description: toNullableString(subject.description),
    teacherMongoUserId: subject.teacher ? String(subject.teacher) : null,
    isActive: true,
    createdAt: subject.createdAt || new Date(),
    updatedAt: subject.updatedAt || new Date(),
  }));

  return mapSubjectRow(result?.recordset?.[0]);
};

const syncAllSubjectsToSql = async ({ force = false } = {}) => {
  await ensureAcademicSqlReady();
  return null;
};

const getClassList = async ({ page = 1, limit = 50, search = null } = {}) => {
  await ensureAcademicSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spClassList', [
    { name: 'Page', type: sql.Int, value: Number(page) || 1 },
    { name: 'Limit', type: sql.Int, value: Number(limit) || 50 },
    { name: 'Search', type: sql.NVarChar(100), value: toNullableString(search) },
  ]);

  const rows = result?.recordset || [];
  const total = rows.length ? Number(rows[0].TotalCount || 0) : 0;

  return {
    classes: rows.map(mapClassRow),
    total,
  };
};

const getClassById = async (id) => {
  await ensureAcademicSqlReady();
  const sqlId = parseNumericId(id);
  if (!sqlId) {
    return null;
  }

  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spClassGetById', [
    { name: 'SqlClassId', type: sql.Int, value: sqlId },
  ]);

  return mapClassRow(result?.recordset?.[0]);
};

const createClassRecord = async ({ name, displayName, sortOrder, isActive = true }) => {
  await ensureAcademicSqlReady();
  const result = await executeStoredProcedure('dbo.spClassCreate', buildClassParams({
    name,
    displayName,
    sortOrder,
    isActive,
  }));

  return mapClassRow(result?.recordset?.[0]);
};

const updateClassRecord = async ({ id, name, displayName, sortOrder, isActive = true }) => {
  await ensureAcademicSqlReady();
  const sqlId = parseNumericId(id);
  if (!sqlId) {
    return null;
  }

  const result = await executeStoredProcedure('dbo.spClassUpdate', buildClassParams({
    sqlClassId: sqlId,
    name,
    displayName,
    sortOrder,
    isActive,
    updatedAt: new Date(),
  }).filter((param) => param.name !== 'CreatedAt'));

  return mapClassRow(result?.recordset?.[0]);
};

const deleteClassRecord = async (id) => {
  await ensureAcademicSqlReady();
  const sqlId = parseNumericId(id);
  if (!sqlId) {
    return false;
  }

  const sql = getSqlClient();
  await executeStoredProcedure('dbo.spClassDelete', [
    { name: 'SqlClassId', type: sql.Int, value: sqlId },
  ]);
  return true;
};

const getSectionList = async ({ page = 1, limit = 50, search = null } = {}) => {
  await ensureAcademicSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spSectionList', [
    { name: 'Page', type: sql.Int, value: Number(page) || 1 },
    { name: 'Limit', type: sql.Int, value: Number(limit) || 50 },
    { name: 'Search', type: sql.NVarChar(100), value: toNullableString(search) },
  ]);

  const rows = result?.recordset || [];
  const total = rows.length ? Number(rows[0].TotalCount || 0) : 0;

  return {
    sections: rows.map(mapSectionRow),
    total,
  };
};

const getSectionById = async (id) => {
  await ensureAcademicSqlReady();
  const sqlId = parseNumericId(id);
  if (!sqlId) {
    return null;
  }

  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spSectionGetById', [
    { name: 'SqlSectionId', type: sql.Int, value: sqlId },
  ]);

  return mapSectionRow(result?.recordset?.[0]);
};

const createSectionRecord = async ({ name, displayName, sortOrder, isActive = true }) => {
  await ensureAcademicSqlReady();
  const result = await executeStoredProcedure('dbo.spSectionCreate', buildSectionParams({
    name,
    displayName,
    sortOrder,
    isActive,
  }));

  return mapSectionRow(result?.recordset?.[0]);
};

const updateSectionRecord = async ({ id, name, displayName, sortOrder, isActive = true }) => {
  await ensureAcademicSqlReady();
  const sqlId = parseNumericId(id);
  if (!sqlId) {
    return null;
  }

  const result = await executeStoredProcedure('dbo.spSectionUpdate', buildSectionParams({
    sqlSectionId: sqlId,
    name,
    displayName,
    sortOrder,
    isActive,
    updatedAt: new Date(),
  }).filter((param) => param.name !== 'CreatedAt'));

  return mapSectionRow(result?.recordset?.[0]);
};

const deleteSectionRecord = async (id) => {
  await ensureAcademicSqlReady();
  const sqlId = parseNumericId(id);
  if (!sqlId) {
    return false;
  }

  const sql = getSqlClient();
  await executeStoredProcedure('dbo.spSectionDelete', [
    { name: 'SqlSectionId', type: sql.Int, value: sqlId },
  ]);
  return true;
};

const getSubjectList = async ({ page = 1, limit = 10, grade = null, search = null } = {}) => {
  await ensureAcademicSqlReady();
  const sql = getSqlClient();
  const safePage = Number(page) || 1;
  const safeLimit = Number(limit) || 10;
  const offset = Math.max(safePage - 1, 0) * safeLimit;
  const filter = buildSubjectQueryFilters({ grade, search });
  const result = await executeQuery(`
    ${buildSubjectBaseSelect({ includeTotalCount: true })}
    ${filter.whereClause}
    ORDER BY c.ClassName, ISNULL(sec.SectionName, N''), s.SubjectName
    OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
  `, [
    ...filter.params,
    { name: 'Offset', type: sql.Int, value: offset },
    { name: 'Limit', type: sql.Int, value: safeLimit },
  ]);

  const rows = result?.recordset || [];
  const total = rows.length ? Number(rows[0].TotalCount || 0) : 0;

  return {
    subjects: rows.map(mapSubjectRow),
    total,
  };
};

const getSubjectById = async (id) => {
  await ensureAcademicSqlReady();
  const sqlId = parseNumericId(id);
  if (!sqlId) {
    return null;
  }

  const filter = buildSubjectQueryFilters({ lookupId: sqlId });
  const result = await executeQuery(`
    ${buildSubjectBaseSelect()}
    ${filter.whereClause}
    ORDER BY CASE WHEN cs.ClassSubjectId = @LookupId THEN 0 ELSE 1 END, c.ClassName, s.SubjectName;
  `, filter.params);

  return mapSubjectRow(result?.recordset?.[0]);
};

const syncSubjectById = async (id) => {
  return null;
};

const createSubjectMirror = async (subjectDocument) => {
  await ensureAcademicSqlReady();
  const subject = subjectDocument.toObject ? subjectDocument.toObject() : subjectDocument;
  const result = await executeStoredProcedure('dbo.spSubjectCreate', buildSubjectParams({
    mongoSubjectId: String(subject._id),
    name: toNullableString(subject.name),
    grade: toNullableString(subject.grade),
    description: toNullableString(subject.description),
    teacherMongoUserId: subject.teacher ? String(subject.teacher) : null,
    isActive: true,
    createdAt: subject.createdAt || new Date(),
    updatedAt: subject.updatedAt || new Date(),
  }));

  return mapSubjectRow(result?.recordset?.[0]);
};

const updateSubjectMirror = async (subjectDocument) => {
  await ensureAcademicSqlReady();
  const subject = subjectDocument.toObject ? subjectDocument.toObject() : subjectDocument;
  const params = buildSubjectParams({
    mongoSubjectId: String(subject._id),
    name: toNullableString(subject.name),
    grade: toNullableString(subject.grade),
    description: toNullableString(subject.description),
    teacherMongoUserId: subject.teacher ? String(subject.teacher) : null,
    isActive: true,
    updatedAt: subject.updatedAt || new Date(),
  }).filter((param) => param.name !== 'CreatedAt');

  const result = await executeStoredProcedure('dbo.spSubjectUpdate', params);
  return mapSubjectRow(result?.recordset?.[0]);
};

const deleteSubjectMirror = async (id) => {
  await ensureAcademicSqlReady();
  const sql = getSqlClient();
  await executeStoredProcedure('dbo.spSubjectDelete', [
    { name: 'MongoSubjectId', type: sql.NVarChar(64), value: String(id) },
  ]);
};

const getSubjectsByGrade = async (grade) => {
  await ensureAcademicSqlReady();
  const filter = buildSubjectQueryFilters({ grade });
  const result = await executeQuery(`
    ${buildSubjectBaseSelect()}
    ${filter.whereClause}
    ORDER BY ISNULL(sec.SectionName, N''), s.SubjectName;
  `, filter.params);

  return (result?.recordset || []).map(mapSubjectRow);
};

const getSubjectCount = async () => {
  await ensureAcademicSqlReady();
  const result = await executeQuery(`
    SELECT COUNT(1) AS TotalCount
    FROM dbo.ClassSubjects cs
    INNER JOIN dbo.Subjects s
      ON s.SubjectId = cs.SubjectId
    INNER JOIN dbo.Classes c
      ON c.ClassId = cs.ClassId
    WHERE s.IsActive = 1
      AND c.IsActive = 1;
  `);
  return Number(result?.recordset?.[0]?.TotalCount || 0);
};

const assignTeacherToSubjectMirror = async ({ subjectId, teacherId }) => {
  await ensureAcademicSqlReady();
  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spSubjectAssignTeacher', [
    { name: 'MongoSubjectId', type: sql.NVarChar(64), value: String(subjectId) },
    { name: 'TeacherMongoUserId', type: sql.NVarChar(64), value: teacherId ? String(teacherId) : null },
  ]);

  return mapSubjectRow(result?.recordset?.[0]);
};

const resolveClassIdByName = async (className, tx = null) => {
  const normalizedClassName = toNullableString(className);
  if (!normalizedClassName) {
    return null;
  }

  const sql = getSqlClient();
  const runner = tx?.query || executeQuery;
  const result = await runner(
    `SELECT TOP 1 ClassId
     FROM dbo.Classes
     WHERE ClassName = @ClassName
       AND ISNULL(IsActive, 1) = 1`,
    [{ name: 'ClassName', type: sql.NVarChar(100), value: normalizedClassName }]
  );

  return parseNumericId(result?.recordset?.[0]?.ClassId);
};

const resolveTeacherDbId = async (teacherLookupId, tx = null) => {
  const normalizedLookupId = parseNumericId(teacherLookupId);
  if (!normalizedLookupId) {
    return null;
  }

  const sql = getSqlClient();
  const runner = tx?.query || executeQuery;
  const result = await runner(
    `SELECT TOP 1 TeacherId
     FROM dbo.Teachers
     WHERE TeacherId = @LookupId OR UserId = @LookupId`,
    [{ name: 'LookupId', type: sql.Int, value: normalizedLookupId }]
  );

  return parseNumericId(result?.recordset?.[0]?.TeacherId);
};

const generateSubjectCode = async (name, tx = null) => {
  const normalizedName = String(name || '').trim().toUpperCase();
  const prefix = (normalizedName.match(/[A-Z]/g) || []).slice(0, 4).join('') || 'SUBJ';
  const runner = tx?.query || executeQuery;
  const result = await runner(`
    SELECT TOP 1 SubjectId
    FROM dbo.Subjects
    ORDER BY SubjectId DESC
  `);
  const nextId = Number(result?.recordset?.[0]?.SubjectId || 0) + 1;
  return `${prefix}${String(nextId).padStart(3, '0')}`;
};

const createSubjectRecord = async ({ name, grade, description = null, teacher = null } = {}) => {
  await ensureAcademicSqlReady();

  const createdSubjectLookupId = await executeInTransaction(async (tx) => {
    const sql = getSqlClient();
    const classId = await resolveClassIdByName(grade, tx);
    if (!classId) {
      throw new Error(`Class '${grade}' was not found in SQL Server.`);
    }

    const teacherDbId = await resolveTeacherDbId(teacher, tx);
    const subjectCode = await generateSubjectCode(name, tx);
    const insertSubject = await tx.query(
      `INSERT INTO dbo.Subjects (
         SubjectName,
         SubjectCode,
         Description,
         IsOptional,
         IsActive,
         CreatedAt,
         UpdatedAt
       )
       OUTPUT INSERTED.SubjectId
       VALUES (
         @SubjectName,
         @SubjectCode,
         @Description,
         0,
         1,
         SYSUTCDATETIME(),
         SYSUTCDATETIME()
       )`,
      [
        { name: 'SubjectName', type: sql.NVarChar(200), value: String(name || '').trim() },
        { name: 'SubjectCode', type: sql.NVarChar(50), value: subjectCode },
        { name: 'Description', type: sql.NVarChar(1000), value: toNullableString(description) },
      ]
    );

    const subjectId = parseNumericId(insertSubject?.recordset?.[0]?.SubjectId);
    if (!subjectId) {
      throw new Error('Failed to create subject row in SQL Server.');
    }

    const insertClassSubject = await tx.query(
      `INSERT INTO dbo.ClassSubjects (
         ClassId,
         SectionId,
         SubjectId,
         TeacherId,
         WeeklyHours,
         CreatedAt,
         UpdatedAt
       )
       OUTPUT INSERTED.ClassSubjectId
       VALUES (
         @ClassId,
         NULL,
         @SubjectId,
         @TeacherId,
         NULL,
         SYSUTCDATETIME(),
         SYSUTCDATETIME()
       )`,
      [
        { name: 'ClassId', type: sql.Int, value: classId },
        { name: 'SubjectId', type: sql.Int, value: subjectId },
        { name: 'TeacherId', type: sql.Int, value: teacherDbId },
      ]
    );

    return parseNumericId(insertClassSubject?.recordset?.[0]?.ClassSubjectId) || subjectId;
  });

  return getSubjectById(createdSubjectLookupId);
};

const updateSubjectRecord = async (subjectLookupId, updates = {}) => {
  await ensureAcademicSqlReady();
  const existingSubject = await getSubjectById(subjectLookupId);
  if (!existingSubject) {
    return null;
  }

  await executeInTransaction(async (tx) => {
    const sql = getSqlClient();
    const subjectId = parseNumericId(existingSubject.subjectId || subjectLookupId);
    const classSubjectId = parseNumericId(existingSubject.classSubjectId || subjectLookupId);
    const classId = await resolveClassIdByName(updates.grade ?? existingSubject.grade, tx);
    if (!subjectId || !classSubjectId || !classId) {
      throw new Error('Unable to resolve the SQL subject mapping.');
    }

    const teacherDbId = await resolveTeacherDbId(
      updates.teacher !== undefined ? updates.teacher : existingSubject.teacher,
      tx
    );

    await tx.query(
      `UPDATE dbo.Subjects
       SET SubjectName = @SubjectName,
           Description = @Description,
           UpdatedAt = SYSUTCDATETIME()
       WHERE SubjectId = @SubjectId`,
      [
        { name: 'SubjectId', type: sql.Int, value: subjectId },
        { name: 'SubjectName', type: sql.NVarChar(200), value: String(updates.name ?? existingSubject.name).trim() },
        { name: 'Description', type: sql.NVarChar(1000), value: toNullableString(updates.description !== undefined ? updates.description : existingSubject.description) },
      ]
    );

    await tx.query(
      `UPDATE dbo.ClassSubjects
       SET ClassId = @ClassId,
           TeacherId = @TeacherId,
           UpdatedAt = SYSUTCDATETIME()
       WHERE ClassSubjectId = @ClassSubjectId`,
      [
        { name: 'ClassSubjectId', type: sql.Int, value: classSubjectId },
        { name: 'ClassId', type: sql.Int, value: classId },
        { name: 'TeacherId', type: sql.Int, value: teacherDbId },
      ]
    );
  });

  return getSubjectById(existingSubject.classSubjectId || existingSubject.subjectId || subjectLookupId);
};

const deleteSubjectRecord = async (subjectLookupId) => {
  await ensureAcademicSqlReady();
  const existingSubject = await getSubjectById(subjectLookupId);
  if (!existingSubject) {
    return { resultCode: 'not_found' };
  }

  const sql = getSqlClient();
  const classSubjectId = parseNumericId(existingSubject.classSubjectId || subjectLookupId);
  const subjectId = parseNumericId(existingSubject.subjectId || subjectLookupId);

  if (classSubjectId) {
    await executeQuery(
      `DELETE FROM dbo.ClassSubjects WHERE ClassSubjectId = @ClassSubjectId`,
      [{ name: 'ClassSubjectId', type: sql.Int, value: classSubjectId }]
    );
  }

  if (subjectId) {
    await executeQuery(
      `UPDATE dbo.Subjects
       SET IsActive = CASE
         WHEN EXISTS (SELECT 1 FROM dbo.ClassSubjects WHERE SubjectId = @SubjectId) THEN IsActive
         ELSE 0
       END,
       UpdatedAt = SYSUTCDATETIME()
       WHERE SubjectId = @SubjectId`,
      [{ name: 'SubjectId', type: sql.Int, value: subjectId }]
    );
  }

  return { resultCode: 'ok' };
};

const assignTeacherToSubjectRecord = async ({ subjectId, teacherId }) => {
  await ensureAcademicSqlReady();
  const existingSubject = await getSubjectById(subjectId);
  if (!existingSubject) {
    return null;
  }

  const classSubjectId = parseNumericId(existingSubject.classSubjectId || subjectId);
  if (!classSubjectId) {
    return null;
  }

  const sql = getSqlClient();
  const teacherDbId = await resolveTeacherDbId(teacherId);
  await executeQuery(
    `UPDATE dbo.ClassSubjects
     SET TeacherId = @TeacherId,
         UpdatedAt = SYSUTCDATETIME()
     WHERE ClassSubjectId = @ClassSubjectId`,
    [
      { name: 'ClassSubjectId', type: sql.Int, value: classSubjectId },
      { name: 'TeacherId', type: sql.Int, value: teacherDbId },
    ]
  );

  return getSubjectById(classSubjectId);
};

const replaceTeacherAssignments = async (teacherLookupId, subjectIds = []) => {
  await ensureAcademicSqlReady();
  const teacherDbId = await resolveTeacherDbId(teacherLookupId);
  if (!teacherDbId) {
    return [];
  }

  const sql = getSqlClient();
  await executeQuery(
    `UPDATE dbo.ClassSubjects
     SET TeacherId = NULL,
         UpdatedAt = SYSUTCDATETIME()
     WHERE TeacherId = @TeacherId`,
    [{ name: 'TeacherId', type: sql.Int, value: teacherDbId }]
  );

  for (const subjectId of Array.isArray(subjectIds) ? subjectIds : []) {
    await assignTeacherToSubjectRecord({ subjectId, teacherId: teacherLookupId });
  }

  return getSubjectList({ page: 1, limit: 10000 });
};

module.exports = {
  ensureAcademicSqlReady,
  getClassList,
  getClassById,
  createClassRecord,
  updateClassRecord,
  deleteClassRecord,
  getSectionList,
  getSectionById,
  createSectionRecord,
  updateSectionRecord,
  deleteSectionRecord,
  syncAllSubjectsToSql,
  syncSubjectMirror,
  syncSubjectById,
  getSubjectList,
  getSubjectById,
  createSubjectRecord,
  updateSubjectRecord,
  deleteSubjectRecord,
  createSubjectMirror,
  updateSubjectMirror,
  deleteSubjectMirror,
  getSubjectsByGrade,
  getSubjectCount,
  assignTeacherToSubjectRecord,
  replaceTeacherAssignments,
  assignTeacherToSubjectMirror,
};
