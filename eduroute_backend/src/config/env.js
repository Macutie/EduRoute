const dotenv = require('dotenv');

dotenv.config();

const isNgrokUrl = (value) => /\.ngrok(-free)?\.(app|dev)/i.test(String(value || ''));
const productionFrontendUrl = 'https://edu-route.vercel.app';

const resolvedFrontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
const resolvedClientOrigin = process.env.CLIENT_ORIGIN || process.env.FRONTEND_URL || 'http://localhost:3000';
const resolvedFcmWebPushLink = (() => {
    const explicitLink = process.env.FCM_WEB_PUSH_LINK;

    if (explicitLink && !isNgrokUrl(explicitLink)) {
        return explicitLink;
    }

    if (resolvedFrontendUrl && !/^http:\/\/localhost(?::\d+)?$/i.test(resolvedFrontendUrl)) {
        return resolvedFrontendUrl;
    }

    if (resolvedClientOrigin && !/^http:\/\/localhost(?::\d+)?$/i.test(resolvedClientOrigin)) {
        return resolvedClientOrigin;
    }

    return productionFrontendUrl;
})();

module.exports = {
    port: process.env.PORT || 5000,
    backendUrl: process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`,
    nodeEnv: process.env.NODE_ENV || 'development',
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
    fieldEncryptionKey: process.env.FIELD_ENCRYPTION_KEY,
    authPayloadPrivateKey: process.env.AUTH_PAYLOAD_PRIVATE_KEY,
    frontendUrl: resolvedFrontendUrl,
    clientOrigin: resolvedClientOrigin,
    frontendUrls: (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'http://localhost:3000')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    resendApiKey: process.env.RESEND_API_KEY,
    emailFrom: process.env.EMAIL_FROM,
    resetCodeTtlMinutes: Number(process.env.RESET_CODE_TTL_MINUTES || 10),
    bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS || 12),
    cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME,
    cloudinaryApiKey: process.env.CLOUDINARY_API_KEY,
    cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET,
    mapboxSecretToken: process.env.MAPBOX_SECRET_TOKEN,
    mapboxDirectionsProfile: process.env.MAPBOX_DIRECTIONS_PROFILE || 'mapbox/driving',
    liveLocationStaleMinutes: Number(process.env.LIVE_LOCATION_STALE_MINUTES || process.env.LOCATION_DISCONNECTED_MINUTES || 30),
    locationDisconnectedMinutes: Number(process.env.LOCATION_DISCONNECTED_MINUTES || process.env.LIVE_LOCATION_STALE_MINUTES || 30),
    lateReturnGraceMinutes: Number(process.env.LATE_RETURN_GRACE_MINUTES || 60),
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
    firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY,
    fcmWebPushLink: resolvedFcmWebPushLink
};
