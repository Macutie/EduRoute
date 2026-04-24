const express = require('express');
const mapController = require('../controllers/map.controller');
const { protect, requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(protect, requireRole('faculty'));

router.post('/directions', mapController.getDirections);
router.get('/trips/active', mapController.getActiveTrip);
router.post('/trips/start', mapController.startTrip);
router.post('/trips/:id/end', mapController.endTrip);

module.exports = router;
