const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const {
  getSections,
  getSectionById,
  createSection,
  updateSection,
  deleteSection,
} = require('../controllers/sectionController');

router.use(protect);

router.route('/')
  .get(getSections)
  .post(authorize('admin'), createSection);

router.route('/:id')
  .get(getSectionById)
  .put(authorize('admin'), updateSection)
  .delete(authorize('admin'), deleteSection);

module.exports = router;
