const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { 
  studentLogin,
  getStudentTimetable,
  getStudents, 
  getAllStudents,
  getStudent, 
  getCurrentStudentDetails,
  getStudentPortalProfiles,
  getStudentPortalProfile,
  getStudentDetails,
  createStudent, 
  updateStudent, 
  updateStudentPortalProfile,
  promoteStudentPortalProfile,
  deleteStudent,
  getStudentsByClass,
  getStudentCount
} = require('../controllers/studentController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { asyncHandler } = require('../middleware/errorMiddleware');

const legacyStudentLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts. Please use the main login flow or try again later.',
  },
});

const blockLegacyStudentLoginInProduction = (req, res, next) => {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_LEGACY_STUDENT_LOGIN !== 'true') {
    return res.status(404).json({
      success: false,
      message: 'Student legacy login is not available in production.',
    });
  }

  return next();
};

// ==================== PUBLIC ROUTES ====================
// Student Login - Public endpoint
router.post('/login', legacyStudentLoginLimiter, blockLegacyStudentLoginInProduction, asyncHandler(studentLogin));

// ==================== PROTECTED ROUTES ====================
// All other routes require authentication
router.use(protect);

// Student CRUD routes (Admin only for create/delete)
router.route('/')
  .get(authorize('admin', 'teacher'), getStudents)
  .post(authorize('admin'), createStudent);

router.route('/all')
  .get(authorize('admin', 'teacher'), getAllStudents);

router.route('/count')
  .get(authorize('admin', 'teacher'), getStudentCount);

router.route('/class/:class')
  .get(authorize('admin', 'teacher'), getStudentsByClass);

// Student timetable - accessible by student or admin/teachers
router.get('/timetable/:studentId', authorize('admin', 'teacher', 'student'), asyncHandler(getStudentTimetable));

// Current logged-in student portal data
router.get('/me/details', authorize('student'), getCurrentStudentDetails);

// Admin-managed portal profiles for student logins missing full student records
router.route('/portal-profiles')
  .get(authorize('admin'), getStudentPortalProfiles);

router.route('/portal-profiles/:profileId')
  .get(authorize('admin'), getStudentPortalProfile)
  .put(authorize('admin'), updateStudentPortalProfile);

router.post('/portal-profiles/:profileId/promote', authorize('admin'), promoteStudentPortalProfile);

// Complete student details - Admin/Teacher
router.get('/:id/details', authorize('admin', 'teacher'), getStudentDetails);

router.route('/:id')
  .get(authorize('admin', 'teacher', 'student'), getStudent)
  .put(authorize('admin'), updateStudent)
  .delete(authorize('admin'), deleteStudent);

module.exports = router;

