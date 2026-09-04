const { getSocketServer } = require('../socket/socketBus');
const hrmuDashboardRepository = require('../repositories/hrmuDashboard.repository');
const hrmuLiveTrackingRepository = require('../repositories/hrmuLiveTracking.repository');
const tripIncidentRepository = require('../repositories/tripIncident.repository');
const { formatRelativeTime, mapLiveFacultyRow } = require('../utils/hrmuDashboardMappers');
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
    // Deprecated: live employee coordinates are no longer broadcast.
    return null;
};

const broadcastHrmuLiveActivityUpdate = async ({ facultyUserId, tripId, limit = 1 } = {}) => {
    // Deprecated: movement/activity feeds tied to live location are no longer broadcast.
    return null;
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
