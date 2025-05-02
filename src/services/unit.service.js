const mongoose = require('mongoose');
const Unit = require('../models/unit.model');
const Tower = require('../models/tower.model');
const Project = require('../models/project.model');
const Tenant = require('../models/tenant.model');
const UnitTypeRule = require('../models/unit-type-rule.model');
const pricingUtils = require('../utils/pricing-utils');
const { ApiError } = require('../utils/error-handler');
const logger = require('../utils/logger');

/**
 * Create a new unit
 * @param {Object} unitData - Unit data
 * @returns {Promise<Unit>} - Created unit
 */
const createUnit = async (unitData) => {
    try {
        // Verify tower exists
        const tower = await Tower.findById(unitData.towerId);

        if (!tower) {
            throw new ApiError(404, 'Tower not found');
        }

        // Verify tenant and project ID match
        if (tower.tenantId.toString() !== unitData.tenantId.toString()) {
            throw new ApiError(400, 'Tenant ID does not match tower\'s tenant');
        }

        if (tower.projectId.toString() !== unitData.projectId.toString()) {
            throw new ApiError(400, 'Project ID does not match tower\'s project');
        }

        // Create unit
        const unit = new Unit(unitData);
        await unit.save();
        return unit;
    } catch (error) {
        logger.error('Error creating unit', { error });
        throw error;
    }
};

/**
 * Create multiple units at once
 * @param {Array} unitsData - Array of unit data
 * @returns {Promise<Array>} - Created units
 */
const createBulkUnits = async (unitsData) => {
    try {
        // Verify all units have the same project and tower
        if (unitsData.length === 0) {
            throw new ApiError(400, 'No units provided');
        }

        const firstUnit = unitsData[0];
        const { projectId, towerId, tenantId } = firstUnit;

        // Verify all units have the same project, tower, and tenant
        const isValid = unitsData.every(
            unit =>
                unit.projectId === projectId &&
                unit.towerId === towerId &&
                unit.tenantId === tenantId
        );

        if (!isValid) {
            throw new ApiError(400, 'All units must belong to the same project and tower');
        }

        // Verify tower exists
        const tower = await Tower.findById(towerId);

        if (!tower) {
            throw new ApiError(404, 'Tower not found');
        }

        // Verify tenant and project ID match
        if (tower.tenantId.toString() !== tenantId) {
            throw new ApiError(400, 'Tenant ID does not match tower\'s tenant');
        }

        if (tower.projectId.toString() !== projectId) {
            throw new ApiError(400, 'Project ID does not match tower\'s project');
        }

        // Check for duplicate unit numbers
        const unitNumbers = unitsData.map(unit => unit.number);
        const uniqueNumbers = new Set(unitNumbers);

        if (unitNumbers.length !== uniqueNumbers.size) {
            throw new ApiError(400, 'Duplicate unit numbers detected');
        }

        // Check if any unit numbers already exist in this tower
        const existingUnits = await Unit.find({
            towerId,
            number: { $in: unitNumbers },
        });

        if (existingUnits.length > 0) {
            throw new ApiError(400, 'Some unit numbers already exist in this tower');
        }

        // Create units
        const units = await Unit.insertMany(unitsData);
        return units;
    } catch (error) {
        logger.error('Error creating bulk units', { error });
        throw error;
    }
};

/**
 * Get units with filtering options
 * @param {Object} query - Query parameters
 * @param {Object} pagination - Pagination options
 * @returns {Promise<Object>} - Units with pagination info
 */
const getUnits = async (query = {}, pagination = { page: 1, limit: 20 }) => {
    try {
        const { page, limit } = pagination;
        const skip = (page - 1) * limit;

        // Build MongoDB query
        const mongoQuery = {};

        // Mandatory tenant filter
        if (query.tenantId) {
            mongoQuery.tenantId = query.tenantId;
        }

        // Project filter
        if (query.projectId) {
            mongoQuery.projectId = query.projectId;
        }

        // Tower filter
        if (query.towerId) {
            mongoQuery.towerId = query.towerId;
        }

        // Status filter
        if (query.status) {
            mongoQuery.status = query.status;
        }

        // Type filter
        if (query.type) {
            mongoQuery.type = query.type;
        }

        // Floor filter
        if (query.floor) {
            mongoQuery.floor = parseInt(query.floor, 10);
        }

        // Area range filter
        if (query.minArea || query.maxArea) {
            mongoQuery.carpetArea = {};

            if (query.minArea) {
                mongoQuery.carpetArea.$gte = parseInt(query.minArea, 10);
            }

            if (query.maxArea) {
                mongoQuery.carpetArea.$lte = parseInt(query.maxArea, 10);
            }
        }

        // Price range filter
        if (query.minPrice || query.maxPrice) {
            mongoQuery.basePrice = {};

            if (query.minPrice) {
                mongoQuery.basePrice.$gte = parseInt(query.minPrice, 10);
            }

            if (query.maxPrice) {
                mongoQuery.basePrice.$lte = parseInt(query.maxPrice, 10);
            }
        }

        // View filter
        if (query.view) {
            mongoQuery.views = query.view;
        }

        // Count total documents
        const total = await Unit.countDocuments(mongoQuery);

        // Determine sort order
        let sort = { floor: -1, number: 1 }; // Default sort

        if (query.sort) {
            switch (query.sort) {
                case 'price_asc':
                    sort = { basePrice: 1 };
                    break;
                case 'price_desc':
                    sort = { basePrice: -1 };
                    break;
                case 'area_asc':
                    sort = { carpetArea: 1 };
                    break;
                case 'area_desc':
                    sort = { carpetArea: -1 };
                    break;
                // Keep default for any other value
            }
        }

        // Execute query with pagination
        const units = await Unit.find(mongoQuery)
            .populate('projectId', 'name city')
            .populate('towerId', 'name')
            .sort(sort)
            .skip(skip)
            .limit(limit);

        return {
            data: units,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
            },
        };
    } catch (error) {
        logger.error('Error getting units', { error });
        throw error;
    }
};

/**
 * Get unit by ID with detailed information
 * @param {string} id - Unit ID
 * @returns {Promise<Object>} - Unit with additional details
 */
const getUnitById = async (id) => {
    try {
        const unit = await Unit.findById(id)
            .populate('projectId', 'name city address gstRate stampDutyRate registrationRate')
            .populate('towerId', 'name construction premiums');

        if (!unit) {
            throw new ApiError(404, 'Unit not found');
        }

        // Calculate price with all premiums
        const priceDetails = await unit.calculatePrice();

        const unitObj = unit.toObject();
        unitObj.priceDetails = priceDetails;

        return unitObj;
    } catch (error) {
        logger.error('Error getting unit', { error, unitId: id });
        throw error;
    }
};

/**
 * Update unit
 * @param {string} id - Unit ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Unit>} - Updated unit
 */
const updateUnit = async (id, updateData) => {
    try {
        const unit = await Unit.findById(id);

        if (!unit) {
            throw new ApiError(404, 'Unit not found');
        }

        // Fields that cannot be updated directly
        const restrictedFields = ['tenantId', 'projectId', 'towerId', 'status', 'lockedUntil', 'lockedBy'];

        // Remove restricted fields from update data
        restrictedFields.forEach((field) => {
            if (updateData[field]) {
                delete updateData[field];
            }
        });

        // Update unit
        Object.keys(updateData).forEach((key) => {
            unit[key] = updateData[key];
        });

        await unit.save();
        return unit;
    } catch (error) {
        logger.error('Error updating unit', { error, unitId: id });
        throw error;
    }
};

/**
 * Calculate unit price with all premiums and taxes
 * @param {string} id - Unit ID
 * @param {Object} options - Custom calculation options
 * @returns {Promise<Object>} - Price details
 */
const calculateUnitPrice = async (id, options = {}) => {
    try {
        const unit = await Unit.findById(id)
            .populate('projectId', 'name city address gstRate stampDutyRate registrationRate customPricingModel')
            .populate('towerId', 'name construction premiums');

        if (!unit) {
            throw new ApiError(404, 'Unit not found');
        }

        // Get tenant-specific pricing rules if they exist
        if (!options.ignoreTenantRules) {
            const tenant = await Tenant.findById(unit.tenantId);

            if (tenant && tenant.settings && tenant.settings.pricingRules) {
                // Merge tenant pricing rules with provided options, with options taking precedence
                options = {
                    ...tenant.settings.pricingRules,
                    ...options
                };
            }
        }

        // Check if there's a custom pricing model for this project
        if (!options.ignoreProjectCustomizations && unit.projectId && unit.projectId.customPricingModel) {
            // Merge project pricing rules with options, with options taking precedence
            options = {
                ...unit.projectId.customPricingModel,
                ...options
            };
        }

        // Check if this unit type has specific pricing rules
        if (!options.ignoreUnitTypeRules && unit.type) {
            const unitTypeRules = await UnitTypeRule.findOne({
                tenantId: unit.tenantId,
                projectId: unit.projectId._id,
                unitType: unit.type,
                active: true
            });

            if (unitTypeRules && unitTypeRules.pricingRules) {
                // Merge unit type pricing rules with options, with options taking precedence
                options = {
                    ...unitTypeRules.pricingRules,
                    ...options
                };
            }
        }

        // Generate price breakdown using the enhanced utility with options
        const priceDetails = pricingUtils.generatePriceBreakdown(
            unit,
            unit.towerId,
            unit.projectId,
            options
        );

        // Log price calculation for audit purposes if requested
        if (options.logCalculation) {
            logger.info('Price calculation performed', {
                unitId: unit._id,
                unitNumber: unit.number,
                totalPrice: priceDetails.totalPrice,
                calculatedBy: options.calculatedBy || 'system',
                calculationOptions: options
            });
        }

        return priceDetails;
    } catch (error) {
        logger.error('Error calculating unit price', { error, unitId: id });
        throw error;
    }
};

/**
 * Lock a unit for a potential buyer
 * @param {string} id - Unit ID
 * @param {string} userId - User ID
 * @param {number} minutes - Lock duration in minutes
 * @returns {Promise<Unit>} - Locked unit
 */
const lockUnit = async (id, userId, minutes = 60) => {
    try {
        const unit = await Unit.findById(id);

        if (!unit) {
            throw new ApiError(404, 'Unit not found');
        }

        if (unit.status !== 'available') {
            throw new ApiError(400, `Unit is not available. Current status: ${unit.status}`);
        }

        // Get tenant settings for lock period if not specified
        if (!minutes) {
            const tenant = await Tenant.findById(unit.tenantId);
            if (tenant && tenant.settings && tenant.settings.businessRules) {
                minutes = tenant.settings.businessRules.lockPeriodMinutes || 60;
            } else {
                minutes = 60; // Default
            }
        }

        return await unit.lock(userId, minutes);
    } catch (error) {
        logger.error('Error locking unit', { error, unitId: id });
        throw error;
    }
};

/**
 * Release a locked unit
 * @param {string} id - Unit ID
 * @returns {Promise<Unit>} - Released unit
 */
const releaseUnit = async (id) => {
    try {
        const unit = await Unit.findById(id);

        if (!unit) {
            throw new ApiError(404, 'Unit not found');
        }

        if (unit.status !== 'locked') {
            throw new ApiError(400, `Unit is not locked. Current status: ${unit.status}`);
        }

        return await unit.release();
    } catch (error) {
        logger.error('Error releasing unit', { error, unitId: id });
        throw error;
    }
};

/**
 * Change unit status
 * @param {string} id - Unit ID
 * @param {string} status - New status
 * @param {Object} data - Additional data
 * @returns {Promise<Unit>} - Updated unit
 */
const changeUnitStatus = async (id, status, data = {}) => {
    try {
        const unit = await Unit.findById(id);

        if (!unit) {
            throw new ApiError(404, 'Unit not found');
        }

        // Status transition validation
        const validTransitions = {
            available: ['locked'],
            locked: ['available', 'booked'],
            booked: ['available', 'sold'],
            sold: [],
        };

        if (!validTransitions[unit.status].includes(status)) {
            throw new ApiError(400, `Cannot change status from ${unit.status} to ${status}`);
        }

        // Process based on target status
        switch (status) {
            case 'available':
                if (unit.status === 'locked') {
                    return await unit.release();
                } else if (unit.status === 'booked') {
                    // Cancel booking
                    unit.status = 'available';
                    await unit.save();
                    return unit;
                }
                break;

            case 'locked':
                if (!data.userId) {
                    throw new ApiError(400, 'User ID is required to lock a unit');
                }
                return await unit.lock(data.userId, data.minutes);

            case 'booked':
                if (!data.bookingId) {
                    throw new ApiError(400, 'Booking ID is required to book a unit');
                }
                return await unit.book(data.bookingId);

            case 'sold':
                return await unit.sell();
        }

        return unit;
    } catch (error) {
        logger.error('Error changing unit status', { error, unitId: id });
        throw error;
    }
};

/**
 * Delete unit
 * @param {string} id - Unit ID
 * @returns {Promise<boolean>} - Success status
 */
const deleteUnit = async (id) => {
    try {
        const unit = await Unit.findById(id);

        if (!unit) {
            throw new ApiError(404, 'Unit not found');
        }

        // Only allow deletion of available units
        if (unit.status !== 'available') {
            throw new ApiError(400, `Cannot delete unit with status: ${unit.status}`);
        }

        const result = await Unit.deleteOne({ _id: id });

        if (result.deletedCount === 0) {
            throw new ApiError(404, 'Unit not found');
        }

        return true;
    } catch (error) {
        logger.error('Error deleting unit', { error, unitId: id });
        throw error;
    }
};

module.exports = {
    createUnit,
    createBulkUnits,
    getUnits,
    getUnitById,
    updateUnit,
    calculateUnitPrice,
    lockUnit,
    releaseUnit,
    changeUnitStatus,
    deleteUnit,
};