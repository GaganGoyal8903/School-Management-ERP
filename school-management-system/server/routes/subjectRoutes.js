const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const {
  getSubjects,
  getSubject,
  createSubject,
  updateSubject,
  deleteSubject,
  getSubjectsByGrade,
  getSubjectCount,
  assignTeacherToSubject,
} = require('../controllers/subjectController');

router.use(protect);

router.get('/', authorize('admin', 'teacher'), getSubjects);
router.get('/count', authorize('admin', 'teacher'), getSubjectCount);
router.get('/grade/:grade', authorize('admin', 'teacher'), getSubjectsByGrade);
router.post('/', authorize('admin'), createSubject);
router.put('/:id/assign-teacher', authorize('admin'), assignTeacherToSubject);
router.get('/:id', authorize('admin', 'teacher'), getSubject);
router.put('/:id', authorize('admin'), updateSubject);
router.delete('/:id', authorize('admin'), deleteSubject);

module.exports = router;
