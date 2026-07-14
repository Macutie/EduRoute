const express = require('express');
const locatorSlipController = require('../controllers/locatorSlip.controller');
const { protect, requireRole } = require('../middlewares/auth.middleware');
const { decryptSensitivePayload } = require('../middlewares/authPayloadEncryption.middleware');
const { uploadLocationVerificationImage } = require('../middlewares/upload.middleware');
const {
    createLocatorSlipValidator,
    locatorSlipIdValidator,
    cancelLocatorSlipValidator
} = require('../validators/locatorSlip.validators');

const router = express.Router();

router.use(protect, requireRole('faculty'));

router.get('/faculty-profile', locatorSlipController.getFacultyProfile);
router.post('/', decryptSensitivePayload, createLocatorSlipValidator, locatorSlipController.createLocatorSlip);
router.get('/my-slips', locatorSlipController.getMyLocatorSlips);
router.patch('/:id/cancel', decryptSensitivePayload, locatorSlipIdValidator, cancelLocatorSlipValidator, locatorSlipController.cancelLocatorSlip);
router.get('/:id/location-verification', locatorSlipIdValidator, locatorSlipController.getLocationVerification);
router.post(
    '/:id/verify-location',
    locatorSlipIdValidator,
    uploadLocationVerificationImage.single('verification_photo'),
    locatorSlipController.verifyLocation
);
router.get('/:id', locatorSlipIdValidator, locatorSlipController.getLocatorSlipById);

module.exports = router;
