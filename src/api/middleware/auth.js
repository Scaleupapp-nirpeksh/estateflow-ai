const jwt = require('jsonwebtoken');
const { ApiError } = require('../../utils/error-handler');
const config = require('../../config');

/**
 * Authentication middleware to validate JWT tokens
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(401, 'Authentication required');
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      throw new ApiError(401, 'Authentication token missing');
    }
    
    try {
      // Verify token
      const decoded = jwt.verify(token, config.jwt.secret);
      
      // Add user and tenant info to request
      req.user = {
        id: decoded.sub,
        role: decoded.role,
        tenantId: decoded.tenantId,
      };
      
      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new ApiError(401, 'Token expired');
      }
      
      throw new ApiError(401, 'Invalid token');
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Role-based authorization middleware
 * @param {Array} roles - Allowed roles for the route
 */
const authorize = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, 'User not authenticated'));
    }
    
    if (roles.length && !roles.includes(req.user.role)) {
      return next(new ApiError(403, 'Insufficient permissions'));
    }
    
    next();
  };
};

/**
 * Tenant middleware to ensure user belongs to the tenant
 */
const validateTenant = (req, res, next) => {
  try {
    const { tenantId } = req.params;
    
    if (!req.user) {
      throw new ApiError(401, 'User not authenticated');
    }
    
    if (tenantId && req.user.tenantId !== tenantId) {
      throw new ApiError(403, 'Access to this tenant is forbidden');
    }
    
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  authenticate,
  authorize,
  validateTenant,
};