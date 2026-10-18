const { successResponse } = require('../utils/apiResponse');
const hrmuDashboardService = require('../services/hrmuDashboard.service');
const lateComplianceService = require('../services/lateCompliance.service');
const { encryptSensitiveResponseData } = require('../utils/sensitiveResponseEncryption');

const getSummary = async (req, res, next) => {
    try {
        const summary = await hrmuDashboardService.getDashboardSummary(req.user.sub);
        return res.json(successResponse(
            'HRMU dashboard summary fetched successfully.',
            encryptSensitiveResponseData(req, summary)
        ));
    } catch (error) {
        return next(error);
    }
};

const getEmployeeLateCompliance = async (req, res, next) => {
    try {
        const summary = await lateComplianceService.getLateComplianceSummary(req.params.facultyUserId);
        return res.json(successResponse('Employee late compliance summary fetched successfully.', summary));
    } catch (error) {
        return next(error);
    }
};

const grantEmployeeLocatorSlipAccess = async (req, res, next) => {
    try {
        const grant = await lateComplianceService.grantLocatorSlipAccess(
            req.params.facultyUserId,
            req.user.sub,
            req.body?.reason || null
        );
        return res.status(201).json(successResponse('Locator slip access granted for one filing.', grant));
    } catch (error) {
        return next(error);
    }
};

const getLiveFaculty = async (req, res, next) => {
    try {
        const faculty = await hrmuDashboardService.getLiveFaculty(req.user.sub);
        return res.json(successResponse(
            'HRMU live faculty route data fetched successfully.',
            encryptSensitiveResponseData(req, faculty)
        ));
    } catch (error) {
        return next(error);
    }
};

const getNotifications = async (req, res, next) => {
    try {
        const notifications = await hrmuDashboardService.getNotifications(req.user.sub, req.query);
        return res.json(successResponse(
            'HRMU notifications fetched successfully.',
            encryptSensitiveResponseData(req, notifications)
        ));
    } catch (error) {
        return next(error);
    }
};

const getRecentActivity = async (req, res, next) => {
    try {
        const activity = await hrmuDashboardService.getRecentActivity(req.user.sub, req.query);
        return res.json(successResponse(
            'HRMU recent activity fetched successfully.',
            encryptSensitiveResponseData(req, activity)
        ));
    } catch (error) {
        return next(error);
    }
};

const getLiveTracking = async (req, res, next) => {
    try {
        const tracking = await hrmuDashboardService.getLiveTracking(req.user.sub);
        return res.json(successResponse(
            'HRMU live tracking data fetched successfully.',
            encryptSensitiveResponseData(req, tracking)
        ));
    } catch (error) {
        return next(error);
    }
};

const getReportInbox = async (req, res, next) => {
    try {
        const inbox = await hrmuDashboardService.getReportInbox(req.user.sub, req.query);
        return res.json(successResponse(
            'HRMU report inbox fetched successfully.',
            encryptSensitiveResponseData(req, inbox)
        ));
    } catch (error) {
        return next(error);
    }
};

const downloadReportInboxAttachment = async (req, res, next) => {
    try {
        const payload = await hrmuDashboardService.downloadReportInboxAttachment(req.user.sub, req.params.id);
        res.setHeader('Content-Type', payload.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${payload.filename}"`);
        return res.send(payload.buffer);
    } catch (error) {
        return next(error);
    }
};

const exportRecentActivityCsv = async (req, res, next) => {
    try {
        const placeholder = await hrmuDashboardService.getExportCsvPlaceholder(req.user.sub);
        return res.json(successResponse('HRMU export placeholder returned successfully.', placeholder));
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    getSummary,
    getEmployeeLateCompliance,
    grantEmployeeLocatorSlipAccess,
    getLiveFaculty,
    getNotifications,
    getRecentActivity,
    getLiveTracking,
    getReportInbox,
    downloadReportInboxAttachment,
    exportRecentActivityCsv
};
