const mongoose = require('mongoose');
const config = require('./index');
const logger = require('../utils/logger');

/**
 * Connect to MongoDB with retry logic
 */
const connectDB = async (retryCount = 5) => {
  try {
    const conn = await mongoose.connect(config.mongodb.uri, config.mongodb.options);
    
    logger.info(`MongoDB connected: ${conn.connection.host}`);
    
    // Add event listeners for connection issues
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error', { error: err.message });
    });
    
    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });
    
    return conn;
  } catch (error) {
    logger.error('MongoDB connection failed', { error: error.message, stack: error.stack });
    
    if (retryCount > 0) {
      logger.info(`Retrying connection... (${retryCount} attempts left)`);
      // Wait for 5 seconds before retrying
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return connectDB(retryCount - 1);
    }
    
    throw error;
  }
};

/**
 * Close MongoDB connection gracefully
 */
const closeDB = async () => {
  try {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
  } catch (error) {
    logger.error('Error closing MongoDB connection', { error: error.message });
    throw error;
  }
};

module.exports = {
  connectDB,
  closeDB,
};