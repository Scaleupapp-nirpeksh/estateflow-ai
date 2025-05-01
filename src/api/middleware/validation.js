const { validationResult } = require('express-validator');
const { ApiError } = require('../../utils/error-handler');

/**
 * Middleware to handle express-validator validation results
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map((error) => error.msg);
    return next(new ApiError(400, 'Validation error', true, {
      errors: errorMessages,
    }));
  }
  
  next();
};

/**
 * Create reusable validation chains for common fields
 */
const validations = {
  // Tenant validations
  tenantName: {
    in: ['body'],
    isString: true,
    notEmpty: true,
    trim: true,
    errorMessage: 'Tenant name is required',
  },
  tenantDomain: {
    in: ['body'],
    isString: true,
    notEmpty: true,
    trim: true,
    errorMessage: 'Tenant domain is required',
  },
  
  // User validations
  email: {
    in: ['body'],
    isEmail: true,
    normalizeEmail: true,
    errorMessage: 'Must provide a valid email address',
  },
  password: {
    in: ['body'],
    isLength: {
      options: { min: 8 },
      errorMessage: 'Password must be at least 8 characters long',
    },
  },
  name: {
    in: ['body'],
    isString: true,
    notEmpty: true,
    trim: true,
    errorMessage: 'Name is required',
  },
  
  // Common validations
  objectId: {
    in: ['params', 'body'],
    isMongoId: true,
    errorMessage: 'Must provide a valid ID',
  },
};

module.exports = {
  validate,
  validations,
};