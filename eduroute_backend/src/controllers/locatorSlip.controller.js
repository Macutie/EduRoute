const { successResponse } = require('../utils/apiResponse');
const locatorSlipService = require('../services/locatorSlip.service');
const { encryptSensitiveResponseData } = require('../utils/sensitiveResponseEncryption');

const getFacultyProfile = async (req, res, next) => {
    try {
        const profile = await locatorSlipService.getFacultyProfile(req.user.sub);
        return res.json(successResponse(
            'Faculty profile fetched successfully.',
            encryptSensitiveResponseData(req, profile)
        ));
    } catch (error) {
        return next(error);
    }
};

const createLocatorSlip = async (req, res, next) => {
    try {
        const locatorSlip = await locatorSlipService.createLocatorSlip(req.user.sub, req.body);
        return res.status(201).json(successResponse(
            'Locator slip submitted successfully.',
            encryptSensitiveResponseData(req, locatorSlip)
        ));
    } catch (error) {
        return next(error);
    }
};

const getMyLocatorSlips = async (req, res, next) => {
    try {
        const locatorSlips = await locatorSlipService.getMyLocatorSlips(req.user.sub, req.query.status || null);
        return res.json(successResponse(
            'Locator slips fetched successfully.',
            encryptSensitiveResponseData(req, locatorSlips)
        ));
    } catch (error) {
        return next(error);
    }
};

const getLocatorSlipById = async (req, res, next) => {
    try {
        const locatorSlip = await locatorSlipService.getLocatorSlipById(req.user.sub, req.params.id);
        return res.json(successResponse(
            'Locator slip fetched successfully.',
            encryptSensitiveResponseData(req, locatorSlip)
        ));
    } catch (error) {
        return next(error);
    }
};

const cancelLocatorSlip = async (req, res, next) => {
    try {
        const locatorSlip = await locatorSlipService.cancelLocatorSlip(
            req.user.sub,
            req.params.id,
            req.body?.cancellation_reason || req.body?.reason || null
        );
        return res.json(successResponse(
            'Locator slip request cancelled successfully.',
            encryptSensitiveResponseData(req, locatorSlip)
        ));
    } catch (error) {
        return next(error);
    }
};

const verifyLocation = async (req, res, next) => {
    try {
        const verification = await locatorSlipService.verifyLocation(req.user.sub, req.params.id, req.file);
        return res.status(201).json(successResponse('Location verification photo uploaded successfully.', verification));
    } catch (error) {
        return next(error);
    }
};

const getLocationVerification = async (req, res, next) => {
    try {
        const verification = await locatorSlipService.getLocationVerification(req.user.sub, req.params.id);
        return res.json(successResponse('Location verification fetched successfully.', verification));
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    getFacultyProfile,
    createLocatorSlip,
    getMyLocatorSlips,
    getLocatorSlipById,
    cancelLocatorSlip,
    verifyLocation,
    getLocationVerification
};
