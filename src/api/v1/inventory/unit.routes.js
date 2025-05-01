const express = require('express');
const { check, query } = require('express-validator');
const { validate } = require('../../middleware/validation');
const { authenticate, authorize } = require('../../middleware/auth');
const unitService = require('../../../services/unit.service');
const router = express.Router();

/**
 * @route POST /api/v1/inventory/units
 * @desc Create a new unit
 * @access Private (Principal, BusinessHead)
 */
router.post(
    '/',
    authenticate,
    authorize(['Principal', 'BusinessHead']),
    [
        check('number').notEmpty().withMessage('Unit number is required'),
        check('floor').isInt({ min: 0 }).withMessage('Floor must be a non-negative integer'),
        check('type').notEmpty().withMessage('Unit type is required'),
        check('carpetArea').isNumeric().withMessage('Carpet area must be a number'),
        check('builtUpArea').isNumeric().withMessage('Built-up area must be a number'),
        check('superBuiltUpArea').isNumeric().withMessage('Super built-up area must be a number'),
        check('basePrice').isNumeric().withMessage('Base price must be a number'),
        check('projectId').notEmpty().withMessage('Project ID is required'),
        check('towerId').notEmpty().withMessage('Tower ID is required'),
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
                    message: 'Cannot create unit for another tenant',
                });
            }

            const unit = await unitService.createUnit(req.body);

            res.status(201).json({
                status: 'success',
                message: 'Unit created successfully',
                data: unit,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route POST /api/v1/inventory/units/bulk
 * @desc Create multiple units at once
 * @access Private (Principal, BusinessHead)
 */
router.post(
    '/bulk',
    authenticate,
    authorize(['Principal', 'BusinessHead']),
    [
        check('units').isArray({ min: 1 }).withMessage('At least one unit is required'),
        check('units.*.number').notEmpty().withMessage('Unit number is required for all units'),
        check('units.*.floor').isInt({ min: 0 }).withMessage('Floor must be a non-negative integer for all units'),
        check('units.*.type').notEmpty().withMessage('Unit type is required for all units'),
        check('units.*.carpetArea').isNumeric().withMessage('Carpet area must be a number for all units'),
        check('units.*.builtUpArea').isNumeric().withMessage('Built-up area must be a number for all units'),
        check('units.*.superBuiltUpArea').isNumeric().withMessage('Super built-up area must be a number for all units'),
        check('units.*.basePrice').isNumeric().withMessage('Base price must be a number for all units'),
        check('units.*.projectId').notEmpty().withMessage('Project ID is required for all units'),
        check('units.*.towerId').notEmpty().withMessage('Tower ID is required for all units'),
        check('units.*.tenantId').notEmpty().withMessage('Tenant ID is required for all units'),
        validate,
    ],
    async (req, res, next) => {
        try {
            const { units } = req.body;

            // Set tenant ID from authenticated user if not specified
            units.forEach((unit) => {
                if (!unit.tenantId) {
                    unit.tenantId = req.user.tenantId;
                }

                // Validate tenant ID matches authenticated user's tenant
                if (unit.tenantId.toString() !== req.user.tenantId.toString()) {
                    throw new Error('Cannot create units for another tenant');
                }
            });

            const createdUnits = await unitService.createBulkUnits(units);

            res.status(201).json({
                status: 'success',
                message: `${createdUnits.length} units created successfully`,
                data: createdUnits,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route GET /api/v1/inventory/units
 * @desc Get units with filtering options
 * @access Private (All roles)
 */
router.get(
    '/',
    authenticate,
    [
        query('projectId').optional().isMongoId().withMessage('Project ID must be a valid ID'),
        query('towerId').optional().isMongoId().withMessage('Tower ID must be a valid ID'),
        query('status').optional().isIn(['available', 'locked', 'booked', 'sold']).withMessage('Invalid status'),
        query('type').optional().isString().withMessage('Type must be a string'),
        query('floor').optional().isInt({ min: 0 }).withMessage('Floor must be a non-negative integer'),
        query('minArea').optional().isInt({ min: 0 }).withMessage('Min area must be a non-negative integer'),
        query('maxArea').optional().isInt({ min: 0 }).withMessage('Max area must be a non-negative integer'),
        query('minPrice').optional().isInt({ min: 0 }).withMessage('Min price must be a non-negative integer'),
        query('maxPrice').optional().isInt({ min: 0 }).withMessage('Max price must be a non-negative integer'),
        query('view').optional().isString().withMessage('View must be a string'),
        query('sort').optional().isIn(['price_asc', 'price_desc', 'area_asc', 'area_desc']).withMessage('Invalid sort option'),
        query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
        validate,
    ],
    async (req, res, next) => {
        try {
            // Extract query parameters
            const query = {
                tenantId: req.user.tenantId,
                projectId: req.query.projectId,
                towerId: req.query.towerId,
                status: req.query.status,
                type: req.query.type,
                floor: req.query.floor ? parseInt(req.query.floor, 10) : undefined,
                minArea: req.query.minArea ? parseInt(req.query.minArea, 10) : undefined,
                maxArea: req.query.maxArea ? parseInt(req.query.maxArea, 10) : undefined,
                minPrice: req.query.minPrice ? parseInt(req.query.minPrice, 10) : undefined,
                maxPrice: req.query.maxPrice ? parseInt(req.query.maxPrice, 10) : undefined,
                view: req.query.view,
                sort: req.query.sort,
            };

            const pagination = {
                page: parseInt(req.query.page, 10) || 1,
                limit: parseInt(req.query.limit, 10) || 20,
            };

            const units = await unitService.getUnits(query, pagination);

            res.status(200).json({
                status: 'success',
                data: units.data,
                pagination: units.pagination,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route GET /api/v1/inventory/units/:id
 * @desc Get unit by ID
 * @access Private (All roles)
 */
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const unit = await unitService.getUnitById(req.params.id);

        // Check if unit belongs to the user's tenant
        if (unit.tenantId.toString() !== req.user.tenantId.toString()) {
            return res.status(403).json({
                status: 'error',
                message: 'Access forbidden',
            });
        }

        res.status(200).json({
            status: 'success',
            data: unit,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route PUT /api/v1/inventory/units/:id
 * @desc Update unit
 * @access Private (Principal, BusinessHead)
 */
router.put(
    '/:id',
    authenticate,
    authorize(['Principal', 'BusinessHead']),
    [
        check('number').optional().notEmpty().withMessage('Unit number cannot be empty'),
        check('type').optional().notEmpty().withMessage('Unit type cannot be empty'),
        check('carpetArea').optional().isNumeric().withMessage('Carpet area must be a number'),
        check('builtUpArea').optional().isNumeric().withMessage('Built-up area must be a number'),
        check('superBuiltUpArea').optional().isNumeric().withMessage('Super built-up area must be a number'),
        check('basePrice').optional().isNumeric().withMessage('Base price must be a number'),
        check('attributes').optional().isObject().withMessage('Attributes must be an object'),
        check('views').optional().isArray().withMessage('Views must be an array'),
        validate,
    ],
    async (req, res, next) => {
        try {
            const unit = await unitService.getUnitById(req.params.id);

            // Check if unit belongs to the user's tenant
            if (unit.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            const updatedUnit = await unitService.updateUnit(req.params.id, req.body);

            res.status(200).json({
                status: 'success',
                message: 'Unit updated successfully',
                data: updatedUnit,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route GET /api/v1/inventory/units/:id/price
 * @desc Calculate unit price with all premiums and taxes
 * @access Private (All roles)
 */
router.get('/:id/price', authenticate, async (req, res, next) => {
    try {
        const unit = await unitService.getUnitById(req.params.id);

        // Check if unit belongs to the user's tenant
        if (unit.tenantId.toString() !== req.user.tenantId.toString()) {
            return res.status(403).json({
                status: 'error',
                message: 'Access forbidden',
            });
        }

        const priceDetails = await unitService.calculateUnitPrice(req.params.id);

        res.status(200).json({
            status: 'success',
            data: priceDetails,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route POST /api/v1/inventory/units/:id/lock
 * @desc Lock unit for a potential buyer
 * @access Private (Principal, BusinessHead, SalesDirector, SeniorAgent, JuniorAgent)
 */
router.post(
    '/:id/lock',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector', 'SeniorAgent', 'JuniorAgent']),
    [
        check('minutes').optional().isInt({ min: 1 }).withMessage('Minutes must be a positive integer'),
        validate,
    ],
    async (req, res, next) => {
        try {
            const unit = await unitService.getUnitById(req.params.id);

            // Check if unit belongs to the user's tenant
            if (unit.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            const lockedUnit = await unitService.lockUnit(req.params.id, req.user.id, req.body.minutes);

            res.status(200).json({
                status: 'success',
                message: 'Unit locked successfully',
                data: {
                    unit: lockedUnit,
                    lockedUntil: lockedUnit.lockedUntil,
                },
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route POST /api/v1/inventory/units/:id/release
 * @desc Release a locked unit
 * @access Private (Principal, BusinessHead, SalesDirector, SeniorAgent, JuniorAgent)
 */
router.post(
    '/:id/release',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector', 'SeniorAgent', 'JuniorAgent']),
    async (req, res, next) => {
        try {
            const unit = await unitService.getUnitById(req.params.id);

            // Check if unit belongs to the user's tenant
            if (unit.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            // Check if user is authorized to release this unit
            if (
                unit.lockedBy &&
                unit.lockedBy.toString() !== req.user.id &&
                !['Principal', 'BusinessHead', 'SalesDirector'].includes(req.user.role)
            ) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Only the user who locked the unit or managers can release it',
                });
            }

            const releasedUnit = await unitService.releaseUnit(req.params.id);

            res.status(200).json({
                status: 'success',
                message: 'Unit released successfully',
                data: releasedUnit,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route PUT /api/v1/inventory/units/:id/status
 * @desc Change unit status
 * @access Private (Principal, BusinessHead, SalesDirector)
 */
router.put(
    '/:id/status',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector']),
    [
        check('status').isIn(['available', 'locked', 'booked', 'sold']).withMessage('Invalid status'),
        check('userId').optional().isMongoId().withMessage('User ID must be a valid ID'),
        check('bookingId').optional().isMongoId().withMessage('Booking ID must be a valid ID'),
        check('minutes').optional().isInt({ min: 1 }).withMessage('Minutes must be a positive integer'),
        validate,
    ],
    async (req, res, next) => {
        try {
            const unit = await unitService.getUnitById(req.params.id);

            // Check if unit belongs to the user's tenant
            if (unit.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            const { status, userId, bookingId, minutes } = req.body;

            const updatedUnit = await unitService.changeUnitStatus(req.params.id, status, {
                userId: userId || req.user.id,
                bookingId,
                minutes,
            });

            res.status(200).json({
                status: 'success',
                message: `Unit status changed to ${status} successfully`,
                data: updatedUnit,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route DELETE /api/v1/inventory/units/:id
 * @desc Delete unit
 * @access Private (Principal only)
 */
router.delete(
    '/:id',
    authenticate,
    authorize(['Principal']),
    async (req, res, next) => {
        try {
            const unit = await unitService.getUnitById(req.params.id);

            // Check if unit belongs to the user's tenant
            if (unit.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            await unitService.deleteUnit(req.params.id);

            res.status(200).json({
                status: 'success',
                message: 'Unit deleted successfully',
            });
        } catch (error) {
            next(error);
        }
    }
);

module.exports = router;