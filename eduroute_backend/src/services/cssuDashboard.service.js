const AppError = require('../utils/appError');
const pool = require('../db/pool');
const crypto = require('crypto');
const ISSUDashboardRepository = require('../repositories/cssuDashboard.repository');
const { ISSU_FLAG_INCIDENT_NOTE_PREFIX } = ISSUDashboardRepository;
const hrmuDashboardRepository = require('../repositories/hrmuDashboard.repository');
const hrmuReportInboxRepository = require('../repositories/hrmuReportInbox.repository');
const locatorSlipNotificationService = require('./locatorSlipNotification.service');
const { buildISSUMovementReportPdf } = require('../utils/simplePdf');

const GATE_OPTIONS = new Set(['main_gate', 'back_gate']);
const ISSU_ALLOWED_DEPARTMENTS = new Set([
    'College of Education, Arts and Sciences',
    'College of Hospitality and Tourism Management',
    'College of Business and Accountancy',
    'College of Allied Health Studies',
    'College of Computer Studies'
]);

const formatGateLabel = (value) => (
    value === 'back_gate' ? 'Back Gate' : 'Main Gate'
);

const formatStatusLabel = (value) => {
    if (value === 'flagged') return 'Flagged';
    if (value === 'validated') return 'Validated';
    if (value === 'entry_validated') return 'Entry Validated';
    if (value === 'returning_entry') return 'Return Entry';
    if (value === 'denied') return 'Denied';
    return 'Approved';
};

const getLookupOutcome = (status) => {
    if (status === 'returning_entry') return 'return_entry_ready';
    if (status === 'entry_validated') return 'entry_validated';
    if (status === 'denied') return 'denied_locked';
    if (status === 'rejected') return 'rejected';
    if (status === 'pending') return 'pending';
    if (status === 'completed') return 'completed';
    if (status === 'cancelled') return 'cancelled';
    if (status === 'validated') return 'validated_final';
    if (status === 'flagged') return 'repeated_denied';
    return 'approved_ready';
};

const getReturnVerificationTimeline = async (tripId) => {
    if (!tripId) {
        return {
            tripStartedAt: null,
            proofSubmittedAt: null,
            returnEntryConfirmedAt: null,
        };
    }

    const { rows } = await pool.query(
        `SELECT
            trip.started_at AS trip_started_at,
            proof.submitted_at AS proof_submitted_at,
            entry.confirmed_at AS return_entry_confirmed_at
         FROM trips trip
         LEFT JOIN LATERAL (
            SELECT COALESCE(av.submitted_at, av.verified_at, av.created_at) AS submitted_at
            FROM arrival_verifications av
            WHERE av.trip_id = trip.id
            ORDER BY COALESCE(av.submitted_at, av.verified_at, av.created_at) DESC
            LIMIT 1
         ) proof ON TRUE
         LEFT JOIN trip_return_entry_tokens entry ON entry.trip_id = trip.id
         WHERE trip.id = $1
         LIMIT 1`,
        [tripId]
    );
    const row = rows[0] || {};
    return {
        tripStartedAt: row.trip_started_at ? new Date(row.trip_started_at).toISOString() : null,
        proofSubmittedAt: row.proof_submitted_at ? new Date(row.proof_submitted_at).toISOString() : null,
        returnEntryConfirmedAt: row.return_entry_confirmed_at ? new Date(row.return_entry_confirmed_at).toISOString() : null,
    };
};

const buildScanConfidence = ({ currentStatus, normalizedSlipStatus, attemptStats, isReturnEntryCheckpoint = false }) => {
    const repeatAttempts = Number(attemptStats?.denied_repeat_attempts || 0);

    if (isReturnEntryCheckpoint) {
        return {
            level: 'ready',
            tone: 'success',
            title: 'Return entry ready',
            message: 'This locator slip is already cleared for exit and is now ready for ISSU return-entry validation.',
            repeatAttempts
        };
    }

    if (currentStatus === 'denied' || currentStatus === 'flagged') {
        return {
            level: 'locked',
            tone: 'danger',
            title: 'Denied exit is locked',
            message: 'ISSU already denied this exit. No further exit action is allowed for this locator slip.',
            repeatAttempts
        };
    }

    if (currentStatus === 'validated') {
        return {
            level: 'final',
            tone: 'success',
            title: 'Exit already validated',
            message: 'This locator slip has a final ISSU allowed-exit decision.',
            repeatAttempts
        };
    }

    if (normalizedSlipStatus === 'pending') {
        return {
            level: 'blocked',
            tone: 'warning',
            title: 'Supervisor approval required',
            message: 'This locator slip is still pending and should not be allowed to exit.',
            repeatAttempts
        };
    }

    if (normalizedSlipStatus === 'rejected') {
        return {
            level: 'blocked',
            tone: 'danger',
            title: 'Rejected locator slip',
            message: 'This locator slip was rejected and should only be flagged for incident review.',
            repeatAttempts
        };
    }

    if (normalizedSlipStatus === 'completed') {
        return {
            level: 'final',
            tone: 'neutral',
            title: 'Trip already completed',
            message: 'The locator slip already belongs to a completed trip record.',
            repeatAttempts
        };
    }

    return {
        level: 'ready',
        tone: 'success',
        title: 'Approved for ISSU decision',
        message: 'Supervisor approval is valid. ISSU may allow or deny the exit.',
        repeatAttempts
    };
};

const formatEmploymentTypeLabel = (value) => (
    String(value || '').toLowerCase() === 'part_time'
        ? 'Part-Time Employee'
        : 'Full-Time Employee'
);

const formatTimeLabel = (value) => {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';

    return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Manila',
    });
};

const formatDateLabel = (value) => {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';

    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        timeZone: 'Asia/Manila',
    });
};

const formatDateTimeLabel = (value) => {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';

    return date.toLocaleString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Manila',
    });
};

const normalizeReportsFilters = (query = {}) => {
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const defaultStart = monthStart.toISOString().slice(0, 10);
    const defaultEnd = today.toISOString().slice(0, 10);

    const startDate = String(query.startDate || defaultStart).slice(0, 10);
    const endDate = String(query.endDate || defaultEnd).slice(0, 10);
    const departmentName = String(query.department || 'all').trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        throw new AppError('Start date and end date must use YYYY-MM-DD format.', 422);
    }

    if (new Date(`${endDate}T00:00:00`) < new Date(`${startDate}T00:00:00`)) {
        throw new AppError('End date cannot be earlier than start date.', 422);
    }

    if (departmentName !== 'all' && !ISSU_ALLOWED_DEPARTMENTS.has(departmentName)) {
        throw new AppError('Invalid ISSU department filter.', 422);
    }

    return {
        startDate,
        endDate,
        departmentName,
    };
};

const normalizeSortOrder = (value) => (
    String(value || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc'
);

const getDashboardSummary = async () => {
    const summary = await ISSUDashboardRepository.getDashboardSummary();
    const totalFacultyExiting = Number(summary.total_faculty_exiting || 0);
    const approvedLocatorSlips = Number(summary.approved_locator_slips || 0);
    const rejectedLocatorSlips = Number(summary.rejected_locator_slips || 0);

    return {
        totalLocatorSlipsFiled: Number(summary.total_locator_slips_filed || 0),
        totalFacultyExiting,
        approvedLocatorSlips,
        rejectedLocatorSlips,
        totalEmployeesReturned: Number(summary.total_employees_returned || 0),
        pendingExitQueue: Number(summary.pending_exit_queue || 0),
        repeatAttempts: Number(summary.repeat_attempts || 0),
        suspiciousAttempts: Number(summary.suspicious_attempts || 0),
        busiestGate: summary.busiest_gate || 'main_gate',
        busiestGateLabel: formatGateLabel(summary.busiest_gate || 'main_gate'),
        busiestGateCount: Number(summary.busiest_gate_count || 0),
        approvalRate: totalFacultyExiting
            ? Number(((approvedLocatorSlips / totalFacultyExiting) * 100).toFixed(1))
            : 0,
    };
};

const mapISSUActivityRow = (row) => ({
    id: row.activity_id || row.history_id,
    locatorSlipId: row.locator_slip_id,
    locatorSlipCode: row.locator_slip_code || '--',
    facultyUserId: row.faculty_user_id,
    facultyName: row.faculty_name || 'Unknown employee',
    facultyId: row.employee_id || '--',
    profileImageUrl: row.profile_image_url || null,
    departmentName: row.department_name || 'Unassigned Department',
    destination: row.destination || 'Unknown destination',
    gate: row.gate || 'main_gate',
    gateLabel: formatGateLabel(row.gate || 'main_gate'),
    method: row.validation_method || 'manual',
    status: String(row.status || '').toLowerCase(),
    statusLabel: formatStatusLabel(String(row.status || '').toLowerCase()),
    title: row.title || 'ISSU activity',
    entryType: row.entry_type || 'activity',
    occurredAt: row.occurred_at ? new Date(row.occurred_at).toISOString() : null,
    occurredTimeLabel: formatDateTimeLabel(row.occurred_at),
});

const getDashboardActivityTimeline = async (query = {}) => {
    const limit = Math.min(Math.max(Number(query.limit || 12), 1), 50);
    const rows = await ISSUDashboardRepository.getDashboardActivityTimeline(limit);

    return {
        rows: rows.map(mapISSUActivityRow),
    };
};

const getFacultyExitHistory = async (facultyUserId, query = {}) => {
    if (!facultyUserId) {
        throw new AppError('Employee ID is required.', 422);
    }

    const limit = Math.min(Math.max(Number(query.limit || 10), 1), 50);
    const rows = await ISSUDashboardRepository.getFacultyExitHistory(facultyUserId, limit);

    return {
        facultyUserId,
        rows: rows.map(mapISSUActivityRow),
    };
};

const getLiveExitMonitoring = async (query = {}) => {
    const gate = String(query.gate || 'main_gate').toLowerCase();
    const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);

    if (!GATE_OPTIONS.has(gate)) {
        throw new AppError('Invalid ISSU gate filter.', 422);
    }

    const rows = await ISSUDashboardRepository.getLiveExitMonitoring(gate, limit);

    return {
        gate,
        gateLabel: formatGateLabel(gate),
        rows: rows.map((row) => ({
            locatorSlipId: row.locator_slip_id,
            locatorSlipCode: row.locator_slip_code || null,
            facultyUserId: row.faculty_user_id,
            facultyName: row.faculty_name,
            profileImageUrl: row.faculty_profile_image_url || null,
            facultyId: row.employee_id,
            departmentName: row.department_name || 'Unassigned Department',
            destination: row.destination,
            purpose: row.purpose_of_travel,
            status: String(row.monitoring_status || 'approved').toLowerCase(),
            statusLabel: formatStatusLabel(String(row.monitoring_status || 'approved').toLowerCase()),
            gate: row.gate || gate,
            gateLabel: formatGateLabel(row.gate || gate),
            validatedAt: row.status_timestamp ? new Date(row.status_timestamp).toISOString() : null,
            validatedTimeLabel: formatDateTimeLabel(row.status_timestamp),
            returnEntryCode: row.return_entry_code || null,
        })),
    };
};

const getIncidentOverview = async () => {
    const rows = await ISSUDashboardRepository.getIncidentOverview();
    const activeCases = Number(rows[0]?.active_cases || 0);
    const resolvedToday = Number(rows[0]?.resolved_today || 0);

    return {
        activeCases,
        resolvedToday,
        incidents: rows.map((row) => ({
            id: row.incident_id,
            locatorSlipId: row.locator_slip_id,
            facultyUserId: row.faculty_user_id,
            facultyName: row.faculty_name,
            facultyId: row.employee_id,
            departmentName: row.department_name || 'Unassigned Department',
            destination: row.destination,
            purpose: row.purpose,
            title: row.title,
            description: row.description,
            severity: String(row.severity || 'moderate').toLowerCase(),
            tone: String(row.tone || 'yellow').toLowerCase(),
            occurredAt: row.occurred_at ? new Date(row.occurred_at).toISOString() : null,
            occurredTimeLabel: formatTimeLabel(row.occurred_at),
            notes: row.notes || '',
        })),
    };
};

const getNotificationsOverview = async (query = {}) => {
    const limit = Math.min(Math.max(Number(query.limit || 8), 1), 50);
    const data = await ISSUDashboardRepository.getNotificationsOverview(limit);

    return {
        summary: {
            validatedClearances: Number(data.validated_clearances || 0),
            flaggedExits: Number(data.flagged_exits || 0),
            unauthorizedExit: Number(data.unauthorized_exit || 0),
        },
        notifications: (Array.isArray(data.notifications) ? data.notifications : []).map((row) => ({
            id: row.notification_id,
            locatorSlipId: row.locator_slip_id,
            locatorSlipCode: row.locator_slip_code || null,
            facultyUserId: row.faculty_user_id,
            facultyName: row.faculty_name,
            facultyId: row.employee_id || '--',
            departmentName: row.department_name || 'Unassigned Department',
            destination: row.destination || 'Unknown destination',
            purpose: row.purpose || 'Locator Slip Clearance',
            gate: row.gate || 'main_gate',
            gateLabel: formatGateLabel(row.gate || 'main_gate'),
            type: row.notification_type,
            title: row.title,
            occurredAt: row.occurred_at ? new Date(row.occurred_at).toISOString() : null,
            occurredTimeLabel: formatTimeLabel(row.occurred_at),
            occurredDateTimeLabel: formatDateTimeLabel(row.occurred_at),
            locatorSlipStatus: String(row.locator_slip_status || '').toLowerCase(),
        })),
    };
};

const buildMovementLogs = (rows, sortOrder = 'desc') => {
    const movementLogs = rows.map((row) => ({
        id: row.movement_id,
        locatorSlipId: row.locator_slip_id,
        facultyName: row.faculty_name || 'Unknown employee',
        facultyId: row.employee_id || '--',
        departmentName: row.department_name || 'Unassigned Department',
        purpose: row.purpose || 'Locator Slip Clearance',
        destination: row.destination || 'Unknown destination',
        occurredAt: row.occurred_at ? new Date(row.occurred_at).toISOString() : null,
        occurredTimeLabel: formatTimeLabel(row.occurred_at),
        occurredDateTimeLabel: formatDateTimeLabel(row.occurred_at),
        movementStatus: String(row.movement_status || 'verified').toLowerCase(),
        movementStatusLabel: String(row.movement_status || 'verified').toLowerCase() === 'flagged' ? 'FLAGGED' : 'VERIFIED',
        locationLabel: row.location_label || row.destination || 'Unknown destination',
        eventLabel: row.event_label || 'Movement',
        investigationLabel: row.investigation_label || '',
        validatedByName: row.validated_by_name || '',
    }));

    return movementLogs.sort((left, right) => {
        const leftTime = left.occurredAt ? new Date(left.occurredAt).getTime() : 0;
        const rightTime = right.occurredAt ? new Date(right.occurredAt).getTime() : 0;
        return sortOrder === 'asc' ? leftTime - rightTime : rightTime - leftTime;
    });
};

const getReportsOverview = async (query = {}) => {
    const filters = normalizeReportsFilters(query);
    const sortOrder = normalizeSortOrder(query.sortOrder);
    const [summaryRow, activityRows, movementRows] = await Promise.all([
        ISSUDashboardRepository.getReportsSummary(filters),
        ISSUDashboardRepository.getReportsActivityByDepartment(filters),
        ISSUDashboardRepository.getReportsMovementLogs(filters),
    ]);

    const exitClearances = Number(summaryRow.exit_clearances || 0);
    const flaggedEvents = Number(summaryRow.flagged_events || 0);
    const totalMovements = exitClearances + flaggedEvents;

    return {
        filters: {
            startDate: filters.startDate,
            endDate: filters.endDate,
            department: filters.departmentName,
            dateRangeLabel: `${formatDateLabel(filters.startDate)} - ${formatDateLabel(filters.endDate)}`,
        },
        summary: {
            totalMovements,
            exitClearances,
            flaggedEvents,
        },
        activityByDepartment: activityRows.map((row) => ({
            departmentName: row.department_name,
            locatorSlipCount: Number(row.locator_slip_count || 0),
            percentage: Number(row.percentage || 0),
        })),
        movementLogs: buildMovementLogs(movementRows, sortOrder),
        reportMeta: {
            reportId: `ISSU-${filters.startDate.replace(/-/g, '')}-${filters.endDate.replace(/-/g, '')}`,
            lastGeneratedAt: new Date().toISOString(),
            lastGeneratedLabel: formatDateTimeLabel(new Date().toISOString()),
        },
    };
};

const getReportsDownload = async (userId, query = {}) => {
    const user = await hrmuDashboardRepository.getHrmuUserContext(userId, ['cssu', 'admin']);
    if (!user) {
        throw new AppError('Only ISSU and admin users can export ISSU reports.', 403);
    }

    const report = await getReportsOverview(query);
    const startSlug = report.filters.startDate.replace(/-/g, '');
    const endSlug = report.filters.endDate.replace(/-/g, '');
    const filename = `eduroute-ISSU-movement-${startSlug}-${endSlug}.pdf`;
    const buffer = await buildISSUMovementReportPdf({
        filters: report.filters,
        summary: report.summary,
        movementLogs: report.movementLogs,
        reportMeta: report.reportMeta,
        sortOrder: normalizeSortOrder(query.sortOrder),
        exportedBy: user.full_name || 'ISSU Administrator',
    });

    return {
        buffer,
        filename,
    };
};

const sendReportToHrmu = async (userId, query = {}) => {
    const user = await hrmuDashboardRepository.getHrmuUserContext(userId, ['cssu', 'admin']);
    if (!user) {
        throw new AppError('Only ISSU and admin users can send ISSU reports to HRMU.', 403);
    }

    const report = await getReportsOverview(query);
    const startSlug = report.filters.startDate.replace(/-/g, '');
    const endSlug = report.filters.endDate.replace(/-/g, '');
    const filename = `eduroute-ISSU-movement-${startSlug}-${endSlug}.pdf`;
    const sortOrder = normalizeSortOrder(query.sortOrder);
    const buffer = await buildISSUMovementReportPdf({
        filters: report.filters,
        summary: report.summary,
        movementLogs: report.movementLogs,
        reportMeta: report.reportMeta,
        sortOrder,
        exportedBy: user.full_name || 'ISSU Administrator',
    });

    const inboxItem = await hrmuReportInboxRepository.createInboxAttachment({
        senderUserId: userId,
        senderName: user.full_name || 'ISSU Administrator',
        reportKind: 'ISSU_movement',
        reportTitle: 'ISSU Movement Logs Preview',
        reportSubtitle: `Coverage: ${report.filters.dateRangeLabel}`,
        filename,
        mimeType: 'application/pdf',
        fileData: buffer,
        filters: {
            ...report.filters,
            reportId: report.reportMeta?.reportId || null,
            sortOrder,
            totalMovements: report.summary?.totalMovements || 0,
            exitClearances: report.summary?.exitClearances || 0,
            flaggedEvents: report.summary?.flaggedEvents || 0,
        },
    });

    return {
        id: inboxItem?.id || null,
        filename,
        sentAt: inboxItem?.created_at ? new Date(inboxItem.created_at).toISOString() : new Date().toISOString(),
        sentBy: user.full_name || 'ISSU Administrator',
        reportTitle: 'ISSU Movement Logs Preview',
    };
};

const buildValidationLog = ({ lookupMethod, lookupTime, validatedAt, statusLabel, suppressLookupLog = false }) => {
    const items = [];

    if (lookupTime && !suppressLookupLog) {
        items.push({
            type: 'success',
            title: lookupMethod === 'qr' ? 'QR Code Validated' : 'Locator Slip Code Matched',
            timeLabel: formatTimeLabel(lookupTime),
            occurredAt: lookupTime,
        });
    }

    if (validatedAt) {
        items.push({
            type: statusLabel === 'Denied' || statusLabel === 'Flagged' ? 'danger' : 'success',
            title: statusLabel === 'Denied'
                ? 'Locator Slip: Exit Denied'
                : statusLabel === 'Flagged'
                    ? 'Locator Slip: Flagged Incident'
                : 'Locator Slip: Validated (Official)',
            timeLabel: formatTimeLabel(validatedAt),
            occurredAt: validatedAt,
        });
    }

    return items;
};

const lookupExitCandidate = async (query = {}) => {
    const rawLookupValue = String(query.locatorSlipCode || query.qrValue || '').trim();
    const returnEntryToken = /^EDU-ENTRY-[A-F0-9]{48}$/i.test(rawLookupValue) ? rawLookupValue.toUpperCase() : null;
    const returnEntryCode = /^RE-[A-Z0-9]{6}$/i.test(rawLookupValue) ? rawLookupValue.toUpperCase() : null;
    let locatorSlipCode = rawLookupValue.toUpperCase();
    const gate = String(query.gate || 'main_gate').toLowerCase();
    const method = String(query.method || (query.qrValue ? 'qr' : 'manual')).toLowerCase();
    const suppressLookupLog = String(query.suppressLookupLog || '').toLowerCase() === 'true';
    const allowConsumedReturnEntry = ['true', '1', 'history'].includes(String(query.history || '').toLowerCase());

    if (!locatorSlipCode) {
        throw new AppError('Locator slip code is required for ISSU exit validation lookup.', 422);
    }

    if (!GATE_OPTIONS.has(gate)) {
        throw new AppError('Invalid ISSU gate filter.', 422);
    }

    if (!['manual', 'qr'].includes(method)) {
        throw new AppError('Invalid ISSU lookup method.', 422);
    }

    let returnEntryTokenRow = null;
    if (returnEntryToken || returnEntryCode) {
        const tokenHash = returnEntryToken ? crypto.createHash('sha256').update(returnEntryToken).digest('hex') : null;
        const tokenResult = await pool.query(
            `SELECT token.trip_id,
                    trip.status AS return_trip_status,
                    COALESCE(trip.locator_slip_id, fallback_locator.locator_slip_id) AS locator_slip_id,
                    COALESCE(locator.locator_slip_code, fallback_locator.locator_slip_code) AS locator_slip_code
             FROM trip_return_entry_tokens token
             JOIN trips trip ON trip.id = token.trip_id
             LEFT JOIN locator_slips locator ON locator.id = trip.locator_slip_id
             LEFT JOIN LATERAL (
                SELECT ls.id AS locator_slip_id, ls.locator_slip_code
                FROM locator_slips ls
                WHERE ls.faculty_user_id = trip.user_id
                  AND ls.status IN ('approved', 'verified', 'completed')
                ORDER BY
                    ABS(EXTRACT(EPOCH FROM (COALESCE(ls.departure_datetime, ls.created_at) - COALESCE(trip.started_at, ls.created_at)))) ASC,
                    COALESCE(ls.departure_datetime, ls.created_at) DESC
                LIMIT 1
             ) fallback_locator ON TRUE
             WHERE (${tokenHash ? 'token.token_hash = $1' : 'token.entry_code = $1'})
               AND (
                    $2::boolean
                    OR (token.consumed_at IS NULL AND token.expires_at > CURRENT_TIMESTAMP)
               )
             LIMIT 1`,
            [tokenHash || returnEntryCode, allowConsumedReturnEntry]
        );
        returnEntryTokenRow = tokenResult.rows[0] || null;
        if (!returnEntryTokenRow) {
            throw new AppError('The return-entry QR is invalid, expired, or already used.', 410);
        }
        locatorSlipCode = String(returnEntryTokenRow.locator_slip_code || '').toUpperCase();
    }

    const slip = await ISSUDashboardRepository.findLocatorSlipByCode(locatorSlipCode);
    if (!slip) {
        throw new AppError('Locator slip not found for the provided locator slip code.', 404);
    }

    const normalizedSlipStatus = String(slip?.locator_slip_status || '').toLowerCase();
    const normalizedExitStatus = String(slip?.exit_status || '').toLowerCase();
    const normalizedTripStatus = String(returnEntryTokenRow?.return_trip_status || slip?.trip_status || '').toLowerCase();
    const hasFlagIncidentNote = String(slip?.exit_notes || '').startsWith(ISSU_FLAG_INCIDENT_NOTE_PREFIX);
    const isReturnEntryCheckpoint = Boolean(returnEntryTokenRow)
        && !hasFlagIncidentNote
        && (normalizedTripStatus === 'returning' || allowConsumedReturnEntry);
    const currentStatus = isReturnEntryCheckpoint
        ? 'returning_entry'
        : hasFlagIncidentNote
        ? 'flagged'
        : normalizedExitStatus
            || (['approved', 'verified'].includes(normalizedSlipStatus)
            ? 'approved'
            : normalizedSlipStatus === 'pending'
                ? 'pending'
                : normalizedSlipStatus === 'rejected'
                    ? 'rejected'
                    : 'denied');
    const statusLabel = isReturnEntryCheckpoint
        ? 'Return Entry'
        : currentStatus === 'pending'
        ? 'Pending'
        : currentStatus === 'rejected'
            ? 'Rejected'
            : currentStatus === 'completed'
                ? 'Completed'
                : currentStatus === 'cancelled'
                    ? 'Cancelled'
                    : formatStatusLabel(currentStatus);
    const lookupTime = new Date().toISOString();
    const attemptStats = await ISSUDashboardRepository.getLocatorSlipAttemptStats(slip.locator_slip_id);
    const returnVerificationTimeline = isReturnEntryCheckpoint
        ? await getReturnVerificationTimeline(returnEntryTokenRow?.trip_id || slip.trip_id)
        : {
            tripStartedAt: null,
            proofSubmittedAt: null,
            returnEntryConfirmedAt: null,
        };
    const scanConfidence = buildScanConfidence({
        currentStatus,
        normalizedSlipStatus,
        attemptStats,
        isReturnEntryCheckpoint,
    });

    if (!suppressLookupLog) {
        await ISSUDashboardRepository.recordScanAttempt({
            locatorSlipId: slip.locator_slip_id,
            facultyUserId: slip.faculty_user_id,
            gate,
            lookupMethod: method,
            outcome: getLookupOutcome(currentStatus === 'rejected' ? normalizedSlipStatus : currentStatus),
            notes: scanConfidence.message,
        }).catch(() => null);
    }

    return {
        lookupMethod: method,
        gate,
        gateLabel: formatGateLabel(gate),
        faculty: {
            facultyUserId: slip.faculty_user_id,
            facultyName: slip.full_name,
            profileImageUrl: slip.faculty_profile_image_url || null,
            departmentName: slip.department_name || 'Unassigned Department',
            facultyId: slip.employee_id,
            employmentTypeLabel: formatEmploymentTypeLabel(slip.employment_type),
            position: slip.department_position || 'Instructor',
        },
        locatorSlip: slip ? {
            locatorSlipId: slip.locator_slip_id,
            locatorSlipCode: slip.locator_slip_code || locatorSlipCode,
            destination: slip.destination,
            purpose: slip.purpose_of_travel,
            status: currentStatus,
            statusLabel,
            tripId: slip.trip_id || null,
            tripStatus: normalizedTripStatus || null,
            checkpointMode: isReturnEntryCheckpoint ? 'entry' : 'exit',
            isReturnEntry: isReturnEntryCheckpoint,
            returnEntryToken: isReturnEntryCheckpoint ? returnEntryToken : null,
            returnEntryCode: isReturnEntryCheckpoint ? returnEntryCode : null,
            ...returnVerificationTimeline,
            departureTime: slip.departure_datetime ? new Date(slip.departure_datetime).toISOString() : null,
            expectedReturnTime: slip.expected_return_datetime ? new Date(slip.expected_return_datetime).toISOString() : null,
            validatedAt: slip.validated_at ? new Date(slip.validated_at).toISOString() : null,
            validatedTimeLabel: formatTimeLabel(slip.validated_at),
            canAllowExit: (isReturnEntryCheckpoint && !allowConsumedReturnEntry) || (!isReturnEntryCheckpoint && ['approved', 'verified'].includes(normalizedSlipStatus) && currentStatus === 'approved'),
            canDenyExit: !isReturnEntryCheckpoint && ['approved', 'verified'].includes(normalizedSlipStatus) && currentStatus === 'approved',
            canFlagIncident: !isReturnEntryCheckpoint && ['pending', 'rejected'].includes(normalizedSlipStatus) && ['pending', 'rejected'].includes(currentStatus),
            isOfficial: currentStatus === 'validated' || isReturnEntryCheckpoint,
            locked: !isReturnEntryCheckpoint && ['denied', 'flagged', 'validated', 'completed', 'cancelled'].includes(currentStatus),
        } : {
            locatorSlipId: null,
            locatorSlipCode,
            destination: null,
            purpose: null,
            status: 'denied',
            statusLabel: 'Denied',
            tripId: null,
            tripStatus: null,
            checkpointMode: 'exit',
            isReturnEntry: false,
            departureTime: null,
            expectedReturnTime: null,
            validatedAt: null,
            validatedTimeLabel: '--',
            tripStartedAt: null,
            proofSubmittedAt: null,
            returnEntryConfirmedAt: null,
            canAllowExit: false,
            canDenyExit: false,
            canFlagIncident: false,
            isOfficial: false,
            locked: false,
        },
        scanConfidence,
        validationLog: buildValidationLog({
            lookupMethod: method,
            lookupTime,
            validatedAt: slip?.validated_at,
            statusLabel,
            suppressLookupLog,
        }),
    };
};

const updateExitLogStatus = async (ISSUUserId, locatorSlipId, payload = {}) => {
    const gate = String(payload.gate || 'main_gate').toLowerCase();
    const status = String(payload.status || 'approved').toLowerCase();
    const validationMethod = String(payload.method || 'manual').toLowerCase();
    const rawNotes = typeof payload.notes === 'string' ? payload.notes.trim() || null : null;
    const checkpoint = String(payload.checkpoint || 'exit').toLowerCase();

    if (!GATE_OPTIONS.has(gate)) {
        throw new AppError('Invalid ISSU gate value.', 422);
    }

    if (!['approved', 'validated', 'denied', 'flagged'].includes(status)) {
        throw new AppError('Invalid ISSU exit status.', 422);
    }

    if (!['exit', 'entry'].includes(checkpoint)) {
        throw new AppError('Invalid ISSU checkpoint.', 422);
    }

    if (!['manual', 'qr'].includes(validationMethod)) {
        throw new AppError('Invalid ISSU validation method.', 422);
    }

    const locatorSlip = await ISSUDashboardRepository.findLocatorSlipForExitStatus(locatorSlipId);

    if (!locatorSlip) {
        throw new AppError('Locator slip not found.', 404);
    }

    const locatorSlipStatus = String(locatorSlip.status || '').toLowerCase();
    const existingExitStatus = String(locatorSlip.exit_status || '').toLowerCase();
    const tripStatus = String(locatorSlip.trip_status || '').toLowerCase();
    const hasExistingFlagIncidentNote = String(locatorSlip.exit_notes || '').startsWith(ISSU_FLAG_INCIDENT_NOTE_PREFIX);

    if (checkpoint === 'entry') {
        if (status !== 'validated') {
            throw new AppError('Return entry can only be validated.', 422);
        }

        if (existingExitStatus !== 'validated') {
            throw new AppError('This locator slip must be validated for exit before return entry can be recorded.', 409);
        }

        if (hasExistingFlagIncidentNote || existingExitStatus === 'denied') {
            throw new AppError('This locator slip cannot be entered because its exit decision is locked.', 409);
        }

        if (!payload.returnEntryToken && !payload.returnEntryCode) {
            throw new AppError('This locator slip does not have an active returning trip for entry validation.', 409);
        }

        const entryTokenHash = payload.returnEntryToken
            ? crypto.createHash('sha256').update(String(payload.returnEntryToken)).digest('hex')
            : null;
        const entryTokenResult = await pool.query(
            `SELECT token.trip_id, trip.user_id, trip.status AS trip_status
             FROM trip_return_entry_tokens token
             JOIN trips trip ON trip.id = token.trip_id
             WHERE token.trip_id IS NOT NULL
               AND (${entryTokenHash ? 'token.token_hash = $1' : 'token.entry_code = $1'})
               AND token.consumed_at IS NULL
               AND token.expires_at > CURRENT_TIMESTAMP
             LIMIT 1`,
            [entryTokenHash || String(payload.returnEntryCode).toUpperCase()]
        );
        const entryTrip = entryTokenResult.rows[0] || null;
        if (!entryTrip || String(entryTrip.trip_status || '').toLowerCase() !== 'returning') {
            throw new AppError('This locator slip does not have an active returning trip for entry validation.', 409);
        }

        const facultyTripFlowService = require('./facultyTripFlow.service');
        const returnedTrip = await facultyTripFlowService.markReturned(entryTrip.user_id, entryTrip.trip_id, {
            source: 'issu_return_entry',
            returnEntryToken: payload.returnEntryToken,
            returnEntryCode: payload.returnEntryCode,
            gate,
            method: validationMethod,
            notes: rawNotes,
        });
        const validatedAt = returnedTrip?.locatorSlip?.completedAt
            || returnedTrip?.summary?.actualReturnTime
            || returnedTrip?.trip?.ended_at
            || returnedTrip?.trip?.returned_at
            || new Date().toISOString();

        await ISSUDashboardRepository.recordScanAttempt({
            locatorSlipId,
            facultyUserId: entryTrip.user_id,
            gate,
            lookupMethod: validationMethod,
            outcome: 'entry_validated',
            notes: rawNotes || 'Return entry QR allowed by ISSU.',
            validatedBy: ISSUUserId
        }).catch(() => null);

        return {
            locatorSlipId,
            gate,
            gateLabel: formatGateLabel(gate),
            status: 'entry_validated',
            statusLabel: formatStatusLabel('entry_validated'),
            checkpoint: 'entry',
            validationMethod,
            validatedAt,
            validatedTimeLabel: formatTimeLabel(validatedAt),
            notes: rawNotes,
            isOfficial: true,
        };
    }

    if (existingExitStatus === 'validated') {
        throw new AppError('ISSU exit validation is already final for this locator slip.', 409);
    }

    if (existingExitStatus === 'denied') {
        throw new AppError(
            hasExistingFlagIncidentNote
                ? 'This locator slip was already flagged by ISSU and can no longer be changed.'
                : 'This locator slip exit was already rejected by ISSU and can no longer be changed.',
            409
        );
    }

    if (status === 'flagged') {
        if (!['pending', 'rejected'].includes(locatorSlipStatus)) {
            throw new AppError('Only pending or rejected locator slips can be flagged as ISSU exit incidents.', 409);
        }
    } else if (!['approved', 'verified'].includes(locatorSlipStatus)) {
        throw new AppError('Only approved locator slips can be tracked in ISSU exit monitoring.', 409);
    }

    const persistedStatus = status === 'flagged' ? 'denied' : status;
    const notes = status === 'flagged'
        ? `${ISSU_FLAG_INCIDENT_NOTE_PREFIX}${locatorSlipStatus}${rawNotes ? `|${rawNotes}` : ''}`
        : rawNotes;

    const row = await ISSUDashboardRepository.upsertExitLogStatus({
        locatorSlipId,
        facultyUserId: locatorSlip.faculty_user_id,
        gate,
        status: persistedStatus,
        validationMethod,
        validatedBy: ISSUUserId,
        notes,
    });

    const ISSUValidationStatus = status === 'validated'
        ? 'allowed'
        : status === 'flagged'
            ? 'flagged'
            : status === 'denied'
                ? 'denied'
                : 'pending';

    await ISSUDashboardRepository.updateLocatorSlipISSUValidation({
        locatorSlipId,
        ISSUValidationStatus,
        ISSUValidatedAt: row.validated_at || null,
        ISSUValidatedBy: ISSUUserId,
        ISSUValidationNotes: notes,
        locatorSlipStatus: status === 'denied' ? 'rejected' : null,
    }).catch(() => null);

    if (status === 'validated') {
        const hrmuValidationContext = await hrmuDashboardRepository.getApprovedLocatorSlipNotificationPayload(locatorSlipId).catch(() => null);
        if (hrmuValidationContext) {
            await hrmuDashboardRepository.createHrmuTripEventNotifications(null, {
                locatorSlipId,
                type: hrmuDashboardRepository.HRMU_NOTIFICATION_TYPE_ISSU_VALIDATED_EXIT,
                title: 'ISSU validated exit',
                message: `${hrmuValidationContext.faculty_name || 'An employee'} was cleared by ISSU through ${formatGateLabel(gate)}${hrmuValidationContext.destination ? ` for ${hrmuValidationContext.destination}` : ''}.`
            }).catch(() => null);
        }

        await locatorSlipNotificationService.notifyFacultyOfISSUExitValidation({
            recipientUserId: locatorSlip.faculty_user_id,
            senderUserId: ISSUUserId,
            locatorSlipId,
            gateLabel: formatGateLabel(gate),
            destination: locatorSlip.destination,
        }).catch((notificationError) => {
            console.error('Failed to notify faculty about ISSU exit validation:', notificationError);
        });
    } else if (status === 'denied') {
        await locatorSlipNotificationService.notifyFacultyOfISSUExitDenial({
            recipientUserId: locatorSlip.faculty_user_id,
            senderUserId: ISSUUserId,
            locatorSlipId,
            gateLabel: formatGateLabel(gate),
            remarks: rawNotes,
        }).catch((notificationError) => {
            console.error('Failed to notify faculty about ISSU exit denial:', notificationError);
        });
    }

    return {
        locatorSlipId: row.locator_slip_id,
        gate: row.gate,
        gateLabel: formatGateLabel(row.gate),
        status,
        statusLabel: formatStatusLabel(status),
        checkpoint: 'exit',
        validationMethod: row.validation_method,
        validatedAt: row.validated_at ? new Date(row.validated_at).toISOString() : null,
        validatedTimeLabel: formatTimeLabel(row.validated_at),
        notes: row.notes || null,
        isOfficial: status === 'validated',
    };
};

module.exports = {
    getDashboardSummary,
    getIncidentOverview,
    getLiveExitMonitoring,
    getDashboardActivityTimeline,
    getFacultyExitHistory,
    getNotificationsOverview,
    getReportsOverview,
    getReportsDownload,
    sendReportToHrmu,
    lookupExitCandidate,
    updateExitLogStatus,
};
