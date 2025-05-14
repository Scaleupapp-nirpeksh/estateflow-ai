// src/services/project.service.js

const mongoose = require('mongoose');
const Project = require('../models/project.model');
const Tower = require('../models/tower.model');
const Unit = require('../models/unit.model'); // Corrected path from previous context
const { ApiError } = require('../utils/error-handler');
const logger = require('../utils/logger');

/**
 * Create a new project
 * @param {Object} projectData - Project data
 * @returns {Promise<Project>} - Created project
 */
const createProject = async (projectData) => {
    try {
        const project = new Project(projectData);
        await project.save();
        return project;
    } catch (error) {
        logger.error('Error creating project', {
            message: error.message,
            stack: error.stack,
            projectData: JSON.stringify(projectData)
        });
        if (error.name === 'ValidationError') {
            logger.error('Project Validation Error details:', error.errors);
        }
        throw error;
    }
};

/**
 * Get projects by tenant with filtering options
 * @param {string} tenantId - Tenant ID (as string)
 * @param {Object} filters - Filter options (can include 'search' for name, 'city', 'active')
 * @param {Object} pagination - Pagination options
 * @returns {Promise<Object>} - Projects with pagination info
 */
const getProjects = async (tenantId, filters = {}, pagination = { page: 1, limit: 10 }) => {
    try {
        const { page, limit } = pagination;
        const skip = (page - 1) * limit;

        if (!mongoose.Types.ObjectId.isValid(tenantId)) {
            throw new ApiError(400, 'Invalid Tenant ID format for filtering projects.');
        }
        const query = { tenantId: new mongoose.Types.ObjectId(tenantId) };

        if (filters.city) {
            // Case-insensitive search for city
            query.city = { $regex: new RegExp(filters.city, 'i') };
        }
        if (filters.active !== undefined) {
            query.active = filters.active;
        }
        // The 'search' filter leverages the text index on Project model (name, description, address)
        // This is suitable for finding projects by name or keywords.
        if (filters.search) {
            query.$text = { $search: filters.search };
        }

        logger.debug('[projectService.getProjects] Executing query:', JSON.stringify(query));
        const total = await Project.countDocuments(query);

        // If using $text search, sort by text score for relevance, otherwise by createdAt
        const sortOrder = filters.search ? { score: { $meta: "textScore" } } : { createdAt: -1 };

        const projects = await Project.find(query)
            .sort(sortOrder)
            .skip(skip)
            .limit(limit);

        const projectsWithCounts = await Promise.all(
            projects.map(async (project) => {
                const projectObjectId = new mongoose.Types.ObjectId(project._id);
                const totalUnits = await Unit.countDocuments({ projectId: projectObjectId });
                const availableUnits = await Unit.countDocuments({
                    projectId: projectObjectId,
                    status: 'available',
                });
                const towerCount = await Tower.countDocuments({ projectId: projectObjectId });

                const projectObj = project.toObject();
                projectObj.totalUnits = totalUnits;
                projectObj.availableUnits = availableUnits;
                projectObj.towerCount = towerCount;
                return projectObj;
            })
        );

        return {
            data: projectsWithCounts,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
            },
        };
    } catch (error) {
        logger.error('Error getting projects', {
            message: error.message,
            stack: error.stack,
            tenantId,
            filters: JSON.stringify(filters)
        });
        throw error;
    }
};

/**
 * Get project by ID with detailed information
 * @param {string} id - Project ID (as string)
 * @returns {Promise<Object>} - Project with additional details
 */
const getProjectById = async (id) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new ApiError(400, 'Invalid Project ID format.');
        }
        const projectObjectId = new mongoose.Types.ObjectId(id);
        const project = await Project.findById(projectObjectId);

        if (!project) {
            throw new ApiError(404, 'Project not found');
        }

        const towers = await Tower.find({ projectId: projectObjectId });
        const totalUnits = await Unit.countDocuments({ projectId: projectObjectId });
        const availableUnits = await Unit.countDocuments({ projectId: projectObjectId, status: 'available' });
        const bookedUnits = await Unit.countDocuments({ projectId: projectObjectId, status: 'booked' });
        const soldUnits = await Unit.countDocuments({ projectId: projectObjectId, status: 'sold' });

        const unitTypes = await Unit.aggregate([
            { $match: { projectId: projectObjectId } },
            { $group: { _id: '$type', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]);

        const projectObj = project.toObject();
        projectObj.towers = towers;
        projectObj.towerCount = towers.length;
        projectObj.unitStats = {
            total: totalUnits,
            available: availableUnits,
            booked: bookedUnits,
            sold: soldUnits,
            types: unitTypes.map(type => ({ type: type._id, count: type.count })),
        };

        return projectObj;
    } catch (error) {
        logger.error('Error getting project by ID', {
            message: error.message,
            stack: error.stack,
            projectId: id
        });
        throw error;
    }
};

/**
 * Update project
 * @param {string} id - Project ID (as string)
 * @param {Object} updateData - Data to update
 * @returns {Promise<Project>} - Updated project
 */
const updateProject = async (id, updateData) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new ApiError(400, 'Invalid Project ID format.');
        }

        delete updateData.tenantId;
        delete updateData.createdAt;

        const project = await Project.findByIdAndUpdate(
            new mongoose.Types.ObjectId(id),
            { $set: updateData },
            { new: true, runValidators: true }
        );

        if (!project) {
            throw new ApiError(404, 'Project not found for update');
        }
        return project;
    } catch (error) {
        logger.error('Error updating project', {
            message: error.message,
            stack: error.stack,
            projectId: id,
            updateData: JSON.stringify(updateData)
        });
        if (error.name === 'ValidationError') {
            logger.error('Project Update Validation Error details:', error.errors);
        }
        throw error;
    }
};

/**
 * Set project status (active/inactive)
 * @param {string} id - Project ID (as string)
 * @param {boolean} active - Active status
 * @returns {Promise<Project>} - Updated project
 */
const setProjectStatus = async (id, active) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new ApiError(400, 'Invalid Project ID format.');
        }
        const project = await Project.findById(new mongoose.Types.ObjectId(id));
        if (!project) {
            throw new ApiError(404, 'Project not found to set status');
        }
        project.active = active;
        await project.save();
        return project;
    } catch (error) {
        logger.error('Error setting project status', {
            message: error.message,
            stack: error.stack,
            projectId: id,
            active
        });
        throw error;
    }
};

/**
 * Delete project
 * @param {string} id - Project ID (as string)
 * @returns {Promise<boolean>} - Success status
 */
const deleteProject = async (id) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new ApiError(400, 'Invalid Project ID format.');
        }
        const projectObjectId = new mongoose.Types.ObjectId(id);
        const towerCount = await Tower.countDocuments({ projectId: projectObjectId });

        if (towerCount > 0) {
            throw new ApiError(400, 'Cannot delete project with existing towers. Please delete towers first.');
        }

        const result = await Project.deleteOne({ _id: projectObjectId });
        if (result.deletedCount === 0) {
            throw new ApiError(404, 'Project not found for deletion');
        }
        return true;
    } catch (error) {
        logger.error('Error deleting project', {
            message: error.message,
            stack: error.stack,
            projectId: id
        });
        throw error;
    }
};

module.exports = {
    createProject,
    getProjects,
    getProjectById,
    updateProject,
    setProjectStatus,
    deleteProject,
};
