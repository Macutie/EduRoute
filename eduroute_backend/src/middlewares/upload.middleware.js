const multer = require('multer');
const AppError = require('../utils/appError');
const { ALLOWED_IMAGE_MIME_TYPES } = require('../services/imageOptimization.service');

const storage = multer.memoryStorage();

const imageFileFilter = (req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
        return cb(new AppError('Invalid image type. Only JPG, JPEG, PNG, and WebP files are allowed.', 422));
    }

    return cb(null, true);
};

const uploadProfileImage = multer({
    storage,
    fileFilter: imageFileFilter,
    limits: {
        fileSize: 3 * 1024 * 1024
    }
});

const uploadLocationVerificationImage = multer({
    storage,
    fileFilter: imageFileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024
    }
});

module.exports = {
    uploadProfileImage,
    uploadLocationVerificationImage
};
