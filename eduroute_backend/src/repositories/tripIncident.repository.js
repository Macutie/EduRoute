const pool = require('../db/pool');
const { ALLOWED_COLLEGE_NAMES } = require('./hrmuDashboard.repository');

const INCIDENT_TYPES = {
    LATE_RETURN: 'LATE_RETURN',
    UNVERIFIED_LOCATION: 'UNVERIFIED_LOCATION',
    LIVE_LOCATION_DISCONNECTED: 'LIVE_LOCATION_DISCONNECTED'
};

const getIncidentTableExists = async () => {
    const { rows } = await pool.query(`SELECT to_regclass('public.trip_incidents') AS table_name`);
    return Boolean(rows[0]?.table_name);
};

const getTripIncidentContext = async (tripId) => {
    const { rows } = await pool.query(
        `SELECT
            t.id AS trip_id,
            t.user_id AS faculty_user_id,
            t.status AS trip_status,
            t.started_at,
            t.ended_at,
            t.updated_at AS trip_updated_at,
            t.destination_name,
            ls.id AS locator_slip_id,
            ls.destination,
            ls.expected_return_datetime,
            ls.rejected_at,
            ls.updated_at AS locator_updated_at,
            lv.id AS verification_id,
            lv.verification_status,
            lv.created_at AS verification_created_at,
            ll.recorded_at AS latest_location_at
         FROM trips t
         LEFT JOIN LATERAL (
            SELECT
                slip.id,
                slip.destination,
                slip.expected_return_datetime,
                slip.rejected_at,
                slip.updated_at
            FROM locator_slips slip
            WHERE slip.faculty_user_id = t.user_id
              AND slip.status IN ('approved', 'completed', 'rejected')
            ORDER BY
                ABS(EXTRACT(EPOCH FROM (COALESCE(slip.departure_datetime, slip.created_at) - COALESCE(t.started_at, slip.created_at)))) ASC,
                COALESCE(slip.departure_datetime, slip.created_at) DESC
            LIMIT 1
         ) ls ON TRUE
         LEFT JOIN LATERAL (
            SELECT
                verification.id,
                verification.verification_status,
                verification.created_at
            FROM locator_slip_location_verifications verification
            WHERE ls.id IS NOT NULL
              AND verification.locator_slip_id = ls.id
              AND verification.faculty_user_id = t.user_id
            ORDER BY verification.created_at DESC
            LIMIT 1
         ) lv ON TRUE
         LEFT JOIN latest_locations ll ON ll.trip_id = t.id
         WHERE t.id = $1
         LIMIT 1`,
        [tripId]
    );

    return rows[0] || null;
};

const upsertTripIncident = async ({ tripId, locatorSlipId, facultyUserId, incidentType, incidentLabel, severity, detectedAt, metadata }) => {
    const { rows } = await pool.query(
        `INSERT INTO trip_incidents (
            trip_id,
            locator_slip_id,
            faculty_user_id,
            incident_type,
            incident_label,
            severity,
            detected_at,
            metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
        ON CONFLICT (trip_id, incident_type)
        DO UPDATE SET
            locator_slip_id = EXCLUDED.locator_slip_id,
            faculty_user_id = EXCLUDED.faculty_user_id,
            incident_label = EXCLUDED.incident_label,
            severity = EXCLUDED.severity,
            detected_at = EXCLUDED.detected_at,
            metadata = EXCLUDED.metadata
        RETURNING *`,
        [
            tripId,
            locatorSlipId || null,
            facultyUserId,
            incidentType,
            incidentLabel,
            severity,
            detectedAt,
            JSON.stringify(metadata || {})
        ]
    );

    return rows[0] || null;
};

const getFlaggedTrips = async () => {
    const exists = await getIncidentTableExists();
    if (!exists) {
        return [];
    }

    const { rows } = await pool.query(
        `WITH allowed_colleges AS (
            SELECT id, department_name
            FROM departments
            WHERE department_name = ANY($1::text[])
        )
        SELECT
            ti.trip_id,
            ti.locator_slip_id,
            fu.full_name AS faculty_name,
            ac.department_name AS college_name,
            COALESCE(ls.destination, t.destination_name) AS destination,
            COALESCE(ls.custom_purpose, ls.purpose_of_travel, t.destination_name) AS purpose,
            t.status AS trip_status,
            ARRAY_AGG(DISTINCT ti.incident_type ORDER BY ti.incident_type) AS incident_types,
            ARRAY_AGG(DISTINCT ti.incident_label ORDER BY ti.incident_label) AS incident_labels,
            MAX(ti.detected_at) AS latest_detected_at,
            MAX(
                CASE ti.severity
                    WHEN 'high' THEN 3
                    WHEN 'medium' THEN 2
                    ELSE 1
                END
            ) AS severity_rank
        FROM trip_incidents ti
        JOIN trips t ON t.id = ti.trip_id
        JOIN faculty_users fu ON fu.id = ti.faculty_user_id
        JOIN allowed_colleges ac ON ac.id = fu.department_id
        LEFT JOIN locator_slips ls ON ls.id = ti.locator_slip_id
        WHERE fu.account_role = 'faculty'
          AND fu.status = 'active'
        GROUP BY ti.trip_id, ti.locator_slip_id, fu.full_name, ac.department_name, COALESCE(ls.destination, t.destination_name), COALESCE(ls.custom_purpose, ls.purpose_of_travel, t.destination_name), t.status
        ORDER BY MAX(ti.detected_at) DESC, fu.full_name ASC`,
        [ALLOWED_COLLEGE_NAMES]
    );

    return rows;
};

const getVerificationSummary = async () => {
    const exists = await getIncidentTableExists();
    if (!exists) {
        return {
            flagged_trips: 0,
            late_returns: 0,
            unverified_locations: 0,
            disconnected_locations: 0
        };
    }

    const { rows } = await pool.query(
        `SELECT
            COUNT(DISTINCT trip_id)::int AS flagged_trips,
            COUNT(DISTINCT CASE WHEN incident_type = 'LATE_RETURN' THEN trip_id END)::int AS late_returns,
            COUNT(DISTINCT CASE WHEN incident_type = 'UNVERIFIED_LOCATION' THEN trip_id END)::int AS unverified_locations,
            COUNT(DISTINCT CASE WHEN incident_type = 'LIVE_LOCATION_DISCONNECTED' THEN trip_id END)::int AS disconnected_locations
         FROM trip_incidents`
    );

    return rows[0] || {
        flagged_trips: 0,
        late_returns: 0,
        unverified_locations: 0,
        disconnected_locations: 0
    };
};

const getActiveTripIdsForIncidentScan = async () => {
    const { rows } = await pool.query(
        `SELECT t.id
         FROM trips t
         JOIN faculty_users fu ON fu.id = t.user_id
         JOIN departments d ON d.id = fu.department_id
         WHERE t.status = 'active'
           AND fu.account_role = 'faculty'
           AND fu.status = 'active'
           AND d.department_name = ANY($1::text[])`,
        [ALLOWED_COLLEGE_NAMES]
    );

    return rows.map((row) => row.id);
};

module.exports = {
    INCIDENT_TYPES,
    getIncidentTableExists,
    getTripIncidentContext,
    upsertTripIncident,
    getFlaggedTrips,
    getVerificationSummary,
    getActiveTripIdsForIncidentScan
};
