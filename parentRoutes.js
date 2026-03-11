const express = require('express');
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

// ==================== PUBLIC ROUTES ====================
// Parent Login - Public endpoint
router.post('/login', asyncHandler(parentLogin));

// ==================== PROTECTED ROUTES ====================
// All other routes require authentication
router.use(protect);

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

// ==================== ADMIN ROUTES ====================
// Create parent (Admin only)
router.post('/', authorize('admin'), asyncHandler(createParent));

module.exports = router;

