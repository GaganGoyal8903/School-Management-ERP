const express = require('express');
const router = express.Router();
const { 
  getTeachers, 
  getTeacher, 
  createTeacher, 
  updateTeacher, 
  deleteTeacher,
  getTeacherCount,
  getAvailableTeachers
} = require('../controllers/teacherController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

// All routes require authentication
router.use(protect);

// Teacher CRUD routes - GET accessible to all authenticated users, POST/PUT/DELETE for admin only
router.route('/')
  .get(getTeachers)  // Allow all authenticated users to view teachers
  .post(authorize('admin'), createTeacher);  // Only admin can create

router.route('/count')
  .get(getTeacherCount);

router.route('/available')
  .get(getAvailableTeachers);

router.route('/:id')
  .get(getTeacher)
  .put(authorize('admin'), updateTeacher)
  .delete(authorize('admin'), deleteTeacher);

module.exports = router;

