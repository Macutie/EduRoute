const { Server } = require('socket.io');
const env = require('../config/env');
const AppError = require('../utils/appError');
const { verifyAccessToken } = require('../utils/jwt');
const tripTrackingService = require('../services/tripTracking.service');
const { setSocketServer } = require('./socketBus');
const { registerDeanNotificationSocketHandlers } = require('./deanNotifications.socket');
const { registerHrmuSocketHandlers } = require('./hrmu.socket');
const { registerNotificationSocketHandlers } = require('./notification.socket');

const SOCKET_EVENTS = {
    error: 'trip:error'
};

const isAllowedSocketOrigin = (origin) => {
    if (!origin) return true;

    const isConfiguredOrigin = env.frontendUrls.includes(origin);
    const isLocalNetworkOrigin = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(origin);
    const isNgrokOrigin = /^https?:\/\/[a-z0-9-]+\.ngrok(-free)?\.(app|dev)$/.test(origin);

    return isConfiguredOrigin || (env.nodeEnv !== 'production' && (isLocalNetworkOrigin || isNgrokOrigin));
};

const createTripTrackingSocketServer = (httpServer) => {
    const io = new Server(httpServer, {
        cors: {
            origin: (origin, callback) => {
                if (isAllowedSocketOrigin(origin)) {
                    callback(null, true);
                    return;
                }

                callback(new Error('Not allowed by Socket.IO CORS'));
            },
            credentials: true
        }
    });

    setSocketServer(io);

    io.use((socket, next) => {
        try {
            const bearerToken = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

            if (!bearerToken) {
                return next(new AppError('Socket authentication token is required.', 401));
            }

            socket.user = verifyAccessToken(bearerToken);
            return next();
        } catch (error) {
            return next(new AppError('Invalid or expired socket token.', 401));
        }
    });

    registerDeanNotificationSocketHandlers(io);
    registerHrmuSocketHandlers(io);
    registerNotificationSocketHandlers(io);

    io.on('connection', (socket) => {
        // Location sockets are intentionally disabled. Socket.IO remains available
        // for non-location notifications only; employee coordinates are never
        // broadcast to HRMU, ISSU, admin, dean, or other users.
    });

    return io;
};

module.exports = {
    createTripTrackingSocketServer,
    SOCKET_EVENTS
};
