const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth.routes');
const tenantRoutes = require('./tenant.routes');
const userRoutes = require('./user.routes');
// These will be implemented in future steps
// const inventoryRoutes = require('./inventory.routes');
// const leadRoutes = require('./lead.routes');
// const bookingRoutes = require('./booking.routes');
// const paymentRoutes = require('./payment.routes');
// const documentRoutes = require('./document.routes');
// const conversationRoutes = require('./conversation.routes');

// API Routes
router.use('/auth', authRoutes);
router.use('/tenants', tenantRoutes);
router.use('/users', userRoutes);
// router.use('/inventory', inventoryRoutes);
// router.use('/leads', leadRoutes);
// router.use('/bookings', bookingRoutes);
// router.use('/payments', paymentRoutes);
// router.use('/documents', documentRoutes);
// router.use('/conversation', conversationRoutes);

// Basic test route
router.get('/status', (req, res) => {
  res.json({
    status: 'success',
    message: 'API is running',
    version: 'v1',
  });
});

module.exports = router;