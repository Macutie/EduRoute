const { successResponse } = require('../utils/apiResponse');
const cssuDashboardService = require('../services/cssuDashboard.service');

const getSummary = async (req, res, next) => {
    try {
        const summary = await cssuDashboardService.getDashboardSummary();
        return res.json(successResponse('CSSU dashboard summary fetched successfully.', summary));
    } catch (error) {
        return next(error);
    }
};

const getLiveExitMonitoring = async (req, res, next) => {
    try {
        const monitoring = await cssuDashboardService.getLiveExitMonitoring(req.query);
        return res.json(successResponse('CSSU live exit monitoring fetched successfully.', monitoring));
    } catch (error) {
        return next(error);
    }
};

const getIncidentOverview = async (req, res, next) => {
    try {
        const incidents = await cssuDashboardService.getIncidentOverview();
        return res.json(successResponse('CSSU incidents overview fetched successfully.', incidents));
    } catch (error) {
        return next(error);
    }
};

const getNotificationsOverview = async (req, res, next) => {
    try {
        const notifications = await cssuDashboardService.getNotificationsOverview(req.query);
        return res.json(successResponse('CSSU notifications fetched successfully.', notifications));
    } catch (error) {
        return next(error);
    }
};

const getReportsOverview = async (req, res, next) => {
    try {
        const reports = await cssuDashboardService.getReportsOverview(req.query);
        return res.json(successResponse('CSSU reports overview fetched successfully.', reports));
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
    getNotificationsOverview,
    getReportsOverview,
    downloadReportsPdf,
    lookupExitCandidate,
    updateExitLogStatus,
};
