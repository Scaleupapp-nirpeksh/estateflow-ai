const Tenant = require('../models/tenant.model');
const { ApiError } = require('../utils/error-handler');
const logger = require('../utils/logger');

/**
 * Get tenant by ID
 * @param {string} id - Tenant ID
 * @returns {Promise<Tenant>} - Tenant object
 */
const getTenantById = async (id) => {
    try {
        const tenant = await Tenant.findById(id);
        if (!tenant) {
            throw new ApiError(404, 'Tenant not found');
        }
        return tenant;
    } catch (error) {
        logger.error('Error getting tenant', { error, tenantId: id });
        throw error;
    }
};

/**
 * Update tenant
 * @param {string} id - Tenant ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Tenant>} - Updated tenant
 */
const updateTenant = async (id, updateData) => {
    try {
        // Find tenant
        const tenant = await getTenantById(id);

        // Fields that cannot be updated directly
        const restrictedFields = ['subscription', 'active'];

        // Remove restricted fields from update data
        restrictedFields.forEach((field) => {
            if (updateData[field]) {
                delete updateData[field];
            }
        });

        // Update tenant
        Object.keys(updateData).forEach((key) => {
            tenant[key] = updateData[key];
        });

        const updatedTenant = await tenant.save();
        return updatedTenant;
    } catch (error) {
        logger.error('Error updating tenant', { error, tenantId: id });
        throw error;
    }
};

/**
 * Update tenant business rules
 * @param {string} id - Tenant ID
 * @param {Object} businessRules - Business rules to update
 * @returns {Promise<Object>} - Updated business rules
 */
const updateBusinessRules = async (id, businessRules) => {
    try {
        const tenant = await getTenantById(id);

        // Update business rules
        tenant.settings.businessRules = {
            ...tenant.settings.businessRules,
            ...businessRules,
        };

        await tenant.save();
        return tenant.settings.businessRules;
    } catch (error) {
        logger.error('Error updating business rules', { error, tenantId: id });
        throw error;
    }
};

/**
 * Update tenant subscription
 * @param {string} id - Tenant ID
 * @param {Object} subscriptionData - Subscription data from request body
 * @returns {Promise<Object>} - Updated subscription
 */
const updateSubscription = async (id, subscriptionData) => {
    try {
        const tenant = await getTenantById(id);

        // --- Revised Logic ---

        // 1. Ensure tenant.subscription exists and is an object
        if (!tenant.subscription || typeof tenant.subscription !== 'object') {
            // If it doesn't exist or isn't an object, initialize it.
            // Mark the path as modified if you initialize it.
            tenant.subscription = {};
            tenant.markModified('subscription'); // Important if initializing!
        }

        // 2. Update plan and expiresAt if provided in the request body
        if (subscriptionData.plan) {
            tenant.subscription.plan = subscriptionData.plan;
        }
        if (subscriptionData.expiresAt) {
            tenant.subscription.expiresAt = subscriptionData.expiresAt;
        }

        // 3. Determine the plan to use for setting limits (could be the newly set one or existing)
        const planToUse = tenant.subscription.plan;

        // 4. Ensure tenant.subscription.limits exists and is an object before setting properties
        if (!tenant.subscription.limits || typeof tenant.subscription.limits !== 'object') {
            tenant.subscription.limits = {};
            // No need to markModified('subscription.limits') here if the whole 'subscription' was already marked,
            // or if the switch statement below definitely assigns a new object.
            // If the switch statement might NOT assign anything, you would markModified here.
        }

        // 5. Update limits based on the determined plan
        switch (planToUse) {
            case 'Starter':
                tenant.subscription.limits = {
                    storageGB: 100,
                    aiMessagesPerMonth: 25000,
                };
                break;
            case 'Growth':
                tenant.subscription.limits = {
                    storageGB: 1000,
                    aiMessagesPerMonth: 250000,
                };
                break;
            case 'Premium':
                tenant.subscription.limits = {
                    storageGB: 1000,
                    aiMessagesPerMonth: 500000,
                };
                break;
            case 'Signature':
                tenant.subscription.limits = {
                    storageGB: 2000,
                    aiMessagesPerMonth: 750000,
                };
                break;
            default:
                // Handle unrecognized or missing plan - maybe keep existing limits or set default?
                // Setting Starter as default here based on your original code.
                logger.warn(`Unrecognized or missing plan '${planToUse}' for tenant ${id}. Setting default limits.`);
                tenant.subscription.limits = {
                    storageGB: 100,
                    aiMessagesPerMonth: 25000,
                };
                break;
        }

        // --- End Revised Logic ---

        // Optional: Log the object state just before saving for debugging
        logger.debug('Tenant object before save:', { tenantObject: tenant.toObject() });
        logger.debug('Modified paths:', { modifiedPaths: tenant.modifiedPaths() });


        await tenant.save(); // Now save the incrementally modified tenant
        return tenant.subscription;

    } catch (error) {
        // Log the specific validation error if available
        if (error.name === 'ValidationError') {
            logger.error('Tenant validation failed during subscription update', {
                error: error.errors, // Log the specific field errors
                tenantId: id,
                requestBody: subscriptionData
            });
        } else {
            logger.error('Error updating subscription', { error, tenantId: id });
        }
        throw error; // Re-throw the original error
    }
};

/**
 * Activate or deactivate a tenant
 * @param {string} id - Tenant ID
 * @param {boolean} active - Active status
 * @returns {Promise<Tenant>} - Updated tenant
 */
const setTenantStatus = async (id, active) => {
    try {
        const tenant = await getTenantById(id);
        tenant.active = active;
        await tenant.save();
        return tenant;
    } catch (error) {
        logger.error('Error setting tenant status', { error, tenantId: id });
        throw error;
    }
};

module.exports = {
    getTenantById,
    updateTenant,
    updateBusinessRules,
    updateSubscription,
    setTenantStatus,
};