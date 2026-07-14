const { body, validationResult } = require('express-validator');
const AppError = require('../utils/appError');

const ROLE_OPTIONS = ['faculty', 'hrmu', 'cssu', 'admin', 'assistant_dean', 'college_dean'];
const ALLOWED_EMAIL_DOMAIN = '@gordoncollege.edu.ph';

const isGordonCollegeEmail = (value = '') =>
    String(value).trim().toLowerCase().endsWith(ALLOWED_EMAIL_DOMAIN);

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
    body('account_role')
        .optional()
        .isIn(ROLE_OPTIONS)
        .withMessage('Selected account role is invalid.'),
    body('full_name').trim().notEmpty().withMessage('Full name is required.'),
    body('employee_id').trim().notEmpty().withMessage('Employee ID is required.'),
    body('department_id')
        .custom((value, { req }) => {
            const role = req.body.account_role || 'faculty';

            if (['faculty', 'admin', 'assistant_dean', 'college_dean'].includes(role)) {
                if (!Number.isInteger(Number(value)) || Number(value) < 1) {
                    throw new Error('A valid department is required.');
                }
            }

            return true;
        }),
    body('email')
        .trim()
        .isEmail()
        .withMessage('A valid email address is required.')
        .bail()
        .custom((value) => {
            if (!isGordonCollegeEmail(value)) {
                throw new Error('Only @gordoncollege.edu.ph email addresses are accepted.');
            }

            return true;
        })
        .normalizeEmail(),
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
    body('email_or_employee_id')
        .trim()
        .notEmpty()
        .withMessage('Email or Employee ID is required.')
        .bail()
        .custom((value) => {
            const identifier = String(value || '').trim();

            if (identifier.includes('@') && !isGordonCollegeEmail(identifier)) {
                throw new Error('Only @gordoncollege.edu.ph email addresses are accepted.');
            }

            return true;
        }),
    body('password').isString().notEmpty().withMessage('Password is required.'),
    body('portal_role')
        .optional()
        .isIn(ROLE_OPTIONS)
        .withMessage('Selected portal role is invalid.'),
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
    body('department_id')
        .optional({ nullable: true, checkFalsy: true })
        .isInt({ min: 1 })
        .withMessage('A valid department is required.'),
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
    ROLE_OPTIONS,
    registerValidator,
    loginValidator,
    forgotPasswordValidator,
    verifyResetCodeValidator,
    resetPasswordValidator,
    updateProfileValidator,
    changePasswordValidator
};
