const env = require('../config/env');
const tripIncidentRepository = require('../repositories/tripIncident.repository');

const INCIDENT_LABELS = {
    LATE_RETURN: 'Late Return',
    UNVERIFIED_LOCATION: 'Unverified Location Verification',
    LIVE_LOCATION_DISCONNECTED: 'Live Location Disconnected'
};

const getDetectedAt = (context) => (
    context.ended_at
    || context.latest_location_at
    || context.verification_created_at
    || context.trip_updated_at
    || context.locator_updated_at
    || new Date()
);

const ensureIncidentTable = async () => {
    const exists = await tripIncidentRepository.getIncidentTableExists();
    if (!exists) {
        return false;
    }

    return true;
};

const detectLateReturn = async (context) => {
    if (!context?.expected_return_datetime || !context?.ended_at) return null;

    const expectedReturn = new Date(context.expected_return_datetime);
    const actualEnd = new Date(context.ended_at);
    const threshold = new Date(expectedReturn.getTime() + (60 * 60 * 1000));

    if (Number.isNaN(expectedReturn.getTime()) || Number.isNaN(actualEnd.getTime()) || actualEnd <= threshold) {
        return null;
    }

    const minutesLate = Math.max(Math.round((actualEnd.getTime() - expectedReturn.getTime()) / 60000), 0);

    return tripIncidentRepository.upsertTripIncident({
        tripId: context.trip_id,
        locatorSlipId: context.locator_slip_id,
        facultyUserId: context.faculty_user_id,
        incidentType: tripIncidentRepository.INCIDENT_TYPES.LATE_RETURN,
        incidentLabel: INCIDENT_LABELS.LATE_RETURN,
        severity: 'high',
        detectedAt: actualEnd,
        metadata: {
            expectedReturnTime: expectedReturn.toISOString(),
            actualEndTime: actualEnd.toISOString(),
            minutesLate
        }
    });
};

const detectUnverifiedLocation = async (context) => {
    if (!context?.trip_id || !context?.ended_at) return null;

    const verificationStatus = String(context.verification_status || '').toLowerCase();
    const missingOrFailed = !verificationStatus || !['accepted', 'verified'].includes(verificationStatus);

    if (!missingOrFailed) {
        return null;
    }

    return tripIncidentRepository.upsertTripIncident({
        tripId: context.trip_id,
        locatorSlipId: context.locator_slip_id,
        facultyUserId: context.faculty_user_id,
        incidentType: tripIncidentRepository.INCIDENT_TYPES.UNVERIFIED_LOCATION,
        incidentLabel: INCIDENT_LABELS.UNVERIFIED_LOCATION,
        severity: verificationStatus === 'rejected' ? 'high' : 'medium',
        detectedAt: getDetectedAt(context),
        metadata: {
            verificationStatus: verificationStatus || 'missing'
        }
    });
};

const detectDisconnectedLocation = async (context) => {
    if (!context?.trip_id || !context?.latest_location_at) return null;

    const latestLocationAt = new Date(context.latest_location_at);
    if (Number.isNaN(latestLocationAt.getTime())) return null;

    const staleThresholdMinutes = Number(env.liveLocationStaleMinutes || 5);
    const staleThresholdMs = staleThresholdMinutes * 60 * 1000;
    const compareTime = context.trip_status === 'active'
        ? new Date()
        : (context.ended_at ? new Date(context.ended_at) : new Date());

    if (compareTime.getTime() - latestLocationAt.getTime() <= staleThresholdMs) {
        return null;
    }

    return tripIncidentRepository.upsertTripIncident({
        tripId: context.trip_id,
        locatorSlipId: context.locator_slip_id,
        facultyUserId: context.faculty_user_id,
        incidentType: tripIncidentRepository.INCIDENT_TYPES.LIVE_LOCATION_DISCONNECTED,
        incidentLabel: INCIDENT_LABELS.LIVE_LOCATION_DISCONNECTED,
        severity: 'medium',
        detectedAt: context.ended_at || compareTime,
        metadata: {
            lastLocationAt: latestLocationAt.toISOString(),
            staleThresholdMinutes
        }
    });
};

const evaluateTripIncidents = async (tripId) => {
    const canRun = await ensureIncidentTable();
    if (!canRun) return [];

    const context = await tripIncidentRepository.getTripIncidentContext(tripId);
    if (!context) return [];

    const results = await Promise.all([
        detectLateReturn(context),
        detectUnverifiedLocation(context),
        detectDisconnectedLocation(context)
    ]);

    return results.filter(Boolean);
};

const detectDisconnectedActiveTrips = async () => {
    const canRun = await ensureIncidentTable();
    if (!canRun) return [];

    const tripIds = await tripIncidentRepository.getActiveTripIdsForIncidentScan().catch(() => []);
    const results = [];

    for (const tripId of tripIds) {
        const incidents = await evaluateTripIncidents(tripId).catch(() => []);
        results.push(...incidents);
    }

    return results;
};

module.exports = {
    INCIDENT_LABELS,
    evaluateTripIncidents,
    detectDisconnectedActiveTrips
};
