const express = require('express');
const tripController = require('../controllers/trip.controller');
const { protect, requireRole } = require('../middlewares/auth.middleware');
const { decryptSensitivePayload } = require('../middlewares/authPayloadEncryption.middleware');

const router = express.Router();

router.use(protect);

router.get('/destinations/search', requireRole('faculty'), tripController.searchDestinations);
router.post('/route', requireRole('faculty'), decryptSensitivePayload, tripController.previewRoute);
router.get('/active', requireRole('faculty'), tripController.getActiveTrip);
router.post('/start', requireRole('faculty'), decryptSensitivePayload, tripController.startTrip);
router.post('/:id/end', requireRole('faculty'), decryptSensitivePayload, tripController.endTrip);
router.post('/:id/location', requireRole('faculty'), decryptSensitivePayload, tripController.recordLocation);
router.post('/:id/location/bulk', requireRole('faculty'), decryptSensitivePayload, tripController.recordLocationBulk);
router.get('/:id/path-history', requireRole('faculty', 'hrmu', 'admin', 'assistant_dean', 'college_dean'), tripController.getPathHistory);

module.exports = router;
