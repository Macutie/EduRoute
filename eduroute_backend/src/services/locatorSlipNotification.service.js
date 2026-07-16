const notificationService = require('./notification.service');
const userRepository = require('../repositories/user.repository');

const notifyDeansOfLocatorSlipSubmission = async ({ locatorSlip, facultyUserId, collegeId, facultyName, purpose }) => {
    const deans = await userRepository.getDeanUsersByCollegeId(collegeId);
    if (deans.length === 0) return [];

    return notificationService.notifyUsers(
        deans.map((dean) => dean.id),
        {
            senderUserId: facultyUserId,
            locatorSlipId: locatorSlip.id,
            type: notificationService.NOTIFICATION_TYPES.LOCATOR_SLIP_SUBMITTED,
            title: 'New Locator Slip Request',
            message: `${facultyName} submitted a locator slip for ${purpose}.`,
            data: {
                locatorSlipId: locatorSlip.id,
                url: `/dean/locator-slips/${locatorSlip.id}`
            }
        }
    );
};

const notifyFacultyOfLocatorSlipApproval = async ({ recipientUserId, senderUserId, locatorSlipId, destination }) => (
    notificationService.notifyUser({
        recipientUserId,
        senderUserId,
        locatorSlipId,
        type: notificationService.NOTIFICATION_TYPES.LOCATOR_SLIP_APPROVED,
        title: 'Locator Slip Approved',
        message: `Your locator slip to ${destination} has been approved.`,
        data: {
            locatorSlipId,
            url: '/#/status'
        }
    })
);

const notifyCssuOfLocatorSlipApproval = async ({ senderUserId, locatorSlipId, facultyName, destination, purpose }) => {
    const cssuUsers = await userRepository.getActiveUsersByRoles(['cssu']);
    if (cssuUsers.length === 0) return [];

    return notificationService.notifyUsers(
        cssuUsers.map((user) => user.id),
        {
            senderUserId,
            locatorSlipId,
            type: 'LOCATOR_SLIP_READY_FOR_EXIT',
            title: 'Locator Slip Ready for CSSU',
            message: `${facultyName || 'A faculty member'} has an approved locator slip${destination ? ` to ${destination}` : ''}${purpose ? ` for ${purpose}` : ''}.`,
            data: {
                locatorSlipId,
                url: '/#/cssu-dashboard'
            }
        }
    );
};

const notifyFacultyOfLocatorSlipRejection = async ({ recipientUserId, senderUserId, locatorSlipId, remarks }) => (
    notificationService.notifyUser({
        recipientUserId,
        senderUserId,
        locatorSlipId,
        type: notificationService.NOTIFICATION_TYPES.LOCATOR_SLIP_REJECTED,
        title: 'Locator Slip Rejected',
        message: remarks
            ? `Your locator slip was rejected. ${remarks}`
            : 'Your locator slip was rejected. Please check the remarks.',
        data: {
            locatorSlipId,
            url: '/#/status'
        }
    })
);

const notifyFacultyOfCssuExitValidation = async ({ recipientUserId, senderUserId, locatorSlipId, gateLabel, destination }) => (
    notificationService.notifyUser({
        recipientUserId,
        senderUserId,
        locatorSlipId,
        type: 'LOCATOR_SLIP_EXIT_ALLOWED',
        title: 'Exit Clearance Allowed',
        message: `CSSU allowed your exit through ${gateLabel}${destination ? ` for ${destination}` : ''}.`,
        data: {
            locatorSlipId,
            url: '/#/status'
        }
    })
);

const notifyFacultyOfCssuExitDenial = async ({ recipientUserId, senderUserId, locatorSlipId, gateLabel, remarks }) => (
    notificationService.notifyUser({
        recipientUserId,
        senderUserId,
        locatorSlipId,
        type: 'LOCATOR_SLIP_EXIT_DENIED',
        title: 'Exit Clearance Denied',
        message: remarks
            ? `CSSU denied your exit through ${gateLabel}. ${remarks}`
            : `CSSU denied your exit through ${gateLabel}. Your locator slip is now rejected.`,
        data: {
            locatorSlipId,
            url: '/#/status'
        }
    })
);

const notifyDeansOfLocatorSlipCancellation = async ({ locatorSlipId, facultyUserId, collegeId, facultyName, destination, cancellationReason, cancellationReasonLabel }) => {
    const deans = await userRepository.getDeanUsersByCollegeId(collegeId);
    if (deans.length === 0) return [];
    const displayReason = cancellationReasonLabel || cancellationReason || '';

    return notificationService.notifyUsers(
        deans.map((dean) => dean.id),
        {
            senderUserId: facultyUserId,
            locatorSlipId,
            type: notificationService.NOTIFICATION_TYPES.LOCATOR_SLIP_CANCELLED,
            title: 'Locator Slip Cancelled',
            message: displayReason
                ? `${facultyName} cancelled the locator slip to ${destination}. Reason: ${displayReason}.`
                : `${facultyName} cancelled the locator slip to ${destination}.`,
            data: {
                locatorSlipId,
                cancellationReason: displayReason,
                cancellationReasonKey: cancellationReason || '',
                url: '/#/dean-registry'
            }
        }
    );
};

const notifyDeansOfProofComplianceSubmission = async ({
    locatorSlipId,
    proofId,
    facultyUserId,
    collegeId,
    facultyName,
    destination,
    focalPersonName,
    focalPersonPosition
}) => {
    const deans = await userRepository.getDeanUsersByCollegeId(collegeId);
    if (deans.length === 0) return [];

    return notificationService.notifyUsers(
        deans.map((dean) => dean.id),
        {
            senderUserId: facultyUserId,
            locatorSlipId,
            type: notificationService.NOTIFICATION_TYPES.PROOF_OF_COMPLIANCE_SUBMITTED,
            title: 'Proof of compliance submitted',
            message: `${facultyName || 'A faculty member'} submitted proof of compliance${destination ? ` for ${destination}` : ''}, confirmed by ${focalPersonName || 'the focal person'}${focalPersonPosition ? ` (${focalPersonPosition})` : ''}.`,
            data: {
                locatorSlipId,
                proofId,
                url: '/#/dean-notifications'
            }
        }
    );
};

module.exports = {
    notifyDeansOfLocatorSlipSubmission,
    notifyDeansOfLocatorSlipCancellation,
    notifyDeansOfProofComplianceSubmission,
    notifyCssuOfLocatorSlipApproval,
    notifyFacultyOfCssuExitDenial,
    notifyFacultyOfCssuExitValidation,
    notifyFacultyOfLocatorSlipApproval,
    notifyFacultyOfLocatorSlipRejection
};
