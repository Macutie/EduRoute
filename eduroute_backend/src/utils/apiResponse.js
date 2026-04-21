const successResponse = (message, data = null) => ({
    success: true,
    message,
    data
});

const errorResponse = (message, errors = []) => ({
    success: false,
    message,
    errors
});

module.exports = {
    successResponse,
    errorResponse
};