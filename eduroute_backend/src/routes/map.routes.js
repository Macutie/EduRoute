const express = require('express');
const mapController = require('../controllers/map.controller');
const { protect, requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);

router.post('/directions', requireRole('faculty', 'hrmu', 'cssu', 'admin'), mapController.getDirections);
router.get('/trips/active', requireRole('faculty'), mapController.getActiveTrip);
router.post('/trips/start', requireRole('faculty'), mapController.startTrip);
router.post('/trips/:id/end', requireRole('faculty'), mapController.endTrip);

module.exports = router;
