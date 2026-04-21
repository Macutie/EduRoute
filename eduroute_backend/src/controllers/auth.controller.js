const authService = require('../services/auth.service');
const { successResponse } = require('../utils/apiResponse');

const register = async (req, res, next) => {
    try {
        const user = await authService.registerFaculty(req.body);
        return res.status(201).json(
            successResponse('Registration successful. You can now log in.', user)
        );
    } catch (error) {
        return next(error);
    }
};

const login = async (req, res, next) => {
    try {
        const result = await authService.loginFaculty(req.body);
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
        return res.status(200).json(successResponse('Faculty profile fetched successfully.', user));
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    register,
    login,
    forgotPassword,
    verifyResetCode,
    resetPassword,
    me
};