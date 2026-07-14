const pool = require('../db/pool');
const { ALLOWED_COLLEGE_NAMES } = require('./hrmuDashboard.repository');
const { encryptNullableText } = require('../utils/fieldEncryption');
const HRMU_REVIEW_FLAGGED_TYPE = 'hrmu_verification_review_flagged';
const HRMU_REVIEW_SUCCESS_TYPE = 'hrmu_verification_review_successful';

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
        [['reviewed_by', 'reviewed_at', 'remarks', 'remarks_encrypted', 'remarks_iv', 'remarks_auth_tag']]
    );

    verificationReviewColumnsCache = new Set(rows.map((row) => row.column_name));
    return verificationReviewColumnsCache;
};

const getVerificationTrips = async () => {
    const hasIncidentTable = await getIncidentTableExists();
    const verificationColumns = await getVerificationReviewColumns();
    const reviewedAtSelect = verificationColumns.has('reviewed_at')
        ? 'verification.reviewed_at AS verification_reviewed_at,'
        : 'NULL::timestamp AS verification_reviewed_at,';
    const reviewedAtProofSelect = verificationColumns.has('reviewed_at')
        ? 'proof.reviewed_at'
        : 'NULL::timestamp AS reviewed_at';
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
            fu.profile_image_url AS faculty_profile_image_url,
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
            ${reviewedAtSelect}
            review_audit.flagged_reviewed_at,
            review_audit.successful_reviewed_at,
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
                proof.created_at,
                ${reviewedAtProofSelect}
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
        LEFT JOIN LATERAL (
            SELECT
                MIN(CASE WHEN n.type = $2 THEN n.created_at END) AS flagged_reviewed_at,
                MIN(CASE WHEN n.type = $3 THEN n.created_at END) AS successful_reviewed_at
            FROM notifications n
            WHERE n.locator_slip_id = ls.id
              AND n.type = ANY($4::text[])
        ) review_audit ON TRUE
        LEFT JOIN incident_groups ON incident_groups.trip_id = trip.id
        WHERE fu.account_role = 'faculty'
          AND fu.status = 'active'
          AND trip.status = 'completed'
        ORDER BY
            COALESCE(trip.ended_at, incident_groups.latest_detected_at, verification.created_at, trip.started_at, ls.updated_at, ls.created_at) DESC,
            fu.full_name ASC`,
        [
            ALLOWED_COLLEGE_NAMES,
            HRMU_REVIEW_FLAGGED_TYPE,
            HRMU_REVIEW_SUCCESS_TYPE,
            [HRMU_REVIEW_FLAGGED_TYPE, HRMU_REVIEW_SUCCESS_TYPE]
        ]
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
            fu.profile_image_url AS faculty_profile_image_url,
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

const getCompletedTripForLocatorSlip = async (locatorSlipId) => {
    const { rows } = await pool.query(
        `SELECT
            ls.id AS locator_slip_id,
            fu.id AS faculty_user_id,
            trip.id AS trip_id,
            trip.ended_at
         FROM locator_slips ls
         JOIN faculty_users fu ON fu.id = ls.faculty_user_id
         LEFT JOIN LATERAL (
            SELECT t.id, t.status, t.started_at, t.ended_at
            FROM trips t
            WHERE t.user_id = fu.id
              AND (t.status = 'completed' OR t.ended_at IS NOT NULL)
            ORDER BY
                ABS(EXTRACT(EPOCH FROM (COALESCE(ls.departure_datetime, ls.created_at) - COALESCE(t.started_at, ls.created_at)))) ASC,
                COALESCE(t.ended_at, t.started_at, t.created_at) DESC
            LIMIT 1
         ) trip ON TRUE
         WHERE ls.id = $1
           AND trip.id IS NOT NULL
         LIMIT 1`,
        [locatorSlipId]
    );

    return rows[0] || null;
};

const updateArrivalVerificationReview = async ({ verificationId, reviewerId, status, remarks }) => {
    const columns = await getVerificationReviewColumns();
    const setClauses = ['verification_status = $2'];
    const values = [verificationId, status];
    let parameterIndex = 3;
    const hasEncryptedRemarksColumns = columns.has('remarks_encrypted')
        && columns.has('remarks_iv')
        && columns.has('remarks_auth_tag');

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

    if (hasEncryptedRemarksColumns) {
        const encrypted = encryptNullableText(remarks);
        const encryptedAssignments = [
            ['remarks', columns.has('remarks') ? null : undefined],
            ['remarks_encrypted', encrypted?.encryptedData || null],
            ['remarks_iv', encrypted?.iv || null],
            ['remarks_auth_tag', encrypted?.authTag || null]
        ].filter(([, value]) => value !== undefined);

        encryptedAssignments.forEach(([columnName, value]) => {
            setClauses.push(`${columnName} = $${parameterIndex}`);
            values.push(value);
            parameterIndex += 1;
        });
    } else if (columns.has('remarks')) {
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
    getCompletedTripForLocatorSlip,
    updateArrivalVerificationReview
};
