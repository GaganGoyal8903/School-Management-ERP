const { asyncHandler } = require('../middleware/errorMiddleware');
const { getAuthUserByEmailRole } = require('../services/authSqlService');
const mongoose = require('mongoose');
const Notice = require('../models/Notice');
const User = require('../models/User');
const {
  listBranches,
  upsertBranch,
  deleteBranch,
  createParentStudentLink,
  listParentStudentLinks,
  setPrimaryParentStudentLink,
  deactivateParentStudentLink,
  createNotification,
  getNotificationInbox,
  markNotificationRead,
  getPortalContacts,
  getConversationList,
  getConversationMessages,
  sendPortalMessage,
  listPortalMeetings,
  createPortalMeeting,
  reviewPortalMeeting,
  cancelPortalMeeting,
  getParentPortalSnapshot,
} = require('../services/portalFoundationSqlService');

const getAuthUserId = (req) => {
  const rawValue = req.user?.id ?? req.user?.UserId ?? req.user?.userId ?? req.user?._id;
  const numericValue = Number(rawValue);
  return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
};

const getAuthRole = (req) => String(req.user?.roleKey || req.user?.role || '').trim().toLowerCase();

const mapAudienceRolesToNoticeTarget = (audienceRoles = []) => {
  const normalizedRoles = (Array.isArray(audienceRoles) ? audienceRoles : [])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);

  if (!normalizedRoles.length || normalizedRoles.length > 1) {
    return 'All';
  }

  switch (normalizedRoles[0]) {
    case 'student':
      return 'Students';
    case 'teacher':
      return 'Teachers';
    case 'parent':
      return 'Parents';
    default:
      return 'Staff';
  }
};

const mapNotificationTypeToNoticeCategory = (notificationType = '') => {
  const normalizedType = String(notificationType || '').trim().toLowerCase();
  switch (normalizedType) {
    case 'success':
      return 'Event';
    case 'info':
      return 'Holiday';
    default:
      return 'Urgent';
  }
};

const mapNotificationTypeToPriority = (notificationType = '') => {
  const normalizedType = String(notificationType || '').trim().toLowerCase();
  switch (normalizedType) {
    case 'error':
    case 'warning':
      return 'Urgent';
    case 'success':
      return 'High';
    default:
      return 'Normal';
  }
};

const resolveMongoUserForNotice = async (req, resolvedSqlUser = null) => {
  const directMongoId = req.user?._id;
  if (directMongoId && mongoose.Types.ObjectId.isValid(String(directMongoId))) {
    return User.findById(directMongoId).select('_id fullName email role');
  }

  const email = String(resolvedSqlUser?.email || req.user?.email || '').trim().toLowerCase();
  const role = getAuthRole(req);
  if (!email) {
    return null;
  }

  const mongoUser = await User.findOne({ email, role }).select('_id fullName email role');
  if (mongoUser) {
    return mongoUser;
  }

  return User.findOne({ email }).select('_id fullName email role');
};

const syncPortalNotificationToNotice = async (req, notification = {}, resolvedSqlUser = null) => {
  const mongoUser = await resolveMongoUserForNotice(req, resolvedSqlUser);
  if (!mongoUser?._id) {
    return null;
  }

  return Notice.create({
    title: notification.title,
    content: notification.message,
    category: mapNotificationTypeToNoticeCategory(notification.type || notification.notificationType),
    priority: mapNotificationTypeToPriority(notification.type || notification.notificationType),
    noticeType: 'General',
    targetAudience: mapAudienceRolesToNoticeTarget(notification.audienceRoles || []),
    createdBy: mongoUser._id,
    isActive: true,
  });
};

const resolveAuthenticatedSqlUser = async (req) => {
  const directUserId = getAuthUserId(req);
  if (directUserId) {
    return {
      userId: directUserId,
      user: req.user,
    };
  }

  const email = String(req.user?.email || '').trim().toLowerCase();
  const role = getAuthRole(req);
  if (!email || !role) {
    return { userId: null, user: req.user };
  }

  const resolvedUser = await getAuthUserByEmailRole(email, role);
  const resolvedUserId = Number(resolvedUser?._id ?? resolvedUser?.id ?? resolvedUser?.UserId ?? null);
  return {
    userId: Number.isInteger(resolvedUserId) && resolvedUserId > 0 ? resolvedUserId : null,
    user: resolvedUser || req.user,
  };
};

const requireAuthUserId = async (req) => {
  const { userId } = await resolveAuthenticatedSqlUser(req);
  if (!userId) {
    const error = new Error('Authenticated user could not be resolved.');
    error.statusCode = 401;
    throw error;
  }
  return userId;
};

const listBranchRecords = asyncHandler(async (req, res) => {
  const branches = await listBranches();
  res.status(200).json({ success: true, branches, data: branches });
});

const saveBranchRecord = asyncHandler(async (req, res) => {
  const actorUserId = await requireAuthUserId(req);
  const branches = await upsertBranch(req.body || {}, actorUserId);
  res.status(200).json({ success: true, branches, data: branches });
});

const removeBranchRecord = asyncHandler(async (req, res) => {
  await deleteBranch(req.params.id);
  res.status(200).json({ success: true, message: 'Branch deleted successfully.' });
});

const linkParentStudentRecord = asyncHandler(async (req, res) => {
  const actorUserId = await requireAuthUserId(req);
  const link = await createParentStudentLink({
    parentUserId: req.body?.parentUserId,
    studentId: req.body?.studentId,
    relation: req.body?.relation,
    isPrimary: req.body?.isPrimary !== false,
    createdByUserId: actorUserId,
  });
  res.status(200).json({ success: true, link, data: link });
});

const getParentStudentLinks = asyncHandler(async (req, res) => {
  const { userId } = await resolveAuthenticatedSqlUser(req);
  const role = getAuthRole(req);
  const links = await listParentStudentLinks({
    parentUserId: role === 'admin' ? req.query?.parentUserId : userId,
    requestingUserId: userId,
    requestingRoleName: role,
    search: req.query?.search || null,
  });
  res.status(200).json({ success: true, links, data: links });
});

const setParentStudentLinkPrimary = asyncHandler(async (req, res) => {
  const { userId } = await resolveAuthenticatedSqlUser(req);
  const role = getAuthRole(req);
  const links = await setPrimaryParentStudentLink({
    parentStudentLinkId: req.params.id,
    requestingUserId: userId,
    requestingRoleName: role,
  });
  res.status(200).json({ success: true, links, data: links });
});

const removeParentStudentLink = asyncHandler(async (req, res) => {
  const { userId } = await resolveAuthenticatedSqlUser(req);
  const role = getAuthRole(req);
  const links = await deactivateParentStudentLink({
    parentStudentLinkId: req.params.id,
    requestingUserId: userId,
    requestingRoleName: role,
  });
  res.status(200).json({ success: true, links, data: links });
});

const getParentDashboardSnapshot = asyncHandler(async (req, res) => {
  const { userId, user } = await resolveAuthenticatedSqlUser(req);
  const snapshot = await getParentPortalSnapshot({
    ...(req.user || {}),
    ...(user || {}),
    id: userId,
    UserId: userId,
    userId,
    _id: userId,
  }, req.query?.studentId || null);
  res.status(200).json({ success: true, data: snapshot, snapshot });
});

const getPortalNotifications = asyncHandler(async (req, res) => {
  const userId = await requireAuthUserId(req);
  const notifications = await getNotificationInbox(userId, Number(req.query.limit) || 20);
  res.status(200).json({ success: true, notifications, data: notifications });
});

const createPortalNotification = asyncHandler(async (req, res) => {
  const { userId: senderUserId, user: resolvedSqlUser } = await resolveAuthenticatedSqlUser(req);
  if (!senderUserId) {
    const error = new Error('Authenticated user could not be resolved.');
    error.statusCode = 401;
    throw error;
  }

  const notification = await createNotification({
    senderUserId,
    title: req.body?.title,
    message: req.body?.message,
    notificationType: req.body?.type || req.body?.notificationType,
    audienceRoles: req.body?.audienceRoles || [],
    recipientUserIds: req.body?.recipientUserIds || [],
    linkUrl: req.body?.linkUrl || null,
    metadataJson: req.body?.metadataJson || null,
  });

  try {
    await syncPortalNotificationToNotice(req, {
      ...notification,
      type: req.body?.type || req.body?.notificationType,
      audienceRoles: req.body?.audienceRoles || [],
    }, resolvedSqlUser);
  } catch (noticeError) {
    console.warn('[portal-notification] Notice mirror sync failed:', noticeError.message);
  }

  res.status(201).json({ success: true, notification, data: notification });
});

const markPortalNotificationRead = asyncHandler(async (req, res) => {
  const userId = await requireAuthUserId(req);
  const notifications = await markNotificationRead(req.params.id, userId);
  res.status(200).json({ success: true, notifications, data: notifications });
});

const getMessagingContacts = asyncHandler(async (req, res) => {
  const userId = await requireAuthUserId(req);
  const contacts = await getPortalContacts(userId, getAuthRole(req));
  res.status(200).json({ success: true, contacts, data: contacts });
});

const getMessagingConversations = asyncHandler(async (req, res) => {
  const userId = await requireAuthUserId(req);
  const conversations = await getConversationList(userId);
  res.status(200).json({ success: true, conversations, data: conversations });
});

const getMessagingConversationMessages = asyncHandler(async (req, res) => {
  const userId = await requireAuthUserId(req);
  const messages = await getConversationMessages(req.params.id, userId);
  res.status(200).json({ success: true, messages, data: messages });
});

const createPortalMessage = asyncHandler(async (req, res) => {
  const senderUserId = await requireAuthUserId(req);
  const messages = await sendPortalMessage({
    senderUserId,
    recipientUserId: req.body?.recipientUserId,
    subject: req.body?.subject,
    body: req.body?.body,
    studentId: req.body?.studentId,
  });
  res.status(201).json({ success: true, messages, data: messages });
});

const getPortalMeetings = asyncHandler(async (req, res) => {
  const userId = await requireAuthUserId(req);
  const meetings = await listPortalMeetings(userId, getAuthRole(req), req.query.status || null);
  res.status(200).json({ success: true, meetings, data: meetings });
});

const createMeetingRequest = asyncHandler(async (req, res) => {
  const parentUserId = await requireAuthUserId(req);
  const meeting = await createPortalMeeting({
    parentUserId,
    teacherUserId: req.body?.teacherUserId,
    studentId: req.body?.studentId,
    subject: req.body?.subject,
    title: req.body?.title,
    description: req.body?.description,
    requestedDate: req.body?.requestedDate,
    requestedTime: req.body?.requestedTime,
    meetingMode: req.body?.meetingMode,
    parentNotes: req.body?.parentNotes,
  });
  res.status(201).json({ success: true, meeting, data: meeting });
});

const reviewMeetingRequest = asyncHandler(async (req, res) => {
  const reviewerUserId = await requireAuthUserId(req);
  const meeting = await reviewPortalMeeting(req.params.id, reviewerUserId, req.body || {});
  res.status(200).json({ success: true, meeting, data: meeting });
});

const cancelMeetingRequest = asyncHandler(async (req, res) => {
  const userId = await requireAuthUserId(req);
  const meeting = await cancelPortalMeeting(req.params.id, userId, getAuthRole(req), req.body?.notes || null);
  res.status(200).json({ success: true, meeting, data: meeting });
});

module.exports = {
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
};
