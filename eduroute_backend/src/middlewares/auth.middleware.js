const AppError = require('../utils/appError');
const { verifyAccessToken } = require('../utils/jwt');

const protect = (req, res, next) => {
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
        return next(new AppError('Unauthorized', 401));
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = verifyAccessToken(token);
        req.user = decoded;
        return next();
    } catch (error) {
        return next(new AppError('Invalid or expired token', 401));
    }
};

module.exports = {
    protect
};