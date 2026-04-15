const XML_HEADER = '<?xml version="1.0"?>';
const WORKBOOK_OPEN = [
  '<Workbook',
  ' xmlns="urn:schemas-microsoft-com:office:spreadsheet"',
  ' xmlns:o="urn:schemas-microsoft-com:office:office"',
  ' xmlns:x="urn:schemas-microsoft-com:office:excel"',
  ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"',
  ' xmlns:html="http://www.w3.org/TR/REC-html40">',
].join('');
const WORKBOOK_CLOSE = '</Workbook>';

const escapeXml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const sanitizeSheetName = (value = 'Sheet1', index = 0) => {
  const sanitized = String(value || `Sheet${index + 1}`)
    .replace(/[\\/*?:[\]]/g, ' ')
    .trim()
    .slice(0, 31);

  return sanitized || `Sheet${index + 1}`;
};

const normalizeCellValue = (value) => {
  if (value === null || value === undefined) {
    return { type: 'String', value: '' };
  }

  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? { type: 'Number', value: String(value) }
      : { type: 'String', value: String(value) };
  }

  if (typeof value === 'boolean') {
    return { type: 'String', value: value ? 'Yes' : 'No' };
  }

  if (value instanceof Date) {
    return { type: 'String', value: value.toISOString() };
  }

  return { type: 'String', value: String(value) };
};

const createCellXml = (value) => {
  const normalized = normalizeCellValue(value);
  return `<Cell><Data ss:Type="${normalized.type}">${escapeXml(normalized.value)}</Data></Cell>`;
};

const createRowXml = (row = []) => `<Row>${row.map((value) => createCellXml(value)).join('')}</Row>`;

const buildSheetXml = (sheet = {}, index = 0) => {
  const name = sanitizeSheetName(sheet.name, index);
  const columns = Array.isArray(sheet.columns) ? sheet.columns : [];
  const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
  const tableRows = [];

  if (columns.length) {
    tableRows.push(createRowXml(columns.map((column) => column.header || column.key || '')));
  }

  rows.forEach((row) => {
    if (Array.isArray(row)) {
      tableRows.push(createRowXml(row));
      return;
    }

    if (row && typeof row === 'object' && columns.length) {
      tableRows.push(createRowXml(columns.map((column) => row[column.key])));
      return;
    }

    tableRows.push(createRowXml([row]));
  });

  if (!tableRows.length) {
    tableRows.push(createRowXml(['No data available']));
  }

  return `<Worksheet ss:Name="${escapeXml(name)}"><Table>${tableRows.join('')}</Table></Worksheet>`;
};

const buildWorkbookXml = (sheets = []) => {
  const workbookSheets = sheets.length
    ? sheets.map((sheet, index) => buildSheetXml(sheet, index)).join('')
    : buildSheetXml({}, 0);

  return `${XML_HEADER}${WORKBOOK_OPEN}${workbookSheets}${WORKBOOK_CLOSE}`;
};

export const downloadExcelWorkbook = ({ filename = 'report.xls', sheets = [] } = {}) => {
  const workbookXml = buildWorkbookXml(sheets);
  const blob = new Blob([workbookXml], {
    type: 'application/vnd.ms-excel;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename.endsWith('.xls') ? filename : `${filename}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

