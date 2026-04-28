const { successResponse } = require('../utils/apiResponse');
const tripTrackingService = require('../services/tripTracking.service');

const searchDestinations = async (req, res, next) => {
    try {
        const results = await tripTrackingService.searchDestinations(req.query.q || '');
        return res.json(successResponse('Destination suggestions fetched successfully.', results));
    } catch (error) {
        return next(error);
    }
};

const previewRoute = async (req, res, next) => {
    try {
        const result = await tripTrackingService.previewRoute(req.body);
        return res.json(successResponse('Route preview generated successfully.', result));
    } catch (error) {
        return next(error);
    }
};

const startTrip = async (req, res, next) => {
    try {
        const result = await tripTrackingService.startTrip(req.user.sub, req.body);
        return res.status(201).json(successResponse('Trip started successfully.', result));
    } catch (error) {
        return next(error);
    }
};

const getActiveTrip = async (req, res, next) => {
    try {
        const trip = await tripTrackingService.getActiveTrip(req.user.sub);
        return res.json(successResponse('Active trip fetched successfully.', trip));
    } catch (error) {
        return next(error);
    }
};

const endTrip = async (req, res, next) => {
    try {
        const trip = await tripTrackingService.endTrip(req.user.sub, req.params.id, req.body.status);
        return res.json(successResponse('Trip ended successfully.', trip));
    } catch (error) {
        return next(error);
    }
};

const recordLocation = async (req, res, next) => {
    try {
        const update = await tripTrackingService.recordLiveLocation(req.user.sub, {
            ...req.body,
            tripId: req.params.id,
            facultyUserId: req.body.facultyUserId || req.user.sub
        });
        return res.json(successResponse('Trip live location recorded successfully.', update));
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    searchDestinations,
    previewRoute,
    startTrip,
    getActiveTrip,
    endTrip,
    recordLocation
};
