const mongoose = require('mongoose');
const Project = require('../models/project.model');
const Tenant = require('../models/tenant.model');
const UnitTypeRule = require('../models/unit-type-rule.model');
const { ApiError } = require('../utils/error-handler');
const logger = require('../utils/logger');

/**
 * Set tenant-wide pricing rules
 * @param {string} tenantId - Tenant ID
 * @param {Object} pricingRules - Pricing rules
 * @returns {Promise<Object>} - Updated tenant settings
 */
const setTenantPricingRules = async (tenantId, pricingRules) => {
    try {
        const tenant = await Tenant.findById(tenantId);

        if (!tenant) {
            throw new ApiError(404, 'Tenant not found');
        }

        // Initialize settings if they don't exist
        if (!tenant.settings) {
            tenant.settings = {};
        }

        // Set pricing rules
        tenant.settings.pricingRules = pricingRules;

        await tenant.save();
        return tenant.settings;
    } catch (error) {
        logger.error('Error setting tenant pricing rules', { error, tenantId });
        throw error;
    }
};

/**
 * Set project custom pricing model
 * @param {string} projectId - Project ID
 * @param {Object} customPricingModel - Custom pricing model
 * @returns {Promise<Object>} - Updated project
 */
const setProjectPricingModel = async (projectId, customPricingModel) => {
    try {
        const project = await Project.findById(projectId);

        if (!project) {
            throw new ApiError(404, 'Project not found');
        }

        // Set custom pricing model
        project.customPricingModel = customPricingModel;

        await project.save();
        return project;
    } catch (error) {
        logger.error('Error setting project pricing model', { error, projectId });
        throw error;
    }
};

/**
 * Create or update unit type pricing rules
 * @param {Object} ruleData - Unit type rule data
 * @returns {Promise<Object>} - Created or updated rule
 */
const setUnitTypePricingRules = async (ruleData) => {
    try {
        const { tenantId, projectId, unitType, pricingRules } = ruleData;

        // Check if rule already exists
        let rule = await UnitTypeRule.findOne({
            tenantId,
            projectId,
            unitType
        });

        if (rule) {
            // Update existing rule
            rule.pricingRules = pricingRules;
            rule.active = ruleData.active !== undefined ? ruleData.active : rule.active;
        } else {
            // Create new rule
            rule = new UnitTypeRule(ruleData);
        }

        await rule.save();
        return rule;
    } catch (error) {
        logger.error('Error setting unit type pricing rules', { error, ruleData });
        throw error;
    }
};

/**
 * Get all pricing rules for a specific context
 * @param {Object} context - Rule context (tenant, project, unit type)
 * @returns {Promise<Object>} - All applicable pricing rules
 */
const getPricingRules = async (context) => {
    try {
        const { tenantId, projectId, unitType } = context;
        const result = {};

        // Get tenant rules if tenant ID provided
        if (tenantId) {
            const tenant = await Tenant.findById(tenantId);
            if (tenant && tenant.settings && tenant.settings.pricingRules) {
                result.tenantRules = tenant.settings.pricingRules;
            }
        }

        // Get project rules if project ID provided
        if (projectId) {
            const project = await Project.findById(projectId);
            if (project && project.customPricingModel) {
                result.projectRules = project.customPricingModel;
            }
        }

        // Get unit type rules if both tenant ID, project ID and unit type provided
        if (tenantId && projectId && unitType) {
            const unitTypeRule = await UnitTypeRule.findOne({
                tenantId,
                projectId,
                unitType,
                active: true
            });

            if (unitTypeRule && unitTypeRule.pricingRules) {
                result.unitTypeRules = unitTypeRule.pricingRules;
            }
        }

        // Merge all rules with precedence unitType > project > tenant
        result.mergedRules = {
            ...(result.tenantRules || {}),
            ...(result.projectRules || {}),
            ...(result.unitTypeRules || {})
        };

        return result;
    } catch (error) {
        logger.error('Error getting pricing rules', { error, context });
        throw error;
    }
};

/**
 * Delete unit type pricing rule
 * @param {string} ruleId - Rule ID
 * @returns {Promise<boolean>} - Success status
 */
const deleteUnitTypeRule = async (ruleId) => {
    try {
        const result = await UnitTypeRule.deleteOne({ _id: ruleId });

        if (result.deletedCount === 0) {
            throw new ApiError(404, 'Rule not found');
        }

        return true;
    } catch (error) {
        logger.error('Error deleting unit type rule', { error, ruleId });
        throw error;
    }
};

module.exports = {
    setTenantPricingRules,
    setProjectPricingModel,
    setUnitTypePricingRules,
    getPricingRules,
    deleteUnitTypeRule
};