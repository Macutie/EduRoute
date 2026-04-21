const { successResponse } = require('../utils/apiResponse');
const locatorSlipService = require('../services/locatorSlip.service');

const getFacultyProfile = async (req, res, next) => {
    try {
        const profile = await locatorSlipService.getFacultyProfile(req.user.sub);
        return res.json(successResponse('Faculty profile fetched successfully.', profile));
    } catch (error) {
        return next(error);
    }
};

const createLocatorSlip = async (req, res, next) => {
    try {
        const locatorSlip = await locatorSlipService.createLocatorSlip(req.user.sub, req.body);
        return res.status(201).json(successResponse('Locator slip submitted successfully.', locatorSlip));
    } catch (error) {
        return next(error);
    }
};

const getMyLocatorSlips = async (req, res, next) => {
    try {
        const locatorSlips = await locatorSlipService.getMyLocatorSlips(req.user.sub);
        return res.json(successResponse('Locator slips fetched successfully.', locatorSlips));
    } catch (error) {
        return next(error);
    }
};

const getLocatorSlipById = async (req, res, next) => {
    try {
        const locatorSlip = await locatorSlipService.getLocatorSlipById(req.user.sub, req.params.id);
        return res.json(successResponse('Locator slip fetched successfully.', locatorSlip));
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    getFacultyProfile,
    createLocatorSlip,
    getMyLocatorSlips,
    getLocatorSlipById
};
