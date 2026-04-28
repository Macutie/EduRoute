const express = require('express');
const hrmuDashboardController = require('../controllers/hrmuDashboard.controller');
const hrmuAnalyticsRoutes = require('./hrmuAnalytics.routes');
const hrmuLiveTrackingRoutes = require('./hrmuLiveTracking.routes');
const hrmuReportsRoutes = require('./hrmuReports.routes');
const hrmuVerificationRoutes = require('./hrmuVerification.routes');
const { protect, requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(protect, requireRole('hrmu', 'admin'));
router.use('/analytics', hrmuAnalyticsRoutes);
router.use('/live-tracking', hrmuLiveTrackingRoutes);
router.use('/reports', hrmuReportsRoutes);
router.use('/verification', hrmuVerificationRoutes);

router.get('/dashboard/summary', hrmuDashboardController.getSummary);
router.get('/live-faculty', hrmuDashboardController.getLiveFaculty);
router.get('/notifications', hrmuDashboardController.getNotifications);
router.get('/recent-activity', hrmuDashboardController.getRecentActivity);
router.get('/live-tracking', hrmuDashboardController.getLiveTracking);
router.get('/recent-activity/export-csv', hrmuDashboardController.exportRecentActivityCsv);

module.exports = router;
