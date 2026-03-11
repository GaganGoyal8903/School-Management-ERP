const express = require('express');
const router = express.Router();
const { 
  getExams,
  getExam,
  createExam,
  updateExam,
  deleteExam,
  enterMarks,
  getStudentResults,
  getExamReport
} = require('../controllers/examController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

// All routes require authentication
router.use(protect);

// Exam routes
router.route('/')
  .get(getExams)
  .post(authorize('admin', 'teacher'), createExam);

router.get('/results/:studentId', getStudentResults);

router.get('/report/:examId', getExamReport);

router.route('/:id')
  .get(getExam)
  .put(authorize('admin', 'teacher'), updateExam)
  .delete(authorize('admin'), deleteExam);

router.post('/:id/marks', authorize('admin', 'teacher'), enterMarks);

module.exports = router;

