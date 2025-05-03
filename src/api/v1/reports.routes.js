// src/api/v1/reports.routes.js

const express = require('express');
const { check, query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate, authorize } = require('../middleware/auth');
const reportService = require('../../services/report.service');

const router = express.Router();

/**
 * @route POST /api/v1/reports/sales
 * @desc Generate sales report
 * @access Private (Management roles)
 */
router.post(
    '/sales',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector', 'FinanceManager']),
    [
        check('startDate').optional().isISO8601().withMessage('Invalid start date'),
        check('endDate').optional().isISO8601().withMessage('Invalid end date'),
        check('projectId').optional().isMongoId().withMessage('Invalid project ID'),
        check('towerId').optional().isMongoId().withMessage('Invalid tower ID'),
        validate,
    ],
    async (req, res, next) => {
        try {
            const options = {
                startDate: req.body.startDate,
                endDate: req.body.endDate,
                projectId: req.body.projectId,
                towerId: req.body.towerId
            };

            const report = await reportService.generateSalesReport(
                req.user.tenantId,
                options
            );

            res.status(200).json({
                status: 'success',
                message: 'Sales report generated successfully',
                data: report
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route POST /api/v1/reports/collections
 * @desc Generate collections report
 * @access Private (Management and finance roles)
 */
router.post(
    '/collections',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector', 'FinanceManager', 'CollectionsManager']),
    [
        check('projectId').optional().isMongoId().withMessage('Invalid project ID'),
        check('towerId').optional().isMongoId().withMessage('Invalid tower ID'),
        check('status').optional().isIn(['all', 'overdue', 'pending', 'paid']).withMessage('Invalid status'),
        validate,
    ],
    async (req, res, next) => {
        try {
            const options = {
                projectId: req.body.projectId,
                towerId: req.body.towerId,
                status: req.body.status || 'all'
            };

            const report = await reportService.generateCollectionsReport(
                req.user.tenantId,
                options
            );

            res.status(200).json({
                status: 'success',
                message: 'Collections report generated successfully',
                data: report
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route POST /api/v1/reports/inventory
 * @desc Generate inventory report
 * @access Private (All roles)
 */
router.post(
    '/inventory',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector', 'SeniorAgent', 'JuniorAgent', 'FinanceManager', 'CollectionsManager']),
    [
        check('projectId').optional().isMongoId().withMessage('Invalid project ID'),
        check('towerId').optional().isMongoId().withMessage('Invalid tower ID'),
        check('status').optional().isIn(['all', 'available', 'sold', 'locked', 'blocked']).withMessage('Invalid status'),
        validate,
    ],
    async (req, res, next) => {
        try {
            const options = {
                projectId: req.body.projectId,
                towerId: req.body.towerId,
                status: req.body.status || 'all'
            };

            const report = await reportService.generateInventoryReport(
                req.user.tenantId,
                options
            );

            res.status(200).json({
                status: 'success',
                message: 'Inventory report generated successfully',
                data: report
            });
        } catch (error) {
            next(error);
        }
    }
);

module.exports = router;