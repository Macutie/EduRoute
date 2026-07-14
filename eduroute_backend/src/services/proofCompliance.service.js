const pool = require('../db/pool');
const sharp = require('sharp');
const AppError = require('../utils/appError');
const facultyTripRepository = require('../repositories/facultyTripFlow.repository');
const proofComplianceRepository = require('../repositories/proofCompliance.repository');
const hrmuDashboardRepository = require('../repositories/hrmuDashboard.repository');
const socketBroadcasterService = require('./socketBroadcaster.service');
const tripIncidentService = require('./tripIncident.service');
const locatorSlipNotificationService = require('./locatorSlipNotification.service');
const tripRepository = require('../repositories/tripTracking.repository');
const { optimizeImage, ALLOWED_IMAGE_MIME_TYPES } = require('./imageOptimization.service');
const { uploadImageBuffer } = require('./upload.service');
const { generateProofComplianceImage } = require('./proofComplianceImage.service');
const { isLateReturn: detectLateReturnStatus } = require('./status.service');

const PROOF_NOTIFICATION_TYPE = hrmuDashboardRepository.HRMU_NOTIFICATION_TYPE_LOCATION_VERIFIED;
const HRMU_REVIEW_FLAGGED_TYPE = 'hrmu_verification_review_flagged';
const HRMU_REVIEW_SUCCESS_TYPE = 'hrmu_verification_review_successful';

const assertHrmuUser = async (userId) => {
    const user = await hrmuDashboardRepository.getHrmuUserContext(userId);
    if (!user) {
        throw new AppError('Only HRMU and admin users can access proof of compliance review.', 403);
    }

    return user;
};

const normalizeTripStatus = (trip) => {
    if (!trip) return 'not_started';
    if (trip.returned_at || trip.ended_at || trip.status === 'completed') return 'completed';
    if (trip.status === 'returning') return 'returning';
    if (trip.arrived_at) return 'arrived';
    return trip.status || 'not_started';
};

const escapeDisplayValue = (value, fallback = 'Not provided') => {
    const normalized = String(value || '').trim();
    return normalized || fallback;
};

const parseSignatureDataUrl = (signatureDataUrl) => {
    const raw = String(signatureDataUrl || '').trim();
    if (!raw) {
        throw new AppError('Focal person signature is required.', 422);
    }

    const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
        throw new AppError('Signature format is invalid.', 422);
    }

    const mimetype = match[1].toLowerCase();
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mimetype)) {
        throw new AppError('Signature image type is invalid.', 422);
    }

    return {
        buffer: Buffer.from(match[2], 'base64'),
        mimetype
    };
};

const normalizeProofResponse = (proof, context = {}) => {
    const baseFlaggedReasons = Array.isArray(context.flaggedReasons) ? context.flaggedReasons : [];
    const baseFlaggedIncidentTypes = Array.isArray(context.flaggedIncidentTypes) ? context.flaggedIncidentTypes : [];
    const expectedReturnTime = context.expectedReturnTime || null;
    const actualReturnTime = context.actualReturnTime || null;
    const departureTime = context.departureTime || null;
    const autoLateReturn = detectLateReturnStatus(expectedReturnTime, actualReturnTime);
    const flaggedReasons = autoLateReturn && !baseFlaggedReasons.includes(tripIncidentService.INCIDENT_LABELS.LATE_RETURN)
        ? [...baseFlaggedReasons, tripIncidentService.INCIDENT_LABELS.LATE_RETURN]
        : baseFlaggedReasons;
    const flaggedIncidentTypes = autoLateReturn && !baseFlaggedIncidentTypes.includes('LATE_RETURN')
        ? [...baseFlaggedIncidentTypes, 'LATE_RETURN']
        : baseFlaggedIncidentTypes;

    return {
        id: proof.id,
        tripId: proof.tripId,
        locatorSlipId: proof.locatorSlipId,
        facultyUserId: proof.facultyUserId,
        facultyId: context.facultyId || null,
        focalPersonName: proof.focalPersonName,
        focalPersonPosition: proof.focalPersonPosition,
        focalPersonSignatureUrl: proof.focalPersonSignatureUrl,
        arrivalPhotoUrl: proof.arrivalPhotoUrl,
        proofComplianceImageUrl: proof.proofComplianceImageUrl || proof.imageUrl,
        verificationStatus: String(proof.verificationStatus || 'submitted').toLowerCase(),
        submittedAt: proof.submittedAt,
        reviewedAt: proof.reviewedAt,
        reviewedBy: proof.reviewedBy,
        reviewRemarks: proof.reviewRemarks,
        facultyName: context.facultyName || null,
        profileImageUrl: context.profileImageUrl || null,
        collegeName: context.collegeName || null,
        destination: context.destination || null,
        purpose: context.purpose || null,
        locatorSlipCode: context.locatorSlipCode || null,
        reviewedByName: context.reviewedByName || null,
        departureTime,
        actualReturnTime,
        expectedReturnTime,
        tripStartedAt: context.tripStartedAt || null,
        digitalSignature: context.digitalSignature || null,
        flaggedReasons,
        flaggedIncidentTypes,
        isLateReturn: flaggedReasons.includes(tripIncidentService.INCIDENT_LABELS.LATE_RETURN)
    };
};

const buildLocatorSlipCode = (locatorSlipId) => {
    const normalized = String(locatorSlipId || '').replace(/-/g, '').slice(0, 8).toUpperCase();
    return normalized ? `LS-${normalized}` : 'Locator Slip';
};

const getFacultyProof = async (facultyUserId, tripId) => {
    const trip = await facultyTripRepository.getTripSummaryRow(tripId, facultyUserId);
    if (!trip) {
        throw new AppError('Trip not found.', 404);
    }

    const proof = await proofComplianceRepository.getProofByTripForFaculty(tripId, facultyUserId);
    if (!proof) {
        return null;
    }

    return normalizeProofResponse(proof, {
        facultyName: trip.faculty_name || null,
        destination: trip.destination || trip.destination_name || null,
        purpose: trip.custom_purpose || trip.purpose_of_travel || null,
        locatorSlipCode: buildLocatorSlipCode(trip.locator_slip_id)
    });
};

const submitFacultyProof = async (facultyUserId, tripId, files = {}, payload = {}) => {
    const focalPersonName = String(payload.focalPersonName || '').trim();
    const focalPersonPosition = String(payload.focalPersonPosition || '').trim();

    if (!focalPersonName) {
        throw new AppError('Focal person name is required.', 422);
    }

    if (!focalPersonPosition) {
        throw new AppError('Focal person position is required.', 422);
    }

    const trip = await facultyTripRepository.getTripSummaryRow(tripId, facultyUserId);
    if (!trip) {
        throw new AppError('Trip not found.', 404);
    }

    const logicalStatus = normalizeTripStatus(trip);
    if (!['active', 'arrived'].includes(logicalStatus)) {
        throw new AppError('Proof of compliance can only be submitted after arrival and before return.', 409);
    }

    const existingProof = await proofComplianceRepository.getProofByTripForFaculty(tripId, facultyUserId);
    if (existingProof) {
        return {
            trip: {
                id: trip.id,
                status: logicalStatus === 'active' ? 'arrived' : trip.status,
                arrived_at: trip.arrived_at || existingProof.submittedAt || new Date(),
                arrival_verified_at: trip.arrival_verified_at || existingProof.submittedAt || new Date()
            },
            proof: normalizeProofResponse(existingProof, {
                facultyName: payload.facultyName || trip.faculty_name || 'Faculty member',
                destination: trip.destination || trip.destination_name || 'Destination',
                purpose: trip.custom_purpose || trip.purpose_of_travel || 'Official travel',
                locatorSlipCode: buildLocatorSlipCode(trip.locator_slip_id)
            })
        };
    }

    const linkedLocatorSlip = await facultyTripRepository.getLocatorSlipForTripAccess(facultyUserId, trip.locator_slip_id);
    if (!linkedLocatorSlip) {
        throw new AppError('Linked locator slip not found.', 404);
    }

    const uploadedSignatureFile = Array.isArray(files.signature_image) ? files.signature_image[0] : null;
    const uploadedArrivalPhoto = Array.isArray(files.arrival_photo) ? files.arrival_photo[0] : null;
    const signatureSource = uploadedSignatureFile
        ? {
            buffer: uploadedSignatureFile.buffer,
            mimetype: uploadedSignatureFile.mimetype
        }
        : parseSignatureDataUrl(payload.signatureDataUrl);

    const optimizedSignature = await sharp(signatureSource.buffer, { failOn: 'none' })
        .rotate()
        .resize({
            width: 900,
            height: 260,
            fit: 'contain',
            background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toBuffer();

    const optimizedArrivalPhoto = uploadedArrivalPhoto
        ? await optimizeImage(uploadedArrivalPhoto, 'locationVerification')
        : null;
    const submittedAt = new Date();
    const locatorSlipCode = buildLocatorSlipCode(trip.locator_slip_id);
    const facultyName = payload.facultyName || trip.faculty_name || 'Faculty member';
    const destination = trip.destination || trip.destination_name || linkedLocatorSlip.destination || 'Destination';
    const purpose = trip.custom_purpose || trip.purpose_of_travel || linkedLocatorSlip.purpose || 'Official travel';

    const signatureUpload = await uploadImageBuffer(optimizedSignature, {
        folder: 'proof-compliance/signatures',
        publicId: `signature-${trip.locator_slip_id}-${Date.now()}`,
        format: 'png',
        extension: 'png'
    });

    const arrivalPhotoUpload = optimizedArrivalPhoto
        ? await uploadImageBuffer(optimizedArrivalPhoto.buffer, {
            folder: 'proof-compliance/arrival-photos',
            publicId: `arrival-photo-${trip.locator_slip_id}-${Date.now()}`,
            format: optimizedArrivalPhoto.extension,
            extension: optimizedArrivalPhoto.extension
        })
        : null;

    const proofImageBuffer = await generateProofComplianceImage({
        facultyName: escapeDisplayValue(facultyName),
        locatorSlipCode,
        destination: escapeDisplayValue(destination),
        purpose: escapeDisplayValue(purpose),
        focalPersonName: focalPersonName,
        focalPersonPosition: focalPersonPosition,
        submittedAt,
        signatureBuffer: optimizedSignature,
        arrivalPhotoBuffer: optimizedArrivalPhoto?.buffer || null
    });

    const proofImageUpload = await uploadImageBuffer(proofImageBuffer, {
        folder: 'proof-compliance/cards',
        publicId: `proof-card-${trip.locator_slip_id}-${Date.now()}`,
        format: 'png',
        extension: 'png'
    });

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        let updatedTrip = trip;
        if (logicalStatus === 'active') {
            const supportsArrivedStatus = await facultyTripRepository.getTripsSupportsStatusValue('arrived', client);
            updatedTrip = await facultyTripRepository.updateTripLifecycle(tripId, facultyUserId, {
                status: supportsArrivedStatus ? 'arrived' : 'active',
                arrived_at: trip.arrived_at || submittedAt
            }, client);
            await facultyTripRepository.updateLocatorSlipTripStatus(trip.locator_slip_id, 'arrived', client);
        }

        const savedProof = await proofComplianceRepository.insertProof({
            tripId,
            locatorSlipId: trip.locator_slip_id,
            facultyUserId,
            imageUrl: proofImageUpload.url,
            imagePublicId: proofImageUpload.publicId,
            focalPersonName,
            focalPersonPosition,
            focalPersonSignatureUrl: signatureUpload.url,
            focalPersonSignaturePublicId: signatureUpload.publicId,
            arrivalPhotoUrl: arrivalPhotoUpload?.url || null,
            arrivalPhotoPublicId: arrivalPhotoUpload?.publicId || null,
            proofComplianceImageUrl: proofImageUpload.url,
            proofComplianceImagePublicId: proofImageUpload.publicId,
            verificationStatus: 'submitted',
            submittedAt,
            legacyStatus: 'submitted'
        }, client);

        await facultyTripRepository.updateTripLifecycle(tripId, facultyUserId, {
            arrival_verified_at: submittedAt,
            arrived_at: updatedTrip.arrived_at || trip.arrived_at || submittedAt
        }, client);

        await tripRepository.insertTripEvent(client, {
            tripId,
            userId: facultyUserId,
            eventType: 'proof_of_compliance_submitted',
            title: 'Arrived at destination',
            subtitle: `Proof of compliance confirmed by ${focalPersonName} (${focalPersonPosition})`,
            metadata: {
                locatorSlipId: trip.locator_slip_id,
                focalPersonName,
                focalPersonPosition
            },
            occurredAt: submittedAt
        }).catch(() => null);

        const hrmuProofContext = await hrmuDashboardRepository.getApprovedLocatorSlipNotificationPayload(trip.locator_slip_id, client).catch(() => null);
        if (hrmuProofContext) {
            await hrmuDashboardRepository.createHrmuTripEventNotifications(client, {
                locatorSlipId: trip.locator_slip_id,
                type: PROOF_NOTIFICATION_TYPE,
                title: 'Proof of compliance submitted',
                message: `${hrmuProofContext.faculty_name || 'A faculty member'} submitted a proof of compliance for ${hrmuProofContext.destination || 'the trip destination'}, confirmed by ${focalPersonName} (${focalPersonPosition}).`
            }).catch(() => null);
        }

        const deanProofScopeResult = await client.query(
            `SELECT COALESCE(ls.college_id, fu.department_id) AS college_id
             FROM locator_slips ls
             JOIN faculty_users fu ON fu.id = ls.faculty_user_id
             WHERE ls.id = $1
             LIMIT 1`,
            [trip.locator_slip_id]
        );
        const deanCollegeId = deanProofScopeResult.rows[0]?.college_id || null;

        if (deanCollegeId) {
            await locatorSlipNotificationService.notifyDeansOfProofComplianceSubmission({
                locatorSlipId: trip.locator_slip_id,
                proofId: savedProof.id,
                facultyUserId,
                collegeId: deanCollegeId,
                facultyName,
                destination,
                focalPersonName,
                focalPersonPosition
            }).catch((notificationError) => {
                console.error('Failed to notify deans about proof of compliance submission:', notificationError);
            });
        }

        await client.query('COMMIT');
        await socketBroadcasterService.broadcastHrmuDashboardUpdate().catch(() => null);
        await socketBroadcasterService.broadcastHrmuLiveLocationUpdate({
            tripId
        }).catch(() => null);
        await socketBroadcasterService.broadcastHrmuLiveActivityUpdate({
            facultyUserId,
            tripId
        }).catch(() => null);

        return {
            trip: {
                id: updatedTrip.id || trip.id,
                status: updatedTrip.status || 'arrived',
                arrived_at: updatedTrip.arrived_at || trip.arrived_at || submittedAt,
                arrival_verified_at: submittedAt
            },
            proof: normalizeProofResponse(savedProof, {
                facultyName,
                destination,
                purpose,
                locatorSlipCode
            })
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

const listHrmuProofs = async (userId) => {
    await assertHrmuUser(userId);
    await tripIncidentService.detectEndedTripsForIncidentScan().catch(() => []);
    const proofs = await proofComplianceRepository.getHrmuProofList();
    return {
        proofs: proofs.map((proof) => normalizeProofResponse(proof, {
            facultyId: proof.facultyId,
            facultyName: proof.facultyName,
            profileImageUrl: proof.profileImageUrl,
            collegeName: proof.collegeName,
            destination: proof.destination,
            purpose: proof.purpose,
            locatorSlipCode: buildLocatorSlipCode(proof.locatorSlipId),
            reviewedByName: proof.reviewedByName,
            departureTime: proof.departureTime,
            actualReturnTime: proof.actualReturnTime,
            expectedReturnTime: proof.expectedReturnTime,
            tripStartedAt: proof.tripStartedAt,
            flaggedReasons: proof.flaggedReasons,
            flaggedIncidentTypes: proof.flaggedIncidentTypes,
            digitalSignature: proof.deanSignatureUrl ? {
                name: proof.deanName || 'Assigned Dean',
                role: proof.deanRole || 'Dean',
                signedAt: proof.deanApprovedAt || proof.deanSignatureAttachedAt || null,
                asset: {
                    url: proof.deanSignatureUrl,
                    mimeType: proof.deanSignatureMimeType || 'image/png',
                    originalFilename: proof.deanSignatureOriginalFilename || null,
                    attachedAt: proof.deanSignatureAttachedAt || null
                }
            } : null
        }))
    };
};

const getHrmuProofDetails = async (proofId, userId) => {
    await assertHrmuUser(userId);
    await tripIncidentService.detectEndedTripsForIncidentScan().catch(() => []);
    const proof = await proofComplianceRepository.getHrmuProofById(proofId);
    if (!proof) {
        throw new AppError('Proof of compliance not found.', 404);
    }

    return normalizeProofResponse(proof, {
        facultyId: proof.facultyId,
        facultyName: proof.facultyName,
        profileImageUrl: proof.profileImageUrl,
        collegeName: proof.collegeName,
        destination: proof.destination,
        purpose: proof.purpose,
        locatorSlipCode: buildLocatorSlipCode(proof.locatorSlipId),
        reviewedByName: proof.reviewedByName,
        departureTime: proof.departureTime,
        actualReturnTime: proof.actualReturnTime,
        expectedReturnTime: proof.expectedReturnTime,
        tripStartedAt: proof.tripStartedAt,
        flaggedReasons: proof.flaggedReasons,
        flaggedIncidentTypes: proof.flaggedIncidentTypes,
        digitalSignature: proof.deanSignatureUrl ? {
            name: proof.deanName || 'Assigned Dean',
            role: proof.deanRole || 'Dean',
            signedAt: proof.deanApprovedAt || proof.deanSignatureAttachedAt || null,
            asset: {
                url: proof.deanSignatureUrl,
                mimeType: proof.deanSignatureMimeType || 'image/png',
                originalFilename: proof.deanSignatureOriginalFilename || null,
                attachedAt: proof.deanSignatureAttachedAt || null
            }
        } : null
    });
};

const reviewHrmuProof = async (reviewerId, proofId, payload = {}) => {
    await assertHrmuUser(reviewerId);
    const normalizedStatus = String(payload.verificationStatus || '').trim().toLowerCase();
    if (!['verified', 'rejected'].includes(normalizedStatus)) {
        throw new AppError('Verification status is invalid.', 422);
    }

    const existingProof = await proofComplianceRepository.getHrmuProofById(proofId);
    if (!existingProof) {
        throw new AppError('Proof of compliance not found.', 404);
    }
    const existingStatus = String(existingProof.verificationStatus || 'submitted').trim().toLowerCase();
    if (existingStatus !== 'submitted') {
        throw new AppError('This proof review has already been finalized.', 409);
    }
    const reviewRemarks = String(payload.reviewRemarks || '').trim();

    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const updated = await proofComplianceRepository.updateProofReview({
            proofId,
            reviewerId,
            verificationStatus: normalizedStatus,
            reviewRemarks
        }, client);

        if (!updated) {
            throw new AppError('Proof review could not be saved.', 409);
        }

        if (normalizedStatus === 'rejected' && existingProof.tripId) {
            await tripIncidentService.flagTripAsUnverifiedLocation(existingProof.tripId, {
                reviewSource: 'hrmu_proof_compliance_review',
                reviewedAt: updated.reviewedAt || new Date(),
                noProofSubmitted: false
            }).catch(() => null);
        }

        await hrmuDashboardRepository.createHrmuTripEventNotifications(client, {
            locatorSlipId: existingProof.locatorSlipId,
            type: normalizedStatus === 'verified'
                ? HRMU_REVIEW_SUCCESS_TYPE
                : HRMU_REVIEW_FLAGGED_TYPE,
            title: normalizedStatus === 'verified' ? 'Proof verified by HRMU' : 'Proof rejected by HRMU',
            message: normalizedStatus === 'verified'
                ? `${existingProof.facultyName || 'The faculty user'} submitted a valid proof of compliance for this trip.`
                : `${existingProof.facultyName || 'The faculty user'} submitted a proof of compliance that HRMU rejected.`
        }).catch(() => null);

        await client.query('COMMIT');
        await socketBroadcasterService.broadcastHrmuDashboardUpdate().catch(() => null);

        return normalizeProofResponse(updated, {
            facultyId: existingProof.facultyId,
            facultyName: existingProof.facultyName,
            profileImageUrl: existingProof.profileImageUrl,
            collegeName: existingProof.collegeName,
            destination: existingProof.destination,
            purpose: existingProof.purpose,
            locatorSlipCode: buildLocatorSlipCode(existingProof.locatorSlipId),
            reviewedByName: existingProof.reviewedByName,
            actualReturnTime: existingProof.actualReturnTime,
            expectedReturnTime: existingProof.expectedReturnTime,
            tripStartedAt: existingProof.tripStartedAt,
            digitalSignature: existingProof.deanSignatureUrl ? {
                name: existingProof.deanName || 'Assigned Dean',
                role: existingProof.deanRole || 'Dean',
                signedAt: existingProof.deanApprovedAt || existingProof.deanSignatureAttachedAt || null,
                asset: {
                    url: existingProof.deanSignatureUrl,
                    mimeType: existingProof.deanSignatureMimeType || 'image/png',
                    originalFilename: existingProof.deanSignatureOriginalFilename || null,
                    attachedAt: existingProof.deanSignatureAttachedAt || null
                }
            } : null
        });
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

module.exports = {
    getFacultyProof,
    submitFacultyProof,
    listHrmuProofs,
    getHrmuProofDetails,
    reviewHrmuProof
};
