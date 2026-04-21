class AppError extends Error {
    constructor(message, statusCode = 500, errors = []) {
        super(message);
        this.statusCode = statusCode;
        this.errors = errors;
        this.isOperational = true;
    }
}

module.exports = AppError;