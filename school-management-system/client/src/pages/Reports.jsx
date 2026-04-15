import { useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  CalendarDays,
  CircleDollarSign,
  Download,
  FileText,
  GraduationCap,
  Receipt,
  TrendingUp,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import {
  getAnalyticsReport,
  getAttendanceReport,
  getDashboardStats,
  getExamReport,
  getFeeReport,
  getSummaryReport,
} from '../services/api';
import { downloadExcelWorkbook } from '../utils/excelExport';

const EMPTY_DASHBOARD = {
  totalStudents: 0,
  totalTeachers: 0,
  totalSubjects: 0,
  totalMaterials: 0,
  todayAttendance: {
    present: 0,
    absent: 0,
    late: 0,
    markedStudents: 0,
    totalStudents: 0,
    percentage: 0,
  },
};

const EMPTY_SUMMARY = {
  totalStudents: 0,
  activeStudents: 0,
  totalTeachers: 0,
  totalSubjects: 0,
  totalMaterials: 0,
  totalExams: 0,
  avgAttendance: 0,
  avgGrade: 0,
};

const EMPTY_ANALYTICS = {
  studentTrend: [],
  classDistribution: [],
  subjectDistribution: [],
  attendanceByClass: [],
  gradePerformance: [],
};

const EMPTY_ATTENDANCE_REPORT = {
  count: 0,
  records: [],
  summary: {
    statusStats: [],
    dailyStats: [],
    studentStats: [],
  },
};

const EMPTY_EXAM_REPORT = {
  summary: {
    totalExams: 0,
    totalResults: 0,
    averageMarks: 0,
    passPercentage: 0,
  },
  exams: [],
  subjectPerformance: [],
  topStudents: [],
};

const EMPTY_FEE_REPORT = {
  totalFees: 0,
  totalPaid: 0,
  totalPending: 0,
  overdueCount: 0,
  summary: {
    totalFees: 0,
    totalPaid: 0,
    totalPending: 0,
    overdueCount: 0,
  },
  recentPayments: [],
  records: [],
  byClass: [],
  statusBreakdown: [],
};

const REPORT_LABELS = {
  overview: 'Overview',
  attendance: 'Attendance',
  exams: 'Exams',
  fees: 'Fees',
};

const buildReportOptions = (role) => {
  if (role === 'accountant') {
    return ['overview', 'fees'];
  }

  return ['overview', 'attendance', 'exams', 'fees'];
};

const formatNumber = (value) => new Intl.NumberFormat('en-IN').format(Number(value) || 0);

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`;

const formatDate = (value) => {
  if (!value) {
    return '-';
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const toWorksheetRows = (items = [], mapper = (item) => item) =>
  (Array.isArray(items) ? items : []).map((item, index) => mapper(item, index));

const toKeyValueRows = (entries = {}) =>
  Object.entries(entries || {}).map(([label, value]) => ({
    label,
    value,
  }));

const getBucketCount = (items = [], label) => {
  const normalizedLabel = String(label || '').trim().toLowerCase();
  const match = items.find((item) => {
    const bucketName = String(item?._id || item?.status || item?.name || item?.label || '')
      .trim()
      .toLowerCase();
    return bucketName === normalizedLabel;
  });

  return Number(match?.count || match?.total || match?.value || 0);
};

const StatPanel = ({ label, value, hint, icon: Icon }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
        <p className="mt-3 text-3xl font-semibold text-slate-900">{value}</p>
        {hint ? <p className="mt-2 text-sm text-slate-500">{hint}</p> : null}
      </div>
      <div className="rounded-2xl bg-[#002366]/8 p-3 text-[#002366]">
        <Icon className="h-5 w-5" />
      </div>
    </div>
  </div>
);

const SectionCard = ({ eyebrow, title, action, children }) => (
  <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
      <div>
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{eyebrow}</p>
        ) : null}
        <h2 className="mt-2 text-xl font-semibold text-slate-900">{title}</h2>
      </div>
      {action}
    </div>
    <div className="px-6 py-5">{children}</div>
  </section>
);

const SimpleMetricRow = ({ label, value, accent = 'text-slate-900' }) => (
  <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
    <span className="text-sm text-slate-600">{label}</span>
    <span className={`text-sm font-semibold ${accent}`}>{value}</span>
  </div>
);

const DataTable = ({ columns, rows, emptyMessage }) => (
  <div className="overflow-hidden rounded-2xl border border-slate-200">
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.length ? (
            rows.map((row, rowIndex) => (
              <tr key={row.id || row._id || rowIndex} className="hover:bg-slate-50/70">
                {columns.map((column) => (
                  <td key={column.key} className="px-4 py-3 text-sm text-slate-700">
                    {column.render ? column.render(row) : row[column.key] ?? '-'}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-slate-500">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

const DistributionList = ({ items, valueFormatter = formatNumber, valueKey = 'count', emptyMessage }) => (
  <div className="space-y-3">
    {items.length ? (
      items.map((item, index) => {
        const label = item._id || item.class || item.subject || item.name || `Item ${index + 1}`;
        const value = Number(item[valueKey] || item.count || 0);
        const width = Math.max(Math.min(value, 100), 4);

        return (
          <div key={`${label}-${index}`} className="rounded-2xl bg-slate-50 px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-slate-700">{label}</span>
              <span className="text-sm font-semibold text-slate-900">{valueFormatter(value)}</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#002366] to-[#1f4aa8]"
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })
    ) : (
      <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
        {emptyMessage}
      </div>
    )}
  </div>
);

const Reports = () => {
  const { user } = useAuth();
  const role = String(user?.role || '').trim().toLowerCase();
  const reportOptions = buildReportOptions(role);

  const [reportType, setReportType] = useState(reportOptions[0] || 'overview');
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingReport, setLoadingReport] = useState(true);
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [analytics, setAnalytics] = useState(EMPTY_ANALYTICS);
  const [attendanceReport, setAttendanceReport] = useState(EMPTY_ATTENDANCE_REPORT);
  const [examReport, setExamReport] = useState(EMPTY_EXAM_REPORT);
  const [feeReport, setFeeReport] = useState(EMPTY_FEE_REPORT);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    if (!reportOptions.includes(reportType)) {
      setReportType(reportOptions[0] || 'overview');
    }
  }, [reportOptions, reportType]);

  useEffect(() => {
    let active = true;

    const loadOverview = async () => {
      try {
        setLoadingOverview(true);
        const requests = [getDashboardStats()];

        if (role === 'admin' || role === 'accountant') {
          requests.push(getSummaryReport());
          requests.push(getFeeReport());
        }

        if (role === 'admin') {
          requests.push(getAnalyticsReport({ period: 'month' }));
        }

        const [dashboardRes, summaryRes, feeRes, analyticsRes] = await Promise.all(requests);
        if (!active) {
          return;
        }

        setDashboard(dashboardRes?.data?.data || dashboardRes?.data || EMPTY_DASHBOARD);
        setSummary(summaryRes?.data?.summary || EMPTY_SUMMARY);
        setFeeReport(feeRes?.data?.data || EMPTY_FEE_REPORT);
        setAnalytics(analyticsRes?.data?.analytics || EMPTY_ANALYTICS);
      } catch (error) {
        if (!active) {
          return;
        }

        toast.error('Failed to load report overview');
        setDashboard(EMPTY_DASHBOARD);
        setSummary(EMPTY_SUMMARY);
        setFeeReport(EMPTY_FEE_REPORT);
        setAnalytics(EMPTY_ANALYTICS);
      } finally {
        if (active) {
          setLoadingOverview(false);
        }
      }
    };

    loadOverview();

    return () => {
      active = false;
    };
  }, [role]);

  useEffect(() => {
    let active = true;

    const loadReport = async () => {
      try {
        setLoadingReport(true);

        if (reportType === 'attendance' && role === 'admin') {
          const response = await getAttendanceReport(dateRange);
          if (active) {
            setAttendanceReport(response?.data?.data || EMPTY_ATTENDANCE_REPORT);
          }
          return;
        }

        if (reportType === 'exams' && role === 'admin') {
          const response = await getExamReport(dateRange);
          if (active) {
            setExamReport(response?.data?.data || EMPTY_EXAM_REPORT);
          }
          return;
        }

        if (reportType === 'fees' && (role === 'admin' || role === 'accountant')) {
          const response = await getFeeReport();
          if (active) {
            setFeeReport(response?.data?.data || EMPTY_FEE_REPORT);
          }
          return;
        }
      } catch (error) {
        if (!active) {
          return;
        }

        toast.error(`Failed to load ${REPORT_LABELS[reportType].toLowerCase()} report`);
        if (reportType === 'attendance') {
          setAttendanceReport(EMPTY_ATTENDANCE_REPORT);
        }
        if (reportType === 'exams') {
          setExamReport(EMPTY_EXAM_REPORT);
        }
        if (reportType === 'fees') {
          setFeeReport(EMPTY_FEE_REPORT);
        }
      } finally {
        if (active) {
          setLoadingReport(false);
        }
      }
    };

    loadReport();

    return () => {
      active = false;
    };
  }, [dateRange, reportType, role]);

  const handleExport = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      if (reportType === 'attendance') {
        downloadExcelWorkbook({
          filename: `attendance-report-${dateRange.startDate}-${dateRange.endDate}.xls`,
          sheets: [
            {
              name: 'Summary',
              columns: [
                { key: 'label', header: 'Metric' },
                { key: 'value', header: 'Value' },
              ],
              rows: [
                { label: 'Records', value: attendanceReport.count || 0 },
                { label: 'Present', value: getBucketCount(attendanceSummary.statusStats, 'present') },
                { label: 'Absent', value: getBucketCount(attendanceSummary.statusStats, 'absent') },
                { label: 'Late', value: getBucketCount(attendanceSummary.statusStats, 'late') },
                { label: 'Start Date', value: dateRange.startDate },
                { label: 'End Date', value: dateRange.endDate },
              ],
            },
            {
              name: 'Attendance Records',
              columns: [
                { key: 'date', header: 'Date' },
                { key: 'studentName', header: 'Student' },
                { key: 'rollNumber', header: 'Roll Number' },
                { key: 'className', header: 'Class' },
                { key: 'section', header: 'Section' },
                { key: 'status', header: 'Status' },
                { key: 'markedBy', header: 'Marked By' },
                { key: 'remarks', header: 'Remarks' },
              ],
              rows: toWorksheetRows(attendanceReport.records, (record) => ({
                date: formatDate(record?.date),
                studentName: record?.studentId?.fullName || record?.studentName || '-',
                rollNumber: record?.studentId?.rollNumber || record?.rollNumber || '-',
                className: record?.class || record?.className || '-',
                section: record?.section || '-',
                status: record?.status || '-',
                markedBy: record?.markedBy?.fullName || record?.markedBy || '-',
                remarks: record?.remarks || '',
              })),
            },
            {
              name: 'Daily Stats',
              columns: [
                { key: 'date', header: 'Date' },
                { key: 'present', header: 'Present' },
                { key: 'absent', header: 'Absent' },
                { key: 'late', header: 'Late' },
                { key: 'percentage', header: 'Attendance %' },
              ],
              rows: toWorksheetRows(attendanceSummary.dailyStats, (row) => ({
                date: formatDate(row?.date || row?._id),
                present: row?.present || 0,
                absent: row?.absent || 0,
                late: row?.late || 0,
                percentage: Number(row?.percentage || 0).toFixed(1),
              })),
            },
            {
              name: 'Student Stats',
              columns: [
                { key: 'studentName', header: 'Student' },
                { key: 'className', header: 'Class' },
                { key: 'present', header: 'Present' },
                { key: 'absent', header: 'Absent' },
                { key: 'late', header: 'Late' },
                { key: 'percentage', header: 'Attendance %' },
              ],
              rows: toWorksheetRows(attendanceSummary.studentStats, (row) => ({
                studentName: row?.studentName || row?.fullName || '-',
                className: row?.className || row?.class || '-',
                present: row?.present || 0,
                absent: row?.absent || 0,
                late: row?.late || 0,
                percentage: Number(row?.percentage || 0).toFixed(1),
              })),
            },
          ],
        });
        return;
      }

      if (reportType === 'exams') {
        downloadExcelWorkbook({
          filename: `exam-report-${dateRange.startDate}-${dateRange.endDate}.xls`,
          sheets: [
            {
              name: 'Summary',
              columns: [
                { key: 'label', header: 'Metric' },
                { key: 'value', header: 'Value' },
              ],
              rows: [
                { label: 'Total Exams', value: examReport.summary.totalExams || 0 },
                { label: 'Total Results', value: examReport.summary.totalResults || 0 },
                { label: 'Average Marks', value: examReport.summary.averageMarks || 0 },
                { label: 'Pass Percentage', value: Number(examReport.summary.passPercentage || 0).toFixed(1) },
                { label: 'Start Date', value: dateRange.startDate },
                { label: 'End Date', value: dateRange.endDate },
              ],
            },
            {
              name: 'Exams',
              columns: [
                { key: 'name', header: 'Exam' },
                { key: 'subject', header: 'Subject' },
                { key: 'className', header: 'Class' },
                { key: 'section', header: 'Section' },
                { key: 'date', header: 'Date' },
                { key: 'averageMarks', header: 'Average Marks' },
                { key: 'resultCount', header: 'Result Count' },
              ],
              rows: toWorksheetRows(examReport.exams, (row) => ({
                name: row?.name || row?.title || '-',
                subject: row?.subject?.name || row?.subject || '-',
                className: row?.grade || row?.class || '-',
                section: row?.section || '-',
                date: formatDate(row?.date || row?.examDate),
                averageMarks: row?.averageMarks || 0,
                resultCount: row?.resultCount || 0,
              })),
            },
            {
              name: 'Subject Performance',
              columns: [
                { key: 'subject', header: 'Subject' },
                { key: 'exams', header: 'Exams' },
                { key: 'averageMarks', header: 'Average Marks' },
                { key: 'highestMarks', header: 'Highest Marks' },
                { key: 'lowestMarks', header: 'Lowest Marks' },
              ],
              rows: toWorksheetRows(examReport.subjectPerformance, (row) => ({
                subject: row?.subject || '-',
                exams: row?.exams || 0,
                averageMarks: row?.averageMarks || 0,
                highestMarks: row?.highestMarks || 0,
                lowestMarks: row?.lowestMarks || 0,
              })),
            },
            {
              name: 'Top Students',
              columns: [
                { key: 'rank', header: 'Rank' },
                { key: 'studentName', header: 'Student' },
                { key: 'className', header: 'Class' },
                { key: 'subject', header: 'Subject' },
                { key: 'marks', header: 'Marks' },
                { key: 'grade', header: 'Grade' },
              ],
              rows: toWorksheetRows(examReport.topStudents, (row) => ({
                rank: row?.rank || 0,
                studentName: row?.studentName || '-',
                className: row?.class || '-',
                subject: row?.subject || '-',
                marks: `${row?.marksObtained || 0} / ${row?.totalMarks || 0}`,
                grade: row?.grade || '-',
              })),
            },
          ],
        });
        return;
      }

      if (reportType === 'fees') {
        downloadExcelWorkbook({
          filename: `fees-report-${today}.xls`,
          sheets: [
            {
              name: 'Summary',
              columns: [
                { key: 'label', header: 'Metric' },
                { key: 'value', header: 'Value' },
              ],
              rows: [
                { label: 'Total Fees', value: feeSummary.totalFees || 0 },
                { label: 'Collected', value: feeSummary.totalPaid || 0 },
                { label: 'Pending', value: feeSummary.totalPending || 0 },
                { label: 'Overdue Count', value: feeSummary.overdueCount || 0 },
              ],
            },
            {
              name: 'Recent Payments',
              columns: [
                { key: 'feeType', header: 'Fee Type' },
                { key: 'studentName', header: 'Student' },
                { key: 'paymentDate', header: 'Payment Date' },
                { key: 'amount', header: 'Amount' },
              ],
              rows: toWorksheetRows(feeReport.recentPayments || feeReport.records, (row) => ({
                feeType: row?.feeType || row?.title || row?.name || '-',
                studentName: row?.studentName || row?.fullName || '-',
                paymentDate: formatDate(row?.paymentDate || row?.date || row?.createdAt),
                amount: row?.amount || row?.amountPaid || row?.paidAmount || 0,
              })),
            },
            {
              name: 'By Class',
              columns: [
                { key: 'className', header: 'Class' },
                { key: 'totalFees', header: 'Total Fees' },
                { key: 'totalPaid', header: 'Collected' },
                { key: 'totalPending', header: 'Pending' },
                { key: 'overdueCount', header: 'Overdue Count' },
              ],
              rows: toWorksheetRows(feeReport.byClass, (row) => ({
                className: row?.class || row?.className || row?._id || '-',
                totalFees: row?.totalFees || row?.amount || 0,
                totalPaid: row?.totalPaid || row?.paid || 0,
                totalPending: row?.totalPending || row?.pending || 0,
                overdueCount: row?.overdueCount || 0,
              })),
            },
            {
              name: 'Status Breakdown',
              columns: [
                { key: 'status', header: 'Status' },
                { key: 'count', header: 'Count' },
                { key: 'amount', header: 'Amount' },
              ],
              rows: toWorksheetRows(feeReport.statusBreakdown, (row) => ({
                status: row?.status || row?.name || row?._id || '-',
                count: row?.count || row?.total || 0,
                amount: row?.amount || row?.totalAmount || 0,
              })),
            },
          ],
        });
        return;
      }

      downloadExcelWorkbook({
        filename: `overview-report-${today}.xls`,
        sheets: [
          {
            name: 'Dashboard Summary',
            columns: [
              { key: 'label', header: 'Metric' },
              { key: 'value', header: 'Value' },
            ],
            rows: [
              { label: 'Total Students', value: summary.totalStudents || dashboard.totalStudents || 0 },
              { label: 'Active Students', value: summary.activeStudents || 0 },
              { label: 'Total Teachers', value: summary.totalTeachers || dashboard.totalTeachers || 0 },
              { label: 'Total Subjects', value: summary.totalSubjects || dashboard.totalSubjects || 0 },
              { label: 'Total Materials', value: summary.totalMaterials || dashboard.totalMaterials || 0 },
              { label: 'Total Exams', value: summary.totalExams || 0 },
              { label: 'Average Attendance', value: Number(summary.avgAttendance || todayAttendance.percentage || 0).toFixed(1) },
              { label: 'Average Grade', value: summary.avgGrade || 0 },
              { label: 'Fees Collected', value: feeSummary.totalPaid || 0 },
              { label: 'Pending Fees', value: feeSummary.totalPending || 0 },
            ],
          },
          {
            name: 'Today Attendance',
            columns: [
              { key: 'label', header: 'Metric' },
              { key: 'value', header: 'Value' },
            ],
            rows: toKeyValueRows({
              Present: todayAttendance.present || 0,
              Absent: todayAttendance.absent || 0,
              Late: todayAttendance.late || 0,
              MarkedStudents: todayAttendance.markedStudents || 0,
              TotalStudents: todayAttendance.totalStudents || 0,
              Percentage: Number(todayAttendance.percentage || 0).toFixed(1),
            }),
          },
          {
            name: 'Class Distribution',
            columns: [
              { key: 'label', header: 'Class' },
              { key: 'count', header: 'Count' },
            ],
            rows: toWorksheetRows(analytics.classDistribution, (row) => ({
              label: row?._id || row?.class || row?.name || '-',
              count: row?.count || row?.total || row?.value || 0,
            })),
          },
          {
            name: 'Subject Distribution',
            columns: [
              { key: 'label', header: 'Subject' },
              { key: 'count', header: 'Count' },
            ],
            rows: toWorksheetRows(analytics.subjectDistribution, (row) => ({
              label: row?._id || row?.subject || row?.name || '-',
              count: row?.count || row?.total || row?.value || 0,
            })),
          },
          {
            name: 'Student Growth',
            columns: [
              { key: 'month', header: 'Month' },
              { key: 'year', header: 'Year' },
              { key: 'students', header: 'Students' },
            ],
            rows: toWorksheetRows(dashboard.studentGrowthTrend || dashboard.studentGrowth, (row) => ({
              month: row?.month || row?.label || '-',
              year: row?.year || '',
              students: row?.students || row?.count || row?.total || 0,
            })),
          },
          {
            name: 'Fee Collection Trend',
            columns: [
              { key: 'month', header: 'Month' },
              { key: 'year', header: 'Year' },
              { key: 'collected', header: 'Collected' },
              { key: 'pending', header: 'Pending' },
            ],
            rows: toWorksheetRows(dashboard.feeCollectionTrend || dashboard.feeCollectionGraph, (row) => ({
              month: row?.month || row?.label || '-',
              year: row?.year || '',
              collected: row?.collected || row?.totalCollected || row?.paid || 0,
              pending: row?.pending || row?.totalPending || row?.due || 0,
            })),
          },
          {
            name: 'Recent Students',
            columns: [
              { key: 'fullName', header: 'Student' },
              { key: 'className', header: 'Class' },
              { key: 'section', header: 'Section' },
              { key: 'rollNumber', header: 'Roll Number' },
            ],
            rows: toWorksheetRows(dashboard.recentStudents, (row) => ({
              fullName: row?.fullName || row?.name || '-',
              className: row?.className || row?.class || '-',
              section: row?.sectionName || row?.section || '-',
              rollNumber: row?.rollNumber || row?.rollNo || '-',
            })),
          },
        ],
      });
    } catch (error) {
      toast.error('Failed to export report');
    }
  };

  const attendanceSummary = attendanceReport.summary || EMPTY_ATTENDANCE_REPORT.summary;
  const feeSummary = feeReport.summary || feeReport;
  const todayAttendance = dashboard.todayAttendance || EMPTY_DASHBOARD.todayAttendance;
  const overviewCards = [
    {
      label: 'Students',
      value: formatNumber(summary.totalStudents || dashboard.totalStudents),
      hint: `${formatNumber(summary.activeStudents || 0)} active profiles`,
      icon: Users,
    },
    {
      label: 'Teachers',
      value: formatNumber(summary.totalTeachers || dashboard.totalTeachers),
      hint: `${formatNumber(summary.totalSubjects || dashboard.totalSubjects)} assigned subjects`,
      icon: GraduationCap,
    },
    {
      label: 'Attendance',
      value: formatPercent(summary.avgAttendance || todayAttendance.percentage || 0),
      hint: `${formatNumber(todayAttendance.markedStudents || 0)} students marked today`,
      icon: Activity,
    },
    {
      label: 'Collections',
      value: formatCurrency(feeSummary.totalPaid || 0),
      hint: `${formatCurrency(feeSummary.totalPending || 0)} still pending`,
      icon: CircleDollarSign,
    },
  ];

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        {overviewCards.map((card) => (
          <StatPanel
            key={card.label}
            label={card.label}
            value={card.value}
            hint={card.hint}
            icon={card.icon}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard eyebrow="School Summary" title="Operational snapshot">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <SimpleMetricRow label="Total materials" value={formatNumber(summary.totalMaterials || dashboard.totalMaterials)} />
            <SimpleMetricRow label="Total exams" value={formatNumber(summary.totalExams || 0)} />
            <SimpleMetricRow label="Average grade" value={formatNumber(summary.avgGrade || 0)} />
            <SimpleMetricRow label="Today's present" value={formatNumber(todayAttendance.present || 0)} accent="text-emerald-700" />
            <SimpleMetricRow label="Today's absent" value={formatNumber(todayAttendance.absent || 0)} accent="text-rose-700" />
            <SimpleMetricRow label="Today's late" value={formatNumber(todayAttendance.late || 0)} accent="text-amber-700" />
          </div>
        </SectionCard>

        <SectionCard eyebrow="Fee Desk" title="Collections snapshot">
          <div className="space-y-3">
            <SimpleMetricRow label="Total billed" value={formatCurrency(feeSummary.totalFees || 0)} />
            <SimpleMetricRow label="Collected" value={formatCurrency(feeSummary.totalPaid || 0)} accent="text-emerald-700" />
            <SimpleMetricRow label="Pending" value={formatCurrency(feeSummary.totalPending || 0)} accent="text-amber-700" />
            <SimpleMetricRow label="Overdue accounts" value={formatNumber(feeSummary.overdueCount || 0)} accent="text-rose-700" />
          </div>
        </SectionCard>
      </div>

      {role === 'admin' ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <SectionCard eyebrow="Class Mix" title="Student distribution by class">
            <DistributionList
              items={analytics.classDistribution || []}
              emptyMessage="No class distribution data is available yet."
            />
          </SectionCard>

          <SectionCard eyebrow="Subject Mix" title="Subject load">
            <DistributionList
              items={analytics.subjectDistribution || []}
              emptyMessage="No subject distribution data is available yet."
            />
          </SectionCard>
        </div>
      ) : null}
    </div>
  );

  const renderAttendanceReport = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <StatPanel label="Records" value={formatNumber(attendanceReport.count || 0)} hint="Attendance rows in selected period" icon={CalendarDays} />
        <StatPanel label="Present" value={formatNumber(getBucketCount(attendanceSummary.statusStats, 'present'))} hint="Students marked present" icon={TrendingUp} />
        <StatPanel label="Absent" value={formatNumber(getBucketCount(attendanceSummary.statusStats, 'absent'))} hint="Students marked absent" icon={Users} />
        <StatPanel label="Late" value={formatNumber(getBucketCount(attendanceSummary.statusStats, 'late'))} hint="Students marked late" icon={Activity} />
      </div>

      <SectionCard eyebrow="Attendance Trend" title="Daily class movement">
        <DataTable
          columns={[
            { key: 'date', label: 'Date', render: (row) => formatDate(row.date || row._id) },
            { key: 'present', label: 'Present' },
            { key: 'absent', label: 'Absent' },
            { key: 'late', label: 'Late' },
            { key: 'percentage', label: 'Attendance %', render: (row) => formatPercent(row.percentage || 0) },
          ]}
          rows={(attendanceSummary.dailyStats || []).slice(0, 12)}
          emptyMessage="No daily attendance data found for the selected range."
        />
      </SectionCard>

      <SectionCard eyebrow="Student Breakdown" title="Most active records">
        <DataTable
          columns={[
            { key: 'studentName', label: 'Student', render: (row) => row.studentName || row.fullName || '-' },
            { key: 'className', label: 'Class', render: (row) => row.className || row.class || '-' },
            { key: 'present', label: 'Present' },
            { key: 'absent', label: 'Absent' },
            { key: 'late', label: 'Late' },
            { key: 'percentage', label: 'Attendance %', render: (row) => formatPercent(row.percentage || 0) },
          ]}
          rows={(attendanceSummary.studentStats || []).slice(0, 12)}
          emptyMessage="No student attendance breakdown is available."
        />
      </SectionCard>
    </div>
  );

  const renderExamReport = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <StatPanel label="Exams" value={formatNumber(examReport.summary.totalExams || 0)} hint="Exam events in selected period" icon={FileText} />
        <StatPanel label="Results" value={formatNumber(examReport.summary.totalResults || 0)} hint="Published student results" icon={BookOpen} />
        <StatPanel label="Average Marks" value={formatNumber(examReport.summary.averageMarks || 0)} hint="Average score across results" icon={TrendingUp} />
        <StatPanel label="Pass Rate" value={formatPercent(examReport.summary.passPercentage || 0)} hint="Students meeting passing marks" icon={GraduationCap} />
      </div>

      <SectionCard eyebrow="Exam Board" title="Exam overview">
        <DataTable
          columns={[
            { key: 'name', label: 'Exam' },
            { key: 'subject', label: 'Subject', render: (row) => row.subject?.name || '-' },
            { key: 'grade', label: 'Class', render: (row) => row.grade || row.class || '-' },
            { key: 'date', label: 'Date', render: (row) => formatDate(row.date || row.examDate) },
            { key: 'averageMarks', label: 'Average', render: (row) => formatNumber(row.averageMarks || 0) },
            { key: 'resultCount', label: 'Results', render: (row) => formatNumber(row.resultCount || 0) },
          ]}
          rows={examReport.exams || []}
          emptyMessage="No exam records are available for the selected range."
        />
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SectionCard eyebrow="Subject Performance" title="Subject-level averages">
          <DistributionList
            items={examReport.subjectPerformance || []}
            valueKey="averageMarks"
            emptyMessage="No subject performance data is available."
          />
        </SectionCard>

        <SectionCard eyebrow="Merit List" title="Top-performing students">
          <DataTable
            columns={[
              { key: 'rank', label: 'Rank' },
              { key: 'studentName', label: 'Student' },
              { key: 'class', label: 'Class' },
              { key: 'subject', label: 'Subject' },
              { key: 'marksObtained', label: 'Marks', render: (row) => `${formatNumber(row.marksObtained || 0)} / ${formatNumber(row.totalMarks || 0)}` },
            ]}
            rows={(examReport.topStudents || []).slice(0, 10)}
            emptyMessage="No ranked exam results are available."
          />
        </SectionCard>
      </div>
    </div>
  );

  const renderFeeReport = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <StatPanel label="Billed" value={formatCurrency(feeSummary.totalFees || 0)} hint="Total fee amount raised" icon={Receipt} />
        <StatPanel label="Collected" value={formatCurrency(feeSummary.totalPaid || 0)} hint="Payments received so far" icon={CircleDollarSign} />
        <StatPanel label="Pending" value={formatCurrency(feeSummary.totalPending || 0)} hint="Outstanding amount still due" icon={BarChart3} />
        <StatPanel label="Overdue" value={formatNumber(feeSummary.overdueCount || 0)} hint="Accounts needing follow-up" icon={Activity} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <SectionCard eyebrow="Status Breakdown" title="Collections health">
          <div className="space-y-3">
            <SimpleMetricRow label="Collection ratio" value={formatPercent((feeSummary.totalFees ? ((feeSummary.totalPaid / feeSummary.totalFees) * 100) : 0))} />
            <SimpleMetricRow label="Pending ratio" value={formatPercent((feeSummary.totalFees ? ((feeSummary.totalPending / feeSummary.totalFees) * 100) : 0))} accent="text-amber-700" />
            <SimpleMetricRow label="Overdue students" value={formatNumber(feeSummary.overdueCount || 0)} accent="text-rose-700" />
          </div>
        </SectionCard>

        <SectionCard eyebrow="Recent Collections" title="Latest payment activity">
          <DataTable
            columns={[
              { key: 'feeType', label: 'Fee Type', render: (row) => row.feeType || row.title || row.name || '-' },
              { key: 'studentName', label: 'Student', render: (row) => row.studentName || row.fullName || '-' },
              { key: 'paymentDate', label: 'Date', render: (row) => formatDate(row.paymentDate || row.date || row.createdAt) },
              { key: 'amount', label: 'Amount', render: (row) => formatCurrency(row.amount || row.amountPaid || row.paidAmount || 0) },
            ]}
            rows={(feeReport.recentPayments || feeReport.records || []).slice(0, 10)}
            emptyMessage="No payment activity is available yet."
          />
        </SectionCard>
      </div>
    </div>
  );

  const isBusy = loadingOverview || loadingReport;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-r from-[#002366] to-[#173f8c] px-6 py-6 text-white shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/70">Reports Workspace</p>
            <h1 className="mt-3 text-3xl font-semibold">Live analytics and operational reporting</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/80">
              This page now reads from the backend report services, so the numbers here match the live admin and finance data instead of placeholders.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {reportType === 'attendance' || reportType === 'exams' || reportType === 'overview' || reportType === 'fees' ? (
              <button
                type="button"
                onClick={handleExport}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
              >
                <Download className="h-4 w-4" />
                Export {REPORT_LABELS[reportType]}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {reportOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setReportType(option)}
                className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                  reportType === option
                    ? 'bg-[#002366] text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {REPORT_LABELS[option]}
              </button>
            ))}
          </div>

          {role === 'admin' && (reportType === 'attendance' || reportType === 'exams') ? (
            <div className="flex flex-wrap gap-4">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Start</span>
                <input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(event) => setDateRange((current) => ({ ...current, startDate: event.target.value }))}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-[#002366] focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">End</span>
                <input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(event) => setDateRange((current) => ({ ...current, endDate: event.target.value }))}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-[#002366] focus:outline-none"
                />
              </label>
            </div>
          ) : null}
        </div>
      </div>

      {isBusy ? (
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500 shadow-sm">
          Loading live report data...
        </div>
      ) : null}

      {!isBusy && reportType === 'overview' ? renderOverview() : null}
      {!isBusy && reportType === 'attendance' ? renderAttendanceReport() : null}
      {!isBusy && reportType === 'exams' ? renderExamReport() : null}
      {!isBusy && reportType === 'fees' ? renderFeeReport() : null}
    </div>
  );
};

export default Reports;
