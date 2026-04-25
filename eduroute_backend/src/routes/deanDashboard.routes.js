const express = require('express');
const deanDashboardController = require('../controllers/deanDashboard.controller');
const { protect, requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(protect, requireRole('assistant_dean', 'college_dean'));

router.get('/dashboard/summary', deanDashboardController.getSummary);
router.get('/notifications', deanDashboardController.getNotifications);
router.patch('/notifications/:id/read', deanDashboardController.markNotificationRead);
router.get('/locator-slips', deanDashboardController.getLocatorSlips);
router.get('/pending-approvals', deanDashboardController.getPendingApprovals);
router.get('/faculty', deanDashboardController.getFacultyOverview);
router.get('/requests/pending', deanDashboardController.getPendingRequestsPage);
router.get('/registry', deanDashboardController.getRegistryPage);

module.exports = router;
