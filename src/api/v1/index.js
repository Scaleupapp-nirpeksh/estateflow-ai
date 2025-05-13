// src/api/v1/index.js
// Ensure this file is updated to include the new ai.routes.js

const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth.routes.js');
const tenantRoutes = require('./tenant.routes.js');
const userRoutes = require('./user.routes.js');
const inventoryRoutes = require('./inventory'); // Assuming this is a directory with an index.js
const pricingRuleRoutes = require('./pricing-rule.routes.js');
const leadRoutes = require('./lead.routes.js');
const bookingRoutes = require('./booking.routes.js');
const approvalRoutes = require('./approval.routes.js');
const paymentScheduleRoutes = require('./payment-schedule.routes.js');
const paymentScheduleTemplateRoutes = require('./payment-schedule-template.routes.js');
const analyticsRoutes = require('./analytics.routes.js');
const reportsRoutes = require('./reports.routes.js');
const aiRoutes = require('./ai.routes.js'); // <<<--- ADD THIS LINE

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
router.use('/ai', aiRoutes); // <<<--- AND THIS LINE TO MOUNT IT

// Basic test route
router.get('/status', (req, res) => {
  res.json({
    status: 'success',
    message: 'API is running',
    version: 'v1',
  });
});

module.exports = router;
