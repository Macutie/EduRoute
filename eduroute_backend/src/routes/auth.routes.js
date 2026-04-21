const express = require('express');
const authController = require('../controllers/auth.controller');
const { protect } = require('../middlewares/auth.middleware');
const {
    registerValidator,
    loginValidator,
    forgotPasswordValidator,
    verifyResetCodeValidator,
    resetPasswordValidator
} = require('../validators/auth.validators');

const router = express.Router();

router.post('/register', registerValidator, authController.register);
router.post('/login', loginValidator, authController.login);
router.post('/forgot-password', forgotPasswordValidator, authController.forgotPassword);
router.post('/verify-reset-code', verifyResetCodeValidator, authController.verifyResetCode);
router.post('/reset-password', resetPasswordValidator, authController.resetPassword);
router.get('/me', protect, authController.me);

module.exports = router;