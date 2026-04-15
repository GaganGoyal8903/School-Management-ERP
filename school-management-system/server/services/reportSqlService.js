const {
  getSqlClient,
  executeQuery,
  executeStoredProcedure,
  getPool,
} = require('../config/sqlServer');
const {
  ensureStudentSqlReady,
  syncAllStudentsToSql,
  getStudentCount,
} = require('./studentSqlService');
const {
  ensureTeacherSqlReady,
  syncAllTeachersToSql,
  getTeacherCount,
} = require('./teacherSqlService');
const {
  ensureAcademicSqlReady,
  syncAllSubjectsToSql,
  getSubjectCount,
} = require('./academicSqlService');
const { ensureAttendanceSqlReady, syncAllAttendanceToSql, getAttendanceList, getClassAttendanceSummary } = require('./attendanceSqlService');
const { ensureFeeSqlReady, syncAllFeesToSql, getFeeStatistics } = require('./feeSqlService');
const { ensureExamSqlReady, syncAllExamsToSql } = require('./examSqlService');
const { getBusStatistics } = require('./busSqlService');

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

const getStatusCount = (items = [], status) =>
  Number(
    items.find((item) => [item?._id, item?.status, item?.name]
      .some((value) => String(value || '').trim().toLowerCase() === String(status || '').trim().toLowerCase())
    )?.count || 0
  );

const createRestrictedDashboardReport = ({ role = null } = {}) => ({
  totalStudents: 0,
  totalTeachers: 0,
  totalSubjects: 0,
  totalMaterials: 0,
  totalFeesCollected: 0,
  pendingFees: 0,
  stats: {
    students: 0,
    teachers: 0,
    subjects: 0,
    materials: 0,
    totalStudents: 0,
    totalTeachers: 0,
    totalFeesCollected: 0,
    pendingFees: 0,
  },
  feeSummary: {
    totalFees: 0,
    collectedFees: 0,
    pendingFees: 0,
    totalPaid: 0,
    totalPending: 0,
    overdueCount: 0,
  },
  todayAttendance: {
    totalStudents: 0,
    markedStudents: 0,
    unmarkedStudents: 0,
    present: 0,
    absent: 0,
    late: 0,
    leave: 0,
    percentage: 0,
    isMarked: false,
  },
  attendanceSummary: {
    totalStudents: 0,
    markedStudents: 0,
    unmarkedStudents: 0,
    present: 0,
    absent: 0,
    late: 0,
    leave: 0,
    percentage: 0,
    isMarked: false,
  },
  attendanceTrend: [],
  studentGrowth: [],
  studentGrowthTrend: [],
  feeCollectionTrend: [],
  feeCollectionGraph: [],
  busFleetStatus: {
    total: 0,
    totalBuses: 0,
    active: 0,
    activeBuses: 0,
    onRoute: 0,
    onRouteBuses: 0,
    filters: {
      total: '',
      active: 'Active',
      onRoute: 'On Route',
    },
  },
  recentStudents: [],
  upcomingExams: [],
  teacherSummary: null,
  studentProfileSummary: {
    role,
    dashboardMode: 'restricted',
  },
  recentMaterials: [],
});

const mapRecentDashboardStudent = (student) => {
  if (!student) {
    return null;
  }

  const studentId = student.studentId || student.StudentId || student.id || student._id || null;
  const studentName = student.name || student.fullName || student.FullName || 'Student';
  const className = student.class || student.className || student.ClassName || '';
  const sectionName = student.section || student.sectionName || student.SectionName || '';
  const rollNumber = student.rollNumber || student.rollNo || student.RollNumber || null;

  return {
    _id: studentId,
    id: studentId,
    studentId,
    name: studentName,
    fullName: studentName,
    admissionNumber: student.admissionNumber || null,
    rollNumber,
    rollNo: rollNumber,
    class: className,
    className,
    section: sectionName,
    sectionName,
    gender: student.gender || null,
    parentName: student.parentName || student.guardianName || null,
    contactNumber: student.phone || student.parentPhone || student.guardianPhone || null,
    createdAt: student.createdAt || null,
  };
};

const getLiveDashboardAttendanceSnapshot = async () => {
  await ensureAttendanceSqlReady();

  const [totalStudents, summaryResult, trendResult] = await Promise.all([
    getStudentCount({ onlyActive: true }),
    executeQuery(`
      SELECT
        CAST(ISNULL(COUNT(sad.AttendanceDetailId), 0) AS INT) AS MarkedCount,
        CAST(ISNULL(SUM(CASE WHEN sad.Status = N'Present' THEN 1 ELSE 0 END), 0) AS INT) AS PresentCount,
        CAST(ISNULL(SUM(CASE WHEN sad.Status = N'Absent' THEN 1 ELSE 0 END), 0) AS INT) AS AbsentCount,
        CAST(ISNULL(SUM(CASE WHEN sad.Status = N'Late' THEN 1 ELSE 0 END), 0) AS INT) AS LateCount,
        CAST(ISNULL(SUM(CASE WHEN sad.Status IN (N'Half Day', N'Excused') THEN 1 ELSE 0 END), 0) AS INT) AS LeaveCount
      FROM dbo.StudentAttendance sa
      LEFT JOIN dbo.StudentAttendanceDetails sad
        ON sad.AttendanceId = sa.AttendanceId
      WHERE sa.AttendanceDate = CAST(GETDATE() AS DATE);
    `),
    executeQuery(`
      DECLARE @Today DATE = CAST(GETDATE() AS DATE);
      DECLARE @TrendStart DATE = DATEADD(DAY, -6, @Today);

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
        CAST(ISNULL(SUM(CASE WHEN sad.Status = N'Present' THEN 1 ELSE 0 END), 0) AS INT) AS PresentCount,
        CAST(ISNULL(SUM(CASE WHEN sad.Status = N'Absent' THEN 1 ELSE 0 END), 0) AS INT) AS AbsentCount,
        CAST(ISNULL(SUM(CASE WHEN sad.Status = N'Late' THEN 1 ELSE 0 END), 0) AS INT) AS LateCount,
        CAST(ISNULL(SUM(CASE WHEN sad.Status IN (N'Half Day', N'Excused') THEN 1 ELSE 0 END), 0) AS INT) AS LeaveCount,
        CAST(ISNULL(COUNT(sad.AttendanceDetailId), 0) AS INT) AS TotalCount
      FROM Days dayset
      LEFT JOIN dbo.StudentAttendance sa
        ON sa.AttendanceDate = dayset.AttendanceDate
      LEFT JOIN dbo.StudentAttendanceDetails sad
        ON sad.AttendanceId = sa.AttendanceId
      GROUP BY dayset.AttendanceDate
      ORDER BY dayset.AttendanceDate ASC
      OPTION (MAXRECURSION 10);
    `),
  ]);

  const summaryRow = summaryResult?.recordset?.[0] || {};
  const markedStudents = toNumber(summaryRow.MarkedCount);
  const present = toNumber(summaryRow.PresentCount);
  const absent = toNumber(summaryRow.AbsentCount);
  const late = toNumber(summaryRow.LateCount);
  const leave = toNumber(summaryRow.LeaveCount);

  return {
    attendanceSummary: {
      totalStudents: toNumber(totalStudents),
      total: toNumber(totalStudents),
      markedStudents,
      unmarkedStudents: Math.max(toNumber(totalStudents) - markedStudents, 0),
      present,
      absent,
      late,
      leave,
      percentage: markedStudents > 0 ? Number(((present / markedStudents) * 100).toFixed(1)) : 0,
      isMarked: markedStudents > 0,
    },
    attendanceTrend: (trendResult?.recordset || []).map((row) => ({
      date: row.ReportDate,
      day: row.DayLabel,
      present: toNumber(row.PresentCount),
      absent: toNumber(row.AbsentCount),
      late: toNumber(row.LateCount),
      leave: toNumber(row.LeaveCount),
      total: toNumber(row.TotalCount),
    })),
  };
};

const getLiveDashboardStudentGrowthTrend = async () => {
  await ensureStudentSqlReady();

  const result = await executeQuery(`
    DECLARE @Today DATE = CAST(GETDATE() AS DATE);
    DECLARE @MonthStart DATE = DATEFROMPARTS(YEAR(DATEADD(MONTH, -5, @Today)), MONTH(DATEADD(MONTH, -5, @Today)), 1);
    DECLARE @CurrentMonth DATE = DATEFROMPARTS(YEAR(@Today), MONTH(@Today), 1);

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
      CAST(ISNULL(COUNT(S.StudentId), 0) AS INT) AS StudentCount
    FROM Months monthset
    LEFT JOIN dbo.Students S
     ON (
        S.Status IS NULL
        OR LTRIM(RTRIM(LOWER(S.Status))) <> N'inactive'
      )
     AND COALESCE(CAST(S.AdmissionDate AS DATETIME2(0)), S.CreatedAt) >= monthset.MonthStart
     AND COALESCE(CAST(S.AdmissionDate AS DATETIME2(0)), S.CreatedAt) < DATEADD(MONTH, 1, monthset.MonthStart)
    GROUP BY monthset.MonthStart
    ORDER BY monthset.MonthStart ASC
    OPTION (MAXRECURSION 12);
  `);

  return (result?.recordset || []).map((row) => ({
    month: row.Month,
    year: toNumber(row.Year),
    students: toNumber(row.StudentCount),
  }));
};

const getLiveDashboardFeeCollectionTrend = async () => {
  await ensureFeeSqlReady();

  const result = await executeQuery(`
    DECLARE @Today DATE = CAST(GETDATE() AS DATE);
    DECLARE @MonthStart DATE = DATEFROMPARTS(YEAR(DATEADD(MONTH, -5, @Today)), MONTH(DATEADD(MONTH, -5, @Today)), 1);
    DECLARE @CurrentMonth DATE = DATEFROMPARTS(YEAR(@Today), MONTH(@Today), 1);

    ;WITH Months AS (
      SELECT @MonthStart AS MonthStart
      UNION ALL
      SELECT DATEADD(MONTH, 1, MonthStart)
      FROM Months
      WHERE MonthStart < @CurrentMonth
    ),
    Collections AS (
      SELECT
        DATEFROMPARTS(
          YEAR(COALESCE(CAST(fp.PaymentDate AS DATE), CAST(fp.CreatedAt AS DATE))),
          MONTH(COALESCE(CAST(fp.PaymentDate AS DATE), CAST(fp.CreatedAt AS DATE))),
          1
        ) AS MonthStart,
        SUM(fp.AmountPaid) AS CollectedAmount
      FROM dbo.FeePayments fp
      WHERE COALESCE(CAST(fp.PaymentDate AS DATE), CAST(fp.CreatedAt AS DATE)) >= @MonthStart
      GROUP BY DATEFROMPARTS(
        YEAR(COALESCE(CAST(fp.PaymentDate AS DATE), CAST(fp.CreatedAt AS DATE))),
        MONTH(COALESCE(CAST(fp.PaymentDate AS DATE), CAST(fp.CreatedAt AS DATE))),
        1
      )
    ),
    Pending AS (
      SELECT
        DATEFROMPARTS(
          YEAR(COALESCE(CAST(sf.DueDate AS DATE), CAST(sf.CreatedAt AS DATE))),
          MONTH(COALESCE(CAST(sf.DueDate AS DATE), CAST(sf.CreatedAt AS DATE))),
          1
        ) AS MonthStart,
        SUM(CASE WHEN sf.BalanceAmount > 0 THEN sf.BalanceAmount ELSE 0 END) AS PendingAmount
      FROM dbo.StudentFees sf
      WHERE COALESCE(CAST(sf.DueDate AS DATE), CAST(sf.CreatedAt AS DATE)) >= @MonthStart
      GROUP BY DATEFROMPARTS(
        YEAR(COALESCE(CAST(sf.DueDate AS DATE), CAST(sf.CreatedAt AS DATE))),
        MONTH(COALESCE(CAST(sf.DueDate AS DATE), CAST(sf.CreatedAt AS DATE))),
        1
      )
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
  `);

  return (result?.recordset || []).map((row) => ({
    month: row.Month,
    year: toNumber(row.Year),
    collected: toNumber(row.CollectedAmount),
    pending: toNumber(row.PendingAmount),
  }));
};

const getLiveDashboardRecentStudents = async ({ role = null } = {}) => {
  const normalizedRole = String(role || '').trim().toLowerCase();
  if (!['admin', 'teacher'].includes(normalizedRole)) {
    return [];
  }

  await ensureStudentSqlReady();

  const result = await executeQuery(`
    SELECT TOP 5
      s.StudentId,
      s.FullName,
      s.AdmissionNumber,
      s.RollNumber,
      c.ClassName,
      sec.SectionName,
      s.Gender,
      s.Phone,
      s.AdmissionDate,
      s.CreatedAt
    FROM dbo.Students s
    LEFT JOIN dbo.Classes c
      ON c.ClassId = s.ClassId
    LEFT JOIN dbo.Sections sec
      ON sec.SectionId = s.SectionId
    WHERE (
      s.Status IS NULL
      OR LTRIM(RTRIM(LOWER(s.Status))) <> N'inactive'
    )
    ORDER BY
      COALESCE(CAST(s.AdmissionDate AS DATETIME2(0)), s.CreatedAt) DESC,
      s.StudentId DESC;
  `);

  return (result?.recordset || []).map(mapRecentDashboardStudent).filter(Boolean);
};

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
  const normalizedRole = String(role || '').trim().toLowerCase();
  if (['student', 'parent'].includes(normalizedRole)) {
    return createRestrictedDashboardReport({ role: normalizedRole, userId });
  }

  await Promise.all([
    ensureStudentSqlReady(),
    ensureTeacherSqlReady(),
    ensureAcademicSqlReady(),
    ensureAttendanceSqlReady(),
    ensureFeeSqlReady(),
  ]);

  const [
    materialSummary,
    totalStudents,
    totalTeachers,
    totalSubjects,
    feeStats,
    busStats,
    attendanceSnapshot,
    studentGrowthTrend,
    feeCollectionTrend,
    recentStudents,
  ] = await Promise.all([
    getMaterialSummary(),
    getStudentCount({ onlyActive: true }),
    getTeacherCount({ onlyActive: true }),
    getSubjectCount(),
    getFeeStatistics(),
    getBusStatistics(),
    getLiveDashboardAttendanceSnapshot(),
    getLiveDashboardStudentGrowthTrend(),
    getLiveDashboardFeeCollectionTrend(),
    getLiveDashboardRecentStudents({ role }),
  ]);

  const totalMaterials = toNumber(materialSummary.totalMaterials);
  const feeSummary = {
    totalFees: toNumber(feeStats.totalFees),
    collectedFees: toNumber(feeStats.totalPaid),
    pendingFees: toNumber(feeStats.totalPending),
    totalPaid: toNumber(feeStats.totalPaid),
    totalPending: toNumber(feeStats.totalPending),
    overdueCount: toNumber(feeStats.overdueCount),
  };
  const attendanceSummary = attendanceSnapshot.attendanceSummary;
  const activeBusCount = getStatusCount(busStats.byStatus, 'Active');
  const onRouteBusCount = getStatusCount(busStats.byStatus, 'On Route');
  const busFleetStatus = {
    total: toNumber(busStats.totalBuses),
    totalBuses: toNumber(busStats.totalBuses),
    active: activeBusCount,
    activeBuses: activeBusCount,
    onRoute: onRouteBusCount,
    onRouteBuses: onRouteBusCount,
    filters: {
      total: '',
      active: 'Active',
      onRoute: 'On Route',
    },
  };

  return {
    totalStudents: toNumber(totalStudents),
    totalTeachers: toNumber(totalTeachers),
    totalSubjects: toNumber(totalSubjects),
    totalMaterials,
    totalFeesCollected: feeSummary.totalPaid,
    pendingFees: feeSummary.totalPending,
    stats: {
      students: toNumber(totalStudents),
      teachers: toNumber(totalTeachers),
      subjects: toNumber(totalSubjects),
      materials: totalMaterials,
      totalStudents: toNumber(totalStudents),
      totalTeachers: toNumber(totalTeachers),
      totalFeesCollected: feeSummary.totalPaid,
      pendingFees: feeSummary.totalPending,
    },
    feeSummary,
    todayAttendance: attendanceSummary,
    attendanceSummary,
    attendanceTrend: attendanceSnapshot.attendanceTrend,
    studentGrowth: studentGrowthTrend.map((entry) => ({
      month: entry.month,
      year: entry.year,
      count: entry.students,
    })),
    studentGrowthTrend,
    feeCollectionTrend,
    feeCollectionGraph: feeCollectionTrend,
    busFleetStatus,
    recentStudents,
    upcomingExams: [],
    teacherSummary: null,
    studentProfileSummary: null,
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
