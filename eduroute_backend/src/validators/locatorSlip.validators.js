const { body, param, validationResult } = require('express-validator');
const AppError = require('../utils/appError');

const PURPOSE_OPTIONS = [
    'Official Meeting/Conference',
    'Submission/Retrieval of Documents',
    'Coordination/Consultation',
    'Field Inspection/Monitoring',
    'Others',
    'Personal'
];

const CANCELLATION_REASON_OPTIONS = [
    'change_of_schedule',
    'trip_no_longer_needed',
    'meeting_event_cancelled',
    'incorrect_locator_slip_details'
];

const WORKING_HOURS_START_MINUTES = 7 * 60;
const WORKING_HOURS_END_MINUTES = 21 * 60;
const WORKING_HOURS_ERROR = 'Locator slips can only be scheduled between 7:00 AM and 9:00 PM. Times from 9:01 PM to 6:59 AM are outside working hours.';

const getLocalMinutesFromDateTimeInput = (value) => {
    const normalized = String(value || '').trim();
    const match = normalized.match(/T(\d{2}):(\d{2})/);

    if (match) {
        return Number(match[1]) * 60 + Number(match[2]);
    }

    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return null;

    return date.getHours() * 60 + date.getMinutes();
};

const isWithinWorkingHours = (value) => {
    const minutes = getLocalMinutesFromDateTimeInput(value);
    if (minutes === null) return true;

    return minutes >= WORKING_HOURS_START_MINUTES && minutes <= WORKING_HOURS_END_MINUTES;
};

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
            if ((req.body.purpose_of_travel === 'Others' || req.body.purpose_of_travel === 'Personal') && !value) {
                throw new Error('Please specify your purpose.');
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

            if (!isWithinWorkingHours(value)) {
                throw new Error(WORKING_HOURS_ERROR);
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

            if (!isWithinWorkingHours(value)) {
                throw new Error(WORKING_HOURS_ERROR);
            }

            return true;
        }),
    body('additional_remarks')
        .optional({ nullable: true })
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Additional remarks must not exceed 1000 characters.'),
    body('is_urgent')
        .optional()
        .isBoolean()
        .withMessage('Urgent matter must be true or false.'),
    handleValidation
];

const locatorSlipIdValidator = [
    param('id').isUUID().withMessage('Locator slip ID must be a valid UUID.'),
    handleValidation
];

const cancelLocatorSlipValidator = [
    body('cancellation_reason')
        .trim()
        .notEmpty()
        .withMessage('Cancellation reason is required.')
        .isIn(CANCELLATION_REASON_OPTIONS)
        .withMessage('Cancellation reason is invalid.'),
    handleValidation
];

module.exports = {
    PURPOSE_OPTIONS,
    CANCELLATION_REASON_OPTIONS,
    createLocatorSlipValidator,
    locatorSlipIdValidator,
    cancelLocatorSlipValidator
};
