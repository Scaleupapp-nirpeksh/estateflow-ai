// src/services/unit.service.js

const mongoose = require('mongoose');
const Unit = require('../models/unit.model');
const Tower = require('../models/tower.model'); // For validation and context
const Project = require('../models/project.model'); // For validation and context
const Tenant = require('../models/tenant.model'); // For lock period settings
const UnitTypeRule = require('../models/unit-type-rule.model'); // For pricing
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
        // Validate required IDs
        if (!unitData.towerId || !mongoose.Types.ObjectId.isValid(unitData.towerId)) {
            throw new ApiError(400, 'Valid Tower ID is required.');
        }
        if (!unitData.projectId || !mongoose.Types.ObjectId.isValid(unitData.projectId)) {
            throw new ApiError(400, 'Valid Project ID is required.');
        }
        if (!unitData.tenantId || !mongoose.Types.ObjectId.isValid(unitData.tenantId)) {
            throw new ApiError(400, 'Valid Tenant ID is required.');
        }

        const towerObjectId = new mongoose.Types.ObjectId(unitData.towerId);
        const tower = await Tower.findById(towerObjectId);
        if (!tower) {
            throw new ApiError(404, 'Tower not found for the unit.');
        }

        // Verify consistency of IDs
        if (tower.tenantId.toString() !== unitData.tenantId.toString()) {
            throw new ApiError(400, "Unit's tenant ID must match the tower's tenant ID.");
        }
        if (tower.projectId.toString() !== unitData.projectId.toString()) {
            throw new ApiError(400, "Unit's project ID must match the tower's project ID.");
        }

        // Check for duplicate unit number within the same tower
        const existingUnit = await Unit.findOne({
            towerId: towerObjectId,
            number: unitData.number,
            tenantId: new mongoose.Types.ObjectId(unitData.tenantId) // Ensure tenant scope for uniqueness
        });
        if (existingUnit) {
            throw new ApiError(400, `Unit number "${unitData.number}" already exists in tower "${tower.name}".`);
        }


        const unit = new Unit({
            ...unitData,
            tenantId: new mongoose.Types.ObjectId(unitData.tenantId),
            projectId: new mongoose.Types.ObjectId(unitData.projectId),
            towerId: towerObjectId,
        });
        await unit.save();
        return unit;
    } catch (error) {
        logger.error('Error creating unit', {
            message: error.message,
            stack: error.stack,
            unitData: JSON.stringify(unitData)
        });
        if (error.name === 'ValidationError') {
            logger.error('Unit Validation Error details:', error.errors);
        }
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
        if (!unitsData || unitsData.length === 0) {
            throw new ApiError(400, 'No units data provided for bulk creation.');
        }

        const firstUnit = unitsData[0];
        if (!firstUnit.towerId || !mongoose.Types.ObjectId.isValid(firstUnit.towerId) ||
            !firstUnit.projectId || !mongoose.Types.ObjectId.isValid(firstUnit.projectId) ||
            !firstUnit.tenantId || !mongoose.Types.ObjectId.isValid(firstUnit.tenantId)) {
            throw new ApiError(400, 'Valid Tower ID, Project ID, and Tenant ID are required for all units in bulk creation.');
        }

        const towerObjectId = new mongoose.Types.ObjectId(firstUnit.towerId);
        const projectObjectId = new mongoose.Types.ObjectId(firstUnit.projectId);
        const tenantObjectId = new mongoose.Types.ObjectId(firstUnit.tenantId);

        const tower = await Tower.findById(towerObjectId);
        if (!tower) throw new ApiError(404, `Tower with ID ${firstUnit.towerId} not found.`);
        if (tower.tenantId.toString() !== tenantObjectId.toString() || tower.projectId.toString() !== projectObjectId.toString()) {
            throw new ApiError(400, 'All units in bulk must belong to the same project and tower, consistent with the tower record.');
        }

        const unitsToInsert = [];
        const unitNumbersInBatch = new Set();

        for (const unitData of unitsData) {
            if (unitData.towerId.toString() !== towerObjectId.toString() ||
                unitData.projectId.toString() !== projectObjectId.toString() ||
                unitData.tenantId.toString() !== tenantObjectId.toString()) {
                throw new ApiError(400, 'All units in bulk request must share the same tower, project, and tenant ID as the first unit.');
            }
            if (unitNumbersInBatch.has(unitData.number)) {
                throw new ApiError(400, `Duplicate unit number "${unitData.number}" found within the bulk request.`);
            }
            unitNumbersInBatch.add(unitData.number);
            unitsToInsert.push({
                ...unitData, // Spread original data
                tenantId: tenantObjectId, // Ensure ObjectIds
                projectId: projectObjectId,
                towerId: towerObjectId,
            });
        }

        const existingUnitNumbers = (await Unit.find({ towerId: towerObjectId, number: { $in: Array.from(unitNumbersInBatch) } }, { number: 1 })).map(u => u.number);
        if (existingUnitNumbers.length > 0) {
            throw new ApiError(400, `Some unit numbers already exist in tower "${tower.name}": ${existingUnitNumbers.join(', ')}.`);
        }

        const units = await Unit.insertMany(unitsToInsert, { ordered: false }); // ordered:false allows valid ones to insert if some fail
        return units;
    } catch (error) {
        logger.error('Error creating bulk units', { message: error.message, stack: error.stack });
        if (error.name === 'BulkWriteError') { // Mongoose bulk insert error
            const writeErrors = error.writeErrors?.map(e => `Unit ${e.op?.number || e.op?._id}: ${e.errmsg}`).join('; ') || 'Bulk write failed.';
            logger.error('BulkWriteError details:', writeErrors);
            throw new ApiError(400, `Bulk unit creation failed: ${writeErrors}`);
        }
        throw error;
    }
};


/**
 * Get units with filtering options
 * @param {Object} queryParams - Query parameters (includes tenantId)
 * @param {Object} pagination - Pagination options
 * @returns {Promise<Object>} - Units with pagination info
 */
const getUnits = async (queryParams = {}, pagination = { page: 1, limit: 20 }) => {
    try {
        const { page, limit } = pagination;
        const skip = (page - 1) * limit;

        if (!queryParams.tenantId || !mongoose.Types.ObjectId.isValid(queryParams.tenantId)) {
            throw new ApiError(400, 'Valid Tenant ID is required for querying units.');
        }
        const mongoQuery = { tenantId: new mongoose.Types.ObjectId(queryParams.tenantId) };

        if (queryParams.projectId && mongoose.Types.ObjectId.isValid(queryParams.projectId)) {
            mongoQuery.projectId = new mongoose.Types.ObjectId(queryParams.projectId);
        }
        if (queryParams.towerId && mongoose.Types.ObjectId.isValid(queryParams.towerId)) {
            mongoQuery.towerId = new mongoose.Types.ObjectId(queryParams.towerId);
        }
        if (queryParams.status) mongoQuery.status = queryParams.status;
        if (queryParams.type) mongoQuery.type = { $regex: new RegExp(queryParams.type, 'i') }; // Case-insensitive type search
        if (queryParams.number) mongoQuery.number = queryParams.number; // Exact match for unit number

        if (queryParams.floor !== undefined) mongoQuery.floor = parseInt(queryParams.floor, 10);

        if (queryParams.minArea || queryParams.maxArea) {
            mongoQuery.carpetArea = {};
            if (queryParams.minArea) mongoQuery.carpetArea.$gte = parseInt(queryParams.minArea, 10);
            if (queryParams.maxArea) mongoQuery.carpetArea.$lte = parseInt(queryParams.maxArea, 10);
        }
        if (queryParams.minPrice || queryParams.maxPrice) {
            mongoQuery.basePrice = {}; // Assuming basePrice is the filterable price field
            if (queryParams.minPrice) mongoQuery.basePrice.$gte = parseFloat(queryParams.minPrice);
            if (queryParams.maxPrice) mongoQuery.basePrice.$lte = parseFloat(queryParams.maxPrice);
        }
        if (queryParams.view) mongoQuery.views = { $regex: new RegExp(queryParams.view, 'i') };

        logger.debug('[unitService.getUnits] Executing query:', JSON.stringify(mongoQuery));
        const total = await Unit.countDocuments(mongoQuery);

        let sort = { floor: -1, number: 1 };
        if (queryParams.sort) {
            switch (queryParams.sort) {
                case 'price_asc': sort = { basePrice: 1 }; break;
                case 'price_desc': sort = { basePrice: -1 }; break;
                case 'area_asc': sort = { carpetArea: 1 }; break;
                case 'area_desc': sort = { carpetArea: -1 }; break;
            }
        }

        const units = await Unit.find(mongoQuery)
            .populate('projectId', 'name city')
            .populate('towerId', 'name')
            .sort(sort)
            .skip(skip)
            .limit(limit);

        return {
            data: units,
            pagination: { total, page, limit, pages: Math.ceil(total / limit) },
        };
    } catch (error) {
        logger.error('Error getting units', {
            message: error.message,
            stack: error.stack,
            queryParams: JSON.stringify(queryParams)
        });
        throw error;
    }
};

/**
 * Get unit by ID with detailed information
 * @param {string} id - Unit ID (as string)
 * @returns {Promise<Object>} - Unit with additional details
 */
const getUnitById = async (id) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new ApiError(400, 'Invalid Unit ID format.');
        }
        const unitObjectId = new mongoose.Types.ObjectId(id);
        const unit = await Unit.findById(unitObjectId)
            .populate('projectId', 'name city address gstRate stampDutyRate registrationRate customPricingModel tenantId') // Added tenantId
            .populate('towerId', 'name construction premiums');

        if (!unit) {
            throw new ApiError(404, 'Unit not found');
        }
        if (!unit.projectId || !unit.towerId) {
            throw new ApiError(500, 'Unit found but project/tower details could not be populated.');
        }

        // Ensure tenantId is directly accessible on the unit object for handlers
        const unitObj = unit.toObject();
        unitObj.tenantId = unit.projectId.tenantId; // Assuming project always has tenantId

        // Calculate price with all premiums (using the method from unit model if it exists, or pricingUtils)
        // For consistency, let's use pricingUtils here, assuming unit.calculatePrice might be simpler
        const priceDetails = await calculateUnitPrice(id); // Call the service method which uses pricingUtils
        unitObj.priceDetails = priceDetails;


        return unitObj;
    } catch (error) {
        logger.error('Error getting unit by ID', {
            message: error.message,
            stack: error.stack,
            unitId: id
        });
        throw error;
    }
};

/**
 * Update unit
 * @param {string} id - Unit ID (as string)
 * @param {Object} updateData - Data to update
 * @returns {Promise<Unit>} - Updated unit
 */
const updateUnit = async (id, updateData) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new ApiError(400, 'Invalid Unit ID format.');
        }

        delete updateData.tenantId;
        delete updateData.projectId;
        delete updateData.towerId;
        delete updateData.status; // Status should be changed via changeUnitStatus
        delete updateData.lockedUntil;
        delete updateData.lockedBy;
        delete updateData.createdAt;

        const unit = await Unit.findByIdAndUpdate(
            new mongoose.Types.ObjectId(id),
            { $set: updateData },
            { new: true, runValidators: true }
        ).populate('projectId', 'name').populate('towerId', 'name');

        if (!unit) {
            throw new ApiError(404, 'Unit not found for update');
        }
        return unit;
    } catch (error) {
        logger.error('Error updating unit', {
            message: error.message,
            stack: error.stack,
            unitId: id,
            updateData: JSON.stringify(updateData)
        });
        if (error.name === 'ValidationError') {
            logger.error('Unit Update Validation Error details:', error.errors);
        }
        throw error;
    }
};

/**
 * Calculate unit price with all premiums and taxes using pricingUtils
 * @param {string} unitId - Unit ID (as string)
 * @param {Object} options - Custom calculation options from user/AI
 * @returns {Promise<Object>} - Price details
 */
const calculateUnitPrice = async (unitId, options = {}) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(unitId)) {
            throw new ApiError(400, 'Invalid Unit ID format for price calculation.');
        }
        const unit = await Unit.findById(new mongoose.Types.ObjectId(unitId))
            .populate('projectId', 'name city address gstRate stampDutyRate registrationRate customPricingModel tenantId')
            .populate('towerId', 'name construction premiums');

        if (!unit) throw new ApiError(404, 'Unit not found for price calculation.');
        if (!unit.projectId || !unit.towerId) throw new ApiError(500, 'Unit project/tower details missing for price calculation.');
        if (!unit.projectId.tenantId) throw new ApiError(500, 'Tenant information missing from project for price calculation.');


        const tenant = await Tenant.findById(unit.projectId.tenantId);
        let mergedOptions = { ...options }; // Start with user/AI provided options

        if (tenant?.settings?.pricingRules) {
            mergedOptions = { ...tenant.settings.pricingRules, ...mergedOptions };
        }
        if (unit.projectId?.customPricingModel) {
            mergedOptions = { ...unit.projectId.customPricingModel, ...mergedOptions };
        }
        const unitTypeRules = await UnitTypeRule.findOne({
            tenantId: unit.projectId.tenantId,
            projectId: unit.projectId._id,
            unitType: unit.type,
            active: true
        });
        if (unitTypeRules?.pricingRules) {
            mergedOptions = { ...unitTypeRules.pricingRules, ...mergedOptions };
        }

        // Pass the fully populated unit, tower, project objects to pricingUtils
        const priceDetails = pricingUtils.generatePriceBreakdown(
            unit, // Mongoose document, pricingUtils should handle .toObject() if needed or access properties directly
            unit.towerId,
            unit.projectId,
            mergedOptions // Pass the merged options
        );

        if (options.logCalculation) {
            logger.info('Price calculation performed via unitService', {
                unitId: unit._id, unitNumber: unit.number, totalPrice: priceDetails.totalPrice,
                calculatedBy: options.calculatedBy || 'system', calculationOptions: mergedOptions
            });
        }
        return priceDetails;
    } catch (error) {
        logger.error('Error calculating unit price in service', {
            message: error.message,
            stack: error.stack,
            unitId
        });
        throw error;
    }
};


/**
 * Lock a unit for a potential buyer
 * @param {string} id - Unit ID (as string)
 * @param {string} userId - User ID (as string)
 * @param {number} minutesParam - Lock duration in minutes
 * @returns {Promise<Unit>} - Locked unit
 */
const lockUnit = async (id, userId, minutesParam) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(userId)) {
            throw new ApiError(400, 'Invalid Unit ID or User ID format for locking.');
        }
        const unitObjectId = new mongoose.Types.ObjectId(id);
        const userObjectId = new mongoose.Types.ObjectId(userId);

        const unit = await Unit.findById(unitObjectId).populate('tenantId', 'settings'); // Populate tenant settings
        if (!unit) throw new ApiError(404, 'Unit not found to lock.');
        if (unit.status !== 'available') {
            throw new ApiError(400, `Unit is not available. Current status: ${unit.status}.`);
        }

        let minutes = minutesParam;
        if (minutes === undefined || minutes === null) { // If minutesParam is not passed or explicitly null/undefined
            minutes = unit.tenantId?.settings?.businessRules?.lockPeriodMinutes || 60;
        }

        // The lock method is on the Unit model instance
        return await unit.lock(userObjectId, minutes); // unit.lock should handle saving
    } catch (error) {
        logger.error('Error locking unit', {
            message: error.message,
            stack: error.stack,
            unitId: id,
            userId
        });
        throw error;
    }
};

/**
 * Release a locked unit
 * @param {string} id - Unit ID (as string)
 * @returns {Promise<Unit>} - Released unit
 */
const releaseUnit = async (id) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new ApiError(400, 'Invalid Unit ID format for releasing.');
        }
        const unit = await Unit.findById(new mongoose.Types.ObjectId(id));
        if (!unit) throw new ApiError(404, 'Unit not found to release.');

        // The release method is on the Unit model instance
        return await unit.release(); // unit.release should handle saving
    } catch (error) {
        logger.error('Error releasing unit', {
            message: error.message,
            stack: error.stack,
            unitId: id
        });
        throw error;
    }
};

/**
 * Change unit status
 * @param {string} id - Unit ID (as string)
 * @param {string} status - New status
 * @param {Object} data - Additional data (userId, bookingId, minutes)
 * @returns {Promise<Unit>} - Updated unit
 */
const changeUnitStatus = async (id, status, data = {}) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new ApiError(400, 'Invalid Unit ID format for status change.');
        }
        const unitObjectId = new mongoose.Types.ObjectId(id);
        const unit = await Unit.findById(unitObjectId).populate('tenantId', 'settings'); // Populate tenant for lockUnit default duration

        if (!unit) throw new ApiError(404, 'Unit not found to change status.');

        const validTransitions = {
            available: ['locked'],
            locked: ['available', 'booked'],
            booked: ['available', 'sold'], // 'available' implies cancellation
            sold: [],
        };

        if (!validTransitions[unit.status] || !validTransitions[unit.status].includes(status)) {
            throw new ApiError(400, `Cannot change unit status from "${unit.status}" to "${status}".`);
        }

        let updatedUnit;
        switch (status) {
            case 'available':
                updatedUnit = await unit.release(); // Assumes release handles logic if booked/sold
                break;
            case 'locked':
                if (!data.userId || !mongoose.Types.ObjectId.isValid(data.userId)) {
                    throw new ApiError(400, 'Valid User ID is required to lock a unit.');
                }
                let minutes = data.minutes;
                if (minutes === undefined || minutes === null) {
                    minutes = unit.tenantId?.settings?.businessRules?.lockPeriodMinutes || 60;
                }
                updatedUnit = await unit.lock(new mongoose.Types.ObjectId(data.userId), minutes);
                break;
            case 'booked':
                if (!data.bookingId || !mongoose.Types.ObjectId.isValid(data.bookingId)) {
                    throw new ApiError(400, 'Valid Booking ID is required to book a unit.');
                }
                updatedUnit = await unit.book(new mongoose.Types.ObjectId(data.bookingId));
                break;
            case 'sold':
                updatedUnit = await unit.sell();
                break;
            default:
                throw new ApiError(400, `Unsupported status transition to "${status}".`);
        }
        return updatedUnit;
    } catch (error) {
        logger.error('Error changing unit status', {
            message: error.message,
            stack: error.stack,
            unitId: id,
            newStatus: status
        });
        throw error;
    }
};

/**
 * Delete unit
 * @param {string} id - Unit ID (as string)
 * @returns {Promise<boolean>} - Success status
 */
const deleteUnit = async (id) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new ApiError(400, 'Invalid Unit ID format for deletion.');
        }
        const unitObjectId = new mongoose.Types.ObjectId(id);
        const unit = await Unit.findById(unitObjectId);
        if (!unit) throw new ApiError(404, 'Unit not found for deletion.');

        if (unit.status !== 'available') {
            throw new ApiError(400, `Cannot delete unit. Status is "${unit.status}". Only available units can be deleted.`);
        }
        const result = await Unit.deleteOne({ _id: unitObjectId });
        if (result.deletedCount === 0) { // Should not happen if findById worked, but good check
            throw new ApiError(404, 'Unit not found during deletion attempt, or already deleted.');
        }
        return true;
    } catch (error) {
        logger.error('Error deleting unit', {
            message: error.message,
            stack: error.stack,
            unitId: id
        });
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
