const { asyncHandler } = require('../middleware/errorMiddleware');
const {
  getDashboardReport,
  getAnalyticsReport,
  getSummaryReportData,
  getAttendanceReportData,
  getAttendanceExportRows,
  getExamReportData,
  getExamExportRows,
  getFeeReportData,
} = require('../services/reportSqlService');

// @desc    Get dashboard statistics
// @route   GET /api/reports/dashboard
// @access  Private
const getDashboardStats = asyncHandler(async (req, res) => {
  const dashboard = await getDashboardReport({
    role: req.user?.role,
    userId: req.user?._id,
  });

  res.json({
    success: true,
    data: dashboard,
    ...dashboard,
  });
});

// @desc    Get analytics data
// @route   GET /api/reports/analytics
// @access  Private (Admin, Teacher)
const getAnalytics = asyncHandler(async (req, res) => {
  const analytics = await getAnalyticsReport({ period: req.query.period });

  res.json({
    success: true,
    analytics,
  });
});

// @desc    Get summary report
// @route   GET /api/reports/summary
// @access  Private
const getSummaryReport = asyncHandler(async (req, res) => {
  const summary = await getSummaryReportData();

  res.json({
    success: true,
    summary,
  });
});

// @desc    Get attendance report
// @route   GET /api/reports/attendance
// @access  Private (Admin)
const getAttendanceReport = asyncHandler(async (req, res) => {
  const data = await getAttendanceReportData({
    className: req.query.class || req.query.grade,
    sectionName: req.query.section,
    startDate: req.query.startDate,
    endDate: req.query.endDate,
  });

  res.json({
    success: true,
    data,
  });
});

// @desc    Export attendance report
// @route   GET /api/reports/attendance/export
// @access  Private (Admin)
const exportAttendanceReport = asyncHandler(async (req, res) => {
  const data = await getAttendanceExportRows({
    className: req.query.class || req.query.grade,
    sectionName: req.query.section,
    startDate: req.query.startDate,
    endDate: req.query.endDate,
  });

  res.json({
    success: true,
    data,
    count: data.length,
  });
});

// @desc    Get fee report
// @route   GET /api/reports/fees
// @access  Private (Admin)
const getFeeReport = asyncHandler(async (req, res) => {
  const data = await getFeeReportData({ academicYear: req.query.academicYear });

  res.json({
    success: true,
    data,
  });
});

// @desc    Get exam report
// @route   GET /api/reports/exams
// @access  Private (Admin)
const getExamReport = asyncHandler(async (req, res) => {
  const data = await getExamReportData({
    startDate: req.query.startDate,
    endDate: req.query.endDate,
  });

  res.json({
    success: true,
    data,
  });
});

// @desc    Export exam report
// @route   GET /api/reports/exams/export
// @access  Private (Admin)
const exportExamReport = asyncHandler(async (req, res) => {
  const data = await getExamExportRows({
    startDate: req.query.startDate,
    endDate: req.query.endDate,
  });

  res.json({
    success: true,
    data,
    count: data.length,
  });
});

module.exports = {
  getDashboardStats,
  getAnalytics,
  getSummaryReport,
  getAttendanceReport,
  exportAttendanceReport,
  getFeeReport,
  getExamReport,
  exportExamReport,
};
