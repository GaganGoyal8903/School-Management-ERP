const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const {
  askSchoolAssistant,
  generateLessonPlan,
  generateQuiz,
  generateHomework,
} = require('../controllers/aiController');

router.use(protect);
router.use(authorize('admin', 'teacher'));

router.post('/assistant', askSchoolAssistant);
router.post('/lesson-plan', generateLessonPlan);
router.post('/quiz', generateQuiz);
router.post('/homework', generateHomework);

module.exports = router;
