const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const {
  getSummary,
  getConcessions,
  postConcession,
  patchConcessionReview,
  getRefunds,
  postRefund,
  patchRefundReview,
} = require('../controllers/financeOpsController');

const router = express.Router();

router.use(protect);
router.use(authorize('admin', 'accountant'));

router.get('/summary', getSummary);
router.get('/concessions', getConcessions);
router.post('/concessions', postConcession);
router.put('/concessions/:id/review', patchConcessionReview);
router.get('/refunds', getRefunds);
router.post('/refunds', postRefund);
router.put('/refunds/:id/review', patchRefundReview);

module.exports = router;
