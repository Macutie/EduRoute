const { errorResponse } = require('../utils/apiResponse');

const notFoundHandler = (req, res) => {
    return res.status(404).json(errorResponse('Route not found'));
};

const errorHandler = (error, req, res, next) => {
    if (error.code === 'LIMIT_FILE_SIZE') {
        const maxSize = req.originalUrl.includes('/verify-location') ? '10MB' : '3MB';
        return res.status(413).json(
            errorResponse(`Image is too large. Maximum file size is ${maxSize}.`, [])
        );
    }

    const statusCode = error.statusCode || 500;

    if (process.env.NODE_ENV !== 'production') {
        console.error(error);
    }

    return res.status(statusCode).json(
        errorResponse(error.message || 'Internal server error', error.errors || [])
    );
};

module.exports = {
    notFoundHandler,
    errorHandler
};
