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
  getExamReport,
  getExamPaper,
  updateExamPaper,
  startOnlineExamSession,
  submitOnlineExamSession,
} = require('../controllers/examController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

// All routes require authentication
router.use(protect);

// Exam routes
router.route('/')
  .get(authorize('admin', 'teacher'), getExams)
  .post(authorize('admin', 'teacher'), createExam);

router.get('/results/:studentId', authorize('admin', 'teacher', 'student'), getStudentResults);

router.get('/report/:examId', authorize('admin', 'teacher'), getExamReport);

router.get('/:id/paper', authorize('admin', 'teacher'), getExamPaper);
router.put('/:id/paper', authorize('admin', 'teacher'), updateExamPaper);

router.post('/:id/online-session/start', authorize('student'), startOnlineExamSession);
router.post('/:id/online-session/submit', authorize('student'), submitOnlineExamSession);

router.route('/:id')
  .get(authorize('admin', 'teacher'), getExam)
  .put(authorize('admin', 'teacher'), updateExam)
  .delete(authorize('admin'), deleteExam);

router.post('/:id/marks', authorize('admin', 'teacher'), enterMarks);

module.exports = router;

