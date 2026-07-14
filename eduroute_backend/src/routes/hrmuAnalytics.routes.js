const express = require('express');
const hrmuAnalyticsController = require('../controllers/hrmuAnalytics.controller');

const router = express.Router();

router.get('/overview', hrmuAnalyticsController.getOverview);
router.get('/daily-movement', hrmuAnalyticsController.getDailyMovement);
router.get('/approval-rate', hrmuAnalyticsController.getApprovalRate);
router.get('/frequent-destinations', hrmuAnalyticsController.getFrequentDestinations);
router.get('/monthly-summary', hrmuAnalyticsController.getMonthlySummary);
router.get('/summary', hrmuAnalyticsController.getSmartSummary);
router.get('/risk-trips', hrmuAnalyticsController.getSmartRiskTrips);
router.get('/incidents', hrmuAnalyticsController.getSmartIncidents);
router.get('/college-summary', hrmuAnalyticsController.getSmartCollegeSummary);
router.post('/generate', hrmuAnalyticsController.generateSmartAnalytics);
router.post('/generate/:tripId', hrmuAnalyticsController.generateSmartAnalyticsForTrip);
router.get('/export-csv', hrmuAnalyticsController.exportCsv);
router.get('/export-pdf', hrmuAnalyticsController.exportPdf);

module.exports = router;
