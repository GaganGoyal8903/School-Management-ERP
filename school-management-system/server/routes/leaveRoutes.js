const express = require('express');
const router = express.Router();
const {
  listPendingLeaveRequests,
  getLeaveReviewHistory,
  reviewPendingLeaveRequest,
} = require('../controllers/leaveController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

router.use(protect);
router.use(authorize('admin', 'teacher'));

router.get('/pending', listPendingLeaveRequests);
router.get('/history', getLeaveReviewHistory);
router.put('/:id/review', reviewPendingLeaveRequest);

module.exports = router;
