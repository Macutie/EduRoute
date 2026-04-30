const AppError = require('../utils/appError');
const hrmuDashboardRepository = require('../repositories/hrmuDashboard.repository');
const hrmuVerificationRepository = require('../repositories/hrmuVerification.repository');
const tripIncidentRepository = require('../repositories/tripIncident.repository');
const tripIncidentService = require('./tripIncident.service');
const { computeLocatorSlipDisplayStatus } = require('./status.service');
const socketBroadcasterService = require('./socketBroadcaster.service');

const assertHrmuUser = async (userId) => {
    const user = await hrmuDashboardRepository.getHrmuUserContext(userId);

    if (!user) {
        throw new AppError('Only HRMU and admin users can access HRMU verification.', 403);
    }

    return user;
};

const mapVerificationTripRow = (row) => {
    const flaggedReasons = Array.isArray(row.incident_labels) ? row.incident_labels : [];
    const baseDisplayStatus = computeLocatorSlipDisplayStatus({
        locatorSlip: {
            status: row.locator_slip_status,
            expectedReturnTime: row.expected_return_datetime
        },
        trip: {
            status: row.trip_status,
            actualReturnTime: row.ended_at
        },
        incidents: flaggedReasons
    });
    const displayStatus = flaggedReasons.length > 0
        ? 'FLAGGED'
        : row.arrival_verification_status === 'verified'
            ? 'COMPLETED'
            : baseDisplayStatus === 'ACTIVE'
                ? 'LIVE'
                : baseDisplayStatus === 'RETURNED'
                    ? 'PENDING'
                    : (baseDisplayStatus || 'PENDING');

    return {
        verificationId: row.verification_id,
        locatorSlipId: row.locator_slip_id,
        tripId: row.trip_id,
        facultyUserId: row.faculty_user_id,
        facultyName: row.faculty_name,
        collegeName: row.college_name,
        purpose: row.purpose,
        destination: row.destination,
        tripStatus: row.trip_status || 'not_started',
        displayStatus,
        arrivalVerificationStatus: row.arrival_verification_status || null,
        verificationImageUrl: row.verification_image_url || null,
        flaggedReasons,
        flaggedIncidentTypes: Array.isArray(row.incident_types) ? row.incident_types : [],
        expectedReturnTime: row.expected_return_datetime ? new Date(row.expected_return_datetime).toISOString() : null,
        actualReturnTime: row.ended_at ? new Date(row.ended_at).toISOString() : null,
        latestLocationAt: row.latest_location_at ? new Date(row.latest_location_at).toISOString() : null,
        latestDetectedAt: row.latest_detected_at ? new Date(row.latest_detected_at).toISOString() : null
    };
};

const getVerificationTrips = async (userId) => {
    await assertHrmuUser(userId);
    await tripIncidentService.detectEndedTripsForIncidentScan().catch(() => []);
    await tripIncidentService.detectDisconnectedActiveTrips().catch(() => []);

    const rows = await hrmuVerificationRepository.getVerificationTrips();
    return {
        trips: rows.map(mapVerificationTripRow)
    };
};

const reviewArrivalVerification = async (reviewerId, verificationId, payload = {}) => {
    await assertHrmuUser(reviewerId);

    const nextStatus = String(payload.status || '').trim().toLowerCase();
    if (!['verified', 'rejected', 'unverified'].includes(nextStatus)) {
        throw new AppError('Arrival verification review status is invalid.', 422);
    }

    const verification = await hrmuVerificationRepository.getVerificationReviewRow(verificationId);
    if (!verification) {
        throw new AppError('Arrival verification not found.', 404);
    }

    const updated = await hrmuVerificationRepository.updateArrivalVerificationReview({
        verificationId,
        reviewerId,
        status: nextStatus,
        remarks: payload.remarks
    });

    if (!updated) {
        throw new AppError('Arrival verification review could not be saved.', 409);
    }

    if (verification.trip_id && ['rejected', 'unverified'].includes(nextStatus)) {
        await tripIncidentService.detectAllTripIncidents(verification.trip_id).catch(() => []);
    }

    const flaggedTrips = await tripIncidentRepository.getFlaggedTrips().catch(() => []);
    const flaggedTrip = flaggedTrips.find((item) => String(item.trip_id) === String(verification.trip_id));

    await socketBroadcasterService.broadcastHrmuDashboardUpdate().catch(() => null);

    const nextDisplayStatus = flaggedTrip?.incident_labels?.length
        ? 'FLAGGED'
        : updated.verification_status === 'verified'
            ? 'COMPLETED'
            : 'PENDING';

    return {
        verificationId: updated.id,
        locatorSlipId: verification.locator_slip_id,
        tripId: verification.trip_id,
        status: updated.verification_status,
        remarks: payload.remarks || null,
        displayStatus: nextDisplayStatus,
        flaggedReasons: flaggedTrip?.incident_labels || []
    };
};

module.exports = {
    getVerificationTrips,
    reviewArrivalVerification
};
