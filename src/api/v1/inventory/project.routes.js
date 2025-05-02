const express = require('express');
const { check, query } = require('express-validator');
const { validate } = require('../../middleware/validation');
const { authenticate, authorize, validateTenant } = require('../../middleware/auth');
const projectService = require('../../../services/project.service');
const router = express.Router();

/**
 * @route POST /api/v1/inventory/projects
 * @desc Create a new project
 * @access Private (Principal, BusinessHead)
 */
router.post(
    '/',
    authenticate,
    authorize(['Principal', 'BusinessHead']),
    [
        check('name').notEmpty().withMessage('Project name is required'),
        check('address').notEmpty().withMessage('Address is required'),
        check('city').notEmpty().withMessage('City is required'),
        check('tenantId').notEmpty().withMessage('Tenant ID is required'),
        check('gstRate').optional().isNumeric().withMessage('GST rate must be a number'),
        check('stampDutyRate').optional().isNumeric().withMessage('Stamp duty rate must be a number'),
        check('registrationRate').optional().isNumeric().withMessage('Registration rate must be a number'),
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
                    message: 'Cannot create project for another tenant',
                });
            }

            const project = await projectService.createProject(req.body);

            res.status(201).json({
                status: 'success',
                message: 'Project created successfully',
                data: project,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route GET /api/v1/inventory/projects
 * @desc Get all projects for tenant
 * @access Private (All roles)
 */
router.get(
    '/',
    authenticate,
    [
        query('city').optional().isString().withMessage('City must be a string'),
        query('active').optional().isBoolean().withMessage('Active status must be a boolean'),
        query('search').optional().isString().withMessage('Search must be a string'),
        query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
        validate,
    ],
    async (req, res, next) => {
        try {
            // Extract query parameters
            const filters = {
                city: req.query.city,
                active: req.query.active !== undefined ? req.query.active === 'true' : undefined,
                search: req.query.search,
            };

            const pagination = {
                page: parseInt(req.query.page, 10) || 1,
                limit: parseInt(req.query.limit, 10) || 10,
            };

            const projects = await projectService.getProjects(req.user.tenantId, filters, pagination);

            res.status(200).json({
                status: 'success',
                data: projects.data,
                pagination: projects.pagination,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route GET /api/v1/inventory/projects/:id
 * @desc Get project by ID
 * @access Private (All roles)
 */
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const project = await projectService.getProjectById(req.params.id);

        // Check if project belongs to the user's tenant
        if (project.tenantId.toString() !== req.user.tenantId.toString()) {
            return res.status(403).json({
                status: 'error',
                message: 'Access forbidden',
            });
        }

        res.status(200).json({
            status: 'success',
            data: project,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route PUT /api/v1/inventory/projects/:id
 * @desc Update project
 * @access Private (Principal, BusinessHead)
 */
router.put(
    '/:id',
    authenticate,
    authorize(['Principal', 'BusinessHead']),
    [
        check('name').optional().notEmpty().withMessage('Project name cannot be empty'),
        check('address').optional().notEmpty().withMessage('Address cannot be empty'),
        check('city').optional().notEmpty().withMessage('City cannot be empty'),
        check('gstRate').optional().isNumeric().withMessage('GST rate must be a number'),
        check('stampDutyRate').optional().isNumeric().withMessage('Stamp duty rate must be a number'),
        check('registrationRate').optional().isNumeric().withMessage('Registration rate must be a number'),
        validate,
    ],
    async (req, res, next) => {
        try {
            // First get the project to check if it belongs to the tenant
            const existingProject = await projectService.getProjectById(req.params.id);

            // Check if project belongs to the user's tenant
            if (existingProject.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            const updatedProject = await projectService.updateProject(req.params.id, req.body);

            res.status(200).json({
                status: 'success',
                message: 'Project updated successfully',
                data: updatedProject,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route PUT /api/v1/inventory/projects/:id/status
 * @desc Set project status (active/inactive)
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
            // First get the project to check if it belongs to the tenant
            const existingProject = await projectService.getProjectById(req.params.id);

            // Check if project belongs to the user's tenant
            if (existingProject.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            const { active } = req.body;
            const updatedProject = await projectService.setProjectStatus(req.params.id, active);

            res.status(200).json({
                status: 'success',
                message: `Project ${active ? 'activated' : 'deactivated'} successfully`,
                data: updatedProject,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route DELETE /api/v1/inventory/projects/:id
 * @desc Delete project
 * @access Private (Principal only)
 */
router.delete(
    '/:id',
    authenticate,
    authorize(['Principal']),
    async (req, res, next) => {
        try {
            // First get the project to check if it belongs to the tenant
            const existingProject = await projectService.getProjectById(req.params.id);

            // Check if project belongs to the user's tenant
            if (existingProject.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            await projectService.deleteProject(req.params.id);

            res.status(200).json({
                status: 'success',
                message: 'Project deleted successfully',
            });
        } catch (error) {
            next(error);
        }
    }
);

module.exports = router;