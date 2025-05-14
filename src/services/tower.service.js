// src/services/tower.service.js

const mongoose = require('mongoose');
const Tower = require('../models/tower.model');
const Unit = require('../models/unit.model');
const Project = require('../models/project.model');
const { ApiError } = require('../utils/error-handler');
const logger = require('../utils/logger');

_escapeRegexForTowerName = (string) => { // Renamed for clarity
    if (typeof string !== 'string') return '';
    return string.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

/**
 * Create a new tower
 * @param {Object} towerData - Tower data
 * @returns {Promise<Tower>} - Created tower
 */
const createTower = async (towerData) => {
    try {
        if (!towerData.projectId || !mongoose.Types.ObjectId.isValid(towerData.projectId)) {
            throw new ApiError(400, 'Valid Project ID is required to create a tower.');
        }
        if (!towerData.tenantId || !mongoose.Types.ObjectId.isValid(towerData.tenantId)) {
            throw new ApiError(400, 'Valid Tenant ID is required to create a tower.');
        }

        const projectObjectId = new mongoose.Types.ObjectId(towerData.projectId);
        const tenantObjectId = new mongoose.Types.ObjectId(towerData.tenantId);

        const project = await Project.findById(projectObjectId);
        if (!project) {
            throw new ApiError(404, 'Project not found for the tower.');
        }
        if (project.tenantId.toString() !== tenantObjectId.toString()) {
            throw new ApiError(400, "Tower's tenant ID must match the project's tenant ID.");
        }

        const tower = new Tower({
            ...towerData,
            tenantId: tenantObjectId,
            projectId: projectObjectId
        });
        await tower.save();
        return tower;
    } catch (error) {
        logger.error('Error creating tower', {
            message: error.message,
            stack: error.stack,
            towerData: JSON.stringify(towerData)
        });
        if (error.name === 'ValidationError') {
            logger.error('Tower Validation Error details:', error.errors);
        }
        throw error;
    }
};

/**
 * Get towers by project
 * @param {string} projectId - Project ID (as string)
 * @param {Object} filters - Filter options (can include 'name' for tower name, 'constructionStatus', 'active')
 * @param {Object} pagination - Pagination options
 * @returns {Promise<Object>} - Towers with pagination info
 */
const getTowers = async (projectId, filters = {}, pagination = { page: 1, limit: 10 }) => {
    try {
        const { page, limit } = pagination;
        const skip = (page - 1) * limit;

        if (!mongoose.Types.ObjectId.isValid(projectId)) {
            throw new ApiError(400, 'Invalid Project ID format for filtering towers.');
        }
        const query = { projectId: new mongoose.Types.ObjectId(projectId) };

        if (filters.constructionStatus) {
            query['construction.status'] = filters.constructionStatus;
        }
        if (filters.active !== undefined) {
            query.active = filters.active;
        }

        if (filters.name) {
            // Use an anchored regex for an exact (case-insensitive) match on the name
            const escapedName = _escapeRegexForTowerName(filters.name); // Use the renamed helper
            query.name = { $regex: new RegExp(`^${escapedName}$`, 'i') };
            logger.debug(`[towerService.getTowers] Applied anchored name filter: ${query.name}`);
        }

        logger.debug('[towerService.getTowers] Executing query:', JSON.stringify(query));
        const total = await Tower.countDocuments(query);

        const towers = await Tower.find(query)
            .populate('projectId', 'name tenantId')
            .sort({ name: 1 })
            .skip(skip)
            .limit(limit);

        const towersWithCounts = await Promise.all(
            towers.map(async (tower) => {
                const towerObjectId = new mongoose.Types.ObjectId(tower._id);
                const totalUnits = await Unit.countDocuments({ towerId: towerObjectId });
                const availableUnits = await Unit.countDocuments({
                    towerId: towerObjectId,
                    status: 'available',
                });
                const towerObj = tower.toObject();
                towerObj.totalUnits = totalUnits;
                towerObj.availableUnits = availableUnits;
                if (tower.projectId && tower.projectId.tenantId) {
                    towerObj.tenantId = tower.projectId.tenantId;
                }
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
        logger.error('Error getting towers', {
            message: error.message,
            stack: error.stack,
            projectId,
            filters: JSON.stringify(filters)
        });
        throw error;
    }
};

// ... (getTowerById, updateTower, updateConstructionStatus, updatePremiums, deleteTower methods remain the same as provided in "Tower Service (ObjectId Handling & Validation)" immersive)
// For brevity, only createTower and getTowers are shown with the _escapeRegexForTowerName helper and its usage.
// Ensure the rest of the methods from the previous version of tower.service.js are included.

/**
 * Get tower by ID with detailed information
 * @param {string} id - Tower ID (as string)
 * @returns {Promise<Object>} - Tower with additional details
 */
const getTowerById = async (id) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new ApiError(400, 'Invalid Tower ID format.');
        }
        const towerObjectId = new mongoose.Types.ObjectId(id);
        const tower = await Tower.findById(towerObjectId)
            .populate('projectId', 'name city tenantId');

        if (!tower) {
            throw new ApiError(404, 'Tower not found');
        }
        if (!tower.projectId) {
            throw new ApiError(500, 'Tower found but its project details could not be populated.');
        }

        const totalUnits = await Unit.countDocuments({ towerId: towerObjectId });
        const availableUnits = await Unit.countDocuments({ towerId: towerObjectId, status: 'available' });
        const bookedUnits = await Unit.countDocuments({ towerId: towerObjectId, status: 'booked' });
        const soldUnits = await Unit.countDocuments({ towerId: towerObjectId, status: 'sold' });

        const unitTypes = await Unit.aggregate([
            { $match: { towerId: towerObjectId } },
            { $group: { _id: '$type', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]);

        const unitsByFloor = await Unit.aggregate([
            { $match: { towerId: towerObjectId } },
            { $sort: { number: 1 } },
            {
                $group: {
                    _id: '$floor',
                    units: { $push: { _id: '$_id', number: '$number', type: '$type', status: '$status' } },
                },
            },
            { $sort: { _id: -1 } },
        ]);

        const towerObj = tower.toObject();
        towerObj.unitStats = {
            total: totalUnits,
            available: availableUnits,
            booked: bookedUnits,
            sold: soldUnits,
            types: unitTypes.map(type => ({ type: type._id, count: type.count })),
        };
        towerObj.unitsByFloor = unitsByFloor;
        towerObj.tenantId = tower.projectId.tenantId;

        return towerObj;
    } catch (error) {
        logger.error('Error getting tower by ID', {
            message: error.message,
            stack: error.stack,
            towerId: id
        });
        throw error;
    }
};

const updateTower = async (id, updateData) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new ApiError(400, 'Invalid Tower ID format.');
        }
        delete updateData.tenantId; delete updateData.projectId; delete updateData.createdAt;
        const tower = await Tower.findByIdAndUpdate(
            new mongoose.Types.ObjectId(id),
            { $set: updateData },
            { new: true, runValidators: true }
        ).populate('projectId', 'name tenantId');
        if (!tower) throw new ApiError(404, 'Tower not found for update');
        return tower;
    } catch (error) {
        logger.error('Error updating tower', { message: error.message, stack: error.stack, towerId: id, updateData: JSON.stringify(updateData) });
        if (error.name === 'ValidationError') logger.error('Tower Update Validation Error details:', error.errors);
        throw error;
    }
};

const updateConstructionStatus = async (id, constructionData) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, 'Invalid Tower ID format.');
        const tower = await Tower.findById(new mongoose.Types.ObjectId(id));
        if (!tower) throw new ApiError(404, 'Tower not found to update construction status');
        tower.construction = { ...tower.construction, ...constructionData };
        await tower.save();
        return tower.populate('projectId', 'name tenantId');
    } catch (error) {
        logger.error('Error updating tower construction status', { message: error.message, stack: error.stack, towerId: id, constructionData: JSON.stringify(constructionData) });
        throw error;
    }
};

const updatePremiums = async (id, premiumData) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, 'Invalid Tower ID format.');
        const tower = await Tower.findById(new mongoose.Types.ObjectId(id));
        if (!tower) throw new ApiError(404, 'Tower not found to update premiums');
        if (premiumData.floorRise) tower.premiums.floorRise = { ...tower.premiums.floorRise, ...premiumData.floorRise };
        if (premiumData.viewPremium) tower.premiums.viewPremium = premiumData.viewPremium;
        await tower.save();
        return tower.populate('projectId', 'name tenantId');
    } catch (error) {
        logger.error('Error updating tower premiums', { message: error.message, stack: error.stack, towerId: id, premiumData: JSON.stringify(premiumData) });
        throw error;
    }
};

const deleteTower = async (id) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, 'Invalid Tower ID format.');
        const towerObjectId = new mongoose.Types.ObjectId(id);
        const unitCount = await Unit.countDocuments({ towerId: towerObjectId });
        if (unitCount > 0) throw new ApiError(400, 'Cannot delete tower with existing units. Please delete units first.');
        const result = await Tower.deleteOne({ _id: towerObjectId });
        if (result.deletedCount === 0) throw new ApiError(404, 'Tower not found for deletion');
        return true;
    } catch (error) {
        logger.error('Error deleting tower', { message: error.message, stack: error.stack, towerId: id });
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
