const express = require('express');
const router = express.Router();
const { 
  studentLogin,
  getStudentTimetable,
  getStudents, 
  getStudent, 
  createStudent, 
  updateStudent, 
  deleteStudent,
  getStudentsByClass,
  getStudentCount
} = require('../controllers/studentController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { asyncHandler } = require('../middleware/errorMiddleware');

// ==================== PUBLIC ROUTES ====================
// Student Login - Public endpoint
router.post('/login', asyncHandler(studentLogin));

// ==================== PROTECTED ROUTES ====================
// All other routes require authentication
router.use(protect);

// Student CRUD routes (Admin only for create/delete)
router.route('/')
  .get(authorize('admin', 'teacher'), getStudents)
  .post(authorize('admin'), createStudent);

router.route('/count')
  .get(getStudentCount);

router.route('/class/:class')
  .get(getStudentsByClass);

// Student timetable - accessible by student or admin/teachers
router.get('/timetable/:studentId', asyncHandler(getStudentTimetable));

router.route('/:id')
  .get(getStudent)
  .put(authorize('admin'), updateStudent)
  .delete(authorize('admin'), deleteStudent);

module.exports = router;

