const express = require('express');
const deanDashboardController = require('../controllers/deanDashboard.controller');
const { protect, requireRole } = require('../middlewares/auth.middleware');
const { decryptSensitivePayload } = require('../middlewares/authPayloadEncryption.middleware');
const { uploadDeanSignatureAsset } = require('../middlewares/upload.middleware');

const router = express.Router();

router.use(protect, requireRole('assistant_dean', 'college_dean', 'admin'));

router.get('/dashboard/summary', deanDashboardController.getSummary);
router.get('/signature', deanDashboardController.getDeanSignatureSettings);
router.post('/signature', uploadDeanSignatureAsset.single('signature_file'), deanDashboardController.uploadDeanSignatureFile);
router.get('/notifications', deanDashboardController.getNotifications);
router.patch('/notifications/:id/read', deanDashboardController.markNotificationRead);
router.get('/proof-of-compliance', deanDashboardController.getProofComplianceList);
router.get('/proof-of-compliance/locator-slip/:locatorSlipId', deanDashboardController.getProofComplianceDetailsByLocatorSlip);
router.get('/proof-of-compliance/:id', deanDashboardController.getProofComplianceDetails);
router.get('/locator-slips', deanDashboardController.getLocatorSlips);
router.get('/pending-approvals', deanDashboardController.getPendingApprovals);
router.get('/faculty', deanDashboardController.getFacultyOverview);
router.get('/requests/pending', deanDashboardController.getPendingRequestsPage);
router.post('/requests/bulk-approve', decryptSensitivePayload, deanDashboardController.bulkApproveLocatorSlipRequests);
router.get('/requests/:id/insights', deanDashboardController.getRequestInsights);
router.patch('/requests/:id/approve', deanDashboardController.approveLocatorSlipRequest);
router.patch('/requests/:id/reject', decryptSensitivePayload, deanDashboardController.rejectLocatorSlipRequest);
router.get('/registry', deanDashboardController.getRegistryPage);

module.exports = router;
