const express = require('express');
const hrmuAnalyticsController = require('../controllers/hrmuAnalytics.controller');

const router = express.Router();

router.get('/overview', hrmuAnalyticsController.getOverview);
router.get('/daily-movement', hrmuAnalyticsController.getDailyMovement);
router.get('/approval-rate', hrmuAnalyticsController.getApprovalRate);
router.get('/frequent-destinations', hrmuAnalyticsController.getFrequentDestinations);
router.get('/monthly-summary', hrmuAnalyticsController.getMonthlySummary);
router.get('/export-csv', hrmuAnalyticsController.exportCsv);
router.get('/export-pdf', hrmuAnalyticsController.exportPdf);

module.exports = router;
