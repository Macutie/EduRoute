const { successResponse } = require('../utils/apiResponse');
const hrmuReportsService = require('../services/hrmuReports.service');
const hrmuVerificationService = require('../services/hrmuVerification.service');
const { encryptSensitiveResponseData } = require('../utils/sensitiveResponseEncryption');

const getTrips = async (req, res, next) => {
    try {
        const payload = await hrmuVerificationService.getVerificationTrips(req.user.sub);
        return res.json(successResponse(
            'HRMU verification trips fetched successfully.',
            encryptSensitiveResponseData(req, payload)
        ));
    } catch (error) {
        return next(error);
    }
};

const getFlaggedTrips = async (req, res, next) => {
    try {
        const payload = await hrmuReportsService.getVerificationFlaggedTrips(req.user.sub);
        return res.json(successResponse(
            'HRMU flagged trips fetched successfully.',
            encryptSensitiveResponseData(req, payload)
        ));
    } catch (error) {
        return next(error);
    }
};

const getVerificationSummary = async (req, res, next) => {
    try {
        const payload = await hrmuReportsService.getVerificationIncidentSummary(req.user.sub);
        return res.json(successResponse(
            'HRMU verification incident summary fetched successfully.',
            encryptSensitiveResponseData(req, payload)
        ));
    } catch (error) {
        return next(error);
    }
};

const reviewArrivalVerification = async (req, res, next) => {
    try {
        const payload = await hrmuVerificationService.reviewArrivalVerification(
            req.user.sub,
            req.params.verificationId,
            req.body
        );
        return res.json(successResponse(
            'Arrival verification reviewed successfully.',
            encryptSensitiveResponseData(req, payload)
        ));
    } catch (error) {
        return next(error);
    }
};

const flagTripWithoutProof = async (req, res, next) => {
    try {
        const payload = await hrmuVerificationService.flagTripWithoutProof(
            req.user.sub,
            req.params.tripId,
            req.body?.locatorSlipId || null
        );
        return res.json(successResponse(
            'Completed trip flagged as unverified location/signature.',
            encryptSensitiveResponseData(req, payload)
        ));
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    getTrips,
    getFlaggedTrips,
    getVerificationSummary,
    reviewArrivalVerification,
    flagTripWithoutProof
};
