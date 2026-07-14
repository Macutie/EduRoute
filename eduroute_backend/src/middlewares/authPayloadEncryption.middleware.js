const AppError = require('../utils/appError');
const { decryptAuthPayloadEnvelope } = require('../utils/authPayloadEncryption');

const decryptSensitivePayload = (req, res, next) => {
    if (!req.body?.encryptedPayload) {
        return next(new AppError('Encrypted sensitive payload is required.', 400));
    }

    try {
        req.body = decryptAuthPayloadEnvelope(req.body);
        return next();
    } catch (error) {
        return next(new AppError('Encrypted sensitive payload could not be decrypted.', 400));
    }
};

const decryptMultipartSensitivePayload = (req, res, next) => {
    if (!req.body?.encryptedPayload) {
        return next(new AppError('Encrypted sensitive payload is required.', 400));
    }

    try {
        const encryptedPayload = typeof req.body.encryptedPayload === 'string'
            ? JSON.parse(req.body.encryptedPayload)
            : req.body.encryptedPayload;
        const decryptedPayload = decryptAuthPayloadEnvelope({ encryptedPayload });

        delete req.body.encryptedPayload;
        req.body = {
            ...req.body,
            ...decryptedPayload
        };

        return next();
    } catch (error) {
        return next(new AppError('Encrypted multipart payload could not be decrypted.', 400));
    }
};

module.exports = {
    decryptAuthPayload: decryptSensitivePayload,
    decryptSensitivePayload,
    decryptMultipartSensitivePayload
};
