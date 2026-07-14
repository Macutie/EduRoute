const { successResponse } = require('../utils/apiResponse');
const proofComplianceService = require('../services/proofCompliance.service');
const { encryptSensitiveResponseData } = require('../utils/sensitiveResponseEncryption');

const submitFacultyProof = async (req, res, next) => {
    try {
        const payload = await proofComplianceService.submitFacultyProof(req.user.sub, req.params.tripId, req.files || {}, req.body);
        return res.status(201).json(successResponse('Proof of compliance submitted successfully.', payload));
    } catch (error) {
        return next(error);
    }
};

const getFacultyProof = async (req, res, next) => {
    try {
        const payload = await proofComplianceService.getFacultyProof(req.user.sub, req.params.tripId);
        return res.json(successResponse('Proof of compliance fetched successfully.', payload));
    } catch (error) {
        return next(error);
    }
};

const getHrmuProofList = async (req, res, next) => {
    try {
        const payload = await proofComplianceService.listHrmuProofs(req.user.sub);
        return res.json(successResponse(
            'Proofs of compliance fetched successfully.',
            encryptSensitiveResponseData(req, payload)
        ));
    } catch (error) {
        return next(error);
    }
};

const getHrmuProofDetails = async (req, res, next) => {
    try {
        const payload = await proofComplianceService.getHrmuProofDetails(req.params.id, req.user.sub);
        return res.json(successResponse(
            'Proof of compliance details fetched successfully.',
            encryptSensitiveResponseData(req, payload)
        ));
    } catch (error) {
        return next(error);
    }
};

const reviewHrmuProof = async (req, res, next) => {
    try {
        const payload = await proofComplianceService.reviewHrmuProof(req.user.sub, req.params.id, req.body);
        return res.json(successResponse(
            'Proof of compliance review saved successfully.',
            encryptSensitiveResponseData(req, payload)
        ));
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    submitFacultyProof,
    getFacultyProof,
    getHrmuProofList,
    getHrmuProofDetails,
    reviewHrmuProof
};
