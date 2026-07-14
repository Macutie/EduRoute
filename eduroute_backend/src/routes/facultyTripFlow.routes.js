const express = require('express');
const facultyTripFlowController = require('../controllers/facultyTripFlow.controller');
const { protect, requireRole } = require('../middlewares/auth.middleware');
const {
    decryptSensitivePayload,
    decryptMultipartSensitivePayload
} = require('../middlewares/authPayloadEncryption.middleware');
const { uploadLocationVerificationImage } = require('../middlewares/upload.middleware');

const router = express.Router();

router.use(protect, requireRole('faculty'));

router.get('/locator-slips/approved', facultyTripFlowController.getApprovedLocatorSlips);
router.get('/locator-slips/:id', facultyTripFlowController.getLocatorSlipDetails);
router.post('/locator-slips/:id/resolve-destination', decryptSensitivePayload, facultyTripFlowController.resolveDestination);
router.post('/locator-slips/:id/manual-pin', decryptSensitivePayload, facultyTripFlowController.saveManualPin);

router.post('/trips/start', decryptSensitivePayload, facultyTripFlowController.startTrip);
router.post('/trips/:tripId/arrived', facultyTripFlowController.markArrived);
router.post(
    '/trips/:tripId/verify-arrival',
    uploadLocationVerificationImage.single('verification_photo'),
    decryptMultipartSensitivePayload,
    facultyTripFlowController.verifyArrival
);
router.post('/trips/:tripId/start-return', facultyTripFlowController.startReturn);
router.post('/trips/:tripId/returned', decryptSensitivePayload, facultyTripFlowController.markReturned);
router.get('/trips/:tripId/summary', facultyTripFlowController.getTripSummary);

module.exports = router;
