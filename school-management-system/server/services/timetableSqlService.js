const {
  getSqlClient,
  executeQuery,
  executeInTransaction,
} = require('../config/sqlServer');

const parseNumericId = (value) => {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
};

const toNullableString = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
};

const formatSqlTime = (value) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
};

const mapTimetablePeriod = (row) => ({
  _id: String(row.TimetableId),
  id: String(row.TimetableId),
  periodNumber: Number(row.PeriodNumber || 0),
  subjectId: row.SubjectId !== undefined && row.SubjectId !== null ? String(row.SubjectId) : null,
  teacherId: row.TeacherUserId !== undefined && row.TeacherUserId !== null ? String(row.TeacherUserId) : null,
  subject: row.SubjectName
    ? {
        _id: String(row.SubjectId),
        name: row.SubjectName,
      }
    : (row.SubjectId !== undefined && row.SubjectId !== null ? String(row.SubjectId) : null),
  teacher: row.TeacherName
    ? {
        _id: String(row.TeacherUserId),
        fullName: row.TeacherName,
      }
    : (row.TeacherUserId !== undefined && row.TeacherUserId !== null ? String(row.TeacherUserId) : null),
  startTime: formatSqlTime(row.StartTime),
  endTime: formatSqlTime(row.EndTime),
  roomNumber: row.RoomNumber || '',
});

const groupTimetableRows = (rows = []) => {
  const grouped = new Map();

  rows.forEach((row) => {
    const key = `${row.ClassName}|${row.SectionName || ''}|${row.DayOfWeek}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        _id: key,
        class: row.ClassName,
        section: row.SectionName || '',
        academicYear: row.YearName || null,
        day: row.DayOfWeek,
        periods: [],
      });
    }

    grouped.get(key).periods.push(mapTimetablePeriod(row));
  });

  return Array.from(grouped.values()).map((entry) => ({
    ...entry,
    periods: entry.periods.sort((left, right) => left.periodNumber - right.periodNumber),
  }));
};

const buildTimetableFilters = ({
  timetableId = null,
  className = null,
  section = null,
  academicYear = null,
  day = null,
  teacherId = null,
} = {}) => {
  const sql = getSqlClient();
  const clauses = [];
  const params = [];
  const timetableSqlId = parseNumericId(timetableId);
  const teacherSqlUserId = parseNumericId(teacherId);

  if (timetableSqlId) {
    clauses.push('tt.TimetableId = @TimetableId');
    params.push({ name: 'TimetableId', type: sql.Int, value: timetableSqlId });
  }

  if (className) {
    clauses.push('c.ClassName = @ClassName');
    params.push({ name: 'ClassName', type: sql.NVarChar(100), value: toNullableString(className) });
  }

  if (section) {
    clauses.push('sec.SectionName = @SectionName');
    params.push({ name: 'SectionName', type: sql.NVarChar(50), value: toNullableString(section) });
  }

  if (academicYear) {
    clauses.push('ay.YearName = @AcademicYear');
    params.push({ name: 'AcademicYear', type: sql.NVarChar(20), value: toNullableString(academicYear) });
  }

  if (day) {
    clauses.push('tt.DayOfWeek = @DayOfWeek');
    params.push({ name: 'DayOfWeek', type: sql.NVarChar(20), value: toNullableString(day) });
  }

  if (teacherSqlUserId) {
    clauses.push('u.UserId = @TeacherUserId');
    params.push({ name: 'TeacherUserId', type: sql.Int, value: teacherSqlUserId });
  }

  return {
    params,
    whereClause: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
  };
};

const parseTimetableGroupId = (value) => {
  const text = String(value || '').trim();
  if (!text.includes('|')) {
    return null;
  }

  const [className = '', sectionName = '', day = ''] = text.split('|');
  if (!className || !day) {
    return null;
  }

  return {
    className: className.trim(),
    section: sectionName.trim(),
    day: day.trim(),
  };
};

const resolveAcademicYearId = async (academicYear = null, tx = null) => {
  const sql = getSqlClient();
  const runner = tx?.query || executeQuery;
  const normalizedAcademicYear = toNullableString(academicYear);

  if (normalizedAcademicYear) {
    const exactMatch = await runner(
      `SELECT TOP 1 AcademicYearId
       FROM dbo.AcademicYears
       WHERE YearName = @YearName
       ORDER BY AcademicYearId DESC`,
      [{ name: 'YearName', type: sql.NVarChar(20), value: normalizedAcademicYear }]
    );
    const academicYearId = parseNumericId(exactMatch?.recordset?.[0]?.AcademicYearId);
    if (academicYearId) {
      return academicYearId;
    }
  }

  const fallback = await runner(`
    SELECT TOP 1 AcademicYearId
    FROM dbo.AcademicYears
    ORDER BY
      CASE WHEN IsCurrent = 1 THEN 0 ELSE 1 END,
      CASE WHEN CAST(GETUTCDATE() AS DATE) BETWEEN StartDate AND EndDate THEN 0 ELSE 1 END,
      EndDate DESC,
      AcademicYearId DESC;
  `);

  return parseNumericId(fallback?.recordset?.[0]?.AcademicYearId);
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

const resolveSectionIdByName = async (sectionName, tx = null) => {
  const normalizedSectionName = toNullableString(sectionName);
  if (!normalizedSectionName) {
    return null;
  }

  const sql = getSqlClient();
  const runner = tx?.query || executeQuery;
  const result = await runner(
    `SELECT TOP 1 SectionId
     FROM dbo.Sections
     WHERE SectionName = @SectionName
       AND ISNULL(IsActive, 1) = 1`,
    [{ name: 'SectionName', type: sql.NVarChar(50), value: normalizedSectionName }]
  );

  return parseNumericId(result?.recordset?.[0]?.SectionId);
};

const resolveSubjectDbId = async (subjectLookupId, tx = null) => {
  const normalizedLookupId = parseNumericId(subjectLookupId);
  if (!normalizedLookupId) {
    return null;
  }

  const sql = getSqlClient();
  const runner = tx?.query || executeQuery;
  const result = await runner(
    `SELECT TOP 1 s.SubjectId
     FROM dbo.Subjects s
     LEFT JOIN dbo.ClassSubjects cs
       ON cs.SubjectId = s.SubjectId
     WHERE s.SubjectId = @LookupId OR cs.ClassSubjectId = @LookupId`,
    [{ name: 'LookupId', type: sql.Int, value: normalizedLookupId }]
  );

  return parseNumericId(result?.recordset?.[0]?.SubjectId);
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

const normalizeTimetablePeriods = (periods = []) =>
  (Array.isArray(periods) ? periods : [])
    .map((period) => ({
      periodNumber: Number(period?.periodNumber || 0),
      subjectId: parseNumericId(period?.subject?._id || period?.subjectId || period?.subject),
      teacherUserId: parseNumericId(period?.teacher?._id || period?.teacherId || period?.teacher),
      startTime: toNullableString(period?.startTime),
      endTime: toNullableString(period?.endTime),
      roomNumber: toNullableString(period?.roomNumber)?.slice(0, 20) || null,
    }))
    .filter((period) => period.periodNumber > 0 && period.subjectId && period.teacherUserId && period.startTime && period.endTime)
    .sort((left, right) => left.periodNumber - right.periodNumber);

const getTimetableGroupById = async (timetableId) => {
  const numericId = parseNumericId(timetableId);
  if (numericId) {
    const entries = await getTimetableList({ timetableId: numericId });
    return entries[0] || null;
  }

  const groupId = parseTimetableGroupId(timetableId);
  if (!groupId) {
    return null;
  }

  const entries = await getTimetableList(groupId);
  return entries[0] || null;
};

const TIMETABLE_BASE_SELECT = `
  SELECT
    tt.TimetableId,
    c.ClassName,
    sec.SectionName,
    ay.YearName,
    tt.DayOfWeek,
    tt.SubjectId,
    sub.SubjectName,
    u.UserId AS TeacherUserId,
    u.FullName AS TeacherName,
    tt.StartTime,
    tt.EndTime,
    tt.RoomNumber,
    tt.CreatedAt,
    tt.UpdatedAt,
    ROW_NUMBER() OVER (
      PARTITION BY c.ClassName, ISNULL(sec.SectionName, N''), tt.DayOfWeek
      ORDER BY tt.StartTime, tt.TimetableId
    ) AS PeriodNumber
  FROM dbo.Timetable tt
  INNER JOIN dbo.Classes c
    ON c.ClassId = tt.ClassId
  LEFT JOIN dbo.Sections sec
    ON sec.SectionId = tt.SectionId
  LEFT JOIN dbo.AcademicYears ay
    ON ay.AcademicYearId = tt.AcademicYearId
  LEFT JOIN dbo.Subjects sub
    ON sub.SubjectId = tt.SubjectId
  LEFT JOIN dbo.Teachers t
    ON t.TeacherId = tt.TeacherId
  LEFT JOIN dbo.Users u
    ON u.UserId = t.UserId
`;

const TIMETABLE_ORDER_BY = `
  ORDER BY
    c.ClassName,
    ISNULL(sec.SectionName, N''),
    CASE tt.DayOfWeek
      WHEN N'Monday' THEN 1
      WHEN N'Tuesday' THEN 2
      WHEN N'Wednesday' THEN 3
      WHEN N'Thursday' THEN 4
      WHEN N'Friday' THEN 5
      WHEN N'Saturday' THEN 6
      WHEN N'Sunday' THEN 7
      ELSE 8
    END,
    tt.StartTime,
    tt.TimetableId
`;

const getTimetableList = async (filters = {}) => {
  const builtFilters = buildTimetableFilters(filters);
  const result = await executeQuery(`
    ${TIMETABLE_BASE_SELECT}
    ${builtFilters.whereClause}
    ${TIMETABLE_ORDER_BY};
  `, builtFilters.params);

  return groupTimetableRows(result?.recordset || []);
};

const getTimetableByIdFromSql = async (timetableId) => {
  return getTimetableGroupById(timetableId);
};

const getTimetableByClassFromSql = async ({ className, section = null, academicYear = null, day = null } = {}) =>
  getTimetableList({ className, section, academicYear, day });

const getTeacherTimetableFromSql = async ({ teacherId, academicYear = null, day = null } = {}) =>
  getTimetableList({ teacherId, academicYear, day });

const createTimetableRecord = async ({
  class: className,
  className: classNameAlias,
  section,
  sectionName,
  academicYear,
  day,
  periods = [],
} = {}) => {
  const resolvedClassName = className || classNameAlias || null;
  const resolvedSectionName = section || sectionName || '';
  const normalizedPeriods = normalizeTimetablePeriods(periods);
  if (!normalizedPeriods.length) {
    return { resultCode: 'invalid_payload' };
  }

  const existing = await getTimetableList({
    className: resolvedClassName,
    section: resolvedSectionName,
    academicYear,
    day,
  });
  if (existing.length) {
    return { resultCode: 'already_exists' };
  }
  let invalidContext = false;

  await executeInTransaction(async (tx) => {
    const sql = getSqlClient();
    const classId = await resolveClassIdByName(resolvedClassName, tx);
    const sectionId = await resolveSectionIdByName(resolvedSectionName, tx);
    const academicYearId = await resolveAcademicYearId(academicYear, tx);
    if (!classId || !sectionId || !academicYearId) {
      invalidContext = true;
      return;
    }

    for (const period of normalizedPeriods) {
      const subjectId = await resolveSubjectDbId(period.subjectId, tx);
      const teacherId = await resolveTeacherDbId(period.teacherUserId, tx);
      if (!subjectId || !teacherId) {
        throw new Error('Unable to resolve the SQL subject or teacher for one of the timetable periods.');
      }

      await tx.query(
        `INSERT INTO dbo.Timetable (
           AcademicYearId,
           ClassId,
           SectionId,
           SubjectId,
           TeacherId,
           DayOfWeek,
           StartTime,
           EndTime,
           RoomNumber,
           CreatedAt,
           UpdatedAt
         )
         VALUES (
           @AcademicYearId,
           @ClassId,
           @SectionId,
           @SubjectId,
           @TeacherId,
           @DayOfWeek,
           CAST(@StartTime AS time(0)),
           CAST(@EndTime AS time(0)),
           @RoomNumber,
           SYSUTCDATETIME(),
           SYSUTCDATETIME()
         )`,
        [
          { name: 'AcademicYearId', type: sql.Int, value: academicYearId },
          { name: 'ClassId', type: sql.Int, value: classId },
          { name: 'SectionId', type: sql.Int, value: sectionId },
          { name: 'SubjectId', type: sql.Int, value: subjectId },
          { name: 'TeacherId', type: sql.Int, value: teacherId },
          { name: 'DayOfWeek', type: sql.NVarChar(20), value: toNullableString(day) },
          { name: 'StartTime', type: sql.NVarChar(10), value: period.startTime },
          { name: 'EndTime', type: sql.NVarChar(10), value: period.endTime },
          { name: 'RoomNumber', type: sql.NVarChar(100), value: period.roomNumber },
        ]
      );
    }
  });

  if (invalidContext) {
    return { resultCode: 'invalid_context' };
  }

  return {
    resultCode: 'ok',
    timetable: await getTimetableByIdFromSql(`${resolvedClassName}|${resolvedSectionName || ''}|${day}`),
  };
};

const updateTimetableRecord = async (timetableId, {
  class: className,
  className: classNameAlias,
  section,
  sectionName,
  academicYear,
  day,
  periods = [],
} = {}) => {
  const existing = await getTimetableByIdFromSql(timetableId);
  if (!existing) {
    return { resultCode: 'not_found' };
  }

  const resolvedClassName = className || classNameAlias || existing.class || existing.className;
  const resolvedSectionName = section || sectionName || existing.section || existing.sectionName || '';
  const resolvedAcademicYear = academicYear || existing.academicYear || existing.academicYearName || null;
  const resolvedDay = day || existing.day;
  const normalizedPeriods = normalizeTimetablePeriods(periods);
  if (!normalizedPeriods.length) {
    return { resultCode: 'invalid_payload' };
  }

  const targetGroupId = `${resolvedClassName}|${resolvedSectionName || ''}|${resolvedDay}`;
  if (targetGroupId !== existing._id) {
    const conflicting = await getTimetableByIdFromSql(targetGroupId);
    if (conflicting) {
      return { resultCode: 'already_exists' };
    }
  }

  const existingRowIds = existing.periods
    .map((period) => parseNumericId(period.id || period._id))
    .filter(Boolean);
  let invalidContext = false;

  await executeInTransaction(async (tx) => {
    const sql = getSqlClient();
    const classId = await resolveClassIdByName(resolvedClassName, tx);
    const sectionId = await resolveSectionIdByName(resolvedSectionName, tx);
    const academicYearId = await resolveAcademicYearId(resolvedAcademicYear, tx);
    if (!classId || !sectionId || !academicYearId) {
      invalidContext = true;
      return;
    }

    if (existingRowIds.length) {
      const inClause = existingRowIds.map((_, index) => `@RowId${index}`).join(', ');
      await tx.query(
        `DELETE FROM dbo.Timetable WHERE TimetableId IN (${inClause})`,
        existingRowIds.map((value, index) => ({ name: `RowId${index}`, type: sql.Int, value }))
      );
    }

    for (const period of normalizedPeriods) {
      const subjectId = await resolveSubjectDbId(period.subjectId, tx);
      const teacherId = await resolveTeacherDbId(period.teacherUserId, tx);
      if (!subjectId || !teacherId) {
        throw new Error('Unable to resolve the SQL subject or teacher for one of the timetable periods.');
      }

      await tx.query(
        `INSERT INTO dbo.Timetable (
           AcademicYearId,
           ClassId,
           SectionId,
           SubjectId,
           TeacherId,
           DayOfWeek,
           StartTime,
           EndTime,
           RoomNumber,
           CreatedAt,
           UpdatedAt
         )
         VALUES (
           @AcademicYearId,
           @ClassId,
           @SectionId,
           @SubjectId,
           @TeacherId,
           @DayOfWeek,
           CAST(@StartTime AS time(0)),
           CAST(@EndTime AS time(0)),
           @RoomNumber,
           SYSUTCDATETIME(),
           SYSUTCDATETIME()
         )`,
        [
          { name: 'AcademicYearId', type: sql.Int, value: academicYearId },
          { name: 'ClassId', type: sql.Int, value: classId },
          { name: 'SectionId', type: sql.Int, value: sectionId },
          { name: 'SubjectId', type: sql.Int, value: subjectId },
          { name: 'TeacherId', type: sql.Int, value: teacherId },
          { name: 'DayOfWeek', type: sql.NVarChar(20), value: toNullableString(resolvedDay) },
          { name: 'StartTime', type: sql.NVarChar(10), value: period.startTime },
          { name: 'EndTime', type: sql.NVarChar(10), value: period.endTime },
          { name: 'RoomNumber', type: sql.NVarChar(100), value: period.roomNumber },
        ]
      );
    }
  });

  if (invalidContext) {
    return { resultCode: 'invalid_context' };
  }

  return {
    resultCode: 'ok',
    timetable: await getTimetableByIdFromSql(targetGroupId),
  };
};

const deleteTimetableRecord = async (timetableId) => {
  const existing = await getTimetableByIdFromSql(timetableId);
  if (!existing) {
    return { resultCode: 'not_found' };
  }

  const rowIds = existing.periods
    .map((period) => parseNumericId(period.id || period._id))
    .filter(Boolean);
  if (!rowIds.length) {
    return { resultCode: 'not_found' };
  }

  const sql = getSqlClient();
  await executeQuery(
    `DELETE FROM dbo.Timetable WHERE TimetableId IN (${rowIds.map((_, index) => `@RowId${index}`).join(', ')})`,
    rowIds.map((value, index) => ({ name: `RowId${index}`, type: sql.Int, value }))
  );

  return { resultCode: 'ok' };
};

const copyTimetableRecord = async ({ sourceClass, sourceSection, targetClass, targetSection, academicYear } = {}) => {
  const sourceTimetables = await getTimetableByClassFromSql({
    className: sourceClass,
    section: sourceSection,
    academicYear,
  });

  if (!sourceTimetables.length) {
    return { resultCode: 'source_not_found' };
  }

  const existingTarget = await getTimetableByClassFromSql({
    className: targetClass,
    section: targetSection,
    academicYear,
  });

  if (existingTarget.length) {
    return { resultCode: 'already_exists' };
  }
  let invalidContext = false;

  await executeInTransaction(async (tx) => {
    const sql = getSqlClient();
    const classId = await resolveClassIdByName(targetClass, tx);
    const sectionId = await resolveSectionIdByName(targetSection, tx);
    const academicYearId = await resolveAcademicYearId(academicYear, tx);
    if (!classId || !sectionId || !academicYearId) {
      invalidContext = true;
      return;
    }

    for (const timetable of sourceTimetables) {
      for (const period of timetable.periods || []) {
        const subjectId = await resolveSubjectDbId(period.subjectId || period.subject?._id, tx);
        const teacherId = await resolveTeacherDbId(period.teacherId || period.teacher?._id, tx);
        if (!subjectId || !teacherId) {
          throw new Error('Unable to resolve the SQL subject or teacher for one of the copied timetable periods.');
        }

        await tx.query(
          `INSERT INTO dbo.Timetable (
             AcademicYearId,
             ClassId,
             SectionId,
             SubjectId,
             TeacherId,
             DayOfWeek,
             StartTime,
             EndTime,
             RoomNumber,
             CreatedAt,
             UpdatedAt
           )
           VALUES (
             @AcademicYearId,
             @ClassId,
             @SectionId,
             @SubjectId,
             @TeacherId,
             @DayOfWeek,
             CAST(@StartTime AS time(0)),
             CAST(@EndTime AS time(0)),
             @RoomNumber,
             SYSUTCDATETIME(),
             SYSUTCDATETIME()
           )`,
          [
            { name: 'AcademicYearId', type: sql.Int, value: academicYearId },
            { name: 'ClassId', type: sql.Int, value: classId },
            { name: 'SectionId', type: sql.Int, value: sectionId },
            { name: 'SubjectId', type: sql.Int, value: subjectId },
            { name: 'TeacherId', type: sql.Int, value: teacherId },
            { name: 'DayOfWeek', type: sql.NVarChar(20), value: timetable.day },
            { name: 'StartTime', type: sql.NVarChar(10), value: period.startTime },
            { name: 'EndTime', type: sql.NVarChar(10), value: period.endTime },
            { name: 'RoomNumber', type: sql.NVarChar(100), value: toNullableString(period.roomNumber) },
          ]
        );
      }
    }
  });

  if (invalidContext) {
    return { resultCode: 'invalid_context' };
  }

  return { resultCode: 'ok' };
};

module.exports = {
  getTimetableList,
  getTimetableByIdFromSql,
  getTimetableByClassFromSql,
  getTeacherTimetableFromSql,
  createTimetableRecord,
  updateTimetableRecord,
  deleteTimetableRecord,
  copyTimetableRecord,
};
