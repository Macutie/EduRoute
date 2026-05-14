const pool = require('../db/pool');

const ALLOWED_COLLEGE_NAMES = [
    'College of Education, Arts and Sciences',
    'College of Business and Accountancy',
    'College of Allied Health Studies',
    'College of Hospitality and Tourism Management',
    'College of Computer Studies'
];

const HRMU_NOTIFICATION_TYPE = 'hrmu_locator_slip_approved';
const HRMU_NOTIFICATION_TYPE_REJECTED = 'hrmu_locator_slip_rejected';
const HRMU_NOTIFICATION_TYPE_TRIP_STARTED = 'hrmu_trip_started';
const HRMU_NOTIFICATION_TYPE_ARRIVED = 'hrmu_trip_arrived';
const HRMU_NOTIFICATION_TYPE_TRIP_COMPLETED = 'hrmu_trip_completed';
const HRMU_NOTIFICATION_TYPE_CSSU_VALIDATED_EXIT = 'hrmu_cssu_validated_exit';
const HRMU_NOTIFICATION_TYPE_LOCATION_VERIFIED = 'hrmu_location_verification_submitted';
const HRMU_NOTIFICATION_TYPE_UNVERIFIED_LOCATION = 'hrmu_unverified_location';
const HRMU_NOTIFICATION_TYPE_LOCATION_DISCONNECTED = 'hrmu_location_disconnected';
const HRMU_NOTIFICATION_TYPE_LATE_RETURN = 'hrmu_trip_flagged_late_return';
const HRMU_NOTIFICATION_TYPE_FLAGGED = 'hrmu_trip_flagged';
const HRMU_NOTIFICATION_TYPES = [
    HRMU_NOTIFICATION_TYPE,
    HRMU_NOTIFICATION_TYPE_REJECTED,
    HRMU_NOTIFICATION_TYPE_TRIP_STARTED,
    HRMU_NOTIFICATION_TYPE_ARRIVED,
    HRMU_NOTIFICATION_TYPE_TRIP_COMPLETED,
    HRMU_NOTIFICATION_TYPE_CSSU_VALIDATED_EXIT,
    HRMU_NOTIFICATION_TYPE_LOCATION_VERIFIED,
    HRMU_NOTIFICATION_TYPE_UNVERIFIED_LOCATION,
    HRMU_NOTIFICATION_TYPE_LOCATION_DISCONNECTED,
    HRMU_NOTIFICATION_TYPE_FLAGGED,
    HRMU_NOTIFICATION_TYPE_LATE_RETURN
];
const HRMU_ALLOWED_ROLES = ['hrmu', 'admin'];

const buildCollegeFilter = (filters = {}, startingIndex = 2) => {
    const values = [];
    const clauses = [`department_name = ANY($1::text[])`];

    if (filters.collegeId) {
        values.push(filters.collegeId);
        clauses.push(`id = $${startingIndex + values.length - 1}`);
    }

    if (filters.collegeName) {
        values.push(filters.collegeName);
        clauses.push(`department_name = $${startingIndex + values.length - 1}`);
    }

    return {
        clauses,
        values
    };
};

const getHrmuUserContext = async (userId, allowedRoles = HRMU_ALLOWED_ROLES) => {
    const { rows } = await pool.query(
        `SELECT
            id,
            full_name,
            account_role,
            status
         FROM faculty_users
         WHERE id = $1
           AND account_role = ANY($2::text[])
           AND status = 'active'
         LIMIT 1`,
        [userId, allowedRoles]
    );

    return rows[0] || null;
};

const getDashboardSummaryStats = async () => {
    const { rows } = await pool.query(
        `WITH allowed_colleges AS (
            SELECT id
            FROM departments
            WHERE department_name = ANY($1::text[])
        ),
        active_trip_stats AS (
            SELECT
                COUNT(DISTINCT t.user_id)::int AS total_faculty_outside,
                MAX(COALESCE(ll.recorded_at, t.updated_at, t.started_at)) AS latest_activity_at
            FROM trips t
            JOIN faculty_users fu ON fu.id = t.user_id
            JOIN allowed_colleges ac ON ac.id = fu.department_id
            LEFT JOIN latest_locations ll ON ll.trip_id = t.id
            WHERE t.status IN ('active', 'arrived', 'returning')
              AND fu.account_role = 'faculty'
              AND fu.status = 'active'
        ),
        locator_slip_stats AS (
            SELECT
                COUNT(*) FILTER (WHERE ls.status IN ('approved', 'verified', 'completed') AND (ls.departure_datetime AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila') >= date_trunc('week', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date))::int AS verified_locator_slips,
                COUNT(*) FILTER (WHERE ls.status = 'pending')::int AS unverified_cases
            FROM locator_slips ls
            JOIN faculty_users fu ON fu.id = ls.faculty_user_id
            JOIN allowed_colleges ac ON ac.id = COALESCE(ls.college_id, fu.department_id)
            WHERE fu.account_role = 'faculty'
              AND fu.status = 'active'
        )
        SELECT
            active_trip_stats.total_faculty_outside,
            active_trip_stats.latest_activity_at,
            locator_slip_stats.verified_locator_slips,
            locator_slip_stats.unverified_cases
        FROM active_trip_stats, locator_slip_stats`,
        [ALLOWED_COLLEGE_NAMES]
    );

    return rows[0] || {
        total_faculty_outside: 0,
        latest_activity_at: null,
        verified_locator_slips: 0,
        unverified_cases: 0
    };
};

const LIVE_FACULTY_BASE_QUERY = `
    WITH allowed_colleges AS (
        SELECT id, department_name
        FROM departments
        WHERE department_name = ANY($1::text[])
    )
    SELECT
        fu.id AS faculty_user_id,
        fu.full_name AS faculty_name,
        fu.employee_id,
        COALESCE(fu.department_position, 'Instructor') AS department_position,
        ac.id AS college_id,
        ac.department_name AS college_name,
        slip.id AS locator_slip_id,
        t.id AS trip_id,
        COALESCE(ll.lat, t.origin_lat)::float8 AS lat,
        COALESCE(ll.lng, t.origin_lng)::float8 AS lng,
        ll.heading::float8 AS heading,
        ll.speed::float8 AS speed,
        COALESCE(ll.recorded_at, t.updated_at, t.started_at) AS last_updated_at,
        COALESCE(slip.destination, t.destination_name) AS destination,
        COALESCE(slip.custom_purpose, slip.purpose_of_travel) AS purpose,
        slip.purpose_of_travel,
        slip.departure_datetime,
        slip.expected_return_datetime,
        slip.approved_at,
        slip.reviewed_by_name,
        slip.reviewed_by_role,
        location_verification.image_url AS location_verification_image_url,
        location_verification.verification_status AS location_verification_status,
        location_verification.created_at AS location_verification_created_at,
        t.status AS trip_status
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
            ls.departure_datetime,
            ls.created_at,
            ls.approved_at,
            reviewer.full_name AS reviewed_by_name,
            reviewer.account_role AS reviewed_by_role
        FROM locator_slips ls
        LEFT JOIN faculty_users reviewer ON reviewer.id = ls.reviewed_by
        WHERE ls.faculty_user_id = fu.id
          AND COALESCE(ls.college_id, fu.department_id) = ac.id
          AND ls.status IN ('approved', 'completed')
        ORDER BY
            CASE
                WHEN LOWER(COALESCE(ls.destination, '')) = LOWER(COALESCE(t.destination_name, '')) THEN 0
                ELSE 1
            END,
            ABS(EXTRACT(EPOCH FROM (ls.departure_datetime - COALESCE(t.started_at, ls.departure_datetime)))) ASC,
            ls.created_at DESC
        LIMIT 1
    ) slip ON TRUE
    LEFT JOIN LATERAL (
        SELECT
            verification.image_url,
            verification.verification_status,
            verification.created_at
        FROM locator_slip_location_verifications verification
        WHERE slip.id IS NOT NULL
          AND verification.locator_slip_id = slip.id
          AND verification.faculty_user_id = fu.id
        ORDER BY verification.created_at DESC
        LIMIT 1
    ) location_verification ON TRUE
    WHERE t.status IN ('active', 'arrived', 'returning')
      AND fu.account_role = 'faculty'
      AND fu.status = 'active'
`;

const getLiveFacultyRows = async () => {
    const { rows } = await pool.query(
        `${LIVE_FACULTY_BASE_QUERY}
         ORDER BY COALESCE(ll.recorded_at, t.updated_at, t.started_at) DESC, fu.full_name ASC`,
        [ALLOWED_COLLEGE_NAMES]
    );

    return rows;
};

const getLiveFacultyRowByTripId = async (tripId) => {
    const { rows } = await pool.query(
        `${LIVE_FACULTY_BASE_QUERY}
         AND t.id = $2
         LIMIT 1`,
        [ALLOWED_COLLEGE_NAMES, tripId]
    );

    return rows[0] || null;
};

const getHrmuNotificationsPage = async (_recipientUserId, { page = 1, limit = 20 } = {}) => {
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const offset = (safePage - 1) * safeLimit;

    const countResult = await pool.query(
        `WITH allowed_colleges AS (
            SELECT id
            FROM departments
            WHERE department_name = ANY($1::text[])
        )
        SELECT COUNT(*)::int AS total
        FROM notifications n
        JOIN locator_slips ls ON ls.id = n.locator_slip_id
        JOIN faculty_users fu ON fu.id = ls.faculty_user_id
        WHERE n.recipient_user_id = $2
          AND n.type = ANY($3::text[])
          AND COALESCE(ls.college_id, fu.department_id) IN (SELECT id FROM allowed_colleges)`,
        [ALLOWED_COLLEGE_NAMES, _recipientUserId, HRMU_NOTIFICATION_TYPES]
    );

    const { rows } = await pool.query(
        `WITH allowed_colleges AS (
            SELECT id, department_name
            FROM departments
            WHERE department_name = ANY($1::text[])
        )
        SELECT
            n.id,
            ls.id AS locator_slip_id,
            trip_context.trip_id,
            fu.full_name AS faculty_name,
            ac.department_name AS college_name,
            COALESCE(ls.custom_purpose, ls.purpose_of_travel) AS purpose,
            n.type,
            CASE
                WHEN n.type = $4 THEN 'verified'
                WHEN n.type = $5 THEN 'rejected'
                WHEN n.type = $6 THEN 'verified'
                WHEN n.type = $7 THEN 'verified'
                WHEN n.type = $8 THEN 'verified'
                WHEN n.type = $9 THEN 'verification_submitted'
                WHEN n.type = $10 THEN 'flagged'
                WHEN n.type = $11 THEN 'flagged'
                WHEN n.type = $12 THEN 'flagged'
                WHEN n.type = $13 THEN 'flagged'
                WHEN n.type = $14 THEN 'flagged'
                ELSE 'info'
            END AS status,
            n.title,
            n.message,
            n.created_at,
            ls.approved_at,
            reviewer.full_name AS reviewed_by_name,
            verification.image_url AS verification_image_url,
            verification.verification_status
        FROM notifications n
        JOIN locator_slips ls ON ls.id = n.locator_slip_id
        JOIN faculty_users fu ON fu.id = ls.faculty_user_id
        JOIN allowed_colleges ac ON ac.id = COALESCE(ls.college_id, fu.department_id)
        LEFT JOIN faculty_users reviewer ON reviewer.id = ls.reviewed_by
        LEFT JOIN LATERAL (
            SELECT trip.id AS trip_id
            FROM trips trip
            WHERE trip.user_id = fu.id
            ORDER BY
                ABS(EXTRACT(EPOCH FROM (COALESCE(ls.departure_datetime, ls.created_at) - COALESCE(trip.started_at, ls.created_at)))) ASC,
                COALESCE(trip.ended_at, trip.started_at, trip.created_at) DESC
            LIMIT 1
        ) trip_context ON TRUE
        LEFT JOIN LATERAL (
            SELECT
                proof.image_url,
                proof.verification_status
            FROM locator_slip_location_verifications proof
            WHERE proof.locator_slip_id = ls.id
              AND proof.faculty_user_id = fu.id
            ORDER BY proof.created_at DESC
            LIMIT 1
        ) verification ON TRUE
        WHERE n.recipient_user_id = $2
          AND n.type = ANY($3::text[])
        ORDER BY n.created_at DESC
        LIMIT $15 OFFSET $16`,
        [
            ALLOWED_COLLEGE_NAMES,
            _recipientUserId,
            HRMU_NOTIFICATION_TYPES,
            HRMU_NOTIFICATION_TYPE,
            HRMU_NOTIFICATION_TYPE_REJECTED,
            HRMU_NOTIFICATION_TYPE_TRIP_STARTED,
            HRMU_NOTIFICATION_TYPE_ARRIVED,
            HRMU_NOTIFICATION_TYPE_TRIP_COMPLETED,
            HRMU_NOTIFICATION_TYPE_CSSU_VALIDATED_EXIT,
            HRMU_NOTIFICATION_TYPE_LOCATION_VERIFIED,
            HRMU_NOTIFICATION_TYPE_UNVERIFIED_LOCATION,
            HRMU_NOTIFICATION_TYPE_LOCATION_DISCONNECTED,
            HRMU_NOTIFICATION_TYPE_FLAGGED,
            HRMU_NOTIFICATION_TYPE_LATE_RETURN,
            safeLimit,
            offset
        ]
    );

    return {
        rows,
        pagination: {
            page: safePage,
            limit: safeLimit,
            total: countResult.rows[0]?.total || 0
        }
    };
};

const createHrmuTripEventNotifications = async (client = pool, { locatorSlipId, title, message, type }) => {
    if (!locatorSlipId || !title || !message || !type) {
        return [];
    }

    const notificationResult = await client.query(
        `INSERT INTO notifications (
            recipient_user_id,
            locator_slip_id,
            title,
            message,
            type
        )
        SELECT
            recipient.id,
            $1,
            $2,
            $3,
            $4::text
        FROM faculty_users recipient
        WHERE recipient.account_role = ANY($5::text[])
          AND recipient.status = 'active'
          AND NOT EXISTS (
            SELECT 1
            FROM notifications existing
            WHERE existing.recipient_user_id = recipient.id
              AND existing.locator_slip_id = $1
              AND existing.type = $4::text
          )
        RETURNING *`,
        [
            locatorSlipId,
            title,
            message,
            type,
            HRMU_ALLOWED_ROLES
        ]
    );

    return notificationResult.rows;
};

const getRecentActivityPage = async ({ page = 1, limit = 20, collegeId = null, collegeName = null, status = null, verification = null } = {}) => {
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const offset = (safePage - 1) * safeLimit;

    const collegeFilter = buildCollegeFilter({ collegeId, collegeName });
    const filterValues = [...collegeFilter.values];
    const whereClauses = [
        'fu.account_role = \'faculty\'',
        'fu.status = \'active\'',
        `COALESCE(ls.college_id, fu.department_id) IN (
            SELECT id
            FROM departments
            WHERE ${collegeFilter.clauses.join(' AND ')}
        )`
    ];

    let parameterIndex = 2 + filterValues.length;

    if (status) {
        filterValues.push(status);
        whereClauses.push(`ls.status = $${parameterIndex}`);
        parameterIndex += 1;
    }

    if (verification === 'verified') {
        whereClauses.push(`ls.status IN ('approved', 'verified', 'completed')`);
    } else if (verification === 'unverified') {
        whereClauses.push(`ls.status = 'pending'`);
    }

    whereClauses.push(`(ls.departure_datetime AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Manila') >= date_trunc('week', (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date)`);

    const countQuery = `
        SELECT COUNT(*)::int AS total
        FROM locator_slips ls
        JOIN faculty_users fu ON fu.id = ls.faculty_user_id
        WHERE ${whereClauses.join(' AND ')}
    `;

    const countResult = await pool.query(countQuery, [ALLOWED_COLLEGE_NAMES, ...filterValues]);

    const rowsQuery = `
        SELECT
            ls.id AS locator_slip_id,
            t.id AS trip_id,
            fu.id AS faculty_user_id,
            fu.full_name AS faculty_name,
            d.department_name AS college_name,
            fu.department_position AS department_name,
            ls.destination,
            ls.departure_datetime AS departure_time,
            ls.expected_return_datetime AS expected_return_time,
            COALESCE(ls.custom_purpose, ls.purpose_of_travel) AS purpose,
            ls.status AS verification_status,
            location_verification.verification_status AS location_verification_status,
            location_verification.image_url AS location_verification_image_url,
            COALESCE(t.status, 'not_started') AS trip_status,
            COALESCE(t.ended_at, t.updated_at) AS actual_return_time,
            latest_location.recorded_at AS latest_location_at
        FROM locator_slips ls
        JOIN faculty_users fu ON fu.id = ls.faculty_user_id
        JOIN departments d ON d.id = COALESCE(ls.college_id, fu.department_id)
        LEFT JOIN LATERAL (
            SELECT trip.id, trip.status, trip.started_at, trip.ended_at, trip.updated_at
            FROM trips trip
            WHERE trip.user_id = fu.id
            ORDER BY
                ABS(EXTRACT(EPOCH FROM (ls.departure_datetime - COALESCE(trip.started_at, ls.departure_datetime)))) ASC,
                trip.started_at DESC NULLS LAST,
                trip.created_at DESC
            LIMIT 1
        ) t ON TRUE
        LEFT JOIN LATERAL (
            SELECT ll.recorded_at
            FROM latest_locations ll
            WHERE ll.trip_id = t.id
            LIMIT 1
        ) latest_location ON TRUE
        LEFT JOIN LATERAL (
            SELECT verification.verification_status, verification.image_url
            FROM locator_slip_location_verifications verification
            WHERE verification.locator_slip_id = ls.id
              AND verification.faculty_user_id = fu.id
            ORDER BY verification.created_at DESC
            LIMIT 1
        ) location_verification ON TRUE
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY ls.departure_datetime DESC, ls.created_at DESC
        LIMIT $${parameterIndex} OFFSET $${parameterIndex + 1}
    `;

    const { rows } = await pool.query(rowsQuery, [ALLOWED_COLLEGE_NAMES, ...filterValues, safeLimit, offset]);

    return {
        rows,
        pagination: {
            page: safePage,
            limit: safeLimit,
            total: countResult.rows[0]?.total || 0
        }
    };
};

const getApprovedLocatorSlipNotificationPayload = async (locatorSlipId, client = pool) => {
    const { rows } = await client.query(
        `WITH allowed_colleges AS (
            SELECT id, department_name
            FROM departments
            WHERE department_name = ANY($1::text[])
        )
        SELECT
            ls.id AS locator_slip_id,
            fu.full_name AS faculty_name,
            ac.department_name AS college_name,
            COALESCE(ls.custom_purpose, ls.purpose_of_travel) AS purpose,
            'approved'::text AS status,
            COALESCE(ls.approved_at, ls.updated_at, ls.created_at) AS approved_at,
            reviewer.full_name AS reviewed_by_name,
            CONCAT(fu.full_name, ' locator slip approved for ', COALESCE(ls.custom_purpose, ls.purpose_of_travel), '.') AS message
        FROM locator_slips ls
        JOIN faculty_users fu ON fu.id = ls.faculty_user_id
        JOIN allowed_colleges ac ON ac.id = COALESCE(ls.college_id, fu.department_id)
        LEFT JOIN faculty_users reviewer ON reviewer.id = ls.reviewed_by
        WHERE ls.id = $2
        LIMIT 1`,
        [ALLOWED_COLLEGE_NAMES, locatorSlipId]
    );

    return rows[0] || null;
};

const createApprovalNotificationsForHrmu = async (client, locatorSlipId) => {
    const payload = await getApprovedLocatorSlipNotificationPayload(locatorSlipId, client);

    if (!payload) {
        return null;
    }

    await createHrmuTripEventNotifications(client, {
        locatorSlipId,
        title: 'Locator slip verified',
        message: payload.message,
        type: HRMU_NOTIFICATION_TYPE
    });

    return payload;
};

module.exports = {
    ALLOWED_COLLEGE_NAMES,
    HRMU_ALLOWED_ROLES,
    HRMU_NOTIFICATION_TYPE,
    HRMU_NOTIFICATION_TYPE_REJECTED,
    HRMU_NOTIFICATION_TYPE_TRIP_STARTED,
    HRMU_NOTIFICATION_TYPE_ARRIVED,
    HRMU_NOTIFICATION_TYPE_TRIP_COMPLETED,
    HRMU_NOTIFICATION_TYPE_CSSU_VALIDATED_EXIT,
    HRMU_NOTIFICATION_TYPE_LOCATION_VERIFIED,
    HRMU_NOTIFICATION_TYPE_UNVERIFIED_LOCATION,
    HRMU_NOTIFICATION_TYPE_LOCATION_DISCONNECTED,
    HRMU_NOTIFICATION_TYPE_FLAGGED,
    HRMU_NOTIFICATION_TYPE_LATE_RETURN,
    HRMU_NOTIFICATION_TYPES,
    getHrmuUserContext,
    getDashboardSummaryStats,
    getLiveFacultyRows,
    getLiveFacultyRowByTripId,
    getHrmuNotificationsPage,
    getRecentActivityPage,
    createHrmuTripEventNotifications,
    createApprovalNotificationsForHrmu,
    getApprovedLocatorSlipNotificationPayload
};
