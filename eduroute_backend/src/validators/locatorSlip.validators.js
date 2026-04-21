const { body, param, validationResult } = require('express-validator');
const AppError = require('../utils/appError');

const PURPOSE_OPTIONS = [
    'Official Meeting/Conference',
    'Submission/Retrieval of Documents',
    'Coordination/Consultation',
    'Field Inspection/Monitoring',
    'Others'
];

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

const createLocatorSlipValidator = [
    body('destination')
        .trim()
        .notEmpty()
        .withMessage('Destination is required.')
        .isLength({ max: 255 })
        .withMessage('Destination must not exceed 255 characters.'),
    body('purpose_of_travel')
        .trim()
        .notEmpty()
        .withMessage('Purpose of travel is required.')
        .isIn(PURPOSE_OPTIONS)
        .withMessage('Purpose of travel is invalid.'),
    body('custom_purpose')
        .customSanitizer((value) => (typeof value === 'string' ? value.trim() : ''))
        .custom((value, { req }) => {
            if (req.body.purpose_of_travel === 'Others' && !value) {
                throw new Error('Custom purpose is required when purpose of travel is Others.');
            }

            if (value && value.length > 255) {
                throw new Error('Custom purpose must not exceed 255 characters.');
            }

            return true;
        }),
    body('departure_datetime')
        .trim()
        .notEmpty()
        .withMessage('Departure date and time is required.')
        .isISO8601()
        .withMessage('Departure date and time must be a valid datetime.')
        .custom((value) => {
            const departure = new Date(value);

            if (Number.isNaN(departure.getTime())) {
                return true;
            }

            if (departure.getTime() < Date.now()) {
                throw new Error('Departure date and time cannot be in the past.');
            }

            return true;
        }),
    body('expected_return_datetime')
        .trim()
        .notEmpty()
        .withMessage('Expected return date and time is required.')
        .isISO8601()
        .withMessage('Expected return date and time must be a valid datetime.')
        .custom((value, { req }) => {
            const departure = new Date(req.body.departure_datetime);
            const expectedReturn = new Date(value);

            if (Number.isNaN(departure.getTime()) || Number.isNaN(expectedReturn.getTime())) {
                return true;
            }

            if (expectedReturn <= departure) {
                throw new Error('Expected return date and time must be later than departure date and time.');
            }

            return true;
        }),
    body('additional_remarks')
        .optional({ nullable: true })
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Additional remarks must not exceed 1000 characters.'),
    handleValidation
];

const locatorSlipIdValidator = [
    param('id').isUUID().withMessage('Locator slip ID must be a valid UUID.'),
    handleValidation
];

module.exports = {
    PURPOSE_OPTIONS,
    createLocatorSlipValidator,
    locatorSlipIdValidator
};
