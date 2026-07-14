const pool = require('../db/pool');
const AppError = require('../utils/appError');
const mapboxService = require('./mapbox.service');
const tripRepository = require('../repositories/tripTracking.repository');
const socketBroadcasterService = require('./socketBroadcaster.service');
const tripIncidentService = require('./tripIncident.service');

const VALID_END_STATUSES = new Set(['completed', 'cancelled']);
const OPEN_TRIP_STATUSES = new Set(['active', 'arrived', 'returning']);
const PATH_HISTORY_ROLES = new Set(['hrmu', 'admin']);
const DEAN_PATH_HISTORY_ROLES = new Set(['assistant_dean', 'college_dean']);
const DISCONNECTED_GAP_MINUTES = 15;

const validateLocationUpdate = (payload) => {
    const tripId = String(payload.tripId || '').trim();
    const userId = String(payload.userId || payload.facultyUserId || '').trim();
    const lng = Number(payload.lng ?? payload.longitude);
    const lat = Number(payload.lat ?? payload.latitude);
    const accuracy = payload.accuracy === null || payload.accuracy === undefined ? null : Number(payload.accuracy);
    const speed = payload.speed === null || payload.speed === undefined ? null : Number(payload.speed);
    const heading = payload.heading === null || payload.heading === undefined ? null : Number(payload.heading);
    const recordedAt = payload.recordedAt ? new Date(payload.recordedAt) : payload.timestamp ? new Date(payload.timestamp) : new Date();
    const syncStatus = String(payload.syncStatus || payload.sync_status || 'synced').trim().toLowerCase();

    if (!tripId) throw new AppError('Trip ID is required for live tracking.', 422);
    if (!userId) throw new AppError('User ID is required for live tracking.', 422);
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new AppError('Longitude is invalid.', 422);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new AppError('Latitude is invalid.', 422);
    if (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0)) throw new AppError('Location accuracy is invalid.', 422);
    if (speed !== null && !Number.isFinite(speed)) throw new AppError('Speed is invalid.', 422);
    if (heading !== null && !Number.isFinite(heading)) throw new AppError('Heading is invalid.', 422);
    if (Number.isNaN(recordedAt.getTime())) throw new AppError('Timestamp is invalid.', 422);

    return { tripId, userId, lng, lat, accuracy, speed, heading, recordedAt, source: 'gps', syncStatus: syncStatus || 'synced' };
};

const toIso = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const canDeanViewTripPath = async (requestUser, trip) => {
    if (!DEAN_PATH_HISTORY_ROLES.has(requestUser?.role)) {
        return false;
    }

    const { rows } = await pool.query(
        `SELECT department_id
         FROM faculty_users
         WHERE id = $1
           AND account_role = ANY($2::text[])
           AND status = 'active'
         LIMIT 1`,
        [requestUser.sub, [...DEAN_PATH_HISTORY_ROLES]]
    );

    return String(rows[0]?.department_id || '') === String(trip.college_id || trip.faculty_department_id || '');
};

const toRadians = (value) => (Number(value) * Math.PI) / 180;

const getDistanceKm = (left, right) => {
    const leftLat = Number(left?.lat ?? left?.latitude);
    const leftLng = Number(left?.lng ?? left?.longitude);
    const rightLat = Number(right?.lat ?? right?.latitude);
    const rightLng = Number(right?.lng ?? right?.longitude);

    if (![leftLat, leftLng, rightLat, rightLng].every(Number.isFinite)) {
        return 0;
    }

    const earthRadiusKm = 6371;
    const latDelta = toRadians(rightLat - leftLat);
    const lngDelta = toRadians(rightLng - leftLng);
    const startLat = toRadians(leftLat);
    const endLat = toRadians(rightLat);
    const a = Math.sin(latDelta / 2) ** 2
        + Math.cos(startLat) * Math.cos(endLat) * Math.sin(lngDelta / 2) ** 2;

    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const buildPathStatistics = (points, trip) => {
    let estimatedDistanceKm = 0;
    const disconnectedGaps = [];

    for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1];
        const current = points[index];
        estimatedDistanceKm += getDistanceKm(previous, current);

        const previousTime = new Date(previous.recordedAt);
        const currentTime = new Date(current.recordedAt);
        if (!Number.isNaN(previousTime.getTime()) && !Number.isNaN(currentTime.getTime())) {
            const gapMinutes = Math.round((currentTime.getTime() - previousTime.getTime()) / 60000);
            if (gapMinutes > DISCONNECTED_GAP_MINUTES) {
                disconnectedGaps.push({
                    from: previous.recordedAt,
                    to: current.recordedAt,
                    gapMinutes
                });
            }
        }
    }

    const startTime = toIso(trip.started_at) || points[0]?.recordedAt || null;
    const endTime = toIso(trip.ended_at || trip.returned_at) || points[points.length - 1]?.recordedAt || null;
    const startDate = startTime ? new Date(startTime) : null;
    const endDate = endTime ? new Date(endTime) : null;
    const durationMinutes = startDate && endDate && !Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())
        ? Math.max(Math.round((endDate.getTime() - startDate.getTime()) / 60000), 0)
        : null;

    return {
        totalPoints: points.length,
        startTime,
        endTime,
        durationMinutes,
        estimatedDistanceKm: Number(estimatedDistanceKm.toFixed(2)),
        lastLocationUpdate: points[points.length - 1]?.recordedAt || null,
        disconnectedGaps
    };
};

const normalizeTripStepEvents = (events = []) => {
    const eventMap = new Map();

    for (const event of events) {
        const type = String(event.event_type || '').toLowerCase();
        if (!eventMap.has(type)) {
            eventMap.set(type, event);
        }
    }

    return eventMap;
};

const createTimelineStep = ({ key, label, description, timestamp, status, source }) => ({
    key,
    label,
    description,
    timestamp: toIso(timestamp),
    status,
    source
});

const buildTripStepTimeline = (events, trip) => {
    const eventMap = normalizeTripStepEvents(events);
    const startedEvent = eventMap.get('trip_started');
    const arrivedEvent = eventMap.get('arrival_marked');
    const arrivalVerifiedEvent = eventMap.get('arrival_verified');
    const returningEvent = eventMap.get('return_started');
    const returnedEvent = eventMap.get('trip_returned') || eventMap.get('trip_completed');
    const cancelledEvent = eventMap.get('trip_cancelled');

    const startedAt = startedEvent?.occurred_at || trip.started_at || trip.created_at;
    const arrivedAt = arrivedEvent?.occurred_at || trip.arrived_at || null;
    const arrivalVerifiedAt = arrivalVerifiedEvent?.occurred_at || trip.arrival_verified_at || null;
    const returningAt = returningEvent?.occurred_at || trip.return_started_at || null;
    const returnedAt = returnedEvent?.occurred_at || trip.returned_at || trip.ended_at || null;
    const cancelledAt = cancelledEvent?.occurred_at || (trip.status === 'cancelled' ? trip.ended_at : null);
    const destination = trip.locator_destination || trip.destination_name || 'destination';

    return [
        createTimelineStep({
            key: 'trip_started',
            label: 'Start Trip',
            description: `Faculty started the official trip to ${destination}.`,
            timestamp: startedAt,
            status: startedAt ? 'completed' : 'pending',
            source: startedEvent ? 'event' : 'trip'
        }),
        createTimelineStep({
            key: 'arrival_marked',
            label: 'Arrived',
            description: arrivalVerifiedAt
                ? 'Faculty arrived at the destination and submitted arrival verification.'
                : `Faculty arrival at ${destination}.`,
            timestamp: arrivalVerifiedAt || arrivedAt,
            status: arrivalVerifiedAt || arrivedAt ? 'completed' : 'pending',
            source: arrivalVerifiedEvent || arrivedEvent ? 'event' : 'trip'
        }),
        createTimelineStep({
            key: 'return_started',
            label: 'Returning',
            description: 'Faculty started the return route back to the original starting location.',
            timestamp: returningAt,
            status: returningAt ? 'completed' : 'pending',
            source: returningEvent ? 'event' : 'trip'
        }),
        createTimelineStep({
            key: cancelledAt ? 'trip_cancelled' : 'trip_returned',
            label: cancelledAt ? 'Cancelled' : 'Returned',
            description: cancelledAt
                ? 'Trip was cancelled before completion.'
                : 'Faculty returned to the original starting location and the trip was completed.',
            timestamp: cancelledAt || returnedAt,
            status: cancelledAt || returnedAt ? 'completed' : 'pending',
            source: cancelledEvent || returnedEvent ? 'event' : 'trip'
        })
    ];
};

const buildRecordedPathSteps = (points = []) => {
    if (!points.length) return [];

    if (points.length === 1) {
        return [{
            index: 1,
            type: 'point',
            title: 'Recorded location point',
            description: 'Only one GPS point was recorded for this trip.',
            from: null,
            to: points[0],
            distanceMeters: 0,
            durationSeconds: 0,
            recordedAt: points[0].recordedAt
        }];
    }

    return points.slice(1).map((point, index) => {
        const previous = points[index];
        const distanceMeters = getDistanceKm(previous, point) * 1000;
        const previousTime = previous.recordedAt ? new Date(previous.recordedAt) : null;
        const currentTime = point.recordedAt ? new Date(point.recordedAt) : null;
        const durationSeconds = previousTime && currentTime && !Number.isNaN(previousTime.getTime()) && !Number.isNaN(currentTime.getTime())
            ? Math.max(Math.round((currentTime.getTime() - previousTime.getTime()) / 1000), 0)
            : null;

        return {
            index: index + 1,
            type: 'segment',
            title: `GPS segment ${index + 1}`,
            description: `Recorded movement from point ${index + 1} to point ${index + 2}.`,
            from: previous,
            to: point,
            distanceMeters: Number(distanceMeters.toFixed(1)),
            durationSeconds,
            recordedAt: point.recordedAt
        };
    });
};

const getRecordedPathSource = (points = []) => (points.length ? 'gps_logs' : 'none');

const parseRouteGeometry = (geometry) => {
    if (!geometry) return null;
    if (typeof geometry === 'object') return geometry;

    try {
        return JSON.parse(geometry);
    } catch (error) {
        return null;
    }
};

const buildPlannedPathFromTrip = (trip) => {
    const geometry = parseRouteGeometry(trip.route_geometry);
    const routeCoordinates = Array.isArray(geometry?.coordinates) ? geometry.coordinates : [];
    const routePath = routeCoordinates
        .map((coordinate) => ({
            latitude: Number(coordinate?.[1]),
            longitude: Number(coordinate?.[0]),
            source: 'planned_route'
        }))
        .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));

    if (routePath.length) {
        return routePath;
    }

    const originLat = Number(trip.origin_lat);
    const originLng = Number(trip.origin_lng);
    const destinationLat = Number(trip.destination_lat);
    const destinationLng = Number(trip.destination_lng);

    if ([originLat, originLng, destinationLat, destinationLng].every(Number.isFinite)) {
        return [
            { latitude: originLat, longitude: originLng, source: 'planned_origin' },
            { latitude: destinationLat, longitude: destinationLng, source: 'planned_destination' }
        ];
    }

    return [];
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

    if (!trip || !OPEN_TRIP_STATUSES.has(trip.status)) {
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
                accuracy: update.accuracy,
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
        accuracy: update.accuracy,
        speed: update.speed,
        heading: update.heading,
        syncStatus: update.syncStatus,
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

const recordLiveLocationBulk = async (facultyUserId, tripId, payload = {}) => {
    const locations = Array.isArray(payload.locations) ? payload.locations : [];

    if (!locations.length) {
        throw new AppError('At least one location point is required.', 422);
    }

    if (locations.length > 250) {
        throw new AppError('A maximum of 250 location points can be synced at once.', 422);
    }

    const updates = locations.map((location) => validateLocationUpdate({
        ...location,
        tripId,
        facultyUserId,
        userId: facultyUserId,
        syncStatus: location.syncStatus || location.sync_status || 'synced'
    }));
    const mismatchedUser = updates.find((update) => update.userId !== facultyUserId);

    if (mismatchedUser) {
        throw new AppError('Location update user does not match the authenticated user.', 403);
    }

    const trip = await tripRepository.findTripByIdForUser(tripId, facultyUserId);

    if (!trip || !OPEN_TRIP_STATUSES.has(trip.status)) {
        throw new AppError('Open trip not found for this location sync.', 404);
    }

    await tripRepository.appendLocationUpdates(updates);
    const latestUpdate = updates[updates.length - 1];

    await socketBroadcasterService.broadcastHrmuLiveLocationUpdate({
        tripId,
        facultyUserId,
        userId: facultyUserId,
        lng: latestUpdate.lng,
        lat: latestUpdate.lat,
        accuracy: latestUpdate.accuracy,
        speed: latestUpdate.speed,
        heading: latestUpdate.heading,
        recordedAt: latestUpdate.recordedAt.toISOString(),
        timestamp: latestUpdate.recordedAt.toISOString()
    }).catch((broadcastError) => {
        console.error('Failed to broadcast HRMU bulk live location update:', broadcastError);
    });

    return {
        tripId,
        syncedCount: updates.length,
        lastLocationUpdate: latestUpdate.recordedAt.toISOString()
    };
};

const getPathHistory = async (requestUser, tripId) => {
    const trip = await tripRepository.findTripByIdWithFaculty(tripId);

    if (!trip) {
        throw new AppError('Trip not found.', 404);
    }

    const isFacultyOwner = requestUser?.role === 'faculty' && String(trip.user_id) === String(requestUser.sub);
    const isPrivilegedViewer = PATH_HISTORY_ROLES.has(requestUser?.role);
    const isDeanScopedViewer = await canDeanViewTripPath(requestUser, trip);

    if (!isFacultyOwner && !isPrivilegedViewer && !isDeanScopedViewer) {
        throw new AppError('You do not have permission to view this trip path history.', 403);
    }

    const rows = await tripRepository.getTripLocationLogsByTripId(tripId);
    const events = await tripRepository.getTripEventsByTripId(tripId);
    const savedPath = rows.map((row) => ({
        latitude: row.lat === null ? null : Number(row.lat),
        longitude: row.lng === null ? null : Number(row.lng),
        accuracy: row.accuracy === null ? null : Number(row.accuracy),
        speed: row.speed === null ? null : Number(row.speed),
        heading: row.heading === null ? null : Number(row.heading),
        recordedAt: toIso(row.recorded_at),
        syncStatus: row.sync_status || 'synced',
        source: row.source || 'gps'
    })).filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && point.recordedAt);
    const path = savedPath;
    const pathSource = getRecordedPathSource(path);
    const stats = buildPathStatistics(path, trip);
    const steps = buildTripStepTimeline(events, trip);
    const recordedPathSteps = buildRecordedPathSteps(path);
    const plannedPath = buildPlannedPathFromTrip(trip);

    return {
        tripId: trip.id,
        facultyUserId: trip.user_id,
        facultyName: trip.faculty_name,
        collegeName: trip.college_name,
        destination: trip.locator_destination || trip.destination_name,
        status: trip.status,
        locatorSlipId: trip.locator_slip_id || null,
        startedAt: toIso(trip.started_at),
        completedAt: toIso(trip.ended_at || trip.returned_at),
        destinationCoordinates: {
            lng: trip.destination_lng === null ? null : Number(trip.destination_lng),
            lat: trip.destination_lat === null ? null : Number(trip.destination_lat)
        },
        originCoordinates: {
            lng: trip.origin_lng === null ? null : Number(trip.origin_lng),
            lat: trip.origin_lat === null ? null : Number(trip.origin_lat)
        },
        pathSource,
        steps,
        recordedPathSteps,
        plannedPath,
        stats,
        path
    };
};

module.exports = {
    searchDestinations,
    previewRoute,
    startTrip,
    getActiveTrip,
    endTrip,
    recordLiveLocation,
    recordLiveLocationBulk,
    getPathHistory
};
