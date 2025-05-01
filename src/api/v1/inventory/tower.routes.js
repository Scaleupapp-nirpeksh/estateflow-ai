const express = require('express');
const { check, query } = require('express-validator');
const { validate } = require('../../middleware/validation');
const { authenticate, authorize } = require('../../middleware/auth');
const towerService = require('../../../services/tower.service');
const router = express.Router();

/**
 * @route POST /api/v1/inventory/towers
 * @desc Create a new tower
 * @access Private (Principal, BusinessHead)
 */
router.post(
    '/',
    authenticate,
    authorize(['Principal', 'BusinessHead']),
    [
        check('name').notEmpty().withMessage('Tower name is required'),
        check('totalFloors').isInt({ min: 1 }).withMessage('Total floors must be a positive integer'),
        check('unitsPerFloor').optional().isInt({ min: 1 }).withMessage('Units per floor must be a positive integer'),
        check('projectId').notEmpty().withMessage('Project ID is required'),
        check('tenantId').notEmpty().withMessage('Tenant ID is required'),
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
                    message: 'Cannot create tower for another tenant',
                });
            }

            const tower = await towerService.createTower(req.body);

            res.status(201).json({
                status: 'success',
                message: 'Tower created successfully',
                data: tower,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route GET /api/v1/inventory/towers
 * @desc Get towers by project
 * @access Private (All roles)
 */
router.get(
    '/',
    authenticate,
    [
        query('projectId').notEmpty().withMessage('Project ID is required'),
        query('constructionStatus').optional().isString().withMessage('Construction status must be a string'),
        query('active').optional().isBoolean().withMessage('Active status must be a boolean'),
        query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
        validate,
    ],
    async (req, res, next) => {
        try {
            // Extract query parameters
            const filters = {
                constructionStatus: req.query.constructionStatus,
                active: req.query.active !== undefined ? req.query.active === 'true' : undefined,
            };

            const pagination = {
                page: parseInt(req.query.page, 10) || 1,
                limit: parseInt(req.query.limit, 10) || 10,
            };

            const towers = await towerService.getTowers(req.query.projectId, filters, pagination);

            res.status(200).json({
                status: 'success',
                data: towers.data,
                pagination: towers.pagination,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route GET /api/v1/inventory/towers/:id
 * @desc Get tower by ID
 * @access Private (All roles)
 */
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const tower = await towerService.getTowerById(req.params.id);

        // Check if tower belongs to the user's tenant
        if (tower.tenantId.toString() !== req.user.tenantId.toString()) {
            return res.status(403).json({
                status: 'error',
                message: 'Access forbidden',
            });
        }

        res.status(200).json({
            status: 'success',
            data: tower,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route PUT /api/v1/inventory/towers/:id
 * @desc Update tower
 * @access Private (Principal, BusinessHead)
 */
router.put(
    '/:id',
    authenticate,
    authorize(['Principal', 'BusinessHead']),
    [
        check('name').optional().notEmpty().withMessage('Tower name cannot be empty'),
        check('totalFloors').optional().isInt({ min: 1 }).withMessage('Total floors must be a positive integer'),
        check('unitsPerFloor').optional().isInt({ min: 1 }).withMessage('Units per floor must be a positive integer'),
        validate,
    ],
    async (req, res, next) => {
        try {
            const tower = await towerService.getTowerById(req.params.id);

            // Check if tower belongs to the user's tenant
            if (tower.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            const updatedTower = await towerService.updateTower(req.params.id, req.body);

            res.status(200).json({
                status: 'success',
                message: 'Tower updated successfully',
                data: updatedTower,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route PUT /api/v1/inventory/towers/:id/construction
 * @desc Update tower construction status
 * @access Private (Principal, BusinessHead)
 */
router.put(
    '/:id/construction',
    authenticate,
    authorize(['Principal', 'BusinessHead']),
    [
        check('status').optional().isIn(['Planning', 'Foundation', 'Superstructure', 'Finishing', 'Complete']).withMessage('Invalid construction status'),
        check('completionPercentage').optional().isInt({ min: 0, max: 100 }).withMessage('Completion percentage must be between 0 and 100'),
        check('estimatedCompletionDate').optional().isISO8601().withMessage('Invalid date format'),
        validate,
    ],
    async (req, res, next) => {
        try {
            const tower = await towerService.getTowerById(req.params.id);

            // Check if tower belongs to the user's tenant
            if (tower.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            const updatedTower = await towerService.updateConstructionStatus(req.params.id, req.body);

            res.status(200).json({
                status: 'success',
                message: 'Construction status updated successfully',
                data: updatedTower,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route PUT /api/v1/inventory/towers/:id/premiums
 * @desc Update tower premium rules
 * @access Private (Principal, BusinessHead)
 */
router.put(
    '/:id/premiums',
    authenticate,
    authorize(['Principal', 'BusinessHead']),
    [
        check('floorRise.type').optional().isIn(['fixed', 'percentage']).withMessage('Floor rise type must be fixed or percentage'),
        check('floorRise.value').optional().isNumeric().withMessage('Floor rise value must be a number'),
        check('floorRise.floorStart').optional().isInt({ min: 1 }).withMessage('Floor start must be a positive integer'),
        check('viewPremium').optional().isArray().withMessage('View premium must be an array'),
        check('viewPremium.*.view').optional().notEmpty().withMessage('View name is required'),
        check('viewPremium.*.percentage').optional().isNumeric().withMessage('View percentage must be a number'),
        validate,
    ],
    async (req, res, next) => {
        try {
            const tower = await towerService.getTowerById(req.params.id);

            // Check if tower belongs to the user's tenant
            if (tower.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            const updatedTower = await towerService.updatePremiums(req.params.id, req.body);

            res.status(200).json({
                status: 'success',
                message: 'Premium rules updated successfully',
                data: updatedTower,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route DELETE /api/v1/inventory/towers/:id
 * @desc Delete tower
 * @access Private (Principal only)
 */
router.delete(
    '/:id',
    authenticate,
    authorize(['Principal']),
    async (req, res, next) => {
        try {
            const tower = await towerService.getTowerById(req.params.id);

            // Check if tower belongs to the user's tenant
            if (tower.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            await towerService.deleteTower(req.params.id);

            res.status(200).json({
                status: 'success',
                message: 'Tower deleted successfully',
            });
        } catch (error) {
            next(error);
        }
    }
);

module.exports = router;