const env = require('../config/env');
const { getSocketServer } = require('../socket/socketBus');
const { getFirebaseMessaging } = require('../config/firebaseAdmin');
const { isInvalidFcmTokenError } = require('../utils/firebaseErrorHandler');
const notificationRepository = require('../repositories/notification.repository');
const pushTokenRepository = require('../repositories/pushToken.repository');
const userRepository = require('../repositories/user.repository');
const { formatDateTime } = require('../utils/dateFormatter');

const NOTIFICATION_TYPES = {
    LOCATOR_SLIP_SUBMITTED: 'LOCATOR_SLIP_SUBMITTED',
    LOCATOR_SLIP_APPROVED: 'LOCATOR_SLIP_APPROVED',
    LOCATOR_SLIP_REJECTED: 'LOCATOR_SLIP_REJECTED',
    TRIP_FLAGGED: 'TRIP_FLAGGED',
    ARRIVAL_VERIFICATION_REQUIRED: 'ARRIVAL_VERIFICATION_REQUIRED'
};

const mapNotificationForSocket = (notification) => ({
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    locatorSlipId: notification.locatorSlipId,
    data: notification.data || {},
    isRead: notification.isRead,
    createdAt: notification.createdAt
});

const createNotification = async (payload, client) => notificationRepository.createNotification(payload, client);

const createBulkNotifications = async (recipients, notificationPayload, client) => {
    const notifications = recipients.map((recipientUserId) => ({
        recipientUserId,
        senderUserId: notificationPayload.senderUserId || null,
        locatorSlipId: notificationPayload.locatorSlipId || null,
        type: notificationPayload.type,
        title: notificationPayload.title,
        message: notificationPayload.message,
        data: notificationPayload.data || {}
    }));

    return notificationRepository.createBulkNotifications(notifications, client);
};

const sendSocketNotification = async (io, recipientUserId, notification) => {
    if (!io || !recipientUserId || !notification) return;

    io.to(`user:${recipientUserId}`).emit('notification:new', mapNotificationForSocket(notification));
    const unreadCount = await notificationRepository.getUnreadCount(recipientUserId).catch(() => 0);
    io.to(`user:${recipientUserId}`).emit('notifications:unread-count', { unreadCount });
};

const buildPushPayload = (notification) => ({
    notification: {
        title: notification.title,
        body: notification.message
    },
    data: {
        notificationId: String(notification.id),
        locatorSlipId: notification.locatorSlipId ? String(notification.locatorSlipId) : '',
        type: notification.type,
        url: notification.data?.url || ''
    },
    webpush: {
        fcmOptions: {
            link: notification.data?.url
                ? `${env.fcmWebPushLink.replace(/\/$/, '')}${notification.data.url}`
                : env.fcmWebPushLink
        }
    }
});

const sendPushNotificationToUsers = async (userIds, payload) => {
    const normalizedUserIds = Array.from(new Set((userIds || []).filter(Boolean)));
    if (normalizedUserIds.length === 0) {
        return { delivered: 0, disabledTokens: 0 };
    }

    const messaging = getFirebaseMessaging();
    if (!messaging) {
        return { delivered: 0, disabledTokens: 0, skipped: true };
    }

    const activeTokens = await pushTokenRepository.getActivePushTokensForUsers(normalizedUserIds);
    if (activeTokens.length === 0) {
        return { delivered: 0, disabledTokens: 0 };
    }

    const tokens = activeTokens.map((tokenRow) => tokenRow.fcmToken).slice(0, 500);
    const pushPayload = buildPushPayload(payload);
    const response = await messaging.sendEachForMulticast({
        tokens,
        ...pushPayload
    });

    let disabledTokens = 0;
    await Promise.all(response.responses.map(async (result, index) => {
        if (result.success) return;
        if (isInvalidFcmTokenError(result.error)) {
            disabledTokens += 1;
            await pushTokenRepository.disablePushToken(tokens[index]).catch(() => null);
        }
    }));

    return {
        delivered: response.successCount,
        disabledTokens
    };
};

const sendPushNotificationToUser = async (userId, payload) => sendPushNotificationToUsers([userId], payload);

const notifyUser = async (payload, client) => {
    const notification = await createNotification(payload, client);
    const io = getSocketServer();
    await sendSocketNotification(io, payload.recipientUserId, notification);
    await sendPushNotificationToUser(payload.recipientUserId, notification).catch(() => null);
    return notification;
};

const notifyUsers = async (recipients, payload, client) => {
    const notifications = await createBulkNotifications(recipients, payload, client);
    const io = getSocketServer();

    await Promise.all(notifications.map((notification) =>
        sendSocketNotification(io, notification.recipientUserId, notification).catch(() => null)
    ));

    await sendPushNotificationToUsers(recipients, notifications[0] || payload).catch(() => null);
    return notifications;
};

const markNotificationRead = async (notificationId, userId) => {
    const notification = await notificationRepository.markNotificationRead(notificationId, userId);
    if (!notification) return null;

    const io = getSocketServer();
    const unreadCount = await notificationRepository.getUnreadCount(userId);
    if (io) {
        io.to(`user:${userId}`).emit('notifications:unread-count', { unreadCount });
    }

    return notification;
};

const markAllNotificationsRead = async (userId) => {
    const updatedCount = await notificationRepository.markAllNotificationsRead(userId);
    const io = getSocketServer();
    if (io) {
        io.to(`user:${userId}`).emit('notifications:unread-count', { unreadCount: 0 });
    }

    return updatedCount;
};

const getUserNotifications = async (userId, query = {}) => {
    const result = await notificationRepository.getUserNotifications(userId, query);
    const unreadCount = await notificationRepository.getUnreadCount(userId);

    return {
        notifications: result.notifications.map((notification) => ({
            ...notification,
            formattedCreatedAt: formatDateTime(notification.createdAt)
        })),
        pagination: result.pagination,
        unreadCount
    };
};

const getUnreadCount = (userId) => notificationRepository.getUnreadCount(userId);

const listNotificationsForUser = async (userId, query = {}) => {
    const result = await getUserNotifications(userId, query);
    return {
        items: result.notifications.map((notification) => ({
            id: notification.id,
            recipient_user_id: notification.recipientUserId,
            sender_user_id: notification.senderUserId,
            locator_slip_id: notification.locatorSlipId,
            title: notification.title,
            message: notification.message,
            type: notification.type,
            is_read: notification.isRead,
            created_at: notification.createdAt,
            formatted_created_at: notification.formattedCreatedAt
        })),
        pagination: result.pagination,
        unreadCount: result.unreadCount
    };
};

const createLocatorSlipDeanNotifications = async (client, locatorSlip) => {
    if (!locatorSlip.college_id) return [];

    const deans = await userRepository.getDeanUsersByCollegeId(locatorSlip.college_id, client);
    if (deans.length === 0) return [];

    const purpose = locatorSlip.custom_purpose || locatorSlip.purpose_of_travel;
    const payload = {
        senderUserId: locatorSlip.faculty_user_id,
        locatorSlipId: locatorSlip.id,
        type: NOTIFICATION_TYPES.LOCATOR_SLIP_SUBMITTED,
        title: 'New Locator Slip Request',
        message: `${locatorSlip.faculty_name} submitted a locator slip for ${purpose}.`,
        data: {
            locatorSlipId: locatorSlip.id,
            collegeId: locatorSlip.college_id,
            url: `/dean/locator-slips/${locatorSlip.id}`
        }
    };

    const notifications = await createBulkNotifications(deans.map((dean) => dean.id), payload, client);
    locatorSlip._deanNotifications = notifications;
    return notifications;
};

const emitLocatorSlipDeanNotification = async (locatorSlip) => {
    const notifications = Array.isArray(locatorSlip?._deanNotifications) ? locatorSlip._deanNotifications : [];
    if (notifications.length === 0) return;

    const io = getSocketServer();
    await Promise.all(notifications.map((notification) =>
        sendSocketNotification(io, notification.recipientUserId, notification).catch(() => null)
    ));
    await sendPushNotificationToUsers(
        notifications.map((notification) => notification.recipientUserId),
        notifications[0]
    ).catch(() => null);

    if (io && locatorSlip?.college_id) {
        const purpose = locatorSlip.custom_purpose || locatorSlip.purpose_of_travel;
        io.to(`college:${locatorSlip.college_id}:deans`).emit('locator-slip:new', {
            locatorSlipId: locatorSlip.id,
            facultyName: locatorSlip.faculty_name,
            purpose,
            destination: locatorSlip.destination,
            collegeId: locatorSlip.college_id,
            collegeName: locatorSlip.college_name,
            createdAt: locatorSlip.created_at,
            formattedCreatedAt: formatDateTime(locatorSlip.created_at)
        });
    }
};

module.exports = {
    NOTIFICATION_TYPES,
    createNotification,
    createBulkNotifications,
    sendSocketNotification,
    sendPushNotificationToUser,
    sendPushNotificationToUsers,
    notifyUser,
    notifyUsers,
    markNotificationRead,
    markAllNotificationsRead,
    getUserNotifications,
    getUnreadCount,
    listNotificationsForUser,
    createLocatorSlipDeanNotifications,
    emitLocatorSlipDeanNotification
};
