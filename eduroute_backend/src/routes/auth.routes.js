const express = require('express');
const authController = require('../controllers/auth.controller');
const { protect } = require('../middlewares/auth.middleware');
const { decryptAuthPayload } = require('../middlewares/authPayloadEncryption.middleware');
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

router.get('/payload-public-key', authController.getPayloadPublicKey);
router.post('/register', authLimiter, decryptAuthPayload, registerValidator, authController.register);
router.post('/login', authLimiter, decryptAuthPayload, loginValidator, authController.login);
router.post('/forgot-password', authLimiter, decryptAuthPayload, forgotPasswordValidator, authController.forgotPassword);
router.post('/verify-reset-code', authLimiter, decryptAuthPayload, verifyResetCodeValidator, authController.verifyResetCode);
router.post('/reset-password', authLimiter, decryptAuthPayload, resetPasswordValidator, authController.resetPassword);
router.get('/me', protect, authController.me);
router.patch('/me', protect, decryptAuthPayload, updateProfileValidator, authController.updateMe);
router.patch(
    '/me/profile-picture',
    protect,
    uploadProfileImage.single('profile_image'),
    authController.updateProfileImage
);
router.patch('/change-password', protect, decryptAuthPayload, changePasswordValidator, authController.changePassword);

module.exports = router;
