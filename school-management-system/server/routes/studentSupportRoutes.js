const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const {
  getSupportSummary,
  getRemarks,
  postRemark,
  patchRemarkStatus,
  getInterventions,
  postIntervention,
  patchInterventionStatus,
} = require('../controllers/studentSupportController');

const router = express.Router();

router.use(protect);
router.use(authorize('admin', 'teacher'));

router.get('/summary', getSupportSummary);
router.get('/remarks', getRemarks);
router.post('/remarks', postRemark);
router.put('/remarks/:id/status', patchRemarkStatus);
router.get('/interventions', getInterventions);
router.post('/interventions', postIntervention);
router.put('/interventions/:id/status', patchInterventionStatus);

module.exports = router;
