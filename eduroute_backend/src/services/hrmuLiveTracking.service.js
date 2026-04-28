const env = require('../config/env');
const AppError = require('../utils/appError');
const hrmuDashboardRepository = require('../repositories/hrmuDashboard.repository');
const hrmuLiveTrackingRepository = require('../repositories/hrmuLiveTracking.repository');

const OLONGAPO_CENTER = {
    lat: 14.8386,
    lng: 120.2828,
    label: 'Olongapo City'
};

const ACTIVE_MARKER_COLOR = 'green';
const STALE_MARKER_COLOR = 'muted-green';

const formatRelativeTime = (value) => {
    if (!value) return 'Awaiting update';

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return 'Awaiting update';

    const diffSeconds = Math.max(Math.floor((Date.now() - date.getTime()) / 1000), 0);

    if (diffSeconds < 10) return 'Just now';
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
    return `${Math.floor(diffSeconds / 86400)}d ago`;
};

const getFacultyInitials = (fullName) => String(fullName || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'FA';

const isFreshLocation = (recordedAt) => {
    if (!recordedAt) return false;

    const date = recordedAt instanceof Date ? recordedAt : new Date(recordedAt);
    if (Number.isNaN(date.getTime())) return false;

    const staleMs = Number(env.liveLocationStaleMinutes || 5) * 60 * 1000;
    return Date.now() - date.getTime() <= staleMs;
};

const normalizeSpeedKmh = (speed) => {
    if (speed === null || speed === undefined || Number.isNaN(Number(speed))) return null;
    return Number(Number(speed).toFixed(1));
};

const assertHrmuUser = async (userId) => {
    const user = await hrmuDashboardRepository.getHrmuUserContext(userId);

    if (!user) {
        throw new AppError('Only HRMU and admin users can access HRMU live tracking.', 403);
    }

    return user;
};

const mapFacultyMarkerRow = (row) => {
    const fresh = isFreshLocation(row.recorded_at);
    const markerStatus = fresh ? 'active' : 'stale';

    return {
        facultyUserId: row.faculty_user_id,
        facultyName: row.faculty_name,
        facultyInitials: getFacultyInitials(row.faculty_name),
        facultyRoleOrPosition: row.position || 'Instructor',
        position: row.position || 'Instructor',
        collegeName: row.college_name,
        tripId: row.trip_id,
        locatorSlipId: row.locator_slip_id,
        lat: row.lat === null ? null : Number(row.lat),
        lng: row.lng === null ? null : Number(row.lng),
        speedKmh: normalizeSpeedKmh(row.speed),
        heading: row.heading === null ? null : Number(row.heading),
        destination: row.destination || row.destination_name || 'Unknown destination',
        lastUpdatedAt: row.recorded_at ? new Date(row.recorded_at).toISOString() : null,
        lastUpdatedLabel: formatRelativeTime(row.recorded_at),
        markerStatus,
        marker: {
            type: 'circle',
            color: fresh ? ACTIVE_MARKER_COLOR : STALE_MARKER_COLOR,
            status: markerStatus,
            label: getFacultyInitials(row.faculty_name)
        }
    };
};

const mapActivityItem = (row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    subtitle: row.subtitle,
    occurredAt: row.occurred_at ? new Date(row.occurred_at).toISOString() : null,
    relativeTime: formatRelativeTime(row.occurred_at)
});

const getActiveFaculty = async (userId) => {
    await assertHrmuUser(userId);
    const rows = await hrmuLiveTrackingRepository.getActiveFacultyRows();

    return {
        center: OLONGAPO_CENTER,
        faculty: rows.map(mapFacultyMarkerRow)
    };
};

const getFacultyDetails = async (userId, facultyUserId) => {
    await assertHrmuUser(userId);
    const row = await hrmuLiveTrackingRepository.getActiveFacultyRowByUserId(facultyUserId);

    if (!row) {
        throw new AppError('Active faculty trip not found.', 404);
    }

    return {
        faculty: {
            facultyUserId: row.faculty_user_id,
            facultyName: row.faculty_name,
            facultyInitials: getFacultyInitials(row.faculty_name),
            position: row.position || 'Instructor',
            collegeName: row.college_name
        },
        activeTrip: {
            tripId: row.trip_id,
            locatorSlipId: row.locator_slip_id,
            purpose: row.purpose || 'Official trip',
            destination: row.destination || row.destination_name || 'Unknown destination',
            status: row.trip_status,
            startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
            expectedReturnTime: row.expected_return_datetime ? new Date(row.expected_return_datetime).toISOString() : null
        },
        latestLocation: {
            lat: row.lat === null ? null : Number(row.lat),
            lng: row.lng === null ? null : Number(row.lng),
            speedKmh: normalizeSpeedKmh(row.speed),
            heading: row.heading === null ? null : Number(row.heading),
            recordedAt: row.recorded_at ? new Date(row.recorded_at).toISOString() : null,
            lastUpdatedLabel: formatRelativeTime(row.recorded_at)
        }
    };
};

const getFacultyActivity = async (userId, facultyUserId, query = {}) => {
    await assertHrmuUser(userId);
    const result = await hrmuLiveTrackingRepository.getFacultyActivityRows({
        facultyUserId,
        tripId: query.tripId || null,
        limit: query.limit || 12
    });

    return {
        facultyUserId,
        tripId: result.tripId,
        activity: result.rows.map(mapActivityItem)
    };
};

module.exports = {
    OLONGAPO_CENTER,
    formatRelativeTime,
    getFacultyInitials,
    isFreshLocation,
    normalizeSpeedKmh,
    mapFacultyMarkerRow,
    mapActivityItem,
    getActiveFaculty,
    getFacultyDetails,
    getFacultyActivity
};
