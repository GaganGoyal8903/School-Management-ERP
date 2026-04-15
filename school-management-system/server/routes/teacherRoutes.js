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

// Teacher records are managed centrally by admins.
router.route('/')
  .get(authorize('admin'), getTeachers)
  .post(authorize('admin'), createTeacher);

router.route('/count')
  .get(authorize('admin'), getTeacherCount);

router.route('/available')
  .get(authorize('admin'), getAvailableTeachers);

router.route('/:id')
  .get(authorize('admin'), getTeacher)
  .put(authorize('admin'), updateTeacher)
  .delete(authorize('admin'), deleteTeacher);

module.exports = router;

