// src/api/v1/payment-schedule.routes.js

const express = require('express');
const { check, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate, authorize } = require('../middleware/auth');
const paymentScheduleService = require('../../services/payment-schedule.service');
const router = express.Router();


/**
 * @route GET /api/v1/payment-schedules/statistics
 * @desc Get payment statistics
 * @access Private (Management roles)
 */
router.get(
    '/statistics',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector', 'FinanceManager']),
    [
        query('projectId').optional().isMongoId().withMessage('Invalid project ID'),
        query('towerId').optional().isMongoId().withMessage('Invalid tower ID'),
        validate,
    ],
    async (req, res, next) => {
        try {
            const filters = {
                projectId: req.query.projectId,
                towerId: req.query.towerId
            };

            const statistics = await paymentScheduleService.getPaymentStatistics(req.user.tenantId, filters);

            res.status(200).json({
                status: 'success',
                data: statistics
            });
        } catch (error) {
            next(error);
        }
    }
);


/**
 * @route POST /api/v1/bookings/:bookingId/payment-schedule
 * @desc Create payment schedule for a booking
 * @access Private (Management and finance roles)
 */
router.post(
    '/bookings/:bookingId/payment-schedule',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector', 'CollectionsManager', 'FinanceManager']),
    [
        check('name').notEmpty().withMessage('Schedule name is required'),
        check('totalAmount').optional().isNumeric().withMessage('Total amount must be a number'),
        check('templateId').optional().isMongoId().withMessage('Invalid template ID'),
        check('installments').optional().isArray().withMessage('Installments must be an array'),
        check('calculateDueDates').optional().isBoolean(),
        validate,
    ],
    async (req, res, next) => {
        try {
            // Get booking to check tenant ID
            const bookingService = require('../../services/booking.service');
            const booking = await bookingService.getBookingById(req.params.bookingId);

            // Check if booking belongs to the user's tenant
            if (booking.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            // Prepare schedule data
            const scheduleData = {
                tenantId: req.user.tenantId,
                bookingId: req.params.bookingId,
                name: req.body.name,
                description: req.body.description,
                totalAmount: req.body.totalAmount,
                templateId: req.body.templateId,
                installments: req.body.installments,
                calculateDueDates: req.body.calculateDueDates,
                userId: req.user.id,
            };

            const schedule = await paymentScheduleService.createPaymentSchedule(scheduleData);

            res.status(201).json({
                status: 'success',
                message: 'Payment schedule created successfully',
                data: schedule,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route GET /api/v1/bookings/:bookingId/payment-schedule
 * @desc Get payment schedule for a booking
 * @access Private (All roles)
 */
router.get(
    '/bookings/:bookingId/payment-schedule',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector', 'SeniorAgent', 'JuniorAgent', 'CollectionsManager', 'FinanceManager']),
    async (req, res, next) => {
        try {
            // Get booking to check tenant ID
            const bookingService = require('../../services/booking.service');
            const booking = await bookingService.getBookingById(req.params.bookingId);

            // Check if booking belongs to the user's tenant
            if (booking.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            const schedule = await paymentScheduleService.getPaymentScheduleByBookingId(req.params.bookingId);

            res.status(200).json({
                status: 'success',
                data: schedule,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route GET /api/v1/payment-schedules/:id
 * @desc Get payment schedule by ID
 * @access Private (All roles)
 */
router.get(
    '/:id',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector', 'SeniorAgent', 'JuniorAgent', 'CollectionsManager', 'FinanceManager']),
    async (req, res, next) => {
        try {
            const schedule = await paymentScheduleService.getPaymentScheduleById(req.params.id);

            // Check if schedule belongs to the user's tenant
            if (schedule.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            res.status(200).json({
                status: 'success',
                data: schedule,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route PUT /api/v1/payment-schedules/:id/installments/:index
 * @desc Update an installment in a payment schedule
 * @access Private (Management and finance roles)
 */
router.put(
    '/:id/installments/:index',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector', 'CollectionsManager', 'FinanceManager']),
    [
        check('amount').optional().isNumeric().withMessage('Amount must be a number'),
        check('percentage').optional().isNumeric().withMessage('Percentage must be a number'),
        check('dueDate').optional().isISO8601().withMessage('Invalid due date'),
        check('name').optional().notEmpty().withMessage('Name cannot be empty'),
        check('reason').optional().notEmpty().withMessage('Reason cannot be empty'),
        check('redistributeRemaining').optional().isBoolean(),
        check('requireApproval').optional().isBoolean(),
        validate,
    ],
    async (req, res, next) => {
        try {
            const schedule = await paymentScheduleService.getPaymentScheduleById(req.params.id);

            // Check if schedule belongs to the user's tenant
            if (schedule.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            // Prepare user data for update
            const userData = {
                userId: req.user.id,
                reason: req.body.reason,
                redistributeRemaining: req.body.redistributeRemaining || false,
                requireApproval: req.body.requireApproval || false,
            };

            // Extract update data
            const updateData = {};
            ['amount', 'percentage', 'dueDate', 'name', 'description'].forEach(field => {
                if (req.body[field] !== undefined) {
                    updateData[field] = req.body[field];
                }
            });

            const updatedSchedule = await paymentScheduleService.updateInstallment(
                req.params.id,
                parseInt(req.params.index, 10),
                updateData,
                userData
            );

            res.status(200).json({
                status: 'success',
                message: 'Installment updated successfully',
                data: updatedSchedule,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route PUT /api/v1/payment-schedules/:id/total
 * @desc Update total amount of a payment schedule
 * @access Private (Management roles)
 */
router.put(
    '/:id/total',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector']),
    [
        check('totalAmount').isNumeric().withMessage('Total amount must be a number'),
        check('reason').optional().notEmpty().withMessage('Reason cannot be empty'),
        validate,
    ],
    async (req, res, next) => {
        try {
            const schedule = await paymentScheduleService.getPaymentScheduleById(req.params.id);

            // Check if schedule belongs to the user's tenant
            if (schedule.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            // Prepare user data
            const userData = {
                userId: req.user.id,
                reason: req.body.reason,
            };

            const updatedSchedule = await paymentScheduleService.updateTotalAmount(
                req.params.id,
                req.body.totalAmount,
                userData
            );

            res.status(200).json({
                status: 'success',
                message: 'Total amount updated successfully',
                data: updatedSchedule,
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route POST /api/v1/payment-schedules/:id/installments/:index/payment
 * @desc Record payment for an installment
 * @access Private (Finance roles)
 */
router.post(
    '/:id/installments/:index/payment',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'CollectionsManager', 'FinanceManager']),
    [
        check('amount').isNumeric().withMessage('Payment amount must be a number'),
        check('method').notEmpty().withMessage('Payment method is required'),
        check('reference').optional().notEmpty().withMessage('Reference cannot be empty'),
        validate,
    ],
    async (req, res, next) => {
        try {
            const schedule = await paymentScheduleService.getPaymentScheduleById(req.params.id);

            // Check if schedule belongs to the user's tenant
            if (schedule.tenantId.toString() !== req.user.tenantId.toString()) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Access forbidden',
                });
            }

            // Prepare payment data
            const paymentData = {
                amount: req.body.amount,
                method: req.body.method,
                reference: req.body.reference,
                userId: req.user.id,
            };

            const updatedSchedule = await paymentScheduleService.recordPayment(
                req.params.id,
                parseInt(req.params.index, 10),
                paymentData
            );

            res.status(200).json({
                status: 'success',
                message: 'Payment recorded successfully',
                data: updatedSchedule,
            });
        } catch (error) {
            next(error);
        }
    }
);



module.exports = router;