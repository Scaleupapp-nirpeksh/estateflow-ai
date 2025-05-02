// src/api/v1/lead.routes.js

const express = require('express');
const { check, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate, authorize } = require('../middleware/auth');
const leadService = require('../../services/lead.service');
const router = express.Router();

/**
 * @route POST /api/v1/leads
 * @desc Create a new lead
 * @access Private (All sales roles)
 */
router.post(
    '/',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector', 'SeniorAgent', 'JuniorAgent']),
    [
        check('fullName').notEmpty().withMessage('Full name is required'),
        check('phone').notEmpty().withMessage('Phone number is required'),
        check('tenantId').notEmpty().withMessage('Tenant ID is required'),
        check('status')
            .optional()
            .isIn(['new', 'contacted', 'qualified', 'negotiation', 'converted', 'lost'])
            .withMessage('Invalid status'),
        check('source')
            .optional()
            .isIn(['website', 'referral', 'walk-in', 'advertisement', 'social', 'partner', 'other'])
            .withMessage('Invalid source'),
        check('priority')
            .optional()
            .isIn(['low', 'medium', 'high', 'urgent'])
            .withMessage('Invalid priority'),
        validate,
    ],
    async (req, res, next) => {
        try {
            // Set tenant ID from authenticated user if not specified
            if (!req.body.tenantId) {
                req.body.tenantId = req.user.tenantId;
            }

            // Validate tenant ID matches authenticated user's tenant
            if (req.body.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Cannot create lead for another tenant',
                });
            }

            const lead = await leadService.createLead(req.body);

            res.status(201).json({
                status: 'success',
                message: 'Lead created successfully',
                data: lead,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route GET /api/v1/leads
 * @desc Get leads with filtering and pagination
 * @access Private (All sales roles)
 */
router.get(
    '/',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector', 'SeniorAgent', 'JuniorAgent', 'CollectionsManager']),
    [
        query('status').optional().isIn(['new', 'contacted', 'qualified', 'negotiation', 'converted', 'lost']).withMessage('Invalid status'),
        query('source').optional().isIn(['website', 'referral', 'walk-in', 'advertisement', 'social', 'partner', 'other']).withMessage('Invalid source'),
        query('priority').optional().isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid priority'),
        query('assignedTo').optional().isMongoId().withMessage('Invalid user ID'),
        query('projectId').optional().isMongoId().withMessage('Invalid project ID'),
        query('minBudget').optional().isNumeric().withMessage('Min budget must be a number'),
        query('maxBudget').optional().isNumeric().withMessage('Max budget must be a number'),
        query('fromDate').optional().isISO8601().withMessage('Invalid from date'),
        query('toDate').optional().isISO8601().withMessage('Invalid to date'),
        query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
        query('sort').optional().isIn(['name_asc', 'name_desc', 'priority_high', 'oldest', 'newest']).withMessage('Invalid sort option'),
        validate,
    ],
    async (req, res, next) => {
        try {
            // Extract query parameters for filtering
            const filters = {
                status: req.query.status,
                source: req.query.source,
                priority: req.query.priority,
                assignedTo: req.query.assignedTo,
                projectId: req.query.projectId,
                search: req.query.search,
                minBudget: req.query.minBudget,
                maxBudget: req.query.maxBudget,
                fromDate: req.query.fromDate,
                toDate: req.query.toDate,
                unitType: req.query.unitType,
                sort: req.query.sort,
            };

            // Extract pagination parameters
            const pagination = {
                page: parseInt(req.query.page, 10) || 1,
                limit: parseInt(req.query.limit, 10) || 10,
            };

            // If user is a junior or senior agent, only show their leads unless higher role
            if (['JuniorAgent', 'SeniorAgent'].includes(req.user.role) && !['Principal', 'BusinessHead', 'SalesDirector'].includes(req.user.role)) {
                filters.assignedTo = req.user.id;
            }

            const leads = await leadService.getLeads(req.user.tenantId, filters, pagination);

            res.status(200).json({
                status: 'success',
                data: leads.data,
                pagination: leads.pagination,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route GET /api/v1/leads/statistics
 * @desc Get lead statistics for the tenant
 * @access Private (Principal, BusinessHead, SalesDirector)
 */
router.get(
    '/statistics',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector']),
    async (req, res, next) => {
        try {
            const statistics = await leadService.getLeadStatistics(req.user.tenantId);

            res.status(200).json({
                status: 'success',
                data: statistics,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route GET /api/v1/leads/:id
 * @desc Get lead details
 * @access Private (All sales roles)
 */
router.get(
    // src/api/v1/lead.routes.js (continued)

    '/:id',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector', 'SeniorAgent', 'JuniorAgent', 'CollectionsManager']),
    async (req, res, next) => {
        try {
            const lead = await leadService.getLeadById(req.params.id);

            // Check if lead belongs to the user's tenant
            if (lead.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            // If user is agent, check if they are assigned to this lead
            if (['JuniorAgent', 'SeniorAgent'].includes(req.user.role)) {
                if (!lead.assignedTo || lead.assignedTo._id.toString() !== req.user.id) {
                    return res.status(403).json({
                        status: 'error',
                        message: 'You do not have access to this lead',
                    });
                }
            }

            res.status(200).json({
                status: 'success',
                data: lead,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route PUT /api/v1/leads/:id
 * @desc Update lead details
 * @access Private (All sales roles)
 */
router.put(
    '/:id',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector', 'SeniorAgent', 'JuniorAgent']),
    [
        check('fullName').optional().notEmpty().withMessage('Full name cannot be empty'),
        check('phone').optional().notEmpty().withMessage('Phone number cannot be empty'),
        check('status')
            .optional()
            .isIn(['new', 'contacted', 'qualified', 'negotiation', 'converted', 'lost'])
            .withMessage('Invalid status'),
        check('source')
            .optional()
            .isIn(['website', 'referral', 'walk-in', 'advertisement', 'social', 'partner', 'other'])
            .withMessage('Invalid source'),
        check('priority')
            .optional()
            .isIn(['low', 'medium', 'high', 'urgent'])
            .withMessage('Invalid priority'),
        validate,
    ],
    async (req, res, next) => {
        try {
            // Get lead to check ownership
            const lead = await leadService.getLeadById(req.params.id);

            // Check if lead belongs to the user's tenant
            if (lead.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            // If user is agent, check if they are assigned to this lead
            if (['JuniorAgent', 'SeniorAgent'].includes(req.user.role)) {
                if (!lead.assignedTo || lead.assignedTo._id.toString() !== req.user.id) {
                    return res.status(403).json({
                        status: 'error',
                        message: 'You do not have access to this lead',
                    });
                }
            }

            // Update lead
            const updatedLead = await leadService.updateLead(req.params.id, req.body);

            res.status(200).json({
                status: 'success',
                message: 'Lead updated successfully',
                data: updatedLead,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route POST /api/v1/leads/:id/interactions
 * @desc Add an interaction to a lead
 * @access Private (All sales roles)
 */
router.post(
    '/:id/interactions',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector', 'SeniorAgent', 'JuniorAgent']),
    [
        check('type')
            .isIn(['call', 'email', 'meeting', 'site-visit', 'whatsapp', 'other'])
            .withMessage('Invalid interaction type'),
        check('date').isISO8601().withMessage('Valid date is required'),
        check('outcome')
            .optional()
            .isIn(['positive', 'neutral', 'negative', 'follow-up'])
            .withMessage('Invalid outcome'),
        check('updateStatus')
            .optional()
            .isIn(['new', 'contacted', 'qualified', 'negotiation', 'converted', 'lost'])
            .withMessage('Invalid status'),
        validate,
    ],
    async (req, res, next) => {
        try {
            // Get lead to check ownership
            const lead = await leadService.getLeadById(req.params.id);

            // Check if lead belongs to the user's tenant
            if (lead.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            // If user is agent, check if they are assigned to this lead
            if (['JuniorAgent', 'SeniorAgent'].includes(req.user.role)) {
                if (!lead.assignedTo || lead.assignedTo._id.toString() !== req.user.id) {
                    return res.status(403).json({
                        status: 'error',
                        message: 'You do not have access to this lead',
                    });
                }
            }

            // Add interaction creator
            const interaction = {
                ...req.body,
                createdBy: req.user.id,
            };

            // Add interaction
            const updatedLead = await leadService.addInteraction(req.params.id, interaction);

            res.status(200).json({
                status: 'success',
                message: 'Interaction added successfully',
                data: updatedLead,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route POST /api/v1/leads/:id/notes
 * @desc Add a note to a lead
 * @access Private (All sales roles)
 */
router.post(
    '/:id/notes',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector', 'SeniorAgent', 'JuniorAgent']),
    [
        check('content').notEmpty().withMessage('Note content is required'),
        validate,
    ],
    async (req, res, next) => {
        try {
            // Get lead to check ownership
            const lead = await leadService.getLeadById(req.params.id);

            // Check if lead belongs to the user's tenant
            if (lead.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            // If user is agent, check if they are assigned to this lead
            if (['JuniorAgent', 'SeniorAgent'].includes(req.user.role)) {
                if (!lead.assignedTo || lead.assignedTo._id.toString() !== req.user.id) {
                    return res.status(403).json({
                        status: 'error',
                        message: 'You do not have access to this lead',
                    });
                }
            }

            // Add note creator
            const note = {
                content: req.body.content,
                createdBy: req.user.id,
            };

            // Add note
            const updatedLead = await leadService.addNote(req.params.id, note);

            res.status(200).json({
                status: 'success',
                message: 'Note added successfully',
                data: updatedLead,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route POST /api/v1/leads/:id/interested-units
 * @desc Add interested unit to a lead
 * @access Private (All sales roles)
 */
router.post(
    '/:id/interested-units',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector', 'SeniorAgent', 'JuniorAgent']),
    [
        check('unitId').notEmpty().withMessage('Unit ID is required'),
        check('interestLevel')
            .optional()
            .isIn(['low', 'medium', 'high'])
            .withMessage('Invalid interest level'),
        validate,
    ],
    async (req, res, next) => {
        try {
            // Get lead to check ownership
            const lead = await leadService.getLeadById(req.params.id);

            // Check if lead belongs to the user's tenant
            if (lead.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            // If user is agent, check if they are assigned to this lead
            if (['JuniorAgent', 'SeniorAgent'].includes(req.user.role)) {
                if (!lead.assignedTo || lead.assignedTo._id.toString() !== req.user.id) {
                    return res.status(403).json({
                        status: 'error',
                        message: 'You do not have access to this lead',
                    });
                }
            }

            // Add interest
            const updatedLead = await leadService.addInterestedUnit(req.params.id, req.body);

            res.status(200).json({
                status: 'success',
                message: 'Interested unit added successfully',
                data: updatedLead,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route POST /api/v1/leads/:id/assign
 * @desc Assign lead to a user
 * @access Private (Principal, BusinessHead, SalesDirector)
 */
router.post(
    '/:id/assign',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector']),
    [
        check('userId').notEmpty().withMessage('User ID is required'),
        validate,
    ],
    async (req, res, next) => {
        try {
            // Get lead to check ownership
            const lead = await leadService.getLeadById(req.params.id);

            // Check if lead belongs to the user's tenant
            if (lead.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            // Assign lead
            const updatedLead = await leadService.assignLead(req.params.id, req.body.userId);

            res.status(200).json({
                status: 'success',
                message: 'Lead assigned successfully',
                data: updatedLead,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route POST /api/v1/leads/:id/status
 * @desc Change lead status
 * @access Private (All sales roles)
 */
router.post(
    '/:id/status',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector', 'SeniorAgent', 'JuniorAgent']),
    [
        check('status')
            .isIn(['new', 'contacted', 'qualified', 'negotiation', 'converted', 'lost'])
            .withMessage('Invalid status'),
        validate,
    ],
    async (req, res, next) => {
        try {
            // Get lead to check ownership
            const lead = await leadService.getLeadById(req.params.id);

            // Check if lead belongs to the user's tenant
            if (lead.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            // If user is agent, check if they are assigned to this lead
            if (['JuniorAgent', 'SeniorAgent'].includes(req.user.role)) {
                if (!lead.assignedTo || lead.assignedTo._id.toString() !== req.user.id) {
                    return res.status(403).json({
                        status: 'error',
                        message: 'You do not have access to this lead',
                    });
                }
            }

            // Change status
            const updatedLead = await leadService.changeLeadStatus(req.params.id, req.body.status);

            res.status(200).json({
                status: 'success',
                message: 'Lead status changed successfully',
                data: updatedLead,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route POST /api/v1/leads/:id/attachments
 * @desc Add attachment to a lead
 * @access Private (All sales roles)
 */
router.post(
    '/:id/attachments',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector', 'SeniorAgent', 'JuniorAgent']),
    [
        check('name').notEmpty().withMessage('Attachment name is required'),
        check('url').notEmpty().withMessage('Attachment URL is required'),
        check('type').notEmpty().withMessage('Attachment type is required'),
        validate,
    ],
    async (req, res, next) => {
        try {
            // Get lead to check ownership
            const lead = await leadService.getLeadById(req.params.id);

            // Check if lead belongs to the user's tenant
            if (lead.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            // If user is agent, check if they are assigned to this lead
            if (['JuniorAgent', 'SeniorAgent'].includes(req.user.role)) {
                if (!lead.assignedTo || lead.assignedTo._id.toString() !== req.user.id) {
                    return res.status(403).json({
                        status: 'error',
                        message: 'You do not have access to this lead',
                    });
                }
            }

            // Add attachment creator
            const attachment = {
                ...req.body,
                uploadedBy: req.user.id,
            };

            // Add attachment
            const updatedLead = await leadService.addAttachment(req.params.id, attachment);

            res.status(200).json({
                status: 'success',
                message: 'Attachment added successfully',
                data: updatedLead,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route DELETE /api/v1/leads/:id
 * @desc Delete a lead
 * @access Private (Principal, BusinessHead, SalesDirector)
 */
router.delete(
    '/:id',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector']),
    async (req, res, next) => {
        try {
            // Get lead to check ownership
            const lead = await leadService.getLeadById(req.params.id);

            // Check if lead belongs to the user's tenant
            if (lead.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            // Delete lead
            await leadService.deleteLead(req.params.id);

            res.status(200).json({
                status: 'success',
                message: 'Lead deleted successfully',
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route POST /api/v1/leads/import
 * @desc Import leads from CSV data
 * @access Private (Principal, BusinessHead, SalesDirector)
 */
router.post(
    '/import',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector']),
    [
        check('leads').isArray({ min: 1 }).withMessage('Leads data is required'),
        validate,
    ],
    async (req, res, next) => {
        try {
            const result = await leadService.importLeadsFromCSV(req.user.tenantId, req.body.leads);

            res.status(200).json({
                status: 'success',
                message: `Imported ${result.imported} leads (skipped ${result.skipped})`,
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }
);

module.exports = router;