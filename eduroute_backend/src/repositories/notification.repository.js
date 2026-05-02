const pool = require('../db/pool');

const mapNotificationRow = (row) => ({
    id: row.id,
    recipientUserId: row.recipient_user_id,
    senderUserId: row.sender_user_id,
    locatorSlipId: row.locator_slip_id,
    type: row.type,
    title: row.title,
    message: row.message,
    data: row.data || {},
    isRead: row.is_read === true,
    readAt: row.read_at || null,
    createdAt: row.created_at
});

const createNotification = async (payload, client = pool) => {
    const { rows } = await client.query(
        `INSERT INTO notifications (
            recipient_user_id,
            sender_user_id,
            locator_slip_id,
            type,
            title,
            message,
            data
        )
        VALUES ($1, $2, $3, $4::text, $5, $6, COALESCE($7::jsonb, '{}'::jsonb))
        RETURNING *`,
        [
            payload.recipientUserId,
            payload.senderUserId || null,
            payload.locatorSlipId || null,
            payload.type,
            payload.title,
            payload.message,
            JSON.stringify(payload.data || {})
        ]
    );

    return mapNotificationRow(rows[0]);
};

const createBulkNotifications = async (notifications, client = pool) => {
    const created = [];

    for (const notification of notifications) {
        created.push(await createNotification(notification, client));
    }

    return created;
};

const getUserNotifications = async (userId, { page = 1, limit = 20, unreadOnly = false } = {}) => {
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const offset = (safePage - 1) * safeLimit;
    const unreadClause = unreadOnly ? 'AND is_read = FALSE' : '';

    const countResult = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM notifications
         WHERE recipient_user_id = $1
           ${unreadClause}`,
        [userId]
    );

    const { rows } = await pool.query(
        `SELECT *
         FROM notifications
         WHERE recipient_user_id = $1
           ${unreadClause}
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, safeLimit, offset]
    );

    return {
        notifications: rows.map(mapNotificationRow),
        pagination: {
            page: safePage,
            limit: safeLimit,
            total: Number(countResult.rows[0]?.total || 0)
        }
    };
};

const getUnreadCount = async (userId, client = pool) => {
    const { rows } = await client.query(
        `SELECT COUNT(*)::int AS unread_count
         FROM notifications
         WHERE recipient_user_id = $1
           AND is_read = FALSE`,
        [userId]
    );

    return Number(rows[0]?.unread_count || 0);
};

const markNotificationRead = async (notificationId, userId, client = pool) => {
    const { rows } = await client.query(
        `UPDATE notifications
         SET is_read = TRUE,
             read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
         WHERE id = $1
           AND recipient_user_id = $2
         RETURNING *`,
        [notificationId, userId]
    );

    return rows[0] ? mapNotificationRow(rows[0]) : null;
};

const markAllNotificationsRead = async (userId, client = pool) => {
    const { rowCount } = await client.query(
        `UPDATE notifications
         SET is_read = TRUE,
             read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
         WHERE recipient_user_id = $1
           AND is_read = FALSE`,
        [userId]
    );

    return rowCount;
};

module.exports = {
    mapNotificationRow,
    createNotification,
    createBulkNotifications,
    getUserNotifications,
    getUnreadCount,
    markNotificationRead,
    markAllNotificationsRead
};
