const env = require('../config/env');

const DISPLAY_STATUSES = {
    FLAGGED: 'FLAGGED',
    ACTIVE: 'ACTIVE',
    RETURNED: 'RETURNED',
    REJECTED: 'REJECTED',
    PENDING: 'PENDING',
    VERIFIED: 'VERIFIED',
    UNKNOWN: 'UNKNOWN'
};

const normalizeValue = (value) => String(value || '').trim().toLowerCase();

const isTripActive = (tripStatus) => ['active', 'arrived', 'returning'].includes(normalizeValue(tripStatus));

const hasFlaggedIncidents = (incidents = []) => Array.isArray(incidents) && incidents.length > 0;

const isLateReturn = (expectedReturnTime, actualReturnTime) => {
    if (!expectedReturnTime || !actualReturnTime) {
        return false;
    }

    const expected = new Date(expectedReturnTime);
    const actual = new Date(actualReturnTime);
    if (Number.isNaN(expected.getTime()) || Number.isNaN(actual.getTime())) {
        return false;
    }

    const graceMinutes = Number(env.lateReturnGraceMinutes || 60);
    return actual.getTime() > expected.getTime() + (graceMinutes * 60 * 1000);
};

const computeLocatorSlipDisplayStatus = ({ locatorSlip, trip, incidents = [] } = {}) => {
    const locatorSlipStatus = normalizeValue(locatorSlip?.status || locatorSlip?.verificationStatus);
    const tripStatus = normalizeValue(trip?.status || trip?.tripStatus);
    const expectedReturnTime = locatorSlip?.expectedReturnTime || locatorSlip?.expected_return_time;
    const actualReturnTime = trip?.actualReturnTime || trip?.ended_at || trip?.returned_at || trip?.updated_at;

    if (hasFlaggedIncidents(incidents)) {
        return DISPLAY_STATUSES.FLAGGED;
    }

    if (isLateReturn(expectedReturnTime, actualReturnTime)) {
        return DISPLAY_STATUSES.FLAGGED;
    }

    if (isTripActive(tripStatus)) {
        return DISPLAY_STATUSES.ACTIVE;
    }

    if (tripStatus === 'completed') {
        return DISPLAY_STATUSES.RETURNED;
    }

    if (locatorSlipStatus === 'rejected') {
        return DISPLAY_STATUSES.REJECTED;
    }

    if (locatorSlipStatus === 'pending' || locatorSlipStatus === 'unverified') {
        return DISPLAY_STATUSES.PENDING;
    }

    if (['approved', 'verified', 'completed'].includes(locatorSlipStatus)) {
        return DISPLAY_STATUSES.VERIFIED;
    }

    return DISPLAY_STATUSES.UNKNOWN;
};

module.exports = {
    DISPLAY_STATUSES,
    computeLocatorSlipDisplayStatus,
    isTripActive,
    hasFlaggedIncidents,
    isLateReturn
};
