const { successResponse } = require('../utils/apiResponse');
const mapboxService = require('../services/mapbox.service');
const tripService = require('../services/trip.service');

const getDirections = async (req, res, next) => {
    try {
        const route = await mapboxService.getDirections(req.body);
        return res.json(successResponse('Route generated successfully.', route));
    } catch (error) {
        return next(error);
    }
};

const getActiveTrip = async (req, res, next) => {
    try {
        const trip = await tripService.getActiveTrip(req.user.sub);
        return res.json(successResponse('Active trip fetched successfully.', trip));
    } catch (error) {
        return next(error);
    }
};

const startTrip = async (req, res, next) => {
    try {
        const trip = await tripService.startTrip(req.user.sub, req.body);
        return res.status(201).json(successResponse('Trip started successfully.', trip));
    } catch (error) {
        return next(error);
    }
};

const endTrip = async (req, res, next) => {
    try {
        const trip = await tripService.endTrip(req.user.sub, req.params.id, req.body.status || 'completed');
        return res.json(successResponse('Trip ended successfully.', trip));
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    getDirections,
    getActiveTrip,
    startTrip,
    endTrip
};
