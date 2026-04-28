const express = require('express');
const hrmuReportsController = require('../controllers/hrmuReports.controller');

const router = express.Router();

router.get('/monthly', hrmuReportsController.getMonthlyReport);
router.get('/monthly/logs', hrmuReportsController.getMonthlyReportLogs);
router.get('/monthly/summary', hrmuReportsController.getMonthlyReportSummary);
router.get('/monthly/download', hrmuReportsController.downloadMonthlyReport);
router.get('/monthly/:locatorSlipId/details', hrmuReportsController.getMonthlyReportDetails);

module.exports = router;
