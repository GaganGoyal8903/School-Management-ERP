const express = require('express');
const router = express.Router();
const { 
  getDashboardStats,
  getAnalytics,
  getSummaryReport,
  exportAttendanceReport
} = require('../controllers/reportController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

// All routes require authentication
router.use(protect);

// Report routes
router.get('/dashboard', getDashboardStats);

router.get('/analytics', authorize('admin', 'teacher'), getAnalytics);

router.get('/summary', getSummaryReport);

router.get('/attendance/export', authorize('admin'), exportAttendanceReport);

module.exports = router;

