const currencyFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatCurrency = (value = 0) => `INR ${currencyFormatter.format(Number(value) || 0)}`;

const formatDate = (value) => {
  if (!value) {
    return '-';
  }

  const parsedDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return '-';
  }

  return parsedDate.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const toPdfAscii = (value = '') => String(value ?? '').replace(/[^\x20-\x7E]/g, '?');

const escapePdfText = (value = '') =>
  toPdfAscii(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

const wrapText = (value = '', maxLength = 72) => {
  const text = toPdfAscii(value).trim();
  if (!text) {
    return [];
  }

  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';

  words.forEach((word) => {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length <= maxLength) {
      currentLine = candidate;
      return;
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    currentLine = word;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
};

const createPdfBuffer = (objects = []) => {
  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.byteLength(pdf, 'utf8');
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';

  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'utf8');
};

const buildFeeReceiptPdf = (receipt = {}, schoolProfile = {}) => {
  const commands = [];
  let y = 800;
  const left = 50;
  const rightColumn = 340;

  const schoolName = schoolProfile.schoolName || process.env.SCHOOL_NAME || 'School Management ERP';
  const schoolAddress = schoolProfile.schoolAddress || process.env.SCHOOL_ADDRESS || '';
  const schoolContact = schoolProfile.schoolContact || process.env.SCHOOL_CONTACT || '';

  const addText = (text, x, fontSize = 11, font = 'F1') => {
    commands.push(`BT /${font} ${fontSize} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdfText(text)}) Tj ET`);
    y -= fontSize + 8;
  };

  const addLine = (nextY) => {
    commands.push('0.8 w');
    commands.push(`${left} ${nextY} m 545 ${nextY} l S`);
    y = nextY - 18;
  };

  const addWrappedBlock = (label, value) => {
    const lines = wrapText(value || '-', 72);
    addText(label, left, 10, 'F2');
    lines.forEach((line) => {
      addText(line, left, 10, 'F1');
    });
  };

  addText(schoolName, left, 20, 'F2');

  if (schoolAddress) {
    addText(schoolAddress, left, 10, 'F1');
  }

  if (schoolContact) {
    addText(schoolContact, left, 10, 'F1');
  }

  y -= 4;
  addLine(y);

  addText('FEE PAYMENT RECEIPT', left, 16, 'F2');
  addText(`Receipt No: ${receipt.receiptNumber || '-'}`, left, 11, 'F1');
  y += 19;
  addText(`Receipt Date: ${formatDate(receipt.receiptDate || receipt.createdAt)}`, rightColumn, 11, 'F1');
  addText(`Payment Mode: ${receipt.paymentMode || '-'}`, rightColumn, 11, 'F1');

  addLine(y + 2);

  addText('Student Details', left, 12, 'F2');
  addText(`Name: ${receipt.studentName || '-'}`, left, 11, 'F1');
  addText(`Roll Number: ${receipt.rollNumber || '-'}`, left, 11, 'F1');
  addText(`Admission No: ${receipt.admissionNumber || '-'}`, left, 11, 'F1');

  y += 38;
  addText(`Class: ${receipt.className || '-'}${receipt.sectionName ? ` / ${receipt.sectionName}` : ''}`, rightColumn, 11, 'F1');
  addText(`Academic Year: ${receipt.academicYear || '-'}`, rightColumn, 11, 'F1');
  addText(`Fee Type: ${receipt.feeType || '-'}`, rightColumn, 11, 'F1');
  addText(`Due Date: ${formatDate(receipt.dueDate)}`, rightColumn, 11, 'F1');

  addLine(y + 2);

  addText('Amount Summary', left, 12, 'F2');
  addText(`Base Fee: ${formatCurrency(receipt.baseAmount)}`, left, 11, 'F1');
  addText(`Fine / Late Fee: ${formatCurrency(receipt.fineAmount)}`, left, 11, 'F1');
  addText(`Discount: ${formatCurrency(receipt.discountAmount)}`, left, 11, 'F1');
  addText(`Net Fee Amount: ${formatCurrency(receipt.totalFeeAmount)}`, left, 11, 'F1');

  y += 52;
  addText(`Paid Before This Receipt: ${formatCurrency(receipt.paidAmountBefore)}`, rightColumn, 11, 'F1');
  addText(`Paid In This Receipt: ${formatCurrency(receipt.amountPaid)}`, rightColumn, 11, 'F1');
  addText(`Paid After This Receipt: ${formatCurrency(receipt.paidAmountAfter)}`, rightColumn, 11, 'F1');
  addText(`Pending After Payment: ${formatCurrency(receipt.pendingAmountAfter)}`, rightColumn, 11, 'F1');

  addLine(y + 2);

  addText(`Transaction Ref: ${receipt.transactionId || '-'}`, left, 11, 'F1');
  addText(`Issued By: ${receipt.generatedByName || 'School Accounts'}`, left, 11, 'F1');

  if (receipt.notes) {
    y -= 4;
    addWrappedBlock('Notes', receipt.notes);
  }

  y -= 6;
  addLine(y);
  addText('This is a system-generated receipt for the recorded fee payment.', left, 10, 'F1');
  addText('Please keep this receipt for future reference.', left, 10, 'F1');

  const stream = commands.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 6 0 R /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`,
  ];

  return createPdfBuffer(objects);
};

module.exports = {
  buildFeeReceiptPdf,
};
