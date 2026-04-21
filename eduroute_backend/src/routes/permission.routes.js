const express = require('express');
const permissionController = require('../controllers/permission.controller');
const { protect } = require('../middlewares/auth.middleware');
const { updatePermissionPreferencesValidator } = require('../validators/permission.validators');

const router = express.Router();

router.use(protect);

router.get('/me', permissionController.getMyPermissionPreferences);
router.patch('/me', updatePermissionPreferencesValidator, permissionController.updateMyPermissionPreferences);

module.exports = router;
