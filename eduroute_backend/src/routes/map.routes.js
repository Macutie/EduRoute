const express = require('express');
const mapController = require('../controllers/map.controller');
const { protect, requireRole } = require('../middlewares/auth.middleware');
const { decryptSensitivePayload } = require('../middlewares/authPayloadEncryption.middleware');

const router = express.Router();

router.use(protect);

router.post('/directions', requireRole('faculty', 'hrmu', 'cssu', 'admin'), decryptSensitivePayload, mapController.getDirections);
router.get('/trips/active', requireRole('faculty'), mapController.getActiveTrip);
router.post('/trips/start', requireRole('faculty'), decryptSensitivePayload, mapController.startTrip);
router.post('/trips/:id/end', requireRole('faculty'), decryptSensitivePayload, mapController.endTrip);

module.exports = router;
