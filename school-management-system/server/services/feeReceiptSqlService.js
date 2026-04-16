const { getSqlClient, executeQuery, executeStoredProcedure } = require('../config/sqlServer');

const FEE_RECEIPT_TABLE = 'dbo.FeeReceipts';
const FEE_RECEIPT_UPSERT_PROCEDURE = 'dbo.spFeeReceiptUpsert';
const FEE_RECEIPT_GET_BY_PAYMENT_PROCEDURE = 'dbo.spFeeReceiptGetByPaymentId';

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

const createReceiptNumber = () =>
  `FEE-RCPT-${Date.now()}-${Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, '0')}`;

const createReceiptStorageError = () => {
  const error = new Error('Fee receipt storage is not configured. Create dbo.FeeReceipts before using receipt downloads.');
  error.statusCode = 503;
  return error;
};

const buildFallbackReceiptNumber = (paymentId) => {
  const normalizedPaymentId = parseNumericId(paymentId);
  return normalizedPaymentId ? `PAY-${normalizedPaymentId}` : createReceiptNumber();
};

const mapFeeReceiptRow = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: row.FeeReceiptId != null ? String(row.FeeReceiptId) : null,
    paymentId: row.FeePaymentId != null ? String(row.FeePaymentId) : null,
    feeId: row.StudentFeeId != null ? String(row.StudentFeeId) : null,
    studentId: row.StudentId != null ? String(row.StudentId) : null,
    receiptNumber: row.ReceiptNumber || null,
    receiptDate: row.ReceiptDate ? new Date(row.ReceiptDate) : null,
    academicYear: row.AcademicYear || null,
    studentName: row.StudentName || null,
    rollNumber: row.RollNumber || null,
    admissionNumber: row.AdmissionNumber || null,
    className: row.ClassName || null,
    sectionName: row.SectionName || null,
    feeType: row.FeeType || null,
    dueDate: row.DueDate ? new Date(row.DueDate) : null,
    baseAmount: toDecimal(row.BaseAmount),
    fineAmount: toDecimal(row.FineAmount),
    discountAmount: toDecimal(row.DiscountAmount),
    totalFeeAmount: toDecimal(row.TotalFeeAmount),
    amountPaid: toDecimal(row.AmountPaidThisReceipt),
    paidAmountBefore: toDecimal(row.PaidAmountBefore),
    paidAmountAfter: toDecimal(row.PaidAmountAfter),
    pendingAmountAfter: toDecimal(row.PendingAmountAfter),
    paymentMode: row.PaymentMode || null,
    transactionId: row.TransactionReference || null,
    notes: row.Notes || null,
    generatedByUserId: row.GeneratedByUserId != null ? String(row.GeneratedByUserId) : null,
    generatedByName: row.GeneratedByFullName || null,
    createdAt: row.CreatedAt ? new Date(row.CreatedAt) : null,
    updatedAt: row.UpdatedAt ? new Date(row.UpdatedAt) : null,
  };
};

const mapPaymentSnapshotToReceipt = (row) => {
  if (!row) {
    return null;
  }

  const baseAmount = toDecimal(row.TotalAmount);
  const fineAmount = toDecimal(row.FineAmount);
  const discountAmount = toDecimal(row.DiscountAmount);
  const totalFeeAmount = toDecimal(baseAmount + fineAmount - discountAmount);
  const amountPaid = toDecimal(row.AmountPaid);
  const paidAmountAfter = toDecimal(row.PaidAmountAfterPayment);
  const paidAmountBefore = toDecimal(Math.max(paidAmountAfter - amountPaid, 0));
  const pendingAmountAfter = toDecimal(Math.max(totalFeeAmount - paidAmountAfter, 0));

  return {
    id: null,
    paymentId: row.FeePaymentId != null ? String(row.FeePaymentId) : null,
    feeId: row.StudentFeeId != null ? String(row.StudentFeeId) : null,
    studentId: row.StudentId != null ? String(row.StudentId) : null,
    receiptNumber: row.ReceiptNumber || buildFallbackReceiptNumber(row.FeePaymentId),
    receiptDate: row.PaymentDate ? new Date(row.PaymentDate) : null,
    academicYear: row.AcademicYear || null,
    studentName: row.StudentName || null,
    rollNumber: row.RollNumber || null,
    admissionNumber: row.AdmissionNumber || null,
    className: row.ClassName || null,
    sectionName: row.SectionName || null,
    feeType: row.FeeType || null,
    dueDate: row.DueDate ? new Date(row.DueDate) : null,
    baseAmount,
    fineAmount,
    discountAmount,
    totalFeeAmount,
    amountPaid,
    paidAmountBefore,
    paidAmountAfter,
    pendingAmountAfter,
    paymentMode: row.PaymentMode || null,
    transactionId: row.TransactionReference || null,
    notes: row.Remarks || null,
    generatedByUserId: row.ReceivedByUserId != null ? String(row.ReceivedByUserId) : null,
    generatedByName: row.ReceivedByFullName || null,
    createdAt: row.CreatedAt ? new Date(row.CreatedAt) : null,
    updatedAt: row.PaymentDate ? new Date(row.PaymentDate) : null,
  };
};

const hasFeeReceiptStore = async () => {
  const result = await executeQuery(`
    SELECT CAST(CASE WHEN OBJECT_ID(N'${FEE_RECEIPT_TABLE}', N'U') IS NULL THEN 0 ELSE 1 END AS BIT) AS IsAvailable;
  `);

  const value = result?.recordset?.[0]?.IsAvailable;
  return value === true || value === 1;
};

const assertFeeReceiptStore = async () => {
  const isAvailable = await hasFeeReceiptStore();
  if (!isAvailable) {
    throw createReceiptStorageError();
  }
};

const runReceiptStoredProcedure = async (procedureName, params = [], tx = null) => {
  if (tx?.executeStoredProcedure) {
    return tx.executeStoredProcedure(procedureName, params);
  }

  return executeStoredProcedure(procedureName, params);
};

const buildReceiptSelect = () => `
  SELECT TOP 1
    fr.FeeReceiptId,
    fr.FeePaymentId,
    fr.StudentFeeId,
    fr.StudentId,
    fr.ReceiptNumber,
    fr.ReceiptDate,
    fr.AcademicYear,
    fr.StudentName,
    fr.RollNumber,
    fr.AdmissionNumber,
    fr.ClassName,
    fr.SectionName,
    fr.FeeType,
    fr.DueDate,
    fr.BaseAmount,
    fr.FineAmount,
    fr.DiscountAmount,
    fr.TotalFeeAmount,
    fr.AmountPaidThisReceipt,
    fr.PaidAmountBefore,
    fr.PaidAmountAfter,
    fr.PendingAmountAfter,
    fr.PaymentMode,
    fr.TransactionReference,
    fr.Notes,
    fr.GeneratedByUserId,
    issuer.FullName AS GeneratedByFullName,
    fr.CreatedAt,
    fr.UpdatedAt
  FROM ${FEE_RECEIPT_TABLE} fr
  LEFT JOIN dbo.Users issuer
    ON issuer.UserId = fr.GeneratedByUserId
  WHERE fr.FeePaymentId = @FeePaymentId
`;

const getFeeReceiptByPaymentId = async (paymentId, tx = null) => {
  const storeAvailable = await hasFeeReceiptStore();
  if (!storeAvailable) {
    return null;
  }

  const normalizedPaymentId = parseNumericId(paymentId);
  if (!normalizedPaymentId) {
    return null;
  }

  const sql = getSqlClient();
  let result = null;

  try {
    result = await runReceiptStoredProcedure(FEE_RECEIPT_GET_BY_PAYMENT_PROCEDURE, [
      { name: 'FeePaymentId', type: sql.Int, value: normalizedPaymentId },
    ], tx);
  } catch (error) {
    const runner = tx?.query || executeQuery;
    result = await runner(
      `${buildReceiptSelect()}
       ORDER BY fr.FeeReceiptId DESC;`,
      [{ name: 'FeePaymentId', type: sql.Int, value: normalizedPaymentId }]
    );
  }

  return mapFeeReceiptRow(result?.recordset?.[0] || null);
};

const getReceiptPaymentSnapshot = async (paymentId, tx = null) => {
  const normalizedPaymentId = parseNumericId(paymentId);
  if (!normalizedPaymentId) {
    return null;
  }

  const sql = getSqlClient();
  const runner = tx?.query || executeQuery;
  const result = await runner(
    `
      SELECT TOP 1
        p.FeePaymentId,
        p.StudentFeeId,
        p.StudentId,
        p.PaymentDate,
        p.AmountPaid,
        p.PaymentMode,
        p.TransactionReference,
        p.Remarks,
        p.ReceivedByUserId,
        st.FullName AS StudentName,
        st.RollNumber,
        st.AdmissionNumber,
        c.ClassName,
        sec.SectionName,
        fs.FeeType,
        ay.YearName AS AcademicYear,
        sf.DueDate,
        sf.TotalAmount,
        sf.DiscountAmount,
        sf.FineAmount,
        issuer.FullName AS ReceivedByFullName,
        COALESCE((
          SELECT SUM(previousPayments.AmountPaid)
          FROM dbo.FeePayments previousPayments
          WHERE previousPayments.StudentFeeId = p.StudentFeeId
            AND (
              previousPayments.PaymentDate < p.PaymentDate
              OR (
                previousPayments.PaymentDate = p.PaymentDate
                AND previousPayments.FeePaymentId <= p.FeePaymentId
              )
            )
        ), 0) AS PaidAmountAfterPayment
      FROM dbo.FeePayments p
      INNER JOIN dbo.StudentFees sf
        ON sf.StudentFeeId = p.StudentFeeId
      INNER JOIN dbo.Students st
        ON st.StudentId = p.StudentId
      LEFT JOIN dbo.Classes c
        ON c.ClassId = st.ClassId
      LEFT JOIN dbo.Sections sec
        ON sec.SectionId = st.SectionId
      LEFT JOIN dbo.FeeStructures fs
        ON fs.FeeStructureId = sf.FeeStructureId
      LEFT JOIN dbo.AcademicYears ay
        ON ay.AcademicYearId = fs.AcademicYearId
      LEFT JOIN dbo.Users issuer
        ON issuer.UserId = p.ReceivedByUserId
      WHERE p.FeePaymentId = @FeePaymentId;
    `,
    [{ name: 'FeePaymentId', type: sql.Int, value: normalizedPaymentId }]
  );

  return result?.recordset?.[0] || null;
};

const insertFeeReceipt = async (snapshot, tx = null, fallbackGeneratedByUserId = null) => {
  const sql = getSqlClient();
  const baseAmount = toDecimal(snapshot?.TotalAmount);
  const fineAmount = toDecimal(snapshot?.FineAmount);
  const discountAmount = toDecimal(snapshot?.DiscountAmount);
  const totalFeeAmount = toDecimal(baseAmount + fineAmount - discountAmount);
  const amountPaid = toDecimal(snapshot?.AmountPaid);
  const paidAmountAfter = toDecimal(snapshot?.PaidAmountAfterPayment);
  const paidAmountBefore = toDecimal(Math.max(paidAmountAfter - amountPaid, 0));
  const pendingAmountAfter = toDecimal(Math.max(totalFeeAmount - paidAmountAfter, 0));
  const generatedByUserId = parseNumericId(snapshot?.ReceivedByUserId) || parseNumericId(fallbackGeneratedByUserId);
  const receiptNumber = createReceiptNumber();
  const receiptDate = normalizeDateTime(snapshot?.PaymentDate) || new Date();
  const now = new Date();
  const params = [
    { name: 'FeePaymentId', type: sql.Int, value: parseNumericId(snapshot?.FeePaymentId) },
    { name: 'StudentFeeId', type: sql.Int, value: parseNumericId(snapshot?.StudentFeeId) },
    { name: 'StudentId', type: sql.Int, value: parseNumericId(snapshot?.StudentId) },
    { name: 'ReceiptNumber', type: sql.NVarChar(100), value: receiptNumber },
    { name: 'ReceiptDate', type: sql.DateTime2(0), value: receiptDate },
    { name: 'AcademicYear', type: sql.NVarChar(20), value: toNullableString(snapshot?.AcademicYear) },
    { name: 'StudentName', type: sql.NVarChar(200), value: toNullableString(snapshot?.StudentName) || 'Student' },
    { name: 'RollNumber', type: sql.NVarChar(50), value: toNullableString(snapshot?.RollNumber) },
    { name: 'AdmissionNumber', type: sql.NVarChar(50), value: toNullableString(snapshot?.AdmissionNumber) },
    { name: 'ClassName', type: sql.NVarChar(100), value: toNullableString(snapshot?.ClassName) },
    { name: 'SectionName', type: sql.NVarChar(50), value: toNullableString(snapshot?.SectionName) },
    { name: 'FeeType', type: sql.NVarChar(100), value: toNullableString(snapshot?.FeeType) || 'Fee' },
    { name: 'DueDate', type: sql.Date, value: snapshot?.DueDate || null },
    { name: 'BaseAmount', type: sql.Decimal(18, 2), value: baseAmount },
    { name: 'FineAmount', type: sql.Decimal(18, 2), value: fineAmount },
    { name: 'DiscountAmount', type: sql.Decimal(18, 2), value: discountAmount },
    { name: 'TotalFeeAmount', type: sql.Decimal(18, 2), value: totalFeeAmount },
    { name: 'AmountPaidThisReceipt', type: sql.Decimal(18, 2), value: amountPaid },
    { name: 'PaidAmountBefore', type: sql.Decimal(18, 2), value: paidAmountBefore },
    { name: 'PaidAmountAfter', type: sql.Decimal(18, 2), value: paidAmountAfter },
    { name: 'PendingAmountAfter', type: sql.Decimal(18, 2), value: pendingAmountAfter },
    { name: 'PaymentMode', type: sql.NVarChar(50), value: toNullableString(snapshot?.PaymentMode) || 'Cash' },
    { name: 'TransactionReference', type: sql.NVarChar(255), value: toNullableString(snapshot?.TransactionReference) },
    { name: 'Notes', type: sql.NVarChar(1000), value: toNullableString(snapshot?.Remarks) },
    { name: 'GeneratedByUserId', type: sql.Int, value: generatedByUserId },
  ];

  try {
    await runReceiptStoredProcedure(FEE_RECEIPT_UPSERT_PROCEDURE, params, tx);
    return;
  } catch (error) {
    const runner = tx?.query || executeQuery;
    await runner(
      `
        INSERT INTO ${FEE_RECEIPT_TABLE} (
          FeePaymentId,
          StudentFeeId,
          StudentId,
          ReceiptNumber,
          ReceiptDate,
          AcademicYear,
          StudentName,
          RollNumber,
          AdmissionNumber,
          ClassName,
          SectionName,
          FeeType,
          DueDate,
          BaseAmount,
          FineAmount,
          DiscountAmount,
          TotalFeeAmount,
          AmountPaidThisReceipt,
          PaidAmountBefore,
          PaidAmountAfter,
          PendingAmountAfter,
          PaymentMode,
          TransactionReference,
          Notes,
          GeneratedByUserId,
          CreatedAt,
          UpdatedAt
        )
        VALUES (
          @FeePaymentId,
          @StudentFeeId,
          @StudentId,
          @ReceiptNumber,
          @ReceiptDate,
          @AcademicYear,
          @StudentName,
          @RollNumber,
          @AdmissionNumber,
          @ClassName,
          @SectionName,
          @FeeType,
          @DueDate,
          @BaseAmount,
          @FineAmount,
          @DiscountAmount,
          @TotalFeeAmount,
          @AmountPaidThisReceipt,
          @PaidAmountBefore,
          @PaidAmountAfter,
          @PendingAmountAfter,
          @PaymentMode,
          @TransactionReference,
          @Notes,
          @GeneratedByUserId,
          @CreatedAt,
          @UpdatedAt
        );
      `,
      [
        ...params,
        { name: 'CreatedAt', type: sql.DateTime2(0), value: now },
        { name: 'UpdatedAt', type: sql.DateTime2(0), value: now },
      ]
    );
  }
};

const ensureFeeReceiptByPaymentId = async (paymentId, { fallbackGeneratedByUserId = null } = {}, tx = null) => {
  const normalizedPaymentId = parseNumericId(paymentId);
  if (!normalizedPaymentId) {
    return null;
  }

  const storeAvailable = await hasFeeReceiptStore();
  if (!storeAvailable) {
    const paymentSnapshot = await getReceiptPaymentSnapshot(normalizedPaymentId, tx);
    return mapPaymentSnapshotToReceipt(paymentSnapshot);
  }

  const existingReceipt = await getFeeReceiptByPaymentId(normalizedPaymentId, tx);
  if (existingReceipt) {
    return existingReceipt;
  }

  const paymentSnapshot = await getReceiptPaymentSnapshot(normalizedPaymentId, tx);
  if (!paymentSnapshot) {
    return null;
  }

  await insertFeeReceipt(paymentSnapshot, tx, fallbackGeneratedByUserId);
  return getFeeReceiptByPaymentId(normalizedPaymentId, tx);
};

module.exports = {
  FEE_RECEIPT_TABLE,
  hasFeeReceiptStore,
  getFeeReceiptByPaymentId,
  ensureFeeReceiptByPaymentId,
};
