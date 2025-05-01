const express = require('express');
const { check } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const authService = require('../../services/auth.service');
const router = express.Router();

/**
 * @route POST /api/v1/auth/register-tenant
 * @desc Register a new tenant with admin user
 * @access Public
 */
router.post(
    '/register-tenant',
    [
        // Tenant validation
        check('tenant.name').notEmpty().withMessage('Tenant name is required'),
        check('tenant.domain').notEmpty().withMessage('Domain is required'),
        check('tenant.contactEmail').isEmail().withMessage('Valid contact email is required'),

        // User validation
        check('user.name').notEmpty().withMessage('User name is required'),
        check('user.email').isEmail().withMessage('Valid email is required'),
        check('user.password')
            .isLength({ min: 8 })
            .withMessage('Password must be at least 8 characters long'),
        validate,
    ],
    async (req, res, next) => {
        try {
            const { tenant: tenantData, user: userData } = req.body;

            // Convert password to passwordHash
            userData.passwordHash = userData.password;
            delete userData.password;

            const result = await authService.registerTenant(tenantData, userData);

            res.status(201).json({
                status: 'success',
                message: 'Tenant registered successfully',
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route POST /api/v1/auth/login
 * @desc Login a user
 * @access Public
 */
router.post(
    '/login',
    [
        check('email').isEmail().withMessage('Valid email is required'),
        check('password').notEmpty().withMessage('Password is required'),
        validate,
    ],
    async (req, res, next) => {
        try {
            const { email, password } = req.body;
            const result = await authService.login(email, password);

            res.status(200).json({
                status: 'success',
                message: 'Login successful',
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route POST /api/v1/auth/refresh
 * @desc Refresh authentication tokens
 * @access Public
 */
router.post(
    '/refresh',
    [
        check('refreshToken').notEmpty().withMessage('Refresh token is required'),
        validate,
    ],
    async (req, res, next) => {
        try {
            const { refreshToken } = req.body;
            const tokens = await authService.refreshAuth(refreshToken);

            res.status(200).json({
                status: 'success',
                message: 'Token refreshed successfully',
                data: tokens,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route POST /api/v1/auth/logout
 * @desc Logout a user
 * @access Private
 */
router.post('/logout', authenticate, async (req, res, next) => {
    try {
        await authService.logout(req.user.id);

        res.status(200).json({
            status: 'success',
            message: 'Logged out successfully',
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route PUT /api/v1/auth/change-password
 * @desc Change user password
 * @access Private
 */
router.put(
    '/change-password',
    authenticate,
    [
        check('currentPassword').notEmpty().withMessage('Current password is required'),
        check('newPassword')
            .isLength({ min: 8 })
            .withMessage('New password must be at least 8 characters long'),
        validate,
    ],
    async (req, res, next) => {
        try {
            const { currentPassword, newPassword } = req.body;
            await authService.changePassword(req.user.id, currentPassword, newPassword);

            res.status(200).json({
                status: 'success',
                message: 'Password changed successfully',
            });
        } catch (error) {
            next(error);
        }
    }
);

module.exports = router;