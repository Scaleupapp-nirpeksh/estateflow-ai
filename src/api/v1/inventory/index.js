const express = require('express');
const router = express.Router();
const projectRoutes = require('./project.routes');
const towerRoutes = require('./tower.routes');
const unitRoutes = require('./unit.routes');

// Inventory Routes
router.use('/projects', projectRoutes);
router.use('/towers', towerRoutes);
router.use('/units', unitRoutes);

module.exports = router;