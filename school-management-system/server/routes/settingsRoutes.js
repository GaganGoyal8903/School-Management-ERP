const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const {
  getSettingsSnapshot,
  saveSettingsSnapshot,
  getAuditLogFeed,
  getSettingsUsers,
  adminResetPassword,
} = require('../controllers/settingsController');

router.use(protect);

router.get('/', authorize('admin'), getSettingsSnapshot);
router.put('/', authorize('admin'), saveSettingsSnapshot);
router.get('/audit-logs', authorize('admin'), getAuditLogFeed);
router.get('/users', authorize('admin'), getSettingsUsers);
router.post('/users/reset-password', authorize('admin'), adminResetPassword);

module.exports = router;
