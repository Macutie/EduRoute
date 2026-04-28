const pool = require('../db/pool');
const AppError = require('../utils/appError');
const mapboxService = require('./mapbox.service');

const formatTrip = (row) => ({
    id: row.id,
    faculty_user_id: row.faculty_user_id,
    origin: {
        lat: Number(row.origin_latitude),
        lng: Number(row.origin_longitude),
        latitude: Number(row.origin_latitude),
        longitude: Number(row.origin_longitude)
    },
    destination: {
        lat: Number(row.destination_latitude),
        lng: Number(row.destination_longitude),
        latitude: Number(row.destination_latitude),
        longitude: Number(row.destination_longitude),
        name: row.destination_name
    },
    route_geometry: row.route_geometry,
    distance_meters: row.distance_meters === null ? null : Number(row.distance_meters),
    duration_seconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
    status: row.status,
    started_at: row.started_at,
    ended_at: row.ended_at,
    created_at: row.created_at,
    updated_at: row.updated_at
});

const getActiveTrip = async (facultyUserId) => {
    const { rows } = await pool.query(
        `SELECT *
         FROM faculty_trips
         WHERE faculty_user_id = $1
           AND status = 'active'
         ORDER BY started_at DESC
         LIMIT 1`,
        [facultyUserId]
    );

    return rows[0] ? formatTrip(rows[0]) : null;
};

const startTrip = async (facultyUserId, payload) => {
    const origin = mapboxService.assertCoordinate(payload.origin, 'Origin');
    const destination = mapboxService.assertCoordinate(payload.destination, 'Destination');
    const destinationName = String(payload.destination?.name || payload.destination_name || '').trim();

    if (!destinationName) {
        throw new AppError('Destination name is required.', 422);
    }

    const route = await mapboxService.getDirections({
        origin,
        destination,
        profile: payload.profile,
        alternatives: Boolean(payload.alternatives)
    });

    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const approvedSlipResult = await client.query(
            `SELECT ls.id
             FROM locator_slips ls
             WHERE ls.faculty_user_id = $1
               AND ls.status = 'approved'
               AND ls.expected_return_datetime >= CURRENT_TIMESTAMP
             ORDER BY
                CASE
                    WHEN LOWER(TRIM(COALESCE(ls.destination, ''))) = LOWER(TRIM($2)) THEN 0
                    ELSE 1
                END,
                ABS(EXTRACT(EPOCH FROM (ls.departure_datetime - CURRENT_TIMESTAMP))) ASC,
                COALESCE(ls.approved_at, ls.updated_at, ls.created_at) DESC
             LIMIT 1`,
            [facultyUserId, destinationName]
        );

        if (approvedSlipResult.rowCount === 0) {
            throw new AppError('An approved locator slip is required before starting a trip.', 409);
        }

        await client.query(
            `UPDATE faculty_trips
             SET status = 'cancelled',
                 ended_at = CURRENT_TIMESTAMP
             WHERE faculty_user_id = $1
               AND status = 'active'`,
            [facultyUserId]
        );

        const { rows } = await client.query(
            `INSERT INTO faculty_trips (
                faculty_user_id,
                origin_latitude,
                origin_longitude,
                destination_latitude,
                destination_longitude,
                destination_name,
                route_geometry,
                distance_meters,
                duration_seconds,
                status
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
             RETURNING *`,
            [
                facultyUserId,
                origin.lat,
                origin.lng,
                destination.lat,
                destination.lng,
                destinationName,
                JSON.stringify(route.geometry),
                route.distance_meters,
                route.duration_seconds
            ]
        );

        await client.query(
            `INSERT INTO faculty_trip_events (trip_id, faculty_user_id, event_type, event_payload)
             VALUES ($1, $2, 'started', $3)`,
            [rows[0].id, facultyUserId, JSON.stringify({ destination_name: destinationName })]
        );

        await client.query('COMMIT');

        return {
            trip: formatTrip(rows[0]),
            route
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

const endTrip = async (facultyUserId, tripId, status = 'completed') => {
    if (!['completed', 'cancelled'].includes(status)) {
        throw new AppError('Trip end status is invalid.', 422);
    }

    const { rows, rowCount } = await pool.query(
        `UPDATE faculty_trips
         SET status = $3,
             ended_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND faculty_user_id = $2
           AND status = 'active'
         RETURNING *`,
        [tripId, facultyUserId, status]
    );

    if (rowCount === 0) {
        throw new AppError('Active trip not found.', 404);
    }

    await pool.query(
        `INSERT INTO faculty_trip_events (trip_id, faculty_user_id, event_type, event_payload)
         VALUES ($1, $2, $3, $4)`,
        [tripId, facultyUserId, status === 'completed' ? 'ended' : 'cancelled', JSON.stringify({ status })]
    );

    return formatTrip(rows[0]);
};

module.exports = {
    getActiveTrip,
    startTrip,
    endTrip
};
