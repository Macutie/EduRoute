const { body, validationResult } = require('express-validator');
const AppError = require('../utils/appError');

const handleValidation = (req, res, next) => {
    const result = validationResult(req);

    if (result.isEmpty()) {
        return next();
    }

    const errors = result.array().map((item) => ({
        field: item.path,
        message: item.msg
    }));

    return next(new AppError('Validation failed', 422, errors));
};

const registerValidator = [
    body('full_name').trim().notEmpty().withMessage('Full name is required.'),
    body('employee_id').trim().notEmpty().withMessage('Employee ID is required.'),
    body('department_id').isInt({ min: 1 }).withMessage('A valid department is required.'),
    body('email').trim().isEmail().withMessage('A valid email address is required.').normalizeEmail(),
    body('password').isString().notEmpty().withMessage('Password is required.'),
    body('confirm_password')
        .custom((value, { req }) => value === req.body.password)
        .withMessage('Confirm password must match password.'),
    body('terms_accepted')
        .custom((value) => value === true)
        .withMessage('You must accept the Terms of Service and Privacy Policy.'),
    handleValidation
];

const loginValidator = [
    body('email_or_employee_id').trim().notEmpty().withMessage('Email or Employee ID is required.'),
    body('password').isString().notEmpty().withMessage('Password is required.'),
    handleValidation
];

const forgotPasswordValidator = [
    body('email').trim().isEmail().withMessage('A valid email address is required.').normalizeEmail(),
    handleValidation
];

const verifyResetCodeValidator = [
    body('email').trim().isEmail().withMessage('A valid email address is required.').normalizeEmail(),
    body('reset_code').trim().isLength({ min: 6, max: 12 }).withMessage('A valid reset code is required.'),
    handleValidation
];

const resetPasswordValidator = [
    body('email').trim().isEmail().withMessage('A valid email address is required.').normalizeEmail(),
    body('reset_code').trim().isLength({ min: 6, max: 12 }).withMessage('A valid reset code is required.'),
    body('new_password').isString().notEmpty().withMessage('New password is required.'),
    body('confirm_password')
        .custom((value, { req }) => value === req.body.new_password)
        .withMessage('Confirm password must match new password.'),
    handleValidation
];

const updateProfileValidator = [
    body('full_name').trim().notEmpty().withMessage('Full name is required.'),
    body('department_id').isInt({ min: 1 }).withMessage('A valid department is required.'),
    handleValidation
];

const changePasswordValidator = [
    body('current_password').isString().notEmpty().withMessage('Current password is required.'),
    body('new_password').isString().notEmpty().withMessage('New password is required.'),
    body('confirm_password')
        .custom((value, { req }) => value === req.body.new_password)
        .withMessage('Confirm password must match new password.'),
    handleValidation
];

module.exports = {
    registerValidator,
    loginValidator,
    forgotPasswordValidator,
    verifyResetCodeValidator,
    resetPasswordValidator,
    updateProfileValidator,
    changePasswordValidator
};
