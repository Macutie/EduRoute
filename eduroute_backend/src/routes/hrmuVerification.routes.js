const express = require('express');
const hrmuVerificationController = require('../controllers/hrmuVerification.controller');

const router = express.Router();

router.get('/flagged-trips', hrmuVerificationController.getFlaggedTrips);
router.get('/summary', hrmuVerificationController.getVerificationSummary);

module.exports = router;
