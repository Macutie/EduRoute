const express = require('express');
const cssuDashboardController = require('../controllers/cssuDashboard.controller');
const hrmuLiveTrackingController = require('../controllers/hrmuLiveTracking.controller');
const { protect, requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(protect, requireRole('cssu', 'admin'));

router.get('/dashboard/summary', cssuDashboardController.getSummary);
router.get('/dashboard/live-exits', cssuDashboardController.getLiveExitMonitoring);
router.get('/live-tracking/active-faculty', hrmuLiveTrackingController.getActiveFaculty);
router.get('/live-tracking/faculty/:facultyUserId', hrmuLiveTrackingController.getFacultyDetails);
router.get('/live-tracking/faculty/:facultyUserId/activity', hrmuLiveTrackingController.getFacultyActivity);
router.get('/incidents/overview', cssuDashboardController.getIncidentOverview);
router.get('/notifications/overview', cssuDashboardController.getNotificationsOverview);
router.get('/reports/overview', cssuDashboardController.getReportsOverview);
router.get('/reports/download', cssuDashboardController.downloadReportsPdf);
router.post('/reports/send', cssuDashboardController.sendReportToHrmu);
router.get('/exit-clearance/lookup', cssuDashboardController.lookupExitCandidate);
router.patch('/dashboard/locator-slips/:locatorSlipId/exit-status', cssuDashboardController.updateExitLogStatus);

module.exports = router;
