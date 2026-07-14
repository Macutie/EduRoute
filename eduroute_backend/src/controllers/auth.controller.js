const authService = require('../services/auth.service');
const { successResponse } = require('../utils/apiResponse');
const { getPublicKeyPem } = require('../utils/authPayloadEncryption');
const { encryptSensitiveResponseData } = require('../utils/sensitiveResponseEncryption');

const getPayloadPublicKey = async (req, res, next) => {
    try {
        res.set('Cache-Control', 'no-store');
        return res.status(200).json(successResponse('Auth payload public key fetched successfully.', {
            publicKey: getPublicKeyPem(),
            algorithm: 'RSA-OAEP-256/AES-256-GCM'
        }));
    } catch (error) {
        return next(error);
    }
};

const register = async (req, res, next) => {
    try {
        const user = await authService.registerFaculty(req.body);
        res.set('Cache-Control', 'no-store');
        return res.status(201).json(
            successResponse('Registration successful. You can now log in.', { user })
        );
    } catch (error) {
        return next(error);
    }
};

const login = async (req, res, next) => {
    try {
        const result = await authService.loginFaculty(req.body);
        res.set('Cache-Control', 'no-store');
        return res.status(200).json(successResponse('Login successful.', result));
    } catch (error) {
        return next(error);
    }
};

const forgotPassword = async (req, res, next) => {
    try {
        await authService.forgotPassword(req.body);
        return res.status(200).json(
            successResponse('If an account exists for this email, a reset code has been sent.')
        );
    } catch (error) {
        return next(error);
    }
};

const verifyResetCode = async (req, res, next) => {
    try {
        const result = await authService.verifyResetCode(req.body);
        return res.status(200).json(successResponse('Reset code verified.', result));
    } catch (error) {
        return next(error);
    }
};

const resetPassword = async (req, res, next) => {
    try {
        await authService.resetPassword(req.body);
        return res.status(200).json(
            successResponse('Password reset successful. You can now log in with your new password.')
        );
    } catch (error) {
        return next(error);
    }
};

const me = async (req, res, next) => {
    try {
        const user = await authService.getCurrentFaculty(req.user.sub);
        return res.status(200).json(successResponse(
            'Faculty profile fetched successfully.',
            encryptSensitiveResponseData(req, user)
        ));
    } catch (error) {
        return next(error);
    }
};

const updateMe = async (req, res, next) => {
    try {
        const user = await authService.updateCurrentFacultyProfile(req.user.sub, req.body);
        return res.status(200).json(successResponse(
            'Profile updated successfully.',
            encryptSensitiveResponseData(req, user)
        ));
    } catch (error) {
        return next(error);
    }
};

const updateProfileImage = async (req, res, next) => {
    try {
        const user = await authService.updateCurrentFacultyProfileImage(req.user.sub, req.file);
        return res.status(200).json(successResponse(
            'Profile picture updated successfully.',
            encryptSensitiveResponseData(req, user)
        ));
    } catch (error) {
        return next(error);
    }
};

const changePassword = async (req, res, next) => {
    try {
        await authService.changeCurrentFacultyPassword(req.user.sub, req.body);
        return res.status(200).json(successResponse('Password changed successfully.'));
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    getPayloadPublicKey,
    register,
    login,
    forgotPassword,
    verifyResetCode,
    resetPassword,
    me,
    updateMe,
    updateProfileImage,
    changePassword
};
