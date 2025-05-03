// src/api/v1/index.js

const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth.routes');
const tenantRoutes = require('./tenant.routes');
const userRoutes = require('./user.routes');
const inventoryRoutes = require('./inventory');
const pricingRuleRoutes = require('./pricing-rule.routes');
const leadRoutes = require('./lead.routes');
const bookingRoutes = require('./booking.routes');
const approvalRoutes = require('./approval.routes');
const paymentScheduleRoutes = require('./payment-schedule.routes');
const paymentScheduleTemplateRoutes = require('./payment-schedule-template.routes');
const analyticsRoutes = require('./analytics.routes');
const reportsRoutes = require('./reports.routes');

// API Routes
router.use('/auth', authRoutes);
router.use('/tenants', tenantRoutes);
router.use('/users', userRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/pricing-rules', pricingRuleRoutes);
router.use('/leads', leadRoutes);
router.use('/bookings', bookingRoutes);
router.use('/approvals', approvalRoutes);
router.use('/payment-schedules', paymentScheduleRoutes);
router.use('/payment-schedule-templates', paymentScheduleTemplateRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/reports', reportsRoutes);

// Basic test route
router.get('/status', (req, res) => {
  res.json({
    status: 'success',
    message: 'API is running',
    version: 'v1',
  });
});

module.exports = router;