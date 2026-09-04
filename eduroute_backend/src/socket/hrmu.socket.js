const HRMU_SOCKET_ROLES = ['hrmu', 'admin', 'cssu'];

const registerHrmuSocketHandlers = (io) => {
    io.on('connection', (socket) => {
        if (!HRMU_SOCKET_ROLES.includes(socket.user?.role)) {
            return;
        }

        socket.join('hrmu');
        socket.join('hrmu:dashboard');
        socket.join('hrmu:verification');

        socket.on('hrmu:dashboard:join', () => {
            socket.join('hrmu:dashboard');
        });

        socket.on('hrmu:verification:join', () => {
            socket.join('hrmu:verification');
        });
    });
};

module.exports = {
    HRMU_SOCKET_ROLES,
    registerHrmuSocketHandlers
};
