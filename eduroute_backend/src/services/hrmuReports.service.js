const AppError = require('../utils/appError');
const hrmuDashboardRepository = require('../repositories/hrmuDashboard.repository');
const hrmuReportsRepository = require('../repositories/hrmuReports.repository');
const tripIncidentRepository = require('../repositories/tripIncident.repository');
const tripIncidentService = require('./tripIncident.service');
const { formatTimestampLabel } = require('../utils/formatDate');
const { getMonthDateRange } = require('../utils/reportMonth');
const { buildHrmuMonthlyReportPdf } = require('../utils/simplePdf');

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

const mapReportLogRow = (row) => ({
    locatorSlipId: row.locator_slip_id,
    tripId: row.trip_id,
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
    await tripIncidentService.detectEndedTripsForIncidentScan().catch(() => []);
    await tripIncidentService.detectDisconnectedActiveTrips().catch(() => []);

    const monthRange = getMonthDateRange(monthIndex, year);
    const [summaryRows, logsResult] = await Promise.all([
        hrmuReportsRepository.getMonthlySummary({
            start: monthRange.start,
            endExclusive: monthRange.endExclusive
        }),
        hrmuReportsRepository.getMonthlyLogs({
            start: monthRange.start,
            endExclusive: monthRange.endExclusive,
            page: 1,
            limit: limit,
            status: 'all'
        })
    ]);

    const totalMovements = Number(summaryRows.total_movements || 0);
    const successfulTrips = Number(summaryRows.successful_trips || 0);
    const flaggedIncidents = Number(summaryRows.flagged_incidents || 0);

    const incidentSummary = {
        lateReturn: Number(summaryRows.late_returns || 0),
        unverifiedLocation: Number(summaryRows.unverified_locations || 0),
        locationDisconnected: Number(summaryRows.disconnected_locations || 0)
    };

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
        summary: {
            totalMovements,
            flaggedIncidents,
            successfulTrips,
            complianceRate: totalMovements ? Number(((successfulTrips / totalMovements) * 100).toFixed(1)) : 0,
            lateReturns: Number(summaryRows.late_returns || 0),
            unverifiedLocations: Number(summaryRows.unverified_locations || 0),
            disconnectedLocations: Number(summaryRows.disconnected_locations || 0),
            incidentSummary
        },
        locatorSlipLogs: logsResult.rows.map(mapReportLogRow),
        keyIncidentLog: logsResult.rows.map(mapReportLogRow)
    };
};

const getMonthlyReportLogs = async (userId, query = {}) => {
    await assertHrmuUser(userId);
    await tripIncidentService.detectEndedTripsForIncidentScan().catch(() => []);
    await tripIncidentService.detectDisconnectedActiveTrips().catch(() => []);
    const monthRange = getMonthDateRange(query.monthIndex, query.year);
    const result = await hrmuReportsRepository.getMonthlyLogs({
        start: monthRange.start,
        endExclusive: monthRange.endExclusive,
        page: query.page,
        limit: query.limit,
        status: query.status || 'all'
    });

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
        logs: result.rows.map(mapReportLogRow),
        pagination: result.pagination
    };
};

const getMonthlyReportSummary = async (userId, query = {}) => {
    await assertHrmuUser(userId);
    await tripIncidentService.detectEndedTripsForIncidentScan().catch(() => []);
    await tripIncidentService.detectDisconnectedActiveTrips().catch(() => []);
    const monthRange = getMonthDateRange(query.monthIndex, query.year);
    const summary = await hrmuReportsRepository.getMonthlySummary({
        start: monthRange.start,
        endExclusive: monthRange.endExclusive
    });

    const totalMovements = Number(summary.total_movements || 0);
    const successfulTrips = Number(summary.successful_trips || 0);

    const incidentSummary = {
        lateReturn: Number(summary.late_returns || 0),
        unverifiedLocation: Number(summary.unverified_locations || 0),
        locationDisconnected: Number(summary.disconnected_locations || 0)
    };

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
        summary: {
            totalMovements,
            flaggedIncidents: Number(summary.flagged_incidents || 0),
            successfulTrips,
            complianceRate: totalMovements ? Number(((successfulTrips / totalMovements) * 100).toFixed(1)) : 0,
            lateReturns: Number(summary.late_returns || 0),
            unverifiedLocations: Number(summary.unverified_locations || 0),
            disconnectedLocations: Number(summary.disconnected_locations || 0),
            incidentSummary
        }
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

    // Fetch the proof images for verified trips to attach to the PDF
    const verifiedSlipIds = report.locatorSlipLogs
        .filter(log => log.status === 'VERIFIED')
        .map(log => log.locatorSlipId);

    let proofImages = [];
    if (verifiedSlipIds.length > 0) {
        const pool = require('../db/pool');
        const { rows } = await pool.query(`
            SELECT locator_slip_id, COALESCE(proof_compliance_image_url, image_url) AS image_url
            FROM arrival_verifications
            WHERE locator_slip_id = ANY($1::uuid[])
              AND COALESCE(proof_compliance_image_url, image_url) IS NOT NULL
            ORDER BY created_at ASC
        `, [verifiedSlipIds]);

        const fetchPromises = rows.map(async (row) => {
            try {
                const response = await fetch(row.image_url);
                if (response.ok) {
                    const arrayBuffer = await response.arrayBuffer();
                    return {
                        locatorSlipId: row.locator_slip_id,
                        buffer: Buffer.from(arrayBuffer)
                    };
                }
            } catch (err) {
                // Ignore failed fetches to not break the whole report
            }
            return null;
        });

        const fetchedImages = await Promise.all(fetchPromises);
        proofImages = fetchedImages.filter(img => img !== null);
    }

    const monthSlug = String(report.reportMeta.monthName || 'report').toLowerCase().replace(/\s+/g, '-');
    const filename = `eduroute-hrmu-report-${monthSlug}-${report.reportMeta.year}.pdf`;
    const buffer = await buildHrmuMonthlyReportPdf(report, proofImages);

    return {
        buffer,
        filename,
    };
};

module.exports = {
    getMonthlyReport,
    getMonthlyReportLogs,
    getMonthlyReportSummary,
    getMonthlyReportDetails,
    getMonthlyReportDownload,
    getVerificationFlaggedTrips,
    getVerificationIncidentSummary
};
