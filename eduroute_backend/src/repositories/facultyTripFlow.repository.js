const pool = require('../db/pool');

const OPEN_TRIP_STATUSES = ['active', 'arrived', 'returning'];
const APPROVED_SLIP_STATUSES = ['approved', 'verified'];
const LOCATOR_SLIP_TRIP_FALLBACK_WINDOW_SECONDS = 4 * 60 * 60;
const CSSU_FLAG_INCIDENT_NOTE_PREFIX = 'FLAG_INCIDENT:';
let locatorSlipTripStatusColumnExistsCache = null;
let locatorSlipDestinationLatColumnExistsCache = null;
let locatorSlipDestinationLngColumnExistsCache = null;
let locatorSlipDestinationResolutionMethodColumnExistsCache = null;
const locatorSlipColumnExistsCache = {};
let tripsLocatorSlipIdColumnExistsCache = null;
let arrivalVerificationsTableExistsCache = null;
let locatorSlipLocationVerificationsTableExistsCache = null;
let cssuExitLogsTableExistsCache = null;
const tripsColumnExistsCache = {};
let tripsStatusConstraintDefinitionCache = null;

const getLocatorSlipColumnExists = async (columnName, client = pool) => {
    if (Object.prototype.hasOwnProperty.call(locatorSlipColumnExistsCache, columnName)) {
        return locatorSlipColumnExistsCache[columnName];
    }

    const { rows } = await client.query(
        `SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'locator_slips'
              AND column_name = $1
        ) AS exists`,
        [columnName]
    );

    locatorSlipColumnExistsCache[columnName] = Boolean(rows[0]?.exists);
    return locatorSlipColumnExistsCache[columnName];
};

const getLocatorSlipTripStatusColumnExists = async (client = pool) => {
    if (locatorSlipTripStatusColumnExistsCache === null) {
        locatorSlipTripStatusColumnExistsCache = await getLocatorSlipColumnExists('trip_status', client);
    }
    return locatorSlipTripStatusColumnExistsCache;
};

const getLocatorSlipDestinationLatColumnExists = async (client = pool) => {
    if (locatorSlipDestinationLatColumnExistsCache === null) {
        locatorSlipDestinationLatColumnExistsCache = await getLocatorSlipColumnExists('destination_lat', client);
    }
    return locatorSlipDestinationLatColumnExistsCache;
};

const getLocatorSlipDestinationLngColumnExists = async (client = pool) => {
    if (locatorSlipDestinationLngColumnExistsCache === null) {
        locatorSlipDestinationLngColumnExistsCache = await getLocatorSlipColumnExists('destination_lng', client);
    }
    return locatorSlipDestinationLngColumnExistsCache;
};

const getLocatorSlipDestinationResolutionMethodColumnExists = async (client = pool) => {
    if (locatorSlipDestinationResolutionMethodColumnExistsCache === null) {
        locatorSlipDestinationResolutionMethodColumnExistsCache = await getLocatorSlipColumnExists('destination_resolution_method', client);
    }
    return locatorSlipDestinationResolutionMethodColumnExistsCache;
};

const getCssuExitLogsTableExists = async (client = pool) => {
    if (cssuExitLogsTableExistsCache !== null) {
        return cssuExitLogsTableExistsCache;
    }

    const { rows } = await client.query(`SELECT to_regclass('public.cssu_exit_logs') AS table_name`);
    cssuExitLogsTableExistsCache = Boolean(rows[0]?.table_name);
    return cssuExitLogsTableExistsCache;
};

const getTripsLocatorSlipIdColumnExists = async (client = pool) => {
    if (tripsLocatorSlipIdColumnExistsCache !== null) {
        return tripsLocatorSlipIdColumnExistsCache;
    }

    const { rows } = await client.query(
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

const getTripsColumnExists = async (columnName, client = pool) => {
    if (Object.prototype.hasOwnProperty.call(tripsColumnExistsCache, columnName)) {
        return tripsColumnExistsCache[columnName];
    }

    const { rows } = await client.query(
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

const getTripsStatusConstraintDefinition = async (client = pool) => {
    if (tripsStatusConstraintDefinitionCache !== null) {
        return tripsStatusConstraintDefinitionCache;
    }

    const { rows } = await client.query(
        `SELECT pg_get_constraintdef(c.oid) AS definition
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE n.nspname = 'public'
           AND t.relname = 'trips'
           AND c.contype = 'c'
           AND c.conname = 'chk_trips_status'
         LIMIT 1`
    );

    tripsStatusConstraintDefinitionCache = rows[0]?.definition || '';
    return tripsStatusConstraintDefinitionCache;
};

const getTripsSupportsStatusValue = async (statusValue, client = pool) => {
    const definition = await getTripsStatusConstraintDefinition(client);

    if (!definition) {
        return true;
    }

    return definition.toLowerCase().includes(`'${String(statusValue).toLowerCase()}'`);
};

const getArrivalVerificationsTableExists = async (client = pool) => {
    if (arrivalVerificationsTableExistsCache !== null) {
        return arrivalVerificationsTableExistsCache;
    }

    const { rows } = await client.query(`SELECT to_regclass('public.arrival_verifications') AS table_name`);
    arrivalVerificationsTableExistsCache = Boolean(rows[0]?.table_name);
    return arrivalVerificationsTableExistsCache;
};

const getLocatorSlipLocationVerificationsTableExists = async (client = pool) => {
    if (locatorSlipLocationVerificationsTableExistsCache !== null) {
        return locatorSlipLocationVerificationsTableExistsCache;
    }

    const { rows } = await client.query(`SELECT to_regclass('public.locator_slip_location_verifications') AS table_name`);
    locatorSlipLocationVerificationsTableExistsCache = Boolean(rows[0]?.table_name);
    return locatorSlipLocationVerificationsTableExistsCache;
};

const mapTripRow = (row) => {
    if (!row) return null;

    return {
        id: row.id,
        locator_slip_id: row.locator_slip_id,
        faculty_user_id: row.user_id,
        origin: row.origin_lat === null || row.origin_lng === null
            ? null
            : {
                lat: Number(row.origin_lat),
                lng: Number(row.origin_lng),
                latitude: Number(row.origin_lat),
                longitude: Number(row.origin_lng)
            },
        destination: row.destination_lat === null || row.destination_lng === null
            ? null
            : {
                lat: Number(row.destination_lat),
                lng: Number(row.destination_lng),
                latitude: Number(row.destination_lat),
                longitude: Number(row.destination_lng),
                name: row.destination_name || null
            },
        route_geometry: row.route_geometry,
        route_distance_meters: row.route_distance_meters === null ? null : Number(row.route_distance_meters),
        route_duration_seconds: row.route_duration_seconds === null ? null : Number(row.route_duration_seconds),
        outbound_distance_meters: row.outbound_distance_meters === null ? null : Number(row.outbound_distance_meters),
        return_distance_meters: row.return_distance_meters === null ? null : Number(row.return_distance_meters),
        total_distance_meters: row.total_distance_meters === null ? null : Number(row.total_distance_meters),
        total_distance_km: row.total_distance_km === null ? null : Number(row.total_distance_km),
        total_trip_minutes: row.total_trip_minutes === null ? null : Number(row.total_trip_minutes),
        total_trip_hours: row.total_trip_hours === null ? null : Number(row.total_trip_hours),
        status: row.status,
        started_at: row.started_at,
        arrived_at: row.arrived_at,
        arrival_verified_at: row.arrival_verified_at,
        returned_at: row.returned_at,
        ended_at: row.ended_at,
        summary_generated_at: row.summary_generated_at,
        created_at: row.created_at,
        updated_at: row.updated_at
    };
};

const mapLocatorSlipRow = (row) => ({
    id: row.id,
    faculty_user_id: row.faculty_user_id,
    purpose: row.custom_purpose || row.purpose_of_travel || null,
    purpose_of_travel: row.purpose_of_travel || null,
    custom_purpose: row.custom_purpose || null,
    destination: row.destination,
    destination_lat: row.destination_lat === null ? null : Number(row.destination_lat),
    destination_lng: row.destination_lng === null ? null : Number(row.destination_lng),
    destination_resolution_method: row.destination_resolution_method || null,
    departure_time: row.departure_datetime,
    expected_return_time: row.expected_return_datetime,
    status: row.status,
    trip_status: row.trip_status || 'not_started',
    completed_at: row.completed_at || null,
    cssu_validation_status: row.cssu_validation_status || 'pending',
    cssu_validated_at: row.cssu_validated_at || null,
    cssu_validated_by: row.cssu_validated_by || null,
    cssu_validated_by_name: row.cssu_validated_by_name || null,
    cssu_validation_notes: row.cssu_validation_notes || null,
    approved_at: row.approved_at || null,
    updated_at: row.updated_at || null
});

const getApprovedLocatorSlips = async (facultyUserId) => {
    const hasTripStatusColumn = await getLocatorSlipTripStatusColumnExists();
    const hasTripsLocatorSlipIdColumn = await getTripsLocatorSlipIdColumnExists();
    const hasReturnedAtColumn = await getTripsColumnExists('returned_at');
    const hasEndedAtColumn = await getTripsColumnExists('ended_at');
    const hasCompletedAtColumn = await getLocatorSlipColumnExists('completed_at');
    const hasCssuValidationStatusColumn = await getLocatorSlipColumnExists('cssu_validation_status');
    const hasCssuValidatedAtColumn = await getLocatorSlipColumnExists('cssu_validated_at');
    const hasCssuValidatedByColumn = await getLocatorSlipColumnExists('cssu_validated_by');
    const hasCssuValidationNotesColumn = await getLocatorSlipColumnExists('cssu_validation_notes');
    const hasCssuExitLogsTable = await getCssuExitLogsTableExists();
    const tripCompletionCheck = [
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
    const tripStatusSelect = hasTripStatusColumn
        ? `CASE
            WHEN COALESCE(resolved_trip.trip_status, '') = 'completed' OR COALESCE(ls.trip_status, '') = 'completed' THEN 'completed'
            ELSE COALESCE(ls.trip_status, resolved_trip.trip_status, 'not_started')
        END AS trip_status`
        : `COALESCE(resolved_trip.trip_status, 'not_started') AS trip_status`;
    const effectiveTripStatusWhere = hasTripStatusColumn
        ? `CASE
            WHEN COALESCE(resolved_trip.trip_status, '') = 'completed' OR COALESCE(ls.trip_status, '') = 'completed' THEN 'completed'
            ELSE COALESCE(ls.trip_status, resolved_trip.trip_status, 'not_started')
        END`
        : `COALESCE(resolved_trip.trip_status, 'not_started')`;
    const cssuValidationStatusSelect = hasCssuValidationStatusColumn
        ? `CASE
            WHEN COALESCE(ls.cssu_validation_status, '') <> '' THEN ls.cssu_validation_status
            ${hasCssuExitLogsTable ? `
            WHEN latest_cssu_log.status = 'validated' THEN 'allowed'
            WHEN latest_cssu_log.status = 'denied' AND COALESCE(latest_cssu_log.notes, '') LIKE '${CSSU_FLAG_INCIDENT_NOTE_PREFIX}%' THEN 'flagged'
            WHEN latest_cssu_log.status = 'denied' THEN 'denied'` : ''}
            ELSE 'pending'
        END AS cssu_validation_status`
        : hasCssuExitLogsTable
            ? `CASE
                WHEN latest_cssu_log.status = 'validated' THEN 'allowed'
                WHEN latest_cssu_log.status = 'denied' AND COALESCE(latest_cssu_log.notes, '') LIKE '${CSSU_FLAG_INCIDENT_NOTE_PREFIX}%' THEN 'flagged'
                WHEN latest_cssu_log.status = 'denied' THEN 'denied'
                ELSE 'pending'
            END AS cssu_validation_status`
            : `'pending' AS cssu_validation_status`;
    const cssuValidatedAtSelect = hasCssuValidatedAtColumn
        ? `COALESCE(ls.cssu_validated_at, ${hasCssuExitLogsTable ? 'latest_cssu_log.validated_at' : 'NULL'}) AS cssu_validated_at`
        : hasCssuExitLogsTable
            ? `latest_cssu_log.validated_at AS cssu_validated_at`
            : `NULL::timestamp AS cssu_validated_at`;
    const cssuValidatedBySelect = hasCssuValidatedByColumn
        ? `ls.cssu_validated_by`
        : `NULL::text AS cssu_validated_by`;
    const cssuValidatedByNameSelect = hasCssuValidatedByColumn && hasCssuExitLogsTable
        ? `COALESCE(cssu_validator.full_name, latest_cssu_validator.full_name) AS cssu_validated_by_name`
        : hasCssuValidatedByColumn
            ? `cssu_validator.full_name AS cssu_validated_by_name`
            : hasCssuExitLogsTable
                ? `latest_cssu_validator.full_name AS cssu_validated_by_name`
                : `NULL::text AS cssu_validated_by_name`;
    const cssuValidationNotesSelect = hasCssuValidationNotesColumn
        ? `COALESCE(ls.cssu_validation_notes, ${hasCssuExitLogsTable ? 'latest_cssu_log.notes' : 'NULL'}) AS cssu_validation_notes`
        : hasCssuExitLogsTable
            ? `latest_cssu_log.notes AS cssu_validation_notes`
            : `NULL::text AS cssu_validation_notes`;

    const { rows } = await pool.query(
        `SELECT
            ls.id,
            ls.faculty_user_id,
            ls.destination,
            ls.purpose_of_travel,
            ls.custom_purpose,
            ls.departure_datetime,
            ls.expected_return_datetime,
            ls.status,
            ${tripStatusSelect},
            ${hasCompletedAtColumn ? 'ls.completed_at' : 'NULL::timestamp AS completed_at'},
            ${cssuValidationStatusSelect},
            ${cssuValidatedAtSelect},
            ${cssuValidatedBySelect},
            ${cssuValidatedByNameSelect},
            ${cssuValidationNotesSelect},
            ls.approved_at,
            ls.updated_at
         FROM locator_slips ls
         LEFT JOIN LATERAL (
            SELECT
                trip.id AS trip_id,
                CASE
                    WHEN ${tripCompletionCheck} THEN 'completed'
                    ELSE trip.status
                END AS trip_status
            FROM trips trip
            WHERE trip.user_id = ls.faculty_user_id
              AND (
                ${hasTripsLocatorSlipIdColumn
                    ? `trip.locator_slip_id = ls.id
                       OR (
                            trip.locator_slip_id IS NULL
                            AND ABS(EXTRACT(EPOCH FROM (COALESCE(ls.departure_datetime, ls.created_at) - COALESCE(trip.started_at, trip.created_at)))) <= ${LOCATOR_SLIP_TRIP_FALLBACK_WINDOW_SECONDS}
                        )`
                    : `ABS(EXTRACT(EPOCH FROM (COALESCE(ls.departure_datetime, ls.created_at) - COALESCE(trip.started_at, trip.created_at)))) <= ${LOCATOR_SLIP_TRIP_FALLBACK_WINDOW_SECONDS}`})
            ORDER BY
                CASE
                    WHEN ${tripCompletionCheck} THEN 0
                    ELSE 1
                END,
                ABS(EXTRACT(EPOCH FROM (COALESCE(ls.departure_datetime, ls.created_at) - COALESCE(trip.started_at, trip.created_at)))) ASC,
                COALESCE(${tripRecencyExpression}) DESC
            LIMIT 1
         ) resolved_trip ON TRUE
         ${hasCssuExitLogsTable ? `
         LEFT JOIN LATERAL (
            SELECT log.status, log.notes, log.validated_at, log.validated_by
            FROM cssu_exit_logs log
            WHERE log.locator_slip_id = ls.id
            ORDER BY COALESCE(log.validated_at, log.created_at) DESC, log.id DESC
            LIMIT 1
         ) latest_cssu_log ON TRUE` : ''}
         ${hasCssuValidatedByColumn ? `
         LEFT JOIN faculty_users cssu_validator
           ON cssu_validator.id = ls.cssu_validated_by` : ''}
         ${hasCssuExitLogsTable ? `
         LEFT JOIN faculty_users latest_cssu_validator
           ON latest_cssu_validator.id = latest_cssu_log.validated_by` : ''}
         WHERE ls.faculty_user_id = $1
           AND ls.status = ANY($2::text[])
           AND ls.status <> 'completed'
           AND ${effectiveTripStatusWhere} <> 'completed'
         ORDER BY COALESCE(ls.approved_at, ls.updated_at, ls.created_at) DESC`,
        [facultyUserId, APPROVED_SLIP_STATUSES]
    );

    return rows.map(mapLocatorSlipRow);
};

const getOpenTripForUser = async (facultyUserId, client = pool) => {
    const hasReturnedAtColumn = await getTripsColumnExists('returned_at', client);
    const hasEndedAtColumn = await getTripsColumnExists('ended_at', client);
    const hasTripsLocatorSlipIdColumn = await getTripsLocatorSlipIdColumnExists(client);
    const locatorSlipJoin = hasTripsLocatorSlipIdColumn
        ? 'LEFT JOIN locator_slips ls ON ls.id = trips.locator_slip_id'
        : '';
    const endedFilters = [
        hasReturnedAtColumn ? 'trips.returned_at IS NULL' : null,
        hasEndedAtColumn ? 'trips.ended_at IS NULL' : null,
        hasTripsLocatorSlipIdColumn ? `(ls.id IS NULL OR ls.status <> 'completed')` : null,
    ].filter(Boolean).join(' AND ');
    const { rows } = await client.query(
        `SELECT trips.*
         FROM trips
         ${locatorSlipJoin}
         WHERE trips.user_id = $1
           AND trips.status = ANY($2::text[])
           ${endedFilters ? `AND ${endedFilters}` : ''}
         ORDER BY started_at DESC NULLS LAST, created_at DESC
         LIMIT 1`,
        [facultyUserId, OPEN_TRIP_STATUSES]
    );

    return mapTripRow(rows[0]);
};

const getLocatorSlipForTripAccess = async (facultyUserId, locatorSlipId, client = pool) => {
    const hasTripStatusColumn = await getLocatorSlipTripStatusColumnExists(client);
    const hasDestinationLatColumn = await getLocatorSlipDestinationLatColumnExists(client);
    const hasDestinationLngColumn = await getLocatorSlipDestinationLngColumnExists(client);
    const hasResolutionMethodColumn = await getLocatorSlipDestinationResolutionMethodColumnExists(client);
    const hasCompletedAtColumn = await getLocatorSlipColumnExists('completed_at', client);
    const hasCssuValidationStatusColumn = await getLocatorSlipColumnExists('cssu_validation_status', client);
    const hasCssuValidatedAtColumn = await getLocatorSlipColumnExists('cssu_validated_at', client);
    const hasCssuValidatedByColumn = await getLocatorSlipColumnExists('cssu_validated_by', client);
    const hasCssuValidationNotesColumn = await getLocatorSlipColumnExists('cssu_validation_notes', client);
    const hasCssuExitLogsTable = await getCssuExitLogsTableExists(client);
    const tripStatusSelect = hasTripStatusColumn
        ? `COALESCE(ls.trip_status, 'not_started') AS trip_status`
        : `'not_started' AS trip_status`;
    const destinationLatSelect = hasDestinationLatColumn ? 'ls.destination_lat' : 'NULL::numeric AS destination_lat';
    const destinationLngSelect = hasDestinationLngColumn ? 'ls.destination_lng' : 'NULL::numeric AS destination_lng';
    const resolutionMethodSelect = hasResolutionMethodColumn
        ? 'ls.destination_resolution_method'
        : 'NULL::varchar AS destination_resolution_method';
    const cssuValidationStatusSelect = hasCssuValidationStatusColumn
        ? `CASE
            WHEN COALESCE(ls.cssu_validation_status, '') <> '' THEN ls.cssu_validation_status
            ${hasCssuExitLogsTable ? `
            WHEN latest_cssu_log.status = 'validated' THEN 'allowed'
            WHEN latest_cssu_log.status = 'denied' AND COALESCE(latest_cssu_log.notes, '') LIKE '${CSSU_FLAG_INCIDENT_NOTE_PREFIX}%' THEN 'flagged'
            WHEN latest_cssu_log.status = 'denied' THEN 'denied'` : ''}
            ELSE 'pending'
        END AS cssu_validation_status`
        : hasCssuExitLogsTable
            ? `CASE
                WHEN latest_cssu_log.status = 'validated' THEN 'allowed'
                WHEN latest_cssu_log.status = 'denied' AND COALESCE(latest_cssu_log.notes, '') LIKE '${CSSU_FLAG_INCIDENT_NOTE_PREFIX}%' THEN 'flagged'
                WHEN latest_cssu_log.status = 'denied' THEN 'denied'
                ELSE 'pending'
            END AS cssu_validation_status`
            : `'pending' AS cssu_validation_status`;
    const cssuValidatedAtSelect = hasCssuValidatedAtColumn
        ? `COALESCE(ls.cssu_validated_at, ${hasCssuExitLogsTable ? 'latest_cssu_log.validated_at' : 'NULL'}) AS cssu_validated_at`
        : hasCssuExitLogsTable
            ? `latest_cssu_log.validated_at AS cssu_validated_at`
            : `NULL::timestamp AS cssu_validated_at`;
    const cssuValidatedBySelect = hasCssuValidatedByColumn
        ? `ls.cssu_validated_by`
        : `NULL::text AS cssu_validated_by`;
    const cssuValidatedByNameSelect = hasCssuValidatedByColumn && hasCssuExitLogsTable
        ? `COALESCE(cssu_validator.full_name, latest_cssu_validator.full_name) AS cssu_validated_by_name`
        : hasCssuValidatedByColumn
            ? `cssu_validator.full_name AS cssu_validated_by_name`
            : hasCssuExitLogsTable
                ? `latest_cssu_validator.full_name AS cssu_validated_by_name`
                : `NULL::text AS cssu_validated_by_name`;
    const cssuValidationNotesSelect = hasCssuValidationNotesColumn
        ? `COALESCE(ls.cssu_validation_notes, ${hasCssuExitLogsTable ? 'latest_cssu_log.notes' : 'NULL'}) AS cssu_validation_notes`
        : hasCssuExitLogsTable
            ? `latest_cssu_log.notes AS cssu_validation_notes`
            : `NULL::text AS cssu_validation_notes`;

    const { rows } = await client.query(
        `SELECT
            ls.id,
            ls.faculty_user_id,
            ls.destination,
            ${destinationLatSelect},
            ${destinationLngSelect},
            ${resolutionMethodSelect},
            ls.purpose_of_travel,
            ls.custom_purpose,
            ls.departure_datetime,
            ls.expected_return_datetime,
            ls.status,
            ${tripStatusSelect},
            ${hasCompletedAtColumn ? 'ls.completed_at' : 'NULL::timestamp AS completed_at'},
            ${cssuValidationStatusSelect},
            ${cssuValidatedAtSelect},
            ${cssuValidatedBySelect},
            ${cssuValidatedByNameSelect},
            ${cssuValidationNotesSelect},
            ls.approved_at,
            ls.updated_at
         FROM locator_slips ls
         ${hasCssuExitLogsTable ? `
         LEFT JOIN LATERAL (
            SELECT log.status, log.notes, log.validated_at, log.validated_by
            FROM cssu_exit_logs log
            WHERE log.locator_slip_id = ls.id
            ORDER BY COALESCE(log.validated_at, log.created_at) DESC, log.id DESC
            LIMIT 1
         ) latest_cssu_log ON TRUE` : ''}
         ${hasCssuValidatedByColumn ? `
         LEFT JOIN faculty_users cssu_validator
           ON cssu_validator.id = ls.cssu_validated_by` : ''}
         ${hasCssuExitLogsTable ? `
         LEFT JOIN faculty_users latest_cssu_validator
           ON latest_cssu_validator.id = latest_cssu_log.validated_by` : ''}
         WHERE ls.id = $1
           AND ls.faculty_user_id = $2
         LIMIT 1`,
        [locatorSlipId, facultyUserId]
    );

    return rows[0] ? mapLocatorSlipRow(rows[0]) : null;
};

const getCurrentTripForLocatorSlip = async (facultyUserId, locatorSlipId, client = pool) => {
    const hasTripsLocatorSlipIdColumn = await getTripsLocatorSlipIdColumnExists(client);

    if (!hasTripsLocatorSlipIdColumn) {
        return null;
    }

    const { rows } = await client.query(
        `SELECT *
         FROM trips
         WHERE locator_slip_id = $1
           AND user_id = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [locatorSlipId, facultyUserId]
    );

    return mapTripRow(rows[0]);
};

const getLatestArrivalVerification = async (tripId, client = pool) => {
    const hasArrivalVerificationsTable = await getArrivalVerificationsTableExists(client);

    if (!hasArrivalVerificationsTable) {
        return null;
    }

    const { rows } = await client.query(
        `SELECT
            id,
            trip_id,
            locator_slip_id,
            faculty_user_id,
            image_url,
            image_public_id,
            status,
            verified_at,
            created_at,
            updated_at
         FROM arrival_verifications
         WHERE trip_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [tripId]
    );

    return rows[0] || null;
};

const getLatestLocatorSlipLocationVerification = async (locatorSlipId, facultyUserId, client = pool) => {
    const hasLocationVerificationTable = await getLocatorSlipLocationVerificationsTableExists(client);

    if (!hasLocationVerificationTable || !locatorSlipId) {
        return null;
    }

    const { rows } = await client.query(
        `SELECT
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
         LIMIT 1`,
        [locatorSlipId, facultyUserId]
    );

    return rows[0] || null;
};

const updateLocatorSlipDestination = async (facultyUserId, locatorSlipId, payload, client = pool) => {
    const hasTripStatusColumn = await getLocatorSlipTripStatusColumnExists(client);
    const hasDestinationLatColumn = await getLocatorSlipDestinationLatColumnExists(client);
    const hasDestinationLngColumn = await getLocatorSlipDestinationLngColumnExists(client);
    const hasResolutionMethodColumn = await getLocatorSlipDestinationResolutionMethodColumnExists(client);
    const tripStatusSelect = hasTripStatusColumn
        ? `COALESCE(trip_status, 'not_started') AS trip_status`
        : `'not_started' AS trip_status`;
    const destinationLatSelect = hasDestinationLatColumn ? 'destination_lat' : 'NULL::numeric AS destination_lat';
    const destinationLngSelect = hasDestinationLngColumn ? 'destination_lng' : 'NULL::numeric AS destination_lng';
    const resolutionMethodSelect = hasResolutionMethodColumn
        ? 'destination_resolution_method'
        : 'NULL::varchar AS destination_resolution_method';

    if (!hasDestinationLatColumn || !hasDestinationLngColumn || !hasResolutionMethodColumn) {
        return getLocatorSlipForTripAccess(facultyUserId, locatorSlipId, client);
    }

    const { rows } = await client.query(
        `UPDATE locator_slips
         SET destination = COALESCE($3, destination),
            destination_lat = $4,
             destination_lng = $5,
             destination_resolution_method = $6,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND faculty_user_id = $2
         RETURNING
            id,
            faculty_user_id,
            destination,
            ${destinationLatSelect},
            ${destinationLngSelect},
            ${resolutionMethodSelect},
            purpose_of_travel,
            custom_purpose,
            departure_datetime,
            expected_return_datetime,
            status,
            ${tripStatusSelect},
            approved_at,
            updated_at`,
        [
            locatorSlipId,
            facultyUserId,
            payload.destinationLabel || null,
            payload.lat,
            payload.lng,
            payload.method
        ]
    );

    return rows[0] ? mapLocatorSlipRow(rows[0]) : null;
};

const updateLocatorSlipTripStatus = async (locatorSlipId, status, client = pool) => {
    const hasTripStatusColumn = await getLocatorSlipTripStatusColumnExists(client);
    if (!hasTripStatusColumn) {
        return;
    }

    await client.query(
        `UPDATE locator_slips
         SET trip_status = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [locatorSlipId, status]
    );
};

const updateLocatorSlipLifecycle = async (locatorSlipId, values = {}, client = pool) => {
    const assignments = [];
    const params = [locatorSlipId];
    let index = 2;

    for (const [column, value] of Object.entries(values)) {
        if (column !== 'status') {
            const columnExists = await getLocatorSlipColumnExists(column, client);
            if (!columnExists) {
                continue;
            }
        }

        assignments.push(`${column} = $${index}`);
        params.push(value);
        index += 1;
    }

    if (assignments.length === 0) {
        return null;
    }

    assignments.push('updated_at = CURRENT_TIMESTAMP');

    const { rows } = await client.query(
        `UPDATE locator_slips
         SET ${assignments.join(', ')}
         WHERE id = $1
         RETURNING *`,
        params
    );

    return rows[0] || null;
};

const getBlockingTripForLocatorSlip = async (locatorSlipId, facultyUserId, client = pool) => {
    const hasTripsLocatorSlipIdColumn = await getTripsLocatorSlipIdColumnExists(client);
    const hasReturnedAtColumn = await getTripsColumnExists('returned_at', client);
    const hasEndedAtColumn = await getTripsColumnExists('ended_at', client);
    const tripCompletionCheck = [
        hasReturnedAtColumn ? 'trip.returned_at IS NOT NULL' : null,
        hasEndedAtColumn ? 'trip.ended_at IS NOT NULL' : null,
        `trip.status = 'completed'`
    ].filter(Boolean).join(' OR ');
    const blockingStatusClause = [
        `trip.status = ANY($3::text[])`,
        hasReturnedAtColumn ? 'trip.returned_at IS NOT NULL' : null,
        hasEndedAtColumn ? 'trip.ended_at IS NOT NULL' : null
    ].filter(Boolean).join(' OR ');
    const tripRecencyExpression = [
        hasEndedAtColumn ? 'trip.ended_at' : null,
        hasReturnedAtColumn ? 'trip.returned_at' : null,
        'trip.started_at',
        'trip.created_at'
    ].filter(Boolean).join(', ');

    const { rows } = await client.query(
        `SELECT
            trip.*,
            CASE
                WHEN ${tripCompletionCheck} THEN 'completed'
                ELSE trip.status
            END AS resolved_status
         FROM trips trip
         JOIN locator_slips ls ON ls.id = $1
         WHERE trip.user_id = $2
           AND (${blockingStatusClause})
           AND (
                ${hasTripsLocatorSlipIdColumn
                    ? `trip.locator_slip_id = ls.id
                       OR (
                            trip.locator_slip_id IS NULL
                            AND ABS(EXTRACT(EPOCH FROM (COALESCE(ls.departure_datetime, ls.created_at) - COALESCE(trip.started_at, trip.created_at)))) <= ${LOCATOR_SLIP_TRIP_FALLBACK_WINDOW_SECONDS}
                            AND COALESCE(trip.started_at, trip.created_at) >= ls.created_at
                            AND NOT (ls.status IN ('approved', 'verified', 'pending') AND (${tripCompletionCheck}))
                        )`
                    : `ABS(EXTRACT(EPOCH FROM (COALESCE(ls.departure_datetime, ls.created_at) - COALESCE(trip.started_at, trip.created_at)))) <= ${LOCATOR_SLIP_TRIP_FALLBACK_WINDOW_SECONDS}
                       AND COALESCE(trip.started_at, trip.created_at) >= ls.created_at
                       AND NOT (ls.status IN ('approved', 'verified', 'pending') AND (${tripCompletionCheck}))`})
         ORDER BY
            CASE
                WHEN ${tripCompletionCheck} THEN 1
                ELSE 0
            END,
            COALESCE(${tripRecencyExpression}) DESC
         LIMIT 1`,
        [locatorSlipId, facultyUserId, [...OPEN_TRIP_STATUSES, 'completed']]
    );

    if (!rows[0]) return null;

    const trip = mapTripRow(rows[0]);
    if (!trip) return null;

    return {
        ...trip,
        status: rows[0].resolved_status || trip.status
    };
};

const insertTrip = async (payload, client = pool) => {
    const hasTripsLocatorSlipIdColumn = await getTripsLocatorSlipIdColumnExists(client);
    const hasOutboundDistanceColumn = await getTripsColumnExists('outbound_distance_meters', client);
    const columns = [];
    const values = [];

    if (hasTripsLocatorSlipIdColumn) {
        columns.push('locator_slip_id');
        values.push(payload.locatorSlipId);
    }

    columns.push(
        'user_id',
        'origin_lng',
        'origin_lat',
        'destination_lng',
        'destination_lat',
        'destination_name',
        'route_geometry',
        'route_distance_meters',
        'route_duration_seconds'
    );
    values.push(
        payload.facultyUserId,
        payload.origin.lng,
        payload.origin.lat,
        payload.destination.lng,
        payload.destination.lat,
        payload.destination.name,
        JSON.stringify(payload.routeGeometry || null),
        payload.routeDistanceMeters,
        payload.routeDurationSeconds
    );

    if (hasOutboundDistanceColumn) {
        columns.push('outbound_distance_meters');
        values.push(payload.outboundDistanceMeters);
    }

    columns.push('status', 'started_at');
    const placeholders = columns.map((_, index) => `$${index + 1}`);
    values.push('active', new Date());

    const { rows } = await client.query(
        `INSERT INTO trips (${columns.join(', ')})
         VALUES (${placeholders.join(', ')})
         RETURNING *`,
        values
    );

    return mapTripRow(rows[0]);
};

const updateTripLifecycle = async (tripId, facultyUserId, values, client = pool) => {
    const assignments = [];
    const params = [tripId, facultyUserId];
    let index = 3;

    const entries = Object.entries(values);
    for (const [column, value] of entries) {
        const columnExists = await getTripsColumnExists(column, client);
        if (!columnExists) {
            continue;
        }
        assignments.push(`${column} = $${index}`);
        params.push(value);
        index += 1;
    }

    if (assignments.length === 0) {
        const { rows } = await client.query(
            `SELECT *
             FROM trips
             WHERE id = $1
               AND user_id = $2
             LIMIT 1`,
            [tripId, facultyUserId]
        );

        return mapTripRow(rows[0]);
    }

    assignments.push(`updated_at = CURRENT_TIMESTAMP`);

    const { rows } = await client.query(
        `UPDATE trips
         SET ${assignments.join(', ')}
         WHERE id = $1
           AND user_id = $2
         RETURNING *`,
        params
    );

    return mapTripRow(rows[0]);
};

const insertArrivalVerification = async (payload, client = pool) => {
    const hasArrivalVerificationsTable = await getArrivalVerificationsTableExists(client);

    if (!hasArrivalVerificationsTable) {
        return {
            id: null,
            trip_id: payload.tripId,
            locator_slip_id: payload.locatorSlipId,
            faculty_user_id: payload.facultyUserId,
            image_url: payload.imageUrl,
            image_public_id: payload.imagePublicId,
            status: payload.status,
            verified_at: payload.verifiedAt,
            created_at: payload.verifiedAt,
            updated_at: payload.verifiedAt
        };
    }

    const { rows } = await client.query(
        `INSERT INTO arrival_verifications (
            trip_id,
            locator_slip_id,
            faculty_user_id,
            image_url,
            image_public_id,
            status,
            verified_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
            payload.tripId,
            payload.locatorSlipId,
            payload.facultyUserId,
            payload.imageUrl,
            payload.imagePublicId,
            payload.status,
            payload.verifiedAt
        ]
    );

    return rows[0];
};

const mirrorLocatorSlipLocationVerification = async (payload, client = pool) => {
    const { rows } = await client.query(
        `INSERT INTO locator_slip_location_verifications (
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
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
            payload.locatorSlipId,
            payload.facultyUserId,
            payload.targetLocation,
            payload.imageUrl,
            payload.imagePublicId,
            payload.mimeType,
            payload.fileSize,
            payload.originalFileSize,
            payload.imageWidth,
            payload.imageHeight,
            payload.status
        ]
    );

    return rows[0] || null;
};

const getTripSummaryRow = async (tripId, facultyUserId) => {
    const hasTripsLocatorSlipIdColumn = await getTripsLocatorSlipIdColumnExists();
    if (!hasTripsLocatorSlipIdColumn) {
        const { rows } = await pool.query(
            `SELECT
                t.*,
                fallback_ls.id AS locator_slip_id,
                fallback_ls.destination,
                fallback_ls.purpose_of_travel,
                fallback_ls.custom_purpose,
                fallback_ls.departure_datetime,
                fallback_ls.expected_return_datetime
             FROM trips t
             LEFT JOIN LATERAL (
                SELECT
                    ls.id,
                    ls.destination,
                    ls.purpose_of_travel,
                    ls.custom_purpose,
                    ls.departure_datetime,
                    ls.expected_return_datetime
                FROM locator_slips ls
                WHERE ls.faculty_user_id = t.user_id
                  AND ls.status IN ('approved', 'verified', 'completed')
                ORDER BY
                    CASE WHEN ls.status = 'completed' AND t.status != 'completed' AND t.status != 'cancelled' THEN 1 ELSE 0 END ASC,
                    ABS(EXTRACT(EPOCH FROM (COALESCE(ls.departure_datetime, ls.created_at) - COALESCE(t.started_at, ls.created_at)))) ASC,
                    COALESCE(ls.departure_datetime, ls.created_at) DESC
                LIMIT 1
             ) fallback_ls ON TRUE
             WHERE t.id = $1
               AND t.user_id = $2
             LIMIT 1`,
            [tripId, facultyUserId]
        );

        return rows[0] || null;
    }

    const { rows } = await pool.query(
        `SELECT
            t.*,
            ls.destination,
            ls.purpose_of_travel,
            ls.custom_purpose,
            ls.departure_datetime,
            ls.expected_return_datetime
         FROM trips t
         JOIN locator_slips ls ON ls.id = t.locator_slip_id
         WHERE t.id = $1
           AND t.user_id = $2
         LIMIT 1`,
        [tripId, facultyUserId]
    );

    return rows[0] || null;
};

module.exports = {
    APPROVED_SLIP_STATUSES,
    OPEN_TRIP_STATUSES,
    getArrivalVerificationsTableExists,
    getTripsSupportsStatusValue,
    getApprovedLocatorSlips,
    getOpenTripForUser,
    getLocatorSlipForTripAccess,
    getCurrentTripForLocatorSlip,
    getBlockingTripForLocatorSlip,
    getLatestArrivalVerification,
    getLatestLocatorSlipLocationVerification,
    updateLocatorSlipDestination,
    updateLocatorSlipTripStatus,
    updateLocatorSlipLifecycle,
    insertTrip,
    updateTripLifecycle,
    insertArrivalVerification,
    mirrorLocatorSlipLocationVerification,
    getTripSummaryRow
};
