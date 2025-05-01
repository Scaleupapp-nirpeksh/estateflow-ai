const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { errorHandler, notFoundHandler } = require('./utils/error-handler');
const config = require('./config');
const logger = require('./utils/logger');

// Create Express app
const app = express();

// Apply middleware
app.use(helmet());
app.use(cors(config.cors));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`);
  next();
});

// API routes
app.use(`/api/${config.apiVersion}`, require('./api/v1'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', version: config.version });
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;