const pool = require('../db/pool');
const { ALLOWED_COLLEGE_NAMES } = require('./hrmuDashboard.repository');

const APPROVED_ANALYTICS_STATUSES = ['approved', 'verified', 'completed'];
let tripColumnCache = null;

const getTripsColumnSet = async () => {
    if (tripColumnCache) {
        return tripColumnCache;
    }

    const { rows } = await pool.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'trips'`
    );

    tripColumnCache = new Set(rows.map((row) => row.column_name));
    return tripColumnCache;
};

const getTripDistanceExpression = async () => {
    const tripColumns = await getTripsColumnSet();

    if (tripColumns.has('optimized_distance_meters') && tripColumns.has('route_distance_meters')) {
        return 'COALESCE(t.optimized_distance_meters, t.route_distance_meters)';
    }

    if (tripColumns.has('optimized_distance_meters')) {
        return 't.optimized_distance_meters';
    }

    if (tripColumns.has('route_distance_meters')) {
        return 't.route_distance_meters';
    }

    return 'NULL';
};

const resolveAllowedColleges = async ({ collegeId = null, collegeName = null } = {}) => {
    const { rows } = await pool.query(
        `SELECT id, department_name
         FROM departments
         WHERE department_name = ANY($1::text[])
         ORDER BY array_position($1::text[], department_name), department_name ASC`,
        [ALLOWED_COLLEGE_NAMES]
    );

    const requestedCollegeId = collegeId ? Number(collegeId) : null;
    const requestedCollegeName = collegeName ? String(collegeName).trim() : null;
    let selectedCollege = null;

    if (requestedCollegeId) {
        selectedCollege = rows.find((row) => row.id === requestedCollegeId) || null;
    } else if (requestedCollegeName) {
        selectedCollege = rows.find((row) => row.department_name === requestedCollegeName) || null;
    }

    if ((requestedCollegeId || requestedCollegeName) && !selectedCollege) {
        const error = new Error('Selected college filter is invalid.');
        error.statusCode = 400;
        throw error;
    }

    return {
        colleges: rows.map((row) => ({
            id: row.id,
            name: row.department_name
        })),
        selectedCollege,
        collegeIds: selectedCollege ? [selectedCollege.id] : rows.map((row) => row.id)
    };
};

const getDailyFacultyMovementRows = async ({ start, endExclusive, collegeIds }) => {
    const { rows } = await pool.query(
        `WITH date_series AS (
            SELECT generate_series($1::date, ($2::date - INTERVAL '1 day')::date, INTERVAL '1 day')::date AS day
        ),
        daily_counts AS (
            SELECT
                DATE(ls.created_at) AS day,
                COUNT(*)::int AS locator_slip_count
            FROM locator_slips ls
            JOIN faculty_users fu ON fu.id = ls.faculty_user_id
            WHERE ls.created_at >= $1
              AND ls.created_at < $2
              AND COALESCE(ls.college_id, fu.department_id) = ANY($3::int[])
              AND fu.account_role = 'faculty'
              AND fu.status = 'active'
            GROUP BY DATE(ls.created_at)
        )
        SELECT
            ds.day::date AS date,
            UPPER(TO_CHAR(ds.day, 'DY')) AS day_label,
            COALESCE(dc.locator_slip_count, 0)::int AS locator_slip_count
        FROM date_series ds
        LEFT JOIN daily_counts dc ON dc.day = ds.day
        ORDER BY ds.day ASC`,
        [start, endExclusive, collegeIds]
    );

    return rows;
};

const getApprovalRateCounts = async ({ start, endExclusive, currentWeekStart, currentWeekEndExclusive, previousWeekStart, previousWeekEndExclusive, collegeIds }) => {
    const { rows } = await pool.query(
        `SELECT
            COUNT(*) FILTER (
                WHERE ls.created_at >= $1
                  AND ls.created_at < $2
            )::int AS total_filed_count,
            COUNT(*) FILTER (
                WHERE ls.created_at >= $1
                  AND ls.created_at < $2
                  AND ls.status = ANY($7::text[])
            )::int AS approved_count,
            COUNT(*) FILTER (
                WHERE ls.created_at >= $3
                  AND ls.created_at < $4
            )::int AS current_week_total_count,
            COUNT(*) FILTER (
                WHERE ls.created_at >= $3
                  AND ls.created_at < $4
                  AND ls.status = ANY($7::text[])
            )::int AS current_week_approved_count,
            COUNT(*) FILTER (
                WHERE ls.created_at >= $5
                  AND ls.created_at < $6
            )::int AS previous_week_total_count,
            COUNT(*) FILTER (
                WHERE ls.created_at >= $5
                  AND ls.created_at < $6
                  AND ls.status = ANY($7::text[])
            )::int AS previous_week_approved_count
         FROM locator_slips ls
         JOIN faculty_users fu ON fu.id = ls.faculty_user_id
         WHERE COALESCE(ls.college_id, fu.department_id) = ANY($8::int[])
           AND fu.account_role = 'faculty'
           AND fu.status = 'active'`,
        [
            start,
            endExclusive,
            currentWeekStart,
            currentWeekEndExclusive,
            previousWeekStart,
            previousWeekEndExclusive,
            APPROVED_ANALYTICS_STATUSES,
            collegeIds
        ]
    );

    return rows[0] || {};
};

const getFrequentDestinationRows = async ({ start, endExclusive, collegeIds, limit = 200 }) => {
    const { rows } = await pool.query(
        `SELECT
            ls.destination,
            COUNT(*)::int AS count
         FROM locator_slips ls
         JOIN faculty_users fu ON fu.id = ls.faculty_user_id
         WHERE ls.created_at >= $1
           AND ls.created_at < $2
           AND COALESCE(ls.college_id, fu.department_id) = ANY($3::int[])
           AND fu.account_role = 'faculty'
           AND fu.status = 'active'
           AND COALESCE(BTRIM(ls.destination), '') <> ''
         GROUP BY ls.destination
         ORDER BY COUNT(*) DESC, ls.destination ASC
         LIMIT $4`,
        [start, endExclusive, collegeIds, limit]
    );

    return rows;
};

const getMonthlySummaryStats = async ({ start, endExclusive, previousMonthStart, previousMonthEndExclusive, collegeIds }) => {
    const distanceExpression = await getTripDistanceExpression();
    const { rows } = await pool.query(
        `WITH filtered_trips AS (
            SELECT
                t.id,
                t.user_id,
                t.status,
                t.started_at,
                t.ended_at,
                ${distanceExpression} AS distance_meters
            FROM trips t
            JOIN faculty_users fu ON fu.id = t.user_id
            WHERE fu.department_id = ANY($5::int[])
              AND fu.account_role = 'faculty'
              AND fu.status = 'active'
        ),
        current_month_completed AS (
            SELECT *
            FROM filtered_trips
            WHERE status = 'completed'
              AND ended_at >= $1
              AND ended_at < $2
        ),
        previous_month_completed AS (
            SELECT *
            FROM filtered_trips
            WHERE status = 'completed'
              AND ended_at >= $3
              AND ended_at < $4
        ),
        eligible_faculty AS (
            SELECT COUNT(*)::int AS total_eligible_faculty
            FROM faculty_users fu
            WHERE fu.department_id = ANY($5::int[])
              AND fu.account_role = 'faculty'
              AND fu.status = 'active'
        ),
        peak_hour_data AS (
            SELECT
                EXTRACT(HOUR FROM started_at)::int AS peak_hour,
                ROUND(AVG(EXTRACT(MINUTE FROM started_at)))::int AS avg_minute,
                COUNT(*)::int AS trip_count
            FROM current_month_completed
            GROUP BY EXTRACT(HOUR FROM started_at)
            ORDER BY trip_count DESC, peak_hour ASC
            LIMIT 1
        )
        SELECT
            (SELECT COUNT(*)::int FROM current_month_completed) AS total_trips_completed,
            (SELECT COUNT(*)::int FROM previous_month_completed) AS previous_month_completed_trips,
            (SELECT ROUND(AVG(distance_meters) / 1000.0, 1) FROM current_month_completed WHERE distance_meters IS NOT NULL) AS average_distance_km,
            (SELECT COUNT(DISTINCT user_id)::int FROM current_month_completed) AS unique_users_completed_trips,
            (SELECT total_eligible_faculty FROM eligible_faculty) AS total_eligible_faculty,
            (SELECT peak_hour FROM peak_hour_data) AS peak_hour,
            (SELECT avg_minute FROM peak_hour_data) AS avg_minute`,
        [start, endExclusive, previousMonthStart, previousMonthEndExclusive, collegeIds]
    );

    return rows[0] || {};
};

const getSmartTripRows = async ({ start, endExclusive, collegeIds }) => {
    const { rows } = await pool.query(
        `WITH current_month_slips AS (
            SELECT
                ls.id,
                ls.faculty_user_id,
                COALESCE(ls.college_id, fu.department_id) AS college_id,
                ls.destination,
                ls.purpose_of_travel,
                ls.custom_purpose,
                ls.expected_return_datetime,
                ls.departure_datetime,
                ls.created_at
            FROM locator_slips ls
            JOIN faculty_users fu ON fu.id = ls.faculty_user_id
            WHERE ls.created_at >= $1
              AND ls.created_at < $2
              AND COALESCE(ls.college_id, fu.department_id) = ANY($3::int[])
              AND fu.account_role = 'faculty'
              AND fu.status = 'active'
        ),
        current_month_trips AS (
            SELECT
                t.id,
                t.user_id,
                t.locator_slip_id,
                t.status,
                t.started_at,
                t.ended_at,
                t.updated_at,
                t.destination_name,
                t.destination_lat,
                t.destination_lng,
                t.origin_lat,
                t.origin_lng,
                t.route_geometry,
                t.arrived_at,
                t.arrival_verified_at,
                t.returned_at,
                t.route_distance_meters,
                t.total_distance_km
            FROM trips t
            JOIN faculty_users fu ON fu.id = t.user_id
            WHERE COALESCE(t.started_at, t.created_at) >= $1
              AND COALESCE(t.started_at, t.created_at) < $2
              AND fu.department_id = ANY($3::int[])
              AND fu.account_role = 'faculty'
              AND fu.status = 'active'
        )
        SELECT
            t.id AS trip_id,
            t.user_id AS faculty_user_id,
            fu.full_name AS faculty_name,
            fu.employee_id,
            d.id AS college_id,
            d.department_name AS college_name,
            t.status AS trip_status,
            t.started_at,
            t.ended_at,
            t.updated_at AS trip_updated_at,
            t.arrived_at,
            t.arrival_verified_at,
            t.returned_at,
            COALESCE(ls.id, fallback_ls.id) AS locator_slip_id,
            COALESCE(ls.destination, fallback_ls.destination, t.destination_name) AS destination,
            COALESCE(ls.custom_purpose, ls.purpose_of_travel, fallback_ls.custom_purpose, fallback_ls.purpose_of_travel, t.destination_name) AS purpose,
            COALESCE(ls.expected_return_datetime, fallback_ls.expected_return_datetime) AS expected_return_datetime,
            COALESCE(ll.recorded_at, t.updated_at, t.started_at) AS last_location_at,
            ll.lat::float8 AS current_lat,
            ll.lng::float8 AS current_lng,
            t.destination_lat::float8 AS destination_lat,
            t.destination_lng::float8 AS destination_lng,
            t.origin_lat::float8 AS origin_lat,
            t.origin_lng::float8 AS origin_lng,
            t.route_geometry,
            t.route_distance_meters::float8 AS route_distance_meters,
            t.total_distance_km::float8 AS total_distance_km,
            COALESCE(location_stats.saved_points, 0)::int AS saved_gps_points,
            location_stats.actual_distance_km::float8 AS actual_distance_km,
            location_stats.actual_path,
            proof.id AS proof_id,
            proof.verification_status AS proof_status,
            location_verification.id AS location_verification_id,
            location_verification.verification_status AS location_verification_status,
            COALESCE(previous_late_returns.count, 0)::int AS previous_late_return_count
        FROM current_month_trips t
        JOIN faculty_users fu ON fu.id = t.user_id
        JOIN departments d ON d.id = fu.department_id
        LEFT JOIN current_month_slips ls ON ls.id = t.locator_slip_id
        LEFT JOIN LATERAL (
            SELECT slip.*
            FROM current_month_slips slip
            WHERE ls.id IS NULL
              AND slip.faculty_user_id = t.user_id
            ORDER BY
                ABS(EXTRACT(EPOCH FROM (COALESCE(slip.departure_datetime, slip.created_at) - COALESCE(t.started_at, slip.created_at)))) ASC,
                COALESCE(slip.departure_datetime, slip.created_at) DESC
            LIMIT 1
        ) fallback_ls ON ls.id IS NULL
        LEFT JOIN latest_locations ll ON ll.trip_id = t.id
        LEFT JOIN LATERAL (
            SELECT
                COUNT(*)::int AS saved_points,
                ROUND(
                    COALESCE(
                        SUM(
                            6371 * 2 * ASIN(
                                SQRT(
                                    POWER(SIN(RADIANS((point.lat - point.prev_lat) / 2)), 2)
                                    + COS(RADIANS(point.prev_lat)) * COS(RADIANS(point.lat))
                                    * POWER(SIN(RADIANS((point.lng - point.prev_lng) / 2)), 2)
                                )
                            )
                        ),
                        0
                    )::numeric,
                    2
                ) AS actual_distance_km,
                JSONB_AGG(
                    JSONB_BUILD_OBJECT(
                        'lat', point.lat::float8,
                        'lng', point.lng::float8,
                        'recordedAt', point.recorded_at
                    )
                    ORDER BY point.recorded_at ASC
                ) AS actual_path
            FROM (
                SELECT
                    tll.lat::float8 AS lat,
                    tll.lng::float8 AS lng,
                    tll.recorded_at,
                    LAG(tll.lat::float8) OVER (ORDER BY tll.recorded_at ASC, tll.id ASC) AS prev_lat,
                    LAG(tll.lng::float8) OVER (ORDER BY tll.recorded_at ASC, tll.id ASC) AS prev_lng
                FROM trip_location_logs tll
                WHERE tll.trip_id = t.id
            ) point
        ) location_stats ON TRUE
        LEFT JOIN LATERAL (
            SELECT proof_row.id, proof_row.verification_status
            FROM arrival_verifications proof_row
            WHERE proof_row.trip_id = t.id
               OR proof_row.locator_slip_id = COALESCE(ls.id, fallback_ls.id)
            ORDER BY proof_row.created_at DESC
            LIMIT 1
        ) proof ON TRUE
        LEFT JOIN LATERAL (
            SELECT verification.id, verification.verification_status
            FROM locator_slip_location_verifications verification
            WHERE verification.locator_slip_id = COALESCE(ls.id, fallback_ls.id)
              AND verification.faculty_user_id = t.user_id
            ORDER BY verification.created_at DESC
            LIMIT 1
        ) location_verification ON TRUE
        LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS count
            FROM trips previous_trip
            JOIN locator_slips previous_slip ON previous_slip.id = previous_trip.locator_slip_id
            WHERE previous_trip.user_id = t.user_id
              AND previous_trip.id <> t.id
              AND previous_trip.status = 'completed'
              AND previous_slip.expected_return_datetime IS NOT NULL
              AND COALESCE(previous_trip.ended_at, previous_trip.returned_at, previous_trip.updated_at) > (previous_slip.expected_return_datetime + INTERVAL '60 minutes')
        ) previous_late_returns ON TRUE
        ORDER BY COALESCE(t.started_at, t.updated_at) DESC, fu.full_name ASC`,
        [start, endExclusive, collegeIds]
    );

    return rows;
};

const getSmartLocatorSlipCounts = async ({ start, endExclusive, collegeIds }) => {
    const { rows } = await pool.query(
        `SELECT
            COUNT(*)::int AS total_filed,
            COUNT(*) FILTER (WHERE ls.status IN ('approved', 'verified', 'completed'))::int AS approved_count,
            COUNT(*) FILTER (WHERE ls.status = 'rejected')::int AS rejected_count,
            COUNT(*) FILTER (WHERE ls.status = 'cancelled')::int AS cancelled_count
         FROM locator_slips ls
         JOIN faculty_users fu ON fu.id = ls.faculty_user_id
         WHERE ls.created_at >= $1
           AND ls.created_at < $2
           AND COALESCE(ls.college_id, fu.department_id) = ANY($3::int[])
           AND fu.account_role = 'faculty'
           AND fu.status = 'active'`,
        [start, endExclusive, collegeIds]
    );

    return rows[0] || {};
};

const getSmartCollegeSummaryRows = async ({ start, endExclusive, collegeIds }) => {
    const { rows } = await pool.query(
        `WITH allowed_colleges AS (
            SELECT id, department_name
            FROM departments
            WHERE id = ANY($3::int[])
        )
        SELECT
            ac.id AS college_id,
            ac.department_name AS college_name,
            COUNT(DISTINCT ls.id)::int AS locator_slip_count,
            COUNT(DISTINCT ls.id) FILTER (WHERE ls.status = 'rejected')::int AS rejected_slip_count,
            COUNT(DISTINCT previous_ls.id)::int AS previous_locator_slip_count,
            COUNT(DISTINCT t.id)::int AS trip_count,
            COUNT(DISTINCT previous_t.id)::int AS previous_trip_count,
            COUNT(DISTINCT t.id) FILTER (WHERE t.status IN ('active', 'arrived', 'returning'))::int AS active_trip_count,
            COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed')::int AS completed_trip_count,
            COUNT(DISTINCT t.id) FILTER (
                WHERE t.status = 'completed'
                  AND ls.expected_return_datetime IS NOT NULL
                  AND COALESCE(t.ended_at, t.returned_at, t.updated_at) > ls.expected_return_datetime
            )::int AS late_return_count
        FROM allowed_colleges ac
        LEFT JOIN faculty_users fu ON fu.department_id = ac.id
          AND fu.account_role = 'faculty'
          AND fu.status = 'active'
        LEFT JOIN locator_slips ls ON ls.faculty_user_id = fu.id
          AND ls.created_at >= $1
          AND ls.created_at < $2
        LEFT JOIN locator_slips previous_ls ON previous_ls.faculty_user_id = fu.id
          AND previous_ls.created_at >= ($1::timestamptz - ($2::timestamptz - $1::timestamptz))
          AND previous_ls.created_at < $1
        LEFT JOIN trips t ON t.user_id = fu.id
          AND COALESCE(t.started_at, t.created_at) >= $1
          AND COALESCE(t.started_at, t.created_at) < $2
        LEFT JOIN trips previous_t ON previous_t.user_id = fu.id
          AND COALESCE(previous_t.started_at, previous_t.created_at) >= ($1::timestamptz - ($2::timestamptz - $1::timestamptz))
          AND COALESCE(previous_t.started_at, previous_t.created_at) < $1
        GROUP BY ac.id, ac.department_name
        ORDER BY trip_count DESC, locator_slip_count DESC, ac.department_name ASC`,
        [start, endExclusive, collegeIds]
    );

    return rows;
};

const getPeakMovementRows = async ({ start, endExclusive, collegeIds }) => {
    const { rows } = await pool.query(
        `SELECT
            UPPER(TO_CHAR(ls.created_at, 'DY')) AS day_label,
            EXTRACT(ISODOW FROM ls.created_at)::int AS day_number,
            EXTRACT(HOUR FROM ls.created_at)::int AS hour,
            COUNT(*)::int AS movement_count
         FROM locator_slips ls
         JOIN faculty_users fu ON fu.id = ls.faculty_user_id
         WHERE ls.created_at >= $1
           AND ls.created_at < $2
           AND COALESCE(ls.college_id, fu.department_id) = ANY($3::int[])
           AND fu.account_role = 'faculty'
           AND fu.status = 'active'
         GROUP BY day_label, day_number, hour
         ORDER BY day_number ASC, hour ASC`,
        [start, endExclusive, collegeIds]
    );

    return rows;
};

const upsertTripAnalyticsRows = async (riskRows = []) => {
    if (!riskRows.length) {
        return [];
    }

    const savedRows = [];
    for (const row of riskRows) {
        const { rows } = await pool.query(
            `INSERT INTO trip_analytics (
                trip_id,
                risk_score,
                risk_level,
                reasons,
                generated_at
            )
            VALUES ($1, $2, $3, $4::jsonb, CURRENT_TIMESTAMP)
            ON CONFLICT (trip_id)
            DO UPDATE SET
                risk_score = EXCLUDED.risk_score,
                risk_level = EXCLUDED.risk_level,
                reasons = EXCLUDED.reasons,
                generated_at = EXCLUDED.generated_at
            RETURNING *`,
            [
                row.tripId,
                row.riskScore,
                row.riskLevel,
                JSON.stringify(row.reasons || [])
            ]
        );
        savedRows.push(rows[0]);
    }

    return savedRows;
};

module.exports = {
    APPROVED_ANALYTICS_STATUSES,
    resolveAllowedColleges,
    getDailyFacultyMovementRows,
    getApprovalRateCounts,
    getFrequentDestinationRows,
    getMonthlySummaryStats,
    getSmartTripRows,
    getSmartLocatorSlipCounts,
    getSmartCollegeSummaryRows,
    getPeakMovementRows,
    upsertTripAnalyticsRows
};
