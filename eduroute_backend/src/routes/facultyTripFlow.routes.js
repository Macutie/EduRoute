const express = require('express');
const facultyTripFlowController = require('../controllers/facultyTripFlow.controller');
const { protect, requireRole } = require('../middlewares/auth.middleware');
const { uploadLocationVerificationImage } = require('../middlewares/upload.middleware');

const router = express.Router();

router.use(protect, requireRole('faculty'));

router.get('/locator-slips/approved', facultyTripFlowController.getApprovedLocatorSlips);
router.get('/locator-slips/:id', facultyTripFlowController.getLocatorSlipDetails);
router.post('/locator-slips/:id/resolve-destination', facultyTripFlowController.resolveDestination);
router.post('/locator-slips/:id/manual-pin', facultyTripFlowController.saveManualPin);

router.post('/trips/start', facultyTripFlowController.startTrip);
router.post('/trips/:tripId/arrived', facultyTripFlowController.markArrived);
router.post(
    '/trips/:tripId/verify-arrival',
    uploadLocationVerificationImage.single('verification_photo'),
    facultyTripFlowController.verifyArrival
);
router.post('/trips/:tripId/start-return', facultyTripFlowController.startReturn);
router.post('/trips/:tripId/returned', facultyTripFlowController.markReturned);
router.get('/trips/:tripId/summary', facultyTripFlowController.getTripSummary);

module.exports = router;
