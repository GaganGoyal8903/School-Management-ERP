const express = require('express');
const router = express.Router();
const { 
  markAttendance,
  markBulkAttendance,
  getAttendance,
  getAttendanceReport,
  getStudentAttendance,
  deleteAttendance
} = require('../controllers/attendanceController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

// All routes require authentication
router.use(protect);

// Attendance routes
router.route('/')
  .get(authorize('admin', 'teacher'), getAttendance)
  .post(authorize('admin', 'teacher'), markAttendance);

router.post('/bulk', authorize('admin', 'teacher'), markBulkAttendance);

router.get('/report', authorize('admin', 'teacher'), getAttendanceReport);

router.get('/student/:studentId', getStudentAttendance);

router.delete('/:id', authorize('admin'), deleteAttendance);

module.exports = router;

