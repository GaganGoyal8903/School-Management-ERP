const mongoose = require('mongoose');
const {
  getSqlClient,
  executeQuery,
  executeStoredProcedure,
  executeInTransaction,
  getPool,
} = require('../config/sqlServer');
const { ensureAuthSqlReady } = require('./authSqlService');
const { ensureStudentSqlReady, getStudentById, getStudentsByClass, getStudentList } = require('./studentSqlService');
const { hasFeeReceiptStore, ensureFeeReceiptByPaymentId } = require('./feeReceiptSqlService');

const FEE_STRUCTURE_TABLE = 'dbo.SqlFeeStructures';
const STUDENT_FEE_TABLE = 'dbo.SqlStudentFees';
const FEE_PAYMENT_TABLE = 'dbo.SqlFeePayments';
let feeBootstrapPromise = null;

const parseNumericId = (value) => {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
};

const createFeeValidationError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const VALID_FEE_TYPES = new Set(['Tuition', 'Transport', 'Hostel', 'Books', 'Uniform', 'Examination', 'Other']);
const VALID_PAYMENT_MODES = new Set(['Cash', 'Online', 'Cheque', 'DD', 'Bank Transfer', 'UPI']);
const OVERDUE_PENALTY_PER_DAY = 10;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const toNullableString = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
};

const toDecimal = (value, fallback = 0) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Number(numericValue.toFixed(2));
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

const normalizeDateTime = (value) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};

const getDayDifference = (laterDate, earlierDate) => {
  const normalizedLaterDate = normalizeDateOnly(laterDate);
  const normalizedEarlierDate = normalizeDateOnly(earlierDate);

  if (!normalizedLaterDate || !normalizedEarlierDate || normalizedLaterDate <= normalizedEarlierDate) {
    return 0;
  }

  return Math.floor((normalizedLaterDate.getTime() - normalizedEarlierDate.getTime()) / MS_PER_DAY);
};

const computePenaltyAtDate = (dueDate, referenceDate) => {
  const overdueDays = getDayDifference(referenceDate, dueDate);
  const overduePenalty = Number((overdueDays * OVERDUE_PENALTY_PER_DAY).toFixed(2));

  return {
    overdueDays,
    overduePenalty,
  };
};

const computeFeeSnapshot = ({
  amount = 0,
  lateFee = 0,
  discount = 0,
  paidAmount = 0,
  dueDate = null,
  paymentDate = null,
  status = null,
} = {}, referenceDate = new Date()) => {
  const baseAmount = toDecimal(amount);
  const baseLateFee = toDecimal(lateFee);
  const discountAmount = toDecimal(discount);
  const settledAmount = toDecimal(paidAmount);

  if (status === 'Exempted') {
    return {
      baseLateFee,
      overdueDays: 0,
      overduePenalty: 0,
      totalLateFee: baseLateFee,
      totalPayable: 0,
      pendingAmount: 0,
      status: 'Exempted',
      isOverdue: false,
    };
  }

  const penaltyToday = computePenaltyAtDate(dueDate, referenceDate);
  const penaltyAtLastPayment = computePenaltyAtDate(dueDate, paymentDate);
  const totalDueAtLastPayment = Number(
    Math.max(baseAmount + baseLateFee + penaltyAtLastPayment.overduePenalty - discountAmount, 0).toFixed(2)
  );
  const settledAtLastPayment = Boolean(normalizeDateOnly(paymentDate)) && settledAmount >= totalDueAtLastPayment;
  const effectivePenalty = settledAtLastPayment ? penaltyAtLastPayment : penaltyToday;
  const totalLateFee = Number((baseLateFee + effectivePenalty.overduePenalty).toFixed(2));
  const totalPayable = Number(Math.max(baseAmount + totalLateFee - discountAmount, 0).toFixed(2));
  const pendingAmount = Number(Math.max(totalPayable - settledAmount, 0).toFixed(2));
  const isOverdue = pendingAmount > 0 && getDayDifference(referenceDate, dueDate) > 0;

  return {
    baseLateFee,
    overdueDays: effectivePenalty.overdueDays,
    overduePenalty: effectivePenalty.overduePenalty,
    totalLateFee,
    totalPayable,
    pendingAmount,
    status: pendingAmount <= 0
      ? 'Paid'
      : isOverdue
      ? 'Overdue'
      : settledAmount > 0
      ? 'Partial'
      : 'Pending',
    isOverdue,
  };
};

const getFeeSnapshotFromRow = (row) => computeFeeSnapshot({
  amount: row?.TotalAmount ?? row?.Amount,
  lateFee: row?.FineAmount ?? row?.LateFee,
  discount: row?.DiscountAmount ?? row?.Discount,
  paidAmount: row?.PaidAmount,
  dueDate: row?.DueDate,
  paymentDate: row?.PaymentDate,
  status: row?.Status,
});

const createReceiptNumber = () =>
  `RCPT-${Date.now()}-${Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, '0')}`;

const resolveFeeStatus = ({ amount = 0, lateFee = 0, discount = 0, paidAmount = 0, dueDate = null, paymentDate = null, status = null }) =>
  computeFeeSnapshot({
    amount,
    lateFee,
    discount,
    paidAmount,
    dueDate,
    paymentDate,
    status,
  }).status;

const escapeSqlLiteral = (value = '') => String(value).replace(/'/g, "''");

const toSqlFeePayload = (feeDocument, overrides = {}) => {
  const fee = feeDocument?.toObject ? feeDocument.toObject() : feeDocument;
  const amount = toDecimal(overrides.amount ?? fee?.amount);
  const lateFee = toDecimal(overrides.lateFee ?? fee?.lateFee);
  const discount = toDecimal(overrides.discount ?? fee?.discount);
  const paidAmount = toDecimal(overrides.paidAmount ?? fee?.paidAmount);
  const paymentMode = toNullableString(overrides.paymentMode ?? fee?.paymentMode);
  const feeType = VALID_FEE_TYPES.has(overrides.feeType ?? fee?.feeType)
    ? overrides.feeType ?? fee?.feeType
    : 'Tuition';

  return {
    mongoFeeId: String(overrides.mongoFeeId ?? fee?._id ?? new mongoose.Types.ObjectId()),
    mongoStudentId: String(overrides.mongoStudentId ?? fee?.studentId ?? ''),
    academicYear: toNullableString(overrides.academicYear ?? fee?.academicYear) || '2024-2025',
    className: toNullableString(overrides.className ?? overrides.class ?? fee?.class),
    feeType,
    amount,
    paidAmount,
    dueDate: normalizeDateOnly(overrides.dueDate ?? fee?.dueDate),
    status: resolveFeeStatus({
      amount,
      lateFee,
      discount,
      paidAmount,
      dueDate: overrides.dueDate ?? fee?.dueDate,
      paymentDate: overrides.paymentDate ?? fee?.paymentDate,
      status: overrides.status ?? fee?.status,
    }),
    paymentMode: paymentMode && VALID_PAYMENT_MODES.has(paymentMode) ? paymentMode : null,
    paymentDate: normalizeDateTime(overrides.paymentDate ?? fee?.paymentDate),
    receiptNumber: toNullableString(overrides.receiptNumber ?? fee?.receiptNumber),
    transactionId: toNullableString(overrides.transactionId ?? fee?.transactionId),
    lateFee,
    discount,
    discountReason: toNullableString(overrides.discountReason ?? fee?.discountReason),
    remarks: toNullableString(overrides.remarks ?? fee?.remarks),
    createdByMongoUserId: overrides.createdByMongoUserId
      ? String(overrides.createdByMongoUserId)
      : fee?.createdBy
      ? String(fee.createdBy)
      : null,
    createdAt: normalizeDateTime(overrides.createdAt ?? fee?.createdAt) || new Date(),
    updatedAt: normalizeDateTime(overrides.updatedAt ?? fee?.updatedAt) || new Date(),
  };
};

const mapPaymentRow = (row) => {
  if (!row) {
    return null;
  }

  const paymentId = row.FeePaymentId ?? null;

  return {
    id: paymentId !== null && paymentId !== undefined ? String(paymentId) : null,
    amount: toDecimal(row.AmountPaid ?? row.Amount),
    date: row.PaymentDate ? new Date(row.PaymentDate) : null,
    mode: row.PaymentMode || null,
    transactionId: row.TransactionReference || row.TransactionId || null,
    receiptId: row.FeeReceiptId !== null && row.FeeReceiptId !== undefined ? String(row.FeeReceiptId) : null,
    receiptNumber: row.ReceiptNumber || (paymentId !== null && paymentId !== undefined ? `PAY-${paymentId}` : null),
    receiptDate: row.ReceiptDate ? new Date(row.ReceiptDate) : null,
    notes: row.Remarks || row.Notes || null,
  };
};

const mapFeeRow = (row, payments = []) => {
  if (!row) {
    return null;
  }

  const mappedPayments = Array.isArray(payments) ? payments.filter(Boolean) : [];
  const feeId = row.StudentFeeId ?? row.MongoFeeId ?? null;
  const studentId = row.StudentId ?? row.MongoStudentId ?? null;
  const amount = toDecimal(row.TotalAmount ?? row.Amount);
  const snapshot = getFeeSnapshotFromRow(row);
  const discount = toDecimal(row.DiscountAmount ?? row.Discount);
  const paidAmount = toDecimal(row.PaidAmount);
  const receiptNumber = row.ReceiptNumber
    || mappedPayments[0]?.receiptNumber
    || (feeId !== null && feeId !== undefined ? `FEE-${feeId}` : null);

  return {
    _id: feeId !== null && feeId !== undefined ? String(feeId) : String(row.MongoFeeId),
    id: feeId !== null && feeId !== undefined ? String(feeId) : String(row.MongoFeeId),
    studentId: row.StudentFullName
      ? {
          _id: studentId !== null && studentId !== undefined ? String(studentId) : String(row.MongoStudentId),
          fullName: row.StudentFullName,
          class: row.ClassName,
          section: row.SectionName || '',
          rollNumber: row.StudentRollNumber || null,
          email: row.StudentEmail || null,
          phone: row.StudentPhone || null,
          guardianName: row.GuardianName || '',
          guardianPhone: row.GuardianPhone || '',
        }
      : (studentId !== null && studentId !== undefined ? String(studentId) : row.MongoStudentId),
    academicYear: row.YearName || row.AcademicYear,
    class: row.ClassName,
    feeType: row.FeeType,
    amount,
    paidAmount,
    dueDate: row.DueDate ? new Date(row.DueDate) : null,
    status: snapshot.status,
    paymentMode: row.PaymentMode || null,
    paymentDate: row.PaymentDate ? new Date(row.PaymentDate) : null,
    receiptNumber,
    transactionId: row.TransactionReference || row.TransactionId || null,
    payments: mappedPayments,
    lateFee: snapshot.baseLateFee,
    baseLateFee: snapshot.baseLateFee,
    overdueDays: snapshot.overdueDays,
    overduePenalty: snapshot.overduePenalty,
    totalLateFee: snapshot.totalLateFee,
    totalPayable: snapshot.totalPayable,
    penaltyPerDay: OVERDUE_PENALTY_PER_DAY,
    isOverdue: snapshot.isOverdue,
    discount,
    discountReason: row.DiscountReason || null,
    remarks: row.Remarks || null,
    createdBy: row.CreatedByFullName
      ? {
          _id: row.CreatedByMongoUserId,
          fullName: row.CreatedByFullName,
        }
      : row.CreatedByMongoUserId || null,
    createdAt: row.CreatedAt ? new Date(row.CreatedAt) : null,
    updatedAt: row.UpdatedAt ? new Date(row.UpdatedAt) : null,
    pendingAmount: snapshot.pendingAmount,
  };
};

const mapFeeStructureRow = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: row.FeeStructureId ?? row.SqlFeeStructureId,
    class: row.ClassName,
    feeType: row.FeeType,
    academicYear: row.YearName || row.AcademicYear,
    amount: toDecimal(row.Amount),
    isActive: row.IsActive === undefined ? true : (row.IsActive === true || row.IsActive === 1),
    createdAt: row.CreatedAt ? new Date(row.CreatedAt) : null,
    updatedAt: row.UpdatedAt ? new Date(row.UpdatedAt) : null,
  };
};

const resolveFeeLinkKey = (row) => {
  const feeId = row?.StudentFeeId
    ?? row?.SqlStudentFeeId
    ?? row?.MongoFeeId
    ?? null;

  return feeId === null || feeId === undefined ? null : String(feeId);
};

const buildFeeReadFilters = ({
  search = null,
  className = null,
  status = null,
  studentId = null,
  academicYear = null,
  feeId = null,
} = {}) => {
  const sql = getSqlClient();
  const clauses = [];
  const params = [];
  const studentSqlId = parseNumericId(studentId);
  const feeSqlId = parseNumericId(feeId);

  if (feeSqlId) {
    clauses.push('sf.StudentFeeId = @StudentFeeId');
    params.push({ name: 'StudentFeeId', type: sql.Int, value: feeSqlId });
  }

  if (search) {
    clauses.push(`(
      st.FullName LIKE '%' + @Search + '%'
      OR st.RollNumber LIKE '%' + @Search + '%'
      OR CAST(sf.StudentFeeId AS NVARCHAR(50)) LIKE '%' + @Search + '%'
    )`);
    params.push({ name: 'Search', type: sql.NVarChar(200), value: toNullableString(search) });
  }

  if (className) {
    clauses.push('c.ClassName = @ClassName');
    params.push({ name: 'ClassName', type: sql.NVarChar(100), value: toNullableString(className) });
  }

  if (status) {
    clauses.push('sf.Status = @Status');
    params.push({ name: 'Status', type: sql.NVarChar(20), value: toNullableString(status) });
  }

  if (studentSqlId) {
    clauses.push('sf.StudentId = @StudentId');
    params.push({ name: 'StudentId', type: sql.Int, value: studentSqlId });
  }

  if (academicYear) {
    clauses.push('ay.YearName = @AcademicYear');
    params.push({ name: 'AcademicYear', type: sql.NVarChar(20), value: toNullableString(academicYear) });
  }

  return {
    params,
    whereClause: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
  };
};

const buildFeeBaseSelect = ({ includeTotalCount = false } = {}) => `
  SELECT
    sf.StudentFeeId,
    sf.StudentId,
    st.FullName AS StudentFullName,
    st.RollNumber AS StudentRollNumber,
    st.Email AS StudentEmail,
    st.Phone AS StudentPhone,
    c.ClassName,
    sec.SectionName,
    ay.YearName,
    fs.FeeType,
    fs.Description,
    sf.TotalAmount,
    sf.DiscountAmount,
    sf.FineAmount,
    sf.PaidAmount,
    sf.BalanceAmount,
    sf.Status,
    sf.DueDate,
    fp.PaymentDate,
    fp.PaymentMode,
    fp.TransactionReference,
    fp.Remarks,
    sf.CreatedAt,
    sf.UpdatedAt
    ${includeTotalCount ? ', COUNT(1) OVER() AS TotalCount' : ''}
  FROM dbo.StudentFees sf
  INNER JOIN dbo.Students st
    ON st.StudentId = sf.StudentId
  LEFT JOIN dbo.Classes c
    ON c.ClassId = st.ClassId
  LEFT JOIN dbo.Sections sec
    ON sec.SectionId = st.SectionId
  LEFT JOIN dbo.FeeStructures fs
    ON fs.FeeStructureId = sf.FeeStructureId
  LEFT JOIN dbo.AcademicYears ay
    ON ay.AcademicYearId = fs.AcademicYearId
  OUTER APPLY (
    SELECT TOP 1
      p.PaymentDate,
      p.PaymentMode,
      p.TransactionReference,
      p.Remarks
    FROM dbo.FeePayments p
    WHERE p.StudentFeeId = sf.StudentFeeId
    ORDER BY p.PaymentDate DESC, p.FeePaymentId DESC
  ) fp
`;

const hydrateFeeRowsWithPayments = (feeRows = [], paymentRows = []) => {
  const paymentMap = new Map();

  paymentRows.forEach((row) => {
    const feeLinkKey = resolveFeeLinkKey(row);
    if (!feeLinkKey) {
      return;
    }

    if (!paymentMap.has(feeLinkKey)) {
      paymentMap.set(feeLinkKey, []);
    }

    paymentMap.get(feeLinkKey).push(mapPaymentRow(row));
  });

  return feeRows.map((row) => {
    const feeLinkKey = resolveFeeLinkKey(row);
    return mapFeeRow(row, paymentMap.get(feeLinkKey) || []);
  });
};

const buildRealPaymentSelect = ({ includeReceipts = false, filterColumn = 'StudentFeeId' } = {}) => `
  SELECT
    p.FeePaymentId,
    p.StudentFeeId,
    p.PaymentDate,
    p.AmountPaid,
    p.PaymentMode,
    p.TransactionReference,
    p.Remarks,
    p.CreatedAt
    ${includeReceipts ? `,
    fr.FeeReceiptId,
    fr.ReceiptNumber,
    fr.ReceiptDate` : ''}
  FROM dbo.FeePayments p
  ${includeReceipts ? `
  LEFT JOIN dbo.FeeReceipts fr
    ON fr.FeePaymentId = p.FeePaymentId` : ''}
  WHERE p.${filterColumn} = @${filterColumn}
  ORDER BY p.PaymentDate DESC, p.FeePaymentId DESC;
`;

const getPaymentRowsForFeeIds = async (feeIds = [], { includeReceipts = false } = {}) => {
  const normalizedIds = [...new Set(
    feeIds
      .map((value) => parseNumericId(value))
      .filter(Boolean)
  )];

  if (!normalizedIds.length) {
    return [];
  }

  return executeQuery(
    `
      SELECT
        p.FeePaymentId,
        p.StudentFeeId,
        p.PaymentDate,
        p.AmountPaid,
        p.PaymentMode,
        p.TransactionReference,
        p.Remarks,
        p.CreatedAt
        ${includeReceipts ? `,
        fr.FeeReceiptId,
        fr.ReceiptNumber,
        fr.ReceiptDate` : ''}
      FROM dbo.FeePayments p
      ${includeReceipts ? `
      LEFT JOIN dbo.FeeReceipts fr
        ON fr.FeePaymentId = p.FeePaymentId` : ''}
      WHERE p.StudentFeeId IN (${normalizedIds.join(', ')})
      ORDER BY p.PaymentDate DESC, p.FeePaymentId DESC;
    `
  ).then((result) => result?.recordset || []);
};

const buildFeeStructureParams = ({ className, feeType, academicYear, amount, createdByMongoUserId, updatedAt }) => {
  const sql = getSqlClient();

  return [
    { name: 'ClassName', type: sql.NVarChar(100), value: toNullableString(className) },
    { name: 'FeeType', type: sql.NVarChar(50), value: toNullableString(feeType) || 'Tuition' },
    { name: 'AcademicYear', type: sql.NVarChar(20), value: toNullableString(academicYear) || '2024-2025' },
    { name: 'Amount', type: sql.Decimal(18, 2), value: toDecimal(amount) },
    { name: 'CreatedByMongoUserId', type: sql.NVarChar(64), value: createdByMongoUserId ? String(createdByMongoUserId) : null },
    { name: 'UpdatedAt', type: sql.DateTime2(0), value: normalizeDateTime(updatedAt) || new Date() },
  ];
};

const buildFeeSqlParams = (payload, { includeCreatedAt = true } = {}) => {
  const sql = getSqlClient();
  const params = [
    { name: 'MongoFeeId', type: sql.NVarChar(64), value: payload.mongoFeeId },
    { name: 'MongoStudentId', type: sql.NVarChar(64), value: payload.mongoStudentId },
    { name: 'AcademicYear', type: sql.NVarChar(20), value: payload.academicYear },
    { name: 'ClassName', type: sql.NVarChar(100), value: payload.className },
    { name: 'FeeType', type: sql.NVarChar(50), value: payload.feeType },
    { name: 'Amount', type: sql.Decimal(18, 2), value: toDecimal(payload.amount) },
    { name: 'PaidAmount', type: sql.Decimal(18, 2), value: toDecimal(payload.paidAmount) },
    { name: 'DueDate', type: sql.Date, value: payload.dueDate },
    { name: 'Status', type: sql.NVarChar(20), value: payload.status },
    { name: 'PaymentMode', type: sql.NVarChar(50), value: payload.paymentMode },
    { name: 'PaymentDate', type: sql.DateTime2(0), value: payload.paymentDate },
    { name: 'ReceiptNumber', type: sql.NVarChar(100), value: payload.receiptNumber },
    { name: 'TransactionId', type: sql.NVarChar(255), value: payload.transactionId },
    { name: 'LateFee', type: sql.Decimal(18, 2), value: toDecimal(payload.lateFee) },
    { name: 'Discount', type: sql.Decimal(18, 2), value: toDecimal(payload.discount) },
    { name: 'DiscountReason', type: sql.NVarChar(255), value: payload.discountReason },
    { name: 'Remarks', type: sql.NVarChar(1000), value: payload.remarks },
    { name: 'CreatedByMongoUserId', type: sql.NVarChar(64), value: payload.createdByMongoUserId },
    { name: 'UpdatedAt', type: sql.DateTime2(0), value: payload.updatedAt || new Date() },
  ];

  if (includeCreatedAt) {
    params.splice(params.length - 1, 0, {
      name: 'CreatedAt',
      type: sql.DateTime2(0),
      value: payload.createdAt || new Date(),
    });
  }

  return params;
};

const FEE_SCHEMA_BATCH = `
IF OBJECT_ID(N'${FEE_STRUCTURE_TABLE}', N'U') IS NULL
BEGIN
  CREATE TABLE ${FEE_STRUCTURE_TABLE} (
    SqlFeeStructureId INT IDENTITY(1,1) PRIMARY KEY,
    ClassName NVARCHAR(100) NOT NULL,
    FeeType NVARCHAR(50) NOT NULL,
    AcademicYear NVARCHAR(20) NOT NULL,
    Amount DECIMAL(18,2) NOT NULL CONSTRAINT DF_SqlFeeStructures_Amount DEFAULT (0),
    CreatedByMongoUserId NVARCHAR(64) NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_SqlFeeStructures_IsActive DEFAULT (1),
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlFeeStructures_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlFeeStructures_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SqlFeeStructures_ClassTypeYear' AND object_id = OBJECT_ID(N'${FEE_STRUCTURE_TABLE}'))
BEGIN
  CREATE UNIQUE INDEX UX_SqlFeeStructures_ClassTypeYear
  ON ${FEE_STRUCTURE_TABLE}(ClassName, FeeType, AcademicYear);
END;

IF OBJECT_ID(N'${STUDENT_FEE_TABLE}', N'U') IS NULL
BEGIN
  CREATE TABLE ${STUDENT_FEE_TABLE} (
    SqlStudentFeeId INT IDENTITY(1,1) PRIMARY KEY,
    MongoFeeId NVARCHAR(64) NOT NULL,
    MongoStudentId NVARCHAR(64) NOT NULL,
    AcademicYear NVARCHAR(20) NOT NULL,
    ClassName NVARCHAR(100) NOT NULL,
    FeeType NVARCHAR(50) NOT NULL,
    Amount DECIMAL(18,2) NOT NULL CONSTRAINT DF_SqlStudentFees_Amount DEFAULT (0),
    PaidAmount DECIMAL(18,2) NOT NULL CONSTRAINT DF_SqlStudentFees_PaidAmount DEFAULT (0),
    DueDate DATE NOT NULL,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_SqlStudentFees_Status DEFAULT (N'Pending'),
    PaymentMode NVARCHAR(50) NULL,
    PaymentDate DATETIME2(0) NULL,
    ReceiptNumber NVARCHAR(100) NULL,
    TransactionId NVARCHAR(255) NULL,
    LateFee DECIMAL(18,2) NOT NULL CONSTRAINT DF_SqlStudentFees_LateFee DEFAULT (0),
    Discount DECIMAL(18,2) NOT NULL CONSTRAINT DF_SqlStudentFees_Discount DEFAULT (0),
    DiscountReason NVARCHAR(255) NULL,
    Remarks NVARCHAR(1000) NULL,
    CreatedByMongoUserId NVARCHAR(64) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlStudentFees_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlStudentFees_UpdatedAt DEFAULT SYSUTCDATETIME()
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SqlStudentFees_MongoFeeId' AND object_id = OBJECT_ID(N'${STUDENT_FEE_TABLE}'))
BEGIN
  CREATE UNIQUE INDEX UX_SqlStudentFees_MongoFeeId ON ${STUDENT_FEE_TABLE}(MongoFeeId);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SqlStudentFees_ReceiptNumber' AND object_id = OBJECT_ID(N'${STUDENT_FEE_TABLE}'))
BEGIN
  CREATE UNIQUE INDEX UX_SqlStudentFees_ReceiptNumber
  ON ${STUDENT_FEE_TABLE}(ReceiptNumber)
  WHERE ReceiptNumber IS NOT NULL;
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SqlStudentFees_Student' AND object_id = OBJECT_ID(N'${STUDENT_FEE_TABLE}'))
BEGIN
  CREATE INDEX IX_SqlStudentFees_Student ON ${STUDENT_FEE_TABLE}(MongoStudentId, AcademicYear, UpdatedAt);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SqlStudentFees_ClassStatus' AND object_id = OBJECT_ID(N'${STUDENT_FEE_TABLE}'))
BEGIN
  CREATE INDEX IX_SqlStudentFees_ClassStatus ON ${STUDENT_FEE_TABLE}(ClassName, Status, DueDate);
END;

IF OBJECT_ID(N'${FEE_PAYMENT_TABLE}', N'U') IS NULL
BEGIN
  CREATE TABLE ${FEE_PAYMENT_TABLE} (
    SqlFeePaymentId INT IDENTITY(1,1) PRIMARY KEY,
    SqlStudentFeeId INT NOT NULL,
    MongoFeeId NVARCHAR(64) NOT NULL,
    Amount DECIMAL(18,2) NOT NULL,
    PaymentDate DATETIME2(0) NOT NULL,
    PaymentMode NVARCHAR(50) NOT NULL,
    TransactionId NVARCHAR(255) NULL,
    ReceiptNumber NVARCHAR(100) NOT NULL,
    Notes NVARCHAR(1000) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlFeePayments_CreatedAt DEFAULT SYSUTCDATETIME(),
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_SqlFeePayments_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_SqlFeePayments_StudentFee FOREIGN KEY (SqlStudentFeeId) REFERENCES ${STUDENT_FEE_TABLE}(SqlStudentFeeId) ON DELETE CASCADE
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UX_SqlFeePayments_ReceiptNumber' AND object_id = OBJECT_ID(N'${FEE_PAYMENT_TABLE}'))
BEGIN
  CREATE UNIQUE INDEX UX_SqlFeePayments_ReceiptNumber ON ${FEE_PAYMENT_TABLE}(ReceiptNumber);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_SqlFeePayments_MongoFeeId' AND object_id = OBJECT_ID(N'${FEE_PAYMENT_TABLE}'))
BEGIN
  CREATE INDEX IX_SqlFeePayments_MongoFeeId ON ${FEE_PAYMENT_TABLE}(MongoFeeId, PaymentDate);
END;
`;

const joinedFeeSelect = `
  SELECT TOP 1
    f.SqlStudentFeeId,
    f.MongoFeeId,
    f.MongoStudentId,
    f.AcademicYear,
    f.ClassName,
    f.FeeType,
    f.Amount,
    f.PaidAmount,
    f.DueDate,
    f.Status,
    f.PaymentMode,
    f.PaymentDate,
    f.ReceiptNumber,
    f.TransactionId,
    f.LateFee,
    f.Discount,
    f.DiscountReason,
    f.Remarks,
    f.CreatedByMongoUserId,
    f.CreatedAt,
    f.UpdatedAt,
    CAST(CASE
      WHEN (f.Amount + f.LateFee - f.Discount - f.PaidAmount) > 0
      THEN (f.Amount + f.LateFee - f.Discount - f.PaidAmount)
      ELSE 0
    END AS DECIMAL(18,2)) AS PendingAmount,
    s.FullName AS StudentFullName,
    s.RollNumber AS StudentRollNumber,
    s.Email AS StudentEmail,
    s.Phone AS StudentPhone,
    s.SectionName,
    s.GuardianName,
    s.GuardianPhone,
    u.FullName AS CreatedByFullName
  FROM ${STUDENT_FEE_TABLE} f
  LEFT JOIN dbo.SqlStudents s
    ON s.MongoStudentId = f.MongoStudentId
  LEFT JOIN dbo.SqlAuthUsers u
    ON u.MongoUserId = f.CreatedByMongoUserId
`;
const FEE_PROCEDURES_BATCH = `
CREATE OR ALTER PROCEDURE dbo.spFeeStructureUpsert
  @ClassName NVARCHAR(100),
  @FeeType NVARCHAR(50),
  @AcademicYear NVARCHAR(20),
  @Amount DECIMAL(18,2),
  @CreatedByMongoUserId NVARCHAR(64) = NULL,
  @UpdatedAt DATETIME2(0)
AS
BEGIN
  SET NOCOUNT ON;

  IF EXISTS (
    SELECT 1
    FROM ${FEE_STRUCTURE_TABLE}
    WHERE ClassName = @ClassName
      AND FeeType = @FeeType
      AND AcademicYear = @AcademicYear
  )
  BEGIN
    UPDATE ${FEE_STRUCTURE_TABLE}
    SET Amount = @Amount,
        CreatedByMongoUserId = COALESCE(@CreatedByMongoUserId, CreatedByMongoUserId),
        IsActive = 1,
        UpdatedAt = @UpdatedAt
    WHERE ClassName = @ClassName
      AND FeeType = @FeeType
      AND AcademicYear = @AcademicYear;
  END
  ELSE
  BEGIN
    INSERT INTO ${FEE_STRUCTURE_TABLE} (
      ClassName,
      FeeType,
      AcademicYear,
      Amount,
      CreatedByMongoUserId,
      IsActive,
      CreatedAt,
      UpdatedAt
    )
    VALUES (
      @ClassName,
      @FeeType,
      @AcademicYear,
      @Amount,
      @CreatedByMongoUserId,
      1,
      @UpdatedAt,
      @UpdatedAt
    );
  END;

  SELECT TOP 1 *
  FROM ${FEE_STRUCTURE_TABLE}
  WHERE ClassName = @ClassName
    AND FeeType = @FeeType
    AND AcademicYear = @AcademicYear;
END;

CREATE OR ALTER PROCEDURE dbo.spFeeUpsertMirror
  @MongoFeeId NVARCHAR(64),
  @MongoStudentId NVARCHAR(64),
  @AcademicYear NVARCHAR(20),
  @ClassName NVARCHAR(100),
  @FeeType NVARCHAR(50),
  @Amount DECIMAL(18,2),
  @PaidAmount DECIMAL(18,2),
  @DueDate DATE,
  @Status NVARCHAR(20),
  @PaymentMode NVARCHAR(50) = NULL,
  @PaymentDate DATETIME2(0) = NULL,
  @ReceiptNumber NVARCHAR(100) = NULL,
  @TransactionId NVARCHAR(255) = NULL,
  @LateFee DECIMAL(18,2),
  @Discount DECIMAL(18,2),
  @DiscountReason NVARCHAR(255) = NULL,
  @Remarks NVARCHAR(1000) = NULL,
  @CreatedByMongoUserId NVARCHAR(64) = NULL,
  @CreatedAt DATETIME2(0),
  @UpdatedAt DATETIME2(0)
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @EffectiveReceiptNumber NVARCHAR(100) = NULLIF(@ReceiptNumber, N'');
  IF @EffectiveReceiptNumber IS NULL
  BEGIN
    SET @EffectiveReceiptNumber = CONCAT(N'RCPT-', DATEDIFF_BIG(MILLISECOND, '1970-01-01', SYSUTCDATETIME()), N'-', ABS(CHECKSUM(NEWID())) % 100000);
  END;

  IF EXISTS (SELECT 1 FROM ${STUDENT_FEE_TABLE} WHERE MongoFeeId = @MongoFeeId)
  BEGIN
    UPDATE ${STUDENT_FEE_TABLE}
    SET MongoStudentId = @MongoStudentId,
        AcademicYear = @AcademicYear,
        ClassName = @ClassName,
        FeeType = @FeeType,
        Amount = @Amount,
        PaidAmount = @PaidAmount,
        DueDate = @DueDate,
        Status = @Status,
        PaymentMode = @PaymentMode,
        PaymentDate = @PaymentDate,
        ReceiptNumber = @EffectiveReceiptNumber,
        TransactionId = @TransactionId,
        LateFee = @LateFee,
        Discount = @Discount,
        DiscountReason = @DiscountReason,
        Remarks = @Remarks,
        CreatedByMongoUserId = @CreatedByMongoUserId,
        UpdatedAt = @UpdatedAt
    WHERE MongoFeeId = @MongoFeeId;
  END
  ELSE
  BEGIN
    INSERT INTO ${STUDENT_FEE_TABLE} (
      MongoFeeId,
      MongoStudentId,
      AcademicYear,
      ClassName,
      FeeType,
      Amount,
      PaidAmount,
      DueDate,
      Status,
      PaymentMode,
      PaymentDate,
      ReceiptNumber,
      TransactionId,
      LateFee,
      Discount,
      DiscountReason,
      Remarks,
      CreatedByMongoUserId,
      CreatedAt,
      UpdatedAt
    )
    VALUES (
      @MongoFeeId,
      @MongoStudentId,
      @AcademicYear,
      @ClassName,
      @FeeType,
      @Amount,
      @PaidAmount,
      @DueDate,
      @Status,
      @PaymentMode,
      @PaymentDate,
      @EffectiveReceiptNumber,
      @TransactionId,
      @LateFee,
      @Discount,
      @DiscountReason,
      @Remarks,
      @CreatedByMongoUserId,
      @CreatedAt,
      @UpdatedAt
    );
  END;

  ${joinedFeeSelect}
  WHERE f.MongoFeeId = @MongoFeeId;
END;

CREATE OR ALTER PROCEDURE dbo.spFeeList
  @Page INT = 1,
  @Limit INT = 10,
  @Search NVARCHAR(200) = NULL,
  @ClassName NVARCHAR(100) = NULL,
  @Status NVARCHAR(20) = NULL,
  @MongoStudentId NVARCHAR(64) = NULL,
  @AcademicYear NVARCHAR(20) = NULL
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @Offset INT = CASE WHEN ISNULL(@Page, 1) <= 1 THEN 0 ELSE (@Page - 1) * ISNULL(@Limit, 10) END;

  ;WITH Filtered AS (
    SELECT
      f.SqlStudentFeeId,
      f.MongoFeeId,
      f.MongoStudentId,
      f.AcademicYear,
      f.ClassName,
      f.FeeType,
      f.Amount,
      f.PaidAmount,
      f.DueDate,
      f.Status,
      f.PaymentMode,
      f.PaymentDate,
      f.ReceiptNumber,
      f.TransactionId,
      f.LateFee,
      f.Discount,
      f.DiscountReason,
      f.Remarks,
      f.CreatedByMongoUserId,
      f.CreatedAt,
      f.UpdatedAt,
      CAST(CASE
        WHEN (f.Amount + f.LateFee - f.Discount - f.PaidAmount) > 0
        THEN (f.Amount + f.LateFee - f.Discount - f.PaidAmount)
        ELSE 0
      END AS DECIMAL(18,2)) AS PendingAmount,
      s.FullName AS StudentFullName,
      s.RollNumber AS StudentRollNumber,
      s.Email AS StudentEmail,
      s.Phone AS StudentPhone,
      s.SectionName,
      s.GuardianName,
      s.GuardianPhone,
      u.FullName AS CreatedByFullName
    FROM ${STUDENT_FEE_TABLE} f
    LEFT JOIN dbo.SqlStudents s
      ON s.MongoStudentId = f.MongoStudentId
    LEFT JOIN dbo.SqlAuthUsers u
      ON u.MongoUserId = f.CreatedByMongoUserId
    WHERE (@Search IS NULL
      OR s.FullName LIKE N'%' + @Search + N'%'
      OR s.RollNumber LIKE N'%' + @Search + N'%'
      OR f.ReceiptNumber LIKE N'%' + @Search + N'%'
      OR f.FeeType LIKE N'%' + @Search + N'%')
      AND (@ClassName IS NULL OR f.ClassName = @ClassName)
      AND (@Status IS NULL OR f.Status = @Status)
      AND (@MongoStudentId IS NULL OR f.MongoStudentId = @MongoStudentId)
      AND (@AcademicYear IS NULL OR f.AcademicYear = @AcademicYear)
  )
  SELECT *,
         COUNT(1) OVER() AS TotalCount
  FROM Filtered
  ORDER BY CreatedAt DESC, UpdatedAt DESC
  OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY;
END;

CREATE OR ALTER PROCEDURE dbo.spFeeGetById
  @MongoFeeId NVARCHAR(64)
AS
BEGIN
  SET NOCOUNT ON;

  ${joinedFeeSelect}
  WHERE f.MongoFeeId = @MongoFeeId;

  SELECT
    MongoFeeId,
    Amount,
    PaymentDate,
    PaymentMode,
    TransactionId,
    ReceiptNumber,
    Notes,
    CreatedAt,
    UpdatedAt
  FROM ${FEE_PAYMENT_TABLE}
  WHERE MongoFeeId = @MongoFeeId
  ORDER BY PaymentDate DESC, CreatedAt DESC;
END;

CREATE OR ALTER PROCEDURE dbo.spFeeGetByStudent
  @MongoStudentId NVARCHAR(64)
AS
BEGIN
  SET NOCOUNT ON;

  ${joinedFeeSelect}
  WHERE f.MongoStudentId = @MongoStudentId
  ORDER BY f.CreatedAt DESC, f.UpdatedAt DESC;

  SELECT
    p.MongoFeeId,
    p.Amount,
    p.PaymentDate,
    p.PaymentMode,
    p.TransactionId,
    p.ReceiptNumber,
    p.Notes,
    p.CreatedAt,
    p.UpdatedAt
  FROM ${FEE_PAYMENT_TABLE} p
  INNER JOIN ${STUDENT_FEE_TABLE} f
    ON f.SqlStudentFeeId = p.SqlStudentFeeId
  WHERE f.MongoStudentId = @MongoStudentId
  ORDER BY p.PaymentDate DESC, p.CreatedAt DESC;
END;

CREATE OR ALTER PROCEDURE dbo.spFeeCreate
  @MongoFeeId NVARCHAR(64),
  @MongoStudentId NVARCHAR(64),
  @AcademicYear NVARCHAR(20),
  @ClassName NVARCHAR(100),
  @FeeType NVARCHAR(50),
  @Amount DECIMAL(18,2),
  @PaidAmount DECIMAL(18,2),
  @DueDate DATE,
  @Status NVARCHAR(20),
  @PaymentMode NVARCHAR(50) = NULL,
  @PaymentDate DATETIME2(0) = NULL,
  @ReceiptNumber NVARCHAR(100) = NULL,
  @TransactionId NVARCHAR(255) = NULL,
  @LateFee DECIMAL(18,2),
  @Discount DECIMAL(18,2),
  @DiscountReason NVARCHAR(255) = NULL,
  @Remarks NVARCHAR(1000) = NULL,
  @CreatedByMongoUserId NVARCHAR(64) = NULL,
  @CreatedAt DATETIME2(0),
  @UpdatedAt DATETIME2(0)
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @EffectiveReceiptNumber NVARCHAR(100) = NULLIF(@ReceiptNumber, N'');

  IF @EffectiveReceiptNumber IS NULL
  BEGIN
    SET @EffectiveReceiptNumber = CONCAT(N'RCPT-', DATEDIFF_BIG(MILLISECOND, '1970-01-01', SYSUTCDATETIME()), N'-', ABS(CHECKSUM(NEWID())) % 100000);
  END;

  INSERT INTO ${STUDENT_FEE_TABLE} (
    MongoFeeId,
    MongoStudentId,
    AcademicYear,
    ClassName,
    FeeType,
    Amount,
    PaidAmount,
    DueDate,
    Status,
    PaymentMode,
    PaymentDate,
    ReceiptNumber,
    TransactionId,
    LateFee,
    Discount,
    DiscountReason,
    Remarks,
    CreatedByMongoUserId,
    CreatedAt,
    UpdatedAt
  )
  VALUES (
    @MongoFeeId,
    @MongoStudentId,
    @AcademicYear,
    @ClassName,
    @FeeType,
    @Amount,
    @PaidAmount,
    @DueDate,
    @Status,
    @PaymentMode,
    @PaymentDate,
    @EffectiveReceiptNumber,
    @TransactionId,
    @LateFee,
    @Discount,
    @DiscountReason,
    @Remarks,
    @CreatedByMongoUserId,
    @CreatedAt,
    @UpdatedAt
  );

  ${joinedFeeSelect}
  WHERE f.MongoFeeId = @MongoFeeId;
END;

CREATE OR ALTER PROCEDURE dbo.spFeeUpdate
  @MongoFeeId NVARCHAR(64),
  @MongoStudentId NVARCHAR(64),
  @AcademicYear NVARCHAR(20),
  @ClassName NVARCHAR(100),
  @FeeType NVARCHAR(50),
  @Amount DECIMAL(18,2),
  @PaidAmount DECIMAL(18,2),
  @DueDate DATE,
  @Status NVARCHAR(20),
  @PaymentMode NVARCHAR(50) = NULL,
  @PaymentDate DATETIME2(0) = NULL,
  @ReceiptNumber NVARCHAR(100) = NULL,
  @TransactionId NVARCHAR(255) = NULL,
  @LateFee DECIMAL(18,2),
  @Discount DECIMAL(18,2),
  @DiscountReason NVARCHAR(255) = NULL,
  @Remarks NVARCHAR(1000) = NULL,
  @CreatedByMongoUserId NVARCHAR(64) = NULL,
  @UpdatedAt DATETIME2(0)
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @EffectiveReceiptNumber NVARCHAR(100) = NULLIF(@ReceiptNumber, N'');
  IF @EffectiveReceiptNumber IS NULL
  BEGIN
    SELECT TOP 1 @EffectiveReceiptNumber = ReceiptNumber
    FROM ${STUDENT_FEE_TABLE}
    WHERE MongoFeeId = @MongoFeeId;
  END;

  UPDATE ${STUDENT_FEE_TABLE}
  SET MongoStudentId = @MongoStudentId,
      AcademicYear = @AcademicYear,
      ClassName = @ClassName,
      FeeType = @FeeType,
      Amount = @Amount,
      PaidAmount = @PaidAmount,
      DueDate = @DueDate,
      Status = @Status,
      PaymentMode = @PaymentMode,
      PaymentDate = @PaymentDate,
      ReceiptNumber = @EffectiveReceiptNumber,
      TransactionId = @TransactionId,
      LateFee = @LateFee,
      Discount = @Discount,
      DiscountReason = @DiscountReason,
      Remarks = @Remarks,
      CreatedByMongoUserId = @CreatedByMongoUserId,
      UpdatedAt = @UpdatedAt
  WHERE MongoFeeId = @MongoFeeId;

  ${joinedFeeSelect}
  WHERE f.MongoFeeId = @MongoFeeId;
END;

CREATE OR ALTER PROCEDURE dbo.spFeeAddPayment
  @MongoFeeId NVARCHAR(64),
  @Amount DECIMAL(18,2),
  @PaymentDate DATETIME2(0),
  @PaymentMode NVARCHAR(50),
  @TransactionId NVARCHAR(255) = NULL,
  @ReceiptNumber NVARCHAR(100) = NULL,
  @Notes NVARCHAR(1000) = NULL,
  @UpdatedAt DATETIME2(0)
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @SqlStudentFeeId INT;
  DECLARE @EffectiveReceiptNumber NVARCHAR(100) = NULLIF(@ReceiptNumber, N'');

  IF @Amount <= 0
  BEGIN
    SELECT N'invalid_amount' AS ResultCode;
    RETURN;
  END;

  SELECT TOP 1 @SqlStudentFeeId = SqlStudentFeeId
  FROM ${STUDENT_FEE_TABLE}
  WHERE MongoFeeId = @MongoFeeId;

  IF @SqlStudentFeeId IS NULL
  BEGIN
    SELECT N'not_found' AS ResultCode;
    RETURN;
  END;

  IF @EffectiveReceiptNumber IS NULL
  BEGIN
    SET @EffectiveReceiptNumber = CONCAT(N'RCPT-', DATEDIFF_BIG(MILLISECOND, '1970-01-01', SYSUTCDATETIME()), N'-', ABS(CHECKSUM(NEWID())) % 100000);
  END;

  INSERT INTO ${FEE_PAYMENT_TABLE} (
    SqlStudentFeeId,
    MongoFeeId,
    Amount,
    PaymentDate,
    PaymentMode,
    TransactionId,
    ReceiptNumber,
    Notes,
    CreatedAt,
    UpdatedAt
  )
  VALUES (
    @SqlStudentFeeId,
    @MongoFeeId,
    @Amount,
    @PaymentDate,
    @PaymentMode,
    @TransactionId,
    @EffectiveReceiptNumber,
    @Notes,
    @UpdatedAt,
    @UpdatedAt
  );

  UPDATE ${STUDENT_FEE_TABLE}
  SET PaidAmount = PaidAmount + @Amount,
      PaymentMode = @PaymentMode,
      PaymentDate = @PaymentDate,
      TransactionId = @TransactionId,
      ReceiptNumber = @EffectiveReceiptNumber,
      Status = CASE
        WHEN (Amount + LateFee - Discount) - (PaidAmount + @Amount) <= 0 THEN N'Paid'
        WHEN (PaidAmount + @Amount) > 0 THEN N'Partial'
        ELSE Status
      END,
      UpdatedAt = @UpdatedAt
  WHERE MongoFeeId = @MongoFeeId;

  SELECT TOP 1
    N'ok' AS ResultCode,
    f.SqlStudentFeeId,
    f.MongoFeeId,
    f.MongoStudentId,
    f.AcademicYear,
    f.ClassName,
    f.FeeType,
    f.Amount,
    f.PaidAmount,
    f.DueDate,
    f.Status,
    f.PaymentMode,
    f.PaymentDate,
    f.ReceiptNumber,
    f.TransactionId,
    f.LateFee,
    f.Discount,
    f.DiscountReason,
    f.Remarks,
    f.CreatedByMongoUserId,
    f.CreatedAt,
    f.UpdatedAt,
    CAST(CASE
      WHEN (f.Amount + f.LateFee - f.Discount - f.PaidAmount) > 0
      THEN (f.Amount + f.LateFee - f.Discount - f.PaidAmount)
      ELSE 0
    END AS DECIMAL(18,2)) AS PendingAmount,
    s.FullName AS StudentFullName,
    s.RollNumber AS StudentRollNumber,
    s.Email AS StudentEmail,
    s.Phone AS StudentPhone,
    s.SectionName,
    s.GuardianName,
    s.GuardianPhone,
    u.FullName AS CreatedByFullName
  FROM ${STUDENT_FEE_TABLE} f
  LEFT JOIN dbo.SqlStudents s
    ON s.MongoStudentId = f.MongoStudentId
  LEFT JOIN dbo.SqlAuthUsers u
    ON u.MongoUserId = f.CreatedByMongoUserId
  WHERE f.MongoFeeId = @MongoFeeId;

  SELECT TOP 1
    MongoFeeId,
    Amount,
    PaymentDate,
    PaymentMode,
    TransactionId,
    ReceiptNumber,
    Notes,
    CreatedAt,
    UpdatedAt
  FROM ${FEE_PAYMENT_TABLE}
  WHERE MongoFeeId = @MongoFeeId
    AND ReceiptNumber = @EffectiveReceiptNumber
  ORDER BY SqlFeePaymentId DESC;
END;

CREATE OR ALTER PROCEDURE dbo.spFeeDelete
  @MongoFeeId NVARCHAR(64)
AS
BEGIN
  SET NOCOUNT ON;

  IF NOT EXISTS (SELECT 1 FROM ${STUDENT_FEE_TABLE} WHERE MongoFeeId = @MongoFeeId)
  BEGIN
    SELECT N'not_found' AS ResultCode;
    RETURN;
  END;

  IF EXISTS (
    SELECT 1
    FROM ${STUDENT_FEE_TABLE}
    WHERE MongoFeeId = @MongoFeeId
      AND PaidAmount > 0
  ) OR EXISTS (
    SELECT 1
    FROM ${FEE_PAYMENT_TABLE}
    WHERE MongoFeeId = @MongoFeeId
  )
  BEGIN
    SELECT N'has_payments' AS ResultCode;
    RETURN;
  END;

  DELETE FROM ${STUDENT_FEE_TABLE}
  WHERE MongoFeeId = @MongoFeeId;

  SELECT N'ok' AS ResultCode;
END;

CREATE OR ALTER PROCEDURE dbo.spFeeStats
  @AcademicYear NVARCHAR(20) = NULL
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    CAST(ISNULL(SUM(f.Amount), 0) AS DECIMAL(18,2)) AS TotalFees,
    CAST(ISNULL(SUM(f.PaidAmount), 0) AS DECIMAL(18,2)) AS CollectedFees,
    CAST(ISNULL(SUM(f.Amount), 0) - ISNULL(SUM(f.PaidAmount), 0) AS DECIMAL(18,2)) AS PendingFees,
    SUM(CASE
      WHEN f.Status IN (N'Pending', N'Partial')
       AND f.DueDate < CAST(SYSUTCDATETIME() AS DATE)
      THEN 1
      ELSE 0
    END) AS OverdueCount
  FROM ${STUDENT_FEE_TABLE} f
  WHERE (@AcademicYear IS NULL OR f.AcademicYear = @AcademicYear);

  SELECT
    f.Status AS _id,
    CAST(ISNULL(SUM(f.Amount), 0) AS DECIMAL(18,2)) AS total,
    CAST(ISNULL(SUM(f.PaidAmount), 0) AS DECIMAL(18,2)) AS paid,
    COUNT(1) AS count
  FROM ${STUDENT_FEE_TABLE} f
  WHERE (@AcademicYear IS NULL OR f.AcademicYear = @AcademicYear)
  GROUP BY f.Status;

  SELECT
    f.ClassName AS className,
    f.FeeType AS feeType,
    COUNT(1) AS recordCount,
    SUM(CASE
      WHEN (f.Amount + f.LateFee - f.Discount - f.PaidAmount) > 0 THEN 1
      ELSE 0
    END) AS dueCount,
    SUM(CASE
      WHEN (f.Amount + f.LateFee - f.Discount - f.PaidAmount) > 0
       AND f.DueDate < CAST(SYSUTCDATETIME() AS DATE)
      THEN 1
      ELSE 0
    END) AS overdueCount,
    CAST(SUM(CASE
      WHEN (f.Amount + f.LateFee - f.Discount - f.PaidAmount) > 0
      THEN (f.Amount + f.LateFee - f.Discount - f.PaidAmount)
      ELSE 0
    END) AS DECIMAL(18,2)) AS dueAmount,
    CAST(SUM(CASE
      WHEN (f.Amount + f.LateFee - f.Discount - f.PaidAmount) > 0
       AND f.DueDate < CAST(SYSUTCDATETIME() AS DATE)
      THEN (f.Amount + f.LateFee - f.Discount - f.PaidAmount)
      ELSE 0
    END) AS DECIMAL(18,2)) AS overdueAmount
  FROM ${STUDENT_FEE_TABLE} f
  WHERE (@AcademicYear IS NULL OR f.AcademicYear = @AcademicYear)
  GROUP BY f.ClassName, f.FeeType
  ORDER BY f.ClassName ASC, f.FeeType ASC;

  SELECT
    CONVERT(VARCHAR(10), p.PaymentDate, 23) AS collectionDate,
    p.PaymentMode AS paymentMode,
    COUNT(1) AS paymentCount,
    CAST(ISNULL(SUM(p.Amount), 0) AS DECIMAL(18,2)) AS totalCollected
  FROM ${FEE_PAYMENT_TABLE} p
  INNER JOIN ${STUDENT_FEE_TABLE} f
    ON f.SqlStudentFeeId = p.SqlStudentFeeId
  WHERE (@AcademicYear IS NULL OR f.AcademicYear = @AcademicYear)
  GROUP BY CONVERT(VARCHAR(10), p.PaymentDate, 23), p.PaymentMode
  ORDER BY collectionDate DESC, paymentMode ASC;

  SELECT
    SqlFeeStructureId,
    ClassName,
    FeeType,
    AcademicYear,
    Amount,
    IsActive,
    CreatedAt,
    UpdatedAt
  FROM ${FEE_STRUCTURE_TABLE}
  WHERE IsActive = 1
    AND (@AcademicYear IS NULL OR AcademicYear = @AcademicYear)
  ORDER BY ClassName ASC, FeeType ASC;
END;
`;

const FEE_PROCEDURE_BATCHES = FEE_PROCEDURES_BATCH
  .split(/\n(?=CREATE OR ALTER PROCEDURE )/g)
  .map((statement) => statement.trim())
  .filter(Boolean);
const ensureFeeSqlReady = async () => {
  if (!feeBootstrapPromise) {
    feeBootstrapPromise = (async () => {
      await ensureAuthSqlReady();
      await ensureStudentSqlReady();
      const pool = await getPool();
      await pool.request().batch(FEE_SCHEMA_BATCH);
      for (const batch of FEE_PROCEDURE_BATCHES) {
        await pool.request().batch(batch);
      }
      return true;
    })().catch((error) => {
      feeBootstrapPromise = null;
      throw error;
    });
  }

  return feeBootstrapPromise;
};

const runStoredProcedure = async (procedureName, params, tx = null) => {
  if (tx?.executeStoredProcedure) {
    return tx.executeStoredProcedure(procedureName, params);
  }
  return executeStoredProcedure(procedureName, params);
};

const runQuery = async (statement, params, tx = null) => {
  if (tx?.query) {
    return tx.query(statement, params);
  }
  return executeQuery(statement, params);
};

const replaceSqlPaymentsForFee = async (mongoFeeId, payments = [], tx = null) => {
  const sql = getSqlClient();
  const feeId = String(mongoFeeId);

  await runQuery(
    `DELETE FROM ${FEE_PAYMENT_TABLE} WHERE MongoFeeId = @MongoFeeId`,
    [{ name: 'MongoFeeId', type: sql.NVarChar(64), value: feeId }],
    tx
  );

  for (const payment of payments) {
    await runQuery(
      `
        INSERT INTO ${FEE_PAYMENT_TABLE} (
          SqlStudentFeeId,
          MongoFeeId,
          Amount,
          PaymentDate,
          PaymentMode,
          TransactionId,
          ReceiptNumber,
          Notes,
          CreatedAt,
          UpdatedAt
        )
        SELECT
          SqlStudentFeeId,
          @MongoFeeId,
          @Amount,
          @PaymentDate,
          @PaymentMode,
          @TransactionId,
          @ReceiptNumber,
          @Notes,
          @CreatedAt,
          @UpdatedAt
        FROM ${STUDENT_FEE_TABLE}
        WHERE MongoFeeId = @MongoFeeId
      `,
      [
        { name: 'MongoFeeId', type: sql.NVarChar(64), value: feeId },
        { name: 'Amount', type: sql.Decimal(18, 2), value: toDecimal(payment.amount) },
        { name: 'PaymentDate', type: sql.DateTime2(0), value: normalizeDateTime(payment.date) || new Date() },
        {
          name: 'PaymentMode',
          type: sql.NVarChar(50),
          value: VALID_PAYMENT_MODES.has(payment.mode) ? payment.mode : 'Cash',
        },
        { name: 'TransactionId', type: sql.NVarChar(255), value: toNullableString(payment.transactionId) },
        { name: 'ReceiptNumber', type: sql.NVarChar(100), value: toNullableString(payment.receiptNumber) || createReceiptNumber() },
        { name: 'Notes', type: sql.NVarChar(1000), value: toNullableString(payment.notes) },
        { name: 'CreatedAt', type: sql.DateTime2(0), value: normalizeDateTime(payment.date) || new Date() },
        { name: 'UpdatedAt', type: sql.DateTime2(0), value: normalizeDateTime(payment.date) || new Date() },
      ],
      tx
    );
  }
};

const syncMongoFeeSnapshot = async (feeRecord) => {
  return feeRecord || null;
};

const syncMongoFeeSnapshots = async (feeRecords = []) => {
  return feeRecords;
};

const deleteMongoFeeSnapshot = async (feeId) => {
  return feeId;
};

const upsertFeeStructure = async ({ className, feeType, academicYear, amount, createdByMongoUserId, updatedAt }, tx = null) => {
  const result = await runStoredProcedure(
    'dbo.spFeeStructureUpsert',
    buildFeeStructureParams({
      className,
      feeType,
      academicYear,
      amount,
      createdByMongoUserId,
      updatedAt,
    }),
    tx
  );

  return mapFeeStructureRow(result?.recordset?.[0]);
};

const syncFeeMirror = async (feeDocument) => {
  if (!feeDocument) {
    return null;
  }

  await ensureFeeSqlReady();

  const fee = feeDocument.toObject ? feeDocument.toObject() : feeDocument;
  const payload = toSqlFeePayload(fee);
  await upsertFeeStructure(payload);

  const result = await executeStoredProcedure('dbo.spFeeUpsertMirror', buildFeeSqlParams(payload));
  await replaceSqlPaymentsForFee(payload.mongoFeeId, fee.payments || []);

  const feeRow = result?.recordset?.[0];
  return mapFeeRow(feeRow, (fee.payments || []).map((payment) => mapPaymentRow({
    Amount: payment.amount,
    PaymentDate: payment.date,
    PaymentMode: payment.mode,
    TransactionId: payment.transactionId,
    ReceiptNumber: payment.receiptNumber,
    Notes: payment.notes,
  })));
};

const pruneDeletedFeesFromMirror = async (feeIds) => {
  if (!feeIds.length) {
    await executeQuery(`DELETE FROM ${FEE_PAYMENT_TABLE}`);
    await executeQuery(`DELETE FROM ${STUDENT_FEE_TABLE}`);
    return;
  }

  const safeIds = feeIds
    .map((id) => escapeSqlLiteral(id))
    .filter(Boolean)
    .map((id) => `N'${id}'`)
    .join(', ');

  await executeQuery(`DELETE FROM ${FEE_PAYMENT_TABLE} WHERE MongoFeeId NOT IN (${safeIds})`);
  await executeQuery(`DELETE FROM ${STUDENT_FEE_TABLE} WHERE MongoFeeId NOT IN (${safeIds})`);
};

const syncAllFeesToSql = async ({ force = false } = {}) => {
  await ensureFeeSqlReady();
  return null;
};

const syncFeeById = async (feeId) => {
  if (!feeId) {
    return null;
  }
  return null;
};

const getFeeList = async ({
  page = 1,
  limit = 10,
  search = null,
  className = null,
  status = null,
  studentId = null,
  academicYear = null,
}) => {
  await ensureFeeSqlReady();
  await syncAllFeesToSql();

  const includeReceipts = await hasFeeReceiptStore();
  const safePage = Number(page) || 1;
  const safeLimit = Number(limit) || 10;
  const offset = Math.max(safePage - 1, 0) * safeLimit;
  const filter = buildFeeReadFilters({
    search,
    className,
    studentId,
    academicYear,
  });
  const result = await executeQuery(`
    ${buildFeeBaseSelect()}
    ${filter.whereClause}
    ORDER BY sf.DueDate DESC, sf.StudentFeeId DESC;
  `, filter.params);

  const allRows = result?.recordset || [];
  const filteredRows = status
    ? allRows.filter((row) => getFeeSnapshotFromRow(row).status === status)
    : allRows;
  const rows = filteredRows.slice(offset, offset + safeLimit);
  const total = filteredRows.length;
  const paymentRows = await getPaymentRowsForFeeIds(
    rows.map((row) => row.StudentFeeId),
    { includeReceipts }
  );

  return {
    fees: hydrateFeeRowsWithPayments(rows, paymentRows),
    total,
    page: Number(page) || 1,
    limit: Number(limit) || 10,
  };
};

const getFeeRecordById = async (feeId) => {
  await ensureFeeSqlReady();
  const sql = getSqlClient();
  const feeSqlId = parseNumericId(feeId);
  if (!feeSqlId) {
    return null;
  }
  const includeReceipts = await hasFeeReceiptStore();
  const filter = buildFeeReadFilters({ feeId: feeSqlId });
  const feeResult = await executeQuery(`
    ${buildFeeBaseSelect()}
    ${filter.whereClause};
  `, filter.params);
  const paymentResult = await executeQuery(buildRealPaymentSelect({
    includeReceipts,
    filterColumn: 'StudentFeeId',
  }), [
    { name: 'StudentFeeId', type: sql.Int, value: feeSqlId },
  ]);

  return mapFeeRow(feeResult?.recordset?.[0], (paymentResult?.recordset || []).map(mapPaymentRow));
};

const getFeesForStudent = async (studentId) => {
  await ensureFeeSqlReady();
  await syncAllFeesToSql();
  const sql = getSqlClient();
  const studentSqlId = parseNumericId(studentId);
  if (!studentSqlId) {
    return [];
  }
  const includeReceipts = await hasFeeReceiptStore();
  const filter = buildFeeReadFilters({ studentId: studentSqlId });
  const feeResult = await executeQuery(`
    ${buildFeeBaseSelect()}
    ${filter.whereClause}
    ORDER BY sf.DueDate DESC, sf.StudentFeeId DESC;
  `, filter.params);
  const paymentResult = await executeQuery(buildRealPaymentSelect({
    includeReceipts,
    filterColumn: 'StudentId',
  }), [
    { name: 'StudentId', type: sql.Int, value: studentSqlId },
  ]);

  return hydrateFeeRowsWithPayments(feeResult?.recordset || [], paymentResult?.recordset || []);
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
  const classCandidates = [...new Set([
    normalizedClassName,
    normalizedClassName.replace(/^class\s+/i, '').trim(),
    /^\d+$/.test(normalizedClassName) ? `Class ${normalizedClassName}` : null,
  ].filter(Boolean))];

  for (const candidate of classCandidates) {
    const result = await runner(
      `SELECT TOP 1 ClassId
       FROM dbo.Classes
       WHERE ClassName = @ClassName
         AND ISNULL(IsActive, 1) = 1`,
      [{ name: 'ClassName', type: sql.NVarChar(100), value: candidate }]
    );

    const classId = parseNumericId(result?.recordset?.[0]?.ClassId);
    if (classId) {
      return classId;
    }
  }

  return null;
};

const ensurePrimaryFeeStructure = async ({ className, feeType, academicYear, amount, dueDate }, tx = null) => {
  const sql = getSqlClient();
  const runner = tx?.query || executeQuery;
  const classId = await resolveClassIdByName(className, tx);
  const academicYearId = await resolveAcademicYearId(academicYear, tx);

  if (!classId || !academicYearId) {
    throw createFeeValidationError('Unable to resolve the SQL class or academic year for this fee record.');
  }

  const normalizedDueDate = normalizeDateOnly(dueDate);
  const dueMonth = normalizedDueDate ? normalizedDueDate.getUTCMonth() + 1 : null;
  const existingStructure = await runner(
    `SELECT TOP 1 FeeStructureId
     FROM dbo.FeeStructures
     WHERE ClassId = @ClassId
       AND AcademicYearId = @AcademicYearId
       AND FeeType = @FeeType
     ORDER BY FeeStructureId DESC`,
    [
      { name: 'ClassId', type: sql.Int, value: classId },
      { name: 'AcademicYearId', type: sql.Int, value: academicYearId },
      { name: 'FeeType', type: sql.NVarChar(100), value: feeType },
    ]
  );

  const feeStructureId = parseNumericId(existingStructure?.recordset?.[0]?.FeeStructureId);
  if (feeStructureId) {
    await runner(
      `UPDATE dbo.FeeStructures
       SET Amount = @Amount,
           DueMonth = @DueMonth,
           DueDate = @DueDate,
           UpdatedAt = SYSUTCDATETIME()
       WHERE FeeStructureId = @FeeStructureId`,
      [
        { name: 'FeeStructureId', type: sql.Int, value: feeStructureId },
        { name: 'Amount', type: sql.Decimal(18, 2), value: toDecimal(amount) },
        { name: 'DueMonth', type: sql.Int, value: dueMonth },
        { name: 'DueDate', type: sql.Date, value: normalizedDueDate },
      ]
    );

    return { feeStructureId, classId, academicYearId };
  }

  const createdStructure = await runner(
    `INSERT INTO dbo.FeeStructures (
       AcademicYearId,
       ClassId,
       FeeType,
       Amount,
       DueMonth,
       DueDate,
       Description,
       IsRecurring,
       CreatedAt,
       UpdatedAt
     )
     OUTPUT INSERTED.FeeStructureId
     VALUES (
       @AcademicYearId,
       @ClassId,
       @FeeType,
       @Amount,
       @DueMonth,
       @DueDate,
       NULL,
       0,
       SYSUTCDATETIME(),
       SYSUTCDATETIME()
     )`,
    [
      { name: 'AcademicYearId', type: sql.Int, value: academicYearId },
      { name: 'ClassId', type: sql.Int, value: classId },
      { name: 'FeeType', type: sql.NVarChar(100), value: feeType },
      { name: 'Amount', type: sql.Decimal(18, 2), value: toDecimal(amount) },
      { name: 'DueMonth', type: sql.Int, value: dueMonth },
      { name: 'DueDate', type: sql.Date, value: normalizedDueDate },
    ]
  );

  return {
    feeStructureId: parseNumericId(createdStructure?.recordset?.[0]?.FeeStructureId),
    classId,
    academicYearId,
  };
};

const buildCreateOrUpdatePayload = async (input, { createdByUserId = null, existingFee = null } = {}) => {
  const studentLookupId = parseNumericId(
    input.studentId ?? existingFee?.studentId?._id ?? existingFee?.studentId ?? null
  );
  const student = studentLookupId ? await getStudentById(studentLookupId) : null;

  if (!student) {
    return null;
  }

  const studentSqlId = parseNumericId(student._id || student.id || student.studentId);
  const amount = toDecimal(input.amount ?? existingFee?.amount, NaN);
  const discount = toDecimal(input.discount ?? existingFee?.discount, 0);
  const lateFee = toDecimal(input.lateFee ?? existingFee?.lateFee, 0);
  const paidAmount = toDecimal(input.paidAmount ?? existingFee?.paidAmount, 0);
  const dueDate = normalizeDateOnly(input.dueDate ?? existingFee?.dueDate);
  const feeTypeCandidate = input.feeType ?? existingFee?.feeType;
  const feeType = VALID_FEE_TYPES.has(feeTypeCandidate) ? feeTypeCandidate : 'Tuition';
  const className = toNullableString(input.class ?? input.className ?? existingFee?.class ?? student.class);
  const academicYear = toNullableString(input.academicYear ?? existingFee?.academicYear ?? student.academicYear);
  const status = resolveFeeStatus({
    amount,
    lateFee,
    discount,
    paidAmount,
    dueDate,
    paymentDate: existingFee?.paymentDate ?? null,
    status: input.status ?? existingFee?.status ?? 'Pending',
  });

  if (!studentSqlId || !className || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('Please provide valid fee details.');
  }

  return {
    studentSqlId,
    className,
    academicYear,
    feeType,
    amount,
    discount,
    lateFee,
    paidAmount,
    dueDate,
    status,
    createdByUserId: parseNumericId(createdByUserId),
  };
};

const createFeeRecord = async (input, createdByUserId) => {
  await ensureFeeSqlReady();
  const payload = await buildCreateOrUpdatePayload(input, { createdByUserId });

  if (!payload) {
    return null;
  }

  const createdFeeId = await executeInTransaction(async (tx) => {
    const sql = getSqlClient();
    const { feeStructureId } = await ensurePrimaryFeeStructure(payload, tx);
    const inserted = await tx.query(
      `INSERT INTO dbo.StudentFees (
         StudentId,
         FeeStructureId,
         TotalAmount,
         DiscountAmount,
         FineAmount,
         PaidAmount,
         Status,
         DueDate,
         CreatedAt,
         UpdatedAt
       )
       OUTPUT INSERTED.StudentFeeId
       VALUES (
         @StudentId,
         @FeeStructureId,
         @TotalAmount,
         @DiscountAmount,
         @FineAmount,
         @PaidAmount,
         @Status,
         @DueDate,
         SYSUTCDATETIME(),
         SYSUTCDATETIME()
       )`,
      [
        { name: 'StudentId', type: sql.Int, value: payload.studentSqlId },
        { name: 'FeeStructureId', type: sql.Int, value: feeStructureId },
        { name: 'TotalAmount', type: sql.Decimal(18, 2), value: payload.amount },
        { name: 'DiscountAmount', type: sql.Decimal(18, 2), value: payload.discount },
        { name: 'FineAmount', type: sql.Decimal(18, 2), value: payload.lateFee },
        { name: 'PaidAmount', type: sql.Decimal(18, 2), value: payload.paidAmount },
        { name: 'Status', type: sql.NVarChar(50), value: payload.status },
        { name: 'DueDate', type: sql.Date, value: payload.dueDate },
      ]
    );

    return parseNumericId(inserted?.recordset?.[0]?.StudentFeeId);
  });

  return getFeeRecordById(createdFeeId);
};

const updateFeeRecord = async (feeId, input) => {
  await ensureFeeSqlReady();
  const existingFee = await getFeeRecordById(feeId);

  if (!existingFee) {
    return null;
  }

  const payload = await buildCreateOrUpdatePayload(input, { existingFee });
  if (!payload) {
    return null;
  }

  const feeSqlId = parseNumericId(feeId);
  const updatedFeeId = await executeInTransaction(async (tx) => {
    const sql = getSqlClient();
    const { feeStructureId } = await ensurePrimaryFeeStructure(payload, tx);
    await tx.query(
      `UPDATE dbo.StudentFees
       SET StudentId = @StudentId,
           FeeStructureId = @FeeStructureId,
           TotalAmount = @TotalAmount,
           DiscountAmount = @DiscountAmount,
           FineAmount = @FineAmount,
           PaidAmount = @PaidAmount,
           Status = @Status,
           DueDate = @DueDate,
           UpdatedAt = SYSUTCDATETIME()
       WHERE StudentFeeId = @StudentFeeId`,
      [
        { name: 'StudentFeeId', type: sql.Int, value: feeSqlId },
        { name: 'StudentId', type: sql.Int, value: payload.studentSqlId },
        { name: 'FeeStructureId', type: sql.Int, value: feeStructureId },
        { name: 'TotalAmount', type: sql.Decimal(18, 2), value: payload.amount },
        { name: 'DiscountAmount', type: sql.Decimal(18, 2), value: payload.discount },
        { name: 'FineAmount', type: sql.Decimal(18, 2), value: payload.lateFee },
        { name: 'PaidAmount', type: sql.Decimal(18, 2), value: payload.paidAmount },
        { name: 'Status', type: sql.NVarChar(50), value: payload.status },
        { name: 'DueDate', type: sql.Date, value: payload.dueDate },
      ]
    );

    return feeSqlId;
  });

  return getFeeRecordById(updatedFeeId);
};

const collectFeePaymentRecord = async (feeId, paymentInput) => {
  await ensureFeeSqlReady();
  const paymentAmount = toDecimal(paymentInput.amount, NaN);
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    return { resultCode: 'invalid_amount' };
  }

  const fullFee = await getFeeRecordById(feeId);
  if (!fullFee) {
    return { resultCode: 'not_found' };
  }

  const sql = getSqlClient();
  const feeSqlId = parseNumericId(feeId);
  const studentSqlId = parseNumericId(fullFee.studentId?._id || fullFee.studentId);
  const receivedByUserId = parseNumericId(paymentInput.receivedByUserId);
  const paymentMode = VALID_PAYMENT_MODES.has(paymentInput.mode) ? paymentInput.mode : 'Cash';
  const receiptStoreEnabled = await hasFeeReceiptStore();
  let createdPaymentId = null;
  let createdReceipt = null;
  let paymentResultCode = 'ok';
  let remainingPendingAmount = null;

  await executeInTransaction(async (tx) => {
    const currentFee = await tx.query(
      `SELECT
         sf.TotalAmount,
         sf.DiscountAmount,
         sf.FineAmount,
         sf.PaidAmount,
         sf.DueDate,
         sf.Status,
         latestPayment.PaymentDate
       FROM dbo.StudentFees sf
       OUTER APPLY (
         SELECT TOP 1 p.PaymentDate
         FROM dbo.FeePayments p
         WHERE p.StudentFeeId = sf.StudentFeeId
         ORDER BY p.PaymentDate DESC, p.FeePaymentId DESC
       ) latestPayment
       WHERE sf.StudentFeeId = @StudentFeeId`,
      [{ name: 'StudentFeeId', type: sql.Int, value: feeSqlId }]
    );

    const feeRow = currentFee?.recordset?.[0];
    if (!feeRow) {
      throw new Error('Fee record not found');
    }

    const totalAmount = toDecimal(feeRow.TotalAmount);
    const discountAmount = toDecimal(feeRow.DiscountAmount);
    const fineAmount = toDecimal(feeRow.FineAmount);
    const currentPaidAmount = toDecimal(feeRow.PaidAmount);
    const pendingAmount = computeFeeSnapshot({
      amount: totalAmount,
      lateFee: fineAmount,
      discount: discountAmount,
      paidAmount: currentPaidAmount,
      dueDate: feeRow.DueDate,
      paymentDate: feeRow.PaymentDate,
      status: feeRow.Status,
    }).pendingAmount;

    if (pendingAmount <= 0) {
      paymentResultCode = 'already_paid';
      remainingPendingAmount = 0;
      return;
    }

    if (paymentAmount > pendingAmount) {
      paymentResultCode = 'exceeds_pending';
      remainingPendingAmount = pendingAmount;
      return;
    }

    const nextPaidAmount = toDecimal(currentPaidAmount + paymentAmount);
    const nextStatus = resolveFeeStatus({
      amount: totalAmount,
      lateFee: fineAmount,
      discount: discountAmount,
      paidAmount: nextPaidAmount,
      dueDate: feeRow.DueDate,
      paymentDate: new Date(),
      status: feeRow.Status,
    });

    const insertedPayment = await tx.query(
      `INSERT INTO dbo.FeePayments (
         StudentFeeId,
         StudentId,
         PaymentDate,
         AmountPaid,
         PaymentMode,
         TransactionReference,
         ReceivedByUserId,
         Remarks,
         CreatedAt
       )
       OUTPUT INSERTED.FeePaymentId
       VALUES (
         @StudentFeeId,
         @StudentId,
         SYSUTCDATETIME(),
         @AmountPaid,
         @PaymentMode,
         @TransactionReference,
         @ReceivedByUserId,
         @Remarks,
         SYSUTCDATETIME()
       )`,
      [
        { name: 'StudentFeeId', type: sql.Int, value: feeSqlId },
        { name: 'StudentId', type: sql.Int, value: studentSqlId },
        { name: 'AmountPaid', type: sql.Decimal(18, 2), value: paymentAmount },
        { name: 'PaymentMode', type: sql.NVarChar(50), value: paymentMode },
        { name: 'TransactionReference', type: sql.NVarChar(255), value: toNullableString(paymentInput.transactionId) },
        { name: 'ReceivedByUserId', type: sql.Int, value: receivedByUserId },
        { name: 'Remarks', type: sql.NVarChar(1000), value: toNullableString(paymentInput.notes) },
      ]
    );

    createdPaymentId = parseNumericId(insertedPayment?.recordset?.[0]?.FeePaymentId);

    await tx.query(
      `UPDATE dbo.StudentFees
       SET PaidAmount = @PaidAmount,
           Status = @Status,
           UpdatedAt = SYSUTCDATETIME()
       WHERE StudentFeeId = @StudentFeeId`,
      [
        { name: 'StudentFeeId', type: sql.Int, value: feeSqlId },
        { name: 'PaidAmount', type: sql.Decimal(18, 2), value: nextPaidAmount },
        { name: 'Status', type: sql.NVarChar(50), value: nextStatus },
      ]
    );

    if (receiptStoreEnabled && createdPaymentId) {
      createdReceipt = await ensureFeeReceiptByPaymentId(createdPaymentId, {
        fallbackGeneratedByUserId: receivedByUserId,
      }, tx);
    }
  });

  if (paymentResultCode !== 'ok') {
    return {
      resultCode: paymentResultCode,
      pendingAmount: remainingPendingAmount,
    };
  }

  const refreshedFee = await getFeeRecordById(feeSqlId);
  const payment = refreshedFee?.payments?.find((entry) => entry.id === String(createdPaymentId)) || null;
  const receipt = createdReceipt
    || (receiptStoreEnabled && createdPaymentId
      ? await ensureFeeReceiptByPaymentId(createdPaymentId, {
          fallbackGeneratedByUserId: receivedByUserId,
        })
      : null);

  return {
    resultCode: 'ok',
    fee: refreshedFee,
    payment,
    receipt,
  };
};

const deleteFeeRecord = async (feeId) => {
  await ensureFeeSqlReady();
  const sql = getSqlClient();
  const feeSqlId = parseNumericId(feeId);
  if (!feeSqlId) {
    return { resultCode: 'not_found' };
  }

  const existingFee = await getFeeRecordById(feeSqlId);
  if (!existingFee) {
    return { resultCode: 'not_found' };
  }

  const paymentCount = await executeQuery(
    `SELECT COUNT(1) AS PaymentCount
     FROM dbo.FeePayments
     WHERE StudentFeeId = @StudentFeeId`,
    [{ name: 'StudentFeeId', type: sql.Int, value: feeSqlId }]
  );

  if (Number(paymentCount?.recordset?.[0]?.PaymentCount || 0) > 0) {
    return { resultCode: 'has_payments' };
  }

  await executeQuery(
    `DELETE FROM dbo.StudentFees WHERE StudentFeeId = @StudentFeeId`,
    [{ name: 'StudentFeeId', type: sql.Int, value: feeSqlId }]
  );

  return { resultCode: 'ok' };
};

const getFeeStatistics = async ({ academicYear = null } = {}) => {
  await ensureFeeSqlReady();
  await syncAllFeesToSql();

  const sql = getSqlClient();
  const clauses = [];
  const params = [];
  if (academicYear) {
    clauses.push('ay.YearName = @AcademicYear');
    params.push({ name: 'AcademicYear', type: sql.NVarChar(20), value: toNullableString(academicYear) });
  }
  const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const feeResult = await executeQuery(`
    ${buildFeeBaseSelect()}
    ${whereClause}
    ORDER BY sf.DueDate DESC, sf.StudentFeeId DESC;
  `, params);
  const collectionReportResult = await executeQuery(`
    SELECT
      CAST(fp.PaymentDate AS DATE) AS collectionDate,
      fp.PaymentMode AS paymentMode,
      COUNT(1) AS paymentCount,
      SUM(fp.AmountPaid) AS totalCollected
    FROM dbo.FeePayments fp
    LEFT JOIN dbo.StudentFees sf
      ON sf.StudentFeeId = fp.StudentFeeId
    LEFT JOIN dbo.FeeStructures fs
      ON fs.FeeStructureId = sf.FeeStructureId
    LEFT JOIN dbo.AcademicYears ay
      ON ay.AcademicYearId = fs.AcademicYearId
    ${whereClause}
    GROUP BY CAST(fp.PaymentDate AS DATE), fp.PaymentMode
    ORDER BY collectionDate DESC, paymentMode;
  `, params);
  const structureResult = await executeQuery(`
    SELECT
      fs.FeeStructureId,
      c.ClassName,
      fs.FeeType,
      ay.YearName,
      fs.Amount,
      fs.CreatedAt,
      fs.UpdatedAt
    FROM dbo.FeeStructures fs
    LEFT JOIN dbo.Classes c
      ON c.ClassId = fs.ClassId
    LEFT JOIN dbo.AcademicYears ay
      ON ay.AcademicYearId = fs.AcademicYearId
    ${whereClause}
    ORDER BY fs.FeeStructureId DESC;
  `, params);

  const feeRows = feeResult?.recordset || [];
  const collectionReport = collectionReportResult?.recordset || [];
  const feeStructures = (structureResult?.recordset || []).map(mapFeeStructureRow);
  const summary = {
    totalFees: 0,
    collectedFees: 0,
    pendingFees: 0,
    overdueCount: 0,
    overdueAmount: 0,
    overduePenaltyAmount: 0,
  };
  const byStatusMap = new Map();
  const dueReportMap = new Map();

  feeRows.forEach((row) => {
    const snapshot = getFeeSnapshotFromRow(row);
    const amount = toDecimal(row.TotalAmount ?? row.Amount);
    const paidAmount = toDecimal(row.PaidAmount);
    const className = row.ClassName || 'Unassigned';
    const feeType = row.FeeType || 'Other';
    const statusKey = snapshot.status || 'Pending';
    const dueKey = `${className}::${feeType}`;

    summary.totalFees = toDecimal(summary.totalFees + amount);
    summary.collectedFees = toDecimal(summary.collectedFees + paidAmount);
    summary.pendingFees = toDecimal(summary.pendingFees + snapshot.pendingAmount);

    if (snapshot.status === 'Overdue') {
      summary.overdueCount += 1;
      summary.overdueAmount = toDecimal(summary.overdueAmount + snapshot.pendingAmount);
      summary.overduePenaltyAmount = toDecimal(summary.overduePenaltyAmount + snapshot.overduePenalty);
    }

    if (!byStatusMap.has(statusKey)) {
      byStatusMap.set(statusKey, {
        _id: statusKey,
        status: statusKey,
        count: 0,
        total: 0,
        paid: 0,
        pending: 0,
      });
    }

    const statusEntry = byStatusMap.get(statusKey);
    statusEntry.count += 1;
    statusEntry.total = toDecimal(statusEntry.total + amount);
    statusEntry.paid = toDecimal(statusEntry.paid + paidAmount);
    statusEntry.pending = toDecimal(statusEntry.pending + snapshot.pendingAmount);

    if (!dueReportMap.has(dueKey)) {
      dueReportMap.set(dueKey, {
        className,
        feeType,
        recordCount: 0,
        dueCount: 0,
        overdueCount: 0,
        dueAmount: 0,
        overdueAmount: 0,
        overduePenaltyAmount: 0,
      });
    }

    const dueEntry = dueReportMap.get(dueKey);
    dueEntry.recordCount += 1;

    if (snapshot.pendingAmount > 0) {
      dueEntry.dueCount += 1;
      dueEntry.dueAmount = toDecimal(dueEntry.dueAmount + snapshot.pendingAmount);
    }

    if (snapshot.status === 'Overdue') {
      dueEntry.overdueCount += 1;
      dueEntry.overdueAmount = toDecimal(dueEntry.overdueAmount + snapshot.pendingAmount);
      dueEntry.overduePenaltyAmount = toDecimal(dueEntry.overduePenaltyAmount + snapshot.overduePenalty);
    }
  });

  const byStatus = Array.from(byStatusMap.values()).sort((left, right) => left.status.localeCompare(right.status));
  const dueReport = Array.from(dueReportMap.values()).sort((left, right) =>
    left.className.localeCompare(right.className) || left.feeType.localeCompare(right.feeType)
  );

  return {
    totalFees: toDecimal(summary.totalFees),
    collectedFees: toDecimal(summary.collectedFees),
    pendingFees: toDecimal(summary.pendingFees),
    totalPaid: toDecimal(summary.collectedFees),
    totalPending: toDecimal(summary.pendingFees),
    overdueCount: Number(summary.overdueCount || 0),
    overdueAmount: toDecimal(summary.overdueAmount),
    overduePenaltyAmount: toDecimal(summary.overduePenaltyAmount),
    penaltyPerDay: OVERDUE_PENALTY_PER_DAY,
    byStatus,
    dueReport,
    collectionReport: collectionReport.map((row) => ({
      collectionDate: row.collectionDate,
      paymentMode: row.paymentMode,
      paymentCount: Number(row.paymentCount || 0),
      totalCollected: toDecimal(row.totalCollected),
    })),
    feeStructures,
  };
};

const bulkCreateFeeRecords = async ({ className, academicYear, feeType, amount, dueDate, createdByUserId }) => {
  await ensureFeeSqlReady();

  const scopedStudents = await getStudentsByClass(className);
  const fallbackStudentList = !scopedStudents.length
    ? (await getStudentList({ page: 1, limit: 5000, className }))?.students || []
    : [];
  const students = (scopedStudents.length ? scopedStudents : fallbackStudentList)
    .filter((student) => student.isActive !== false);
  if (!students.length) {
    return [];
  }
  const resolvedClassName = toNullableString(
    students[0]?.class || students[0]?.className || className
  );

  const normalizedAmount = toDecimal(amount, NaN);
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new Error('Please provide a valid bulk fee amount.');
  }

  const createdFeeIds = [];

  await executeInTransaction(async (tx) => {
    const sql = getSqlClient();
    const { feeStructureId } = await ensurePrimaryFeeStructure(
      {
        className: resolvedClassName,
        feeType,
        academicYear,
        amount: normalizedAmount,
        dueDate,
      },
      tx
    );
    const normalizedDueDate = normalizeDateOnly(dueDate);

    for (const student of students) {
      const studentSqlId = parseNumericId(student._id || student.id || student.studentId);
      if (!studentSqlId) {
        continue;
      }

      const existingFee = await tx.query(
        `SELECT TOP 1 StudentFeeId
         FROM dbo.StudentFees
         WHERE StudentId = @StudentId
           AND FeeStructureId = @FeeStructureId
           AND (
             (DueDate IS NULL AND @DueDate IS NULL)
             OR DueDate = @DueDate
           )
         ORDER BY StudentFeeId DESC`,
        [
          { name: 'StudentId', type: sql.Int, value: studentSqlId },
          { name: 'FeeStructureId', type: sql.Int, value: feeStructureId },
          { name: 'DueDate', type: sql.Date, value: normalizedDueDate },
        ]
      );

      if (parseNumericId(existingFee?.recordset?.[0]?.StudentFeeId)) {
        continue;
      }

      const inserted = await tx.query(
        `INSERT INTO dbo.StudentFees (
           StudentId,
           FeeStructureId,
           TotalAmount,
           DiscountAmount,
           FineAmount,
           PaidAmount,
           Status,
           DueDate,
           CreatedAt,
           UpdatedAt
         )
         OUTPUT INSERTED.StudentFeeId
         VALUES (
           @StudentId,
           @FeeStructureId,
           @TotalAmount,
           0,
           0,
           0,
           N'Pending',
           @DueDate,
           SYSUTCDATETIME(),
           SYSUTCDATETIME()
         )`,
        [
          { name: 'StudentId', type: sql.Int, value: studentSqlId },
          { name: 'FeeStructureId', type: sql.Int, value: feeStructureId },
          { name: 'TotalAmount', type: sql.Decimal(18, 2), value: normalizedAmount },
          { name: 'DueDate', type: sql.Date, value: normalizedDueDate },
        ]
      );

      const createdFeeId = parseNumericId(inserted?.recordset?.[0]?.StudentFeeId);
      if (createdFeeId) {
        createdFeeIds.push(createdFeeId);
      }
    }
  });

  const createdFees = [];
  for (const feeId of createdFeeIds) {
    const fee = await getFeeRecordById(feeId);
    if (fee) {
      createdFees.push(fee);
    }
  }
  return createdFees;
};

module.exports = {
  ensureFeeSqlReady,
  syncFeeMirror,
  syncFeeById,
  syncAllFeesToSql,
  getFeeList,
  getFeeRecordById,
  getFeesForStudent,
  createFeeRecord,
  updateFeeRecord,
  collectFeePaymentRecord,
  deleteFeeRecord,
  getFeeStatistics,
  bulkCreateFeeRecords,
};
