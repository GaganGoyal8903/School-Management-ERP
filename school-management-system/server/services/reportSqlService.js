const {
  getSqlClient,
  executeStoredProcedure,
  getPool,
} = require('../config/sqlServer');
const { ensureStudentSqlReady, syncAllStudentsToSql } = require('./studentSqlService');
const { ensureTeacherSqlReady, syncAllTeachersToSql } = require('./teacherSqlService');
const { ensureAcademicSqlReady, syncAllSubjectsToSql } = require('./academicSqlService');
const { ensureAttendanceSqlReady, syncAllAttendanceToSql, getAttendanceList, getClassAttendanceSummary } = require('./attendanceSqlService');
const { ensureFeeSqlReady, syncAllFeesToSql, getFeeStatistics } = require('./feeSqlService');
const { ensureExamSqlReady, syncAllExamsToSql } = require('./examSqlService');

const REPORT_SYNC_TTL_MS = 30000;

let reportBootstrapPromise = null;
let reportSyncPromise = null;
let lastReportSyncAt = 0;

const toNullableString = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
};

const normalizeDateOnly = (value) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

const toNumber = (value, fallback = 0) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const mapUpcomingExamRow = (row) => {
  if (!row) {
    return null;
  }

  const examDate = row.ExamDate ? new Date(row.ExamDate) : null;
  const subject = row.SubjectMongoId
    ? {
        _id: row.SubjectMongoId,
        name: row.SubjectName || null,
      }
    : row.SubjectName || null;

  return {
    _id: row.MongoExamId,
    title: row.ExamName,
    name: row.ExamName,
    class: row.ClassName,
    grade: row.ClassName,
    section: row.SectionName || '',
    date: examDate,
    examDate,
    startTime: row.StartTime || null,
    endTime: row.EndTime || null,
    duration: toNumber(row.DurationMinutes),
    durationMinutes: toNumber(row.DurationMinutes),
    totalMarks: toNumber(row.TotalMarks),
    passingMarks: toNumber(row.PassingMarks),
    subjectId: subject,
    subject,
  };
};

const getMaterialSummary = async () => ({
  totalMaterials: 0,
  recentMaterials: [],
});

const REPORT_PROCEDURES_BATCH = `
CREATE OR ALTER PROCEDURE dbo.spReportDashboard
  @Role NVARCHAR(50) = NULL,
  @MongoUserId NVARCHAR(64) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @Today DATE = CAST(SYSUTCDATETIME() AS DATE);
  DECLARE @TrendStart DATE = DATEADD(DAY, -6, @Today);
  DECLARE @MonthStart DATE = DATEFROMPARTS(YEAR(DATEADD(MONTH, -5, @Today)), MONTH(DATEADD(MONTH, -5, @Today)), 1);
  DECLARE @CurrentMonth DATE = DATEFROMPARTS(YEAR(@Today), MONTH(@Today), 1);

  SELECT
    CAST(ISNULL((SELECT COUNT(1) FROM dbo.SqlStudents WHERE IsActive = 1), 0) AS INT) AS TotalStudents,
    CAST(ISNULL((SELECT COUNT(1) FROM dbo.SqlTeachers WHERE IsActive = 1), 0) AS INT) AS TotalTeachers,
    CAST(ISNULL((SELECT COUNT(1) FROM dbo.SqlSubjects WHERE IsActive = 1), 0) AS INT) AS TotalSubjects,
    CAST(ISNULL((SELECT COUNT(1) FROM dbo.SqlExams WHERE IsActive = 1), 0) AS INT) AS TotalExams;

  SELECT
    CAST(ISNULL(SUM(CASE WHEN d.Status = N'Present' THEN 1 ELSE 0 END), 0) AS INT) AS PresentCount,
    CAST(ISNULL(SUM(CASE WHEN d.Status = N'Absent' THEN 1 ELSE 0 END), 0) AS INT) AS AbsentCount,
    CAST(ISNULL(SUM(CASE WHEN d.Status = N'Late' THEN 1 ELSE 0 END), 0) AS INT) AS LateCount,
    CAST(ISNULL(SUM(CASE WHEN d.Status = N'Leave' THEN 1 ELSE 0 END), 0) AS INT) AS LeaveCount,
    CAST(ISNULL(COUNT(d.MongoAttendanceId), 0) AS INT) AS TotalCount
  FROM dbo.SqlAttendanceHeaders h
  LEFT JOIN dbo.SqlAttendanceDetails d
    ON d.SqlAttendanceHeaderId = h.SqlAttendanceHeaderId
  WHERE h.AttendanceDate = @Today;

  ;WITH Days AS (
    SELECT @TrendStart AS AttendanceDate
    UNION ALL
    SELECT DATEADD(DAY, 1, AttendanceDate)
    FROM Days
    WHERE AttendanceDate < @Today
  )
  SELECT
    CONVERT(VARCHAR(10), dayset.AttendanceDate, 23) AS ReportDate,
    LEFT(DATENAME(WEEKDAY, dayset.AttendanceDate), 3) AS DayLabel,
    CAST(ISNULL(SUM(CASE WHEN d.Status = N'Present' THEN 1 ELSE 0 END), 0) AS INT) AS PresentCount,
    CAST(ISNULL(SUM(CASE WHEN d.Status = N'Absent' THEN 1 ELSE 0 END), 0) AS INT) AS AbsentCount,
    CAST(ISNULL(SUM(CASE WHEN d.Status = N'Late' THEN 1 ELSE 0 END), 0) AS INT) AS LateCount,
    CAST(ISNULL(SUM(CASE WHEN d.Status = N'Leave' THEN 1 ELSE 0 END), 0) AS INT) AS LeaveCount,
    CAST(ISNULL(COUNT(d.MongoAttendanceId), 0) AS INT) AS TotalCount
  FROM Days dayset
  LEFT JOIN dbo.SqlAttendanceHeaders h
    ON h.AttendanceDate = dayset.AttendanceDate
  LEFT JOIN dbo.SqlAttendanceDetails d
    ON d.SqlAttendanceHeaderId = h.SqlAttendanceHeaderId
  GROUP BY dayset.AttendanceDate
  ORDER BY dayset.AttendanceDate ASC
  OPTION (MAXRECURSION 10);

  ;WITH Months AS (
    SELECT @MonthStart AS MonthStart
    UNION ALL
    SELECT DATEADD(MONTH, 1, MonthStart)
    FROM Months
    WHERE MonthStart < @CurrentMonth
  )
  SELECT
    LEFT(DATENAME(MONTH, monthset.MonthStart), 3) AS [Month],
    YEAR(monthset.MonthStart) AS [Year],
    CAST(ISNULL(COUNT(s.MongoStudentId), 0) AS INT) AS StudentCount
  FROM Months monthset
  LEFT JOIN dbo.SqlStudents s
    ON s.IsActive = 1
   AND s.CreatedAt >= monthset.MonthStart
   AND s.CreatedAt < DATEADD(MONTH, 1, monthset.MonthStart)
  GROUP BY monthset.MonthStart
  ORDER BY monthset.MonthStart ASC
  OPTION (MAXRECURSION 12);

  ;WITH Months AS (
    SELECT @MonthStart AS MonthStart
    UNION ALL
    SELECT DATEADD(MONTH, 1, MonthStart)
    FROM Months
    WHERE MonthStart < @CurrentMonth
  ),
  Collections AS (
    SELECT
      DATEFROMPARTS(YEAR(p.PaymentDate), MONTH(p.PaymentDate), 1) AS MonthStart,
      SUM(p.Amount) AS CollectedAmount
    FROM dbo.SqlFeePayments p
    GROUP BY DATEFROMPARTS(YEAR(p.PaymentDate), MONTH(p.PaymentDate), 1)
  ),
  Pending AS (
    SELECT
      DATEFROMPARTS(YEAR(f.DueDate), MONTH(f.DueDate), 1) AS MonthStart,
      SUM(CASE
        WHEN (f.Amount + f.LateFee - f.Discount - f.PaidAmount) > 0
          THEN (f.Amount + f.LateFee - f.Discount - f.PaidAmount)
        ELSE 0
      END) AS PendingAmount
    FROM dbo.SqlStudentFees f
    GROUP BY DATEFROMPARTS(YEAR(f.DueDate), MONTH(f.DueDate), 1)
  )
  SELECT
    LEFT(DATENAME(MONTH, monthset.MonthStart), 3) AS [Month],
    YEAR(monthset.MonthStart) AS [Year],
    CAST(ISNULL(c.CollectedAmount, 0) AS DECIMAL(18,2)) AS CollectedAmount,
    CAST(ISNULL(p.PendingAmount, 0) AS DECIMAL(18,2)) AS PendingAmount
  FROM Months monthset
  LEFT JOIN Collections c
    ON c.MonthStart = monthset.MonthStart
  LEFT JOIN Pending p
    ON p.MonthStart = monthset.MonthStart
  ORDER BY monthset.MonthStart ASC
  OPTION (MAXRECURSION 12);

  SELECT TOP 5
    e.MongoExamId,
    e.Name AS ExamName,
    e.ClassName,
    e.SectionName,
    e.ExamDate,
    e.StartTime,
    e.EndTime,
    e.DurationMinutes,
    e.TotalMarks,
    e.PassingMarks,
    subj.MongoSubjectId AS SubjectMongoId,
    subj.SubjectName
  FROM dbo.SqlExams e
  OUTER APPLY (
    SELECT TOP 1
      es.MongoSubjectId,
      s.Name AS SubjectName
    FROM dbo.SqlExamSubjects es
    LEFT JOIN dbo.SqlSubjects s
      ON s.MongoSubjectId = es.MongoSubjectId
    WHERE es.MongoExamId = e.MongoExamId
    ORDER BY es.SortOrder ASC, es.SqlExamSubjectId ASC
  ) subj
  WHERE e.IsActive = 1
    AND e.ExamDate >= @Today
  ORDER BY e.ExamDate ASC, e.StartTime ASC;

  SELECT
    CAST(COUNT(1) AS INT) AS AssignedSubjects,
    CAST(ISNULL((
      SELECT COUNT(1)
      FROM dbo.SqlAttendanceHeaders h
      INNER JOIN dbo.SqlAttendanceDetails d
        ON d.SqlAttendanceHeaderId = h.SqlAttendanceHeaderId
      WHERE h.AttendanceDate = @Today
        AND d.MarkedByMongoUserId = @MongoUserId
    ), 0) AS INT) AS AttendanceMarkedToday
  FROM dbo.SqlSubjects
  WHERE @Role = N'teacher'
    AND @MongoUserId IS NOT NULL
    AND IsActive = 1
    AND TeacherMongoUserId = @MongoUserId;

  SELECT TOP 1
    MongoStudentId,
    FullName,
    RollNumber,
    ClassName,
    SectionName,
    GuardianName,
    GuardianPhone,
    Email,
    Phone
  FROM dbo.SqlStudents
  WHERE @Role = N'student'
    AND @MongoUserId IS NOT NULL
    AND MongoUserId = @MongoUserId
    AND IsActive = 1;
END;

CREATE OR ALTER PROCEDURE dbo.spReportAnalytics
  @Period NVARCHAR(20) = N'month'
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @Today DATE = CAST(SYSUTCDATETIME() AS DATE);
  DECLARE @StartDate DATE;

  SET @StartDate = CASE
    WHEN @Period = N'week' THEN DATEADD(DAY, -7, @Today)
    WHEN @Period = N'year' THEN DATEADD(YEAR, -1, @Today)
    ELSE DATEADD(MONTH, -1, @Today)
  END;

  IF @Period = N'week'
  BEGIN
    SELECT
      CONVERT(VARCHAR(10), CAST(s.CreatedAt AS DATE), 23) AS _id,
      CAST(COUNT(1) AS INT) AS count
    FROM dbo.SqlStudents s
    WHERE s.CreatedAt >= @StartDate
    GROUP BY CAST(s.CreatedAt AS DATE)
    ORDER BY _id ASC;
  END
  ELSE
  BEGIN
    SELECT
      CONVERT(VARCHAR(7), s.CreatedAt, 23) AS _id,
      CAST(COUNT(1) AS INT) AS count
    FROM dbo.SqlStudents s
    WHERE s.CreatedAt >= @StartDate
    GROUP BY CONVERT(VARCHAR(7), s.CreatedAt, 23)
    ORDER BY _id ASC;
  END;

  SELECT
    s.ClassName AS _id,
    CAST(COUNT(1) AS INT) AS count
  FROM dbo.SqlStudents s
  WHERE s.IsActive = 1
  GROUP BY s.ClassName
  ORDER BY count DESC, s.ClassName ASC;

  SELECT
    subj.GradeName AS _id,
    CAST(COUNT(1) AS INT) AS count
  FROM dbo.SqlSubjects subj
  WHERE subj.IsActive = 1
  GROUP BY subj.GradeName
  ORDER BY count DESC, subj.GradeName ASC;

  SELECT
    h.ClassName AS class,
    CAST(SUM(CASE WHEN d.Status = N'Present' THEN 1 ELSE 0 END) AS INT) AS present,
    CAST(SUM(CASE WHEN d.Status = N'Absent' THEN 1 ELSE 0 END) AS INT) AS absent,
    CAST(COUNT(1) AS INT) AS total,
    CAST(CASE
      WHEN COUNT(1) = 0 THEN 0
      ELSE (SUM(CASE WHEN d.Status = N'Present' THEN 1.0 ELSE 0 END) / COUNT(1)) * 100
    END AS DECIMAL(10,2)) AS percentage
  FROM dbo.SqlAttendanceHeaders h
  INNER JOIN dbo.SqlAttendanceDetails d
    ON d.SqlAttendanceHeaderId = h.SqlAttendanceHeaderId
  WHERE h.AttendanceDate >= @StartDate
  GROUP BY h.ClassName
  ORDER BY h.ClassName ASC;

  SELECT
    subj.Name AS subject,
    CAST(AVG(CAST(r.MarksObtained AS DECIMAL(18,2))) AS DECIMAL(10,2)) AS averageMarks,
    CAST(COUNT(1) AS INT) AS totalStudents
  FROM dbo.SqlExamResults r
  INNER JOIN dbo.SqlSubjects subj
    ON subj.MongoSubjectId = r.MongoSubjectId
  WHERE r.CreatedAt >= @StartDate
  GROUP BY subj.Name
  ORDER BY averageMarks DESC, subj.Name ASC;
END;

CREATE OR ALTER PROCEDURE dbo.spReportSummary
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @ThirtyDaysAgo DATE = DATEADD(DAY, -30, CAST(SYSUTCDATETIME() AS DATE));

  SELECT
    CAST(ISNULL((SELECT COUNT(1) FROM dbo.SqlStudents), 0) AS INT) AS TotalStudents,
    CAST(ISNULL((SELECT COUNT(1) FROM dbo.SqlStudents WHERE IsActive = 1), 0) AS INT) AS ActiveStudents,
    CAST(ISNULL((SELECT COUNT(1) FROM dbo.SqlTeachers WHERE IsActive = 1), 0) AS INT) AS TotalTeachers,
    CAST(ISNULL((SELECT COUNT(1) FROM dbo.SqlSubjects WHERE IsActive = 1), 0) AS INT) AS TotalSubjects,
    CAST(ISNULL((SELECT COUNT(1) FROM dbo.SqlExams WHERE IsActive = 1), 0) AS INT) AS TotalExams,
    CAST(ISNULL((
      SELECT CASE
        WHEN COUNT(1) = 0 THEN 0
        ELSE (SUM(CASE WHEN d.Status = N'Present' THEN 1.0 ELSE 0 END) / COUNT(1)) * 100
      END
      FROM dbo.SqlAttendanceHeaders h
      INNER JOIN dbo.SqlAttendanceDetails d
        ON d.SqlAttendanceHeaderId = h.SqlAttendanceHeaderId
      WHERE h.AttendanceDate >= @ThirtyDaysAgo
    ), 0) AS DECIMAL(10,2)) AS AvgAttendance,
    CAST(ISNULL((SELECT AVG(CAST(MarksObtained AS DECIMAL(18,2))) FROM dbo.SqlExamResults), 0) AS DECIMAL(10,2)) AS AvgGrade;
END;

CREATE OR ALTER PROCEDURE dbo.spReportExamOverview
  @StartDate DATE = NULL,
  @EndDate DATE = NULL
AS
BEGIN
  SET NOCOUNT ON;

  ;WITH FilteredResults AS (
    SELECT
      e.MongoExamId,
      e.Name AS ExamName,
      e.ClassName,
      e.SectionName,
      e.ExamDate,
      e.TotalMarks,
      e.PassingMarks,
      r.MongoStudentId,
      r.MarksObtained,
      r.GradeLetter,
      r.MongoSubjectId,
      stu.FullName AS StudentName,
      stu.RollNumber,
      subj.Name AS SubjectName
    FROM dbo.SqlExams e
    LEFT JOIN dbo.SqlExamResults r
      ON r.MongoExamId = e.MongoExamId
    LEFT JOIN dbo.SqlStudents stu
      ON stu.MongoStudentId = r.MongoStudentId
    LEFT JOIN dbo.SqlSubjects subj
      ON subj.MongoSubjectId = r.MongoSubjectId
    WHERE e.IsActive = 1
      AND (@StartDate IS NULL OR e.ExamDate >= @StartDate)
      AND (@EndDate IS NULL OR e.ExamDate <= @EndDate)
  )
  SELECT
    CAST(COUNT(DISTINCT MongoExamId) AS INT) AS TotalExams,
    CAST(COUNT(MongoStudentId) AS INT) AS TotalResults,
    CAST(ISNULL(AVG(CAST(MarksObtained AS DECIMAL(18,2))), 0) AS DECIMAL(10,2)) AS AverageMarks,
    CAST(CASE
      WHEN COUNT(MongoStudentId) = 0 THEN 0
      ELSE (SUM(CASE WHEN MarksObtained >= PassingMarks THEN 1.0 ELSE 0 END) / COUNT(MongoStudentId)) * 100
    END AS DECIMAL(10,2)) AS PassPercentage
  FROM FilteredResults;

  SELECT
    e.MongoExamId,
    e.Name AS ExamName,
    e.ClassName,
    e.SectionName,
    e.ExamDate,
    e.TotalMarks,
    e.PassingMarks,
    subj.MongoSubjectId AS SubjectMongoId,
    subj.SubjectName,
    CAST(COUNT(r.MongoGradeId) AS INT) AS ResultCount,
    CAST(ISNULL(AVG(CAST(r.MarksObtained AS DECIMAL(18,2))), 0) AS DECIMAL(10,2)) AS AverageMarks
  FROM dbo.SqlExams e
  OUTER APPLY (
    SELECT TOP 1
      es.MongoSubjectId,
      s.Name AS SubjectName
    FROM dbo.SqlExamSubjects es
    LEFT JOIN dbo.SqlSubjects s
      ON s.MongoSubjectId = es.MongoSubjectId
    WHERE es.MongoExamId = e.MongoExamId
    ORDER BY es.SortOrder ASC, es.SqlExamSubjectId ASC
  ) subj
  LEFT JOIN dbo.SqlExamResults r
    ON r.MongoExamId = e.MongoExamId
  WHERE e.IsActive = 1
    AND (@StartDate IS NULL OR e.ExamDate >= @StartDate)
    AND (@EndDate IS NULL OR e.ExamDate <= @EndDate)
  GROUP BY
    e.MongoExamId,
    e.Name,
    e.ClassName,
    e.SectionName,
    e.ExamDate,
    e.TotalMarks,
    e.PassingMarks,
    subj.MongoSubjectId,
    subj.SubjectName
  ORDER BY e.ExamDate DESC, e.Name ASC;

  SELECT
    subj.Name AS subject,
    CAST(COUNT(DISTINCT r.MongoExamId) AS INT) AS exams,
    CAST(ISNULL(AVG(CAST(r.MarksObtained AS DECIMAL(18,2))), 0) AS DECIMAL(10,2)) AS averageMarks,
    CAST(ISNULL(MAX(CAST(r.MarksObtained AS DECIMAL(18,2))), 0) AS DECIMAL(10,2)) AS highestMarks,
    CAST(ISNULL(MIN(CAST(r.MarksObtained AS DECIMAL(18,2))), 0) AS DECIMAL(10,2)) AS lowestMarks
  FROM dbo.SqlExamResults r
  INNER JOIN dbo.SqlExams e
    ON e.MongoExamId = r.MongoExamId
  INNER JOIN dbo.SqlSubjects subj
    ON subj.MongoSubjectId = r.MongoSubjectId
  WHERE e.IsActive = 1
    AND (@StartDate IS NULL OR e.ExamDate >= @StartDate)
    AND (@EndDate IS NULL OR e.ExamDate <= @EndDate)
  GROUP BY subj.Name
  ORDER BY averageMarks DESC, subj.Name ASC;

  ;WITH RankedResults AS (
    SELECT
      r.MongoStudentId,
      stu.FullName AS StudentName,
      stu.RollNumber,
      e.ClassName,
      e.Name AS ExamName,
      subj.Name AS SubjectName,
      e.ExamDate,
      r.MarksObtained,
      e.TotalMarks,
      r.GradeLetter,
      ROW_NUMBER() OVER (
        ORDER BY r.MarksObtained DESC, stu.FullName ASC, e.ExamDate DESC
      ) AS ResultRank
    FROM dbo.SqlExamResults r
    INNER JOIN dbo.SqlExams e
      ON e.MongoExamId = r.MongoExamId
    LEFT JOIN dbo.SqlStudents stu
      ON stu.MongoStudentId = r.MongoStudentId
    LEFT JOIN dbo.SqlSubjects subj
      ON subj.MongoSubjectId = r.MongoSubjectId
    WHERE e.IsActive = 1
      AND (@StartDate IS NULL OR e.ExamDate >= @StartDate)
      AND (@EndDate IS NULL OR e.ExamDate <= @EndDate)
  )
  SELECT TOP 10
    MongoStudentId,
    StudentName,
    RollNumber,
    ClassName,
    ExamName,
    SubjectName,
    ExamDate,
    CAST(ISNULL(MarksObtained, 0) AS DECIMAL(10,2)) AS MarksObtained,
    CAST(ISNULL(TotalMarks, 0) AS DECIMAL(10,2)) AS TotalMarks,
    GradeLetter,
    ResultRank
  FROM RankedResults
  ORDER BY ResultRank ASC;
END;
`;

const REPORT_PROCEDURE_BATCHES = REPORT_PROCEDURES_BATCH
  .split(/\n(?=CREATE OR ALTER PROCEDURE )/g)
  .map((statement) => statement.trim())
  .filter(Boolean);

const ensureReportSqlReady = async () => {
  if (!reportBootstrapPromise) {
    reportBootstrapPromise = (async () => {
      await ensureStudentSqlReady();
      await ensureTeacherSqlReady();
      await ensureAcademicSqlReady();
      await ensureAttendanceSqlReady();
      await ensureFeeSqlReady();
      await ensureExamSqlReady();

      const pool = await getPool();
      for (const batch of REPORT_PROCEDURE_BATCHES) {
        await pool.request().batch(batch);
      }

      return true;
    })().catch((error) => {
      reportBootstrapPromise = null;
      throw error;
    });
  }

  return reportBootstrapPromise;
};

const syncReportSources = async ({ force = false } = {}) => {
  if (!force && Date.now() - lastReportSyncAt < REPORT_SYNC_TTL_MS) {
    return;
  }

  if (!reportSyncPromise) {
    reportSyncPromise = (async () => {
      await ensureReportSqlReady();
      await Promise.all([
        syncAllStudentsToSql({ force }),
        syncAllTeachersToSql({ force }),
        syncAllSubjectsToSql({ force }),
        syncAllAttendanceToSql({ force }),
        syncAllFeesToSql({ force }),
        syncAllExamsToSql({ force }),
      ]);
      lastReportSyncAt = Date.now();
    })().finally(() => {
      reportSyncPromise = null;
    });
  }

  return reportSyncPromise;
};

const getDashboardReport = async ({ role = null, userId = null } = {}) => {
  await syncReportSources();

  const sql = getSqlClient();
  const [materialSummary, reportResult] = await Promise.all([
    getMaterialSummary(),
    executeStoredProcedure('dbo.spReportDashboard', [
      { name: 'Role', type: sql.NVarChar(50), value: toNullableString(role) },
      { name: 'MongoUserId', type: sql.NVarChar(64), value: userId ? String(userId) : null },
    ]),
  ]);

  const recordsets = reportResult?.recordsets || [];
  const summaryRow = recordsets[0]?.[0] || {};
  const todayAttendanceRow = recordsets[1]?.[0] || {};

  const totalStudents = toNumber(summaryRow.TotalStudents);
  const totalTeachers = toNumber(summaryRow.TotalTeachers);
  const totalSubjects = toNumber(summaryRow.TotalSubjects);
  const totalMaterials = toNumber(materialSummary.totalMaterials);
  const attendanceTotal = toNumber(todayAttendanceRow.TotalCount);
  const presentCount = toNumber(todayAttendanceRow.PresentCount);

  return {
    totalStudents,
    totalTeachers,
    totalSubjects,
    totalMaterials,
    stats: {
      students: totalStudents,
      teachers: totalTeachers,
      subjects: totalSubjects,
      materials: totalMaterials,
    },
    todayAttendance: {
      present: presentCount,
      absent: toNumber(todayAttendanceRow.AbsentCount),
      late: toNumber(todayAttendanceRow.LateCount),
      leave: toNumber(todayAttendanceRow.LeaveCount),
      total: attendanceTotal,
      percentage: attendanceTotal > 0 ? Number(((presentCount / attendanceTotal) * 100).toFixed(1)) : 0,
    },
    attendanceTrend: (recordsets[2] || []).map((row) => ({
      date: row.ReportDate,
      day: row.DayLabel,
      present: toNumber(row.PresentCount),
      absent: toNumber(row.AbsentCount),
      late: toNumber(row.LateCount),
      leave: toNumber(row.LeaveCount),
      total: toNumber(row.TotalCount),
    })),
    studentGrowthTrend: (recordsets[3] || []).map((row) => ({
      month: row.Month,
      year: toNumber(row.Year),
      students: toNumber(row.StudentCount),
    })),
    feeCollectionTrend: (recordsets[4] || []).map((row) => ({
      month: row.Month,
      year: toNumber(row.Year),
      collected: toNumber(row.CollectedAmount),
      pending: toNumber(row.PendingAmount),
    })),
    upcomingExams: (recordsets[5] || []).map(mapUpcomingExamRow).filter(Boolean),
    teacherSummary: recordsets[6]?.[0]
      ? {
          assignedSubjects: toNumber(recordsets[6][0].AssignedSubjects),
          attendanceMarkedToday: toNumber(recordsets[6][0].AttendanceMarkedToday),
        }
      : null,
    studentProfileSummary: recordsets[7]?.[0]
      ? {
          _id: recordsets[7][0].MongoStudentId,
          fullName: recordsets[7][0].FullName,
          rollNumber: recordsets[7][0].RollNumber || '',
          class: recordsets[7][0].ClassName || '',
          section: recordsets[7][0].SectionName || '',
          guardianName: recordsets[7][0].GuardianName || '',
          guardianPhone: recordsets[7][0].GuardianPhone || '',
          email: recordsets[7][0].Email || '',
          phone: recordsets[7][0].Phone || '',
        }
      : null,
    recentMaterials: materialSummary.recentMaterials,
  };
};

const getAnalyticsReport = async ({ period = 'month' } = {}) => {
  await syncReportSources();

  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spReportAnalytics', [
    { name: 'Period', type: sql.NVarChar(20), value: toNullableString(period) || 'month' },
  ]);

  const recordsets = result?.recordsets || [];
  return {
    studentTrend: recordsets[0] || [],
    classDistribution: recordsets[1] || [],
    subjectDistribution: recordsets[2] || [],
    attendanceByClass: (recordsets[3] || []).map((row) => ({
      class: row.class,
      present: toNumber(row.present),
      absent: toNumber(row.absent),
      total: toNumber(row.total),
      percentage: toNumber(row.percentage),
    })),
    gradePerformance: (recordsets[4] || []).map((row) => ({
      subject: row.subject,
      averageMarks: toNumber(row.averageMarks),
      totalStudents: toNumber(row.totalStudents),
    })),
  };
};

const getSummaryReportData = async () => {
  await syncReportSources();

  const sql = getSqlClient();
  const [materialSummary, result] = await Promise.all([
    getMaterialSummary(),
    executeStoredProcedure('dbo.spReportSummary', []),
  ]);

  const row = result?.recordset?.[0] || {};
  return {
    totalStudents: toNumber(row.TotalStudents),
    activeStudents: toNumber(row.ActiveStudents),
    totalTeachers: toNumber(row.TotalTeachers),
    totalSubjects: toNumber(row.TotalSubjects),
    totalMaterials: toNumber(materialSummary.totalMaterials),
    totalExams: toNumber(row.TotalExams),
    avgAttendance: toNumber(row.AvgAttendance),
    avgGrade: toNumber(row.AvgGrade),
  };
};

const getAttendanceReportData = async ({ className = null, sectionName = null, startDate = null, endDate = null } = {}) => {
  await syncReportSources();

  const normalizedClassName = toNullableString(className);
  const normalizedSectionName = toNullableString(sectionName);
  const normalizedStartDate = normalizeDateOnly(startDate);
  const normalizedEndDate = normalizeDateOnly(endDate);

  const [attendanceList, summary] = await Promise.all([
    getAttendanceList({
      className: normalizedClassName,
      sectionName: normalizedSectionName,
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      page: 1,
      limit: 5000,
    }),
    getClassAttendanceSummary({
      className: normalizedClassName,
      sectionName: normalizedSectionName,
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
    }),
  ]);

  return {
    records: attendanceList.attendances,
    count: attendanceList.total,
    summary: {
      statusStats: summary.statusStats || [],
      dailyStats: summary.dailyStats || [],
      studentStats: summary.studentStats || [],
    },
    filters: {
      class: normalizedClassName,
      section: normalizedSectionName,
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
    },
  };
};

const getAttendanceExportRows = async (filters = {}) => {
  const report = await getAttendanceReportData(filters);
  return report.records.map((attendance) => ({
    date: attendance?.date ? new Date(attendance.date).toISOString().split('T')[0] : null,
    studentName: attendance?.studentId?.fullName || null,
    rollNumber: attendance?.studentId?.rollNumber || null,
    class: attendance?.class || null,
    section: attendance?.section || '',
    status: attendance?.status || null,
    markedBy: attendance?.markedBy?.fullName || null,
    remarks: attendance?.remarks || '',
  }));
};

const mapExamOverviewRow = (row) => ({
  _id: row.MongoExamId,
  title: row.ExamName,
  name: row.ExamName,
  class: row.ClassName,
  grade: row.ClassName,
  section: row.SectionName || '',
  date: row.ExamDate ? new Date(row.ExamDate) : null,
  examDate: row.ExamDate ? new Date(row.ExamDate) : null,
  totalMarks: toNumber(row.TotalMarks),
  passingMarks: toNumber(row.PassingMarks),
  resultCount: toNumber(row.ResultCount),
  averageMarks: toNumber(row.AverageMarks),
  subject: row.SubjectName
    ? {
        _id: row.SubjectMongoId || null,
        name: row.SubjectName,
      }
    : null,
  subjectId: row.SubjectName
    ? {
        _id: row.SubjectMongoId || null,
        name: row.SubjectName,
      }
    : null,
});

const mapTopStudentRow = (row) => ({
  _id: row.MongoStudentId,
  studentId: row.MongoStudentId,
  studentName: row.StudentName || null,
  rollNumber: row.RollNumber || null,
  class: row.ClassName || null,
  examName: row.ExamName || null,
  subject: row.SubjectName || null,
  examDate: row.ExamDate ? new Date(row.ExamDate) : null,
  marksObtained: toNumber(row.MarksObtained),
  totalMarks: toNumber(row.TotalMarks),
  grade: row.GradeLetter || '',
  rank: toNumber(row.ResultRank),
});

const getExamReportData = async ({ startDate = null, endDate = null } = {}) => {
  await syncReportSources();

  const sql = getSqlClient();
  const result = await executeStoredProcedure('dbo.spReportExamOverview', [
    { name: 'StartDate', type: sql.Date, value: normalizeDateOnly(startDate) },
    { name: 'EndDate', type: sql.Date, value: normalizeDateOnly(endDate) },
  ]);

  const recordsets = result?.recordsets || [];
  const summaryRow = recordsets[0]?.[0] || {};
  const topStudents = (recordsets[3] || []).map(mapTopStudentRow);

  return {
    summary: {
      totalExams: toNumber(summaryRow.TotalExams),
      totalResults: toNumber(summaryRow.TotalResults),
      averageMarks: toNumber(summaryRow.AverageMarks),
      passPercentage: toNumber(summaryRow.PassPercentage),
    },
    exams: (recordsets[1] || []).map(mapExamOverviewRow),
    subjectPerformance: (recordsets[2] || []).map((row) => ({
      subject: row.subject,
      exams: toNumber(row.exams),
      averageMarks: toNumber(row.averageMarks),
      highestMarks: toNumber(row.highestMarks),
      lowestMarks: toNumber(row.lowestMarks),
    })),
    topStudents,
    meritList: topStudents,
    filters: {
      startDate: normalizeDateOnly(startDate),
      endDate: normalizeDateOnly(endDate),
    },
  };
};

const getExamExportRows = async (filters = {}) => {
  const report = await getExamReportData(filters);
  return report.topStudents.map((student) => ({
    rank: student.rank,
    studentName: student.studentName,
    rollNumber: student.rollNumber,
    class: student.class,
    examName: student.examName,
    subject: student.subject,
    examDate: student.examDate ? new Date(student.examDate).toISOString().split('T')[0] : null,
    marksObtained: student.marksObtained,
    totalMarks: student.totalMarks,
    grade: student.grade,
  }));
};

const getFeeReportData = async ({ academicYear = null } = {}) => {
  await syncReportSources();
  const stats = await getFeeStatistics({ academicYear: toNullableString(academicYear) });
  return {
    ...stats,
    summary: {
      totalFees: toNumber(stats.totalFees),
      totalPaid: toNumber(stats.totalPaid),
      totalPending: toNumber(stats.totalPending),
      overdueCount: toNumber(stats.overdueCount),
    },
  };
};

module.exports = {
  ensureReportSqlReady,
  syncReportSources,
  getDashboardReport,
  getAnalyticsReport,
  getSummaryReportData,
  getAttendanceReportData,
  getAttendanceExportRows,
  getExamReportData,
  getExamExportRows,
  getFeeReportData,
};
