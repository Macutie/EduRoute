const express = require('express');
const hrmuLiveTrackingController = require('../controllers/hrmuLiveTracking.controller');

const router = express.Router();

router.get('/active-faculty', hrmuLiveTrackingController.getActiveFaculty);
router.get('/faculty/:facultyUserId', hrmuLiveTrackingController.getFacultyDetails);
router.get('/faculty/:facultyUserId/activity', hrmuLiveTrackingController.getFacultyActivity);

module.exports = router;
