const APPROVABLE_STATUSES = new Set(['approved', 'verified']);
const ACTIVE_TRIP_STATUSES = new Set(['active', 'arrived', 'returning']);
const COMPLETED_TRIP_STATUSES = new Set(['completed']);
const ISSU_ALLOWED_STATUS = 'allowed';

const normalizeISSUValidationStatus = (value) => {
    const normalized = String(value || '').toLowerCase();
    if (['allowed', 'denied', 'flagged'].includes(normalized)) {
        return normalized;
    }

    return 'pending';
};

const normalizeTripStatus = (value) => {
    const normalized = String(value || '').toLowerCase();
    return normalized || 'not_started';
};

const isLocatorSlipCompleted = (locatorSlip = {}, existingTrip = null) => {
    const locatorStatus = String(locatorSlip.status || '').toLowerCase();
    const tripStatus = normalizeTripStatus(locatorSlip.trip_status || locatorSlip.tripStatus);
    const existingTripStatus = normalizeTripStatus(existingTrip?.status);

    return (
        locatorStatus === 'completed'
        || tripStatus === 'completed'
        || COMPLETED_TRIP_STATUSES.has(existingTripStatus)
    );
};

const hasBlockingTrip = (existingTrip = null) => {
    const existingTripStatus = normalizeTripStatus(existingTrip?.status);
    return ACTIVE_TRIP_STATUSES.has(existingTripStatus) || COMPLETED_TRIP_STATUSES.has(existingTripStatus);
};

const canLocatorSlipStartTrip = (locatorSlip = {}, existingTrip = null) => {
    const locatorStatus = String(locatorSlip.status || '').toLowerCase();
    const ISSUValidationStatus = normalizeISSUValidationStatus(locatorSlip.ISSU_validation_status);
    const locatorTripStatus = normalizeTripStatus(locatorSlip.trip_status || locatorSlip.tripStatus);

    if (!APPROVABLE_STATUSES.has(locatorStatus)) {
        return false;
    }

    if (isLocatorSlipCompleted(locatorSlip, existingTrip)) {
        return false;
    }

    if (ACTIVE_TRIP_STATUSES.has(locatorTripStatus)) {
        return false;
    }

    if (ISSUValidationStatus !== ISSU_ALLOWED_STATUS) {
        return false;
    }

    if (hasBlockingTrip(existingTrip)) {
        return false;
    }

    return true;
};

const getFacultyLocatorSlipActions = (locatorSlip = {}, existingTrip = null) => {
    const locatorStatus = String(locatorSlip.status || '').toLowerCase();
    const tripStatus = normalizeTripStatus(existingTrip?.status || locatorSlip.trip_status || locatorSlip.tripStatus);
    const ISSUValidationStatus = normalizeISSUValidationStatus(locatorSlip.ISSU_validation_status);
    const isCompleted = isLocatorSlipCompleted(locatorSlip, existingTrip);
    const base = {
        showQr: false,
        viewRoute: false,
        startTrip: false,
        viewUploadedPhoto: false,
        showTripSummary: false,
        helperText: '',
        ISSUValidationStatus,
        tripStatus,
    };

    if (isCompleted) {
        return {
            ...base,
            helperText: 'This locator slip has been completed.',
        };
    }

    if (ACTIVE_TRIP_STATUSES.has(tripStatus)) {
        return {
            ...base,
            helperText: '',
        };
    }

    if (APPROVABLE_STATUSES.has(locatorStatus)) {
        if (ISSUValidationStatus === 'allowed') {
            return {
                ...base,
                showQr: true,
                viewRoute: true,
                startTrip: true,
                helperText: '',
            };
        }

        if (ISSUValidationStatus === 'denied') {
            return {
                ...base,
                showQr: true,
                helperText: 'Exit denied by ISSU.',
            };
        }

        if (ISSUValidationStatus === 'flagged') {
            return {
                ...base,
                showQr: true,
                helperText: 'Exit flagged by ISSU. Please contact ISSU or HRMU.',
            };
        }

        return {
            ...base,
            showQr: true,
            helperText: 'Waiting for ISSU exit validation.',
        };
    }

    return base;
};

module.exports = {
    ACTIVE_TRIP_STATUSES,
    APPROVABLE_STATUSES,
    canLocatorSlipStartTrip,
    getFacultyLocatorSlipActions,
    hasBlockingTrip,
    isLocatorSlipCompleted,
    normalizeISSUValidationStatus,
    normalizeTripStatus,
};
