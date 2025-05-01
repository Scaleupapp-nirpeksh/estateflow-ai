const logger = require('./logger');

/**
 * Custom API Error class
 */
class ApiError extends Error {
  constructor(statusCode, message, isOperational = true, stack = '') {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Handle 404 not found errors
 */
const notFoundHandler = (req, res, next) => {
  const error = new ApiError(404, `Not Found - ${req.originalUrl}`);
  next(error);
};

/**
 * Central error handler middleware
 */
const errorHandler = (err, req, res, _next) => {
  let { statusCode, message } = err;
  
  // Default to 500 if no status code is set
  if (!statusCode) statusCode = 500;
  
  // Set message for 500 errors
  if (statusCode === 500) {
    message = 'Internal Server Error';
  }
  
  // Log error
  if (statusCode === 500) {
    logger.error(err.message, {
      error: err,
      requestId: req.id,
      url: req.originalUrl,
      method: req.method,
    });
  } else {
    logger.warn(err.message, {
      error: err,
      requestId: req.id,
      url: req.originalUrl,
      method: req.method,
    });
  }
  
  // Response
  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = {
  ApiError,
  notFoundHandler,
  errorHandler,
};