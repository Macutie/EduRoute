const pool = require('../db/pool');
const AppError = require('../utils/appError');
const mapboxService = require('./mapbox.service');
const tripRepository = require('../repositories/tripTracking.repository');

const VALID_END_STATUSES = new Set(['completed', 'cancelled']);

const validateLocationUpdate = (payload) => {
    const tripId = String(payload.tripId || '').trim();
    const userId = String(payload.userId || '').trim();
    const lng = Number(payload.lng);
    const lat = Number(payload.lat);
    const speed = payload.speed === null || payload.speed === undefined ? null : Number(payload.speed);
    const heading = payload.heading === null || payload.heading === undefined ? null : Number(payload.heading);
    const recordedAt = payload.timestamp ? new Date(payload.timestamp) : new Date();

    if (!tripId) throw new AppError('Trip ID is required for live tracking.', 422);
    if (!userId) throw new AppError('User ID is required for live tracking.', 422);
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new AppError('Longitude is invalid.', 422);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new AppError('Latitude is invalid.', 422);
    if (speed !== null && !Number.isFinite(speed)) throw new AppError('Speed is invalid.', 422);
    if (heading !== null && !Number.isFinite(heading)) throw new AppError('Heading is invalid.', 422);
    if (Number.isNaN(recordedAt.getTime())) throw new AppError('Timestamp is invalid.', 422);

    return { tripId, userId, lng, lat, speed, heading, recordedAt };
};

const searchDestinations = async (query) => mapboxService.searchDestinations(query, {
    limit: 6,
    language: 'en',
    country: 'PH',
    types: 'place,address,poi'
});

const previewRoute = async (payload) => {
    const origin = mapboxService.assertCoordinate(payload.origin, 'Origin');
    const destination = mapboxService.assertCoordinate(payload.destination, 'Destination');

    const route = await mapboxService.getDirections({
        origin,
        destination,
        profile: payload.profile,
        alternatives: Boolean(payload.alternatives)
    });

    return {
        origin,
        destination,
        route
    };
};

const startTrip = async (userId, payload) => {
    const destinationName = String(payload.destination?.name || payload.destination_name || '').trim();

    if (!destinationName) {
        throw new AppError('Destination name is required.', 422);
    }

    const { origin, destination, route } = await previewRoute(payload);
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        await tripRepository.cancelExistingActiveTrips(client, userId);
        const trip = await tripRepository.insertTrip(client, {
            userId,
            origin,
            destination: {
                ...destination,
                name: destinationName
            },
            routeGeometry: route.geometry,
            distanceMeters: route.distance_meters,
            durationSeconds: route.duration_seconds
        });
        await client.query('COMMIT');

        return {
            trip,
            route
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

const getActiveTrip = async (userId) => tripRepository.findActiveTripByUserId(userId);

const endTrip = async (userId, tripId, status) => {
    const nextStatus = VALID_END_STATUSES.has(status) ? status : 'completed';
    const trip = await tripRepository.updateTripStatus(tripId, userId, nextStatus);

    if (!trip) {
        throw new AppError('Active trip not found.', 404);
    }

    return trip;
};

const recordLiveLocation = async (socketUserId, payload) => {
    const update = validateLocationUpdate(payload);

    if (update.userId !== socketUserId) {
        throw new AppError('Location update user does not match the authenticated socket user.', 403);
    }

    const trip = await tripRepository.findTripByIdForUser(update.tripId, socketUserId);

    if (!trip || trip.status !== 'active') {
        throw new AppError('Active trip not found for this location update.', 404);
    }

    await tripRepository.appendLocationUpdate(update);

    return {
        tripId: update.tripId,
        userId: update.userId,
        lng: update.lng,
        lat: update.lat,
        speed: update.speed,
        heading: update.heading,
        timestamp: update.recordedAt.toISOString()
    };
};

module.exports = {
    searchDestinations,
    previewRoute,
    startTrip,
    getActiveTrip,
    endTrip,
    recordLiveLocation
};
