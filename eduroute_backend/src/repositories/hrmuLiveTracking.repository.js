const pool = require('../db/pool');
const { ALLOWED_COLLEGE_NAMES } = require('./hrmuDashboard.repository');

let tripEventsTableExistsCache = null;

const LIVE_TRACKING_BASE_QUERY = `
    WITH allowed_colleges AS (
        SELECT id, department_name
        FROM departments
        WHERE department_name = ANY($1::text[])
    )
    SELECT
        fu.id AS faculty_user_id,
        fu.full_name AS faculty_name,
        fu.employee_id,
        COALESCE(fu.department_position, 'Instructor') AS position,
        ac.id AS college_id,
        ac.department_name AS college_name,
        t.id AS trip_id,
        t.status AS trip_status,
        t.started_at,
        t.ended_at,
        t.destination_name,
        t.destination_lat::float8 AS destination_lat,
        t.destination_lng::float8 AS destination_lng,
        COALESCE(ll.lat, t.origin_lat)::float8 AS lat,
        COALESCE(ll.lng, t.origin_lng)::float8 AS lng,
        ll.speed::float8 AS speed,
        ll.heading::float8 AS heading,
        ll.recorded_at,
        slip.id AS locator_slip_id,
        COALESCE(slip.custom_purpose, slip.purpose_of_travel) AS purpose,
        slip.destination,
        slip.expected_return_datetime
    FROM trips t
    JOIN faculty_users fu ON fu.id = t.user_id
    JOIN allowed_colleges ac ON ac.id = fu.department_id
    LEFT JOIN latest_locations ll ON ll.trip_id = t.id
    LEFT JOIN LATERAL (
        SELECT
            ls.id,
            ls.destination,
            ls.purpose_of_travel,
            ls.custom_purpose,
            ls.expected_return_datetime,
            ls.departure_datetime,
            ls.created_at
        FROM locator_slips ls
        WHERE ls.faculty_user_id = fu.id
          AND COALESCE(ls.college_id, fu.department_id) = ac.id
          AND ls.status IN ('approved', 'verified', 'completed')
        ORDER BY
            CASE
                WHEN LOWER(COALESCE(ls.destination, '')) = LOWER(COALESCE(t.destination_name, '')) THEN 0
                ELSE 1
            END,
            ABS(EXTRACT(EPOCH FROM (COALESCE(ls.departure_datetime, ls.created_at) - COALESCE(t.started_at, ls.created_at)))) ASC,
            COALESCE(ls.departure_datetime, ls.created_at) DESC
        LIMIT 1
    ) slip ON TRUE
    WHERE t.status IN ('active', 'arrived', 'returning')
      AND fu.account_role = 'faculty'
      AND fu.status = 'active'
`;

const getTripEventsTableExists = async () => {
    if (tripEventsTableExistsCache !== null) {
        return tripEventsTableExistsCache;
    }

    const { rows } = await pool.query(`SELECT to_regclass('public.trip_events') AS table_name`);
    tripEventsTableExistsCache = Boolean(rows[0]?.table_name);
    return tripEventsTableExistsCache;
};

const getActiveFacultyRows = async () => {
    const { rows } = await pool.query(
        `${LIVE_TRACKING_BASE_QUERY}
         ORDER BY COALESCE(ll.recorded_at, t.updated_at, t.started_at) DESC, fu.full_name ASC`,
        [ALLOWED_COLLEGE_NAMES]
    );

    return rows;
};

const getActiveFacultyRowByUserId = async (facultyUserId) => {
    const { rows } = await pool.query(
        `${LIVE_TRACKING_BASE_QUERY}
         AND fu.id = $2
         LIMIT 1`,
        [ALLOWED_COLLEGE_NAMES, facultyUserId]
    );

    return rows[0] || null;
};

const getActiveFacultyRowByTripId = async (tripId) => {
    const { rows } = await pool.query(
        `${LIVE_TRACKING_BASE_QUERY}
         AND t.id = $2
         LIMIT 1`,
        [ALLOWED_COLLEGE_NAMES, tripId]
    );

    return rows[0] || null;
};

const getFacultyActivityRows = async ({ facultyUserId, tripId = null, limit = 12 }) => {
    const safeLimit = Math.min(Math.max(Number(limit) || 12, 1), 50);
    const activeFacultyRow = tripId
        ? await getActiveFacultyRowByTripId(tripId)
        : await getActiveFacultyRowByUserId(facultyUserId);

    if (!activeFacultyRow) {
        return {
            tripId: tripId || null,
            rows: []
        };
    }

    const resolvedTripId = tripId || activeFacultyRow.trip_id;
    const eventsTableExists = await getTripEventsTableExists();
    const values = [resolvedTripId, facultyUserId, safeLimit];
    const eventUnion = eventsTableExists
        ? `
            SELECT
                te.id::text AS id,
                te.event_type AS type,
                te.title,
                te.subtitle,
                te.occurred_at
            FROM trip_events te
            WHERE te.trip_id = $1
              AND te.faculty_user_id = $2
        `
        : `
            SELECT
                NULL::text AS id,
                NULL::text AS type,
                NULL::text AS title,
                NULL::text AS subtitle,
                NULL::timestamp AS occurred_at
            WHERE FALSE
        `;

    const { rows } = await pool.query(
        `WITH activity_items AS (
            ${eventUnion}
            UNION ALL
            SELECT
                CONCAT('log-', tll.id::text) AS id,
                'location_update'::text AS type,
                'Location updated'::text AS title,
                CONCAT('Near ', COALESCE($4::text, 'Olongapo City')) AS subtitle,
                tll.recorded_at AS occurred_at
            FROM trip_location_logs tll
            WHERE tll.trip_id = $1
              AND tll.user_id = $2
            UNION ALL
            SELECT
                CONCAT('trip-start-', t.id::text) AS id,
                'trip_started'::text AS type,
                'Trip started'::text AS title,
                CONCAT('Destination: ', COALESCE($4::text, t.destination_name, 'Unknown destination')) AS subtitle,
                t.started_at AS occurred_at
            FROM trips t
            WHERE t.id = $1
              AND t.user_id = $2
            UNION ALL
            SELECT
                CONCAT('trip-end-', t.id::text) AS id,
                CASE
                    WHEN t.status = 'completed' THEN 'trip_completed'
                    WHEN t.status = 'cancelled' THEN 'trip_cancelled'
                    ELSE 'trip_status'
                END AS type,
                CASE
                    WHEN t.status = 'completed' THEN 'Trip completed'
                    WHEN t.status = 'cancelled' THEN 'Trip cancelled'
                    ELSE 'Trip updated'
                END AS title,
                CONCAT('Destination: ', COALESCE($4::text, t.destination_name, 'Unknown destination')) AS subtitle,
                t.ended_at AS occurred_at
            FROM trips t
            WHERE t.id = $1
              AND t.user_id = $2
              AND t.ended_at IS NOT NULL
        )
        SELECT id, type, title, subtitle, occurred_at
        FROM activity_items
        WHERE occurred_at IS NOT NULL
        ORDER BY occurred_at DESC
        LIMIT $3`,
        [...values, activeFacultyRow.destination || activeFacultyRow.destination_name || 'Olongapo City']
    );

    return {
        tripId: resolvedTripId,
        rows
    };
};

module.exports = {
    getTripEventsTableExists,
    getActiveFacultyRows,
    getActiveFacultyRowByUserId,
    getActiveFacultyRowByTripId,
    getFacultyActivityRows
};
