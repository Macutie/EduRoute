const env = require('../config/env');
const tripIncidentRepository = require('../repositories/tripIncident.repository');
const hrmuDashboardRepository = require('../repositories/hrmuDashboard.repository');
const socketBroadcasterService = require('./socketBroadcaster.service');

const INCIDENT_LABELS = {
    LATE_RETURN: 'Late Return',
    UNVERIFIED_LOCATION: 'Unverified Location/Signature',
    LOCATION_DISCONNECTED: 'Location Disconnected'
};

const formatExpectedReturnClock = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
};

const formatLateReturnDurationLabel = (minutesLate) => {
    const safeMinutes = Math.max(Number(minutesLate || 0), 0);
    if (safeMinutes >= 60) {
        const hoursLate = Math.floor(safeMinutes / 60);
        return `more than ${hoursLate} hour${hoursLate === 1 ? '' : 's'}`;
    }

    return `${safeMinutes} minute${safeMinutes === 1 ? '' : 's'}`;
};

const getDetectedAt = (context) => (
    context.ended_at
    || context.latest_location_at
    || context.last_location_log_at
    || context.verification_created_at
    || context.trip_updated_at
    || context.locator_updated_at
    || new Date()
);

const isSameMoment = (left, right) => {
    if (!(left instanceof Date) || !(right instanceof Date)) return false;
    if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return false;
    return left.getTime() === right.getTime();
};

const shouldReplaceExistingManualReviewTime = (existingManualReviewedAt, context) => {
    if (!(existingManualReviewedAt instanceof Date) || Number.isNaN(existingManualReviewedAt.getTime())) {
        return true;
    }

    const suspiciousFallbackDates = [
        context?.ended_at ? new Date(context.ended_at) : null,
        context?.verification_created_at ? new Date(context.verification_created_at) : null,
        context?.trip_updated_at ? new Date(context.trip_updated_at) : null,
        context?.locator_updated_at ? new Date(context.locator_updated_at) : null
    ].filter(Boolean);

    return suspiciousFallbackDates.some((candidate) => isSameMoment(existingManualReviewedAt, candidate));
};

const ensureIncidentTable = async () => {
    const exists = await tripIncidentRepository.getIncidentTableExists();
    return Boolean(exists);
};

const getNotificationConfig = (incidentType, context, metadata = {}) => {
    switch (incidentType) {
    case tripIncidentRepository.INCIDENT_TYPES.LATE_RETURN:
        return {
            type: hrmuDashboardRepository.HRMU_NOTIFICATION_TYPE_LATE_RETURN,
            title: 'Late return detected',
            message: `${context.faculty_name || 'A faculty member'} returned ${formatLateReturnDurationLabel(metadata.minutesLate)} after the expected return time of ${formatExpectedReturnClock(metadata.expectedReturnTime || context.expected_return_datetime) || 'the approved return time'}.`
        };
    case tripIncidentRepository.INCIDENT_TYPES.UNVERIFIED_LOCATION:
        return {
            type: hrmuDashboardRepository.HRMU_NOTIFICATION_TYPE_UNVERIFIED_LOCATION,
            title: 'Arrival verification failed review',
            message: `${context.faculty_name || 'A faculty member'} has an arrival verification/signature that HRMU marked as unverified for ${context.destination || 'the approved destination'}.`
        };
    case tripIncidentRepository.INCIDENT_TYPES.LOCATION_DISCONNECTED:
        return {
            type: hrmuDashboardRepository.HRMU_NOTIFICATION_TYPE_LOCATION_DISCONNECTED,
            title: 'Live location disconnected',
            message: `${context.faculty_name || 'A faculty member'} has stopped sharing live location updates for ${context.destination || 'the active trip'}.`
        };
    default:
        return null;
    }
};

const emitIncidentSignals = async (context, incident, metadata = {}) => {
    if (!incident || !context?.locator_slip_id) return incident;

    const notificationConfig = getNotificationConfig(incident.incident_type, context, metadata);

    if (notificationConfig) {
        await hrmuDashboardRepository.createHrmuTripEventNotifications(null, {
            locatorSlipId: context.locator_slip_id,
            type: notificationConfig.type,
            title: notificationConfig.title,
            message: notificationConfig.message
        }).catch(() => null);

        await socketBroadcasterService.broadcastHrmuNotificationNew({
            type: notificationConfig.type,
            title: notificationConfig.title,
            message: notificationConfig.message,
            locatorSlipId: context.locator_slip_id,
            tripId: context.trip_id,
            incidentType: incident.incident_type,
            createdAt: incident.detected_at ? new Date(incident.detected_at).toISOString() : new Date().toISOString()
        }).catch(() => null);
    }

    await socketBroadcasterService.broadcastHrmuIncidentNew({
        incidentId: incident.id,
        tripId: context.trip_id,
        locatorSlipId: context.locator_slip_id,
        facultyName: context.faculty_name,
        incidentType: incident.incident_type,
        incidentLabel: incident.incident_label,
        severity: incident.severity,
        detectedAt: incident.detected_at ? new Date(incident.detected_at).toISOString() : new Date().toISOString(),
        message: notificationConfig?.message || `${incident.incident_label} detected.`
    }).catch(() => null);

    await socketBroadcasterService.broadcastHrmuDashboardUpdate().catch(() => null);

    return incident;
};

const detectLateReturn = async (context) => {
    const actualReturnSource = context?.ended_at || context?.trip_updated_at;
    if (!context?.expected_return_datetime || !actualReturnSource) return null;

    const expectedReturn = new Date(context.expected_return_datetime);
    const actualEnd = new Date(actualReturnSource);
    const graceMinutes = Number(env.lateReturnGraceMinutes || 60);
    const threshold = new Date(expectedReturn.getTime() + (graceMinutes * 60 * 1000));

    if (Number.isNaN(expectedReturn.getTime()) || Number.isNaN(actualEnd.getTime()) || actualEnd <= threshold) {
        return null;
    }

    const minutesLate = Math.max(Math.round((actualEnd.getTime() - expectedReturn.getTime()) / 60000), 0);

    const incident = await tripIncidentRepository.upsertTripIncident({
        tripId: context.trip_id,
        locatorSlipId: context.locator_slip_id,
        facultyUserId: context.faculty_user_id,
        incidentType: tripIncidentRepository.INCIDENT_TYPES.LATE_RETURN,
        incidentLabel: INCIDENT_LABELS.LATE_RETURN,
        severity: 'high',
        detectedAt: actualEnd,
        metadata: {
            expectedReturnTime: expectedReturn.toISOString(),
            actualReturnTime: actualEnd.toISOString(),
            minutesLate,
            graceMinutes
        }
    });

    return emitIncidentSignals(context, incident, {
        minutesLate,
        expectedReturnTime: expectedReturn.toISOString()
    });
};

const detectUnverifiedLocation = async (context) => {
    if (!context?.trip_id) return null;

    const verificationStatus = String(context.verification_status || '').toLowerCase();
    const rejectedStatuses = ['rejected', 'unverified', 'failed'];

    if (!rejectedStatuses.includes(verificationStatus)) {
        return null;
    }

    const incident = await tripIncidentRepository.upsertTripIncident({
        tripId: context.trip_id,
        locatorSlipId: context.locator_slip_id,
        facultyUserId: context.faculty_user_id,
        incidentType: tripIncidentRepository.INCIDENT_TYPES.UNVERIFIED_LOCATION,
        incidentLabel: INCIDENT_LABELS.UNVERIFIED_LOCATION,
        severity: verificationStatus === 'rejected' ? 'high' : 'medium',
        detectedAt: getDetectedAt(context),
        metadata: {
            verificationStatus
        }
    });

    return emitIncidentSignals(context, incident);
};

const detectLocationDisconnected = async (context) => {
    if (!context?.trip_id) return null;

    const inProgressStatuses = ['active', 'arrived', 'returning'];
    if (!inProgressStatuses.includes(String(context.trip_status || '').toLowerCase())) {
        return null;
    }

    const thresholdMinutes = Number(env.locationDisconnectedMinutes || env.liveLocationStaleMinutes || 30);
    const thresholdMs = thresholdMinutes * 60 * 1000;
    const startedAt = context.started_at ? new Date(context.started_at) : null;
    const latestLocationAt = context.latest_location_at ? new Date(context.latest_location_at) : null;
    const compareTime = new Date();

    let shouldFlag = false;
    const metadata = {
        staleThresholdMinutes: thresholdMinutes
    };

    if (startedAt && !Number.isNaN(startedAt.getTime())) {
        metadata.tripStartedAt = startedAt.toISOString();
    }

    if (latestLocationAt && !Number.isNaN(latestLocationAt.getTime())) {
        metadata.lastLocationAt = latestLocationAt.toISOString();
        if ((compareTime.getTime() - latestLocationAt.getTime()) > thresholdMs) {
            shouldFlag = true;
        }
    } else if (startedAt && !Number.isNaN(startedAt.getTime()) && (compareTime.getTime() - startedAt.getTime()) > thresholdMs) {
        shouldFlag = true;
        metadata.lastLocationAt = null;
    }

    if (!shouldFlag && startedAt && !Number.isNaN(startedAt.getTime())) {
        const pointCount = Number(context.location_point_count || 0);
        const minLat = context.min_lat === null ? null : Number(context.min_lat);
        const maxLat = context.max_lat === null ? null : Number(context.max_lat);
        const minLng = context.min_lng === null ? null : Number(context.min_lng);
        const maxLng = context.max_lng === null ? null : Number(context.max_lng);
        const hasSinglePosition =
            pointCount > 0
            && Number.isFinite(minLat)
            && Number.isFinite(maxLat)
            && Number.isFinite(minLng)
            && Number.isFinite(maxLng)
            && minLat === maxLat
            && minLng === maxLng;

        if (hasSinglePosition && (compareTime.getTime() - startedAt.getTime()) > thresholdMs) {
            shouldFlag = true;
            metadata.noMovementSinceStart = true;
            metadata.locationPointCount = pointCount;
        }
    }

    if (!shouldFlag) {
        return null;
    }

    const incident = await tripIncidentRepository.upsertTripIncident({
        tripId: context.trip_id,
        locatorSlipId: context.locator_slip_id,
        facultyUserId: context.faculty_user_id,
        incidentType: tripIncidentRepository.INCIDENT_TYPES.LOCATION_DISCONNECTED,
        incidentLabel: INCIDENT_LABELS.LOCATION_DISCONNECTED,
        severity: 'medium',
        detectedAt: getDetectedAt(context),
        metadata
    });

    return emitIncidentSignals(context, incident);
};

const flagTripAsUnverifiedLocation = async (tripId, metadata = {}) => {
    const canRun = await ensureIncidentTable();
    if (!canRun || !tripId) return null;

    const context = await tripIncidentRepository.getTripIncidentContext(tripId);
    if (!context) return null;
    const existingIncident = await tripIncidentRepository.getTripIncidentByType(
        context.trip_id,
        tripIncidentRepository.INCIDENT_TYPES.UNVERIFIED_LOCATION
    );
    const reviewedAt = metadata.reviewedAt ? new Date(metadata.reviewedAt) : null;
    const existingMetadata = existingIncident?.metadata && typeof existingIncident.metadata === 'object'
        ? existingIncident.metadata
        : {};
    const existingManualReviewedAt = existingMetadata.reviewSource === 'hrmu_manual_review' && existingMetadata.reviewedAt
        ? new Date(existingMetadata.reviewedAt)
        : null;
    const shouldUseExistingManualReviewedAt =
        existingManualReviewedAt
        && !Number.isNaN(existingManualReviewedAt.getTime())
        && !shouldReplaceExistingManualReviewTime(existingManualReviewedAt, context);
    const detectedAt = shouldUseExistingManualReviewedAt
        ? existingManualReviewedAt
        : (reviewedAt && !Number.isNaN(reviewedAt.getTime()) ? reviewedAt : new Date());

    const incident = await tripIncidentRepository.upsertTripIncident({
        tripId: context.trip_id,
        locatorSlipId: context.locator_slip_id,
        facultyUserId: context.faculty_user_id,
        incidentType: tripIncidentRepository.INCIDENT_TYPES.UNVERIFIED_LOCATION,
        incidentLabel: INCIDENT_LABELS.UNVERIFIED_LOCATION,
        severity: 'high',
        detectedAt,
        metadata: {
            verificationStatus: 'rejected',
            reviewSource: metadata.reviewSource || 'hrmu_manual_review',
            noProofSubmitted: Boolean(metadata.noProofSubmitted),
            reviewedAt: (reviewedAt && !Number.isNaN(reviewedAt.getTime()) ? reviewedAt : detectedAt).toISOString()
        }
    });

    return emitIncidentSignals(
        {
            ...context,
            verification_status: 'rejected'
        },
        incident
    );
};

const detectAllTripIncidents = async (tripId) => {
    const canRun = await ensureIncidentTable();
    if (!canRun) return [];

    const context = await tripIncidentRepository.getTripIncidentContext(tripId);
    if (!context) return [];

    const results = await Promise.all([
        detectLateReturn(context),
        detectUnverifiedLocation(context),
        detectLocationDisconnected(context)
    ]);

    return results.filter(Boolean);
};

const evaluateTripIncidents = detectAllTripIncidents;

const detectDisconnectedActiveTrips = async () => {
    const canRun = await ensureIncidentTable();
    if (!canRun) return [];

    const tripIds = await tripIncidentRepository.getActiveTripIdsForIncidentScan().catch(() => []);
    const results = [];

    for (const tripId of tripIds) {
        const incidents = await detectAllTripIncidents(tripId).catch(() => []);
        results.push(...incidents);
    }

    return results;
};

const detectEndedTripsForIncidentScan = async () => {
    const canRun = await ensureIncidentTable();
    if (!canRun) return [];

    const tripIds = await tripIncidentRepository.getEndedTripIdsForIncidentScan().catch(() => []);
    const results = [];

    for (const tripId of tripIds) {
        const incidents = await detectAllTripIncidents(tripId).catch(() => []);
        results.push(...incidents);
    }

    return results;
};

module.exports = {
    INCIDENT_LABELS,
    detectLateReturn,
    detectUnverifiedLocation,
    detectLocationDisconnected,
    flagTripAsUnverifiedLocation,
    detectAllTripIncidents,
    evaluateTripIncidents,
    detectDisconnectedActiveTrips,
    detectEndedTripsForIncidentScan
};
