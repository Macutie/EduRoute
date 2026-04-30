const pool = require('../db/pool');
const { ALLOWED_COLLEGE_NAMES } = require('./hrmuDashboard.repository');

let verificationReviewColumnsCache = null;
let incidentTableExistsCache = null;

const getIncidentTableExists = async () => {
    if (incidentTableExistsCache !== null) {
        return incidentTableExistsCache;
    }

    const { rows } = await pool.query(`SELECT to_regclass('public.trip_incidents') AS table_name`);
    incidentTableExistsCache = Boolean(rows[0]?.table_name);
    return incidentTableExistsCache;
};

const getVerificationReviewColumns = async () => {
    if (verificationReviewColumnsCache) {
        return verificationReviewColumnsCache;
    }

    const { rows } = await pool.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'locator_slip_location_verifications'
           AND column_name = ANY($1::text[])`,
        [['reviewed_by', 'reviewed_at', 'remarks']]
    );

    verificationReviewColumnsCache = new Set(rows.map((row) => row.column_name));
    return verificationReviewColumnsCache;
};

const getVerificationTrips = async () => {
    const hasIncidentTable = await getIncidentTableExists();
    const incidentGroupsCte = hasIncidentTable
        ? `incident_groups AS (
            SELECT
                ti.trip_id,
                ARRAY_AGG(DISTINCT ti.incident_type ORDER BY ti.incident_type) AS incident_types,
                ARRAY_AGG(DISTINCT ti.incident_label ORDER BY ti.incident_label) AS incident_labels,
                MAX(ti.detected_at) AS latest_detected_at
            FROM trip_incidents ti
            GROUP BY ti.trip_id
        )`
        : `incident_groups AS (
            SELECT
                NULL::uuid AS trip_id,
                ARRAY[]::text[] AS incident_types,
                ARRAY[]::text[] AS incident_labels,
                NULL::timestamp AS latest_detected_at
            WHERE FALSE
        )`;

    const { rows } = await pool.query(
        `WITH allowed_colleges AS (
            SELECT id, department_name
            FROM departments
            WHERE department_name = ANY($1::text[])
        ),
        ${incidentGroupsCte}
        SELECT
            ls.id AS locator_slip_id,
            trip.id AS trip_id,
            fu.id AS faculty_user_id,
            fu.full_name AS faculty_name,
            ac.department_name AS college_name,
            COALESCE(ls.custom_purpose, ls.purpose_of_travel) AS purpose,
            ls.destination,
            ls.status AS locator_slip_status,
            trip.status AS trip_status,
            trip.started_at,
            trip.ended_at,
            ls.expected_return_datetime,
            verification.id AS verification_id,
            verification.verification_status AS arrival_verification_status,
            verification.image_url AS verification_image_url,
            verification.created_at AS verification_created_at,
            latest_location.recorded_at AS latest_location_at,
            COALESCE(incident_groups.incident_types, ARRAY[]::text[]) AS incident_types,
            COALESCE(incident_groups.incident_labels, ARRAY[]::text[]) AS incident_labels,
            incident_groups.latest_detected_at
        FROM locator_slips ls
        JOIN faculty_users fu ON fu.id = ls.faculty_user_id
        JOIN allowed_colleges ac ON ac.id = COALESCE(ls.college_id, fu.department_id)
        LEFT JOIN LATERAL (
            SELECT t.id, t.status, t.started_at, t.ended_at
            FROM trips t
            WHERE t.user_id = fu.id
            ORDER BY
                ABS(EXTRACT(EPOCH FROM (COALESCE(ls.departure_datetime, ls.created_at) - COALESCE(t.started_at, ls.created_at)))) ASC,
                COALESCE(t.ended_at, t.started_at, t.created_at) DESC
            LIMIT 1
        ) trip ON TRUE
        LEFT JOIN LATERAL (
            SELECT
                proof.id,
                proof.verification_status,
                proof.image_url,
                proof.created_at
            FROM locator_slip_location_verifications proof
            WHERE proof.locator_slip_id = ls.id
            ORDER BY proof.created_at DESC
            LIMIT 1
        ) verification ON TRUE
        LEFT JOIN LATERAL (
            SELECT ll.recorded_at
            FROM latest_locations ll
            WHERE ll.trip_id = trip.id
            LIMIT 1
        ) latest_location ON TRUE
        LEFT JOIN incident_groups ON incident_groups.trip_id = trip.id
        WHERE fu.account_role = 'faculty'
          AND fu.status = 'active'
          AND (
            verification.verification_status IN ('submitted', 'rejected', 'unverified')
            OR COALESCE(array_length(incident_groups.incident_types, 1), 0) > 0
            OR trip.status IN ('active', 'arrived', 'returning')
          )
        ORDER BY
            COALESCE(incident_groups.latest_detected_at, verification.created_at, trip.started_at, ls.updated_at, ls.created_at) DESC,
            fu.full_name ASC`,
        [ALLOWED_COLLEGE_NAMES]
    );

    return rows;
};

const getVerificationReviewRow = async (verificationId) => {
    const { rows } = await pool.query(
        `SELECT
            verification.*,
            ls.id AS locator_slip_id,
            ls.status AS locator_slip_status,
            ls.destination,
            ls.expected_return_datetime,
            fu.id AS faculty_user_id,
            fu.full_name AS faculty_name,
            trip.id AS trip_id,
            trip.status AS trip_status,
            trip.started_at,
            trip.ended_at
         FROM locator_slip_location_verifications verification
         JOIN locator_slips ls ON ls.id = verification.locator_slip_id
         JOIN faculty_users fu ON fu.id = verification.faculty_user_id
         LEFT JOIN LATERAL (
            SELECT t.id, t.status, t.started_at, t.ended_at
            FROM trips t
            WHERE t.user_id = fu.id
            ORDER BY
                ABS(EXTRACT(EPOCH FROM (COALESCE(ls.departure_datetime, ls.created_at) - COALESCE(t.started_at, ls.created_at)))) ASC,
                COALESCE(t.ended_at, t.started_at, t.created_at) DESC
            LIMIT 1
         ) trip ON TRUE
         WHERE verification.id = $1
         LIMIT 1`,
        [verificationId]
    );

    return rows[0] || null;
};

const updateArrivalVerificationReview = async ({ verificationId, reviewerId, status, remarks }) => {
    const columns = await getVerificationReviewColumns();
    const setClauses = ['verification_status = $2'];
    const values = [verificationId, status];
    let parameterIndex = 3;

    if (columns.has('reviewed_by')) {
        setClauses.push(`reviewed_by = $${parameterIndex}`);
        values.push(reviewerId);
        parameterIndex += 1;
    }

    if (columns.has('reviewed_at')) {
        setClauses.push(`reviewed_at = $${parameterIndex}`);
        values.push(new Date());
        parameterIndex += 1;
    }

    if (columns.has('remarks')) {
        setClauses.push(`remarks = $${parameterIndex}`);
        values.push(remarks || null);
        parameterIndex += 1;
    }

    const { rows } = await pool.query(
        `UPDATE locator_slip_location_verifications
         SET ${setClauses.join(', ')}
         WHERE id = $1
         RETURNING *`,
        values
    );

    return rows[0] || null;
};

module.exports = {
    getVerificationTrips,
    getVerificationReviewRow,
    updateArrivalVerificationReview
};
