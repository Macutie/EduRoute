const { successResponse } = require('../utils/apiResponse');
const facultyTripFlowService = require('../services/facultyTripFlow.service');

const getApprovedLocatorSlips = async (req, res, next) => {
    try {
        const payload = await facultyTripFlowService.getApprovedLocatorSlips(req.user.sub);
        return res.json(successResponse('Approved locator slips fetched successfully.', payload));
    } catch (error) {
        return next(error);
    }
};

const getLocatorSlipDetails = async (req, res, next) => {
    try {
        const payload = await facultyTripFlowService.getLocatorSlipDetails(req.user.sub, req.params.id);
        return res.json(successResponse('Locator slip details fetched successfully.', payload));
    } catch (error) {
        return next(error);
    }
};

const resolveDestination = async (req, res, next) => {
    try {
        const payload = await facultyTripFlowService.resolveDestination(req.user.sub, req.params.id, req.body.destinationText);
        return res.json(successResponse('Destination resolution completed.', payload));
    } catch (error) {
        return next(error);
    }
};

const saveManualPin = async (req, res, next) => {
    try {
        const payload = await facultyTripFlowService.saveManualPin(req.user.sub, req.params.id, req.body);
        return res.json(successResponse('Pinned destination saved successfully.', payload));
    } catch (error) {
        return next(error);
    }
};

const startTrip = async (req, res, next) => {
    try {
        const payload = await facultyTripFlowService.startTrip(req.user.sub, req.body);
        return res.status(201).json(successResponse('Trip started successfully.', payload));
    } catch (error) {
        return next(error);
    }
};

const markArrived = async (req, res, next) => {
    try {
        const payload = await facultyTripFlowService.markArrived(req.user.sub, req.params.tripId);
        return res.json(successResponse('Arrival recorded successfully.', payload));
    } catch (error) {
        return next(error);
    }
};

const verifyArrival = async (req, res, next) => {
    try {
        const payload = await facultyTripFlowService.verifyArrival(req.user.sub, req.params.tripId, req.file, req.body);
        return res.status(201).json(successResponse('Arrival verification uploaded successfully.', payload));
    } catch (error) {
        return next(error);
    }
};

const startReturn = async (req, res, next) => {
    try {
        const payload = await facultyTripFlowService.startReturn(req.user.sub, req.params.tripId);
        return res.json(successResponse('Return route started successfully.', payload));
    } catch (error) {
        return next(error);
    }
};

const markReturned = async (req, res, next) => {
    try {
        const payload = await facultyTripFlowService.markReturned(req.user.sub, req.params.tripId, req.body);
        return res.json(successResponse('Trip completed successfully.', payload));
    } catch (error) {
        return next(error);
    }
};

const getTripSummary = async (req, res, next) => {
    try {
        const payload = await facultyTripFlowService.getTripSummary(req.user.sub, req.params.tripId);
        return res.json(successResponse('Trip summary fetched successfully.', payload));
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    getApprovedLocatorSlips,
    getLocatorSlipDetails,
    resolveDestination,
    saveManualPin,
    startTrip,
    markArrived,
    verifyArrival,
    startReturn,
    markReturned,
    getTripSummary
};
