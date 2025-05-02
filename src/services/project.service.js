const mongoose = require('mongoose');
const Project = require('../models/project.model');
const Tower = require('../models/tower.model');
const Unit = require('../models/unit.model');
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
        logger.error('Error creating project', { error });
        throw error;
    }
};

/**
 * Get projects by tenant with filtering options
 * @param {string} tenantId - Tenant ID
 * @param {Object} filters - Filter options
 * @param {Object} pagination - Pagination options
 * @returns {Promise<Object>} - Projects with pagination info
 */
const getProjects = async (tenantId, filters = {}, pagination = { page: 1, limit: 10 }) => {
    try {
        const { page, limit } = pagination;
        const skip = (page - 1) * limit;

        // Build query
        const query = { tenantId };

        // Add city filter if provided
        if (filters.city) {
            query.city = filters.city;
        }

        // Add active filter if provided
        if (filters.active !== undefined) {
            query.active = filters.active;
        }

        // Add text search if provided
        if (filters.search) {
            query.$text = { $search: filters.search };
        }

        // Count total documents
        const total = await Project.countDocuments(query);

        // Execute query with pagination
        const projects = await Project.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Add unit counts to each project
        const projectsWithCounts = await Promise.all(
            projects.map(async (project) => {
                const totalUnits = await Unit.countDocuments({ projectId: project._id });
                const availableUnits = await Unit.countDocuments({
                    projectId: project._id,
                    status: 'available',
                });

                const towerCount = await Tower.countDocuments({ projectId: project._id });

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
        logger.error('Error getting projects', { error, tenantId });
        throw error;
    }
};

/**
 * Get project by ID with detailed information
 * @param {string} id - Project ID
 * @returns {Promise<Object>} - Project with additional details
 */
const getProjectById = async (id) => {
    try {
        const project = await Project.findById(id);

        if (!project) {
            throw new ApiError(404, 'Project not found');
        }

        // Get towers in this project
        const towers = await Tower.find({ projectId: id });

        // Get unit statistics
        const totalUnits = await Unit.countDocuments({ projectId: id });
        const availableUnits = await Unit.countDocuments({
            projectId: id,
            status: 'available',
        });
        const bookedUnits = await Unit.countDocuments({
            projectId: id,
            status: 'booked',
        });
        const soldUnits = await Unit.countDocuments({
            projectId: id,
            status: 'sold',
        });

        // Get unit types and their counts
        const unitTypes = await Unit.aggregate([
            { $match: { projectId: new mongoose.Types.ObjectId(id) } },
            { $group: { _id: '$type', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]);

        const projectObj = project.toObject();
        projectObj.towers = towers;
        projectObj.unitStats = {
            total: totalUnits,
            available: availableUnits,
            booked: bookedUnits,
            sold: soldUnits,
            types: unitTypes.map(type => ({
                type: type._id,
                count: type.count,
            })),
        };

        return projectObj;
    } catch (error) {
        logger.error('Error getting project', { error, projectId: id });
        throw error;
    }
};

/**
 * Update project
 * @param {string} id - Project ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Project>} - Updated project
 */
const updateProject = async (id, updateData) => {
    try {
        const project = await Project.findById(id);

        if (!project) {
            throw new ApiError(404, 'Project not found');
        }

        // Fields that cannot be updated directly
        const restrictedFields = ['tenantId'];

        // Remove restricted fields from update data
        restrictedFields.forEach((field) => {
            if (updateData[field]) {
                delete updateData[field];
            }
        });

        // Update project
        Object.keys(updateData).forEach((key) => {
            project[key] = updateData[key];
        });

        await project.save();
        return project;
    } catch (error) {
        logger.error('Error updating project', { error, projectId: id });
        throw error;
    }
};

/**
 * Set project status (active/inactive)
 * @param {string} id - Project ID
 * @param {boolean} active - Active status
 * @returns {Promise<Project>} - Updated project
 */
const setProjectStatus = async (id, active) => {
    try {
        const project = await Project.findById(id);

        if (!project) {
            throw new ApiError(404, 'Project not found');
        }

        project.active = active;
        await project.save();

        return project;
    } catch (error) {
        logger.error('Error setting project status', { error, projectId: id });
        throw error;
    }
};

/**
 * Delete project
 * @param {string} id - Project ID
 * @returns {Promise<boolean>} - Success status
 */
const deleteProject = async (id) => {
    try {
        // Check if project has any towers
        const towerCount = await Tower.countDocuments({ projectId: id });

        if (towerCount > 0) {
            throw new ApiError(400, 'Cannot delete project with existing towers');
        }

        const result = await Project.deleteOne({ _id: id });

        if (result.deletedCount === 0) {
            throw new ApiError(404, 'Project not found');
        }

        return true;
    } catch (error) {
        logger.error('Error deleting project', { error, projectId: id });
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