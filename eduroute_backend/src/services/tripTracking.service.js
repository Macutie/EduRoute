const pool = require('../db/pool');
const AppError = require('../utils/appError');
const mapboxService = require('./mapbox.service');
const tripRepository = require('../repositories/tripTracking.repository');
const socketBroadcasterService = require('./socketBroadcaster.service');
const tripIncidentService = require('./tripIncident.service');

const VALID_END_STATUSES = new Set(['completed', 'cancelled']);

const validateLocationUpdate = (payload) => {
    const tripId = String(payload.tripId || '').trim();
    const userId = String(payload.userId || payload.facultyUserId || '').trim();
    const lng = Number(payload.lng);
    const lat = Number(payload.lat);
    const speed = payload.speed === null || payload.speed === undefined ? null : Number(payload.speed);
    const heading = payload.heading === null || payload.heading === undefined ? null : Number(payload.heading);
    const recordedAt = payload.recordedAt ? new Date(payload.recordedAt) : payload.timestamp ? new Date(payload.timestamp) : new Date();

    if (!tripId) throw new AppError('Trip ID is required for live tracking.', 422);
    if (!userId) throw new AppError('User ID is required for live tracking.', 422);
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new AppError('Longitude is invalid.', 422);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new AppError('Latitude is invalid.', 422);
    if (speed !== null && !Number.isFinite(speed)) throw new AppError('Speed is invalid.', 422);
    if (heading !== null && !Number.isFinite(heading)) throw new AppError('Heading is invalid.', 422);
    if (Number.isNaN(recordedAt.getTime())) throw new AppError('Timestamp is invalid.', 422);

    return { tripId, userId, lng, lat, speed, heading, recordedAt };
};

const buildLocationSubtitle = (trip) => `Near ${trip?.destination?.name || trip?.destination_name || trip?.destination?.label || 'Olongapo City'}`;

const searchDestinations = async (query) => mapboxService.searchDestinations(query, {
    limit: 6,
    language: 'en',
    country: 'PH',
    types: mapboxService.DEFAULT_GEOCODING_TYPES
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
        const approvedLocatorSlip = await tripRepository.findApprovedLocatorSlipForTripStart(
            client,
            userId,
            destinationName
        );

        if (!approvedLocatorSlip) {
            throw new AppError(
                'An approved locator slip is required before starting a trip.',
                409
            );
        }

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
        await tripRepository.insertTripEvent(client, {
            tripId: trip.id,
            userId,
            eventType: 'trip_started',
            title: 'Trip started',
            subtitle: `Destination: ${destinationName}`,
            metadata: {
                destinationName
            },
            occurredAt: trip.started_at || new Date()
        }).catch(() => null);
        await client.query('COMMIT');

        await socketBroadcasterService.broadcastHrmuDashboardUpdate().catch((broadcastError) => {
            console.error('Failed to broadcast HRMU dashboard update after trip start:', broadcastError);
        });
        await socketBroadcasterService.broadcastHrmuLiveLocationUpdate().catch((broadcastError) => {
            console.error('Failed to broadcast HRMU live faculty snapshot after trip start:', broadcastError);
        });
        await socketBroadcasterService.broadcastHrmuLiveActivityUpdate({
            facultyUserId: userId,
            tripId: trip.id
        }).catch((broadcastError) => {
            console.error('Failed to broadcast HRMU live activity after trip start:', broadcastError);
        });

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

    const client = await pool.connect();
    try {
        await tripRepository.insertTripEvent(client, {
            tripId: trip.id,
            userId,
            eventType: nextStatus === 'completed' ? 'trip_completed' : 'trip_cancelled',
            title: nextStatus === 'completed' ? 'Trip completed' : 'Trip cancelled',
            subtitle: `Status updated to ${nextStatus}.`,
            metadata: {
                status: nextStatus
            },
            occurredAt: trip.ended_at || new Date()
        }).catch(() => null);
    } finally {
        client.release();
    }

    await socketBroadcasterService.broadcastHrmuDashboardUpdate().catch((broadcastError) => {
        console.error('Failed to broadcast HRMU dashboard update after trip end:', broadcastError);
    });
    await socketBroadcasterService.broadcastHrmuLiveLocationUpdate().catch((broadcastError) => {
        console.error('Failed to broadcast HRMU live faculty snapshot after trip end:', broadcastError);
    });
    await socketBroadcasterService.broadcastHrmuLiveActivityUpdate({
        facultyUserId: userId,
        tripId: trip.id
    }).catch((broadcastError) => {
        console.error('Failed to broadcast HRMU live activity after trip end:', broadcastError);
    });
    await tripIncidentService.evaluateTripIncidents(trip.id).catch((incidentError) => {
        console.error('Failed to evaluate trip incidents after trip end:', incidentError);
    });

    return trip;
};

const recordLiveLocation = async (socketUserId, payload) => {
    const update = validateLocationUpdate(payload);

    if (update.userId !== socketUserId) {
        throw new AppError('Location update user does not match the authenticated socket user.', 403);
    }

    const trip = await tripRepository.findTripByIdForUser(update.tripId, socketUserId);

    if (!trip || !['active', 'arrived', 'returning'].includes(trip.status)) {
        throw new AppError('Open trip not found for this location update.', 404);
    }

    await tripRepository.appendLocationUpdate(update);

    const client = await pool.connect();
    try {
        await tripRepository.insertTripEvent(client, {
            tripId: update.tripId,
            userId: update.userId,
            eventType: 'location_update',
            title: 'Location updated',
            subtitle: buildLocationSubtitle(trip),
            metadata: {
                lng: update.lng,
                lat: update.lat,
                speed: update.speed,
                heading: update.heading
            },
            occurredAt: update.recordedAt
        }).catch(() => null);
    } finally {
        client.release();
    }
    const payloadResponse = {
        tripId: update.tripId,
        facultyUserId: update.userId,
        userId: update.userId,
        lng: update.lng,
        lat: update.lat,
        speed: update.speed,
        heading: update.heading,
        recordedAt: update.recordedAt.toISOString(),
        timestamp: update.recordedAt.toISOString()
    };

    await socketBroadcasterService.broadcastHrmuLiveLocationUpdate(payloadResponse).catch((broadcastError) => {
        console.error('Failed to broadcast HRMU live location update:', broadcastError);
    });

    await socketBroadcasterService.broadcastHrmuLiveActivityUpdate({
        facultyUserId: update.userId,
        tripId: update.tripId
    }).catch((broadcastError) => {
        console.error('Failed to broadcast HRMU live activity update:', broadcastError);
    });

    return payloadResponse;
};

module.exports = {
    searchDestinations,
    previewRoute,
    startTrip,
    getActiveTrip,
    endTrip,
    recordLiveLocation
};
