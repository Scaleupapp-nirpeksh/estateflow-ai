const cron = require('node-cron');
const { scheduleUnitLockJob } = require('./unit-lock.job');
const logger = require('../utils/logger');

/**
 * Initialize all background jobs
 */
const initializeJobs = () => {
    try {
        // Schedule unit lock release job
        scheduleUnitLockJob(cron);

        // Add more jobs here as they are implemented

        logger.info('All background jobs initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize background jobs', { error });
        throw error;
    }
};

module.exports = {
    initializeJobs,
};