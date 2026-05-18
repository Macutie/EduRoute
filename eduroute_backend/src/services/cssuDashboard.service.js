const AppError = require('../utils/appError');
const cssuDashboardRepository = require('../repositories/cssuDashboard.repository');
const { CSSU_FLAG_INCIDENT_NOTE_PREFIX } = require('../repositories/cssuDashboard.repository');
const hrmuDashboardRepository = require('../repositories/hrmuDashboard.repository');
const hrmuReportInboxRepository = require('../repositories/hrmuReportInbox.repository');
const locatorSlipNotificationService = require('./locatorSlipNotification.service');
const { buildCssuMovementReportPdf } = require('../utils/simplePdf');

const GATE_OPTIONS = new Set(['main_gate', 'back_gate']);
const CSSU_ALLOWED_DEPARTMENTS = new Set([
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
    if (value === 'denied') return 'Denied';
    return 'Approved';
};

const formatEmploymentTypeLabel = (value) => (
    String(value || '').toLowerCase() === 'part_time'
        ? 'Part-Time Faculty'
        : 'Full-Time Faculty'
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

    if (departmentName !== 'all' && !CSSU_ALLOWED_DEPARTMENTS.has(departmentName)) {
        throw new AppError('Invalid CSSU department filter.', 422);
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
    const summary = await cssuDashboardRepository.getDashboardSummary();
    const totalFacultyExiting = Number(summary.total_faculty_exiting || 0);
    const approvedLocatorSlips = Number(summary.approved_locator_slips || 0);
    const rejectedLocatorSlips = Number(summary.rejected_locator_slips || 0);

    return {
        totalFacultyExiting,
        approvedLocatorSlips,
        rejectedLocatorSlips,
        approvalRate: totalFacultyExiting
            ? Number(((approvedLocatorSlips / totalFacultyExiting) * 100).toFixed(1))
            : 0,
    };
};

const getLiveExitMonitoring = async (query = {}) => {
    const gate = String(query.gate || 'main_gate').toLowerCase();
    const limit = Math.min(Math.max(Number(query.limit || 20), 1), 100);

    if (!GATE_OPTIONS.has(gate)) {
        throw new AppError('Invalid CSSU gate filter.', 422);
    }

    const rows = await cssuDashboardRepository.getLiveExitMonitoring(gate, limit);

    return {
        gate,
        gateLabel: formatGateLabel(gate),
        rows: rows.map((row) => ({
            locatorSlipId: row.locator_slip_id,
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
        })),
    };
};

const getIncidentOverview = async () => {
    const rows = await cssuDashboardRepository.getIncidentOverview();
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
    const data = await cssuDashboardRepository.getNotificationsOverview(limit);

    return {
        summary: {
            validatedClearances: Number(data.validated_clearances || 0),
            flaggedExits: Number(data.flagged_exits || 0),
            unauthorizedExit: Number(data.unauthorized_exit || 0),
        },
        notifications: (Array.isArray(data.notifications) ? data.notifications : []).map((row) => ({
            id: row.notification_id,
            locatorSlipId: row.locator_slip_id,
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
        facultyName: row.faculty_name || 'Unknown faculty',
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
        cssuDashboardRepository.getReportsSummary(filters),
        cssuDashboardRepository.getReportsActivityByDepartment(filters),
        cssuDashboardRepository.getReportsMovementLogs(filters),
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
            reportId: `CSSU-${filters.startDate.replace(/-/g, '')}-${filters.endDate.replace(/-/g, '')}`,
            lastGeneratedAt: new Date().toISOString(),
            lastGeneratedLabel: formatDateTimeLabel(new Date().toISOString()),
        },
    };
};

const getReportsDownload = async (userId, query = {}) => {
    const user = await hrmuDashboardRepository.getHrmuUserContext(userId, ['cssu', 'admin']);
    if (!user) {
        throw new AppError('Only CSSU and admin users can export CSSU reports.', 403);
    }

    const report = await getReportsOverview(query);
    const startSlug = report.filters.startDate.replace(/-/g, '');
    const endSlug = report.filters.endDate.replace(/-/g, '');
    const filename = `eduroute-cssu-movement-${startSlug}-${endSlug}.pdf`;
    const buffer = await buildCssuMovementReportPdf({
        filters: report.filters,
        summary: report.summary,
        movementLogs: report.movementLogs,
        reportMeta: report.reportMeta,
        sortOrder: normalizeSortOrder(query.sortOrder),
        exportedBy: user.full_name || 'CSSU Administrator',
    });

    return {
        buffer,
        filename,
    };
};

const sendReportToHrmu = async (userId, query = {}) => {
    const user = await hrmuDashboardRepository.getHrmuUserContext(userId, ['cssu', 'admin']);
    if (!user) {
        throw new AppError('Only CSSU and admin users can send CSSU reports to HRMU.', 403);
    }

    const report = await getReportsOverview(query);
    const startSlug = report.filters.startDate.replace(/-/g, '');
    const endSlug = report.filters.endDate.replace(/-/g, '');
    const filename = `eduroute-cssu-movement-${startSlug}-${endSlug}.pdf`;
    const sortOrder = normalizeSortOrder(query.sortOrder);
    const buffer = await buildCssuMovementReportPdf({
        filters: report.filters,
        summary: report.summary,
        movementLogs: report.movementLogs,
        reportMeta: report.reportMeta,
        sortOrder,
        exportedBy: user.full_name || 'CSSU Administrator',
    });

    const inboxItem = await hrmuReportInboxRepository.createInboxAttachment({
        senderUserId: userId,
        senderName: user.full_name || 'CSSU Administrator',
        reportKind: 'cssu_movement',
        reportTitle: 'CSSU Movement Logs Preview',
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
        sentBy: user.full_name || 'CSSU Administrator',
        reportTitle: 'CSSU Movement Logs Preview',
    };
};

const buildValidationLog = ({ lookupMethod, lookupTime, validatedAt, statusLabel }) => {
    const items = [];

    if (lookupTime) {
        items.push({
            type: 'success',
            title: lookupMethod === 'qr' ? 'QR Code Validated' : 'Locator Slip Code Matched',
            timeLabel: formatTimeLabel(lookupTime),
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
        });
    }

    return items;
};

const lookupExitCandidate = async (query = {}) => {
    const locatorSlipCode = String(query.locatorSlipCode || query.qrValue || '').trim().toUpperCase();
    const gate = String(query.gate || 'main_gate').toLowerCase();
    const method = String(query.method || (query.qrValue ? 'qr' : 'manual')).toLowerCase();

    if (!locatorSlipCode) {
        throw new AppError('Locator slip code is required for CSSU exit validation lookup.', 422);
    }

    if (!GATE_OPTIONS.has(gate)) {
        throw new AppError('Invalid CSSU gate filter.', 422);
    }

    if (!['manual', 'qr'].includes(method)) {
        throw new AppError('Invalid CSSU lookup method.', 422);
    }

    const slip = await cssuDashboardRepository.findLocatorSlipByCode(locatorSlipCode);
    if (!slip) {
        throw new AppError('Locator slip not found for the provided locator slip code.', 404);
    }

    const normalizedSlipStatus = String(slip?.locator_slip_status || '').toLowerCase();
    const normalizedExitStatus = String(slip?.exit_status || '').toLowerCase();
    const hasFlagIncidentNote = String(slip?.exit_notes || '').startsWith(CSSU_FLAG_INCIDENT_NOTE_PREFIX);
    const currentStatus = hasFlagIncidentNote
        ? 'flagged'
        : normalizedExitStatus
            || (['approved', 'verified'].includes(normalizedSlipStatus)
            ? 'approved'
            : normalizedSlipStatus === 'pending'
                ? 'pending'
                : normalizedSlipStatus === 'rejected'
                    ? 'rejected'
                    : 'denied');
    const statusLabel = currentStatus === 'pending'
        ? 'Pending'
        : currentStatus === 'rejected'
            ? 'Rejected'
            : currentStatus === 'completed'
                ? 'Completed'
                : currentStatus === 'cancelled'
                    ? 'Cancelled'
                    : formatStatusLabel(currentStatus);
    const lookupTime = new Date().toISOString();

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
            departureTime: slip.departure_datetime ? new Date(slip.departure_datetime).toISOString() : null,
            expectedReturnTime: slip.expected_return_datetime ? new Date(slip.expected_return_datetime).toISOString() : null,
            validatedAt: slip.validated_at ? new Date(slip.validated_at).toISOString() : null,
            validatedTimeLabel: formatTimeLabel(slip.validated_at),
            canAllowExit: ['approved', 'verified'].includes(normalizedSlipStatus) && currentStatus === 'approved',
            canDenyExit: ['approved', 'verified'].includes(normalizedSlipStatus) && currentStatus === 'approved',
            canFlagIncident: ['pending', 'rejected'].includes(normalizedSlipStatus) && ['pending', 'rejected'].includes(currentStatus),
            isOfficial: currentStatus === 'validated',
        } : {
            locatorSlipId: null,
            locatorSlipCode,
            destination: null,
            purpose: null,
            status: 'denied',
            statusLabel: 'Denied',
            departureTime: null,
            expectedReturnTime: null,
            validatedAt: null,
            validatedTimeLabel: '--',
            canAllowExit: false,
            canDenyExit: false,
            canFlagIncident: false,
            isOfficial: false,
        },
        validationLog: buildValidationLog({
            lookupMethod: method,
            lookupTime,
            validatedAt: slip?.validated_at,
            statusLabel,
        }),
    };
};

const updateExitLogStatus = async (cssuUserId, locatorSlipId, payload = {}) => {
    const gate = String(payload.gate || 'main_gate').toLowerCase();
    const status = String(payload.status || 'approved').toLowerCase();
    const validationMethod = String(payload.method || 'manual').toLowerCase();
    const rawNotes = typeof payload.notes === 'string' ? payload.notes.trim() || null : null;

    if (!GATE_OPTIONS.has(gate)) {
        throw new AppError('Invalid CSSU gate value.', 422);
    }

    if (!['approved', 'validated', 'denied', 'flagged'].includes(status)) {
        throw new AppError('Invalid CSSU exit status.', 422);
    }

    if (!['manual', 'qr'].includes(validationMethod)) {
        throw new AppError('Invalid CSSU validation method.', 422);
    }

    const locatorSlip = await cssuDashboardRepository.findLocatorSlipForExitStatus(locatorSlipId);

    if (!locatorSlip) {
        throw new AppError('Locator slip not found.', 404);
    }

    const locatorSlipStatus = String(locatorSlip.status || '').toLowerCase();
    const existingExitStatus = String(locatorSlip.exit_status || '').toLowerCase();
    const hasExistingFlagIncidentNote = String(locatorSlip.exit_notes || '').startsWith(CSSU_FLAG_INCIDENT_NOTE_PREFIX);

    if (existingExitStatus === 'validated') {
        throw new AppError('CSSU exit validation is already final for this locator slip.', 409);
    }

    if (existingExitStatus === 'denied') {
        throw new AppError(
            hasExistingFlagIncidentNote
                ? 'This locator slip was already flagged by CSSU and can no longer be changed.'
                : 'This locator slip exit was already rejected by CSSU and can no longer be changed.',
            409
        );
    }

    if (status === 'flagged') {
        if (!['pending', 'rejected'].includes(locatorSlipStatus)) {
            throw new AppError('Only pending or rejected locator slips can be flagged as CSSU exit incidents.', 409);
        }
    } else if (!['approved', 'verified'].includes(locatorSlipStatus)) {
        throw new AppError('Only approved locator slips can be tracked in CSSU exit monitoring.', 409);
    }

    const persistedStatus = status === 'flagged' ? 'denied' : status;
    const notes = status === 'flagged'
        ? `${CSSU_FLAG_INCIDENT_NOTE_PREFIX}${locatorSlipStatus}${rawNotes ? `|${rawNotes}` : ''}`
        : rawNotes;

    const row = await cssuDashboardRepository.upsertExitLogStatus({
        locatorSlipId,
        facultyUserId: locatorSlip.faculty_user_id,
        gate,
        status: persistedStatus,
        validationMethod,
        validatedBy: cssuUserId,
        notes,
    });

    const cssuValidationStatus = status === 'validated'
        ? 'allowed'
        : status === 'flagged'
            ? 'flagged'
            : status === 'denied'
                ? 'denied'
                : 'pending';

    await cssuDashboardRepository.updateLocatorSlipCssuValidation({
        locatorSlipId,
        cssuValidationStatus,
        cssuValidatedAt: row.validated_at || null,
        cssuValidatedBy: cssuUserId,
        cssuValidationNotes: notes,
    }).catch(() => null);

    if (status === 'validated') {
        const hrmuValidationContext = await hrmuDashboardRepository.getApprovedLocatorSlipNotificationPayload(locatorSlipId).catch(() => null);
        if (hrmuValidationContext) {
            await hrmuDashboardRepository.createHrmuTripEventNotifications(null, {
                locatorSlipId,
                type: hrmuDashboardRepository.HRMU_NOTIFICATION_TYPE_CSSU_VALIDATED_EXIT,
                title: 'CSSU validated exit',
                message: `${hrmuValidationContext.faculty_name || 'A faculty member'} was cleared by CSSU through ${formatGateLabel(gate)}${hrmuValidationContext.destination ? ` for ${hrmuValidationContext.destination}` : ''}.`
            }).catch(() => null);
        }

        await locatorSlipNotificationService.notifyFacultyOfCssuExitValidation({
            recipientUserId: locatorSlip.faculty_user_id,
            senderUserId: cssuUserId,
            locatorSlipId,
            gateLabel: formatGateLabel(gate),
            destination: locatorSlip.destination,
        }).catch((notificationError) => {
            console.error('Failed to notify faculty about CSSU exit validation:', notificationError);
        });
    }

    return {
        locatorSlipId: row.locator_slip_id,
        gate: row.gate,
        gateLabel: formatGateLabel(row.gate),
        status,
        statusLabel: formatStatusLabel(status),
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
    getNotificationsOverview,
    getReportsOverview,
    getReportsDownload,
    sendReportToHrmu,
    lookupExitCandidate,
    updateExitLogStatus,
};
