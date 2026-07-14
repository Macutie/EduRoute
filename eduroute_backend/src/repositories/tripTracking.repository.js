const pool = require('../db/pool');
let tripEventsTableExistsCache = null;

const mapTripRow = (row) => ({
    id: row.id,
    user_id: row.user_id,
    origin: {
        lng: Number(row.origin_lng),
        lat: Number(row.origin_lat)
    },
    destination: {
        lng: Number(row.destination_lng),
        lat: Number(row.destination_lat),
        name: row.destination_name
    },
    route_geometry: row.route_geometry,
    route_distance_meters: row.route_distance_meters === null ? null : Number(row.route_distance_meters),
    route_duration_seconds: row.route_duration_seconds === null ? null : Number(row.route_duration_seconds),
    status: row.status,
    started_at: row.started_at,
    ended_at: row.ended_at,
    created_at: row.created_at,
    updated_at: row.updated_at
});

const findActiveTripByUserId = async (userId) => {
    const { rows } = await pool.query(
        `SELECT *
         FROM trips
         WHERE user_id = $1
           AND status = ANY($2::text[])
         ORDER BY started_at DESC
         LIMIT 1`,
        [userId, ['active', 'arrived', 'returning']]
    );

    return rows[0] ? mapTripRow(rows[0]) : null;
};

const findTripByIdForUser = async (tripId, userId) => {
    const { rows } = await pool.query(
        `SELECT *
         FROM trips
         WHERE id = $1
           AND user_id = $2
         LIMIT 1`,
        [tripId, userId]
    );

    return rows[0] ? mapTripRow(rows[0]) : null;
};

const findTripByIdWithFaculty = async (tripId) => {
    const { rows } = await pool.query(
        `SELECT
            t.*,
            fu.full_name AS faculty_name,
            fu.email AS faculty_email,
            fu.department_id AS faculty_department_id,
            COALESCE(ls.college_id, fu.department_id) AS college_id,
            d.department_name AS college_name,
            ls.id AS locator_slip_id,
            ls.destination AS locator_destination,
            ls.purpose_of_travel,
            ls.custom_purpose,
            ls.departure_datetime,
            ls.expected_return_datetime
         FROM trips t
         JOIN faculty_users fu ON fu.id = t.user_id
         LEFT JOIN departments d ON d.id = fu.department_id
         LEFT JOIN locator_slips ls ON ls.id = t.locator_slip_id
         WHERE t.id = $1
         LIMIT 1`,
        [tripId]
    );

    return rows[0] || null;
};

const findApprovedLocatorSlipForTripStart = async (client, userId, destinationName) => {
    const normalizedDestination = String(destinationName || '').trim().toLowerCase();
    const { rows } = await client.query(
        `SELECT
            ls.id,
            ls.destination,
            ls.departure_datetime,
            ls.expected_return_datetime,
            ls.status
         FROM locator_slips ls
         WHERE ls.faculty_user_id = $1
           AND ls.status = 'approved'
           AND ls.expected_return_datetime >= CURRENT_TIMESTAMP
         ORDER BY
            CASE
                WHEN LOWER(TRIM(COALESCE(ls.destination, ''))) = $2 THEN 0
                ELSE 1
            END,
            ABS(EXTRACT(EPOCH FROM (ls.departure_datetime - CURRENT_TIMESTAMP))) ASC,
            COALESCE(ls.approved_at, ls.updated_at, ls.created_at) DESC
         LIMIT 1`,
        [userId, normalizedDestination]
    );

    return rows[0] || null;
};

const cancelExistingActiveTrips = async (client, userId) => {
    await client.query(
        `UPDATE trips
         SET status = 'cancelled',
             ended_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1
           AND status = 'active'`,
        [userId]
    );
};

const insertTrip = async (client, payload) => {
    const { rows } = await client.query(
        `INSERT INTO trips (
            user_id,
            origin_lng,
            origin_lat,
            destination_lng,
            destination_lat,
            destination_name,
            route_geometry,
            route_distance_meters,
            route_duration_seconds,
            status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
         RETURNING *`,
        [
            payload.userId,
            payload.origin.lng,
            payload.origin.lat,
            payload.destination.lng,
            payload.destination.lat,
            payload.destination.name,
            JSON.stringify(payload.routeGeometry),
            payload.distanceMeters,
            payload.durationSeconds
        ]
    );

    return mapTripRow(rows[0]);
};

const updateTripStatus = async (tripId, userId, status) => {
    const { rows } = await pool.query(
        `UPDATE trips
         SET status = $3,
             ended_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND user_id = $2
           AND status = 'active'
         RETURNING *`,
        [tripId, userId, status]
    );

    return rows[0] ? mapTripRow(rows[0]) : null;
};

const insertTripLocationLog = async (client, event) => {
    await client.query(
        `INSERT INTO trip_location_logs (
            trip_id,
            user_id,
            lng,
            lat,
            accuracy,
            speed,
            heading,
            recorded_at,
            source,
            sync_status
         )
         SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
         WHERE NOT EXISTS (
            SELECT 1
            FROM trip_location_logs
            WHERE trip_id = $1
              AND lng = $3
              AND lat = $4
              AND recorded_at = $8
         )`,
        [
            event.tripId,
            event.userId,
            event.lng,
            event.lat,
            event.accuracy,
            event.speed,
            event.heading,
            event.recordedAt,
            event.source || 'gps',
            event.syncStatus || event.sync_status || 'synced'
        ]
    );
};

const upsertLatestLocation = async (client, latestLocation) => {
    await client.query(
        `INSERT INTO latest_locations (
            trip_id,
            user_id,
            lng,
            lat,
            speed,
            heading,
            recorded_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (trip_id)
         DO UPDATE SET
            user_id = EXCLUDED.user_id,
            lng = EXCLUDED.lng,
            lat = EXCLUDED.lat,
            speed = EXCLUDED.speed,
            heading = EXCLUDED.heading,
            recorded_at = EXCLUDED.recorded_at`,
        [
            latestLocation.tripId,
            latestLocation.userId,
            latestLocation.lng,
            latestLocation.lat,
            latestLocation.speed,
            latestLocation.heading,
            latestLocation.recordedAt
        ]
    );
};

const appendLocationUpdate = async (payload) => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        await upsertLatestLocation(client, payload);
        await insertTripLocationLog(client, payload);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

const seedTripStartLocation = async (client, payload) => {
    await upsertLatestLocation(client, payload);
    await insertTripLocationLog(client, payload);
};

const appendLocationUpdates = async (updates = []) => {
    if (!updates.length) {
        return;
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        for (const update of updates) {
            await upsertLatestLocation(client, update);
            await insertTripLocationLog(client, update);
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

const getTripLocationLogsByTripId = async (tripId) => {
    const { rows } = await pool.query(
        `SELECT
            id,
            trip_id,
            user_id,
            lng,
            lat,
            accuracy,
            speed,
            heading,
            recorded_at,
            source,
            sync_status,
            created_at
         FROM trip_location_logs
         WHERE trip_id = $1
         ORDER BY recorded_at ASC, created_at ASC`,
        [tripId]
    );

    return rows;
};

const getTripEventsByTripId = async (tripId) => {
    const { rows: tableRows } = await pool.query(`SELECT to_regclass('public.trip_events') AS table_name`);
    if (!tableRows[0]?.table_name) {
        return [];
    }

    const { rows } = await pool.query(
        `SELECT
            id,
            trip_id,
            faculty_user_id,
            event_type,
            title,
            subtitle,
            metadata,
            occurred_at,
            created_at
         FROM trip_events
         WHERE trip_id = $1
         ORDER BY occurred_at ASC, created_at ASC`,
        [tripId]
    );

    return rows;
};

const getTripEventsTableExists = async (client = pool) => {
    if (tripEventsTableExistsCache !== null) {
        return tripEventsTableExistsCache;
    }

    const { rows } = await client.query(`SELECT to_regclass('public.trip_events') AS table_name`);
    tripEventsTableExistsCache = Boolean(rows[0]?.table_name);
    return tripEventsTableExistsCache;
};

const insertTripEvent = async (client, event) => {
    const hasTripEventsTable = await getTripEventsTableExists(client);

    if (!hasTripEventsTable) {
        return null;
    }

    const { rows } = await client.query(
        `INSERT INTO trip_events (
            trip_id,
            faculty_user_id,
            event_type,
            title,
            subtitle,
            metadata,
            occurred_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, trip_id, faculty_user_id, event_type, title, subtitle, metadata, occurred_at, created_at`,
        [
            event.tripId,
            event.userId,
            event.eventType,
            event.title,
            event.subtitle,
            event.metadata ? JSON.stringify(event.metadata) : null,
            event.occurredAt
        ]
    );

    return rows[0] || null;
};

module.exports = {
    findActiveTripByUserId,
    findTripByIdForUser,
    findTripByIdWithFaculty,
    findApprovedLocatorSlipForTripStart,
    cancelExistingActiveTrips,
    insertTrip,
    updateTripStatus,
    seedTripStartLocation,
    appendLocationUpdate,
    appendLocationUpdates,
    getTripLocationLogsByTripId,
    getTripEventsByTripId,
    getTripEventsTableExists,
    insertTripEvent
};
