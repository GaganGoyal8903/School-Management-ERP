const {
  getSqlClient,
  executeQuery,
  executeInTransaction,
} = require('../config/sqlServer');

let materialBootstrapPromise = null;

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

const mapMaterialRow = (row) => {
  if (!row) {
    return null;
  }

  return {
    _id: String(row.MaterialId),
    id: String(row.MaterialId),
    title: row.Title,
    subject: row.SubjectName
      ? {
          _id: String(row.SubjectId),
          name: row.SubjectName,
        }
      : (row.SubjectId !== null && row.SubjectId !== undefined ? String(row.SubjectId) : null),
    subjectId: row.SubjectId !== null && row.SubjectId !== undefined ? String(row.SubjectId) : null,
    grade: row.ClassName || null,
    className: row.ClassName || null,
    description: row.Description || '',
    fileUrl: row.AttachmentUrl || null,
    fileName: row.FileName || null,
    uploadedBy: row.UploadedByFullName
      ? {
          _id: String(row.UploadedByUserId),
          fullName: row.UploadedByFullName,
        }
      : (row.UploadedByUserId !== null && row.UploadedByUserId !== undefined ? { _id: String(row.UploadedByUserId), fullName: null } : null),
    createdAt: row.CreatedAt ? new Date(row.CreatedAt) : null,
    updatedAt: row.UpdatedAt ? new Date(row.UpdatedAt) : null,
  };
};

const ensureMaterialSqlReady = async () => {
  if (!materialBootstrapPromise) {
    materialBootstrapPromise = (async () => {
      await executeQuery(`
        IF OBJECT_ID(N'dbo.StudyMaterials', N'U') IS NULL
        BEGIN
          CREATE TABLE dbo.StudyMaterials (
            MaterialId INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
            Title NVARCHAR(200) NOT NULL,
            ClassId INT NOT NULL,
            SubjectId INT NOT NULL,
            Description NVARCHAR(MAX) NULL,
            AttachmentUrl NVARCHAR(1000) NULL,
            FileName NVARCHAR(255) NULL,
            UploadedByUserId INT NOT NULL,
            IsActive BIT NOT NULL CONSTRAINT DF_StudyMaterials_IsActive DEFAULT (1),
            CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_StudyMaterials_CreatedAt DEFAULT SYSUTCDATETIME(),
            UpdatedAt DATETIME2(0) NULL
          );
        END;
      `);
    })().catch((error) => {
      materialBootstrapPromise = null;
      throw error;
    });
  }

  return materialBootstrapPromise;
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

const resolveSubjectId = async (subjectLookup, tx = null) => {
  const sql = getSqlClient();
  const runner = tx?.query || executeQuery;
  const numericSubjectId = parseNumericId(subjectLookup);

  if (numericSubjectId) {
    const result = await runner(
      `SELECT TOP 1 SubjectId
       FROM dbo.Subjects
       WHERE SubjectId = @SubjectId
         AND ISNULL(IsActive, 1) = 1`,
      [{ name: 'SubjectId', type: sql.Int, value: numericSubjectId }]
    );
    return parseNumericId(result?.recordset?.[0]?.SubjectId);
  }

  const normalizedSubjectName = toNullableString(subjectLookup);
  if (!normalizedSubjectName) {
    return null;
  }

  const result = await runner(
    `SELECT TOP 1 SubjectId
     FROM dbo.Subjects
     WHERE SubjectName = @SubjectName
       AND ISNULL(IsActive, 1) = 1`,
    [{ name: 'SubjectName', type: sql.NVarChar(200), value: normalizedSubjectName }]
  );

  return parseNumericId(result?.recordset?.[0]?.SubjectId);
};

const MATERIAL_BASE_SELECT = `
  SELECT
    sm.MaterialId,
    sm.Title,
    sm.SubjectId,
    sub.SubjectName,
    sm.ClassId,
    c.ClassName,
    sm.Description,
    sm.AttachmentUrl,
    sm.FileName,
    sm.UploadedByUserId,
    u.FullName AS UploadedByFullName,
    sm.CreatedAt,
    sm.UpdatedAt
  FROM dbo.StudyMaterials sm
  INNER JOIN dbo.Classes c
    ON c.ClassId = sm.ClassId
  INNER JOIN dbo.Subjects sub
    ON sub.SubjectId = sm.SubjectId
  LEFT JOIN dbo.Users u
    ON u.UserId = sm.UploadedByUserId
`;

const buildMaterialFilters = ({ subject = null, grade = null, search = null, materialId = null } = {}) => {
  const sql = getSqlClient();
  const clauses = ['sm.IsActive = 1'];
  const params = [];

  const materialSqlId = parseNumericId(materialId);
  if (materialSqlId) {
    clauses.push('sm.MaterialId = @MaterialId');
    params.push({ name: 'MaterialId', type: sql.Int, value: materialSqlId });
  }

  const subjectSqlId = parseNumericId(subject);
  if (subjectSqlId) {
    clauses.push('sm.SubjectId = @SubjectId');
    params.push({ name: 'SubjectId', type: sql.Int, value: subjectSqlId });
  } else if (toNullableString(subject)) {
    clauses.push('sub.SubjectName = @SubjectName');
    params.push({ name: 'SubjectName', type: sql.NVarChar(200), value: toNullableString(subject) });
  }

  if (grade) {
    clauses.push('c.ClassName = @ClassName');
    params.push({ name: 'ClassName', type: sql.NVarChar(100), value: toNullableString(grade) });
  }

  if (search) {
    clauses.push(`(
      sm.Title LIKE '%' + @Search + '%'
      OR ISNULL(sm.Description, N'') LIKE '%' + @Search + '%'
      OR ISNULL(sm.FileName, N'') LIKE '%' + @Search + '%'
    )`);
    params.push({ name: 'Search', type: sql.NVarChar(200), value: toNullableString(search) });
  }

  return {
    params,
    whereClause: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
  };
};

const getMaterialList = async ({ subject = null, grade = null, search = null, page = 1, limit = 10 } = {}) => {
  await ensureMaterialSqlReady();

  const sql = getSqlClient();
  const safePage = Number(page) || 1;
  const safeLimit = Number(limit) || 10;
  const offset = Math.max(safePage - 1, 0) * safeLimit;
  const filter = buildMaterialFilters({ subject, grade, search });
  const result = await executeQuery(`
    ${MATERIAL_BASE_SELECT}
    ${filter.whereClause}
    ORDER BY sm.CreatedAt DESC, sm.MaterialId DESC
    OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
  `, [
    ...filter.params,
    { name: 'Offset', type: sql.Int, value: offset },
    { name: 'Limit', type: sql.Int, value: safeLimit },
  ]);

  const totalResult = await executeQuery(`
    SELECT COUNT(1) AS TotalCount
    FROM dbo.StudyMaterials sm
    INNER JOIN dbo.Classes c
      ON c.ClassId = sm.ClassId
    INNER JOIN dbo.Subjects sub
      ON sub.SubjectId = sm.SubjectId
    ${filter.whereClause};
  `, filter.params);

  return {
    materials: (result?.recordset || []).map(mapMaterialRow),
    total: Number(totalResult?.recordset?.[0]?.TotalCount || 0),
  };
};

const getMaterialRecordById = async (materialId) => {
  await ensureMaterialSqlReady();
  const filter = buildMaterialFilters({ materialId });
  const result = await executeQuery(`
    ${MATERIAL_BASE_SELECT}
    ${filter.whereClause};
  `, filter.params);
  return mapMaterialRow(result?.recordset?.[0]);
};

const createMaterialRecord = async ({ title, subject, grade, description, fileUrl, fileName, uploadedByUserId } = {}) => {
  await ensureMaterialSqlReady();

  const materialId = await executeInTransaction(async (tx) => {
    const sql = getSqlClient();
    const classId = await resolveClassIdByName(grade, tx);
    const subjectId = await resolveSubjectId(subject, tx);
    const userId = parseNumericId(uploadedByUserId);

    if (!classId || !subjectId || !userId || !toNullableString(title)) {
      throw new Error('Please provide valid material details.');
    }

    const inserted = await tx.query(
      `INSERT INTO dbo.StudyMaterials (
         Title,
         ClassId,
         SubjectId,
         Description,
         AttachmentUrl,
         FileName,
         UploadedByUserId,
         IsActive,
         CreatedAt,
         UpdatedAt
       )
       OUTPUT INSERTED.MaterialId
       VALUES (
         @Title,
         @ClassId,
         @SubjectId,
         @Description,
         @AttachmentUrl,
         @FileName,
         @UploadedByUserId,
         1,
         SYSUTCDATETIME(),
         SYSUTCDATETIME()
       )`,
      [
        { name: 'Title', type: sql.NVarChar(200), value: toNullableString(title) },
        { name: 'ClassId', type: sql.Int, value: classId },
        { name: 'SubjectId', type: sql.Int, value: subjectId },
        { name: 'Description', type: sql.NVarChar(sql.MAX), value: toNullableString(description) },
        { name: 'AttachmentUrl', type: sql.NVarChar(1000), value: toNullableString(fileUrl) },
        { name: 'FileName', type: sql.NVarChar(255), value: toNullableString(fileName) },
        { name: 'UploadedByUserId', type: sql.Int, value: userId },
      ]
    );

    return parseNumericId(inserted?.recordset?.[0]?.MaterialId);
  });

  return getMaterialRecordById(materialId);
};

const updateMaterialRecord = async (materialId, updates = {}) => {
  await ensureMaterialSqlReady();
  const existingMaterial = await getMaterialRecordById(materialId);
  if (!existingMaterial) {
    return null;
  }

  const materialSqlId = parseNumericId(materialId);
  await executeInTransaction(async (tx) => {
    const sql = getSqlClient();
    const classId = await resolveClassIdByName(updates.grade ?? existingMaterial.grade, tx);
    const subjectId = await resolveSubjectId(updates.subject ?? updates.subjectId ?? existingMaterial.subjectId, tx);
    if (!classId || !subjectId || !toNullableString(updates.title ?? existingMaterial.title)) {
      throw new Error('Please provide valid material details.');
    }

    await tx.query(
      `UPDATE dbo.StudyMaterials
       SET Title = @Title,
           ClassId = @ClassId,
           SubjectId = @SubjectId,
           Description = @Description,
           AttachmentUrl = @AttachmentUrl,
           FileName = @FileName,
           UpdatedAt = SYSUTCDATETIME()
       WHERE MaterialId = @MaterialId`,
      [
        { name: 'MaterialId', type: sql.Int, value: materialSqlId },
        { name: 'Title', type: sql.NVarChar(200), value: toNullableString(updates.title ?? existingMaterial.title) },
        { name: 'ClassId', type: sql.Int, value: classId },
        { name: 'SubjectId', type: sql.Int, value: subjectId },
        { name: 'Description', type: sql.NVarChar(sql.MAX), value: toNullableString(updates.description ?? existingMaterial.description) },
        { name: 'AttachmentUrl', type: sql.NVarChar(1000), value: toNullableString(updates.fileUrl ?? existingMaterial.fileUrl) },
        { name: 'FileName', type: sql.NVarChar(255), value: toNullableString(updates.fileName ?? existingMaterial.fileName) },
      ]
    );
  });

  return getMaterialRecordById(materialSqlId);
};

const deleteMaterialRecord = async (materialId) => {
  await ensureMaterialSqlReady();
  const materialSqlId = parseNumericId(materialId);
  if (!materialSqlId) {
    return { resultCode: 'not_found' };
  }

  const existingMaterial = await getMaterialRecordById(materialSqlId);
  if (!existingMaterial) {
    return { resultCode: 'not_found' };
  }

  const sql = getSqlClient();
  await executeQuery(
    `UPDATE dbo.StudyMaterials
     SET IsActive = 0,
         UpdatedAt = SYSUTCDATETIME()
     WHERE MaterialId = @MaterialId`,
    [{ name: 'MaterialId', type: sql.Int, value: materialSqlId }]
  );

  return { resultCode: 'ok' };
};

const getMaterialsBySubject = async (subject) => {
  const { materials } = await getMaterialList({ subject, page: 1, limit: 1000 });
  return materials;
};

module.exports = {
  ensureMaterialSqlReady,
  getMaterialList,
  getMaterialRecordById,
  createMaterialRecord,
  updateMaterialRecord,
  deleteMaterialRecord,
  getMaterialsBySubject,
};
