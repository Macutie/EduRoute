const pool = require('../db/pool');
const { getSocketServer } = require('../socket/socketBus');
const { formatDateTime } = require('../utils/dateFormatter');

const DEAN_ROLES = ['assistant_dean', 'college_dean'];

const listNotificationsForUser = async (userId, { page = 1, limit = 20 } = {}) => {
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const offset = (safePage - 1) * safeLimit;

    const countResult = await pool.query(
        'SELECT COUNT(*)::int AS total FROM notifications WHERE recipient_user_id = $1',
        [userId]
    );

    const { rows } = await pool.query(
        `SELECT
            id,
            recipient_user_id,
            locator_slip_id,
            title,
            message,
            type,
            is_read,
            created_at
         FROM notifications
         WHERE recipient_user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, safeLimit, offset]
    );

    return {
        items: rows.map((row) => ({
            ...row,
            formatted_created_at: formatDateTime(row.created_at)
        })),
        pagination: {
            page: safePage,
            limit: safeLimit,
            total: countResult.rows[0]?.total || 0
        }
    };
};

const markNotificationRead = async (userId, notificationId) => {
    const { rows, rowCount } = await pool.query(
        `UPDATE notifications
         SET is_read = TRUE
         WHERE id = $1
           AND recipient_user_id = $2
         RETURNING *`,
        [notificationId, userId]
    );

    return rowCount > 0 ? rows[0] : null;
};

const createLocatorSlipDeanNotifications = async (client, locatorSlip) => {
    if (!locatorSlip.college_id) return [];

    const deanResult = await client.query(
        `SELECT id, full_name, account_role
         FROM faculty_users
         WHERE department_id = $1
           AND account_role = ANY($2::text[])
           AND status = 'active'`,
        [locatorSlip.college_id, DEAN_ROLES]
    );

    if (deanResult.rowCount === 0) return [];

    const title = 'New locator slip request';
    const purpose = locatorSlip.custom_purpose || locatorSlip.purpose_of_travel;
    const message = `${locatorSlip.faculty_name} submitted a locator slip for ${purpose}.`;

    const notifications = [];

    for (const dean of deanResult.rows) {
        const notificationResult = await client.query(
            `INSERT INTO notifications (
                recipient_user_id,
                locator_slip_id,
                title,
                message,
                type
             )
             VALUES ($1, $2, $3, $4, 'locator_slip')
             RETURNING *`,
            [dean.id, locatorSlip.id, title, message]
        );

        notifications.push(notificationResult.rows[0]);
    }

    return notifications;
};

const emitLocatorSlipDeanNotification = (locatorSlip) => {
    const io = getSocketServer();
    if (!io || !locatorSlip?.college_id) return;

    const purpose = locatorSlip.custom_purpose || locatorSlip.purpose_of_travel;

    io.to(`college:${locatorSlip.college_id}:deans`).emit('locator-slip:new', {
        locatorSlipId: locatorSlip.id,
        facultyName: locatorSlip.faculty_name,
        purpose,
        destination: locatorSlip.destination,
        collegeId: locatorSlip.college_id,
        collegeName: locatorSlip.college_name,
        createdAt: locatorSlip.created_at,
        formattedCreatedAt: formatDateTime(locatorSlip.created_at)
    });
};

module.exports = {
    DEAN_ROLES,
    listNotificationsForUser,
    markNotificationRead,
    createLocatorSlipDeanNotifications,
    emitLocatorSlipDeanNotification
};
