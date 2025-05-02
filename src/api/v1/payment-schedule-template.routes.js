// src/api/v1/payment-schedule-template.routes.js

const express = require('express');
const { check, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate, authorize } = require('../middleware/auth');
const paymentScheduleService = require('../../services/payment-schedule.service');
const router = express.Router();

/**
 * @route POST /api/v1/payment-schedule-templates
 * @desc Create payment schedule template
 * @access Private (Management roles)
 */
router.post(
    '/',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector']),
    [
        check('name').notEmpty().withMessage('Template name is required'),
        check('installments').isArray({ min: 1 }).withMessage('At least one installment is required'),
        check('installments.*.name').notEmpty().withMessage('Installment name is required'),
        check('installments.*.percentage').optional().isNumeric().withMessage('Percentage must be a number'),
        check('installments.*.amount').optional().isNumeric().withMessage('Amount must be a number'),
        check('projectId').optional().isMongoId().withMessage('Invalid project ID'),
        check('isDefault').optional().isBoolean(),
        validate,
    ],
    async (req, res, next) => {
        try {
            // Prepare template data
            const templateData = {
                tenantId: req.user.tenantId,
                name: req.body.name,
                description: req.body.description,
                projectId: req.body.projectId,
                installments: req.body.installments,
                isDefault: req.body.isDefault,
                userId: req.user.id,
            };

            const template = await paymentScheduleService.createPaymentScheduleTemplate(templateData);

            res.status(201).json({
                status: 'success',
                message: 'Payment schedule template created successfully',
                data: template,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route GET /api/v1/payment-schedule-templates
 * @desc Get payment schedule templates
 * @access Private (All roles)
 */
router.get(
    '/',
    authenticate,
    [
        query('projectId').optional().isMongoId().withMessage('Invalid project ID'),
        query('isDefault').optional().isBoolean().withMessage('isDefault must be a boolean'),
        validate,
    ],
    async (req, res, next) => {
        try {
            // Extract query parameters
            const filters = {
                projectId: req.query.projectId,
            };

            // Handle isDefault parameter - convert string to boolean
            if (req.query.isDefault !== undefined) {
                filters.isDefault = req.query.isDefault === 'true';
            }

            // Ensure we're using the tenant ID from the authenticated user
            const tenantId = req.user.tenantId;

            console.log('Fetching templates for tenant:', tenantId, 'with filters:', filters);

            const templates = await paymentScheduleService.getPaymentScheduleTemplates(
                tenantId,
                filters
            );

            console.log('Templates found:', templates.length);

            res.status(200).json({
                status: 'success',
                data: templates,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route GET /api/v1/payment-schedule-templates/:id
 * @desc Get payment schedule template by ID
 * @access Private (All roles)
 */
router.get(
    '/:id',
    authenticate,
    async (req, res, next) => {
        try {
            const template = await paymentScheduleService.getPaymentScheduleTemplateById(req.params.id);

            // Check if template belongs to the user's tenant
            if (template.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            res.status(200).json({
                status: 'success',
                data: template,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route PUT /api/v1/payment-schedule-templates/:id
 * @desc Update payment schedule template
 * @access Private (Management roles)
 */
router.put(
    '/:id',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector']),
    [
        check('name').optional().notEmpty().withMessage('Name cannot be empty'),
        check('installments').optional().isArray({ min: 1 }).withMessage('At least one installment is required'),
        check('projectId').optional().isMongoId().withMessage('Invalid project ID'),
        check('isDefault').optional().isBoolean(),
        validate,
    ],
    async (req, res, next) => {
        try {
            const template = await paymentScheduleService.getPaymentScheduleTemplateById(req.params.id);

            // Check if template belongs to the user's tenant
            if (template.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            // Prepare update data
            const updateData = {
                userId: req.user.id,
            };

            // Copy specified fields
            ['name', 'description', 'projectId', 'isDefault', 'installments'].forEach(field => {
                if (req.body[field] !== undefined) {
                    updateData[field] = req.body[field];
                }
            });

            const updatedTemplate = await paymentScheduleService.updatePaymentScheduleTemplate(
                req.params.id,
                updateData
            );

            res.status(200).json({
                status: 'success',
                message: 'Payment schedule template updated successfully',
                data: updatedTemplate,
            });
        } catch (error) {
            next(error);
        }
    }
);
/**
 * @route DELETE /api/v1/payment-schedule-templates/:id
 * @desc Delete payment schedule template
 * @access Private (Management roles)
 */
router.delete(
    '/:id',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector']),
    async (req, res, next) => {
        try {
            const template = await paymentScheduleService.getPaymentScheduleTemplateById(req.params.id);

            // Check if template belongs to the user's tenant
            if (template.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            await paymentScheduleService.deletePaymentScheduleTemplate(req.params.id);

            res.status(200).json({
                status: 'success',
                message: 'Payment schedule template deleted successfully',
            });
        } catch (error) {
            next(error);
        }
    }
);

module.exports = router;