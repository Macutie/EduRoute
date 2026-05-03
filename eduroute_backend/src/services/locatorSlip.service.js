const pool = require('../db/pool');
const AppError = require('../utils/appError');
const { formatDateTime } = require('../utils/dateFormatter');
const cloudinary = require('../config/cloudinary');
const { optimizeImage } = require('./imageOptimization.service');
const notificationService = require('./notification.service');
const socketBroadcasterService = require('./socketBroadcaster.service');

const LOCATOR_SLIP_STATUSES = ['pending', 'approved', 'rejected', 'completed', 'cancelled'];
const QR_VISIBLE_SLIP_STATUSES = new Set(['pending', 'approved', 'verified']);
let locatorSlipTripStatusColumnExistsCache = null;
let tripsLocatorSlipIdColumnExistsCache = null;
const tripsColumnExistsCache = {};
let locatorSlipCodeColumnExistsCache = null;
let qrGeneratedAtColumnExistsCache = null;
let cssuValidationColumnsExistsCache = null;
let cssuExitLogsTableExistsCache = null;

const LOCATOR_SLIP_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const getLocatorSlipTripStatusColumnExists = async () => {
    if (locatorSlipTripStatusColumnExistsCache !== null) {
        return locatorSlipTripStatusColumnExistsCache;
    }

    const { rows } = await pool.query(
        `SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'locator_slips'
              AND column_name = 'trip_status'
        ) AS exists`
    );

    locatorSlipTripStatusColumnExistsCache = Boolean(rows[0]?.exists);
    return locatorSlipTripStatusColumnExistsCache;
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

const getTripsColumnExists = async (columnName) => {
    if (Object.prototype.hasOwnProperty.call(tripsColumnExistsCache, columnName)) {
        return tripsColumnExistsCache[columnName];
    }

    const { rows } = await pool.query(
        `SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'trips'
              AND column_name = $1
        ) AS exists`,
        [columnName]
    );

    tripsColumnExistsCache[columnName] = Boolean(rows[0]?.exists);
    return tripsColumnExistsCache[columnName];
};

const getLocatorSlipColumnExists = async (columnName) => {
    const { rows } = await pool.query(
        `SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'locator_slips'
              AND column_name = $1
        ) AS exists`,
        [columnName]
    );

    return Boolean(rows[0]?.exists);
};

const getCssuExitLogsTableExists = async () => {
    if (cssuExitLogsTableExistsCache !== null) {
        return cssuExitLogsTableExistsCache;
    }

    const { rows } = await pool.query(`SELECT to_regclass('public.cssu_exit_logs') AS table_name`);
    cssuExitLogsTableExistsCache = Boolean(rows[0]?.table_name);
    return cssuExitLogsTableExistsCache;
};

const getLocatorSlipCodeColumnExists = async () => {
    if (locatorSlipCodeColumnExistsCache !== null) {
        return locatorSlipCodeColumnExistsCache;
    }

    locatorSlipCodeColumnExistsCache = await getLocatorSlipColumnExists('locator_slip_code');
    return locatorSlipCodeColumnExistsCache;
};

const getQrGeneratedAtColumnExists = async () => {
    if (qrGeneratedAtColumnExistsCache !== null) {
        return qrGeneratedAtColumnExistsCache;
    }

    qrGeneratedAtColumnExistsCache = await getLocatorSlipColumnExists('qr_generated_at');
    return qrGeneratedAtColumnExistsCache;
};

const getCssuValidationColumnsExists = async () => {
    if (cssuValidationColumnsExistsCache !== null) {
        return cssuValidationColumnsExistsCache;
    }

    const [validatedAt, validationStatus, validationNotes] = await Promise.all([
        getLocatorSlipColumnExists('cssu_validated_at'),
        getLocatorSlipColumnExists('cssu_validation_status'),
        getLocatorSlipColumnExists('cssu_validation_notes')
    ]);

    cssuValidationColumnsExistsCache = validatedAt && validationStatus && validationNotes;
    return cssuValidationColumnsExistsCache;
};

const generateShortLocatorSlipCode = () => {
    let suffix = '';

    for (let index = 0; index < 6; index += 1) {
        const randomIndex = Math.floor(Math.random() * LOCATOR_SLIP_CODE_ALPHABET.length);
        suffix += LOCATOR_SLIP_CODE_ALPHABET[randomIndex];
    }

    return `LS-${suffix}`;
};

const LOCATOR_SLIP_TRIP_FALLBACK_WINDOW_SECONDS = 4 * 60 * 60;
const CSSU_FLAG_INCIDENT_NOTE_PREFIX = 'FLAG_INCIDENT:';

const getCssuValidationStatusSelect = ({
    hasCssuValidationStatusColumn,
    hasCssuExitLogsTable
}) => {
    if (hasCssuValidationStatusColumn) {
        return `CASE
            WHEN LOWER(COALESCE(ls.cssu_validation_status, '')) IN ('allowed', 'validated') THEN 'allowed'
            WHEN LOWER(COALESCE(ls.cssu_validation_status, '')) = 'denied' THEN 'denied'
            WHEN LOWER(COALESCE(ls.cssu_validation_status, '')) = 'flagged' THEN 'flagged'
            ${hasCssuExitLogsTable ? `
            WHEN latest_cssu_log.status = 'validated' THEN 'allowed'
            WHEN latest_cssu_log.status = 'denied' AND COALESCE(latest_cssu_log.notes, '') LIKE '${CSSU_FLAG_INCIDENT_NOTE_PREFIX}%' THEN 'flagged'
            WHEN latest_cssu_log.status = 'denied' THEN 'denied'` : ''}
            ELSE 'pending'
        END AS cssu_validation_status`;
    }

    if (hasCssuExitLogsTable) {
        return `CASE
            WHEN latest_cssu_log.status = 'validated' THEN 'allowed'
            WHEN latest_cssu_log.status = 'denied' AND COALESCE(latest_cssu_log.notes, '') LIKE '${CSSU_FLAG_INCIDENT_NOTE_PREFIX}%' THEN 'flagged'
            WHEN latest_cssu_log.status = 'denied' THEN 'denied'
            ELSE 'pending'
        END AS cssu_validation_status`;
    }

    return `NULL::text AS cssu_validation_status`;
};

const locatorSlipColumns = `
    ls.id,
    ls.faculty_user_id,
    ls.college_id,
    fu.full_name,
    fu.employee_id,
    d.department_name,
    ls.destination,
    ls.purpose_of_travel,
    ls.custom_purpose,
    ls.departure_datetime,
    ls.expected_return_datetime,
    ls.additional_remarks,
    ls.cancellation_reason,
    ls.is_urgent,
    ls.status,
    resolved_trip.trip_status,
    resolved_trip.trip_id,
    ls.created_at,
    ls.updated_at
`;

const formatLocatorSlip = (row) => ({
    id: row.id,
    faculty_user_id: row.faculty_user_id,
    college_id: row.college_id,
    faculty: {
        full_name: row.full_name,
        employee_id: row.employee_id,
        department_name: row.department_name
    },
    destination: row.destination,
    purpose_of_travel: row.purpose_of_travel,
    custom_purpose: row.custom_purpose,
    departure_datetime: row.departure_datetime,
    expected_return_datetime: row.expected_return_datetime,
    formatted_departure_datetime: formatDateTime(row.departure_datetime),
    formatted_expected_return_datetime: formatDateTime(row.expected_return_datetime),
    additional_remarks: row.additional_remarks,
    cancellation_reason: row.cancellation_reason || null,
    is_urgent: row.is_urgent === true,
    status: row.status,
    locator_slip_code: row.locator_slip_code || null,
    qr_generated_at: row.qr_generated_at || null,
    cssu_validated_at: row.cssu_validated_at || null,
    cssu_validation_status: row.cssu_validation_status || null,
    cssu_validation_notes: row.cssu_validation_notes || null,
    qr_visible: QR_VISIBLE_SLIP_STATUSES.has(String(row.status || '').toLowerCase()),
    trip_status: row.trip_status || 'not_started',
    trip_id: row.trip_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at
});

const buildLocatorSlipTripJoin = ({ hasTripsLocatorSlipIdColumn, hasReturnedAtColumn, hasEndedAtColumn }) => {
    const tripCompletionCheck = [
        hasReturnedAtColumn ? 'trip.returned_at IS NOT NULL' : null,
        hasEndedAtColumn ? 'trip.ended_at IS NOT NULL' : null,
        `trip.status = 'completed'`
    ].filter(Boolean).join(' OR ');

    const tripCompletedSortCheck = [
        hasReturnedAtColumn ? 'trip.returned_at IS NOT NULL' : null,
        hasEndedAtColumn ? 'trip.ended_at IS NOT NULL' : null,
        `trip.status = 'completed'`
    ].filter(Boolean).join(' OR ');

    const tripRecencyExpression = [
        hasEndedAtColumn ? 'trip.ended_at' : null,
        hasReturnedAtColumn ? 'trip.returned_at' : null,
        'trip.started_at',
        'trip.created_at'
    ].filter(Boolean).join(', ');

    return `
    LEFT JOIN LATERAL (
        SELECT
            trip.id AS trip_id,
            CASE
                WHEN ${tripCompletionCheck} THEN 'completed'
                ELSE trip.status
            END AS trip_status
        FROM trips trip
        WHERE trip.user_id = ls.faculty_user_id
          AND ls.status IN ('approved', 'verified', 'completed')
          ${hasTripsLocatorSlipIdColumn
            ? `AND (
                trip.locator_slip_id = ls.id
                OR (
                    trip.locator_slip_id IS NULL
                    AND ABS(EXTRACT(EPOCH FROM (COALESCE(ls.departure_datetime, ls.created_at) - COALESCE(trip.started_at, trip.created_at)))) <= ${LOCATOR_SLIP_TRIP_FALLBACK_WINDOW_SECONDS}
                )
            )`
            : `AND ABS(EXTRACT(EPOCH FROM (COALESCE(ls.departure_datetime, ls.created_at) - COALESCE(trip.started_at, trip.created_at)))) <= ${LOCATOR_SLIP_TRIP_FALLBACK_WINDOW_SECONDS}`}
        ORDER BY
            CASE
                WHEN ${tripCompletedSortCheck} THEN 0
                ELSE 1
            END,
            ABS(EXTRACT(EPOCH FROM (COALESCE(ls.departure_datetime, ls.created_at) - COALESCE(trip.started_at, trip.created_at)))) ASC,
            COALESCE(${tripRecencyExpression}) DESC
        LIMIT 1
    ) resolved_trip ON TRUE
`;
};

const getResolvedTripStatusSelect = (hasLocatorSlipTripStatusColumn) => (
    hasLocatorSlipTripStatusColumn
        ? `CASE
            WHEN COALESCE(resolved_trip.trip_status, '') = 'completed' OR COALESCE(ls.trip_status, '') = 'completed' THEN 'completed'
            ELSE COALESCE(ls.trip_status, resolved_trip.trip_status, 'not_started')
        END AS trip_status`
        : `COALESCE(resolved_trip.trip_status, 'not_started') AS trip_status`
);

const getFacultyProfile = async (facultyUserId) => {
    const query = `
        SELECT fu.full_name, fu.employee_id, d.department_name
        FROM faculty_users fu
        JOIN departments d ON d.id = fu.department_id
        WHERE fu.id = $1
        LIMIT 1
    `;

    const { rows, rowCount } = await pool.query(query, [facultyUserId]);

    if (rowCount === 0) {
        throw new AppError('Faculty user not found.', 404);
    }

    return rows[0];
};

const createLocatorSlip = async (facultyUserId, payload) => {
    const destination = payload.destination.trim();
    const purposeOfTravel = payload.purpose_of_travel.trim();
    const customPurpose = purposeOfTravel === 'Others' ? payload.custom_purpose?.trim() : null;
    const additionalRemarks = payload.additional_remarks?.trim() || null;
    const isUrgent = payload.is_urgent === true;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const facultyResult = await client.query(
            `SELECT
                fu.id,
                fu.full_name,
                fu.department_id,
                d.department_name
             FROM faculty_users fu
             JOIN departments d ON d.id = fu.department_id
             WHERE fu.id = $1
               AND fu.account_role = 'faculty'
               AND fu.status = 'active'
             LIMIT 1`,
            [facultyUserId]
        );

        if (facultyResult.rowCount === 0) {
            throw new AppError('Faculty user not found or cannot submit locator slips.', 404);
        }

        const faculty = facultyResult.rows[0];

        const hasLocatorSlipCodeColumn = await getLocatorSlipCodeColumnExists();
        const hasQrGeneratedAtColumn = await getQrGeneratedAtColumnExists();

        let insertedSlip = null;
        let lastInsertError = null;

        for (let attempt = 0; attempt < 5; attempt += 1) {
            const generatedCode = hasLocatorSlipCodeColumn ? generateShortLocatorSlipCode() : null;
            const insertColumns = [
                'faculty_user_id',
                'college_id',
                'destination',
                'purpose_of_travel',
                'custom_purpose',
                'departure_datetime',
                'expected_return_datetime',
                'additional_remarks',
                'is_urgent',
                'status',
            ];
            const insertValues = [
                facultyUserId,
                faculty.department_id,
                destination,
                purposeOfTravel,
                customPurpose,
                payload.departure_datetime,
                payload.expected_return_datetime,
                additionalRemarks,
                isUrgent,
                'pending'
            ];

            if (hasLocatorSlipCodeColumn) {
                insertColumns.push('locator_slip_code');
                insertValues.push(generatedCode);
            }

            if (hasQrGeneratedAtColumn) {
                insertColumns.push('qr_generated_at');
                insertValues.push(new Date().toISOString());
            }

            const placeholders = insertValues.map((_, index) => `$${index + 1}`).join(', ');

            try {
                const { rows } = await client.query(
                    `INSERT INTO locator_slips (${insertColumns.join(', ')})
                     VALUES (${placeholders})
                     RETURNING *`,
                    insertValues
                );
                insertedSlip = rows[0];
                break;
            } catch (error) {
                if (hasLocatorSlipCodeColumn && error.code === '23505' && String(error.constraint || '').includes('locator_slip_code')) {
                    lastInsertError = error;
                    continue;
                }

                throw error;
            }
        }

        if (!insertedSlip) {
            throw lastInsertError || new AppError('Unable to generate a unique locator slip code.', 500);
        }

        const notificationPayload = {
            ...insertedSlip,
            faculty_name: faculty.full_name,
            college_name: faculty.department_name
        };

        await notificationService.createLocatorSlipDeanNotifications(client, notificationPayload);

        await client.query('COMMIT');
        notificationService.emitLocatorSlipDeanNotification(notificationPayload);
        await socketBroadcasterService.broadcastHrmuDashboardUpdate().catch((broadcastError) => {
            console.error('Failed to broadcast HRMU dashboard update after locator slip creation:', broadcastError);
        });

        return getLocatorSlipById(facultyUserId, insertedSlip.id);
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {
            console.error('Rollback failed:', rollbackError);
        }
        throw error;
    } finally {
        client.release();
    }
};

const getMyLocatorSlips = async (facultyUserId, status = null) => {
    if (status && !LOCATOR_SLIP_STATUSES.includes(status)) {
        throw new AppError('Locator slip status filter is invalid.', 400);
    }

    const hasLocatorSlipTripStatusColumn = await getLocatorSlipTripStatusColumnExists();
    const hasTripsLocatorSlipIdColumn = await getTripsLocatorSlipIdColumnExists();
    const hasReturnedAtColumn = await getTripsColumnExists('returned_at');
    const hasEndedAtColumn = await getTripsColumnExists('ended_at');
    const hasLocatorSlipCodeColumn = await getLocatorSlipCodeColumnExists();
    const hasQrGeneratedAtColumn = await getQrGeneratedAtColumnExists();
    const hasCssuValidationStatusColumn = await getLocatorSlipColumnExists('cssu_validation_status');
    const hasCssuValidatedAtColumn = await getLocatorSlipColumnExists('cssu_validated_at');
    const hasCssuValidationNotesColumn = await getLocatorSlipColumnExists('cssu_validation_notes');
    const hasCssuExitLogsTable = await getCssuExitLogsTableExists();
    const tripStatusSelect = getResolvedTripStatusSelect(hasLocatorSlipTripStatusColumn);
    const locatorSlipTripJoin = buildLocatorSlipTripJoin({
        hasTripsLocatorSlipIdColumn,
        hasReturnedAtColumn,
        hasEndedAtColumn
    });
    const completedFilter = status === 'completed'
        ? `AND (${hasLocatorSlipTripStatusColumn ? `COALESCE(ls.trip_status, resolved_trip.trip_status, 'not_started') = 'completed'` : `COALESCE(resolved_trip.trip_status, 'not_started') = 'completed'`})`
        : '';
    const statusFilter = status && status !== 'completed'
        ? `AND ls.status = $2`
        : '';

    const query = `
        SELECT
            ${locatorSlipColumns.replace('resolved_trip.trip_status,', `${tripStatusSelect},`)}
            ${hasLocatorSlipCodeColumn ? ', ls.locator_slip_code' : ", NULL::text AS locator_slip_code"}
            ${hasQrGeneratedAtColumn ? ', ls.qr_generated_at' : ", NULL::timestamp AS qr_generated_at"}
            , ${getCssuValidationStatusSelect({
                hasCssuValidationStatusColumn,
                hasCssuExitLogsTable
            })}
            ${hasCssuValidatedAtColumn
                ? `, COALESCE(ls.cssu_validated_at, ${hasCssuExitLogsTable ? 'latest_cssu_log.validated_at' : 'NULL'}) AS cssu_validated_at`
                : hasCssuExitLogsTable
                    ? ', latest_cssu_log.validated_at AS cssu_validated_at'
                    : ", NULL::timestamp AS cssu_validated_at"}
            ${hasCssuValidationNotesColumn
                ? `, COALESCE(ls.cssu_validation_notes, ${hasCssuExitLogsTable ? 'latest_cssu_log.notes' : 'NULL'}) AS cssu_validation_notes`
                : hasCssuExitLogsTable
                    ? ', latest_cssu_log.notes AS cssu_validation_notes'
                    : ", NULL::text AS cssu_validation_notes"}
        FROM locator_slips ls
        JOIN faculty_users fu ON fu.id = ls.faculty_user_id
        JOIN departments d ON d.id = fu.department_id
        ${locatorSlipTripJoin}
        ${hasCssuExitLogsTable ? `
        LEFT JOIN LATERAL (
            SELECT log.status, log.validated_at, log.notes
            FROM cssu_exit_logs log
            WHERE log.locator_slip_id = ls.id
            ORDER BY COALESCE(log.validated_at, log.created_at) DESC, log.id DESC
            LIMIT 1
        ) latest_cssu_log ON TRUE` : ''}
        WHERE ls.faculty_user_id = $1
          AND ls.status <> 'cancelled'
          ${statusFilter}
          ${completedFilter}
        ORDER BY ls.created_at DESC
    `;

    const queryParams = [facultyUserId];
    if (status && status !== 'completed') {
        queryParams.push(status);
    }

    const { rows } = await pool.query(query, queryParams);
    return rows.map(formatLocatorSlip);
};

const getLocatorSlipById = async (facultyUserId, locatorSlipId) => {
    const hasLocatorSlipTripStatusColumn = await getLocatorSlipTripStatusColumnExists();
    const hasTripsLocatorSlipIdColumn = await getTripsLocatorSlipIdColumnExists();
    const hasReturnedAtColumn = await getTripsColumnExists('returned_at');
    const hasEndedAtColumn = await getTripsColumnExists('ended_at');
    const hasLocatorSlipCodeColumn = await getLocatorSlipCodeColumnExists();
    const hasQrGeneratedAtColumn = await getQrGeneratedAtColumnExists();
    const hasCssuValidationStatusColumn = await getLocatorSlipColumnExists('cssu_validation_status');
    const hasCssuValidatedAtColumn = await getLocatorSlipColumnExists('cssu_validated_at');
    const hasCssuValidationNotesColumn = await getLocatorSlipColumnExists('cssu_validation_notes');
    const hasCssuExitLogsTable = await getCssuExitLogsTableExists();
    const tripStatusSelect = getResolvedTripStatusSelect(hasLocatorSlipTripStatusColumn);
    const locatorSlipTripJoin = buildLocatorSlipTripJoin({
        hasTripsLocatorSlipIdColumn,
        hasReturnedAtColumn,
        hasEndedAtColumn
    });

    const query = `
        SELECT
            ${locatorSlipColumns.replace('resolved_trip.trip_status,', `${tripStatusSelect},`)}
            ${hasLocatorSlipCodeColumn ? ', ls.locator_slip_code' : ", NULL::text AS locator_slip_code"}
            ${hasQrGeneratedAtColumn ? ', ls.qr_generated_at' : ", NULL::timestamp AS qr_generated_at"}
            , ${getCssuValidationStatusSelect({
                hasCssuValidationStatusColumn,
                hasCssuExitLogsTable
            })}
            ${hasCssuValidatedAtColumn
                ? `, COALESCE(ls.cssu_validated_at, ${hasCssuExitLogsTable ? 'latest_cssu_log.validated_at' : 'NULL'}) AS cssu_validated_at`
                : hasCssuExitLogsTable
                    ? ', latest_cssu_log.validated_at AS cssu_validated_at'
                    : ", NULL::timestamp AS cssu_validated_at"}
            ${hasCssuValidationNotesColumn
                ? `, COALESCE(ls.cssu_validation_notes, ${hasCssuExitLogsTable ? 'latest_cssu_log.notes' : 'NULL'}) AS cssu_validation_notes`
                : hasCssuExitLogsTable
                    ? ', latest_cssu_log.notes AS cssu_validation_notes'
                    : ", NULL::text AS cssu_validation_notes"}
        FROM locator_slips ls
        JOIN faculty_users fu ON fu.id = ls.faculty_user_id
        JOIN departments d ON d.id = fu.department_id
        ${locatorSlipTripJoin}
        ${hasCssuExitLogsTable ? `
        LEFT JOIN LATERAL (
            SELECT log.status, log.validated_at, log.notes
            FROM cssu_exit_logs log
            WHERE log.locator_slip_id = ls.id
            ORDER BY COALESCE(log.validated_at, log.created_at) DESC, log.id DESC
            LIMIT 1
        ) latest_cssu_log ON TRUE` : ''}
        WHERE ls.id = $1
          AND ls.faculty_user_id = $2
        LIMIT 1
    `;

    const { rows, rowCount } = await pool.query(query, [locatorSlipId, facultyUserId]);

    if (rowCount === 0) {
        throw new AppError('Locator slip not found.', 404);
    }

    return formatLocatorSlip(rows[0]);
};

const cancelLocatorSlip = async (facultyUserId, locatorSlipId, cancellationReason = null) => {
    const hasCancellationReasonColumn = await getLocatorSlipColumnExists('cancellation_reason');
    const query = `
        UPDATE locator_slips
        SET status = 'cancelled',
            ${hasCancellationReasonColumn ? 'cancellation_reason = $3,' : ''}
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
          AND faculty_user_id = $2
          AND status = 'pending'
        RETURNING id
    `;

    const queryValues = hasCancellationReasonColumn
        ? [locatorSlipId, facultyUserId, cancellationReason]
        : [locatorSlipId, facultyUserId];

    const { rows, rowCount } = await pool.query(query, queryValues);

    if (rowCount === 0) {
        throw new AppError('Pending locator slip not found or cannot be cancelled.', 404);
    }

    return getLocatorSlipById(facultyUserId, rows[0].id);
};

const uploadVerificationToCloudinary = (optimizedImage, locatorSlipId) =>
    new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: 'eduroute/location-verifications',
                public_id: `locator-${locatorSlipId}-${Date.now()}`,
                overwrite: true,
                resource_type: 'image',
                format: optimizedImage.extension
            },
            (error, result) => {
                if (error) return reject(error);
                return resolve(result);
            }
        );

        uploadStream.end(optimizedImage.buffer);
    });

const verifyLocation = async (facultyUserId, locatorSlipId, file) => {
    if (!file) {
        throw new AppError('Location verification photo is required.', 422);
    }

    const locatorSlip = await getLocatorSlipById(facultyUserId, locatorSlipId);

    if (locatorSlip.status !== 'approved') {
        throw new AppError('Only approved locator slips can be verified by location photo.', 409);
    }

    const optimizedImage = await optimizeImage(file, 'locationVerification');
    const uploadResult = await uploadVerificationToCloudinary(optimizedImage, locatorSlipId);

    const query = `
        INSERT INTO locator_slip_location_verifications (
            locator_slip_id,
            faculty_user_id,
            target_location,
            image_url,
            image_public_id,
            mime_type,
            file_size,
            original_file_size,
            image_width,
            image_height,
            verification_status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'submitted')
        RETURNING *
    `;

    const { rows } = await pool.query(query, [
        locatorSlipId,
        facultyUserId,
        locatorSlip.destination,
        uploadResult.secure_url,
        uploadResult.public_id,
        optimizedImage.mimetype,
        optimizedImage.size,
        optimizedImage.original.size,
        optimizedImage.width,
        optimizedImage.height
    ]);

    return {
        locator_slip: locatorSlip,
        verification: rows[0]
    };
};

const getLocationVerification = async (facultyUserId, locatorSlipId) => {
    const locatorSlip = await getLocatorSlipById(facultyUserId, locatorSlipId);

    const query = `
        SELECT
            id,
            locator_slip_id,
            faculty_user_id,
            target_location,
            image_url,
            image_public_id,
            mime_type,
            file_size,
            original_file_size,
            image_width,
            image_height,
            verification_status,
            created_at
        FROM locator_slip_location_verifications
        WHERE locator_slip_id = $1
          AND faculty_user_id = $2
        ORDER BY created_at DESC
        LIMIT 1
    `;

    const { rows } = await pool.query(query, [locatorSlipId, facultyUserId]);

    return {
        locator_slip: locatorSlip,
        verification: rows[0] || null
    };
};

module.exports = {
    LOCATOR_SLIP_STATUSES,
    getFacultyProfile,
    createLocatorSlip,
    getMyLocatorSlips,
    getLocatorSlipById,
    cancelLocatorSlip,
    verifyLocation,
    getLocationVerification
};
