const pool = require('../db/pool');

const DEAN_ROLES = ['assistant_dean', 'college_dean'];

const registerNotificationSocketHandlers = (io) => {
    io.on('connection', async (socket) => {
        if (!socket.user?.sub) return;

        socket.join(`user:${socket.user.sub}`);

        if (!DEAN_ROLES.includes(socket.user.role)) {
            return;
        }

        try {
            const { rows } = await pool.query(
                `SELECT department_id
                 FROM faculty_users
                 WHERE id = $1
                 LIMIT 1`,
                [socket.user.sub]
            );

            if (rows[0]?.department_id) {
                socket.join(`college:${rows[0].department_id}:deans`);
            }
        } catch (error) {
            socket.emit('notification:error', {
                message: 'Unable to subscribe to notification rooms.'
            });
        }
    });
};

module.exports = {
    registerNotificationSocketHandlers
};
