const multer = require('multer');
const AppError = require('../utils/appError');

const storage = multer.memoryStorage();

const imageFileFilter = (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
        return cb(new AppError('Only image files are allowed.', 422));
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

module.exports = {
    uploadProfileImage
};
