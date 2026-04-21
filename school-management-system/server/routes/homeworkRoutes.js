const express = require('express');
const router = express.Router();
const {
  getHomework,
  getHomeworkByClass,
  getHomeworkByStudent,
  createHomework,
  updateHomework,
  deleteHomework,
  submitHomework,
  gradeSubmission,
  getSubmissions,
} = require('../controllers/homeworkController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

router.use(protect);

router.route('/')
  .get(authorize('admin', 'teacher'), getHomework)
  .post(authorize('admin', 'teacher'), createHomework);

router.get('/class/:class', authorize('admin', 'teacher'), getHomeworkByClass);
router.get('/student/:studentId', authorize('admin', 'teacher', 'student', 'parent'), getHomeworkByStudent);
router.post('/:id/submit', authorize('student'), submitHomework);
router.get('/:id/submissions', authorize('admin', 'teacher'), getSubmissions);
router.put('/submission/:id/grade', authorize('admin', 'teacher'), gradeSubmission);

router.route('/:id')
  .put(authorize('admin', 'teacher'), updateHomework)
  .delete(authorize('admin', 'teacher'), deleteHomework);

module.exports = router;
