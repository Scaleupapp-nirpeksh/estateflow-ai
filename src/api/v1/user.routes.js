const express = require('express');
const { check, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate, authorize } = require('../middleware/auth');
const userService = require('../../services/user.service');
const router = express.Router();

/**
 * @route POST /api/v1/users
 * @desc Create a new user
 * @access Private (Principal, BusinessHead, SalesDirector)
 */
router.post(
    '/',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector']),
    [
        check('name').notEmpty().withMessage('Name is required'),
        check('email').isEmail().withMessage('Valid email is required'),
        check('password')
            .isLength({ min: 8 })
            .withMessage('Password must be at least 8 characters long'),
        check('role')
            .isIn([
                'Principal',
                'BusinessHead',
                'SalesDirector',
                'SeniorAgent',
                'JuniorAgent',
                'CollectionsManager',
                'FinanceManager',
                'DocumentController',
                'ExternalAuditor',
            ])
            .withMessage('Invalid role'),
        check('tenantId').notEmpty().withMessage('Tenant ID is required'),
        validate,
    ],
    async (req, res, next) => {
        try {
            // Set tenant ID from authenticated user if not specified
            if (!req.body.tenantId) {
                req.body.tenantId = req.user.tenantId;
            }

            // Convert password to passwordHash
            req.body.passwordHash = req.body.password;
            delete req.body.password;

            const user = await userService.createUser(req.body);

            res.status(201).json({
                status: 'success',
                message: 'User created successfully',
                data: user,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route POST /api/v1/users/bulk
 * @desc Create multiple users at once
 * @access Private (Principal, BusinessHead, SalesDirector)
 */
router.post(
    '/bulk',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector']),
    [
        check('users').isArray({ min: 1 }).withMessage('At least one user is required'),
        check('users.*.name').notEmpty().withMessage('Name is required for all users'),
        check('users.*.email').isEmail().withMessage('Valid email is required for all users'),
        check('users.*.password')
            .isLength({ min: 8 })
            .withMessage('Password must be at least 8 characters long for all users'),
        check('users.*.role')
            .isIn([
                'Principal',
                'BusinessHead',
                'SalesDirector',
                'SeniorAgent',
                'JuniorAgent',
                'CollectionsManager',
                'FinanceManager',
                'DocumentController',
                'ExternalAuditor',
            ])
            .withMessage('Invalid role for one or more users'),
        validate,
    ],
    async (req, res, next) => {
        try {
            const { users } = req.body;

            // Prevent creating Principal users through bulk creation unless user is Principal
            if (req.user.role !== 'Principal') {
                const hasPrincipal = users.some(user => user.role === 'Principal');
                if (hasPrincipal) {
                    return res.status(403).json({
                        status: 'error',
                        message: 'Only Principals can create other Principal users',
                    });
                }
            }

            const createdUsers = await userService.bulkCreateUsers(users, req.user.tenantId);

            res.status(201).json({
                status: 'success',
                message: `${createdUsers.length} users created successfully`,
                data: createdUsers,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route GET /api/v1/users
 * @desc Get all users for the tenant
 * @access Private (All roles)
 */
router.get(
    '/',
    authenticate,
    [
        query('role').optional().isString().withMessage('Role must be a string'),
        query('active').optional().isBoolean().withMessage('Active status must be a boolean'),
        validate,
    ],
    async (req, res, next) => {
        try {
            // Extract query parameters
            const filters = {
                role: req.query.role,
                active: req.query.active !== undefined ? req.query.active === 'true' : undefined,
            };

            const users = await userService.getUsers(req.user.tenantId, filters);

            res.status(200).json({
                status: 'success',
                data: users,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route GET /api/v1/users/:id
 * @desc Get user by ID
 * @access Private (All roles)
 */
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const user = await userService.getUserById(req.params.id);

        // Check if user belongs to the same tenant
        if (user.tenantId.toString() !== req.user.tenantId.toString()) {
            return res.status(403).json({
                status: 'error',
                message: 'Access forbidden',
            });
        }

        res.status(200).json({
            status: 'success',
            data: user,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route PUT /api/v1/users/:id
 * @desc Update user
 * @access Private (Principal, BusinessHead, SalesDirector, or self)
 */
router.put(
    '/:id',
    authenticate,
    [
        check('name').optional().notEmpty().withMessage('Name cannot be empty'),
        check('email').optional().isEmail().withMessage('Valid email is required'),
        check('role')
            .optional()
            .isIn([
                'Principal',
                'BusinessHead',
                'SalesDirector',
                'SeniorAgent',
                'JuniorAgent',
                'CollectionsManager',
                'FinanceManager',
                'DocumentController',
                'ExternalAuditor',
            ])
            .withMessage('Invalid role'),
        validate,
    ],
    async (req, res, next) => {
        try {
            // Check if user is authorized to update this user
            const user = await userService.getUserById(req.params.id);

            // Check if user belongs to the same tenant
            if (user.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            // Only allow self-update or users with management roles
            const canUpdate =
                req.user.id === req.params.id ||
                ['Principal', 'BusinessHead', 'SalesDirector'].includes(req.user.role);

            if (!canUpdate) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Insufficient permissions',
                });
            }

            // Only principals can change roles
            if (req.body.role && req.user.role !== 'Principal') {
                return res.status(403).json({
                    status: 'error',
                    message: 'Only principals can change roles',
                });
            }

            const updatedUser = await userService.updateUser(req.params.id, req.body);

            res.status(200).json({
                status: 'success',
                message: 'User updated successfully',
                data: updatedUser,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route PUT /api/v1/users/:id/permissions
 * @desc Update user permissions
 * @access Private (Principal, BusinessHead)
 */
router.put(
    '/:id/permissions',
    authenticate,
    authorize(['Principal', 'BusinessHead']),
    [
        check('maxDiscountPercentage').optional().isNumeric().withMessage('Max discount must be a number'),
        check('approvalThreshold').optional().isNumeric().withMessage('Approval threshold must be a number'),
        validate,
    ],
    async (req, res, next) => {
        try {
            // Check if user belongs to the same tenant
            const user = await userService.getUserById(req.params.id);

            if (user.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            const permissions = await userService.updateUserPermissions(req.params.id, req.body);

            res.status(200).json({
                status: 'success',
                message: 'Permissions updated successfully',
                data: permissions,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route PUT /api/v1/users/:id/status
 * @desc Activate or deactivate user
 * @access Private (Principal, BusinessHead)
 */
router.put(
    '/:id/status',
    authenticate,
    authorize(['Principal', 'BusinessHead']),
    [
        check('active').isBoolean().withMessage('Active status must be a boolean'),
        validate,
    ],
    async (req, res, next) => {
        try {
            // Check if user belongs to the same tenant
            const user = await userService.getUserById(req.params.id);

            if (user.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            const { active } = req.body;
            const updatedUser = await userService.setUserStatus(req.params.id, active);

            res.status(200).json({
                status: 'success',
                message: `User ${active ? 'activated' : 'deactivated'} successfully`,
                data: updatedUser,
            });
        } catch (error) {
            next(error);
        }
    }
);

module.exports = router;