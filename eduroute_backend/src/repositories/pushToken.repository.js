const pool = require('../db/pool');

const mapPushTokenRow = (row) => ({
    id: row.id,
    userId: row.user_id,
    fcmToken: row.fcm_token,
    platform: row.platform || null,
    deviceName: row.device_name || null,
    userAgent: row.user_agent || null,
    isActive: row.is_active === true,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
});

const upsertPushToken = async ({ userId, fcmToken, platform, deviceName, userAgent }, client = pool) => {
    const { rows } = await client.query(
        `INSERT INTO user_push_tokens (
            user_id,
            fcm_token,
            platform,
            device_name,
            user_agent,
            is_active,
            last_seen_at,
            updated_at
        )
        VALUES ($1, $2, $3, $4, $5, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (fcm_token)
        DO UPDATE SET
            user_id = EXCLUDED.user_id,
            platform = EXCLUDED.platform,
            device_name = EXCLUDED.device_name,
            user_agent = EXCLUDED.user_agent,
            is_active = TRUE,
            last_seen_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        RETURNING *`,
        [userId, fcmToken, platform || null, deviceName || null, userAgent || null]
    );

    return mapPushTokenRow(rows[0]);
};

const getActivePushTokensForUser = async (userId, client = pool) => {
    const { rows } = await client.query(
        `SELECT *
         FROM user_push_tokens
         WHERE user_id = $1
           AND is_active = TRUE
         ORDER BY updated_at DESC`,
        [userId]
    );

    return rows.map(mapPushTokenRow);
};

const getActivePushTokensForUsers = async (userIds, client = pool) => {
    if (!Array.isArray(userIds) || userIds.length === 0) {
        return [];
    }

    const { rows } = await client.query(
        `SELECT *
         FROM user_push_tokens
         WHERE user_id = ANY($1::uuid[])
           AND is_active = TRUE
         ORDER BY updated_at DESC`,
        [userIds]
    );

    return rows.map(mapPushTokenRow);
};

const disablePushToken = async (fcmToken, client = pool) => {
    const { rows } = await client.query(
        `UPDATE user_push_tokens
         SET is_active = FALSE,
             updated_at = CURRENT_TIMESTAMP
         WHERE fcm_token = $1
         RETURNING *`,
        [fcmToken]
    );

    return rows[0] ? mapPushTokenRow(rows[0]) : null;
};

const deletePushTokenForUser = async (userId, fcmToken, client = pool) => {
    const { rowCount } = await client.query(
        `DELETE FROM user_push_tokens
         WHERE user_id = $1
           AND fcm_token = $2`,
        [userId, fcmToken]
    );

    return rowCount > 0;
};

module.exports = {
    upsertPushToken,
    getActivePushTokensForUser,
    getActivePushTokensForUsers,
    disablePushToken,
    deletePushTokenForUser
};
