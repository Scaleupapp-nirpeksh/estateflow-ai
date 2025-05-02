// src/services/lead.service.js

const mongoose = require('mongoose');
const Lead = require('../models/lead.model');
const User = require('../models/user.model');
const { ApiError } = require('../utils/error-handler');
const logger = require('../utils/logger');

/**
 * Create a new lead
 * @param {Object} leadData - Lead data
 * @returns {Promise<Lead>} - Created lead
 */
const createLead = async (leadData) => {
    try {
        // Check if lead with this phone already exists for the tenant
        const existingLead = await Lead.findOne({
            tenantId: leadData.tenantId,
            phone: leadData.phone
        });

        if (existingLead) {
            throw new ApiError(400, 'Lead with this phone number already exists');
        }

        // Create lead
        const lead = new Lead(leadData);
        await lead.save();
        return lead;
    } catch (error) {
        logger.error('Error creating lead', { error });
        throw error;
    }
};

/**
 * Get leads for a tenant with filtering and pagination
 * @param {string} tenantId - Tenant ID
 * @param {Object} filters - Filter options
 * @param {Object} pagination - Pagination options
 * @returns {Promise<Object>} - Leads with pagination info
 */
const getLeads = async (tenantId, filters = {}, pagination = { page: 1, limit: 10 }) => {
    try {
        const { page, limit } = pagination;
        const skip = (page - 1) * limit;

        // Build query
        const query = { tenantId };

        // Add status filter if provided
        if (filters.status) {
            query.status = filters.status;
        }

        // Add source filter if provided
        if (filters.source) {
            query.source = filters.source;
        }

        // Add priority filter if provided
        if (filters.priority) {
            query.priority = filters.priority;
        }

        // Add assigned to filter if provided
        if (filters.assignedTo) {
            query.assignedTo = filters.assignedTo;
        }

        // Add project filter if provided
        if (filters.projectId) {
            query.projectId = filters.projectId;
        }

        // Add search filter if provided
        if (filters.search) {
            query.$text = { $search: filters.search };
        }

        // Add budget range filter if provided
        if (filters.minBudget || filters.maxBudget) {
            query.budget = {};

            if (filters.minBudget) {
                query.budget['budget.min'] = { $gte: parseFloat(filters.minBudget) };
            }

            if (filters.maxBudget) {
                query.budget['budget.max'] = { $lte: parseFloat(filters.maxBudget) };
            }
        }

        // Add unit type filter if provided
        if (filters.unitType) {
            query.preferredUnitTypes = filters.unitType;
        }

        // Add date range filter if provided
        if (filters.fromDate || filters.toDate) {
            query.createdAt = {};

            if (filters.fromDate) {
                query.createdAt.$gte = new Date(filters.fromDate);
            }

            if (filters.toDate) {
                query.createdAt.$lte = new Date(filters.toDate);
            }
        }

        // Count total documents
        const total = await Lead.countDocuments(query);

        // Determine sort order
        let sort = { createdAt: -1 }; // Default newest first

        if (filters.sort) {
            switch (filters.sort) {
                case 'name_asc':
                    sort = { fullName: 1 };
                    break;
                case 'name_desc':
                    sort = { fullName: -1 };
                    break;
                case 'priority_high':
                    sort = {
                        priority: -1, // High priority first (urgent, high, medium, low)
                        createdAt: -1  // Then newest first
                    };
                    break;
                case 'oldest':
                    sort = { createdAt: 1 };
                    break;
                // Keep default for any other value
            }
        }

        // Execute query with pagination
        const leads = await Lead.find(query)
            .populate('assignedTo', 'name email role')
            .populate('projectId', 'name')
            .sort(sort)
            .skip(skip)
            .limit(limit);

        return {
            data: leads,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
            },
        };
    } catch (error) {
        logger.error('Error getting leads', { error, tenantId });
        throw error;
    }
};

/**
 * Get lead by ID
 * @param {string} id - Lead ID
 * @returns {Promise<Lead>} - Lead object with details
 */
const getLeadById = async (id) => {
    try {
        const lead = await Lead.findById(id)
            .populate('assignedTo', 'name email role')
            .populate('projectId', 'name city')
            .populate('interestedUnits.unitId', 'number floor type basePrice status')
            .populate('notes.createdBy', 'name')
            .populate('interactions.createdBy', 'name')
            .populate('attachments.uploadedBy', 'name');

        if (!lead) {
            throw new ApiError(404, 'Lead not found');
        }

        return lead;
    } catch (error) {
        logger.error('Error getting lead', { error, leadId: id });
        throw error;
    }
};

/**
 * Update lead
 * @param {string} id - Lead ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Lead>} - Updated lead
 */
const updateLead = async (id, updateData) => {
    try {
        const lead = await Lead.findById(id);

        if (!lead) {
            throw new ApiError(404, 'Lead not found');
        }

        // Fields that cannot be updated directly
        const restrictedFields = ['tenantId', 'notes', 'interactions', 'interestedUnits', 'attachments'];

        // Remove restricted fields from update data
        restrictedFields.forEach((field) => {
            if (updateData[field]) {
                delete updateData[field];
            }
        });

        // Update lead
        Object.keys(updateData).forEach((key) => {
            lead[key] = updateData[key];
        });

        await lead.save();
        return lead;
    } catch (error) {
        logger.error('Error updating lead', { error, leadId: id });
        throw error;
    }
};

/**
 * Add an interaction to a lead
 * @param {string} id - Lead ID
 * @param {Object} interaction - Interaction data
 * @returns {Promise<Lead>} - Updated lead
 */
const addInteraction = async (id, interaction) => {
    try {
        const lead = await Lead.findById(id);

        if (!lead) {
            throw new ApiError(404, 'Lead not found');
        }

        return await lead.addInteraction(interaction);
    } catch (error) {
        logger.error('Error adding interaction', { error, leadId: id });
        throw error;
    }
};

/**
 * Add a note to a lead
 * @param {string} id - Lead ID
 * @param {Object} note - Note data
 * @returns {Promise<Lead>} - Updated lead
 */
const addNote = async (id, note) => {
    try {
        const lead = await Lead.findById(id);

        if (!lead) {
            throw new ApiError(404, 'Lead not found');
        }

        return await lead.addNote(note);
    } catch (error) {
        logger.error('Error adding note', { error, leadId: id });
        throw error;
    }
};

/**
 * Add interested unit to a lead
 * @param {string} id - Lead ID
 * @param {Object} interest - Interest data
 * @returns {Promise<Lead>} - Updated lead
 */
const addInterestedUnit = async (id, interest) => {
    try {
        const lead = await Lead.findById(id);

        if (!lead) {
            throw new ApiError(404, 'Lead not found');
        }

        return await lead.addInterestedUnit(interest);
    } catch (error) {
        logger.error('Error adding interested unit', { error, leadId: id });
        throw error;
    }
};

/**
 * Assign lead to a user
 * @param {string} id - Lead ID
 * @param {string} userId - User ID
 * @returns {Promise<Lead>} - Updated lead
 */
const assignLead = async (id, userId) => {
    try {
        const lead = await Lead.findById(id);

        if (!lead) {
            throw new ApiError(404, 'Lead not found');
        }

        // Verify user exists
        const user = await User.findById(userId);
        if (!user) {
            throw new ApiError(404, 'User not found');
        }

        // Verify user belongs to the same tenant
        if (user.tenantId.toString() !== lead.tenantId.toString()) {
            throw new ApiError(400, 'User and lead must belong to the same tenant');
        }

        // Verify user has role that can be assigned leads
        const validRoles = ['Principal', 'BusinessHead', 'SalesDirector', 'SeniorAgent', 'JuniorAgent'];
        if (!validRoles.includes(user.role)) {
            throw new ApiError(400, `User with role ${user.role} cannot be assigned leads`);
        }

        lead.assignedTo = userId;
        await lead.save();

        return lead;
    } catch (error) {
        logger.error('Error assigning lead', { error, leadId: id, userId });
        throw error;
    }
};

/**
 * Change lead status
 * @param {string} id - Lead ID
 * @param {string} status - New status
 * @returns {Promise<Lead>} - Updated lead
 */
const changeLeadStatus = async (id, status) => {
    try {
        const lead = await Lead.findById(id);

        if (!lead) {
            throw new ApiError(404, 'Lead not found');
        }

        lead.status = status;
        await lead.save();

        return lead;
    } catch (error) {
        logger.error('Error changing lead status', { error, leadId: id });
        throw error;
    }
};

/**
 * Add attachment to a lead
 * @param {string} id - Lead ID
 * @param {Object} attachment - Attachment data
 * @returns {Promise<Lead>} - Updated lead
 */
const addAttachment = async (id, attachment) => {
    try {
        const lead = await Lead.findById(id);

        if (!lead) {
            throw new ApiError(404, 'Lead not found');
        }

        lead.attachments.push(attachment);
        await lead.save();

        return lead;
    } catch (error) {
        logger.error('Error adding attachment', { error, leadId: id });
        throw error;
    }
};

/**
 * Delete a lead
 * @param {string} id - Lead ID
 * @returns {Promise<boolean>} - Success status
 */
const deleteLead = async (id) => {
    try {
        const result = await Lead.deleteOne({ _id: id });

        if (result.deletedCount === 0) {
            throw new ApiError(404, 'Lead not found');
        }

        return true;
    } catch (error) {
        logger.error('Error deleting lead', { error, leadId: id });
        throw error;
    }
};

/**
 * Get lead statistics for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} - Lead statistics
 */
const getLeadStatistics = async (tenantId) => {
    try {
        // Get count by status
        const statusCounts = await Lead.aggregate([
            { $match: { tenantId: new mongoose.Types.ObjectId(tenantId) } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        // Get count by source
        const sourceCounts = await Lead.aggregate([
            { $match: { tenantId: new mongoose.Types.ObjectId(tenantId) } },
            { $group: { _id: '$source', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        // Get conversion rate
        const totalLeads = await Lead.countDocuments({ tenantId });
        const convertedLeads = await Lead.countDocuments({ tenantId, status: 'converted' });
        const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0;

        // Get leads created in the last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentLeads = await Lead.countDocuments({
            tenantId,
            createdAt: { $gte: thirtyDaysAgo }
        });

        return {
            totalLeads,
            convertedLeads,
            conversionRate: conversionRate.toFixed(2),
            recentLeads,
            byStatus: statusCounts.map(item => ({
                status: item._id,
                count: item.count
            })),
            bySource: sourceCounts.map(item => ({
                source: item._id,
                count: item.count
            }))
        };
    } catch (error) {
        logger.error('Error getting lead statistics', { error, tenantId });
        throw error;
    }
};

/**
 * Import leads from CSV data
 * @param {string} tenantId - Tenant ID
 * @param {Array} leadsData - Array of lead data from CSV
 * @returns {Promise<Object>} - Import results
 */
const importLeadsFromCSV = async (tenantId, leadsData) => {
    try {
        if (!leadsData || !Array.isArray(leadsData) || leadsData.length === 0) {
            throw new ApiError(400, 'No valid lead data provided');
        }

        const results = {
            total: leadsData.length,
            imported: 0,
            skipped: 0,
            errors: []
        };

        for (const leadData of leadsData) {
            try {
                // Validate required fields
                if (!leadData.fullName || !leadData.phone) {
                    results.errors.push(`Lead with phone ${leadData.phone || 'unknown'} is missing required fields`);
                    results.skipped++;
                    continue;
                }

                // Check if lead already exists
                const existingLead = await Lead.findOne({
                    tenantId,
                    phone: leadData.phone
                });

                if (existingLead) {
                    results.errors.push(`Lead with phone ${leadData.phone} already exists`);
                    results.skipped++;
                    continue;
                }

                // Create new lead
                const lead = new Lead({
                    tenantId,
                    fullName: leadData.fullName,
                    email: leadData.email || null,
                    phone: leadData.phone,
                    alternatePhone: leadData.alternatePhone || null,
                    source: leadData.source || 'other',
                    requirements: leadData.requirements || null,
                    status: leadData.status || 'new',
                    priority: leadData.priority || 'medium',
                    projectId: leadData.projectId || null,
                });

                if (leadData.budgetMin && leadData.budgetMax) {
                    lead.budget = {
                        min: parseFloat(leadData.budgetMin) || 0,
                        max: parseFloat(leadData.budgetMax) || 0,
                        currency: leadData.currency || 'INR'
                    };
                }

                if (leadData.preferredUnitTypes) {
                    lead.preferredUnitTypes = leadData.preferredUnitTypes
                        .split(',')
                        .map(type => type.trim())
                        .filter(type => type.length > 0);
                }

                await lead.save();
                results.imported++;
            } catch (error) {
                results.errors.push(`Error importing lead with phone ${leadData.phone || 'unknown'}: ${error.message}`);
                results.skipped++;
            }
        }

        return results;
    } catch (error) {
        logger.error('Error importing leads from CSV', { error, tenantId });
        throw error;
    }
};

module.exports = {
    createLead,
    getLeads,
    getLeadById,
    updateLead,
    addInteraction,
    addNote,
    addInterestedUnit,
    assignLead,
    changeLeadStatus,
    addAttachment,
    deleteLead,
    getLeadStatistics,
    importLeadsFromCSV
};