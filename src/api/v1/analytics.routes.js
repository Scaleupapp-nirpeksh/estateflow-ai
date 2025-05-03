// src/api/v1/analytics.routes.js

const express = require('express');
const { query } = require('express-validator');
const { validate } = require('../middleware/validation');
const { authenticate, authorize } = require('../middleware/auth');
const analyticsService = require('../../services/analytics.service');

const router = express.Router();

/**
 * @route GET /api/v1/analytics/sales/performance
 * @desc Get sales performance analytics
 * @access Private (Management roles)
 */
router.get(
    '/sales/performance',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector', 'FinanceManager']),
    [
        query('startDate').optional().isISO8601().withMessage('Invalid start date'),
        query('endDate').optional().isISO8601().withMessage('Invalid end date'),
        query('projectId').optional().isMongoId().withMessage('Invalid project ID'),
        query('towerId').optional().isMongoId().withMessage('Invalid tower ID'),
        validate,
    ],
    async (req, res, next) => {
        try {
            const filters = {
                startDate: req.query.startDate,
                endDate: req.query.endDate,
                projectId: req.query.projectId,
                towerId: req.query.towerId
            };

            const salesPerformance = await analyticsService.getSalesPerformance(
                req.user.tenantId,
                filters
            );

            res.status(200).json({
                status: 'success',
                data: salesPerformance
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route GET /api/v1/analytics/finance/collections
 * @desc Get financial analytics
 * @access Private (Management and finance roles)
 */
router.get(
    '/finance/collections',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector', 'FinanceManager', 'CollectionsManager']),
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

            const financialAnalytics = await analyticsService.getFinancialAnalytics(
                req.user.tenantId,
                filters
            );

            res.status(200).json({
                status: 'success',
                data: financialAnalytics
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route GET /api/v1/analytics/inventory/status
 * @desc Get inventory analytics
 * @access Private (All roles)
 */
router.get(
    '/inventory/status',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector', 'SeniorAgent', 'JuniorAgent', 'FinanceManager', 'CollectionsManager']),
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

            const inventoryAnalytics = await analyticsService.getInventoryAnalytics(
                req.user.tenantId,
                filters
            );

            res.status(200).json({
                status: 'success',
                data: inventoryAnalytics
            });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * @route GET /api/v1/analytics/dashboard/summary
 * @desc Get dashboard summary metrics
 * @access Private (Management roles)
 */
router.get(
    '/dashboard/summary',
    authenticate,
    authorize(['Principal', 'BusinessHead', 'SalesDirector', 'FinanceManager']),
    async (req, res, next) => {
        try {
            // Get current date for time-based filters
            const today = new Date();
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            const startOfPrevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const endOfPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0);

            // Get sales performance for current month
            const currentMonthSales = await analyticsService.getSalesPerformance(
                req.user.tenantId,
                { startDate: startOfMonth, endDate: today }
            );

            // Get sales performance for previous month
            const prevMonthSales = await analyticsService.getSalesPerformance(
                req.user.tenantId,
                { startDate: startOfPrevMonth, endDate: endOfPrevMonth }
            );

            // Get financial analytics
            const financialAnalytics = await analyticsService.getFinancialAnalytics(
                req.user.tenantId
            );

            // Get inventory analytics
            const inventoryAnalytics = await analyticsService.getInventoryAnalytics(
                req.user.tenantId
            );

            // Prepare dashboard summary
            const dashboardSummary = {
                sales: {
                    currentMonth: {
                        bookings: currentMonthSales.summary.totalSales,
                        revenue: currentMonthSales.summary.totalRevenue,
                        avgBookingValue: currentMonthSales.summary.averageBookingValue
                    },
                    previousMonth: {
                        bookings: prevMonthSales.summary.totalSales,
                        revenue: prevMonthSales.summary.totalRevenue,
                        avgBookingValue: prevMonthSales.summary.averageBookingValue
                    },
                    growth: {
                        bookings: prevMonthSales.summary.totalSales ?
                            ((currentMonthSales.summary.totalSales - prevMonthSales.summary.totalSales) / prevMonthSales.summary.totalSales) * 100 : 0,
                        revenue: prevMonthSales.summary.totalRevenue ?
                            ((currentMonthSales.summary.totalRevenue - prevMonthSales.summary.totalRevenue) / prevMonthSales.summary.totalRevenue) * 100 : 0
                    }
                },
                financial: {
                    collection: {
                        totalAmount: financialAnalytics.collectionSummary.totalAmount,
                        collectedAmount: financialAnalytics.collectionSummary.collectedAmount,
                        pendingAmount: financialAnalytics.collectionSummary.pendingAmount,
                        overdueAmount: financialAnalytics.collectionSummary.overdueAmount,
                        collectionEfficiency: financialAnalytics.collectionSummary.collectionEfficiency
                    },
                    urgent: {
                        overdue: financialAnalytics.collectionSummary.overdueInstallments,
                        thisWeekDue: financialAnalytics.upcomingCollections.find(item => item._id === 'This Week')?.count || 0,
                        thisWeekAmount: financialAnalytics.upcomingCollections.find(item => item._id === 'This Week')?.totalAmount || 0
                    }
                },
                inventory: {
                    total: inventoryAnalytics.summary.totalUnits,
                    available: inventoryAnalytics.summary.availableUnits,
                    sold: inventoryAnalytics.summary.soldUnits,
                    locked: inventoryAnalytics.summary.lockedUnits,
                    soldPercentage: inventoryAnalytics.summary.soldPercentage
                },
                topPerformers: {
                    agents: currentMonthSales.agentPerformance.slice(0, 5)
                }
            };

            res.status(200).json({
                status: 'success',
                data: dashboardSummary
            });
        } catch (error) {
            next(error);
        }
    }
);

module.exports = router;