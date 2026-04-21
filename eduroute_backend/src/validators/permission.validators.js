const { body, validationResult } = require('express-validator');
const AppError = require('../utils/appError');
const { ALLOWED_STATUSES } = require('../services/permission.service');

const handleValidation = (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        return next(new AppError('Validation failed.', 422, errors.array()));
    }

    return next();
};

const updatePermissionPreferencesValidator = [
    body('notifications_status')
        .optional()
        .isIn(ALLOWED_STATUSES)
        .withMessage('Notification status is invalid.'),
    body('location_status')
        .optional()
        .isIn(ALLOWED_STATUSES)
        .withMessage('Location status is invalid.'),
    body('camera_status')
        .optional()
        .isIn(ALLOWED_STATUSES)
        .withMessage('Camera/photo status is invalid.'),
    body('first_login_setup_completed')
        .optional()
        .isBoolean()
        .withMessage('First login setup completed must be true or false.'),
    handleValidation
];

module.exports = {
    updatePermissionPreferencesValidator
};
