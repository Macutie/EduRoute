const { successResponse } = require('../utils/apiResponse');
const cssuDashboardService = require('../services/cssuDashboard.service');
const { encryptSensitiveResponseData } = require('../utils/sensitiveResponseEncryption');

const getSummary = async (req, res, next) => {
    try {
        const summary = await cssuDashboardService.getDashboardSummary();
        return res.json(successResponse(
            'CSSU dashboard summary fetched successfully.',
            encryptSensitiveResponseData(req, summary)
        ));
    } catch (error) {
        return next(error);
    }
};

const getLiveExitMonitoring = async (req, res, next) => {
    try {
        const monitoring = await cssuDashboardService.getLiveExitMonitoring(req.query);
        return res.json(successResponse(
            'CSSU live exit monitoring fetched successfully.',
            encryptSensitiveResponseData(req, monitoring)
        ));
    } catch (error) {
        return next(error);
    }
};

const getDashboardActivityTimeline = async (req, res, next) => {
    try {
        const timeline = await cssuDashboardService.getDashboardActivityTimeline(req.query);
        return res.json(successResponse(
            'CSSU dashboard activity timeline fetched successfully.',
            encryptSensitiveResponseData(req, timeline)
        ));
    } catch (error) {
        return next(error);
    }
};

const getFacultyExitHistory = async (req, res, next) => {
    try {
        const history = await cssuDashboardService.getFacultyExitHistory(req.params.facultyUserId, req.query);
        return res.json(successResponse('CSSU faculty exit history fetched successfully.', history));
    } catch (error) {
        return next(error);
    }
};

const getIncidentOverview = async (req, res, next) => {
    try {
        const incidents = await cssuDashboardService.getIncidentOverview();
        return res.json(successResponse(
            'CSSU incidents overview fetched successfully.',
            encryptSensitiveResponseData(req, incidents)
        ));
    } catch (error) {
        return next(error);
    }
};

const getNotificationsOverview = async (req, res, next) => {
    try {
        const notifications = await cssuDashboardService.getNotificationsOverview(req.query);
        return res.json(successResponse(
            'CSSU notifications fetched successfully.',
            encryptSensitiveResponseData(req, notifications)
        ));
    } catch (error) {
        return next(error);
    }
};

const getReportsOverview = async (req, res, next) => {
    try {
        const reports = await cssuDashboardService.getReportsOverview(req.query);
        return res.json(successResponse(
            'CSSU reports overview fetched successfully.',
            encryptSensitiveResponseData(req, reports)
        ));
    } catch (error) {
        return next(error);
    }
};

const downloadReportsPdf = async (req, res, next) => {
    try {
        const payload = await cssuDashboardService.getReportsDownload(req.user.sub, req.query);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${payload.filename}"`);
        return res.send(payload.buffer);
    } catch (error) {
        return next(error);
    }
};

const sendReportToHrmu = async (req, res, next) => {
    try {
        const result = await cssuDashboardService.sendReportToHrmu(req.user.sub, req.body || {});
        return res.json(successResponse('CSSU report sent to HRMU successfully.', result));
    } catch (error) {
        return next(error);
    }
};

const lookupExitCandidate = async (req, res, next) => {
    try {
        const result = await cssuDashboardService.lookupExitCandidate(req.query);
        return res.json(successResponse('CSSU exit candidate fetched successfully.', result));
    } catch (error) {
        return next(error);
    }
};

const updateExitLogStatus = async (req, res, next) => {
    try {
        const result = await cssuDashboardService.updateExitLogStatus(req.user.sub, req.params.locatorSlipId, req.body);
        return res.json(successResponse('CSSU exit monitoring status updated successfully.', result));
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    getSummary,
    getIncidentOverview,
    getLiveExitMonitoring,
    getDashboardActivityTimeline,
    getFacultyExitHistory,
    getNotificationsOverview,
    getReportsOverview,
    downloadReportsPdf,
    sendReportToHrmu,
    lookupExitCandidate,
    updateExitLogStatus,
};
