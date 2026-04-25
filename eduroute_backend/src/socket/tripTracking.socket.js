const { Server } = require('socket.io');
const env = require('../config/env');
const AppError = require('../utils/appError');
const { verifyAccessToken } = require('../utils/jwt');
const tripTrackingService = require('../services/tripTracking.service');
const { setSocketServer } = require('./socketBus');
const { registerDeanNotificationSocketHandlers } = require('./deanNotifications.socket');

const SOCKET_EVENTS = {
    subscribe: 'trip:subscribe',
    unsubscribe: 'trip:unsubscribe',
    updateLocation: 'trip:location:update',
    locationBroadcast: 'trip:location:broadcast',
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

    io.on('connection', (socket) => {
        socket.on(SOCKET_EVENTS.subscribe, ({ tripId }) => {
            if (!tripId) {
                socket.emit(SOCKET_EVENTS.error, { message: 'Trip ID is required to subscribe.' });
                return;
            }

            socket.join(`trip:${tripId}`);
        });

        socket.on(SOCKET_EVENTS.unsubscribe, ({ tripId }) => {
            if (!tripId) return;
            socket.leave(`trip:${tripId}`);
        });

        socket.on(SOCKET_EVENTS.updateLocation, async (payload, acknowledge) => {
            try {
                const update = await tripTrackingService.recordLiveLocation(socket.user.sub, payload);
                io.to(`trip:${update.tripId}`).emit(SOCKET_EVENTS.locationBroadcast, update);
                if (typeof acknowledge === 'function') acknowledge({ ok: true, data: update });
            } catch (error) {
                socket.emit(SOCKET_EVENTS.error, { message: error.message });
                if (typeof acknowledge === 'function') acknowledge({ ok: false, message: error.message });
            }
        });
    });

    return io;
};

module.exports = {
    createTripTrackingSocketServer,
    SOCKET_EVENTS
};
