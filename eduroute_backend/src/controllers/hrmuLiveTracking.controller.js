const { successResponse } = require('../utils/apiResponse');
const hrmuLiveTrackingService = require('../services/hrmuLiveTracking.service');

const getActiveFaculty = async (req, res, next) => {
    try {
        const payload = await hrmuLiveTrackingService.getActiveFaculty(req.user.sub);
        return res.json(successResponse('HRMU active faculty live tracking fetched successfully.', payload));
    } catch (error) {
        return next(error);
    }
};

const getFacultyDetails = async (req, res, next) => {
    try {
        const payload = await hrmuLiveTrackingService.getFacultyDetails(req.user.sub, req.params.facultyUserId);
        return res.json(successResponse('HRMU faculty live detail fetched successfully.', payload));
    } catch (error) {
        return next(error);
    }
};

const getFacultyActivity = async (req, res, next) => {
    try {
        const payload = await hrmuLiveTrackingService.getFacultyActivity(req.user.sub, req.params.facultyUserId, req.query);
        return res.json(successResponse('HRMU faculty live activity fetched successfully.', payload));
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    getActiveFaculty,
    getFacultyDetails,
    getFacultyActivity
};
