// src/utils/api-error.js

/**
 * Custom API Error class
 */
class ApiError extends Error {
    /**
     * Create an API error
     * @param {number} statusCode - HTTP status code
     * @param {string} message - Error message
     * @param {boolean} isOperational - Whether the error is operational or programming
     * @param {Object} details - Additional error details
     */
    constructor(statusCode, message, isOperational = true, details = {}) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.details = details;

        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = ApiError;