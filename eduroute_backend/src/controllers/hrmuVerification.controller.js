const { successResponse } = require('../utils/apiResponse');
const hrmuReportsService = require('../services/hrmuReports.service');

const getFlaggedTrips = async (req, res, next) => {
    try {
        const payload = await hrmuReportsService.getVerificationFlaggedTrips(req.user.sub);
        return res.json(successResponse('HRMU flagged trips fetched successfully.', payload));
    } catch (error) {
        return next(error);
    }
};

const getVerificationSummary = async (req, res, next) => {
    try {
        const payload = await hrmuReportsService.getVerificationIncidentSummary(req.user.sub);
        return res.json(successResponse('HRMU verification incident summary fetched successfully.', payload));
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    getFlaggedTrips,
    getVerificationSummary
};
