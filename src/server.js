const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const { connectDB } = require('./config/database');
const { initializeJobs } = require('./jobs');

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Start the server
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Initialize background jobs
    initializeJobs();

    // Start Express server
    const server = app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port} in ${config.nodeEnv} mode`);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (error) => {
      logger.error('Unhandled promise rejection', { error: error.message, stack: error.stack });
      server.close(() => process.exit(1));
    });

    // Handle SIGTERM
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received. Shutting down gracefully');
      server.close(() => {
        logger.info('Process terminated');
      });
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message, stack: error.stack });
    process.exit(1);
  }
};

startServer();