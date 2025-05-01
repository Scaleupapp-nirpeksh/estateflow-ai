const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('../models/user.model');
const Tenant = require('../models/tenant.model');
const { ApiError } = require('../utils/error-handler');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Generate JWT tokens for a user
 * @param {Object} user - User object
 * @returns {Object} - Access and refresh tokens
 */
const generateTokens = (user) => {
    // Create access token
    const accessToken = jwt.sign(
        {
            sub: user._id,
            email: user.email,
            role: user.role,
            tenantId: user.tenantId,
        },
        config.jwt.secret,
        {
            expiresIn: config.jwt.accessExpirationMinutes,
        }
    );

    // Create refresh token with longer expiration
    const refreshToken = jwt.sign(
        {
            sub: user._id,
            type: 'refresh',
        },
        config.jwt.secret,
        {
            expiresIn: config.jwt.refreshExpirationDays,
        }
    );

    // Calculate expiration date for refresh token
    const refreshExpires = new Date();
    refreshExpires.setDate(
        refreshExpires.getDate() + parseInt(config.jwt.refreshExpirationDays, 10)
    );

    return {
        accessToken,
        refreshToken,
        refreshExpires,
    };
};

/**
 * Register a new tenant and admin user
 * @param {Object} tenantData - Tenant information
 * @param {Object} userData - User information
 * @returns {Object} - Created tenant and user
 */
const registerTenant = async (tenantData, userData) => {
    try {
        // Check if tenant with this domain already exists
        const existingTenant = await Tenant.findOne({ domain: tenantData.domain });
        if (existingTenant) {
            throw new ApiError(400, 'Tenant with this domain already exists');
        }

        // Check if user with this email already exists
        const existingUser = await User.findOne({ email: userData.email });
        if (existingUser) {
            throw new ApiError(400, 'User with this email already exists');
        }

        // Create new tenant
        const tenant = new Tenant(tenantData);
        const savedTenant = await tenant.save();

        // Create admin user for the tenant
        const user = new User({
            ...userData,
            tenantId: savedTenant._id,
            role: 'Principal', // Default admin role
        });

        const savedUser = await user.save();

        return {
            tenant: savedTenant,
            user: {
                _id: savedUser._id,
                name: savedUser.name,
                email: savedUser.email,
                role: savedUser.role,
                tenantId: savedUser.tenantId,
            },
        };
    } catch (error) {
        logger.error('Error registering tenant', { error });
        throw error;
    }
};

/**
 * Login a user
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Object} - User and tokens
 */
const login = async (email, password) => {
    try {
        // Find user by email
        const user = await User.findOne({ email }).select('+passwordHash');

        if (!user) {
            throw new ApiError(401, 'Invalid email or password');
        }

        // Check if user is active
        if (!user.active) {
            throw new ApiError(401, 'Account is disabled');
        }

        // Verify password
        const isPasswordMatch = await user.isPasswordMatch(password);
        if (!isPasswordMatch) {
            throw new ApiError(401, 'Invalid email or password');
        }

        // Generate tokens
        const tokens = generateTokens(user);

        // Update user's refresh token and last login
        user.refreshToken = {
            token: tokens.refreshToken,
            expiresAt: tokens.refreshExpires,
        };
        user.lastLogin = new Date();
        await user.save();

        // Get tenant information
        const tenant = await Tenant.findById(user.tenantId);

        // Return user info and tokens
        return {
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                tenantId: user.tenantId,
            },
            tenant: {
                _id: tenant._id,
                name: tenant.name,
                logo: tenant.logo,
            },
            tokens: {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
            },
        };
    } catch (error) {
        logger.error('Error during login', { error });
        throw error;
    }
};

/**
 * Refresh authentication tokens
 * @param {string} refreshToken - Refresh token
 * @returns {Object} - New access and refresh tokens
 */
const refreshAuth = async (refreshToken) => {
    try {
        // Verify refresh token
        let decoded;
        try {
            decoded = jwt.verify(refreshToken, config.jwt.secret);
        } catch (error) {
            throw new ApiError(401, 'Invalid refresh token');
        }

        // Find user by ID
        const user = await User.findById(decoded.sub);
        if (!user) {
            throw new ApiError(401, 'User not found');
        }

        // Verify stored refresh token matches
        if (!user.refreshToken || user.refreshToken.token !== refreshToken) {
            throw new ApiError(401, 'Refresh token not found or mismatched');
        }

        // Check if refresh token is expired
        if (user.refreshToken.expiresAt < new Date()) {
            throw new ApiError(401, 'Refresh token expired');
        }

        // Generate new tokens
        const tokens = generateTokens(user);

        // Update user's refresh token
        user.refreshToken = {
            token: tokens.refreshToken,
            expiresAt: tokens.refreshExpires,
        };
        await user.save();

        return {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
        };
    } catch (error) {
        logger.error('Error refreshing auth', { error });
        throw error;
    }
};

/**
 * Logout a user
 * @param {string} userId - User ID
 * @returns {boolean} - Success status
 */
const logout = async (userId) => {
    try {
        // Find user and clear refresh token
        const user = await User.findByIdAndUpdate(
            userId,
            {
                refreshToken: {
                    token: null,
                    expiresAt: null,
                },
            },
            { new: true }
        );

        if (!user) {
            throw new ApiError(404, 'User not found');
        }

        return true;
    } catch (error) {
        logger.error('Error during logout', { error });
        throw error;
    }
};

/**
 * Change user password
 * @param {string} userId - User ID
 * @param {string} currentPassword - Current password
 * @param {string} newPassword - New password
 * @returns {boolean} - Success status
 */
const changePassword = async (userId, currentPassword, newPassword) => {
    try {
        // Find user
        const user = await User.findById(userId).select('+passwordHash');
        if (!user) {
            throw new ApiError(404, 'User not found');
        }

        // Verify current password
        const isPasswordMatch = await user.isPasswordMatch(currentPassword);
        if (!isPasswordMatch) {
            throw new ApiError(401, 'Current password is incorrect');
        }

        // Update password
        user.passwordHash = newPassword;
        await user.save();

        return true;
    } catch (error) {
        logger.error('Error changing password', { error });
        throw error;
    }
};

module.exports = {
    registerTenant,
    login,
    refreshAuth,
    logout,
    changePassword,
};