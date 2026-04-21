const pool = require('../db/pool');
const AppError = require('../utils/appError');

const ALLOWED_STATUSES = ['unknown', 'granted', 'denied', 'dismissed', 'unsupported'];

const formatPreferences = (row) => ({
    notifications_status: row.notifications_status,
    location_status: row.location_status,
    camera_status: row.camera_status,
    first_login_setup_completed: row.first_login_setup_completed,
    created_at: row.created_at,
    updated_at: row.updated_at
});

const ensurePermissionPreferences = async (facultyUserId) => {
    await pool.query(
        `
            INSERT INTO faculty_permission_preferences (faculty_user_id)
            VALUES ($1)
            ON CONFLICT (faculty_user_id) DO NOTHING
        `,
        [facultyUserId]
    );

    const { rows, rowCount } = await pool.query(
        `
            SELECT *
            FROM faculty_permission_preferences
            WHERE faculty_user_id = $1
            LIMIT 1
        `,
        [facultyUserId]
    );

    if (rowCount === 0) {
        throw new AppError('Permission preferences not found.', 404);
    }

    return formatPreferences(rows[0]);
};

const updatePermissionPreferences = async (facultyUserId, payload) => {
    await ensurePermissionPreferences(facultyUserId);

    const fields = [];
    const values = [];

    ['notifications_status', 'location_status', 'camera_status'].forEach((field) => {
        if (payload[field] !== undefined) {
            if (!ALLOWED_STATUSES.includes(payload[field])) {
                throw new AppError(`Invalid ${field}.`, 400);
            }

            values.push(payload[field]);
            fields.push(`${field} = $${values.length}`);
        }
    });

    if (payload.first_login_setup_completed !== undefined) {
        values.push(Boolean(payload.first_login_setup_completed));
        fields.push(`first_login_setup_completed = $${values.length}`);
    }

    if (fields.length === 0) {
        return ensurePermissionPreferences(facultyUserId);
    }

    values.push(facultyUserId);

    const { rows } = await pool.query(
        `
            UPDATE faculty_permission_preferences
            SET ${fields.join(', ')}
            WHERE faculty_user_id = $${values.length}
            RETURNING *
        `,
        values
    );

    return formatPreferences(rows[0]);
};

module.exports = {
    ensurePermissionPreferences,
    updatePermissionPreferences,
    ALLOWED_STATUSES
};
