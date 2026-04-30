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
    getLiveExitMonitoring,
    lookupExitCandidate,
    updateExitLogStatus,
};
