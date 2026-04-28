const HRMU_SOCKET_ROLES = ['hrmu', 'admin'];

const registerHrmuSocketHandlers = (io) => {
    io.on('connection', (socket) => {
        if (!HRMU_SOCKET_ROLES.includes(socket.user?.role)) {
            return;
        }

        socket.join('hrmu');
        socket.join('hrmu:live-tracking');

        socket.on('hrmu:live-tracking:join', () => {
            socket.join('hrmu:live-tracking');
        });
    });
};

module.exports = {
    HRMU_SOCKET_ROLES,
    registerHrmuSocketHandlers
};
