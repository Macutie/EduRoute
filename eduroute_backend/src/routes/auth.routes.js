const express = require('express');
const authController = require('../controllers/auth.controller');
const { protect } = require('../middlewares/auth.middleware');
const { authLimiter } = require('../middlewares/rateLimiter.middleware');
const { uploadProfileImage } = require('../middlewares/upload.middleware');
const {
    registerValidator,
    loginValidator,
    forgotPasswordValidator,
    verifyResetCodeValidator,
    resetPasswordValidator,
    updateProfileValidator,
    changePasswordValidator
} = require('../validators/auth.validators');

const router = express.Router();

router.post('/register', authLimiter, registerValidator, authController.register);
router.post('/login', authLimiter, loginValidator, authController.login);
router.post('/forgot-password', authLimiter, forgotPasswordValidator, authController.forgotPassword);
router.post('/verify-reset-code', authLimiter, verifyResetCodeValidator, authController.verifyResetCode);
router.post('/reset-password', authLimiter, resetPasswordValidator, authController.resetPassword);
router.get('/me', protect, authController.me);
router.patch('/me', protect, updateProfileValidator, authController.updateMe);
router.patch(
    '/me/profile-picture',
    protect,
    uploadProfileImage.single('profile_image'),
    authController.updateProfileImage
);
router.patch('/change-password', protect, changePasswordValidator, authController.changePassword);

module.exports = router;
