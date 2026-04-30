const AppError = require('../utils/appError');
const cssuDashboardRepository = require('../repositories/cssuDashboard.repository');

const GATE_OPTIONS = new Set(['main_gate', 'back_gate']);

const formatGateLabel = (value) => (
    value === 'back_gate' ? 'Back Gate' : 'Main Gate'
);

const formatStatusLabel = (value) => {
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
            facultyId: row.employee_id,
            departmentName: row.department_name || 'Unassigned Department',
            destination: row.destination,
            purpose: row.purpose_of_travel,
            status: String(row.monitoring_status || 'approved').toLowerCase(),
            statusLabel: formatStatusLabel(String(row.monitoring_status || 'approved').toLowerCase()),
            gate: row.gate || gate,
            gateLabel: formatGateLabel(row.gate || gate),
            validatedAt: row.status_timestamp ? new Date(row.status_timestamp).toISOString() : null,
            validatedTimeLabel: formatTimeLabel(row.status_timestamp),
        })),
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
            type: statusLabel === 'Denied' ? 'danger' : 'success',
            title: statusLabel === 'Denied' ? 'Locator Slip: Exit Denied' : 'Locator Slip: Validated (Official)',
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
    const currentStatus = normalizedExitStatus
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
            status: normalizedSlipStatus,
            statusLabel,
            departureTime: slip.departure_datetime ? new Date(slip.departure_datetime).toISOString() : null,
            expectedReturnTime: slip.expected_return_datetime ? new Date(slip.expected_return_datetime).toISOString() : null,
            validatedAt: slip.validated_at ? new Date(slip.validated_at).toISOString() : null,
            validatedTimeLabel: formatTimeLabel(slip.validated_at),
            canAllowExit: ['approved', 'verified'].includes(normalizedSlipStatus) && currentStatus !== 'validated',
            canDenyExit: ['approved', 'verified'].includes(normalizedSlipStatus) && currentStatus !== 'denied',
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
    const notes = typeof payload.notes === 'string' ? payload.notes.trim() || null : null;

    if (!GATE_OPTIONS.has(gate)) {
        throw new AppError('Invalid CSSU gate value.', 422);
    }

    if (!['approved', 'validated', 'denied'].includes(status)) {
        throw new AppError('Invalid CSSU exit status.', 422);
    }

    if (!['manual', 'qr'].includes(validationMethod)) {
        throw new AppError('Invalid CSSU validation method.', 422);
    }

    const locatorSlip = await cssuDashboardRepository.findLocatorSlipForExitStatus(locatorSlipId);

    if (!locatorSlip) {
        throw new AppError('Locator slip not found.', 404);
    }

    if (!['approved', 'verified'].includes(String(locatorSlip.status || '').toLowerCase())) {
        throw new AppError('Only approved locator slips can be tracked in CSSU exit monitoring.', 409);
    }

    const row = await cssuDashboardRepository.upsertExitLogStatus({
        locatorSlipId,
        facultyUserId: locatorSlip.faculty_user_id,
        gate,
        status,
        validationMethod,
        validatedBy: cssuUserId,
        notes,
    });

    return {
        locatorSlipId: row.locator_slip_id,
        gate: row.gate,
        gateLabel: formatGateLabel(row.gate),
        status: row.status,
        statusLabel: formatStatusLabel(row.status),
        validationMethod: row.validation_method,
        validatedAt: row.validated_at ? new Date(row.validated_at).toISOString() : null,
        validatedTimeLabel: formatTimeLabel(row.validated_at),
        notes: row.notes || null,
        isOfficial: row.status === 'validated',
    };
};

module.exports = {
    getDashboardSummary,
    getLiveExitMonitoring,
    lookupExitCandidate,
    updateExitLogStatus,
};
