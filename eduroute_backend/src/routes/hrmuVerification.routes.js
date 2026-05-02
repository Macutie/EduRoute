const express = require('express');
const hrmuVerificationController = require('../controllers/hrmuVerification.controller');

const router = express.Router();

router.get('/trips', hrmuVerificationController.getTrips);
router.get('/flagged-trips', hrmuVerificationController.getFlaggedTrips);
router.get('/summary', hrmuVerificationController.getVerificationSummary);
router.patch('/trips/:tripId/flag-unverified', hrmuVerificationController.flagTripWithoutProof);
router.patch('/arrival/:verificationId', hrmuVerificationController.reviewArrivalVerification);

module.exports = router;
