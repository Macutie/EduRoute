const pool = require('../db/pool');

let arrivalVerificationColumnsCache = null;
let arrivalVerificationsTableExistsCache = null;
let tripIncidentsTableExistsCache = null;

const getArrivalVerificationsTableExists = async (client = pool) => {
    if (arrivalVerificationsTableExistsCache !== null) {
        return arrivalVerificationsTableExistsCache;
    }

    const { rows } = await client.query(`SELECT to_regclass('public.arrival_verifications') AS table_name`);
    arrivalVerificationsTableExistsCache = Boolean(rows[0]?.table_name);
    return arrivalVerificationsTableExistsCache;
};

const getArrivalVerificationColumns = async (client = pool) => {
    const tableExists = await getArrivalVerificationsTableExists(client);
    if (!tableExists) {
        arrivalVerificationColumnsCache = new Set();
        return arrivalVerificationColumnsCache;
    }

    if (arrivalVerificationColumnsCache) {
        return arrivalVerificationColumnsCache;
    }

    const { rows } = await client.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'arrival_verifications'`
    );

    arrivalVerificationColumnsCache = new Set(rows.map((row) => row.column_name));
    return arrivalVerificationColumnsCache;
};

const getTripIncidentsTableExists = async (client = pool) => {
    if (tripIncidentsTableExistsCache !== null) {
        return tripIncidentsTableExistsCache;
    }

    const { rows } = await client.query(`SELECT to_regclass('public.trip_incidents') AS table_name`);
    tripIncidentsTableExistsCache = Boolean(rows[0]?.table_name);
    return tripIncidentsTableExistsCache;
};

const hasArrivalVerificationColumn = async (columnName, client = pool) => {
    const columns = await getArrivalVerificationColumns(client);
    return columns.has(columnName);
};

const buildProofSelect = async (client = pool, { alias = 'verification' } = {}) => {
    const columns = await getArrivalVerificationColumns(client);
    const selectColumn = (columnName, fallbackSql) => (
        columns.has(columnName)
            ? `${alias}.${columnName}`
            : `${fallbackSql} AS ${columnName}`
    );

    return `
        ${alias}.id,
        ${alias}.trip_id,
        ${alias}.locator_slip_id,
        ${alias}.faculty_user_id,
        ${selectColumn('image_url', 'NULL::text')},
        ${selectColumn('image_public_id', 'NULL::text')},
        ${selectColumn('status', `'submitted'::text`)},
        ${selectColumn('verified_at', 'NULL::timestamp')},
        ${selectColumn('focal_person_name', 'NULL::text')},
        ${selectColumn('focal_person_position', 'NULL::text')},
        ${selectColumn('focal_person_signature_url', 'NULL::text')},
        ${selectColumn('focal_person_signature_public_id', 'NULL::text')},
        ${selectColumn('arrival_photo_url', 'NULL::text')},
        ${selectColumn('arrival_photo_public_id', 'NULL::text')},
        ${selectColumn('proof_compliance_image_url', 'NULL::text')},
        ${selectColumn('proof_compliance_image_public_id', 'NULL::text')},
        ${selectColumn('verification_status', `COALESCE(${alias}.status, 'submitted')::text`)},
        ${selectColumn('submitted_at', `COALESCE(${alias}.verified_at, ${alias}.created_at)`)},
        ${selectColumn('reviewed_by', 'NULL::uuid')},
        ${selectColumn('reviewed_at', 'NULL::timestamp')},
        ${selectColumn('review_remarks', 'NULL::text')},
        ${alias}.created_at,
        ${alias}.updated_at
    `;
};

const mapProofRow = (row) => {
    if (!row) return null;

    return {
        id: row.id,
        tripId: row.trip_id,
        locatorSlipId: row.locator_slip_id,
        facultyUserId: row.faculty_user_id,
        imageUrl: row.image_url || row.proof_compliance_image_url || null,
        imagePublicId: row.image_public_id || row.proof_compliance_image_public_id || null,
        focalPersonName: row.focal_person_name || null,
        focalPersonPosition: row.focal_person_position || null,
        focalPersonSignatureUrl: row.focal_person_signature_url || null,
        focalPersonSignaturePublicId: row.focal_person_signature_public_id || null,
        arrivalPhotoUrl: row.arrival_photo_url || null,
        arrivalPhotoPublicId: row.arrival_photo_public_id || null,
        proofComplianceImageUrl: row.proof_compliance_image_url || row.image_url || null,
        proofComplianceImagePublicId: row.proof_compliance_image_public_id || row.image_public_id || null,
        verificationStatus: row.verification_status || row.status || 'submitted',
        submittedAt: row.submitted_at || row.verified_at || row.created_at || null,
        reviewedBy: row.reviewed_by || null,
        reviewedAt: row.reviewed_at || null,
        reviewRemarks: row.review_remarks || null,
        deanApprovedAt: row.dean_approved_at || null,
        deanReviewedBy: row.dean_reviewed_by || null,
        deanName: row.dean_name || null,
        deanRole: row.dean_role || null,
        deanSignatureUrl: row.dean_signature_url || null,
        deanSignatureMimeType: row.dean_signature_mime_type || null,
        deanSignatureOriginalFilename: row.dean_signature_original_filename || null,
        deanSignatureAttachedAt: row.dean_signature_attached_at || null,
        flaggedReasons: Array.isArray(row.incident_labels) ? row.incident_labels : [],
        flaggedIncidentTypes: Array.isArray(row.incident_types) ? row.incident_types : [],
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null
    };
};

const getProofByTripForFaculty = async (tripId, facultyUserId, client = pool) => {
    const tableExists = await getArrivalVerificationsTableExists(client);
    if (!tableExists) {
        return null;
    }

    const proofSelect = await buildProofSelect(client);
    const hasSubmittedAtColumn = await hasArrivalVerificationColumn('submitted_at', client);
    const orderByExpression = hasSubmittedAtColumn
        ? 'COALESCE(verification.submitted_at, verification.verified_at, verification.created_at)'
        : 'COALESCE(verification.verified_at, verification.created_at)';
    const { rows } = await client.query(
        `SELECT ${proofSelect}
         FROM arrival_verifications verification
         WHERE verification.trip_id = $1
           AND verification.faculty_user_id = $2
         ORDER BY ${orderByExpression} DESC, verification.created_at DESC
         LIMIT 1`,
        [tripId, facultyUserId]
    );

    return mapProofRow(rows[0]);
};

const insertProof = async (payload, client = pool) => {
    const tableExists = await getArrivalVerificationsTableExists(client);
    if (!tableExists) {
        throw new Error('arrival_verifications table does not exist.');
    }

    const columns = await getArrivalVerificationColumns(client);
    const supportedColumns = [
        ['trip_id', payload.tripId],
        ['locator_slip_id', payload.locatorSlipId],
        ['faculty_user_id', payload.facultyUserId],
        ['image_url', payload.imageUrl],
        ['image_public_id', payload.imagePublicId],
        ['status', payload.legacyStatus || payload.verificationStatus],
        ['verified_at', payload.submittedAt],
        ['focal_person_name', payload.focalPersonName],
        ['focal_person_position', payload.focalPersonPosition],
        ['focal_person_signature_url', payload.focalPersonSignatureUrl],
        ['focal_person_signature_public_id', payload.focalPersonSignaturePublicId],
        ['arrival_photo_url', payload.arrivalPhotoUrl],
        ['arrival_photo_public_id', payload.arrivalPhotoPublicId],
        ['proof_compliance_image_url', payload.proofComplianceImageUrl],
        ['proof_compliance_image_public_id', payload.proofComplianceImagePublicId],
        ['verification_status', payload.verificationStatus],
        ['submitted_at', payload.submittedAt]
    ].filter(([columnName]) => columns.has(columnName));

    const columnNames = supportedColumns.map(([columnName]) => columnName);
    const values = supportedColumns.map(([, value]) => value);
    const placeholders = values.map((_, index) => `$${index + 1}`);

    const { rows } = await client.query(
        `INSERT INTO arrival_verifications (${columnNames.join(', ')})
         VALUES (${placeholders.join(', ')})
         RETURNING *`,
        values
    );

    return mapProofRow(rows[0]);
};

const getHrmuProofList = async (client = pool) => {
    const tableExists = await getArrivalVerificationsTableExists(client);
    if (!tableExists) {
        return [];
    }

    const hasTripIncidentsTable = await getTripIncidentsTableExists(client);
    const proofSelect = await buildProofSelect(client);
    const hasReviewedByColumn = await hasArrivalVerificationColumn('reviewed_by', client);
    const hasSubmittedAtColumn = await hasArrivalVerificationColumn('submitted_at', client);
    const reviewedByJoin = hasReviewedByColumn
        ? 'LEFT JOIN faculty_users reviewer ON reviewer.id = verification.reviewed_by'
        : 'LEFT JOIN LATERAL (SELECT NULL::text AS full_name) reviewer ON TRUE';
    const orderByExpression = hasSubmittedAtColumn
        ? 'COALESCE(verification.submitted_at, verification.verified_at, verification.created_at)'
        : 'COALESCE(verification.verified_at, verification.created_at)';
    const tripIncidentJoin = hasTripIncidentsTable
        ? `LEFT JOIN LATERAL (
            SELECT
                ARRAY_AGG(DISTINCT ti.incident_label ORDER BY ti.incident_label) AS incident_labels,
                ARRAY_AGG(DISTINCT ti.incident_type ORDER BY ti.incident_type) AS incident_types
            FROM trip_incidents ti
            WHERE ti.trip_id = verification.trip_id
         ) incidents ON TRUE`
        : `LEFT JOIN LATERAL (
            SELECT
                ARRAY[]::text[] AS incident_labels,
                ARRAY[]::text[] AS incident_types
         ) incidents ON TRUE`;
    const { rows } = await client.query(
        `SELECT
            ${proofSelect},
            faculty.full_name AS faculty_name,
            faculty.id AS faculty_id,
            faculty.profile_image_url AS faculty_profile_image_url,
            department.department_name AS college_name,
            COALESCE(locator.custom_purpose, locator.purpose_of_travel) AS purpose,
            locator.destination,
            locator.status AS locator_slip_status,
            locator.approved_at AS dean_approved_at,
            locator.reviewed_by AS dean_reviewed_by,
            trip.status AS trip_status,
            trip.ended_at,
            locator.expected_return_datetime,
            reviewer.full_name AS reviewed_by_name,
            dean_reviewer.full_name AS dean_name,
            dean_reviewer.account_role AS dean_role,
            lsig.signature_url AS dean_signature_url,
            lsig.signature_mime_type AS dean_signature_mime_type,
            lsig.signature_original_filename AS dean_signature_original_filename,
            lsig.attached_at AS dean_signature_attached_at,
            incidents.incident_labels,
            incidents.incident_types
         FROM arrival_verifications verification
         JOIN faculty_users faculty ON faculty.id = verification.faculty_user_id
         JOIN locator_slips locator ON locator.id = verification.locator_slip_id
         LEFT JOIN trips trip ON trip.id = verification.trip_id
         LEFT JOIN departments department ON department.id = COALESCE(locator.college_id, faculty.department_id)
         ${reviewedByJoin}
         LEFT JOIN faculty_users dean_reviewer ON dean_reviewer.id = locator.reviewed_by
         LEFT JOIN locator_slip_dean_signatures lsig ON lsig.locator_slip_id = verification.locator_slip_id
         ${tripIncidentJoin}
         ORDER BY ${orderByExpression} DESC, verification.created_at DESC`
    );

    return rows.map((row) => ({
        ...mapProofRow(row),
        facultyName: row.faculty_name,
        facultyId: row.faculty_id,
        profileImageUrl: row.faculty_profile_image_url || null,
        collegeName: row.college_name || null,
        purpose: row.purpose || null,
        destination: row.destination || null,
        locatorSlipStatus: row.locator_slip_status || null,
        tripStatus: row.trip_status || null,
        actualReturnTime: row.ended_at || null,
        expectedReturnTime: row.expected_return_datetime || null,
        reviewedByName: row.reviewed_by_name || null,
        deanApprovedAt: row.dean_approved_at || null,
        deanReviewedBy: row.dean_reviewed_by || null,
        deanName: row.dean_name || null,
        deanRole: row.dean_role || null,
        deanSignatureUrl: row.dean_signature_url || null,
        deanSignatureMimeType: row.dean_signature_mime_type || null,
        deanSignatureOriginalFilename: row.dean_signature_original_filename || null,
        deanSignatureAttachedAt: row.dean_signature_attached_at || null,
        flaggedReasons: Array.isArray(row.incident_labels) ? row.incident_labels : [],
        flaggedIncidentTypes: Array.isArray(row.incident_types) ? row.incident_types : []
    }));
};

const getHrmuProofById = async (proofId, client = pool) => {
    const tableExists = await getArrivalVerificationsTableExists(client);
    if (!tableExists) {
        return null;
    }

    const hasTripIncidentsTable = await getTripIncidentsTableExists(client);
    const proofSelect = await buildProofSelect(client);
    const hasReviewedByColumn = await hasArrivalVerificationColumn('reviewed_by', client);
    const reviewedByJoin = hasReviewedByColumn
        ? 'LEFT JOIN faculty_users reviewer ON reviewer.id = verification.reviewed_by'
        : 'LEFT JOIN LATERAL (SELECT NULL::text AS full_name) reviewer ON TRUE';
    const tripIncidentJoin = hasTripIncidentsTable
        ? `LEFT JOIN LATERAL (
            SELECT
                ARRAY_AGG(DISTINCT ti.incident_label ORDER BY ti.incident_label) AS incident_labels,
                ARRAY_AGG(DISTINCT ti.incident_type ORDER BY ti.incident_type) AS incident_types
            FROM trip_incidents ti
            WHERE ti.trip_id = verification.trip_id
         ) incidents ON TRUE`
        : `LEFT JOIN LATERAL (
            SELECT
                ARRAY[]::text[] AS incident_labels,
                ARRAY[]::text[] AS incident_types
         ) incidents ON TRUE`;
    const { rows } = await client.query(
        `SELECT
            ${proofSelect},
            faculty.full_name AS faculty_name,
            faculty.id AS faculty_id,
            faculty.profile_image_url AS faculty_profile_image_url,
            department.department_name AS college_name,
            COALESCE(locator.custom_purpose, locator.purpose_of_travel) AS purpose,
            locator.destination,
            locator.status AS locator_slip_status,
            locator.approved_at AS dean_approved_at,
            locator.reviewed_by AS dean_reviewed_by,
            locator.expected_return_datetime,
            trip.status AS trip_status,
            trip.started_at,
            trip.ended_at,
            reviewer.full_name AS reviewed_by_name,
            dean_reviewer.full_name AS dean_name,
            dean_reviewer.account_role AS dean_role,
            lsig.signature_url AS dean_signature_url,
            lsig.signature_mime_type AS dean_signature_mime_type,
            lsig.signature_original_filename AS dean_signature_original_filename,
            lsig.attached_at AS dean_signature_attached_at,
            incidents.incident_labels,
            incidents.incident_types
         FROM arrival_verifications verification
         JOIN faculty_users faculty ON faculty.id = verification.faculty_user_id
         JOIN locator_slips locator ON locator.id = verification.locator_slip_id
         LEFT JOIN trips trip ON trip.id = verification.trip_id
         LEFT JOIN departments department ON department.id = COALESCE(locator.college_id, faculty.department_id)
         ${reviewedByJoin}
         LEFT JOIN faculty_users dean_reviewer ON dean_reviewer.id = locator.reviewed_by
         LEFT JOIN locator_slip_dean_signatures lsig ON lsig.locator_slip_id = verification.locator_slip_id
         ${tripIncidentJoin}
         WHERE verification.id = $1
         LIMIT 1`,
        [proofId]
    );

    if (!rows[0]) return null;

    return {
        ...mapProofRow(rows[0]),
        facultyName: rows[0].faculty_name,
        facultyId: rows[0].faculty_id,
        profileImageUrl: rows[0].faculty_profile_image_url || null,
        collegeName: rows[0].college_name || null,
        purpose: rows[0].purpose || null,
        destination: rows[0].destination || null,
        locatorSlipStatus: rows[0].locator_slip_status || null,
        expectedReturnTime: rows[0].expected_return_datetime || null,
        tripStatus: rows[0].trip_status || null,
        tripStartedAt: rows[0].started_at || null,
        actualReturnTime: rows[0].ended_at || null,
        reviewedByName: rows[0].reviewed_by_name || null,
        deanApprovedAt: rows[0].dean_approved_at || null,
        deanReviewedBy: rows[0].dean_reviewed_by || null,
        deanName: rows[0].dean_name || null,
        deanRole: rows[0].dean_role || null,
        deanSignatureUrl: rows[0].dean_signature_url || null,
        deanSignatureMimeType: rows[0].dean_signature_mime_type || null,
        deanSignatureOriginalFilename: rows[0].dean_signature_original_filename || null,
        deanSignatureAttachedAt: rows[0].dean_signature_attached_at || null,
        flaggedReasons: Array.isArray(rows[0].incident_labels) ? rows[0].incident_labels : [],
        flaggedIncidentTypes: Array.isArray(rows[0].incident_types) ? rows[0].incident_types : []
    };
};

const updateProofReview = async ({ proofId, reviewerId, verificationStatus, reviewRemarks }, client = pool) => {
    const tableExists = await getArrivalVerificationsTableExists(client);
    if (!tableExists) {
        return null;
    }

    const columns = await getArrivalVerificationColumns(client);
    const clauses = [];
    const values = [];
    let index = 1;

    if (columns.has('verification_status')) {
        clauses.push(`verification_status = $${index}`);
        values.push(verificationStatus);
        index += 1;
    }

    if (columns.has('status')) {
        clauses.push(`status = $${index}`);
        values.push(verificationStatus);
        index += 1;
    }

    if (columns.has('reviewed_by')) {
        clauses.push(`reviewed_by = $${index}`);
        values.push(reviewerId);
        index += 1;
    }

    if (columns.has('reviewed_at')) {
        clauses.push(`reviewed_at = $${index}`);
        values.push(new Date());
        index += 1;
    }

    if (columns.has('review_remarks')) {
        clauses.push(`review_remarks = $${index}`);
        values.push(reviewRemarks || null);
        index += 1;
    }

    if (clauses.length === 0) {
        return null;
    }

    values.push(proofId);

    const { rows } = await client.query(
        `UPDATE arrival_verifications
         SET ${clauses.join(', ')}
         WHERE id = $${index}
         RETURNING *`,
        values
    );

    return mapProofRow(rows[0]);
};

module.exports = {
    hasArrivalVerificationColumn,
    getProofByTripForFaculty,
    insertProof,
    getHrmuProofList,
    getHrmuProofById,
    updateProofReview
};
