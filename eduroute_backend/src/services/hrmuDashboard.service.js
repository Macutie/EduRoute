const AppError = require('../utils/appError');
const hrmuDashboardRepository = require('../repositories/hrmuDashboard.repository');
const hrmuReportInboxRepository = require('../repositories/hrmuReportInbox.repository');
const tripIncidentRepository = require('../repositories/tripIncident.repository');
const tripIncidentService = require('./tripIncident.service');
const { computeLocatorSlipDisplayStatus, DISPLAY_STATUSES } = require('./status.service');
const VALID_LOCATOR_SLIP_STATUSES = new Set(['pending', 'approved', 'verified', 'rejected', 'completed', 'cancelled']);

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

const formatLateReturnDurationLabel = (expectedReturnTime, actualReturnTime) => {
    if (!expectedReturnTime || !actualReturnTime) return 'late';
    const expected = new Date(expectedReturnTime);
    const actual = new Date(actualReturnTime);
    if (Number.isNaN(expected.getTime()) || Number.isNaN(actual.getTime())) return 'late';

    const minutesLate = Math.max(Math.round((actual.getTime() - expected.getTime()) / 60000), 0);
    if (minutesLate >= 60) {
        const hoursLate = Math.floor(minutesLate / 60);
        return `more than ${hoursLate} hour${hoursLate === 1 ? '' : 's'}`;
    }

    return `${minutesLate} minute${minutesLate === 1 ? '' : 's'}`;
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
    locationVerificationImageUrl: row.location_verification_image_url || null,
    locationVerificationStatus: row.location_verification_status || null,
    locationVerificationAt: row.location_verification_created_at ? new Date(row.location_verification_created_at).toISOString() : null,
    tripStatus: row.trip_status,
    verificationStatus: 'verified'
});

const mapRecentActivityRow = (row) => {
    const flaggedReasons = Array.isArray(row.incident_labels) ? row.incident_labels : [];
    const normalizedVerificationStatus = String(row.verification_status || '').toLowerCase();
    const normalizedTripStatus = String(row.trip_status || '').toLowerCase();
    const normalizedCssuExitStatus = String(row.cssu_exit_status || '').toLowerCase();
    const isFlagged = Boolean(row.is_flagged) && flaggedReasons.length > 0;
    let displayStatus = computeLocatorSlipDisplayStatus({
        locatorSlip: {
            status: normalizedVerificationStatus,
            expectedReturnTime: row.expected_return_time
        },
        trip: {
            status: normalizedTripStatus,
            actualReturnTime: row.actual_return_time
        },
        incidents: isFlagged ? flaggedReasons : []
    });

    if (isFlagged) {
        displayStatus = DISPLAY_STATUSES.FLAGGED;
    } else if (normalizedCssuExitStatus === 'denied') {
        displayStatus = DISPLAY_STATUSES.REJECTED;
    } else if (normalizedVerificationStatus === 'rejected') {
        displayStatus = DISPLAY_STATUSES.REJECTED;
    } else if (normalizedVerificationStatus === 'pending' || normalizedVerificationStatus === 'unverified') {
        displayStatus = DISPLAY_STATUSES.PENDING;
    } else if (normalizedTripStatus === 'returning') {
        displayStatus = 'RETURNING';
    } else if (['active', 'arrived'].includes(normalizedTripStatus)) {
        displayStatus = 'LIVE';
    } else if (normalizedTripStatus === 'completed' || normalizedVerificationStatus === 'completed') {
        displayStatus = 'COMPLETED';
    } else if (['approved', 'verified'].includes(normalizedVerificationStatus)) {
        displayStatus = DISPLAY_STATUSES.PENDING;
    }

    return {
        locatorSlipId: row.locator_slip_id,
        tripId: row.trip_id,
        facultyUserId: row.faculty_user_id,
        facultyName: row.faculty_name,
        facultyProfileImageUrl: row.faculty_profile_image_url || null,
        collegeName: row.college_name,
        departmentName: row.department_name,
        destination: row.destination || null,
        departureTime: row.departure_time ? new Date(row.departure_time).toISOString() : null,
        expectedReturnTime: row.expected_return_time ? new Date(row.expected_return_time).toISOString() : null,
        actualReturnTime: row.actual_return_time ? new Date(row.actual_return_time).toISOString() : null,
        latestLocationAt: row.latest_location_at ? new Date(row.latest_location_at).toISOString() : null,
        purpose: row.purpose,
        verificationStatus: row.verification_status,
        cssuExitStatus: row.cssu_exit_status || null,
        cssuValidationMethod: row.cssu_validation_method || null,
        cssuValidatedAt: row.cssu_validated_at ? new Date(row.cssu_validated_at).toISOString() : null,
        locationVerificationStatus: row.location_verification_status || null,
        verificationImageUrl: row.location_verification_image_url || null,
        tripStatus: row.trip_status,
        isFlagged,
        incidentLabels: flaggedReasons,
        flaggedReasons,
        displayStatus,
        currentStatusLabel: String(displayStatus || '').toLowerCase()
    };
};

const getDashboardSummary = async (userId) => {
    await assertHrmuUser(userId);
    await tripIncidentService.detectEndedTripsForIncidentScan().catch(() => []);
    await tripIncidentService.detectDisconnectedActiveTrips().catch(() => []);
    const summary = await hrmuDashboardRepository.getDashboardSummaryStats();
    const incidentSummary = await tripIncidentRepository.getVerificationSummary().catch(() => ({
        flagged_trips: 0,
        late_returns: 0,
        unverified_locations: 0,
        disconnected_locations: 0
    }));

    return {
        totalFacultyOutside: summary.total_faculty_outside || 0,
        latestActivity: formatRelativeTime(summary.latest_activity_at),
        latestActivityAt: summary.latest_activity_at ? new Date(summary.latest_activity_at).toISOString() : null,
        verifiedLocatorSlips: summary.verified_locator_slips || 0,
        pendingSlips: summary.unverified_cases || 0,
        unverifiedCases: summary.unverified_cases || 0,
        flaggedIncidents: Number(incidentSummary.flagged_trips || 0),
        incidentSummary: {
            lateReturn: Number(incidentSummary.late_returns || 0),
            unverifiedLocation: Number(incidentSummary.unverified_locations || 0),
            locationDisconnected: Number(incidentSummary.disconnected_locations || 0)
        },
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
    await tripIncidentService.detectDisconnectedActiveTrips().catch(() => []);
    const rows = await hrmuDashboardRepository.getLiveFacultyRows();

    return {
        faculty: rows.map(mapLiveFacultyRow)
    };
};

const getNotifications = async (userId, query = {}) => {
    await assertHrmuUser(userId);
    const tripIncidentService = require('./tripIncident.service');
    await tripIncidentService.detectEndedTripsForIncidentScan().catch(() => []);
    await tripIncidentService.detectDisconnectedActiveTrips().catch(() => []);
    const result = await hrmuDashboardRepository.getHrmuNotificationsPage(userId, query);
    const flaggedTrips = await tripIncidentRepository.getFlaggedTrips().catch(() => []);
    const lateReturnNotifications = flaggedTrips
        .filter((row) => Array.isArray(row.incident_types) && row.incident_types.includes('LATE_RETURN'))
        .map((row) => ({
            id: `late-return-${row.trip_id}`,
            locatorSlipId: row.locator_slip_id,
            tripId: row.trip_id,
            facultyName: row.faculty_name,
            collegeName: row.college_name,
            purpose: row.purpose,
            status: 'flagged',
            type: hrmuDashboardRepository.HRMU_NOTIFICATION_TYPE_LATE_RETURN,
            incidentType: 'LATE_RETURN',
            title: 'Late return detected',
            message: `${row.faculty_name} returned ${formatLateReturnDurationLabel(row.expected_return_datetime, row.actual_return_time)} after the expected return time of ${formatExpectedReturnClock(row.expected_return_datetime) || 'the approved return time'}.`,
            createdAt: row.latest_detected_at ? new Date(row.latest_detected_at).toISOString() : null,
            approvedAt: null,
            reviewedByName: null,
            verificationImageUrl: null,
            verificationStatus: null
        }));
    const unverifiedLocationNotifications = flaggedTrips
        .filter((row) => Array.isArray(row.incident_types) && row.incident_types.includes('UNVERIFIED_LOCATION'))
        .map((row) => ({
            id: `unverified-location-${row.trip_id}`,
            locatorSlipId: row.locator_slip_id,
            tripId: row.trip_id,
            facultyName: row.faculty_name,
            collegeName: row.college_name,
            purpose: row.purpose,
            status: 'flagged',
            type: hrmuDashboardRepository.HRMU_NOTIFICATION_TYPE_UNVERIFIED_LOCATION,
            incidentType: 'UNVERIFIED_LOCATION',
            title: 'Unverified location detected',
            message: `${row.faculty_name} has an arrival verification that HRMU marked as unverified for ${row.destination || 'the approved destination'}.`,
            createdAt: row.latest_detected_at ? new Date(row.latest_detected_at).toISOString() : null,
            approvedAt: null,
            reviewedByName: null,
            verificationImageUrl: null,
            verificationStatus: null
        }));

    const notificationRows = result.rows.map((row) => ({
        id: row.id,
        locatorSlipId: row.locator_slip_id,
        tripId: row.trip_id || null,
        facultyName: row.faculty_name,
        collegeName: row.college_name,
        purpose: row.purpose,
        status: row.status,
        type: row.type,
        incidentType: row.status === 'flagged'
            ? (
                row.type === hrmuDashboardRepository.HRMU_NOTIFICATION_TYPE_LATE_RETURN
                    ? 'LATE_RETURN'
                    : row.type === hrmuDashboardRepository.HRMU_NOTIFICATION_TYPE_UNVERIFIED_LOCATION
                        ? 'UNVERIFIED_LOCATION'
                        : row.type === hrmuDashboardRepository.HRMU_NOTIFICATION_TYPE_LOCATION_DISCONNECTED
                            ? 'LOCATION_DISCONNECTED'
                            : 'TRIP_FLAGGED'
            )
            : null,
        title: row.title,
        message: row.message,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : null,
        reviewedByName: row.reviewed_by_name || null,
        verificationImageUrl: row.verification_image_url || null,
        verificationStatus: row.verification_status || null
    }));
    const seenLateReturnTripIds = new Set(
        notificationRows
            .filter((item) => item.type === hrmuDashboardRepository.HRMU_NOTIFICATION_TYPE_LATE_RETURN)
            .map((item) => String(item.tripId || ''))
    );
    const seenUnverifiedTripIds = new Set(
        notificationRows
            .filter((item) => item.type === hrmuDashboardRepository.HRMU_NOTIFICATION_TYPE_UNVERIFIED_LOCATION)
            .map((item) => String(item.tripId || ''))
    );
    const mergedNotifications = [
        ...lateReturnNotifications.filter((item) => !seenLateReturnTripIds.has(String(item.tripId || ''))),
        ...unverifiedLocationNotifications.filter((item) => !seenUnverifiedTripIds.has(String(item.tripId || ''))),
        ...notificationRows
    ].sort((left, right) => {
        const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
        const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
        return rightTime - leftTime;
    });

    return {
        notifications: mergedNotifications,
        pagination: result.pagination
    };
};

const getRecentActivity = async (userId, query = {}) => {
    await assertHrmuUser(userId);
    await tripIncidentService.detectEndedTripsForIncidentScan().catch(() => []);
    await tripIncidentService.detectDisconnectedActiveTrips().catch(() => []);
    if (query.status && !VALID_LOCATOR_SLIP_STATUSES.has(query.status)) {
        throw new AppError('Recent activity status filter is invalid.', 400);
    }
    if (query.verification && !['verified', 'unverified'].includes(query.verification)) {
        throw new AppError('Recent activity verification filter is invalid.', 400);
    }

    const result = await hrmuDashboardRepository.getRecentActivityPage(query);
    const flaggedTrips = await tripIncidentRepository.getFlaggedTrips().catch(() => []);
    const flaggedTripMap = new Map(flaggedTrips.map((item) => [String(item.trip_id || ''), item]));

    return {
        activities: result.rows.map((row) => {
            const flaggedTrip = flaggedTripMap.get(String(row.trip_id || ''));
            return mapRecentActivityRow({
                ...row,
                is_flagged: Boolean(flaggedTrip),
                incident_labels: flaggedTrip?.incident_labels || []
            });
        }),
        pagination: result.pagination
    };
};

const getLiveTracking = async (userId) => getLiveFaculty(userId);

const getReportInbox = async (userId, query = {}) => {
    await assertHrmuUser(userId);

    const rows = await hrmuReportInboxRepository.listInboxAttachments({
        sentToRole: 'hrmu',
        limit: query.limit,
    });

    const items = rows.map((row) => ({
        id: row.id,
        senderName: row.sender_name,
        title: row.report_title,
        subtitle: row.report_subtitle || null,
        filename: row.filename,
        mimeType: row.mime_type,
        fileSize: Number(row.file_size || 0),
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        isRead: Boolean(row.is_read),
        filters: row.filters_json || {},
    }));

    return {
        items,
        unreadCount: items.filter((item) => !item.isRead).length,
        total: items.length,
    };
};

const downloadReportInboxAttachment = async (userId, inboxId) => {
    await assertHrmuUser(userId);

    const item = await hrmuReportInboxRepository.getInboxAttachmentById(inboxId, { includeFileData: true });
    if (!item) {
        throw new AppError('HRMU report attachment not found.', 404);
    }

    await hrmuReportInboxRepository.markInboxAttachmentRead(inboxId).catch(() => null);

    return {
        filename: item.filename || 'hrmu-inbox-report.pdf',
        mimeType: item.mime_type || 'application/pdf',
        buffer: item.file_data,
    };
};

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
    getReportInbox,
    downloadReportInboxAttachment,
    getExportCsvPlaceholder
};
