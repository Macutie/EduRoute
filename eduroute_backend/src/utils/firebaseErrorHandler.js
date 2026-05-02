const INVALID_FCM_ERROR_CODES = new Set([
    'messaging/invalid-registration-token',
    'messaging/registration-token-not-registered',
    'messaging/mismatched-credential',
    'messaging/invalid-argument'
]);

const isInvalidFcmTokenError = (error) => INVALID_FCM_ERROR_CODES.has(error?.code);

module.exports = {
    INVALID_FCM_ERROR_CODES,
    isInvalidFcmTokenError
};
