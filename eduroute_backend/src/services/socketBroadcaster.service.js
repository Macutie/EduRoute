const { getSocketServer } = require('../socket/socketBus');
const hrmuDashboardRepository = require('../repositories/hrmuDashboard.repository');
const hrmuLiveTrackingRepository = require('../repositories/hrmuLiveTracking.repository');
const tripIncidentRepository = require('../repositories/tripIncident.repository');
const { formatRelativeTime, mapLiveFacultyRow } = require('./hrmuDashboard.service');
const { mapFacultyMarkerRow, mapActivityItem } = require('./hrmuLiveTracking.service');

const emitToHrmu = (eventName, payload) => {
    const io = getSocketServer();
    if (!io) return;
    io.to('hrmu').emit(eventName, payload);
    io.to('hrmu:live-tracking').emit(eventName, payload);
};

const broadcastHrmuDashboardUpdate = async () => {
    const summary = await hrmuDashboardRepository.getDashboardSummaryStats().catch(() => null);
    if (!summary) return null;

    const payload = {
        totalFacultyOutside: summary.total_faculty_outside || 0,
        latestActivity: formatRelativeTime(summary.latest_activity_at),
        latestActivityAt: summary.latest_activity_at ? new Date(summary.latest_activity_at).toISOString() : null,
        verifiedLocatorSlips: summary.verified_locator_slips || 0,
        pendingSlips: summary.unverified_cases || 0,
        unverifiedCases: summary.unverified_cases || 0
    };

    const incidentSummary = await tripIncidentRepository.getVerificationSummary().catch(() => null);
    if (incidentSummary) {
        payload.flaggedIncidents = Number(incidentSummary.flagged_trips || 0);
        payload.incidentSummary = {
            lateReturn: Number(incidentSummary.late_returns || 0),
            unverifiedLocation: Number(incidentSummary.unverified_locations || 0),
            locationDisconnected: Number(incidentSummary.disconnected_locations || 0)
        };
    }

    emitToHrmu('hrmu:dashboard:update', payload);
    return payload;
};

const broadcastHrmuLiveLocationUpdate = async (payload = null) => {
    if (payload) {
        const row = await hrmuDashboardRepository.getLiveFacultyRowByTripId(payload.tripId).catch(() => null);
        const livePayload = row ? mapLiveFacultyRow(row) : payload;
        emitToHrmu('hrmu:live-location:update', livePayload);
        const activeFacultyRow = await hrmuLiveTrackingRepository.getActiveFacultyRowByTripId(payload.tripId).catch(() => null);
        if (activeFacultyRow) {
            emitToHrmu('hrmu:faculty-location:update', mapFacultyMarkerRow(activeFacultyRow));
        }
        return livePayload;
    }

    const liveFacultyRows = await hrmuDashboardRepository.getLiveFacultyRows().catch(() => null);
    if (!liveFacultyRows) return null;

    const liveFaculty = {
        faculty: liveFacultyRows.map(mapLiveFacultyRow)
    };

    emitToHrmu('hrmu:live-location:update', liveFaculty);
    const activeFacultyRows = await hrmuLiveTrackingRepository.getActiveFacultyRows().catch(() => null);
    if (activeFacultyRows) {
        emitToHrmu('hrmu:faculty-location:update', {
            center: {
                lat: 14.8386,
                lng: 120.2828,
                label: 'Olongapo City'
            },
            faculty: activeFacultyRows.map(mapFacultyMarkerRow)
        });
    }
    return liveFaculty;
};

const broadcastHrmuLiveActivityUpdate = async ({ facultyUserId, tripId, limit = 1 } = {}) => {
    if (!facultyUserId || !tripId) return null;

    const result = await hrmuLiveTrackingRepository.getFacultyActivityRows({
        facultyUserId,
        tripId,
        limit
    }).catch(() => null);

    const latestRow = result?.rows?.[0];
    if (!latestRow) return null;

    const payload = {
        facultyUserId,
        tripId,
        activityItem: mapActivityItem(latestRow)
    };

    emitToHrmu('hrmu:faculty-activity:update', payload);
    return payload;
};

const broadcastHrmuNotificationNew = async (payload) => {
    if (!payload) return null;
    emitToHrmu('hrmu:notification:new', payload);
    return payload;
};

const broadcastHrmuIncidentNew = async (payload) => {
    if (!payload) return null;
    emitToHrmu('hrmu:incident:new', payload);
    return payload;
};

module.exports = {
    emitToHrmu,
    broadcastHrmuDashboardUpdate,
    broadcastHrmuLiveLocationUpdate,
    broadcastHrmuLiveActivityUpdate,
    broadcastHrmuNotificationNew,
    broadcastHrmuIncidentNew
};
