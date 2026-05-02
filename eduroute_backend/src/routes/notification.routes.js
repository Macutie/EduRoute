const express = require('express');
const { protect } = require('../middlewares/auth.middleware');
const notificationService = require('../services/notification.service');
const pushTokenService = require('../services/pushToken.service');

const router = express.Router();

const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.use(protect);

router.get('/', wrap(async (req, res) => {
    const data = await notificationService.getUserNotifications(req.user.sub, req.query);
    res.json({
        success: true,
        message: 'Notifications fetched successfully.',
        data
    });
}));

router.get('/unread-count', wrap(async (req, res) => {
    const unreadCount = await notificationService.getUnreadCount(req.user.sub);
    res.json({
        success: true,
        message: 'Unread notification count fetched successfully.',
        data: { unreadCount }
    });
}));

router.patch('/:id/read', wrap(async (req, res) => {
    const notification = await notificationService.markNotificationRead(req.params.id, req.user.sub);
    res.json({
        success: true,
        message: 'Notification marked as read.',
        data: notification
    });
}));

router.patch('/read-all', wrap(async (req, res) => {
    const updated = await notificationService.markAllNotificationsRead(req.user.sub);
    res.json({
        success: true,
        message: 'All notifications marked as read.',
        data: { updated }
    });
}));

router.post('/push-token', wrap(async (req, res) => {
    const token = await pushTokenService.savePushToken(req.user.sub, req.body);
    res.status(201).json({
        success: true,
        message: 'Push token saved successfully.',
        data: token
    });
}));

router.delete('/push-token', wrap(async (req, res) => {
    const removed = await pushTokenService.deletePushToken(req.user.sub, req.body?.fcmToken || req.query.fcmToken);
    res.json({
        success: true,
        message: 'Push token deleted successfully.',
        data: { removed }
    });
}));

router.patch('/push-token/disable', wrap(async (req, res) => {
    const token = await pushTokenService.disablePushToken(req.body?.fcmToken);
    res.json({
        success: true,
        message: 'Push token disabled successfully.',
        data: token
    });
}));

module.exports = router;
