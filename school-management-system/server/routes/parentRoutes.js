const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { 
  parentLogin,
  getLinkedStudents,
  getParentProfile,
  getChildInfo,
  getChildAttendance,
  getChildGrades,
  getChildHomework,
  getChildExams,
  getAnnouncements,
  getParentDashboard,
  createParent,
  updateParentProfile
} = require('../controllers/parentController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const { asyncHandler } = require('../middleware/errorMiddleware');

const parentLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts. Please use the supported login flow or try again later.',
  },
});

const blockLegacyParentLoginInProduction = (req, res, next) => {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_LEGACY_PARENT_LOGIN !== 'true') {
    return res.status(404).json({
      success: false,
      message: 'Parent legacy login is not available in production.',
    });
  }

  return next();
};

// ==================== PUBLIC ROUTES ====================
// Parent Login - Public endpoint
router.post('/login', parentLoginLimiter, blockLegacyParentLoginInProduction, asyncHandler(parentLogin));
router.post('/', protect, authorize('admin'), asyncHandler(createParent));

// ==================== PROTECTED ROUTES ====================
// All parent self-service routes require parent authentication
router.use(protect);
router.use(authorize('parent'));

// Get linked students for parent
router.get('/students', asyncHandler(getLinkedStudents));

// Get parent profile
router.get('/profile', asyncHandler(getParentProfile));

// Get child info
router.get('/child', asyncHandler(getChildInfo));

// Get child's attendance
router.get('/attendance', asyncHandler(getChildAttendance));

// Get child's grades
router.get('/grades', asyncHandler(getChildGrades));

// Get child's homework
router.get('/homework', asyncHandler(getChildHomework));

// Get child's exams
router.get('/exams', asyncHandler(getChildExams));

// Get announcements
router.get('/announcements', asyncHandler(getAnnouncements));

// Get parent dashboard
router.get('/dashboard', asyncHandler(getParentDashboard));

// Update parent profile
router.put('/profile', asyncHandler(updateParentProfile));

module.exports = router;

