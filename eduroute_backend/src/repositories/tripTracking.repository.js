const pool = require('../db/pool');

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
           AND status = 'active'
         ORDER BY started_at DESC
         LIMIT 1`,
        [userId]
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

const insertTripEvent = async (client, event) => {
    await client.query(
        `INSERT INTO trip_location_logs (
            trip_id,
            user_id,
            lng,
            lat,
            speed,
            heading,
            recorded_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [event.tripId, event.userId, event.lng, event.lat, event.speed, event.heading, event.recordedAt]
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
        await insertTripEvent(client, payload);
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    findActiveTripByUserId,
    findTripByIdForUser,
    cancelExistingActiveTrips,
    insertTrip,
    updateTripStatus,
    appendLocationUpdate
};
