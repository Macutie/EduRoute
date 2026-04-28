const express = require('express');
const tripController = require('../controllers/trip.controller');
const { protect, requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(protect, requireRole('faculty'));

router.get('/destinations/search', tripController.searchDestinations);
router.post('/route', tripController.previewRoute);
router.get('/active', tripController.getActiveTrip);
router.post('/start', tripController.startTrip);
router.post('/:id/end', tripController.endTrip);
router.post('/:id/location', tripController.recordLocation);

module.exports = router;
