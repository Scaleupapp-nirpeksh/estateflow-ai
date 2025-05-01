const Unit = require('../models/unit.model');
const logger = require('../utils/logger');

/**
 * Job to release expired unit locks
 * This should be run regularly to ensure units don't remain locked indefinitely
 */
const releaseExpiredLocks = async () => {
    try {
        const now = new Date();

        // Find all units with expired locks
        const expiredLocks = await Unit.find({
            status: 'locked',
            lockedUntil: { $lt: now },
        });

        if (expiredLocks.length === 0) {
            logger.info('No expired unit locks found');
            return { released: 0 };
        }

        // Release each expired lock
        let releasedCount = 0;

        for (const unit of expiredLocks) {
            try {
                unit.status = 'available';
                unit.lockedBy = null;
                unit.lockedUntil = null;
                await unit.save();
                releasedCount++;

                logger.info(`Released expired lock for unit ${unit.number}`, {
                    unitId: unit._id,
                    towerId: unit.towerId,
                    projectId: unit.projectId,
                });
            } catch (error) {
                logger.error(`Failed to release lock for unit ${unit.number}`, {
                    error,
                    unitId: unit._id,
                });
            }
        }

        logger.info(`Released ${releasedCount} expired unit locks`);
        return { released: releasedCount };
    } catch (error) {
        logger.error('Error releasing expired unit locks', { error });
        throw error;
    }
};

/**
 * Schedule function to set up the job on a regular interval
 * @param {Object} scheduler - Scheduler object (e.g., node-cron)
 */
const scheduleUnitLockJob = (scheduler) => {
    // Run every 5 minutes
    scheduler.schedule('*/5 * * * *', async () => {
        try {
            logger.info('Running expired unit lock release job');
            const result = await releaseExpiredLocks();
            logger.info('Completed expired unit lock release job', result);
        } catch (error) {
            logger.error('Failed to run expired unit lock release job', { error });
        }
    });

    logger.info('Scheduled unit lock release job to run every 5 minutes');
};

module.exports = {
    releaseExpiredLocks,
    scheduleUnitLockJob,
};