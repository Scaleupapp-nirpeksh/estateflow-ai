const mongoose = require('mongoose');
const Tower = require('../models/tower.model');
const Unit = require('../models/unit.model');
const Project = require('../models/project.model');
const { ApiError } = require('../utils/error-handler');
const logger = require('../utils/logger');

/**
 * Create a new tower
 * @param {Object} towerData - Tower data
 * @returns {Promise<Tower>} - Created tower
 */
const createTower = async (towerData) => {
    try {
        // Verify project exists
        const project = await Project.findById(towerData.projectId);

        if (!project) {
            throw new ApiError(404, 'Project not found');
        }

        // Verify tenant ID matches
        if (project.tenantId.toString() !== towerData.tenantId.toString()) {
            throw new ApiError(400, 'Tenant ID does not match project\'s tenant');
        }

        const tower = new Tower(towerData);
        await tower.save();
        return tower;
    } catch (error) {
        logger.error('Error creating tower', { error });
        throw error;
    }
};

/**
 * Get towers by project
 * @param {string} projectId - Project ID
 * @param {Object} filters - Filter options
 * @param {Object} pagination - Pagination options
 * @returns {Promise<Object>} - Towers with pagination info
 */
const getTowers = async (projectId, filters = {}, pagination = { page: 1, limit: 10 }) => {
    try {
        const { page, limit } = pagination;
        const skip = (page - 1) * limit;

        // Build query
        const query = { projectId };

        // Add construction status filter if provided
        if (filters.constructionStatus) {
            query['construction.status'] = filters.constructionStatus;
        }

        // Add active filter if provided
        if (filters.active !== undefined) {
            query.active = filters.active;
        }

        // Count total documents
        const total = await Tower.countDocuments(query);

        // Execute query with pagination
        const towers = await Tower.find(query)
            .sort({ name: 1 })
            .skip(skip)
            .limit(limit);

        // Add unit counts to each tower
        const towersWithCounts = await Promise.all(
            towers.map(async (tower) => {
                const totalUnits = await Unit.countDocuments({ towerId: tower._id });
                const availableUnits = await Unit.countDocuments({
                    towerId: tower._id,
                    status: 'available',
                });

                const towerObj = tower.toObject();
                towerObj.totalUnits = totalUnits;
                towerObj.availableUnits = availableUnits;

                return towerObj;
            })
        );

        return {
            data: towersWithCounts,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
            },
        };
    } catch (error) {
        logger.error('Error getting towers', { error, projectId });
        throw error;
    }
};

/**
 * Get tower by ID with detailed information
 * @param {string} id - Tower ID
 * @returns {Promise<Object>} - Tower with additional details
 */
const getTowerById = async (id) => {
    try {
        const tower = await Tower.findById(id).populate('projectId', 'name city');

        if (!tower) {
            throw new ApiError(404, 'Tower not found');
        }

        // Get unit statistics
        const totalUnits = await Unit.countDocuments({ towerId: id });
        const availableUnits = await Unit.countDocuments({
            towerId: id,
            status: 'available',
        });
        const bookedUnits = await Unit.countDocuments({
            towerId: id,
            status: 'booked',
        });
        const soldUnits = await Unit.countDocuments({
            towerId: id,
            status: 'sold',
        });

        // Get unit types and their counts
        const unitTypes = await Unit.aggregate([
            { $match: { towerId: new mongoose.Types.ObjectId(id) } },
            { $group: { _id: '$type', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]);

        // Get units by floor
        const unitsByFloor = await Unit.aggregate([
            { $match: { towerId: new mongoose.Types.ObjectId(id) } },
            { $sort: { number: 1 } },
            {
                $group: {
                    _id: '$floor',
                    units: {
                        $push: {
                            _id: '$_id',
                            number: '$number',
                            type: '$type',
                            status: '$status',
                            carpetArea: '$carpetArea',
                            basePrice: '$basePrice',
                        },
                    },
                },
            },
            { $sort: { _id: -1 } }, // Sort by floor descending
        ]);

        const towerObj = tower.toObject();
        towerObj.unitStats = {
            total: totalUnits,
            available: availableUnits,
            booked: bookedUnits,
            sold: soldUnits,
            types: unitTypes.map(type => ({
                type: type._id,
                count: type.count,
            })),
        };
        towerObj.unitsByFloor = unitsByFloor.map(floor => ({
            floor: floor._id,
            units: floor.units,
        }));

        return towerObj;
    } catch (error) {
        logger.error('Error getting tower', { error, towerId: id });
        throw error;
    }
};

/**
 * Update tower
 * @param {string} id - Tower ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Tower>} - Updated tower
 */
const updateTower = async (id, updateData) => {
    try {
        const tower = await Tower.findById(id);

        if (!tower) {
            throw new ApiError(404, 'Tower not found');
        }

        // Fields that cannot be updated directly
        const restrictedFields = ['tenantId', 'projectId'];

        // Remove restricted fields from update data
        restrictedFields.forEach((field) => {
            if (updateData[field]) {
                delete updateData[field];
            }
        });

        // Update tower
        Object.keys(updateData).forEach((key) => {
            tower[key] = updateData[key];
        });

        await tower.save();
        return tower;
    } catch (error) {
        logger.error('Error updating tower', { error, towerId: id });
        throw error;
    }
};

/**
 * Update tower construction status
 * @param {string} id - Tower ID
 * @param {Object} constructionData - Construction data
 * @returns {Promise<Tower>} - Updated tower
 */
const updateConstructionStatus = async (id, constructionData) => {
    try {
        const tower = await Tower.findById(id);

        if (!tower) {
            throw new ApiError(404, 'Tower not found');
        }

        // Update construction data
        tower.construction = {
            ...tower.construction,
            ...constructionData,
        };

        await tower.save();
        return tower;
    } catch (error) {
        logger.error('Error updating construction status', { error, towerId: id });
        throw error;
    }
};

/**
 * Update tower premium rules
 * @param {string} id - Tower ID
 * @param {Object} premiumData - Premium data
 * @returns {Promise<Tower>} - Updated tower
 */
const updatePremiums = async (id, premiumData) => {
    try {
        const tower = await Tower.findById(id);

        if (!tower) {
            throw new ApiError(404, 'Tower not found');
        }

        // Update premiums
        if (premiumData.floorRise) {
            tower.premiums.floorRise = {
                ...tower.premiums.floorRise,
                ...premiumData.floorRise,
            };
        }

        if (premiumData.viewPremium) {
            tower.premiums.viewPremium = premiumData.viewPremium;
        }

        await tower.save();
        return tower;
    } catch (error) {
        logger.error('Error updating tower premiums', { error, towerId: id });
        throw error;
    }
};

/**
 * Delete tower
 * @param {string} id - Tower ID
 * @returns {Promise<boolean>} - Success status
 */
const deleteTower = async (id) => {
    try {
        // Check if tower has any units
        const unitCount = await Unit.countDocuments({ towerId: id });

        if (unitCount > 0) {
            throw new ApiError(400, 'Cannot delete tower with existing units');
        }

        const result = await Tower.deleteOne({ _id: id });

        if (result.deletedCount === 0) {
            throw new ApiError(404, 'Tower not found');
        }

        return true;
    } catch (error) {
        logger.error('Error deleting tower', { error, towerId: id });
        throw error;
    }
};

module.exports = {
    createTower,
    getTowers,
    getTowerById,
    updateTower,
    updateConstructionStatus,
    updatePremiums,
    deleteTower,
};