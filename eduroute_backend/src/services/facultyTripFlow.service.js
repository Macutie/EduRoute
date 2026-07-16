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
const {
    APPROVABLE_STATUSES,
    ACTIVE_TRIP_STATUSES,
    canLocatorSlipStartTrip,
    getFacultyLocatorSlipActions,
    isLocatorSlipCompleted,
    normalizeCssuValidationStatus,
    normalizeTripStatus,
} = require('../utils/locatorSlipActions');

const VERIFIABLE_SLIP_STATUSES = APPROVABLE_STATUSES;

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
    if (trip.arrival_verified_at) return 'arrived';
    if (trip.arrived_at && trip.arrival_verified_at) return 'arrived';
    if (trip.arrived_at) return 'arrived';
    if (trip.status === 'arrived') return 'arrived';
    if (trip.status === 'active') return 'active';
    return trip.status || 'not_started';
};

const ensureApprovedLocatorSlip = (locatorSlip, existingTrip = null) => {
    if (!locatorSlip) {
        throw new AppError('Approved locator slip not found.', 404);
    }

    const slipStatus = String(locatorSlip.status || '').toLowerCase();
    const tripStatus = String(existingTrip?.status || locatorSlip.trip_status || locatorSlip.tripStatus || '').toLowerCase();
    const isApprovedOrVerified = VERIFIABLE_SLIP_STATUSES.has(slipStatus);
    const hasTripInProgress = ACTIVE_TRIP_STATUSES.has(tripStatus);

    if (!isApprovedOrVerified && !hasTripInProgress) {
        throw new AppError('Only approved or verified locator slips can be used for trip access.', 409);
    }

    if (isLocatorSlipCompleted(locatorSlip, existingTrip)) {
        throw new AppError('This locator slip has already been completed and cannot be used for another trip.', 409);
    }
};

const createTripStartBlockedError = (locatorSlip, existingTrip = null) => {
    const cssuValidationStatus = normalizeCssuValidationStatus(locatorSlip?.cssu_validation_status);

    if (isLocatorSlipCompleted(locatorSlip, existingTrip)) {
        return new AppError('This locator slip has already been completed and cannot be used for another trip.', 409);
    }

    if (cssuValidationStatus === 'pending') {
        return new AppError('This locator slip must be validated and allowed by CSSU before starting the trip.', 409);
    }

    if (cssuValidationStatus === 'denied') {
        return new AppError('This locator slip was denied by CSSU and cannot start a trip.', 409);
    }

    if (cssuValidationStatus === 'flagged') {
        return new AppError('This locator slip was flagged by CSSU and cannot start a trip until resolved.', 409);
    }

    if (existingTrip) {
        const existingTripStatus = normalizeTripStatus(existingTrip.status);
        if (existingTripStatus === 'completed') {
            return new AppError('This locator slip has already been completed and cannot be used for another trip.', 409);
        }

        if (ACTIVE_TRIP_STATUSES.has(existingTripStatus)) {
            return new AppError('A trip already exists for this locator slip and must be finished before starting another one.', 409);
        }
    }

    return new AppError('This locator slip cannot start a trip right now.', 409);
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

const isFiniteCoordinate = (value) => Number.isFinite(Number(value));

const getTripCoordinatePair = (trip) => {
    const originLat = Number(trip?.origin?.lat ?? trip?.origin_lat);
    const originLng = Number(trip?.origin?.lng ?? trip?.origin_lng);
    const destinationLat = Number(trip?.destination?.lat ?? trip?.destination_lat);
    const destinationLng = Number(trip?.destination?.lng ?? trip?.destination_lng);

    if (
        !isFiniteCoordinate(originLat)
        || !isFiniteCoordinate(originLng)
        || !isFiniteCoordinate(destinationLat)
        || !isFiniteCoordinate(destinationLng)
    ) {
        return null;
    }

    return {
        origin: { lat: originLat, lng: originLng },
        destination: { lat: destinationLat, lng: destinationLng }
    };
};

const MIN_DISTANCE_SEGMENT_METERS = 5;

const toRadians = (degrees) => (Number(degrees) * Math.PI) / 180;

const getDistanceBetweenPointsMeters = (first, second) => {
    if (!first || !second) return 0;

    const firstLat = Number(first.latitude ?? first.lat);
    const firstLng = Number(first.longitude ?? first.lng);
    const secondLat = Number(second.latitude ?? second.lat);
    const secondLng = Number(second.longitude ?? second.lng);

    if (
        !isFiniteCoordinate(firstLat)
        || !isFiniteCoordinate(firstLng)
        || !isFiniteCoordinate(secondLat)
        || !isFiniteCoordinate(secondLng)
    ) {
        return 0;
    }

    const earthRadiusMeters = 6371000;
    const deltaLatitude = toRadians(secondLat - firstLat);
    const deltaLongitude = toRadians(secondLng - firstLng);
    const startLatitude = toRadians(firstLat);
    const endLatitude = toRadians(secondLat);

    const haversine =
        Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2) +
        Math.cos(startLatitude) *
        Math.cos(endLatitude) *
        Math.sin(deltaLongitude / 2) *
        Math.sin(deltaLongitude / 2);

    return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const getTrackedTripDistanceMeters = async (trip, facultyUserId) => {
    if (!trip?.id) return 0;

    const locationLogs = await facultyTripRepository.getTripLocationLogs(trip.id, facultyUserId).catch(() => []);
    const origin = trip?.origin
        ? {
            latitude: trip.origin.latitude ?? trip.origin.lat,
            longitude: trip.origin.longitude ?? trip.origin.lng
        }
        : null;

    const points = [];
    if (origin) {
        points.push(origin);
    }

    for (const log of locationLogs) {
        if (!isFiniteCoordinate(log?.latitude) || !isFiniteCoordinate(log?.longitude)) continue;
        points.push({
            latitude: Number(log.latitude),
            longitude: Number(log.longitude)
        });
    }

    if (points.length < 2) {
        return 0;
    }

    let totalDistanceMeters = 0;
    for (let index = 1; index < points.length; index += 1) {
        const segmentDistance = getDistanceBetweenPointsMeters(points[index - 1], points[index]);
        if (Number.isFinite(segmentDistance) && segmentDistance >= MIN_DISTANCE_SEGMENT_METERS) {
            totalDistanceMeters += segmentDistance;
        }
    }

    return totalDistanceMeters;
};

const getComputedTripTotals = async (trip) => {
    const trackedDistanceMeters = await getTrackedTripDistanceMeters(trip, trip?.user_id || trip?.faculty_user_id);
    const hasTrackedDistance = Number.isFinite(trackedDistanceMeters) && trackedDistanceMeters > 0;
    let outboundDistanceMeters = Number(trip?.outbound_distance_meters ?? 0);
    let returnDistanceMeters = Number(trip?.return_distance_meters ?? 0);
    let totalDistanceMeters = hasTrackedDistance ? trackedDistanceMeters : 0;
    let totalDistanceKm = Number(trip?.total_distance_km ?? 0);
    let totalTripMinutes = Number(trip?.total_trip_minutes ?? 0);
    let totalTripHours = Number(trip?.total_trip_hours ?? 0);
    const actualReturnTime = trip?.ended_at || trip?.returned_at || null;

    totalDistanceKm = totalDistanceMeters > 0 ? totalDistanceMeters / 1000 : 0;

    if ((!Number.isFinite(totalTripMinutes) || totalTripMinutes <= 0 || !Number.isFinite(totalTripHours) || totalTripHours <= 0)
        && trip?.started_at && actualReturnTime) {
        const startedAt = new Date(trip.started_at);
        const endedAt = new Date(actualReturnTime);
        if (!Number.isNaN(startedAt.getTime()) && !Number.isNaN(endedAt.getTime())) {
            totalTripMinutes = Math.max(Math.round((endedAt.getTime() - startedAt.getTime()) / 60000), 0);
            totalTripHours = totalTripMinutes / 60;
        }
    }

    return {
        outboundDistanceMeters: Number.isFinite(outboundDistanceMeters) ? outboundDistanceMeters : 0,
        returnDistanceMeters: Number.isFinite(returnDistanceMeters) ? returnDistanceMeters : 0,
        totalDistanceMeters: Number.isFinite(totalDistanceMeters) ? totalDistanceMeters : 0,
        totalDistanceKm: Number.isFinite(totalDistanceKm) ? totalDistanceKm : 0,
        totalTripMinutes: Number.isFinite(totalTripMinutes) ? totalTripMinutes : 0,
        totalTripHours: Number.isFinite(totalTripHours) ? totalTripHours : 0
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

const isTripOpen = (trip) => ACTIVE_TRIP_STATUSES.has(String(trip?.status || '').toLowerCase());

const isSameLocatorSlipTrip = (trip, locatorSlipId, existingTripForSlip = null) => {
    if (!trip) return false;
    if (trip.locator_slip_id && String(trip.locator_slip_id) === String(locatorSlipId)) {
        return true;
    }

    return Boolean(existingTripForSlip?.id && trip.id && String(existingTripForSlip.id) === String(trip.id));
};

const getVerificationTimestamp = (verification) => (
    verification?.submitted_at
    || verification?.submittedAt
    ||
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

const hydrateTripWithSavedProofState = async (trip, facultyUserId) => {
    if (!trip) return trip;

    const latestArrivalVerification = await facultyTripRepository.getLatestArrivalVerification(trip.id);
    const latestLocationVerification = trip.locator_slip_id
        ? await facultyTripRepository.getLatestLocatorSlipLocationVerification(trip.locator_slip_id, facultyUserId)
        : null;

    return hydrateTripWithVerification(trip, latestLocationVerification || latestArrivalVerification);
};

const buildHrmuTripNotificationMessage = (type, context = {}) => {
    const facultyName = context.faculty_name || 'A faculty member';
    const destination = context.destination ? ` at ${context.destination}` : '';
    const purpose = context.purpose ? ` for ${context.purpose}` : '';

    if (type === hrmuDashboardRepository.HRMU_NOTIFICATION_TYPE_ARRIVED) {
        return `${facultyName} marked the trip as arrived${destination}. Awaiting proof of compliance submission.`;
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
            tripStatus: locatorSlip.trip_status,
            cssuValidationStatus: normalizeCssuValidationStatus(locatorSlip.cssu_validation_status),
            cssuValidatedAt: locatorSlip.cssu_validated_at,
            cssuValidationNotes: locatorSlip.cssu_validation_notes || null,
            canStartTrip: canLocatorSlipStartTrip(locatorSlip, null),
            actions: getFacultyLocatorSlipActions(locatorSlip, null),
            displayStatus: String(locatorSlip.trip_status || '').toLowerCase() === 'completed' ? 'completed' : 'approved'
        }))
    };
};

const getLocatorSlipDetails = async (facultyUserId, locatorSlipId) => {
    const locatorSlip = await facultyTripRepository.getLocatorSlipForTripAccess(facultyUserId, locatorSlipId);
    ensureApprovedLocatorSlip(locatorSlip);

    let currentTrip = await facultyTripRepository.getCurrentTripForLocatorSlip(facultyUserId, locatorSlipId);

    // Older databases may not have trips.locator_slip_id yet, so fall back to the
    // best trip inferred for this specific locator slip only. Avoid attaching an
    // unrelated open trip from another slip, which can leak stale proof state into
    // a newly created locator slip.
    if (!currentTrip) {
        currentTrip = await facultyTripRepository.getBlockingTripForLocatorSlip(locatorSlipId, facultyUserId);
    }

    if (!currentTrip) {
        const existingOpenTrip = await facultyTripRepository.getOpenTripForUser(facultyUserId);
        if (existingOpenTrip && isTripOpen(existingOpenTrip)) {
            const slipTripStatus = String(locatorSlip.trip_status || '').toLowerCase();
            const slipIndicatesActiveTrip = ACTIVE_TRIP_STATUSES.has(slipTripStatus);

            // If this slip's own trip_status indicates it had an active trip (active/arrived/returning),
            // adopt the orphaned open trip unconditionally — the slip already knows it owns a trip.
            // Otherwise, only adopt when this is the sole approved locator slip to avoid
            // incorrectly attaching unrelated trips.
            let shouldAdopt = slipIndicatesActiveTrip;

            if (!shouldAdopt) {
                const approvedLocatorSlips = await facultyTripRepository.getApprovedLocatorSlips(facultyUserId);
                shouldAdopt =
                    (approvedLocatorSlips.length === 1 && String(approvedLocatorSlips[0]?.id || '') === String(locatorSlipId))
                    || existingOpenTrip.locator_slip_id == null;
            }

            if (shouldAdopt) {
                const adoptedTrip = await facultyTripRepository.updateTripLifecycle(existingOpenTrip.id, facultyUserId, {
                    locator_slip_id: locatorSlipId,
                });
                currentTrip = adoptedTrip || existingOpenTrip;
                await facultyTripRepository.updateLocatorSlipTripStatus(locatorSlipId, currentTrip.status || 'active');
            }
        }
    }

    const latestArrivalVerification = currentTrip
        ? await facultyTripRepository.getLatestArrivalVerification(currentTrip.id)
        : null;
    const latestLocatorSlipVerification = await facultyTripRepository.getLatestLocatorSlipLocationVerification(locatorSlip.id, facultyUserId);
    const effectiveVerification = latestLocatorSlipVerification || latestArrivalVerification;
    const effectiveTrip = hydrateTripWithVerification(currentTrip, effectiveVerification);
    const actions = getFacultyLocatorSlipActions(locatorSlip, effectiveTrip);

    return mapLocatorSlipResponse(
        {
            ...locatorSlip,
            canStartTrip: canLocatorSlipStartTrip(locatorSlip, currentTrip),
            actions
        },
        effectiveTrip,
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
        destinationLabel: null,
        lat: results[0].coordinates.lat,
        lng: results[0].coordinates.lng,
        method: 'search'
    });

    return {
        resolved: true,
        requiresManualPin: false,
        locatorSlip: updatedSlip,
        destination: {
            label: locatorSlip.destination || updatedSlip.destination,
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
    const providedOriginalDestination = String(payload.originalDestination || '').trim();
    const existingDestination = String(locatorSlip.destination || '').trim();
    const generatedPinnedLabel = String(payload.label || '').trim();
    const shouldKeepExistingDestination = existingDestination && !/^Pinned location\s*\(/i.test(existingDestination);
    const shouldUseProvidedOriginalDestination =
        providedOriginalDestination && !/^Pinned location\s*\(/i.test(providedOriginalDestination);
    const resolvedDestinationLabel = shouldUseProvidedOriginalDestination
        ? providedOriginalDestination
        : shouldKeepExistingDestination
            ? existingDestination
            : generatedPinnedLabel || locatorSlip.destination;

    const updatedSlip = await facultyTripRepository.updateLocatorSlipDestination(facultyUserId, locatorSlipId, {
        destinationLabel: resolvedDestinationLabel,
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
    const existingTripForSlip = await facultyTripRepository.getBlockingTripForLocatorSlip(locatorSlipId, facultyUserId);

    if (!canLocatorSlipStartTrip(locatorSlip, existingTripForSlip)) {
        throw createTripStartBlockedError(locatorSlip, existingTripForSlip);
    }

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
    if (existingTrip && isSameLocatorSlipTrip(existingTrip, locatorSlipId, existingTripForSlip) && isTripOpen(existingTrip)) {
        const resumedTrip = await hydrateTripWithSavedProofState(existingTrip, facultyUserId);
        const route = await mapboxService.getDirections({
            origin,
            destination,
            profile: payload.profile,
            alternatives: false
        });

        return {
            locatorSlip: {
                ...locatorSlip,
                trip_status: existingTrip.status || 'active',
                canStartTrip: false,
                actions: getFacultyLocatorSlipActions({
                    ...locatorSlip,
                    trip_status: resumedTrip?.status || existingTrip.status || 'active'
                }, resumedTrip || existingTrip)
            },
            trip: resumedTrip || existingTrip,
            route
        };
    }

    if (existingTrip && !existingTripForSlip) {
        const slipTripStatus = String(locatorSlip.trip_status || '').toLowerCase();
        const slipIndicatesActiveTrip = ACTIVE_TRIP_STATUSES.has(slipTripStatus);

        let shouldAdopt = slipIndicatesActiveTrip && isTripOpen(existingTrip);

        if (!shouldAdopt) {
            const approvedLocatorSlips = await facultyTripRepository.getApprovedLocatorSlips(facultyUserId);
            shouldAdopt = ((approvedLocatorSlips.length === 1 && String(approvedLocatorSlips[0]?.id || '') === locatorSlipId) || existingTrip.locator_slip_id == null) && isTripOpen(existingTrip);
        }

        if (shouldAdopt) {
            const adoptedTrip = await facultyTripRepository.updateTripLifecycle(existingTrip.id, facultyUserId, {
                locator_slip_id: locatorSlipId,
            });
            const effectiveTrip = await hydrateTripWithSavedProofState(adoptedTrip || existingTrip, facultyUserId);
            await facultyTripRepository.updateLocatorSlipTripStatus(locatorSlipId, effectiveTrip.status || 'active');

            const route = await mapboxService.getDirections({
                origin,
                destination,
                profile: payload.profile,
                alternatives: false
            });

            return {
                locatorSlip: {
                    ...locatorSlip,
                    trip_status: effectiveTrip.status || 'active',
                    canStartTrip: false,
                    actions: getFacultyLocatorSlipActions({
                        ...locatorSlip,
                        trip_status: effectiveTrip.status || 'active'
                    }, effectiveTrip)
                },
                trip: effectiveTrip,
                route
            };
        }
    }

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

        await tripRepository.seedTripStartLocation(client, {
            tripId: trip.id,
            userId: facultyUserId,
            lng: origin.lng,
            lat: origin.lat,
            accuracy: payload.originAccuracy === null || payload.originAccuracy === undefined ? null : Number(payload.originAccuracy),
            speed: null,
            heading: null,
            recordedAt: trip.started_at || new Date(),
            source: 'trip_start',
            syncStatus: 'synced'
        }).catch(() => null);

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
        await socketBroadcasterService.broadcastHrmuLiveActivityUpdate({
            facultyUserId,
            tripId: trip.id
        }).catch(() => null);

        return {
            locatorSlip: {
                ...locatorSlip,
                trip_status: 'active',
                canStartTrip: false,
                actions: getFacultyLocatorSlipActions({
                    ...locatorSlip,
                    trip_status: 'active'
                }, { status: 'active' })
            },
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
            title: 'Arrived at destination',
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
        await socketBroadcasterService.broadcastHrmuLiveLocationUpdate({
            tripId
        }).catch(() => null);
        await socketBroadcasterService.broadcastHrmuLiveActivityUpdate({
            facultyUserId,
            tripId
        }).catch(() => null);
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
    const effectiveLocatorSlipId = fallbackLocatorSlipId || trip.locator_slip_id;

    if (!effectiveLocatorSlipId) {
        throw new AppError('A locator slip is required to attach the arrival verification.', 409);
    }

    const linkedLocatorSlip = await facultyTripRepository.getLocatorSlipForTripAccess(facultyUserId, effectiveLocatorSlipId);
    ensureApprovedLocatorSlip(linkedLocatorSlip, trip);

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

    const latestArrivalVerification = await facultyTripRepository.getLatestArrivalVerification(tripId);
    const latestLocationVerification = trip.locator_slip_id
        ? await facultyTripRepository.getLatestLocatorSlipLocationVerification(trip.locator_slip_id, facultyUserId)
        : null;
    trip = hydrateTripWithVerification(trip, latestLocationVerification || latestArrivalVerification);

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
            title: 'Trip returning',
            subtitle: 'Heading back to the original departure point.',
            metadata: {
                locatorSlipId: trip.locator_slip_id
            },
            occurredAt: new Date()
        }).catch(() => null);
        await client.query('COMMIT');
        await socketBroadcasterService.broadcastHrmuLiveLocationUpdate({
            tripId
        }).catch(() => null);
        await socketBroadcasterService.broadcastHrmuLiveActivityUpdate({
            facultyUserId,
            tripId
        }).catch(() => null);
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

    const latestArrivalVerification = await facultyTripRepository.getLatestArrivalVerification(tripId);
    const latestLocationVerification = trip.locator_slip_id
        ? await facultyTripRepository.getLatestLocatorSlipLocationVerification(trip.locator_slip_id, facultyUserId)
        : null;
    trip = hydrateTripWithVerification(trip, latestLocationVerification || latestArrivalVerification);

    if (!['returning', 'arrived', 'active'].includes(getLogicalTripStatus(trip))) {
        throw new AppError('Only a returning trip can be completed.', 409);
    }

    if (!trip.arrival_verified_at) {
        throw new AppError('Arrival verification must be completed before ending the trip.', 409);
    }

    const endedAt = new Date();
    const totalDistanceMeters = await getTrackedTripDistanceMeters(trip, facultyUserId);
    const outboundDistanceMeters = Number.isFinite(Number(trip.outbound_distance_meters))
        ? Number(trip.outbound_distance_meters)
        : 0;
    const safeReturnDistanceMeters = 0;
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
            summary_generated_at: endedAt,
            return_distance_meters: safeReturnDistanceMeters,
            total_distance_meters: totalDistanceMeters,
            total_distance_km: totalDistanceKm,
            total_trip_minutes: totalTripMinutes,
            total_trip_hours: totalTripHours
        }, client);

        await facultyTripRepository.updateLocatorSlipLifecycle(trip.locator_slip_id, {
            status: 'completed',
            trip_status: 'completed',
            completed_at: endedAt
        }, client);
        await tripRepository.insertTripEvent(client, {
            tripId,
            userId: facultyUserId,
            eventType: 'trip_returned',
            title: 'Trip returned',
            subtitle: lateReturn.isLateReturn ? 'Returned to the starting location with a late return flag.' : 'Returned to the starting location.',
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
        await socketBroadcasterService.broadcastHrmuLiveActivityUpdate({
            facultyUserId,
            tripId
        }).catch(() => null);

        return {
            locatorSlip: {
                id: trip.locator_slip_id,
                status: 'completed',
                tripStatus: 'completed',
                completedAt: endedAt.toISOString()
            },
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
    const totals = await getComputedTripTotals(trip);

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
            outboundDistanceMeters: totals.outboundDistanceMeters,
            returnDistanceMeters: totals.returnDistanceMeters,
            totalDistanceMeters: totals.totalDistanceMeters,
            totalDistanceKm: totals.totalDistanceKm,
            totalTripMinutes: totals.totalTripMinutes,
            totalTripHours: totals.totalTripHours,
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
