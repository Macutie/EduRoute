const express = require('express');
const hrmuVerificationController = require('../controllers/hrmuVerification.controller');
const { decryptSensitivePayload } = require('../middlewares/authPayloadEncryption.middleware');

const router = express.Router();

router.get('/trips', hrmuVerificationController.getTrips);
router.get('/flagged-trips', hrmuVerificationController.getFlaggedTrips);
router.get('/summary', hrmuVerificationController.getVerificationSummary);
router.patch('/trips/:tripId/flag-unverified', decryptSensitivePayload, hrmuVerificationController.flagTripWithoutProof);
router.patch('/arrival/:verificationId', decryptSensitivePayload, hrmuVerificationController.reviewArrivalVerification);

module.exports = router;
