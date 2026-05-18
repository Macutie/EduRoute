const pool = require('../db/pool');

const DEAN_ROLES = ['assistant_dean', 'college_dean', 'admin'];

const registerDeanNotificationSocketHandlers = (io) => {
    io.on('connection', async (socket) => {
        try {
            if (!DEAN_ROLES.includes(socket.user?.role)) return;

            const { rows, rowCount } = await pool.query(
                `SELECT id, department_id
                 FROM faculty_users
                 WHERE id = $1
                   AND account_role = ANY($2::text[])
                   AND status = 'active'
                 LIMIT 1`,
                [socket.user.sub, DEAN_ROLES]
            );

            if (rowCount === 0 || !rows[0].department_id) return;

            socket.join(`user:${rows[0].id}`);
            socket.join(`college:${rows[0].department_id}:deans`);
        } catch (error) {
            socket.emit('dean:error', {
                message: 'Unable to subscribe to dean notifications.'
            });
        }
    });
};

module.exports = {
    DEAN_ROLES,
    registerDeanNotificationSocketHandlers
};
