const pool = require('../db/pool');
const AppError = require('../utils/appError');
const cloudinary = require('../config/cloudinary');
const { optimizeImage } = require('./imageOptimization.service');
const mapboxService = require('./mapbox.service');
const facultyTripRepository = require('../repositories/facultyTripFlow.repository');
const tripRepository = require('../repositories/tripTracking.repository');
const socketBroadcasterService = require('./socketBroadcaster.service');
const tripIncidentService = require('./tripIncident.service');
const hrmuDashboardRepository = require('../repositories/hrmuDashboard.repository');

const VERIFIABLE_SLIP_STATUSES = new Set(['approved', 'verified']);

const uploadArrivalVerificationToCloudinary = (optimizedImage, locatorSlipId) =>
    new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: 'eduroute/arrival-verifications',
                public_id: `arrival-${locatorSlipId}-${Date.now()}`,
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

const normalizeTripState = (trip) => {
    if (!trip) return 'READY_TO_START';
    if (trip.status === 'active') return 'ACTIVE';
    if (trip.status === 'arrived' && !trip.arrival_verified_at) return 'ARRIVED';
    if (trip.status === 'arrived' && trip.arrival_verified_at) return 'ARRIVAL_VERIFIED';
    if (trip.status === 'returning') return 'RETURNING';
    if (trip.status === 'completed') return 'COMPLETED';
    return trip.status?.toUpperCase() || 'READY_TO_START';
};

const getLogicalTripStatus = (trip) => {
    if (!trip) return 'not_started';
    if (trip.returned_at || trip.ended_at || trip.status === 'completed') return 'completed';
    if (trip.status === 'returning') return 'returning';
    if (trip.arrived_at && trip.arrival_verified_at) return 'arrived';
    if (trip.arrived_at) return 'arrived';
    if (trip.status === 'arrived') return 'arrived';
    if (trip.status === 'active') return 'active';
    return trip.status || 'not_started';
};

const ensureApprovedLocatorSlip = (locatorSlip) => {
    if (!locatorSlip) {
        throw new AppError('Approved locator slip not found.', 404);
    }

    if (!VERIFIABLE_SLIP_STATUSES.has(String(locatorSlip.status || '').toLowerCase())) {
        throw new AppError('Only approved or verified locator slips can be used for trip access.', 409);
    }

    if (String(locatorSlip.trip_status || '').toLowerCase() === 'completed') {
        throw new AppError('This locator slip trip has already been completed.', 409);
    }
};

const calculateLateReturn = (expectedReturnTime, actualReturnTime) => {
    if (!expectedReturnTime || !actualReturnTime) {
        return {
            isLateReturn: false,
            minutesLate: 0
        };
    }

    const expected = new Date(expectedReturnTime);
    const actual = new Date(actualReturnTime);

    if (Number.isNaN(expected.getTime()) || Number.isNaN(actual.getTime())) {
        return {
            isLateReturn: false,
            minutesLate: 0
        };
    }

    const threshold = expected.getTime() + (60 * 60 * 1000);
    if (actual.getTime() <= threshold) {
        return {
            isLateReturn: false,
            minutesLate: 0
        };
    }

    return {
        isLateReturn: true,
        minutesLate: Math.max(Math.round((actual.getTime() - expected.getTime()) / 60000), 0)
    };
};

const mapLocatorSlipResponse = (locatorSlip, currentTrip, verification) => ({
    ...locatorSlip,
    currentTrip,
    latestArrivalVerification: verification,
    lifecycleState: currentTrip ? normalizeTripState(currentTrip) : (locatorSlip.destination_lat && locatorSlip.destination_lng ? 'DESTINATION_READY' : 'DESTINATION_RESOLVING')
});

const applyLogicalTripStatus = (trip, status) => (
    trip ? { ...trip, status } : trip
);

const getVerificationTimestamp = (verification) => (
    verification?.verified_at
    || verification?.created_at
    || verification?.updated_at
    || null
);

const hydrateTripWithVerification = (trip, verification) => {
    if (!trip || !verification) return trip;

    const verificationTime = getVerificationTimestamp(verification);
    if (!verificationTime) return trip;

    return {
        ...trip,
        arrived_at: trip.arrived_at || verificationTime,
        arrival_verified_at: trip.arrival_verified_at || verificationTime
    };
};

const buildHrmuTripNotificationMessage = (type, context = {}) => {
    const facultyName = context.faculty_name || 'A faculty member';
    const destination = context.destination ? ` at ${context.destination}` : '';
    const purpose = context.purpose ? ` for ${context.purpose}` : '';

    if (type === hrmuDashboardRepository.HRMU_NOTIFICATION_TYPE_ARRIVED) {
        return `${facultyName} marked the trip as arrived${destination}. Awaiting location verification image.`;
    }

    if (type === hrmuDashboardRepository.HRMU_NOTIFICATION_TYPE_LOCATION_VERIFIED) {
        return `${facultyName} submitted a location verification image${destination}${purpose}. Review the proof before clearing the trip.`;
    }

    return `${facultyName} trip update recorded${destination}.`;
};

const getApprovedLocatorSlips = async (facultyUserId) => {
    const locatorSlips = await facultyTripRepository.getApprovedLocatorSlips(facultyUserId);

    return {
        locatorSlips: locatorSlips.map((locatorSlip) => ({
            id: locatorSlip.id,
            purpose: locatorSlip.purpose,
            destination: locatorSlip.destination,
            departureTime: locatorSlip.departure_time,
            expectedReturnTime: locatorSlip.expected_return_time,
            status: locatorSlip.status,
            tripStatus: locatorSlip.trip_status
        }))
    };
};

const getLocatorSlipDetails = async (facultyUserId, locatorSlipId) => {
    const locatorSlip = await facultyTripRepository.getLocatorSlipForTripAccess(facultyUserId, locatorSlipId);
    ensureApprovedLocatorSlip(locatorSlip);

    let currentTrip = await facultyTripRepository.getCurrentTripForLocatorSlip(facultyUserId, locatorSlipId);

    // Older databases may not have trips.locator_slip_id yet, so fall back to the
    // user's currently open trip to keep the faculty map recoverable after refresh.
    if (!currentTrip) {
        currentTrip = await facultyTripRepository.getOpenTripForUser(facultyUserId);
    }

    const latestArrivalVerification = currentTrip
        ? await facultyTripRepository.getLatestArrivalVerification(currentTrip.id)
        : null;
    const latestLocatorSlipVerification = await facultyTripRepository.getLatestLocatorSlipLocationVerification(locatorSlip.id, facultyUserId);
    const effectiveVerification = latestLocatorSlipVerification || latestArrivalVerification;

    return mapLocatorSlipResponse(
        locatorSlip,
        hydrateTripWithVerification(currentTrip, effectiveVerification),
        effectiveVerification
    );
};

const resolveDestination = async (facultyUserId, locatorSlipId, destinationText) => {
    const locatorSlip = await facultyTripRepository.getLocatorSlipForTripAccess(facultyUserId, locatorSlipId);
    ensureApprovedLocatorSlip(locatorSlip);

    const query = String(destinationText || locatorSlip.destination || '').trim();
    const results = await mapboxService.searchDestinations(query, {
        limit: 1,
        language: 'en',
        country: 'PH',
        types: mapboxService.DEFAULT_GEOCODING_TYPES
    });

    if (!results[0]?.coordinates?.lat || !results[0]?.coordinates?.lng) {
        return {
            resolved: false,
            requiresManualPin: true,
            message: 'Destination could not be found. Please pin the location manually.'
        };
    }

    const updatedSlip = await facultyTripRepository.updateLocatorSlipDestination(facultyUserId, locatorSlipId, {
        destinationLabel: results[0].full_address || results[0].name || locatorSlip.destination,
        lat: results[0].coordinates.lat,
        lng: results[0].coordinates.lng,
        method: 'search'
    });

    return {
        resolved: true,
        requiresManualPin: false,
        locatorSlip: updatedSlip,
        destination: {
            label: updatedSlip.destination,
            lat: updatedSlip.destination_lat,
            lng: updatedSlip.destination_lng,
            source: 'geocoding'
        }
    };
};

const saveManualPin = async (facultyUserId, locatorSlipId, payload) => {
    const locatorSlip = await facultyTripRepository.getLocatorSlipForTripAccess(facultyUserId, locatorSlipId);
    ensureApprovedLocatorSlip(locatorSlip);

    const coordinate = mapboxService.assertCoordinate(payload, 'Destination');
    const updatedSlip = await facultyTripRepository.updateLocatorSlipDestination(facultyUserId, locatorSlipId, {
        destinationLabel: String(payload.label || locatorSlip.destination || '').trim() || locatorSlip.destination,
        lat: coordinate.lat,
        lng: coordinate.lng,
        method: 'manual_pin'
    });

    return {
        resolved: true,
        requiresManualPin: false,
        locatorSlip: updatedSlip,
        destination: {
            label: updatedSlip.destination,
            lat: updatedSlip.destination_lat,
            lng: updatedSlip.destination_lng,
            source: 'manual_pin'
        }
    };
};

const startTrip = async (facultyUserId, payload) => {
    const locatorSlipId = String(payload.locatorSlipId || '').trim();
    if (!locatorSlipId) {
        throw new AppError('Locator slip ID is required.', 422);
    }

    const locatorSlip = await facultyTripRepository.getLocatorSlipForTripAccess(facultyUserId, locatorSlipId);
    ensureApprovedLocatorSlip(locatorSlip);

    const origin = mapboxService.assertCoordinate({ lat: payload.originLat, lng: payload.originLng }, 'Origin');
    const hasSlipDestinationCoordinates = locatorSlip.destination_lat !== null && locatorSlip.destination_lng !== null;
    const hasPayloadDestinationCoordinates =
        payload.destinationLat !== null
        && payload.destinationLat !== undefined
        && payload.destinationLng !== null
        && payload.destinationLng !== undefined;

    if (!hasSlipDestinationCoordinates && !hasPayloadDestinationCoordinates) {
        throw new AppError('Destination must be resolved before starting a trip.', 409);
    }

    const destination = mapboxService.assertCoordinate(
        hasPayloadDestinationCoordinates
            ? { lat: payload.destinationLat, lng: payload.destinationLng }
            : { lat: locatorSlip.destination_lat, lng: locatorSlip.destination_lng },
        'Destination'
    );

    const existingTrip = await facultyTripRepository.getOpenTripForUser(facultyUserId);
    if (existingTrip) {
        throw new AppError('Complete the current trip before starting another one.', 409);
    }

    const route = await mapboxService.getDirections({
        origin,
        destination,
        profile: payload.profile,
        alternatives: false
    });

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const trip = await facultyTripRepository.insertTrip({
            locatorSlipId,
            facultyUserId,
            origin,
            destination: {
                ...destination,
                name: locatorSlip.destination
            },
            routeGeometry: route.geometry,
            routeDistanceMeters: route.distance_meters,
            routeDurationSeconds: route.duration_seconds,
            outboundDistanceMeters: Number(payload.outboundDistanceMeters) || route.distance_meters
        }, client);

        await facultyTripRepository.updateLocatorSlipTripStatus(locatorSlipId, 'active', client);
        await tripRepository.insertTripEvent(client, {
            tripId: trip.id,
            userId: facultyUserId,
            eventType: 'trip_started',
            title: 'Trip started',
            subtitle: `Destination: ${locatorSlip.destination}`,
            metadata: {
                locatorSlipId
            },
            occurredAt: trip.started_at || new Date()
        }).catch(() => null);
        const hrmuTripStartContext = await hrmuDashboardRepository.getApprovedLocatorSlipNotificationPayload(locatorSlipId, client).catch(() => null);
        if (hrmuTripStartContext) {
            await hrmuDashboardRepository.createHrmuTripEventNotifications(client, {
                locatorSlipId,
                type: hrmuDashboardRepository.HRMU_NOTIFICATION_TYPE_TRIP_STARTED,
                title: 'Faculty started trip',
                message: `${hrmuTripStartContext.faculty_name || 'A faculty member'} started a trip${hrmuTripStartContext.destination ? ` to ${hrmuTripStartContext.destination}` : ''}${hrmuTripStartContext.purpose ? ` for ${hrmuTripStartContext.purpose}` : ''}.`
            }).catch(() => null);
        }

        await client.query('COMMIT');

        await socketBroadcasterService.broadcastHrmuDashboardUpdate().catch(() => null);
        await socketBroadcasterService.broadcastHrmuLiveLocationUpdate().catch(() => null);

        return {
            locatorSlip,
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

const markArrived = async (facultyUserId, tripId) => {
    const trip = await facultyTripRepository.getTripSummaryRow(tripId, facultyUserId);

    if (!trip) {
        throw new AppError('Trip not found.', 404);
    }

    if (getLogicalTripStatus(trip) !== 'active') {
        throw new AppError('Only active trips can be marked as arrived.', 409);
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const supportsArrivedStatus = await facultyTripRepository.getTripsSupportsStatusValue('arrived', client);
        const updatedTrip = await facultyTripRepository.updateTripLifecycle(tripId, facultyUserId, {
            status: supportsArrivedStatus ? 'arrived' : 'active',
            arrived_at: new Date()
        }, client);
        await facultyTripRepository.updateLocatorSlipTripStatus(trip.locator_slip_id, 'arrived', client);
        await tripRepository.insertTripEvent(client, {
            tripId,
            userId: facultyUserId,
            eventType: 'arrival_marked',
            title: 'Arrival marked',
            subtitle: `Arrived at ${trip.destination || trip.destination_name}`,
            metadata: {
                locatorSlipId: trip.locator_slip_id
            },
            occurredAt: updatedTrip.arrived_at || new Date()
        }).catch(() => null);
        const hrmuArrivalContext = await hrmuDashboardRepository.getApprovedLocatorSlipNotificationPayload(trip.locator_slip_id, client).catch(() => null);
        if (hrmuArrivalContext) {
            await hrmuDashboardRepository.createHrmuTripEventNotifications(client, {
                locatorSlipId: trip.locator_slip_id,
                type: hrmuDashboardRepository.HRMU_NOTIFICATION_TYPE_ARRIVED,
                title: 'Faculty arrived at destination',
                message: buildHrmuTripNotificationMessage(hrmuDashboardRepository.HRMU_NOTIFICATION_TYPE_ARRIVED, hrmuArrivalContext)
            }).catch(() => null);
        }
        await client.query('COMMIT');
        await socketBroadcasterService.broadcastHrmuDashboardUpdate().catch(() => null);
        return applyLogicalTripStatus(updatedTrip, 'arrived');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

const verifyArrival = async (facultyUserId, tripId, file, payload = {}) => {
    if (!file) {
        throw new AppError('Arrival verification image is required.', 422);
    }

    const trip = await facultyTripRepository.getTripSummaryRow(tripId, facultyUserId);

    if (!trip) {
        throw new AppError('Trip not found.', 404);
    }

    const logicalStatus = getLogicalTripStatus(trip);

    if (!['arrived', 'active'].includes(logicalStatus)) {
        throw new AppError('Arrival can only be verified after the trip is marked as arrived.', 409);
    }

    const fallbackLocatorSlipId = String(payload.locatorSlipId || '').trim() || null;
    const effectiveLocatorSlipId = trip.locator_slip_id || fallbackLocatorSlipId;

    if (!effectiveLocatorSlipId) {
        throw new AppError('A locator slip is required to attach the arrival verification.', 409);
    }

    const linkedLocatorSlip = await facultyTripRepository.getLocatorSlipForTripAccess(facultyUserId, effectiveLocatorSlipId);
    ensureApprovedLocatorSlip(linkedLocatorSlip);

    const optimizedImage = await optimizeImage(file, 'locationVerification');
    const uploadResult = await uploadArrivalVerificationToCloudinary(optimizedImage, effectiveLocatorSlipId);
    const verifiedAt = new Date();
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        let arrivalTrip = trip;

        if (logicalStatus === 'active') {
            const supportsArrivedStatus = await facultyTripRepository.getTripsSupportsStatusValue('arrived', client);
            arrivalTrip = await facultyTripRepository.updateTripLifecycle(tripId, facultyUserId, {
                status: supportsArrivedStatus ? 'arrived' : 'active',
                arrived_at: trip.arrived_at || verifiedAt
            }, client);
        }

        const verification = await facultyTripRepository.insertArrivalVerification({
            tripId,
            locatorSlipId: effectiveLocatorSlipId,
            facultyUserId,
            imageUrl: uploadResult.secure_url,
            imagePublicId: uploadResult.public_id,
            status: 'submitted',
            verifiedAt
        }, client);

        const locatorSlipVerification = await facultyTripRepository.mirrorLocatorSlipLocationVerification({
            locatorSlipId: effectiveLocatorSlipId,
            facultyUserId,
            targetLocation: linkedLocatorSlip.destination || trip.destination || trip.destination_name,
            imageUrl: uploadResult.secure_url,
            imagePublicId: uploadResult.public_id,
            mimeType: optimizedImage.mimetype,
            fileSize: optimizedImage.size,
            originalFileSize: optimizedImage.original.size,
            imageWidth: optimizedImage.width,
            imageHeight: optimizedImage.height,
            status: 'submitted'
        }, client);

        const updatedTrip = await facultyTripRepository.updateTripLifecycle(tripId, facultyUserId, {
            arrival_verified_at: verifiedAt
        }, client);

        await tripRepository.insertTripEvent(client, {
            tripId,
            userId: facultyUserId,
            eventType: 'arrival_verified',
            title: 'Arrival verified',
            subtitle: 'Arrival verification image submitted successfully.',
            metadata: {
                locatorSlipId: effectiveLocatorSlipId,
                verificationId: verification.id
            },
            occurredAt: verifiedAt
        }).catch(() => null);
        const hrmuVerificationContext = await hrmuDashboardRepository.getApprovedLocatorSlipNotificationPayload(effectiveLocatorSlipId, client).catch(() => null);
        if (hrmuVerificationContext) {
            await hrmuDashboardRepository.createHrmuTripEventNotifications(client, {
                locatorSlipId: effectiveLocatorSlipId,
                type: hrmuDashboardRepository.HRMU_NOTIFICATION_TYPE_LOCATION_VERIFIED,
                title: 'Location verification submitted',
                message: buildHrmuTripNotificationMessage(hrmuDashboardRepository.HRMU_NOTIFICATION_TYPE_LOCATION_VERIFIED, hrmuVerificationContext)
            }).catch(() => null);
        }

        await client.query('COMMIT');
        await socketBroadcasterService.broadcastHrmuDashboardUpdate().catch(() => null);

        const nextTrip = hydrateTripWithVerification({
            ...updatedTrip,
            locator_slip_id: effectiveLocatorSlipId,
            arrived_at: updatedTrip?.arrived_at || arrivalTrip?.arrived_at || verifiedAt
        }, locatorSlipVerification || verification);

        return {
            trip: applyLogicalTripStatus(nextTrip, 'arrived'),
            verification: locatorSlipVerification || verification
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

const startReturn = async (facultyUserId, tripId) => {
    let trip = await facultyTripRepository.getTripSummaryRow(tripId, facultyUserId);

    if (!trip) {
        throw new AppError('Trip not found.', 404);
    }

    const latestLocationVerification = trip.locator_slip_id
        ? await facultyTripRepository.getLatestLocatorSlipLocationVerification(trip.locator_slip_id, facultyUserId)
        : null;
    trip = hydrateTripWithVerification(trip, latestLocationVerification);

    if (getLogicalTripStatus(trip) !== 'arrived') {
        throw new AppError('Return route can only start after arrival.', 409);
    }

    if (!trip.arrival_verified_at) {
        throw new AppError('Arrival verification is required before starting the return route.', 409);
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const supportsReturningStatus = await facultyTripRepository.getTripsSupportsStatusValue('returning', client);
        const updatedTrip = await facultyTripRepository.updateTripLifecycle(tripId, facultyUserId, {
            status: supportsReturningStatus ? 'returning' : 'active'
        }, client);
        await facultyTripRepository.updateLocatorSlipTripStatus(trip.locator_slip_id, 'returning', client);
        await tripRepository.insertTripEvent(client, {
            tripId,
            userId: facultyUserId,
            eventType: 'return_started',
            title: 'Return route started',
            subtitle: 'Heading back to the original departure point.',
            metadata: {
                locatorSlipId: trip.locator_slip_id
            },
            occurredAt: new Date()
        }).catch(() => null);
        await client.query('COMMIT');
        return applyLogicalTripStatus(updatedTrip, 'returning');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

const markReturned = async (facultyUserId, tripId, payload = {}) => {
    let trip = await facultyTripRepository.getTripSummaryRow(tripId, facultyUserId);

    if (!trip) {
        throw new AppError('Trip not found.', 404);
    }

    const latestLocationVerification = trip.locator_slip_id
        ? await facultyTripRepository.getLatestLocatorSlipLocationVerification(trip.locator_slip_id, facultyUserId)
        : null;
    trip = hydrateTripWithVerification(trip, latestLocationVerification);

    if (!['returning', 'arrived', 'active'].includes(getLogicalTripStatus(trip))) {
        throw new AppError('Only a returning trip can be completed.', 409);
    }

    if (!trip.arrival_verified_at) {
        throw new AppError('Arrival verification must be completed before ending the trip.', 409);
    }

    const origin = { lat: Number(trip.origin_lat), lng: Number(trip.origin_lng) };
    const destination = { lat: Number(trip.destination_lat), lng: Number(trip.destination_lng) };
    const endedAt = new Date();
    let returnDistanceMeters = Number(payload.returnDistanceMeters);

    if (!Number.isFinite(returnDistanceMeters) && Number.isFinite(origin.lat) && Number.isFinite(origin.lng) && Number.isFinite(destination.lat) && Number.isFinite(destination.lng)) {
        const returnRoute = await mapboxService.getDirections({
            origin: destination,
            destination: origin,
            profile: payload.profile
        });
        returnDistanceMeters = returnRoute.distance_meters;
    }

    const outboundDistanceMeters = Number(trip.outbound_distance_meters || trip.route_distance_meters || 0);
    const safeReturnDistanceMeters = Number.isFinite(returnDistanceMeters) ? returnDistanceMeters : 0;
    const totalDistanceMeters = outboundDistanceMeters + safeReturnDistanceMeters;
    const totalDistanceKm = totalDistanceMeters / 1000;
    const startedAt = trip.started_at ? new Date(trip.started_at) : null;
    const totalTripMinutes = startedAt ? Math.max(Math.round((endedAt.getTime() - startedAt.getTime()) / 60000), 0) : 0;
    const totalTripHours = totalTripMinutes / 60;
    const lateReturn = calculateLateReturn(trip.expected_return_datetime, endedAt);
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const updatedTrip = await facultyTripRepository.updateTripLifecycle(tripId, facultyUserId, {
            status: 'completed',
            returned_at: endedAt,
            ended_at: endedAt,
            return_distance_meters: safeReturnDistanceMeters,
            total_distance_meters: totalDistanceMeters,
            total_distance_km: totalDistanceKm,
            total_trip_minutes: totalTripMinutes,
            total_trip_hours: totalTripHours
        }, client);

        await facultyTripRepository.updateLocatorSlipTripStatus(trip.locator_slip_id, 'completed', client);
        await tripRepository.insertTripEvent(client, {
            tripId,
            userId: facultyUserId,
            eventType: 'trip_completed',
            title: 'Trip completed',
            subtitle: lateReturn.isLateReturn ? 'Trip completed with a late return flag.' : 'Trip returned to the starting location.',
            metadata: {
                locatorSlipId: trip.locator_slip_id,
                totalDistanceMeters,
                totalTripMinutes
            },
            occurredAt: endedAt
        }).catch(() => null);
        if (!lateReturn.isLateReturn) {
            const hrmuCompletionContext = await hrmuDashboardRepository.getApprovedLocatorSlipNotificationPayload(trip.locator_slip_id, client).catch(() => null);
            if (hrmuCompletionContext) {
                await hrmuDashboardRepository.createHrmuTripEventNotifications(client, {
                    locatorSlipId: trip.locator_slip_id,
                    type: hrmuDashboardRepository.HRMU_NOTIFICATION_TYPE_TRIP_COMPLETED,
                    title: 'Faculty returned on time',
                    message: `${hrmuCompletionContext.faculty_name || 'A faculty member'} successfully returned on time${hrmuCompletionContext.destination ? ` from ${hrmuCompletionContext.destination}` : ''}.`
                }).catch(() => null);
            }
        }

        await client.query('COMMIT');

        await tripIncidentService.evaluateTripIncidents(tripId).catch(() => []);

        await socketBroadcasterService.broadcastHrmuDashboardUpdate().catch(() => null);
        await socketBroadcasterService.broadcastHrmuLiveLocationUpdate().catch(() => null);

        return {
            trip: updatedTrip,
            summary: {
                departureTime: trip.departure_datetime,
                actualStartTripTime: updatedTrip.started_at,
                estimatedReturnTime: trip.expected_return_datetime,
                actualReturnTime: updatedTrip.ended_at,
                outboundDistanceMeters,
                returnDistanceMeters: safeReturnDistanceMeters,
                totalDistanceMeters,
                totalDistanceKm,
                totalTripMinutes,
                totalTripHours,
                isLateReturn: lateReturn.isLateReturn,
                minutesLate: lateReturn.minutesLate
            }
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

const getTripSummary = async (facultyUserId, tripId) => {
    const trip = await facultyTripRepository.getTripSummaryRow(tripId, facultyUserId);

    if (!trip) {
        throw new AppError('Trip summary not found.', 404);
    }

    const lateReturn = calculateLateReturn(trip.expected_return_datetime, trip.ended_at || trip.returned_at);

    return {
        locatorSlip: {
            id: trip.locator_slip_id,
            purpose: trip.custom_purpose || trip.purpose_of_travel || null,
            destination: trip.destination || trip.destination_name,
            departureTime: trip.departure_datetime,
            expectedReturnTime: trip.expected_return_datetime
        },
        trip: {
            id: trip.id,
            startedAt: trip.started_at,
            arrivedAt: trip.arrived_at,
            arrivalVerifiedAt: trip.arrival_verified_at,
            returnedAt: trip.returned_at,
            endedAt: trip.ended_at,
            status: trip.status
        },
        summary: {
            departureTime: trip.departure_datetime,
            actualStartTripTime: trip.started_at,
            estimatedReturnTime: trip.expected_return_datetime,
            actualReturnTime: trip.ended_at || trip.returned_at,
            outboundDistanceMeters: Number(trip.outbound_distance_meters || trip.route_distance_meters || 0),
            returnDistanceMeters: Number(trip.return_distance_meters || 0),
            totalDistanceMeters: Number(trip.total_distance_meters || 0),
            totalDistanceKm: Number(trip.total_distance_km || 0),
            totalTripMinutes: Number(trip.total_trip_minutes || 0),
            totalTripHours: Number(trip.total_trip_hours || 0),
            isLateReturn: lateReturn.isLateReturn,
            minutesLate: lateReturn.minutesLate
        }
    };
};

module.exports = {
    calculateLateReturn,
    getApprovedLocatorSlips,
    getLocatorSlipDetails,
    resolveDestination,
    saveManualPin,
    startTrip,
    markArrived,
    verifyArrival,
    startReturn,
    markReturned,
    getTripSummary
};
