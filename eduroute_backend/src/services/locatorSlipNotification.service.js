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
            url: `/faculty/locator-slips/${locatorSlipId}`
        }
    })
);

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
            url: `/faculty/locator-slips/${locatorSlipId}`
        }
    })
);

const notifyDeansOfLocatorSlipCancellation = async ({ locatorSlipId, facultyUserId, collegeId, facultyName, destination, cancellationReason }) => {
    const deans = await userRepository.getDeanUsersByCollegeId(collegeId);
    if (deans.length === 0) return [];

    return notificationService.notifyUsers(
        deans.map((dean) => dean.id),
        {
            senderUserId: facultyUserId,
            locatorSlipId,
            type: 'LOCATOR_SLIP_CANCELLED',
            title: 'Locator Slip Cancelled',
            message: cancellationReason
                ? `${facultyName} cancelled the locator slip to ${destination}. Reason: ${cancellationReason}.`
                : `${facultyName} cancelled the locator slip to ${destination}.`,
            data: {
                locatorSlipId,
                url: `/dean/locator-slips/${locatorSlipId}`
            }
        }
    );
};

module.exports = {
    notifyDeansOfLocatorSlipSubmission,
    notifyDeansOfLocatorSlipCancellation,
    notifyFacultyOfLocatorSlipApproval,
    notifyFacultyOfLocatorSlipRejection
};
