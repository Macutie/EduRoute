const express = require('express');
const proofComplianceController = require('../controllers/proofCompliance.controller');
const { protect, requireRole } = require('../middlewares/auth.middleware');
const { uploadProofComplianceAssets } = require('../middlewares/upload.middleware');

const router = express.Router();

router.post(
    '/faculty/trips/:tripId/proof-of-compliance',
    protect,
    requireRole('faculty'),
    uploadProofComplianceAssets.fields([
        { name: 'arrival_photo', maxCount: 1 },
        { name: 'signature_image', maxCount: 1 }
    ]),
    proofComplianceController.submitFacultyProof
);

router.get(
    '/faculty/trips/:tripId/proof-of-compliance',
    protect,
    requireRole('faculty'),
    proofComplianceController.getFacultyProof
);

router.get(
    '/hrmu/proof-of-compliance',
    protect,
    requireRole('hrmu', 'admin'),
    proofComplianceController.getHrmuProofList
);

router.get(
    '/hrmu/proof-of-compliance/:id',
    protect,
    requireRole('hrmu', 'admin'),
    proofComplianceController.getHrmuProofDetails
);

router.patch(
    '/hrmu/proof-of-compliance/:id/review',
    protect,
    requireRole('hrmu', 'admin'),
    proofComplianceController.reviewHrmuProof
);

module.exports = router;
