const express = require('express');
const router = express.Router();
const { 
  getTimetables, 
  getTimetableById, 
  getTimetableByClass, 
  createTimetable, 
  updateTimetable, 
  deleteTimetable,
  getTeacherTimetable,
  copyTimetable
} = require('../controllers/timetableController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

// Protected routes
router.use(protect);

// Get timetable by class
router.get('/class/:class', authorize('admin', 'teacher', 'parent'), getTimetableByClass);

// Get teacher's timetable
router.get('/teacher/:teacherId', authorize('admin', 'teacher'), getTeacherTimetable);

// Copy timetable
router.post('/copy', authorize('admin'), copyTimetable);

// CRUD operations
router.route('/')
  .get(authorize('admin'), getTimetables)
  .post(authorize('admin'), createTimetable);

router.route('/:id')
  .get(authorize('admin', 'teacher'), getTimetableById)
  .put(authorize('admin'), updateTimetable)
  .delete(authorize('admin'), deleteTimetable);

module.exports = router;

