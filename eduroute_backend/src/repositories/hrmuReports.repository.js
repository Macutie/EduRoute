const pool = require('../db/pool');
const env = require('../config/env');
const { ALLOWED_COLLEGE_NAMES } = require('./hrmuDashboard.repository');
const { LOCATION_DISCONNECTED_TYPES } = require('./tripIncident.repository');

const getIncidentTableExists = async () => {
    const { rows } = await pool.query(`SELECT to_regclass('public.trip_incidents') AS table_name`);
    return Boolean(rows[0]?.table_name);
};

const buildReportScopeCte = ({ includeIncidents }) => `
    WITH allowed_colleges AS (
        SELECT id, department_name
        FROM departments
        WHERE department_name = ANY($1::text[])
    ),
    ended_trips AS (
        SELECT
            t.id AS trip_id,
            t.user_id AS faculty_user_id,
            COALESCE(t.ended_at, t.updated_at) AS trip_finished_at,
            t.started_at,
            t.status AS trip_status,
            fu.full_name AS faculty_name,
            ac.department_name AS college_name,
            slip.id AS locator_slip_id,
            COALESCE(slip.destination, t.destination_name) AS destination,
            COALESCE(slip.custom_purpose, slip.purpose_of_travel, t.destination_name) AS purpose,
            slip.expected_return_datetime,
            slip.approved_at,
            slip.rejected_at,
            slip.updated_at AS locator_updated_at
        FROM trips t
        JOIN faculty_users fu ON fu.id = t.user_id
        JOIN allowed_colleges ac ON ac.id = fu.department_id
        LEFT JOIN LATERAL (
            SELECT
                ls.id,
                ls.destination,
                ls.custom_purpose,
                ls.purpose_of_travel,
                ls.expected_return_datetime,
                ls.approved_at,
                ls.rejected_at,
                ls.updated_at,
                ls.created_at
            FROM locator_slips ls
            WHERE ls.faculty_user_id = fu.id
            ORDER BY
                ABS(EXTRACT(EPOCH FROM (COALESCE(ls.departure_datetime, ls.created_at) - COALESCE(t.started_at, ls.created_at)))) ASC,
                COALESCE(ls.departure_datetime, ls.created_at) DESC
            LIMIT 1
        ) slip ON TRUE
        WHERE fu.account_role = 'faculty'
          AND fu.status = 'active'
          AND COALESCE(t.ended_at, t.updated_at) >= $2
          AND COALESCE(t.ended_at, t.updated_at) < $3
    ),
    rejected_locator_slips AS (
        SELECT
            NULL::uuid AS trip_id,
            ls.faculty_user_id,
            COALESCE(ls.rejected_at, ls.updated_at) AS event_timestamp,
            fu.full_name AS faculty_name,
            ac.department_name AS college_name,
            ls.id AS locator_slip_id,
            ls.destination,
            COALESCE(ls.custom_purpose, ls.purpose_of_travel) AS purpose,
            ls.rejected_at
        FROM locator_slips ls
        JOIN faculty_users fu ON fu.id = ls.faculty_user_id
        JOIN allowed_colleges ac ON ac.id = COALESCE(ls.college_id, fu.department_id)
        WHERE fu.account_role = 'faculty'
          AND fu.status = 'active'
          AND ls.status = 'rejected'
          AND COALESCE(ls.rejected_at, ls.updated_at) >= $2
          AND COALESCE(ls.rejected_at, ls.updated_at) < $3
    ),
    trip_incident_groups AS (
        ${includeIncidents ? `
        SELECT
            ti.trip_id,
            MAX(ti.detected_at) AS latest_detected_at,
            ARRAY_AGG(
                DISTINCT JSONB_BUILD_OBJECT(
                    'type', ti.incident_type,
                    'label', ti.incident_label,
                    'severity', ti.severity
                )
            ) AS flagged_reasons
        FROM trip_incidents ti
        GROUP BY ti.trip_id
        ` : `
        SELECT
            NULL::uuid AS trip_id,
            NULL::timestamptz AS latest_detected_at,
            '[]'::jsonb AS flagged_reasons
        WHERE FALSE
        `}
    ),
    derived_late_returns AS (
        SELECT
            et.trip_id,
            et.trip_finished_at AS latest_detected_at,
            JSONB_BUILD_OBJECT(
                'type', 'LATE_RETURN',
                'label', 'Late Return',
                'severity', 'high'
            ) AS flagged_reason
        FROM ended_trips et
        WHERE et.expected_return_datetime IS NOT NULL
          AND et.trip_finished_at > (et.expected_return_datetime + INTERVAL '${Number(env.lateReturnGraceMinutes || 60)} minutes')
    ),
    derived_unverified_locations AS (
        SELECT
            et.trip_id,
            COALESCE(lv.created_at, et.trip_finished_at, et.locator_updated_at) AS latest_detected_at,
            JSONB_BUILD_OBJECT(
                'type', 'UNVERIFIED_LOCATION',
                'label', 'Unverified Location',
                'severity', 'high'
            ) AS flagged_reason
        FROM ended_trips et
        JOIN LATERAL (
            SELECT
                verification.verification_status,
                verification.created_at
            FROM locator_slip_location_verifications verification
            WHERE verification.locator_slip_id = et.locator_slip_id
              AND verification.faculty_user_id = et.faculty_user_id
            ORDER BY verification.created_at DESC
            LIMIT 1
        ) lv ON TRUE
        WHERE LOWER(COALESCE(lv.verification_status, '')) = 'rejected'
    ),
    effective_trip_flags AS (
        SELECT
            flagged.trip_id,
            MAX(flagged.latest_detected_at) AS latest_detected_at,
            JSONB_AGG(DISTINCT flagged.flagged_reason) AS flagged_reasons
        FROM (
            ${includeIncidents ? `
            SELECT
                tig.trip_id,
                tig.latest_detected_at,
                reason.value AS flagged_reason
            FROM trip_incident_groups tig
            CROSS JOIN LATERAL JSONB_ARRAY_ELEMENTS(tig.flagged_reasons) AS reason(value)
            UNION ALL
            ` : ''}
            SELECT
                dlr.trip_id,
                dlr.latest_detected_at,
                dlr.flagged_reason
            FROM derived_late_returns dlr
            UNION ALL
            SELECT
                dul.trip_id,
                dul.latest_detected_at,
                dul.flagged_reason
            FROM derived_unverified_locations dul
        ) flagged
        GROUP BY flagged.trip_id
    )
`;

const getMonthlySummary = async ({ start, endExclusive }) => {
    const includeIncidents = await getIncidentTableExists();
    const incidentSummaryColumns = includeIncidents
        ? `
            (SELECT COUNT(DISTINCT COALESCE(et.locator_slip_id::text, et.trip_id::text))::int
             FROM ended_trips et
             WHERE EXISTS (
                SELECT 1
                FROM effective_trip_flags etf
                WHERE etf.trip_id = et.trip_id
             )
            ) AS flagged_incidents,
            (SELECT COUNT(DISTINCT trip_id)::int
             FROM (
                SELECT ti.trip_id
                FROM trip_incidents ti
                JOIN ended_trips et ON et.trip_id = ti.trip_id
                WHERE ti.incident_type = 'LATE_RETURN'
                UNION
                SELECT dlr.trip_id
                FROM derived_late_returns dlr
             ) late_trip_ids
            ) AS late_returns,
            (SELECT COUNT(DISTINCT ti.trip_id)::int
             FROM (
                SELECT ti.trip_id
                FROM trip_incidents ti
                JOIN ended_trips et ON et.trip_id = ti.trip_id
                WHERE ti.incident_type = 'UNVERIFIED_LOCATION'
                UNION
                SELECT dul.trip_id
                FROM derived_unverified_locations dul
             ) unverified_trip_ids
            ) AS unverified_locations,
            (SELECT COUNT(DISTINCT ti.trip_id)::int
             FROM trip_incidents ti
             JOIN ended_trips et ON et.trip_id = ti.trip_id
             WHERE ti.incident_type = ANY($4::text[])
            ) AS disconnected_locations
        `
        : `
            (SELECT COUNT(DISTINCT et.trip_id)::int
             FROM ended_trips et
             JOIN effective_trip_flags etf ON etf.trip_id = et.trip_id
            ) AS flagged_incidents,
            (SELECT COUNT(DISTINCT dlr.trip_id)::int
             FROM derived_late_returns dlr
            ) AS late_returns,
            0::int AS unverified_locations,
            0::int AS disconnected_locations
        `;

    const summaryParams = includeIncidents
        ? [ALLOWED_COLLEGE_NAMES, start, endExclusive, LOCATION_DISCONNECTED_TYPES]
        : [ALLOWED_COLLEGE_NAMES, start, endExclusive];

    const { rows } = await pool.query(
        `${buildReportScopeCte({ includeIncidents })}
        SELECT
            (SELECT COUNT(*)::int FROM ended_trips) AS total_movements,
            (SELECT COUNT(*)::int
             FROM ended_trips et
             WHERE NOT EXISTS (
                SELECT 1 FROM effective_trip_flags etf WHERE etf.trip_id = et.trip_id
             )
            ) AS successful_trips,
            ${incidentSummaryColumns}`,
        summaryParams
    );

    return rows[0] || {};
};

const getMonthlyLogs = async ({ start, endExclusive, page = 1, limit = 20, status = 'all' }) => {
    const includeIncidents = await getIncidentTableExists();
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const offset = (safePage - 1) * safeLimit;
    const filterStatus = String(status || 'all').toLowerCase();

    const statusFilterClause = filterStatus === 'all'
        ? ''
        : `WHERE report_status = '${filterStatus === 'verified' ? 'VERIFIED' : filterStatus === 'rejected' ? 'REJECTED' : 'FLAGGED'}'`;

    const reportRowsQuery = `
        report_rows AS (
            SELECT
                et.locator_slip_id,
                et.trip_id,
                COALESCE(etf.latest_detected_at, et.trip_finished_at, et.approved_at, et.locator_updated_at) AS timestamp,
                et.destination AS location,
                et.faculty_name AS personnel,
                CASE
                    WHEN etf.trip_id IS NOT NULL THEN 'FLAGGED'
                    ELSE 'VERIFIED'
                END AS report_status,
                CASE
                    WHEN etf.trip_id IS NOT NULL THEN 'flagged'
                    ELSE LOWER(COALESCE(et.trip_status, 'verified'))
                END AS raw_status,
                COALESCE(etf.flagged_reasons, '[]'::jsonb) AS flagged_reasons
            FROM ended_trips et
            LEFT JOIN effective_trip_flags etf ON etf.trip_id = et.trip_id
            UNION ALL
            SELECT
                rls.locator_slip_id,
                rls.trip_id,
                rls.event_timestamp AS timestamp,
                rls.destination AS location,
                rls.faculty_name AS personnel,
                'REJECTED' AS report_status,
                'rejected' AS raw_status,
                '[]'::jsonb AS flagged_reasons
            FROM rejected_locator_slips rls
        )
    `;

    const { rows: countRows } = await pool.query(
        `${buildReportScopeCte({ includeIncidents })},
        ${reportRowsQuery}
        SELECT COUNT(*)::int AS total
        FROM report_rows
        ${statusFilterClause}`,
        [ALLOWED_COLLEGE_NAMES, start, endExclusive]
    );

    const { rows } = await pool.query(
        `${buildReportScopeCte({ includeIncidents })},
        ${reportRowsQuery}
        SELECT *
        FROM report_rows
        ${statusFilterClause}
        ORDER BY timestamp DESC NULLS LAST, personnel ASC
        LIMIT $4 OFFSET $5`,
        [ALLOWED_COLLEGE_NAMES, start, endExclusive, safeLimit, offset]
    );

    return {
        rows,
        pagination: {
            page: safePage,
            limit: safeLimit,
            total: countRows[0]?.total || 0
        }
    };
};

const getMonthlyDetails = async (locatorSlipId) => {
    const includeIncidents = await getIncidentTableExists();
    const incidentsSelect = includeIncidents
        ? `
            COALESCE(
                JSONB_AGG(
                    DISTINCT JSONB_BUILD_OBJECT(
                        'type', ti.incident_type,
                        'label', ti.incident_label,
                        'severity', ti.severity,
                        'detectedAt', ti.detected_at,
                        'metadata', ti.metadata
                    )
                ) FILTER (WHERE ti.id IS NOT NULL),
                '[]'::jsonb
            ) AS incidents
        `
        : `'[]'::jsonb AS incidents`;

    const incidentJoin = includeIncidents
        ? `LEFT JOIN trip_incidents ti ON ti.locator_slip_id = ls.id OR ti.trip_id = t.id`
        : '';

    const { rows } = await pool.query(
        `WITH allowed_colleges AS (
            SELECT id, department_name
            FROM departments
            WHERE department_name = ANY($1::text[])
        )
        SELECT
            ls.id AS locator_slip_id,
            t.id AS trip_id,
            fu.full_name AS faculty_name,
            ac.department_name AS college_name,
            COALESCE(ls.custom_purpose, ls.purpose_of_travel) AS purpose,
            ls.destination,
            ls.status AS locator_status,
            t.status AS trip_status,
            ls.departure_datetime,
            ls.expected_return_datetime,
            t.started_at,
            t.ended_at,
            lv.verification_status,
            ${incidentsSelect}
        FROM locator_slips ls
        JOIN faculty_users fu ON fu.id = ls.faculty_user_id
        JOIN allowed_colleges ac ON ac.id = COALESCE(ls.college_id, fu.department_id)
        LEFT JOIN LATERAL (
            SELECT trip.id, trip.status, trip.started_at, trip.ended_at
            FROM trips trip
            WHERE trip.user_id = fu.id
            ORDER BY
                ABS(EXTRACT(EPOCH FROM (COALESCE(ls.departure_datetime, ls.created_at) - COALESCE(trip.started_at, ls.created_at)))) ASC,
                COALESCE(trip.ended_at, trip.started_at, trip.created_at) DESC
            LIMIT 1
        ) t ON TRUE
        LEFT JOIN LATERAL (
            SELECT verification.verification_status
            FROM locator_slip_location_verifications verification
            WHERE verification.locator_slip_id = ls.id
            ORDER BY verification.created_at DESC
            LIMIT 1
        ) lv ON TRUE
        ${incidentJoin}
        WHERE ls.id = $2
        GROUP BY ls.id, t.id, fu.full_name, ac.department_name, lv.verification_status`,
        [ALLOWED_COLLEGE_NAMES, locatorSlipId]
    );

    return rows[0] || null;
};

module.exports = {
    getMonthlySummary,
    getMonthlyLogs,
    getMonthlyDetails
};
