const AppError = require('../utils/appError');
const hrmuDashboardRepository = require('../repositories/hrmuDashboard.repository');
const hrmuVerificationRepository = require('../repositories/hrmuVerification.repository');
const tripIncidentRepository = require('../repositories/tripIncident.repository');
const tripIncidentService = require('./tripIncident.service');
const { computeLocatorSlipDisplayStatus } = require('./status.service');
const socketBroadcasterService = require('./socketBroadcaster.service');
const HRMU_REVIEW_FLAGGED_TYPE = 'hrmu_verification_review_flagged';
const HRMU_REVIEW_SUCCESS_TYPE = 'hrmu_verification_review_successful';

const assertHrmuUser = async (userId) => {
    const user = await hrmuDashboardRepository.getHrmuUserContext(userId);

    if (!user) {
        throw new AppError('Only HRMU and admin users can access HRMU verification.', 403);
    }

    return user;
};

const mapVerificationTripRow = (row) => {
    const flaggedReasons = Array.isArray(row.incident_labels) ? row.incident_labels : [];
    const normalizedArrivalVerificationStatus = String(row.arrival_verification_status || '').toLowerCase();
    const flaggedReviewAt = row.flagged_reviewed_at ? new Date(row.flagged_reviewed_at).toISOString() : null;
    const successfulReviewAt = row.successful_reviewed_at ? new Date(row.successful_reviewed_at).toISOString() : null;
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
    const displayStatus = flaggedReasons.length > 0 || flaggedReviewAt
        ? 'FLAGGED'
        : normalizedArrivalVerificationStatus === 'accepted' || successfulReviewAt
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
        arrivalVerificationStatus: normalizedArrivalVerificationStatus || null,
        verificationImageUrl: row.verification_image_url || null,
        verificationCreatedAt: row.verification_created_at ? new Date(row.verification_created_at).toISOString() : null,
        verificationReviewedAt: row.verification_reviewed_at ? new Date(row.verification_reviewed_at).toISOString() : null,
        flaggedReviewAt,
        successfulReviewAt,
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
    const persistedStatus = nextStatus === 'verified' ? 'accepted' : 'rejected';

    const verification = await hrmuVerificationRepository.getVerificationReviewRow(verificationId);
    if (!verification) {
        throw new AppError('Arrival verification not found.', 404);
    }

    const updated = await hrmuVerificationRepository.updateArrivalVerificationReview({
        verificationId,
        reviewerId,
        status: persistedStatus,
        remarks: payload.remarks
    });

    if (!updated) {
        throw new AppError('Arrival verification review could not be saved.', 409);
    }

    const manualReviewTimestamp = new Date();

    if (verification.trip_id && ['rejected', 'unverified'].includes(nextStatus)) {
        await tripIncidentService.flagTripAsUnverifiedLocation(verification.trip_id, {
            reviewSource: 'hrmu_manual_review',
            reviewedAt: updated.reviewed_at || manualReviewTimestamp,
            noProofSubmitted: false
        }).catch(() => null);
    }

    await hrmuDashboardRepository.createHrmuTripEventNotifications(null, {
        locatorSlipId: verification.locator_slip_id,
        type: nextStatus === 'verified' ? HRMU_REVIEW_SUCCESS_TYPE : HRMU_REVIEW_FLAGGED_TYPE,
        title: nextStatus === 'verified' ? 'Successful trip review' : 'Trip flagged as unverified location',
        message: nextStatus === 'verified'
            ? `${verification.faculty_name || 'The faculty user'} completed the trip successfully after HRMU proof review.`
            : `${verification.faculty_name || 'The faculty user'} was flagged by HRMU for unverified location review.`
    }).catch(() => []);

    const flaggedTrips = await tripIncidentRepository.getFlaggedTrips().catch(() => []);
    const flaggedTrip = flaggedTrips.find((item) => String(item.trip_id) === String(verification.trip_id));

    await socketBroadcasterService.broadcastHrmuDashboardUpdate().catch(() => null);

    const nextDisplayStatus = flaggedTrip?.incident_labels?.length
        ? 'FLAGGED'
        : updated.verification_status === 'accepted'
            ? 'COMPLETED'
            : 'PENDING';

    return {
        verificationId: updated.id,
        locatorSlipId: verification.locator_slip_id,
        tripId: verification.trip_id,
        status: nextStatus,
        remarks: payload.remarks || null,
        displayStatus: nextDisplayStatus,
        flaggedReasons: flaggedTrip?.incident_labels || [],
        reviewedAt: manualReviewTimestamp.toISOString()
    };
};

const flagTripWithoutProof = async (reviewerId, tripId, locatorSlipId = null) => {
    await assertHrmuUser(reviewerId);

    const normalizedTripId = ['null', 'undefined', 'lookup', ''].includes(String(tripId || '').toLowerCase())
        ? null
        : tripId;

    if (!normalizedTripId && !locatorSlipId) {
        throw new AppError('Trip review target is missing.', 422);
    }

    let targetTripId = normalizedTripId;
    const hasIncidentTable = await tripIncidentRepository.getIncidentTableExists().catch(() => false);
    let matchedTrip = null;

    if (!targetTripId && locatorSlipId) {
        matchedTrip = await hrmuVerificationRepository.getCompletedTripForLocatorSlip(locatorSlipId);
        targetTripId = matchedTrip?.trip_id || null;
    }

    const reviewTimestamp = new Date();

    let incident = await tripIncidentService.flagTripAsUnverifiedLocation(targetTripId, {
        reviewSource: 'hrmu_manual_review',
        noProofSubmitted: true,
        reviewedAt: reviewTimestamp
    });

    if (!incident && locatorSlipId) {
        matchedTrip = matchedTrip || await hrmuVerificationRepository.getCompletedTripForLocatorSlip(locatorSlipId);
        if (matchedTrip?.trip_id && String(matchedTrip.trip_id) !== String(targetTripId)) {
            targetTripId = matchedTrip.trip_id;
            incident = await tripIncidentService.flagTripAsUnverifiedLocation(targetTripId, {
                reviewSource: 'hrmu_manual_review',
                noProofSubmitted: true,
                reviewedAt: reviewTimestamp
            });
        }

        if (!incident && matchedTrip?.trip_id && hasIncidentTable) {
            targetTripId = matchedTrip.trip_id;
            incident = await tripIncidentRepository.upsertTripIncident({
                tripId: matchedTrip.trip_id,
                locatorSlipId: matchedTrip.locator_slip_id,
                facultyUserId: matchedTrip.faculty_user_id,
                incidentType: tripIncidentRepository.INCIDENT_TYPES.UNVERIFIED_LOCATION,
                incidentLabel: 'Unverified Location',
                severity: 'high',
                detectedAt: reviewTimestamp,
                metadata: {
                    verificationStatus: 'rejected',
                    reviewSource: 'hrmu_manual_review',
                    noProofSubmitted: true,
                    reviewedAt: reviewTimestamp.toISOString()
                }
            });
        }
    }

    if (!incident) {
        if (!hasIncidentTable && (targetTripId || locatorSlipId)) {
            await hrmuDashboardRepository.createHrmuTripEventNotifications(null, {
                locatorSlipId,
                type: HRMU_REVIEW_FLAGGED_TYPE,
                title: 'Trip flagged as unverified location',
                message: 'A completed trip without uploaded arrival proof was flagged by HRMU for unverified location review.'
            }).catch(() => []);
            return {
                tripId: targetTripId,
                status: 'unverified',
                displayStatus: 'FLAGGED',
                flaggedReasons: ['Unverified Location'],
                reviewedAt: reviewTimestamp.toISOString()
            };
        }

        throw new AppError('Trip could not be flagged as unverified location.', 409);
    }

    await hrmuDashboardRepository.createHrmuTripEventNotifications(null, {
        locatorSlipId,
        type: HRMU_REVIEW_FLAGGED_TYPE,
        title: 'Trip flagged as unverified location',
        message: 'A completed trip was flagged by HRMU for unverified location review.'
    }).catch(() => []);

    const flaggedTrips = await tripIncidentRepository.getFlaggedTrips().catch(() => []);
    const flaggedTrip = flaggedTrips.find((item) => String(item.trip_id) === String(targetTripId));

    await socketBroadcasterService.broadcastHrmuDashboardUpdate().catch(() => null);

    return {
        tripId: targetTripId,
        status: 'unverified',
        displayStatus: 'FLAGGED',
        flaggedReasons: flaggedTrip?.incident_labels || ['Unverified Location'],
        reviewedAt: incident.detected_at ? new Date(incident.detected_at).toISOString() : new Date().toISOString()
    };
};

module.exports = {
    getVerificationTrips,
    reviewArrivalVerification,
    flagTripWithoutProof
};
