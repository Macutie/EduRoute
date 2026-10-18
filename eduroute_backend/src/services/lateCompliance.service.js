const pool = require('../db/pool');
const AppError = require('../utils/appError');

const LATE_THRESHOLD_MINUTES = 8 * 60;
const MANILA_TIME_ZONE = 'Asia/Manila';

const getLateComplianceSummary = async (facultyUserId, client = pool) => {
    const { rows } = await client.query(
        `WITH completed_late_trips AS (
            SELECT
                t.id AS trip_id,
                COALESCE(ls.id, fallback_ls.id) AS locator_slip_id,
                COALESCE(ls.created_at, fallback_ls.created_at) AS locator_slip_filed_at,
                COALESCE(ls.destination, fallback_ls.destination) AS destination,
                COALESCE(ls.expected_return_datetime, fallback_ls.expected_return_datetime) AS expected_return_datetime,
                COALESCE(t.ended_at, t.returned_at) AS actual_return_time,
                GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (
                    COALESCE(t.ended_at, t.returned_at)
                    - COALESCE(ls.expected_return_datetime, fallback_ls.expected_return_datetime)
                )) / 60))::int AS minutes_late
            FROM trips t
            LEFT JOIN locator_slips ls ON ls.id = t.locator_slip_id
            LEFT JOIN LATERAL (
                SELECT slip.*
                FROM locator_slips slip
                WHERE ls.id IS NULL
                  AND slip.faculty_user_id = t.user_id
                ORDER BY ABS(EXTRACT(EPOCH FROM (
                    COALESCE(slip.departure_datetime, slip.created_at)
                    - COALESCE(t.started_at, slip.created_at)
                ))) ASC,
                COALESCE(slip.departure_datetime, slip.created_at) DESC
                LIMIT 1
            ) fallback_ls ON ls.id IS NULL
            WHERE (
                    t.user_id = $1
                    OR COALESCE(ls.faculty_user_id, fallback_ls.faculty_user_id) = $1
                  )
              AND (
                    LOWER(COALESCE(t.status, '')) = 'completed'
                    OR COALESCE(t.ended_at, t.returned_at) IS NOT NULL
                  )
              AND COALESCE(t.ended_at, t.returned_at) IS NOT NULL
              AND COALESCE(ls.expected_return_datetime, fallback_ls.expected_return_datetime) IS NOT NULL
              AND COALESCE(t.ended_at, t.returned_at) > COALESCE(ls.expected_return_datetime, fallback_ls.expected_return_datetime)
              AND COALESCE(ls.id, fallback_ls.id) IS NOT NULL
              AND (COALESCE(t.ended_at, t.returned_at) AT TIME ZONE $2)::date >= date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE $2))::date
              AND (COALESCE(t.ended_at, t.returned_at) AT TIME ZONE $2)::date < (date_trunc('month', (CURRENT_TIMESTAMP AT TIME ZONE $2)) + INTERVAL '1 month')::date
        )
        SELECT
            COALESCE(SUM(minutes_late), 0)::int AS total_late_minutes,
            COALESCE(json_agg(
                json_build_object(
                    'tripId', trip_id,
                    'locatorSlipId', locator_slip_id,
                    'locatorSlipFiledAt', locator_slip_filed_at,
                    'destination', destination,
                    'expectedReturnTime', expected_return_datetime,
                    'actualReturnTime', actual_return_time,
                    'minutesLate', minutes_late
                ) ORDER BY actual_return_time DESC
            ) FILTER (WHERE minutes_late > 0), '[]'::json) AS late_trips
        FROM completed_late_trips`,
        [facultyUserId, MANILA_TIME_ZONE]
    );

    const grantResult = await client.query(
        `SELECT id, uses_remaining, expires_at
         FROM faculty_locator_slip_access_grants
         WHERE faculty_user_id = $1
           AND uses_remaining > 0
           AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
         ORDER BY created_at DESC
         LIMIT 1`,
        [facultyUserId]
    );
    const latestGrantResult = await client.query(
        `SELECT id, created_at
         FROM faculty_locator_slip_access_grants
         WHERE faculty_user_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [facultyUserId]
    );
    const row = rows[0] || {};
    const resetAt = latestGrantResult.rows[0]?.created_at || null;
    const lateTrips = Array.isArray(row.late_trips) ? row.late_trips : [];
    const currentCycleLateTrips = resetAt
        ? lateTrips.filter(trip => new Date(trip.actualReturnTime) > new Date(resetAt))
        : lateTrips;
    const totalLateMinutes = currentCycleLateTrips.reduce(
        (total, trip) => total + Number(trip.minutesLate || 0),
        0
    );
    const thresholdReached = totalLateMinutes >= LATE_THRESHOLD_MINUTES;
    return {
        thresholdMinutes: LATE_THRESHOLD_MINUTES,
        totalLateMinutes,
        lateTrips,
        resetAt,
        thresholdReached,
        restricted: thresholdReached && grantResult.rowCount === 0,
        activeGrant: grantResult.rows[0] || null
    };
};

const assertCanFileLocatorSlip = async (facultyUserId, client) => {
    const summary = await getLateComplianceSummary(facultyUserId, client);
    if (!summary.restricted) return summary;

    const error = new AppError('You have accumulated 8 hours of late returns this month. Please comply with HRMU before filing another locator slip.', 403);
    error.code = 'LATE_COMPLIANCE_REQUIRED';
    error.compliance = summary;
    throw error;
};

const grantLocatorSlipAccess = async (facultyUserId, grantedBy, reason = null) => {
    const { rows } = await pool.query(
        `INSERT INTO faculty_locator_slip_access_grants
            (faculty_user_id, granted_by, reason, uses_remaining, created_at)
         VALUES ($1, $2, $3, 1, CURRENT_TIMESTAMP)
         RETURNING id, uses_remaining, created_at`,
        [facultyUserId, grantedBy, reason]
    );
    return rows[0];
};

const consumeGrant = async (facultyUserId, client) => {
    await client.query(
        `UPDATE faculty_locator_slip_access_grants
         SET uses_remaining = uses_remaining - 1, consumed_at = CASE WHEN uses_remaining <= 1 THEN CURRENT_TIMESTAMP ELSE consumed_at END
         WHERE id = (
             SELECT id FROM faculty_locator_slip_access_grants
             WHERE faculty_user_id = $1 AND uses_remaining > 0
               AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
             ORDER BY created_at DESC LIMIT 1
         )`,
        [facultyUserId]
    );
};

module.exports = { LATE_THRESHOLD_MINUTES, getLateComplianceSummary, assertCanFileLocatorSlip, grantLocatorSlipAccess, consumeGrant };
