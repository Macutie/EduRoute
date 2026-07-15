const express = require('express');
const { protect } = require('../middlewares/auth.middleware');
const { decryptSensitivePayload } = require('../middlewares/authPayloadEncryption.middleware');
const notificationService = require('../services/notification.service');
const pushTokenService = require('../services/pushToken.service');
const { encryptSensitiveResponseData } = require('../utils/sensitiveResponseEncryption');

const router = express.Router();

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.use(protect);

router.get('/', wrap(async (req, res) => {
    const data = await notificationService.getUserNotifications(req.user.sub, req.query);
    res.json({
        success: true,
        message: 'Notifications fetched successfully.',
        data: encryptSensitiveResponseData(req, data)
    });
}));

router.get('/unread-count', wrap(async (req, res) => {
    const unreadCount = await notificationService.getUnreadCount(req.user.sub);
    res.json({
        success: true,
        message: 'Unread notification count fetched successfully.',
        data: encryptSensitiveResponseData(req, { unreadCount })
    });
}));

router.get('/push-status', wrap(async (req, res) => {
    const status = await notificationService.getPushStatusForUser(req.user.sub);
    res.json({
        success: true,
        message: 'Push notification status fetched successfully.',
        data: encryptSensitiveResponseData(req, status)
    });
}));

router.patch('/read-all', wrap(async (req, res) => {
    const updated = await notificationService.markAllNotificationsRead(req.user.sub);
    res.json({
        success: true,
        message: 'All notifications marked as read.',
        data: encryptSensitiveResponseData(req, { updated })
    });
}));

router.patch('/:id/read', wrap(async (req, res) => {
    const notification = await notificationService.markNotificationRead(req.params.id, req.user.sub);
    res.json({
        success: true,
        message: 'Notification marked as read.',
        data: encryptSensitiveResponseData(req, notification)
    });
}));

router.post('/push-token', decryptSensitivePayload, wrap(async (req, res) => {
    const token = await pushTokenService.savePushToken(req.user.sub, req.body);
    res.status(201).json({
        success: true,
        message: 'Push token saved successfully.',
        data: encryptSensitiveResponseData(req, token)
    });
}));

router.delete('/push-token', decryptSensitivePayload, wrap(async (req, res) => {
    const removed = await pushTokenService.deletePushToken(req.user.sub, req.body?.fcmToken || req.query.fcmToken);
    res.json({
        success: true,
        message: 'Push token deleted successfully.',
        data: encryptSensitiveResponseData(req, { removed })
    });
}));

router.patch('/push-token/disable', decryptSensitivePayload, wrap(async (req, res) => {
    const token = await pushTokenService.disablePushToken(req.user.sub, req.body?.fcmToken);
    res.json({
        success: true,
        message: 'Push token disabled successfully.',
        data: encryptSensitiveResponseData(req, token)
    });
}));

module.exports = router;
