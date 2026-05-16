const pool = require('../db/pool');
const { ALLOWED_COLLEGE_NAMES } = require('./hrmuDashboard.repository');

const INCIDENT_TYPES = {
    LATE_RETURN: 'LATE_RETURN',
    UNVERIFIED_LOCATION: 'UNVERIFIED_LOCATION',
    LOCATION_DISCONNECTED: 'LOCATION_DISCONNECTED'
};

const LOCATION_DISCONNECTED_TYPES = ['LOCATION_DISCONNECTED', 'LIVE_LOCATION_DISCONNECTED'];

let arrivalVerificationsTableExistsCache = null;
let tripsLocatorSlipIdColumnExistsCache = null;
let tripLocationLogsTableExistsCache = null;

const getArrivalVerificationsTableExists = async () => {
    if (arrivalVerificationsTableExistsCache !== null) {
        return arrivalVerificationsTableExistsCache;
    }

    const { rows } = await pool.query(`SELECT to_regclass('public.arrival_verifications') AS table_name`);
    arrivalVerificationsTableExistsCache = Boolean(rows[0]?.table_name);
    return arrivalVerificationsTableExistsCache;
};

const getTripsLocatorSlipIdColumnExists = async () => {
    if (tripsLocatorSlipIdColumnExistsCache !== null) {
        return tripsLocatorSlipIdColumnExistsCache;
    }

    const { rows } = await pool.query(
        `SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'trips'
              AND column_name = 'locator_slip_id'
        ) AS exists`
    );

    tripsLocatorSlipIdColumnExistsCache = Boolean(rows[0]?.exists);
    return tripsLocatorSlipIdColumnExistsCache;
};

const getTripLocationLogsTableExists = async () => {
    if (tripLocationLogsTableExistsCache !== null) {
        return tripLocationLogsTableExistsCache;
    }

    const { rows } = await pool.query(`SELECT to_regclass('public.trip_location_logs') AS table_name`);
    tripLocationLogsTableExistsCache = Boolean(rows[0]?.table_name);
    return tripLocationLogsTableExistsCache;
};

const getIncidentTableExists = async () => {
    const { rows } = await pool.query(`SELECT to_regclass('public.trip_incidents') AS table_name`);
    return Boolean(rows[0]?.table_name);
};

const getTripIncidentContext = async (tripId) => {
    const hasArrivalVerificationsTable = await getArrivalVerificationsTableExists();
    const hasTripsLocatorSlipIdColumn = await getTripsLocatorSlipIdColumnExists();
    const hasTripLocationLogsTable = await getTripLocationLogsTableExists();
    const locatorSlipJoin = hasTripsLocatorSlipIdColumn
        ? 'LEFT JOIN locator_slips ls ON ls.id = t.locator_slip_id'
        : `LEFT JOIN LATERAL (
            SELECT NULL::uuid AS id,
                   NULL::text AS destination,
                   NULL::timestamp AS expected_return_datetime,
                   NULL::timestamp AS rejected_at,
                   NULL::timestamp AS updated_at
          ) ls ON TRUE`;
    const arrivalVerificationJoin = hasArrivalVerificationsTable
        ? `LEFT JOIN LATERAL (
            SELECT
                verification.id,
                verification.status,
                verification.created_at
            FROM arrival_verifications verification
            WHERE verification.trip_id = t.id
            ORDER BY verification.created_at DESC
            LIMIT 1
         ) av ON TRUE`
        : `LEFT JOIN LATERAL (
            SELECT NULL::uuid AS id,
                   NULL::text AS status,
                   NULL::timestamp AS created_at
          ) av ON TRUE`;
    const tripLocationMovementJoin = hasTripLocationLogsTable
        ? `LEFT JOIN LATERAL (
            SELECT
                MIN(log.recorded_at) AS first_location_at,
                MAX(log.recorded_at) AS last_location_log_at,
                COUNT(*)::int AS location_point_count,
                MIN(log.lat)::float8 AS min_lat,
                MAX(log.lat)::float8 AS max_lat,
                MIN(log.lng)::float8 AS min_lng,
                MAX(log.lng)::float8 AS max_lng
            FROM trip_location_logs log
            WHERE log.trip_id = t.id
              AND log.recorded_at >= COALESCE(t.started_at, t.created_at)
         ) movement ON TRUE`
        : `LEFT JOIN LATERAL (
            SELECT NULL::timestamp AS first_location_at,
                   NULL::timestamp AS last_location_log_at,
                   0::int AS location_point_count,
                   NULL::float8 AS min_lat,
                   NULL::float8 AS max_lat,
                   NULL::float8 AS min_lng,
                   NULL::float8 AS max_lng
         ) movement ON TRUE`;

    const { rows } = await pool.query(
        `SELECT
            t.id AS trip_id,
            t.user_id AS faculty_user_id,
            fu.full_name AS faculty_name,
            t.status AS trip_status,
            t.started_at,
            t.ended_at,
            t.updated_at AS trip_updated_at,
            t.destination_name,
            COALESCE(ls.id, fallback_ls.id) AS locator_slip_id,
            COALESCE(ls.destination, fallback_ls.destination) AS destination,
            COALESCE(ls.expected_return_datetime, fallback_ls.expected_return_datetime) AS expected_return_datetime,
            COALESCE(ls.rejected_at, fallback_ls.rejected_at) AS rejected_at,
            COALESCE(ls.updated_at, fallback_ls.updated_at) AS locator_updated_at,
            COALESCE(av.id, lv.id) AS verification_id,
            COALESCE(av.status, lv.verification_status) AS verification_status,
            COALESCE(av.created_at, lv.created_at) AS verification_created_at,
            ll.recorded_at AS latest_location_at,
            movement.first_location_at,
            movement.last_location_log_at,
            movement.location_point_count,
            movement.min_lat,
            movement.max_lat,
            movement.min_lng,
            movement.max_lng
         FROM trips t
         JOIN faculty_users fu ON fu.id = t.user_id
         ${locatorSlipJoin}
         LEFT JOIN LATERAL (
            SELECT
                slip.id,
                slip.destination,
                slip.expected_return_datetime,
                slip.rejected_at,
                slip.updated_at
            FROM locator_slips slip
            WHERE ls.id IS NULL
              AND slip.faculty_user_id = t.user_id
              AND slip.status IN ('approved', 'verified', 'completed', 'rejected')
            ORDER BY
                ABS(EXTRACT(EPOCH FROM (COALESCE(slip.departure_datetime, slip.created_at) - COALESCE(t.started_at, slip.created_at)))) ASC,
                COALESCE(slip.departure_datetime, slip.created_at) DESC
            LIMIT 1
         ) fallback_ls ON ls.id IS NULL
         ${arrivalVerificationJoin}
         LEFT JOIN LATERAL (
            SELECT
                verification.id,
                verification.verification_status,
                verification.created_at
            FROM locator_slip_location_verifications verification
            WHERE COALESCE(ls.id, fallback_ls.id) IS NOT NULL
              AND verification.locator_slip_id = COALESCE(ls.id, fallback_ls.id)
              AND verification.faculty_user_id = t.user_id
            ORDER BY verification.created_at DESC
            LIMIT 1
         ) lv ON TRUE
         LEFT JOIN latest_locations ll ON ll.trip_id = t.id
         ${tripLocationMovementJoin}
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

const getTripIncidentByType = async (tripId, incidentType) => {
    const { rows } = await pool.query(
        `SELECT *
         FROM trip_incidents
         WHERE trip_id = $1
           AND incident_type = $2
         LIMIT 1`,
        [tripId, incidentType]
    );

    return rows[0] || null;
};

const getFlaggedTrips = async () => {
    const exists = await getIncidentTableExists();
    const hasTripsLocatorSlipIdColumn = await getTripsLocatorSlipIdColumnExists();
    const { rows } = await pool.query(
        `WITH allowed_colleges AS (
            SELECT id, department_name
            FROM departments
            WHERE department_name = ANY($1::text[])
        ),
        derived_late_returns AS (
            SELECT
                t.id AS trip_id,
                COALESCE(ls.id, fallback_ls.id) AS locator_slip_id,
                t.user_id AS faculty_user_id,
                COALESCE(t.ended_at, t.updated_at) AS detected_at,
                'LATE_RETURN'::text AS incident_type,
                'Late Return'::text AS incident_label,
                'high'::text AS severity
            FROM trips t
            JOIN faculty_users fu ON fu.id = t.user_id
            JOIN allowed_colleges ac ON ac.id = fu.department_id
            LEFT JOIN locator_slips ls ON ${hasTripsLocatorSlipIdColumn ? "ls.id = t.locator_slip_id" : "FALSE"}
            LEFT JOIN LATERAL (
                SELECT
                    slip.id,
                    slip.expected_return_datetime
                FROM locator_slips slip
                WHERE ls.id IS NULL
                  AND slip.faculty_user_id = t.user_id
                  AND slip.status IN ('approved', 'verified', 'completed', 'rejected')
                ORDER BY
                    ABS(EXTRACT(EPOCH FROM (COALESCE(slip.departure_datetime, slip.created_at) - COALESCE(t.started_at, slip.created_at)))) ASC,
                    COALESCE(slip.departure_datetime, slip.created_at) DESC
                LIMIT 1
            ) fallback_ls ON ls.id IS NULL
            WHERE fu.account_role = 'faculty'
              AND fu.status = 'active'
              AND COALESCE(ls.expected_return_datetime, fallback_ls.expected_return_datetime) IS NOT NULL
              AND COALESCE(t.ended_at, t.updated_at) > (
                    COALESCE(ls.expected_return_datetime, fallback_ls.expected_return_datetime) + INTERVAL '60 minutes'
              )
        ),
        derived_unverified_locations AS (
            SELECT
                t.id AS trip_id,
                COALESCE(ls.id, fallback_ls.id) AS locator_slip_id,
                t.user_id AS faculty_user_id,
                COALESCE(lv.created_at, t.ended_at, t.updated_at) AS detected_at,
                'UNVERIFIED_LOCATION'::text AS incident_type,
                'Unverified Location/Signature'::text AS incident_label,
                'high'::text AS severity
            FROM trips t
            JOIN faculty_users fu ON fu.id = t.user_id
            JOIN allowed_colleges ac ON ac.id = fu.department_id
            LEFT JOIN locator_slips ls ON ${hasTripsLocatorSlipIdColumn ? "ls.id = t.locator_slip_id" : "FALSE"}
            LEFT JOIN LATERAL (
                SELECT
                    slip.id
                FROM locator_slips slip
                WHERE ls.id IS NULL
                  AND slip.faculty_user_id = t.user_id
                  AND slip.status IN ('approved', 'verified', 'completed', 'rejected')
                ORDER BY
                    ABS(EXTRACT(EPOCH FROM (COALESCE(slip.departure_datetime, slip.created_at) - COALESCE(t.started_at, slip.created_at)))) ASC,
                    COALESCE(slip.departure_datetime, slip.created_at) DESC
                LIMIT 1
            ) fallback_ls ON ls.id IS NULL
            JOIN LATERAL (
                SELECT
                    verification.verification_status,
                    verification.created_at
                FROM locator_slip_location_verifications verification
                WHERE verification.locator_slip_id = COALESCE(ls.id, fallback_ls.id)
                  AND verification.faculty_user_id = t.user_id
                ORDER BY verification.created_at DESC
                LIMIT 1
            ) lv ON TRUE
            WHERE fu.account_role = 'faculty'
              AND fu.status = 'active'
              AND LOWER(COALESCE(lv.verification_status, '')) = 'rejected'
        ),
        effective_incidents AS (
            ${exists ? `
            SELECT
                ti.trip_id,
                ti.locator_slip_id,
                ti.faculty_user_id,
                ti.incident_type,
                ti.incident_label,
                ti.severity,
                ti.detected_at
            FROM trip_incidents ti
            UNION
            ` : ''}
            SELECT
                dlr.trip_id,
                dlr.locator_slip_id,
                dlr.faculty_user_id,
                dlr.incident_type,
                dlr.incident_label,
                dlr.severity,
                dlr.detected_at
            FROM derived_late_returns dlr
            UNION
            SELECT
                dul.trip_id,
                dul.locator_slip_id,
                dul.faculty_user_id,
                dul.incident_type,
                dul.incident_label,
                dul.severity,
                dul.detected_at
            FROM derived_unverified_locations dul
        )
        SELECT
            ei.trip_id,
            ei.locator_slip_id,
            fu.full_name AS faculty_name,
            ac.department_name AS college_name,
            COALESCE(ls.destination, t.destination_name) AS destination,
            COALESCE(ls.custom_purpose, ls.purpose_of_travel, t.destination_name) AS purpose,
            t.status AS trip_status,
            COALESCE(ls.expected_return_datetime, fallback_ls.expected_return_datetime) AS expected_return_datetime,
            COALESCE(t.ended_at, t.updated_at) AS actual_return_time,
            ARRAY_AGG(DISTINCT ei.incident_type ORDER BY ei.incident_type) AS incident_types,
            ARRAY_AGG(DISTINCT ei.incident_label ORDER BY ei.incident_label) AS incident_labels,
            MAX(ei.detected_at) AS latest_detected_at,
            MAX(
                CASE ei.severity
                    WHEN 'high' THEN 3
                    WHEN 'medium' THEN 2
                    ELSE 1
                END
            ) AS severity_rank
        FROM effective_incidents ei
        JOIN trips t ON t.id = ei.trip_id
        JOIN faculty_users fu ON fu.id = ei.faculty_user_id
        JOIN allowed_colleges ac ON ac.id = fu.department_id
        LEFT JOIN locator_slips ls ON ls.id = ei.locator_slip_id
        LEFT JOIN LATERAL (
            SELECT
                slip.id,
                slip.expected_return_datetime
            FROM locator_slips slip
            WHERE ls.id IS NULL
              AND slip.faculty_user_id = t.user_id
              AND slip.status IN ('approved', 'verified', 'completed', 'rejected')
            ORDER BY
                ABS(EXTRACT(EPOCH FROM (COALESCE(slip.departure_datetime, slip.created_at) - COALESCE(t.started_at, slip.created_at)))) ASC,
                COALESCE(slip.departure_datetime, slip.created_at) DESC
            LIMIT 1
        ) fallback_ls ON ls.id IS NULL
        WHERE fu.account_role = 'faculty'
          AND fu.status = 'active'
        GROUP BY ei.trip_id, ei.locator_slip_id, fu.full_name, ac.department_name, COALESCE(ls.destination, t.destination_name), COALESCE(ls.custom_purpose, ls.purpose_of_travel, t.destination_name), t.status, COALESCE(ls.expected_return_datetime, fallback_ls.expected_return_datetime), COALESCE(t.ended_at, t.updated_at)
        ORDER BY MAX(ei.detected_at) DESC, fu.full_name ASC`,
        [ALLOWED_COLLEGE_NAMES]
    );

    return rows;
};

const getVerificationSummary = async () => {
    const exists = await getIncidentTableExists();
    const hasTripsLocatorSlipIdColumn = await getTripsLocatorSlipIdColumnExists();

    const { rows } = await pool.query(
        `WITH allowed_colleges AS (
            SELECT id
            FROM departments
            WHERE department_name = ANY($1::text[])
        ),
        derived_late_returns AS (
            SELECT DISTINCT
                t.id AS trip_id,
                'LATE_RETURN'::text AS incident_type
            FROM trips t
            JOIN faculty_users fu ON fu.id = t.user_id
            JOIN allowed_colleges ac ON ac.id = fu.department_id
            LEFT JOIN locator_slips ls ON ${hasTripsLocatorSlipIdColumn ? "ls.id = t.locator_slip_id" : "FALSE"}
            LEFT JOIN LATERAL (
                SELECT
                    slip.id,
                    slip.expected_return_datetime
                FROM locator_slips slip
                WHERE ls.id IS NULL
                  AND slip.faculty_user_id = t.user_id
                  AND slip.status IN ('approved', 'verified', 'completed', 'rejected')
                ORDER BY
                    ABS(EXTRACT(EPOCH FROM (COALESCE(slip.departure_datetime, slip.created_at) - COALESCE(t.started_at, slip.created_at)))) ASC,
                    COALESCE(slip.departure_datetime, slip.created_at) DESC
                LIMIT 1
            ) fallback_ls ON ls.id IS NULL
            WHERE fu.account_role = 'faculty'
              AND fu.status = 'active'
              AND COALESCE(ls.expected_return_datetime, fallback_ls.expected_return_datetime) IS NOT NULL
              AND COALESCE(t.ended_at, t.updated_at) > (
                    COALESCE(ls.expected_return_datetime, fallback_ls.expected_return_datetime) + INTERVAL '60 minutes'
              )
        ),
        derived_unverified_locations AS (
            SELECT DISTINCT
                t.id AS trip_id,
                'UNVERIFIED_LOCATION'::text AS incident_type
            FROM trips t
            JOIN faculty_users fu ON fu.id = t.user_id
            JOIN allowed_colleges ac ON ac.id = fu.department_id
            LEFT JOIN locator_slips ls ON ${hasTripsLocatorSlipIdColumn ? "ls.id = t.locator_slip_id" : "FALSE"}
            LEFT JOIN LATERAL (
                SELECT
                    slip.id
                FROM locator_slips slip
                WHERE ls.id IS NULL
                  AND slip.faculty_user_id = t.user_id
                  AND slip.status IN ('approved', 'verified', 'completed', 'rejected')
                ORDER BY
                    ABS(EXTRACT(EPOCH FROM (COALESCE(slip.departure_datetime, slip.created_at) - COALESCE(t.started_at, slip.created_at)))) ASC,
                    COALESCE(slip.departure_datetime, slip.created_at) DESC
                LIMIT 1
            ) fallback_ls ON ls.id IS NULL
            JOIN LATERAL (
                SELECT
                    verification.verification_status
                FROM locator_slip_location_verifications verification
                WHERE verification.locator_slip_id = COALESCE(ls.id, fallback_ls.id)
                  AND verification.faculty_user_id = t.user_id
                ORDER BY verification.created_at DESC
                LIMIT 1
            ) lv ON TRUE
            WHERE fu.account_role = 'faculty'
              AND fu.status = 'active'
              AND LOWER(COALESCE(lv.verification_status, '')) = 'rejected'
        ),
        effective_incidents AS (
            ${exists ? `
            SELECT ti.trip_id, ti.incident_type
            FROM trip_incidents ti
            UNION
            ` : ''}
            SELECT dlr.trip_id, dlr.incident_type
            FROM derived_late_returns dlr
            UNION
            SELECT dul.trip_id, dul.incident_type
            FROM derived_unverified_locations dul
        )
        SELECT
            COUNT(DISTINCT trip_id)::int AS flagged_trips,
            COUNT(DISTINCT CASE WHEN incident_type = 'LATE_RETURN' THEN trip_id END)::int AS late_returns,
            COUNT(DISTINCT CASE WHEN incident_type = 'UNVERIFIED_LOCATION' THEN trip_id END)::int AS unverified_locations,
            COUNT(DISTINCT CASE WHEN incident_type = ANY($2::text[]) THEN trip_id END)::int AS disconnected_locations
        FROM effective_incidents`,
        [ALLOWED_COLLEGE_NAMES, LOCATION_DISCONNECTED_TYPES]
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
         WHERE t.status IN ('active', 'arrived', 'returning')
           AND fu.account_role = 'faculty'
           AND fu.status = 'active'
           AND d.department_name = ANY($1::text[])`,
        [ALLOWED_COLLEGE_NAMES]
    );

    return rows.map((row) => row.id);
};

const getEndedTripIdsForIncidentScan = async () => {
    const { rows } = await pool.query(
        `SELECT t.id
         FROM trips t
         JOIN faculty_users fu ON fu.id = t.user_id
         JOIN departments d ON d.id = fu.department_id
         WHERE (t.ended_at IS NOT NULL OR t.status = 'completed')
           AND fu.account_role = 'faculty'
           AND fu.status = 'active'
           AND d.department_name = ANY($1::text[])`,
        [ALLOWED_COLLEGE_NAMES]
    );

    return rows.map((row) => row.id);
};

module.exports = {
    INCIDENT_TYPES,
    LOCATION_DISCONNECTED_TYPES,
    getIncidentTableExists,
    getTripIncidentContext,
    getTripIncidentByType,
    upsertTripIncident,
    getFlaggedTrips,
    getVerificationSummary,
    getActiveTripIdsForIncidentScan,
    getEndedTripIdsForIncidentScan
};
