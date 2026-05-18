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

module.exports = {
    APPROVED_ANALYTICS_STATUSES,
    resolveAllowedColleges,
    getDailyFacultyMovementRows,
    getApprovalRateCounts,
    getFrequentDestinationRows,
    getMonthlySummaryStats
};
