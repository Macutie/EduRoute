const AppError = require('../utils/appError');
const pushTokenRepository = require('../repositories/pushToken.repository');

const savePushToken = async (userId, payload = {}) => {
    const fcmToken = String(payload.fcmToken || '').trim();
    if (!fcmToken) {
        throw new AppError('FCM token is required.', 422);
    }

    return pushTokenRepository.upsertPushToken({
        userId,
        fcmToken,
        platform: payload.platform || 'web',
        deviceName: payload.deviceName || null,
        userAgent: payload.userAgent || null
    });
};

const deletePushToken = async (userId, fcmToken) => {
    const normalizedToken = String(fcmToken || '').trim();
    if (!normalizedToken) {
        throw new AppError('FCM token is required.', 422);
    }

    return pushTokenRepository.deletePushTokenForUser(userId, normalizedToken);
};

const disablePushToken = async (userId, fcmToken) => {
    const normalizedToken = String(fcmToken || '').trim();
    if (!normalizedToken) {
        throw new AppError('FCM token is required.', 422);
    }

    return pushTokenRepository.disablePushTokenForUser(userId, normalizedToken);
};

module.exports = {
    savePushToken,
    deletePushToken,
    disablePushToken
};
