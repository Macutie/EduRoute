const express = require('express');
const locatorSlipController = require('../controllers/locatorSlip.controller');
const { protect, requireRole } = require('../middlewares/auth.middleware');
const {
    createLocatorSlipValidator,
    locatorSlipIdValidator
} = require('../validators/locatorSlip.validators');

const router = express.Router();

router.use(protect, requireRole('faculty'));

router.get('/faculty-profile', locatorSlipController.getFacultyProfile);
router.post('/', createLocatorSlipValidator, locatorSlipController.createLocatorSlip);
router.get('/my-slips', locatorSlipController.getMyLocatorSlips);
router.patch('/:id/cancel', locatorSlipIdValidator, locatorSlipController.cancelLocatorSlip);
router.get('/:id', locatorSlipIdValidator, locatorSlipController.getLocatorSlipById);

module.exports = router;
