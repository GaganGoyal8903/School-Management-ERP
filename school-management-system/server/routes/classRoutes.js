const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const {
  getClasses,
  getClassById,
  createClass,
  updateClass,
  deleteClass,
} = require('../controllers/classController');

router.use(protect);

router.route('/')
  .get(getClasses)
  .post(authorize('admin'), createClass);

router.route('/:id')
  .get(getClassById)
  .put(authorize('admin'), updateClass)
  .delete(authorize('admin'), deleteClass);

module.exports = router;
