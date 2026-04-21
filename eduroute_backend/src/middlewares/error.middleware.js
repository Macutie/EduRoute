const { errorResponse } = require('../utils/apiResponse');

const notFoundHandler = (req, res) => {
    return res.status(404).json(errorResponse('Route not found'));
};

const errorHandler = (error, req, res, next) => {
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