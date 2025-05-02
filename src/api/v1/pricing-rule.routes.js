const express = require('express');
const { check } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate, authorize } = require('../middleware/auth');
const pricingRuleService = require('../../services/pricing-rule.service');
const router = express.Router();

/**
 * @route PUT /api/v1/pricing-rules/tenant/:tenantId
 * @desc Set tenant-wide pricing rules
 * @access Private (Principal only)
 */
router.put(
    '/tenant/:tenantId',
    authenticate,
    authorize(['Principal']),
    [
        check('pricingRules').isObject().withMessage('Pricing rules must be an object'),
        validate,
    ],
    async (req, res, next) => {
        try {
            // Verify user belongs to this tenant
            if (req.params.tenantId !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            const settings = await pricingRuleService.setTenantPricingRules(
                req.params.tenantId,
                req.body.pricingRules
            );

            res.status(200).json({
                status: 'success',
                message: 'Tenant pricing rules updated successfully',
                data: settings,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route PUT /api/v1/pricing-rules/project/:projectId
 * @desc Set project custom pricing model
 * @access Private (Principal, BusinessHead)
 */
router.put(
    '/project/:projectId',
    authenticate,
    authorize(['Principal', 'BusinessHead']),
    [
        check('customPricingModel').isObject().withMessage('Custom pricing model must be an object'),
        validate,
    ],
    async (req, res, next) => {
        try {
            // Verify project belongs to user's tenant
            const project = await require('../../services/project.service').getProjectById(req.params.projectId);

            if (project.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            const updatedProject = await pricingRuleService.setProjectPricingModel(
                req.params.projectId,
                req.body.customPricingModel
            );

            res.status(200).json({
                status: 'success',
                message: 'Project pricing model updated successfully',
                data: updatedProject,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route POST /api/v1/pricing-rules/unit-type
 * @desc Create or update unit type pricing rules
 * @access Private (Principal, BusinessHead)
 */
router.post(
    '/unit-type',
    authenticate,
    authorize(['Principal', 'BusinessHead']),
    [
        check('tenantId').notEmpty().withMessage('Tenant ID is required'),
        check('projectId').notEmpty().withMessage('Project ID is required'),
        check('unitType').notEmpty().withMessage('Unit type is required'),
        check('pricingRules').isObject().withMessage('Pricing rules must be an object'),
        validate,
    ],
    async (req, res, next) => {
        try {
            // Verify tenant ID matches user's tenant
            if (req.body.tenantId !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            // Verify project belongs to user's tenant
            const project = await require('../../services/project.service').getProjectById(req.body.projectId);

            if (project.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            const rule = await pricingRuleService.setUnitTypePricingRules(req.body);

            res.status(200).json({
                status: 'success',
                message: 'Unit type pricing rules updated successfully',
                data: rule,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route GET /api/v1/pricing-rules
 * @desc Get all applicable pricing rules for a context
 * @access Private (All roles)
 */
router.get(
    '/',
    authenticate,
    [
        check('tenantId').optional().isMongoId().withMessage('Invalid tenant ID'),
        check('projectId').optional().isMongoId().withMessage('Invalid project ID'),
        check('unitType').optional().isString().withMessage('Unit type must be a string'),
        validate,
    ],
    async (req, res, next) => {
        try {
            // Set tenant ID from authenticated user if not specified
            const context = {
                tenantId: req.query.tenantId || req.user.tenantId.toString(),
                projectId: req.query.projectId,
                unitType: req.query.unitType,
            };

            // Verify tenant ID matches user's tenant
            if (context.tenantId !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            // If project ID specified, verify it belongs to user's tenant
            if (context.projectId) {
                const project = await require('../../services/project.service').getProjectById(context.projectId);

                if (project.tenantId.toString() !== req.user.tenantId.toString()) {
                    return res.status(403).json({
                        status: 'error',
                        message: 'Access forbidden',
                    });
                }
            }

            const rules = await pricingRuleService.getPricingRules(context);

            res.status(200).json({
                status: 'success',
                data: rules,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route DELETE /api/v1/pricing-rules/unit-type/:id
 * @desc Delete unit type pricing rule
 * @access Private (Principal, BusinessHead)
 */
router.delete(
    '/unit-type/:id',
    authenticate,
    authorize(['Principal', 'BusinessHead']),
    async (req, res, next) => {
        try {
            // Verify rule belongs to user's tenant
            const rule = await require('../../models/unit-type-rule.model').findById(req.params.id);

            if (!rule) {
                return res.status(404).json({
                    status: 'error',
                    message: 'Rule not found',
                });
            }

            if (rule.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            await pricingRuleService.deleteUnitTypeRule(req.params.id);

            res.status(200).json({
                status: 'success',
                message: 'Unit type pricing rule deleted successfully',
            });
        } catch (error) {
            next(error);
        }
    }
);

module.exports = router;