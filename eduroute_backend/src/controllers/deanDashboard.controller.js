const { successResponse } = require('../utils/apiResponse');
const deanDashboardService = require('../services/deanDashboard.service');
const { encryptSensitiveResponseData } = require('../utils/sensitiveResponseEncryption');

const getSummary = async (req, res, next) => {
    try {
        const summary = await deanDashboardService.getDashboardSummary(req.user.sub);
        return res.json(successResponse('Dean dashboard summary fetched successfully.', summary));
    } catch (error) {
        return next(error);
    }
};

const getDeanSignatureSettings = async (req, res, next) => {
    try {
        const settings = await deanDashboardService.getDeanSignatureSettings(req.user.sub);
        return res.json(successResponse(
            'Dean digital signature settings fetched successfully.',
            encryptSensitiveResponseData(req, settings)
        ));
    } catch (error) {
        return next(error);
    }
};

const uploadDeanSignatureFile = async (req, res, next) => {
    try {
        const settings = await deanDashboardService.uploadDeanSignatureFile(req.user.sub, req.file, req.body || {});
        return res.json(successResponse(
            'Dean digital signature uploaded successfully.',
            encryptSensitiveResponseData(req, settings)
        ));
    } catch (error) {
        return next(error);
    }
};

const getNotifications = async (req, res, next) => {
    try {
        const notifications = await deanDashboardService.getDeanNotifications(req.user.sub, req.query);
        return res.json(successResponse(
            'Dean notifications fetched successfully.',
            encryptSensitiveResponseData(req, notifications)
        ));
    } catch (error) {
        return next(error);
    }
};

const markNotificationRead = async (req, res, next) => {
    try {
        const notification = await deanDashboardService.markNotificationRead(req.user.sub, req.params.id);
        return res.json(successResponse(
            'Notification marked as read.',
            encryptSensitiveResponseData(req, notification)
        ));
    } catch (error) {
        return next(error);
    }
};

const getProofComplianceList = async (req, res, next) => {
    try {
        const proofs = await deanDashboardService.getProofComplianceList(req.user.sub);
        return res.json(successResponse('Dean proof of compliance records fetched successfully.', proofs));
    } catch (error) {
        return next(error);
    }
};

const getProofComplianceDetails = async (req, res, next) => {
    try {
        const proof = await deanDashboardService.getProofComplianceDetails(req.user.sub, req.params.id);
        return res.json(successResponse('Dean proof of compliance details fetched successfully.', proof));
    } catch (error) {
        return next(error);
    }
};

const getProofComplianceDetailsByLocatorSlip = async (req, res, next) => {
    try {
        const proof = await deanDashboardService.getProofComplianceDetailsByLocatorSlip(req.user.sub, req.params.locatorSlipId);
        return res.json(successResponse('Dean proof of compliance details fetched successfully.', proof));
    } catch (error) {
        return next(error);
    }
};

const getLocatorSlips = async (req, res, next) => {
    try {
        const locatorSlips = await deanDashboardService.getDeanLocatorSlips(req.user.sub, req.query);
        return res.json(successResponse('Dean locator slips fetched successfully.', locatorSlips));
    } catch (error) {
        return next(error);
    }
};

const getPendingApprovals = async (req, res, next) => {
    try {
        const approvals = await deanDashboardService.getPendingApprovalsPreview(req.user.sub, req.query.limit);
        return res.json(successResponse(
            'Pending approvals fetched successfully.',
            encryptSensitiveResponseData(req, approvals)
        ));
    } catch (error) {
        return next(error);
    }
};

const getFacultyOverview = async (req, res, next) => {
    try {
        const faculty = await deanDashboardService.getFacultyOverview(req.user.sub, req.query);
        return res.json(successResponse(
            'Dean faculty overview fetched successfully.',
            encryptSensitiveResponseData(req, faculty)
        ));
    } catch (error) {
        return next(error);
    }
};

const getPendingRequestsPage = async (req, res, next) => {
    try {
        const requests = await deanDashboardService.getPendingRequestsPage(req.user.sub, req.query);
        return res.json(successResponse('Dean pending requests fetched successfully.', requests));
    } catch (error) {
        return next(error);
    }
};

const getRequestInsights = async (req, res, next) => {
    try {
        const insights = await deanDashboardService.getRequestInsights(req.user.sub, req.params.id);
        return res.json(successResponse('Dean request insights fetched successfully.', insights));
    } catch (error) {
        return next(error);
    }
};

const bulkApproveLocatorSlipRequests = async (req, res, next) => {
    try {
        const result = await deanDashboardService.bulkApproveLocatorSlipRequests(req.user.sub, req.body?.locatorSlipIds);
        return res.json(successResponse('Bulk approval completed.', result));
    } catch (error) {
        return next(error);
    }
};

const getRegistryPage = async (req, res, next) => {
    try {
        const registry = await deanDashboardService.getRegistryPage(req.user.sub);
        return res.json(successResponse(
            'Dean registry fetched successfully.',
            encryptSensitiveResponseData(req, registry)
        ));
    } catch (error) {
        return next(error);
    }
};

const approveLocatorSlipRequest = async (req, res, next) => {
    try {
        const approvedSlip = await deanDashboardService.approveLocatorSlipRequest(req.user.sub, req.params.id);
        return res.json(successResponse('Locator slip approved successfully.', approvedSlip));
    } catch (error) {
        return next(error);
    }
};

const rejectLocatorSlipRequest = async (req, res, next) => {
    try {
        const rejectedSlip = await deanDashboardService.rejectLocatorSlipRequest(req.user.sub, req.params.id, req.body?.remarks || '');
        return res.json(successResponse('Locator slip rejected successfully.', rejectedSlip));
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    getSummary,
    getDeanSignatureSettings,
    uploadDeanSignatureFile,
    getNotifications,
    markNotificationRead,
    getProofComplianceList,
    getProofComplianceDetails,
    getProofComplianceDetailsByLocatorSlip,
    getLocatorSlips,
    getPendingApprovals,
    getFacultyOverview,
    getPendingRequestsPage,
    getRequestInsights,
    bulkApproveLocatorSlipRequests,
    getRegistryPage,
    approveLocatorSlipRequest,
    rejectLocatorSlipRequest
};
