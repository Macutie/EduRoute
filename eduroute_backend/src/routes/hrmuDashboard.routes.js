const express = require('express');
const hrmuDashboardController = require('../controllers/hrmuDashboard.controller');
const hrmuAnalyticsRoutes = require('./hrmuAnalytics.routes');
const hrmuLiveTrackingRoutes = require('./hrmuLiveTracking.routes');
const hrmuReportsRoutes = require('./hrmuReports.routes');
const hrmuVerificationRoutes = require('./hrmuVerification.routes');
const tripController = require('../controllers/trip.controller');
const { protect, requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(protect);
router.use('/live-tracking', requireRole('hrmu', 'admin', 'cssu'), hrmuLiveTrackingRoutes);
router.use(requireRole('hrmu', 'admin'));
router.use('/analytics', hrmuAnalyticsRoutes);
router.use('/reports', hrmuReportsRoutes);
router.use('/verification', hrmuVerificationRoutes);

router.get('/dashboard/summary', hrmuDashboardController.getSummary);
router.get('/live-faculty', hrmuDashboardController.getLiveFaculty);
router.get('/notifications', hrmuDashboardController.getNotifications);
router.get('/report-inbox', hrmuDashboardController.getReportInbox);
router.get('/report-inbox/:id/download', hrmuDashboardController.downloadReportInboxAttachment);
router.get('/recent-activity', hrmuDashboardController.getRecentActivity);
router.get('/live-tracking', hrmuDashboardController.getLiveTracking);
router.get('/trips/:tripId/path-history', tripController.getPathHistory);
router.get('/recent-activity/export-csv', hrmuDashboardController.exportRecentActivityCsv);

module.exports = router;
