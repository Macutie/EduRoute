const AppError = require('../utils/appError');
const pool = require('../db/pool');
const hrmuDashboardRepository = require('../repositories/hrmuDashboard.repository');
const hrmuReportsRepository = require('../repositories/hrmuReports.repository');
const proofComplianceRepository = require('../repositories/proofCompliance.repository');
const tripIncidentRepository = require('../repositories/tripIncident.repository');
const tripIncidentService = require('./tripIncident.service');
const { formatTimestampLabel } = require('../utils/formatDate');
const { getMonthDateRange } = require('../utils/reportMonth');
const { buildHrmuMonthlyReportPdf, buildHrmuNotificationLogReportPdf } = require('../utils/simplePdf');

const NOTIFICATION_MONTHLY_LOG_TYPES = [
    'hrmu_locator_slip_approved',
    'hrmu_locator_slip_rejected',
    'hrmu_trip_started',
    'hrmu_trip_arrived',
    'hrmu_trip_completed',
    'hrmu_cssu_validated_exit',
    'hrmu_location_verification_submitted',
    'hrmu_unverified_location',
    'hrmu_location_disconnected',
    'hrmu_trip_flagged',
    'hrmu_trip_flagged_late_return'
];

const assertHrmuUser = async (userId) => {
    const user = await hrmuDashboardRepository.getHrmuUserContext(userId);

    if (!user) {
        throw new AppError('Only HRMU and admin users can access HRMU reports.', 403);
    }

    return user;
};

const mapFlaggedReason = (reason) => ({
    type: reason.type,
    label: reason.label,
    severity: reason.severity
});

const getReportTimestamp = (row) => {
    if (!row) return null;
    return row.actualReturnTime || row.reviewedAt || row.submittedAt || null;
};

const toDateValue = (value) => {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getProofDeduplicationKey = (row) => row.tripId || row.locatorSlipId || row.id;

const normalizeProofStatus = (status) => String(status || 'submitted').trim().toLowerCase();

const filterProofsByMonthRange = (proofs, monthRange) =>
    proofs.filter((row) => {
        const timestamp = toDateValue(getReportTimestamp(row));
        if (!timestamp) return false;
        return timestamp >= monthRange.start && timestamp < monthRange.endExclusive;
    });

const dedupeProofRows = (proofs) => {
    const deduped = new Map();

    proofs.forEach((row) => {
        const key = getProofDeduplicationKey(row);
        if (!key || deduped.has(key)) return;
        deduped.set(key, row);
    });

    return Array.from(deduped.values());
};

const getLastThirtyDaysRange = () => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 30);

    return {
        start,
        endExclusive: now,
        label: `${formatTimestampLabel(start)} to ${formatTimestampLabel(now)}`
    };
};

const getNotificationActionLabel = (type) => {
    switch (String(type || '').trim().toLowerCase()) {
    case 'hrmu_trip_started':
        return 'start trip';
    case 'hrmu_trip_arrived':
        return 'arrived';
    case 'hrmu_location_verification_submitted':
        return 'proof';
    case 'hrmu_trip_completed':
    case 'hrmu_cssu_validated_exit':
        return 'returned';
    case 'hrmu_trip_flagged_late_return':
        return 'late';
    case 'hrmu_locator_slip_approved':
        return 'approved';
    case 'hrmu_locator_slip_rejected':
        return 'rejected';
    case 'hrmu_unverified_location':
        return 'unverified';
    case 'hrmu_location_disconnected':
        return 'disconnected';
    case 'hrmu_trip_flagged':
        return 'flagged';
    default:
        return 'update';
    }
};

const getNotificationStatusLabel = (type) => {
    switch (String(type || '').trim().toLowerCase()) {
    case 'hrmu_locator_slip_rejected':
    case 'hrmu_trip_flagged_late_return':
    case 'hrmu_unverified_location':
    case 'hrmu_location_disconnected':
    case 'hrmu_trip_flagged':
        return 'FLAGGED';
    default:
        return 'VERIFIED';
    }
};

const isWithinDateRange = (value, start, endExclusive) => {
    if (!value) return false;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    return date >= start && date < endExclusive;
};

const sortProofRowsNewestFirst = (proofs) =>
    [...proofs].sort((left, right) => {
        const leftTime = toDateValue(getReportTimestamp(left))?.getTime() || 0;
        const rightTime = toDateValue(getReportTimestamp(right))?.getTime() || 0;
        return rightTime - leftTime;
    });

const mapProofToReportLogRow = (row) => {
    const normalizedStatus = normalizeProofStatus(row.verificationStatus);
    const flaggedReasons = normalizedStatus === 'rejected'
        ? [{ type: 'unverified_location', label: 'Unverified location', severity: 'medium' }]
        : [];

    return {
        locatorSlipId: row.locatorSlipId,
        tripId: row.tripId,
        proofId: row.id,
        timestamp: getReportTimestamp(row),
        timestampLabel: formatTimestampLabel(getReportTimestamp(row)),
        location: row.destination || 'Unknown destination',
        personnel: row.facultyName || 'Unknown faculty',
        status: normalizedStatus === 'verified'
            ? 'VERIFIED'
            : normalizedStatus === 'rejected'
                ? 'REJECTED'
                : 'PENDING',
        rawStatus: normalizedStatus,
        flaggedReasons
    };
};

const buildReportFromVerificationRows = (proofs, monthRange, limit = 20) => {
    const filteredProofs = filterProofsByMonthRange(proofs, monthRange);
    const sortedProofs = sortProofRowsNewestFirst(filteredProofs);
    const dedupedProofs = dedupeProofRows(sortedProofs);
    const logRows = dedupedProofs.slice(0, limit).map(mapProofToReportLogRow);

    const totalMovements = dedupedProofs.length;
    const successfulTrips = dedupedProofs.filter((row) => normalizeProofStatus(row.verificationStatus) === 'verified').length;
    const flaggedIncidents = dedupedProofs.filter((row) => normalizeProofStatus(row.verificationStatus) === 'rejected').length;
    const pendingReviews = dedupedProofs.filter((row) => normalizeProofStatus(row.verificationStatus) === 'submitted').length;

    const summary = {
        totalMovements,
        flaggedIncidents,
        successfulTrips,
        complianceRate: totalMovements ? Number(((successfulTrips / totalMovements) * 100).toFixed(1)) : 0,
        lateReturns: 0,
        unverifiedLocations: flaggedIncidents,
        disconnectedLocations: 0,
        pendingReviews,
        incidentSummary: {
            lateReturn: 0,
            unverifiedLocation: flaggedIncidents,
            locationDisconnected: 0
        }
    };

    return {
        summary,
        locatorSlipLogs: logRows,
        keyIncidentLog: logRows,
        totalAvailableLogs: dedupedProofs.length
    };
};

const mapReportLogRow = (row) => ({
    locatorSlipId: row.locator_slip_id,
    tripId: row.trip_id,
    proofId: row.proof_id,
    timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : null,
    timestampLabel: formatTimestampLabel(row.timestamp),
    location: row.location || 'Unknown destination',
    personnel: row.personnel || 'Unknown faculty',
    status: row.report_status,
    rawStatus: row.raw_status,
    flaggedReasons: Array.isArray(row.flagged_reasons) ? row.flagged_reasons.map(mapFlaggedReason) : []
});

const getMonthlyReport = async (userId, { monthIndex = (new Date().getMonth() + 1), year, limit = 20 } = {}) => {
    await assertHrmuUser(userId);
    const monthRange = getMonthDateRange(monthIndex, year);
    const proofs = await proofComplianceRepository.getHrmuProofList();
    const reportData = buildReportFromVerificationRows(proofs, monthRange, limit);

    return {
        reportMeta: {
            monthIndex: monthRange.monthIndex,
            totalMonths: monthRange.totalMonths,
            monthName: monthRange.monthName,
            year: monthRange.actualYear,
            title: monthRange.title,
            isFirst: monthRange.isFirst,
            isLast: monthRange.isLast
        },
        summary: reportData.summary,
        locatorSlipLogs: reportData.locatorSlipLogs,
        keyIncidentLog: reportData.keyIncidentLog
    };
};

const getMonthlyReportLogs = async (userId, query = {}) => {
    await assertHrmuUser(userId);
    const monthRange = getMonthDateRange(query.monthIndex, query.year);
    const proofs = await proofComplianceRepository.getHrmuProofList();
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);
    const statusFilter = String(query.status || 'all').toLowerCase();
    const built = buildReportFromVerificationRows(proofs, monthRange, Number.MAX_SAFE_INTEGER);
    const filteredLogs = built.locatorSlipLogs.filter((row) => {
        if (statusFilter === 'all') return true;
        return String(row.rawStatus || '').toLowerCase() === statusFilter;
    });
    const offset = Math.max(page - 1, 0) * limit;
    const pagedLogs = filteredLogs.slice(offset, offset + limit);

    return {
        reportMeta: {
            monthIndex: monthRange.monthIndex,
            totalMonths: monthRange.totalMonths,
            monthName: monthRange.monthName,
            year: monthRange.actualYear,
            title: monthRange.title,
            isFirst: monthRange.isFirst,
            isLast: monthRange.isLast
        },
        logs: pagedLogs,
        pagination: {
            page,
            limit,
            total: filteredLogs.length,
            totalPages: limit > 0 ? Math.max(Math.ceil(filteredLogs.length / limit), 1) : 1
        }
    };
};

const getMonthlyReportSummary = async (userId, query = {}) => {
    await assertHrmuUser(userId);
    const monthRange = getMonthDateRange(query.monthIndex, query.year);
    const proofs = await proofComplianceRepository.getHrmuProofList();
    const built = buildReportFromVerificationRows(proofs, monthRange, 20);

    return {
        reportMeta: {
            monthIndex: monthRange.monthIndex,
            totalMonths: monthRange.totalMonths,
            monthName: monthRange.monthName,
            year: monthRange.actualYear,
            title: monthRange.title,
            isFirst: monthRange.isFirst,
            isLast: monthRange.isLast
        },
        summary: built.summary
    };
};

const getMonthlyReportDetails = async (userId, locatorSlipId) => {
    await assertHrmuUser(userId);
    const detail = await hrmuReportsRepository.getMonthlyDetails(locatorSlipId);

    if (!detail) {
        throw new AppError('Monthly report detail not found.', 404);
    }

    return {
        locatorSlipId: detail.locator_slip_id,
        tripId: detail.trip_id,
        proofId: detail.proof_id,
        facultyName: detail.faculty_name,
        collegeName: detail.college_name,
        purpose: detail.purpose,
        destination: detail.destination,
        locatorStatus: detail.locator_status,
        tripStatus: detail.trip_status,
        departureTime: detail.departure_datetime,
        expectedReturnTime: detail.expected_return_datetime,
        startedAt: detail.started_at,
        endedAt: detail.ended_at,
        verificationStatus: detail.verification_status || 'missing',
        flaggedReasons: Array.isArray(detail.incidents) ? detail.incidents.map((item) => ({
            type: item.type,
            label: item.label,
            severity: item.severity,
            detectedAt: item.detectedAt,
            metadata: item.metadata || {}
        })) : []
    };
};

const getVerificationFlaggedTrips = async (userId) => {
    await assertHrmuUser(userId);
    await tripIncidentService.detectEndedTripsForIncidentScan().catch(() => []);
    await tripIncidentService.detectDisconnectedActiveTrips().catch(() => []);

    const rows = await tripIncidentRepository.getFlaggedTrips();
    return {
        trips: rows.map((row) => ({
            tripId: row.trip_id,
            locatorSlipId: row.locator_slip_id,
            facultyName: row.faculty_name,
            collegeName: row.college_name,
            destination: row.destination,
            purpose: row.purpose,
            tripStatus: row.trip_status,
            incidentTypes: row.incident_types || [],
            incidentLabels: row.incident_labels || [],
            latestDetectedAt: row.latest_detected_at ? new Date(row.latest_detected_at).toISOString() : null,
            severity: row.severity_rank >= 3 ? 'high' : row.severity_rank === 2 ? 'medium' : 'low'
        }))
    };
};

const getVerificationIncidentSummary = async (userId) => {
    await assertHrmuUser(userId);
    await tripIncidentService.detectEndedTripsForIncidentScan().catch(() => []);
    await tripIncidentService.detectDisconnectedActiveTrips().catch(() => []);
    const summary = await tripIncidentRepository.getVerificationSummary();

    return {
        flaggedTrips: Number(summary.flagged_trips || 0),
        lateReturns: Number(summary.late_returns || 0),
        unverifiedLocations: Number(summary.unverified_locations || 0),
        disconnectedLocations: Number(summary.disconnected_locations || 0)
    };
};

const getMonthlyReportDownload = async (userId, query = {}) => {
    const baseYear = query.baseYear || query.year;
    const report = await getMonthlyReport(userId, {
        monthIndex: query.monthIndex,
        year: baseYear,
        limit: 5000
    });

    const monthSlug = String(report.reportMeta.monthName || 'report').toLowerCase().replace(/\s+/g, '-');
    const filename = `eduroute-hrmu-report-${monthSlug}-${report.reportMeta.year}.pdf`;
    const buffer = await buildHrmuMonthlyReportPdf(report);

    return {
        buffer,
        filename,
    };
};

const getNotificationMonthlyLogDownload = async (userId) => {
    await assertHrmuUser(userId);

    const range = getLastThirtyDaysRange();
    const { rows: notificationRows } = await pool.query(
        `SELECT
            n.created_at,
            n.type,
            n.title,
            fu.full_name AS faculty_name
         FROM notifications n
         LEFT JOIN locator_slips ls ON ls.id = n.locator_slip_id
         LEFT JOIN faculty_users fu ON fu.id = ls.faculty_user_id
         WHERE n.recipient_user_id = $1
           AND n.created_at >= $2
           AND n.created_at < $3
           AND n.type = ANY($4::text[])
         ORDER BY n.created_at DESC`,
        [userId, range.start, range.endExclusive, NOTIFICATION_MONTHLY_LOG_TYPES]
    );

    const flaggedTrips = await tripIncidentRepository.getFlaggedTrips().catch(() => []);
    const lateReturnNotifications = flaggedTrips
        .filter((row) => Array.isArray(row.incident_types) && row.incident_types.includes('LATE_RETURN'))
        .filter((row) => isWithinDateRange(row.latest_detected_at, range.start, range.endExclusive))
        .map((row) => ({
            created_at: row.latest_detected_at,
            type: 'hrmu_trip_flagged_late_return',
            faculty_name: row.faculty_name,
            trip_id: row.trip_id,
        }));
    const unverifiedLocationNotifications = flaggedTrips
        .filter((row) => Array.isArray(row.incident_types) && row.incident_types.includes('UNVERIFIED_LOCATION'))
        .filter((row) => isWithinDateRange(row.latest_detected_at, range.start, range.endExclusive))
        .map((row) => ({
            created_at: row.latest_detected_at,
            type: 'hrmu_unverified_location',
            faculty_name: row.faculty_name,
            trip_id: row.trip_id,
        }));

    const seenLateReturnTripIds = new Set(
        notificationRows
            .filter((row) => row.type === 'hrmu_trip_flagged_late_return')
            .map((row) => String(row.trip_id || ''))
    );
    const seenUnverifiedTripIds = new Set(
        notificationRows
            .filter((row) => row.type === 'hrmu_unverified_location')
            .map((row) => String(row.trip_id || ''))
    );

    const mergedNotificationRows = [
        ...lateReturnNotifications.filter((row) => !seenLateReturnTripIds.has(String(row.trip_id || ''))),
        ...unverifiedLocationNotifications.filter((row) => !seenUnverifiedTripIds.has(String(row.trip_id || ''))),
        ...notificationRows
    ].sort((left, right) => {
        const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
        const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;
        return rightTime - leftTime;
    });

    const rows = mergedNotificationRows.map((row) => ({
        dateTimeLabel: formatTimestampLabel(row.created_at),
        facultyName: row.faculty_name || 'Unknown faculty',
        actionLabel: getNotificationActionLabel(row.type || row.title),
        status: getNotificationStatusLabel(row.type)
    }));

    const buffer = await buildHrmuNotificationLogReportPdf({
        reportTitle: 'Monthly Log Report',
        windowLabel: range.label,
        rows
    });

    return {
        buffer,
        filename: `eduroute-hrmu-monthly-log-report-${new Date().toISOString().slice(0, 10)}.pdf`,
    };
};

module.exports = {
    getMonthlyReport,
    getMonthlyReportLogs,
    getMonthlyReportSummary,
    getMonthlyReportDetails,
    getMonthlyReportDownload,
    getNotificationMonthlyLogDownload,
    getVerificationFlaggedTrips,
    getVerificationIncidentSummary
};
