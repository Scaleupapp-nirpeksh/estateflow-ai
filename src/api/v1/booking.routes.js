// src/api/v1/booking.routes.js

const express = require('express');
const { check, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate, authorize } = require('../middleware/auth');
const bookingService = require('../../services/booking.service');
const router = express.Router();

/**
 * @route POST /api/v1/bookings
 * @desc Create a new booking from a lead
 * @access Private (All sales roles)
 */
router.post(
    '/',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector', 'SeniorAgent', 'JuniorAgent']),
    [
        check('leadId').notEmpty().withMessage('Lead ID is required'),
        check('unitId').notEmpty().withMessage('Unit ID is required'),
        check('tenantId').notEmpty().withMessage('Tenant ID is required'),
        check('basePrice').optional().isNumeric().withMessage('Base price must be a number'),
        check('premiums').optional().isArray().withMessage('Premiums must be an array'),
        check('discounts').optional().isArray().withMessage('Discounts must be an array'),
        check('additionalCharges').optional().isArray().withMessage('Additional charges must be an array'),
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
                    message: 'Cannot create booking for another tenant',
                });
            }

            // Add user ID for tracking
            req.body.userId = req.user.id;

            const booking = await bookingService.createBooking(req.body);

            res.status(201).json({
                status: 'success',
                message: 'Booking created successfully',
                data: booking,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route GET /api/v1/bookings
 * @desc Get bookings with filtering and pagination
 * @access Private (All sales roles)
 */
router.get(
    '/',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector', 'SeniorAgent', 'JuniorAgent', 'CollectionsManager', 'FinanceManager']),
    [
        query('status').optional().isIn(['draft', 'pending_approval', 'approved', 'executed', 'cancelled']).withMessage('Invalid status'),
        query('projectId').optional().isMongoId().withMessage('Invalid project ID'),
        query('unitId').optional().isMongoId().withMessage('Invalid unit ID'),
        query('leadId').optional().isMongoId().withMessage('Invalid lead ID'),
        query('towerId').optional().isMongoId().withMessage('Invalid tower ID'),
        query('fromDate').optional().isISO8601().withMessage('Invalid from date'),
        query('toDate').optional().isISO8601().withMessage('Invalid to date'),
        query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
        query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
        validate,
    ],
    async (req, res, next) => {
        try {
            // Extract query parameters for filtering
            const filters = {
                status: req.query.status,
                projectId: req.query.projectId,
                unitId: req.query.unitId,
                leadId: req.query.leadId,
                towerId: req.query.towerId,
                fromDate: req.query.fromDate,
                toDate: req.query.toDate,
                search: req.query.search,
            };

            // Extract pagination parameters
            const pagination = {
                page: parseInt(req.query.page, 10) || 1,
                limit: parseInt(req.query.limit, 10) || 10,
            };

            const bookings = await bookingService.getBookings(req.user.tenantId, filters, pagination);

            res.status(200).json({
                status: 'success',
                data: bookings.data,
                pagination: bookings.pagination,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route GET /api/v1/bookings/statistics
 * @desc Get booking statistics
 * @access Private (Management roles)
 */
router.get(
    '/statistics',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector', 'FinanceManager']),
    async (req, res, next) => {
        try {
            const statistics = await bookingService.getBookingStatistics(req.user.tenantId);

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
 * @route GET /api/v1/bookings/:id
 * @desc Get booking by ID
 * @access Private (All sales roles)
 */
router.get(
    '/:id',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector', 'SeniorAgent', 'JuniorAgent', 'CollectionsManager', 'FinanceManager']),
    async (req, res, next) => {
        try {
            const booking = await bookingService.getBookingById(req.params.id);

            // Check if booking belongs to the user's tenant
            if (booking.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            res.status(200).json({
                status: 'success',
                data: booking,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route PUT /api/v1/bookings/:id
 * @desc Update booking
 * @access Private (Management roles)
 */
router.put(
    '/:id',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector']),
    [
        check('basePrice').optional().isNumeric().withMessage('Base price must be a number'),
        check('premiums').optional().isArray().withMessage('Premiums must be an array'),
        check('discounts').optional().isArray().withMessage('Discounts must be an array'),
        check('additionalCharges').optional().isArray().withMessage('Additional charges must be an array'),
        validate,
    ],
    async (req, res, next) => {
        try {
            const booking = await bookingService.getBookingById(req.params.id);

            // Check if booking belongs to the user's tenant
            if (booking.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            // Add user ID for tracking
            req.body.userId = req.user.id;

            const updatedBooking = await bookingService.updateBooking(req.params.id, req.body);

            res.status(200).json({
                status: 'success',
                message: 'Booking updated successfully',
                data: updatedBooking,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route POST /api/v1/bookings/:id/notes
 * @desc Add note to booking
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
            const booking = await bookingService.getBookingById(req.params.id);

            // Check if booking belongs to the user's tenant
            if (booking.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            // Add note with user information
            const note = {
                content: req.body.content,
                createdBy: req.user.id,
            };

            const updatedBooking = await bookingService.addNote(req.params.id, note);

            res.status(200).json({
                status: 'success',
                message: 'Note added successfully',
                data: updatedBooking,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route POST /api/v1/bookings/:id/discounts
 * @desc Add discount to booking
 * @access Private (Management roles)
 */
router.post(
    '/:id/discounts',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector']),
    [
        check('type').notEmpty().withMessage('Discount type is required'),
        check('amount').optional().isNumeric().withMessage('Amount must be a number'),
        check('percentage').optional().isNumeric().withMessage('Percentage must be a number'),
        check('description').notEmpty().withMessage('Discount description is required'),
        validate,
    ],
    async (req, res, next) => {
        try {
            const booking = await bookingService.getBookingById(req.params.id);

            // Check if booking belongs to the user's tenant
            if (booking.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            // Check if user has permission for this discount amount
            // Get user permissions
            const userService = require('../../services/user.service');
            const user = await userService.getUserById(req.user.id);

            // Calculate discount amount
            let discountAmount = req.body.amount;
            if (req.body.percentage) {
                discountAmount = (booking.totalBookingAmount * req.body.percentage) / 100;
            }

            // Check if discount needs approval
            let needsApproval = true;

            // Principal can apply any discount without approval
            if (req.user.role === 'Principal') {
                needsApproval = false;
            }
            // Others check against their max discount permission
            else if (user.permissions && user.permissions.maxDiscountPercentage) {
                const discountPercentage = (discountAmount / booking.totalBookingAmount) * 100;
                if (discountPercentage <= user.permissions.maxDiscountPercentage) {
                    needsApproval = false;
                }
            }

            // Prepare discount data
            const discount = {
                type: req.body.type,
                amount: discountAmount,
                percentage: req.body.percentage,
                description: req.body.description,
                status: needsApproval ? 'pending' : 'approved',
                createdBy: req.user.id,
            };

            // If approval needed, create approval request
            if (needsApproval) {
                const approvalService = require('../../services/approval.service');

                const approval = await approvalService.createApproval({
                    tenantId: booking.tenantId,
                    type: 'discount',
                    entityType: 'booking',
                    entityId: booking._id,
                    amount: discountAmount,
                    percentage: req.body.percentage,
                    userId: req.user.id,
                    justification: req.body.description,
                });

                discount.approvalId = approval._id;
            }

            const updatedBooking = await bookingService.addDiscount(req.params.id, discount);

            res.status(200).json({
                status: 'success',
                message: needsApproval ? 'Discount added and pending approval' : 'Discount added successfully',
                data: updatedBooking,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route POST /api/v1/bookings/:id/status
 * @desc Update booking status
 * @access Private (Management roles)
 */
router.post(
    '/:id/status',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector']),
    [
        check('status').isIn(['draft', 'pending_approval', 'approved', 'executed', 'cancelled']).withMessage('Invalid status'),
        check('reason').optional().notEmpty().withMessage('Reason cannot be empty'),
        validate,
    ],
    async (req, res, next) => {
        try {
            const booking = await bookingService.getBookingById(req.params.id);

            // Check if booking belongs to the user's tenant
            if (booking.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            // Update status with user data
            const userData = {
                userId: req.user.id,
                reason: req.body.reason,
            };

            // Special handling for status changes
            if (req.body.status === 'cancelled' && req.user.role !== 'Principal') {
                // Create approval for cancellation if not Principal
                const approvalService = require('../../services/approval.service');

                const approval = await approvalService.createApproval({
                    tenantId: booking.tenantId,
                    type: 'cancellation',
                    entityType: 'booking',
                    entityId: booking._id,
                    userId: req.user.id,
                    justification: req.body.reason || 'Booking cancellation',
                });

                res.status(200).json({
                    status: 'success',
                    message: 'Cancellation request submitted for approval',
                    data: approval,
                });
                return;
            }

            const updatedBooking = await bookingService.updateBookingStatus(
                req.params.id,
                req.body.status,
                userData
            );

            res.status(200).json({
                status: 'success',
                message: `Booking status updated to ${req.body.status}`,
                data: updatedBooking,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route POST /api/v1/bookings/:id/documents/cost-sheet
 * @desc Generate cost sheet for booking
 * @access Private (All sales roles)
 */
router.post(
    '/:id/documents/cost-sheet',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector', 'SeniorAgent', 'JuniorAgent']),
    async (req, res, next) => {
        try {
            const booking = await bookingService.getBookingById(req.params.id);

            // Check if booking belongs to the user's tenant
            if (booking.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            // Generate cost sheet
            const options = {
                userId: req.user.id,
                ...req.body,
            };

            const result = await bookingService.generateCostSheet(req.params.id, options);

            res.status(200).json({
                status: 'success',
                message: 'Cost sheet generated successfully',
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }
);

module.exports = router;