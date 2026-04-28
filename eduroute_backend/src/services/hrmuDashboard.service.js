const AppError = require('../utils/appError');
const hrmuDashboardRepository = require('../repositories/hrmuDashboard.repository');
const VALID_LOCATOR_SLIP_STATUSES = new Set(['pending', 'approved', 'rejected', 'completed', 'cancelled']);

const formatRelativeTime = (value) => {
    if (!value) return null;

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;

    const diffMs = Date.now() - date.getTime();
    const diffSeconds = Math.max(Math.floor(diffMs / 1000), 0);

    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
    return `${Math.floor(diffSeconds / 86400)}d ago`;
};

const assertHrmuUser = async (userId) => {
    const user = await hrmuDashboardRepository.getHrmuUserContext(userId);

    if (!user) {
        throw new AppError('Only HRMU and admin users can access this dashboard.', 403);
    }

    return user;
};

const mapLiveFacultyRow = (row) => ({
    facultyUserId: row.faculty_user_id,
    facultyName: row.faculty_name,
    employeeId: row.employee_id,
    position: row.department_position || 'Instructor',
    collegeId: row.college_id,
    collegeName: row.college_name,
    locatorSlipId: row.locator_slip_id,
    tripId: row.trip_id,
    lat: row.lat === null ? null : Number(row.lat),
    lng: row.lng === null ? null : Number(row.lng),
    heading: row.heading === null ? null : Number(row.heading),
    speed: row.speed === null ? null : Number(row.speed),
    lastUpdatedAt: row.last_updated_at ? new Date(row.last_updated_at).toISOString() : null,
    destination: row.destination || null,
    purpose: row.purpose || null,
    purposeOfTravel: row.purpose_of_travel || null,
    departureTime: row.departure_datetime ? new Date(row.departure_datetime).toISOString() : null,
    expectedReturnTime: row.expected_return_datetime ? new Date(row.expected_return_datetime).toISOString() : null,
    approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : null,
    reviewedByName: row.reviewed_by_name || null,
    reviewedByRole: row.reviewed_by_role || null,
    tripStatus: row.trip_status,
    verificationStatus: 'verified'
});

const mapRecentActivityRow = (row) => {
    let currentStatusLabel = 'on_site';

    if (row.trip_status === 'active') {
        currentStatusLabel = 'off_site';
    } else if (row.trip_status === 'completed' || row.verification_status === 'completed') {
        currentStatusLabel = 'returned';
    } else if (row.verification_status === 'pending') {
        currentStatusLabel = 'pending_verification';
    } else if (row.verification_status === 'rejected') {
        currentStatusLabel = 'rejected';
    } else if (row.verification_status === 'approved') {
        currentStatusLabel = 'verified';
    }

    return {
        locatorSlipId: row.locator_slip_id,
        tripId: row.trip_id,
        facultyUserId: row.faculty_user_id,
        facultyName: row.faculty_name,
        collegeName: row.college_name,
        departmentName: row.department_name,
        departureTime: row.departure_time ? new Date(row.departure_time).toISOString() : null,
        expectedReturnTime: row.expected_return_time ? new Date(row.expected_return_time).toISOString() : null,
        purpose: row.purpose,
        verificationStatus: row.verification_status,
        tripStatus: row.trip_status,
        currentStatusLabel
    };
};

const getDashboardSummary = async (userId) => {
    await assertHrmuUser(userId);
    const summary = await hrmuDashboardRepository.getDashboardSummaryStats();

    return {
        totalFacultyOutside: summary.total_faculty_outside || 0,
        latestActivity: formatRelativeTime(summary.latest_activity_at),
        latestActivityAt: summary.latest_activity_at ? new Date(summary.latest_activity_at).toISOString() : null,
        verifiedLocatorSlips: summary.verified_locator_slips || 0,
        pendingSlips: summary.unverified_cases || 0,
        unverifiedCases: summary.unverified_cases || 0,
        verificationRate: (() => {
            const verified = Number(summary.verified_locator_slips || 0);
            const pending = Number(summary.unverified_cases || 0);
            const total = verified + pending;

            if (!total) return 0;

            return Number(((verified / total) * 100).toFixed(1));
        })()
    };
};

const getLiveFaculty = async (userId) => {
    await assertHrmuUser(userId);
    const rows = await hrmuDashboardRepository.getLiveFacultyRows();

    return {
        faculty: rows.map(mapLiveFacultyRow)
    };
};

const getNotifications = async (userId, query = {}) => {
    await assertHrmuUser(userId);
    const result = await hrmuDashboardRepository.getHrmuNotificationsPage(userId, query);

    return {
        notifications: result.rows.map((row) => ({
            id: row.id,
            locatorSlipId: row.locator_slip_id,
            facultyName: row.faculty_name,
            collegeName: row.college_name,
            purpose: row.purpose,
            status: row.status,
            message: row.message,
            approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : null,
            reviewedByName: row.reviewed_by_name || null
        })),
        pagination: result.pagination
    };
};

const getRecentActivity = async (userId, query = {}) => {
    await assertHrmuUser(userId);
    if (query.status && !VALID_LOCATOR_SLIP_STATUSES.has(query.status)) {
        throw new AppError('Recent activity status filter is invalid.', 400);
    }
    if (query.verification && !['verified', 'unverified'].includes(query.verification)) {
        throw new AppError('Recent activity verification filter is invalid.', 400);
    }

    const result = await hrmuDashboardRepository.getRecentActivityPage(query);

    return {
        activities: result.rows.map(mapRecentActivityRow),
        pagination: result.pagination
    };
};

const getLiveTracking = async (userId) => getLiveFaculty(userId);

const getExportCsvPlaceholder = async (userId) => {
    await assertHrmuUser(userId);

    return {
        message: 'CSV export is not implemented yet.',
        status: 'not_implemented'
    };
};

module.exports = {
    formatRelativeTime,
    mapLiveFacultyRow,
    getDashboardSummary,
    getLiveFaculty,
    getNotifications,
    getRecentActivity,
    getLiveTracking,
    getExportCsvPlaceholder
};
