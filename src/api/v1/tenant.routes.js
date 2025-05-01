const express = require('express');
const { check } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate, authorize, validateTenant } = require('../middleware/auth');
const tenantService = require('../../services/tenant.service');
const router = express.Router();

/**
 * @route GET /api/v1/tenants/:id
 * @desc Get tenant by ID
 * @access Private (Principal, BusinessHead)
 */
router.get(
    '/:id',
    authenticate,
    authorize(['Principal', 'BusinessHead']),
    validateTenant,
    async (req, res, next) => {
        try {
            const tenant = await tenantService.getTenantById(req.params.id);

            res.status(200).json({
                status: 'success',
                data: tenant,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route PUT /api/v1/tenants/:id
 * @desc Update tenant information
 * @access Private (Principal only)
 */
router.put(
    '/:id',
    authenticate,
    authorize(['Principal']),
    validateTenant,
    [
        check('name').optional().notEmpty().withMessage('Name cannot be empty'),
        check('domain').optional().notEmpty().withMessage('Domain cannot be empty'),
        check('contactEmail').optional().isEmail().withMessage('Valid contact email is required'),
        validate,
    ],
    async (req, res, next) => {
        try {
            const updatedTenant = await tenantService.updateTenant(req.params.id, req.body);

            res.status(200).json({
                status: 'success',
                message: 'Tenant updated successfully',
                data: updatedTenant,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route PUT /api/v1/tenants/:id/business-rules
 * @desc Update tenant business rules
 * @access Private (Principal, BusinessHead)
 */
router.put(
    '/:id/business-rules',
    authenticate,
    authorize(['Principal', 'BusinessHead']),
    validateTenant,
    [
        check('maxDiscountPercentage').optional().isNumeric().withMessage('Max discount must be a number'),
        check('floorRisePremium').optional().isNumeric().withMessage('Floor rise premium must be a number'),
        check('lockPeriodMinutes').optional().isInt().withMessage('Lock period must be an integer'),
        validate,
    ],
    async (req, res, next) => {
        try {
            const businessRules = await tenantService.updateBusinessRules(req.params.id, req.body);

            res.status(200).json({
                status: 'success',
                message: 'Business rules updated successfully',
                data: businessRules,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route PUT /api/v1/tenants/:id/subscription
 * @desc Update tenant subscription
 * @access Private (Principal only)
 */
router.put(
    '/:id/subscription',
    authenticate,
    authorize(['Principal']),
    validateTenant,
    [
        check('plan')
            .optional()
            .isIn(['Starter', 'Growth', 'Premium', 'Signature'])
            .withMessage('Invalid subscription plan'),
        check('expiresAt').optional().isISO8601().withMessage('Invalid date format'),
        validate,
    ],
    async (req, res, next) => {
        try {
            const subscription = await tenantService.updateSubscription(req.params.id, req.body);

            res.status(200).json({
                status: 'success',
                message: 'Subscription updated successfully',
                data: subscription,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route PUT /api/v1/tenants/:id/status
 * @desc Activate or deactivate tenant
 * @access Private (Principal only)
 */
router.put(
    '/:id/status',
    authenticate,
    authorize(['Principal']),
    validateTenant,
    [
        check('active').isBoolean().withMessage('Active status must be a boolean'),
        validate,
    ],
    async (req, res, next) => {
        try {
            const { active } = req.body;
            const tenant = await tenantService.setTenantStatus(req.params.id, active);

            res.status(200).json({
                status: 'success',
                message: `Tenant ${active ? 'activated' : 'deactivated'} successfully`,
                data: tenant,
            });
        } catch (error) {
            next(error);
        }
    }
);

module.exports = router;