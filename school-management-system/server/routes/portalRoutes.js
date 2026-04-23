const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const {
  listBranchRecords,
  saveBranchRecord,
  removeBranchRecord,
  linkParentStudentRecord,
  getParentStudentLinks,
  setParentStudentLinkPrimary,
  removeParentStudentLink,
  getParentDashboardSnapshot,
  getPortalNotifications,
  createPortalNotification,
  markPortalNotificationRead,
  getMessagingContacts,
  getMessagingConversations,
  getMessagingConversationMessages,
  createPortalMessage,
  getPortalMeetings,
  createMeetingRequest,
  reviewMeetingRequest,
  cancelMeetingRequest,
} = require('../controllers/portalController');

router.use(protect);

router.get('/parent/dashboard', authorize('parent'), getParentDashboardSnapshot);
router.get('/parent-links', authorize('admin', 'parent'), getParentStudentLinks);
router.post('/parent-links', authorize('admin'), linkParentStudentRecord);
router.put('/parent-links/:id/primary', authorize('admin', 'parent'), setParentStudentLinkPrimary);
router.delete('/parent-links/:id', authorize('admin', 'parent'), removeParentStudentLink);

router.get('/branches', authorize('admin'), listBranchRecords);
router.post('/branches', authorize('admin'), saveBranchRecord);
router.put('/branches/:id', authorize('admin'), saveBranchRecord);
router.delete('/branches/:id', authorize('admin'), removeBranchRecord);

router.get('/notifications', getPortalNotifications);
router.post('/notifications', authorize('admin', 'teacher'), createPortalNotification);
router.put('/notifications/:id/read', markPortalNotificationRead);

router.get('/contacts', authorize('admin', 'teacher', 'parent', 'accountant'), getMessagingContacts);
router.get('/conversations', authorize('admin', 'teacher', 'parent', 'accountant'), getMessagingConversations);
router.get('/conversations/:id/messages', authorize('admin', 'teacher', 'parent', 'accountant'), getMessagingConversationMessages);
router.post('/messages', authorize('admin', 'teacher', 'parent', 'accountant'), createPortalMessage);

router.get('/meetings', authorize('admin', 'teacher', 'parent'), getPortalMeetings);
router.post('/meetings', authorize('parent'), createMeetingRequest);
router.put('/meetings/:id/review', authorize('admin', 'teacher'), reviewMeetingRequest);
router.put('/meetings/:id/cancel', authorize('admin', 'teacher', 'parent'), cancelMeetingRequest);

module.exports = router;
