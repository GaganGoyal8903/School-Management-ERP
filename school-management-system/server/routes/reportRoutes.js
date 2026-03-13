const express = require('express');
const router = express.Router();
const {
  getDashboardStats,
  getAnalytics,
  getSummaryReport,
  getAttendanceReport,
  exportAttendanceReport,
  getFeeReport,
  getExamReport,
  exportExamReport,
} = require('../controllers/reportController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

router.use(protect);

router.get('/dashboard', getDashboardStats);
router.get('/analytics', authorize('admin', 'teacher'), getAnalytics);
router.get('/summary', getSummaryReport);
router.get('/attendance', authorize('admin'), getAttendanceReport);
router.get('/attendance/export', authorize('admin'), exportAttendanceReport);
router.get('/fees', authorize('admin'), getFeeReport);
router.get('/exams', authorize('admin'), getExamReport);
router.get('/exams/export', authorize('admin'), exportExamReport);

module.exports = router;
