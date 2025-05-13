// src/services/lead.service.js

const mongoose = require('mongoose');
const Lead = require('../models/lead.model');
const User = require('../models/user.model'); // Assuming this is used elsewhere or for future validation
const { ApiError } = require('../utils/error-handler');
const logger = require('../utils/logger');

/**
 * Create a new lead
 * @param {Object} leadData - Lead data
 * @returns {Promise<Lead>} - Created lead
 */
const createLead = async (leadData) => {
    try {
        // Ensure tenantId is properly formatted if it's a string; Mongoose typically handles this on save.
        // However, for findOne, it's good practice if you expect it to be an ObjectId.
        // If leadData.tenantId is already an ObjectId, this is fine. If it's a string, Mongoose will cast.
        const existingLead = await Lead.findOne({
            tenantId: leadData.tenantId,
            phone: leadData.phone
        });

        if (existingLead) {
            throw new ApiError(400, 'Lead with this phone number already exists');
        }

        const lead = new Lead(leadData);
        await lead.save();
        return lead;
    } catch (error) {
        logger.error('Error creating lead', {
            message: error.message,
            stack: error.stack,
            leadData: JSON.stringify(leadData) // Be cautious with logging sensitive data
        });
        if (error.name === 'ValidationError') {
            logger.error('Lead Validation Error details:', error.errors);
        }
        throw error;
    }
};


/**
 * Get leads for a tenant with filtering and pagination
 * @param {string} tenantId - Tenant ID (as string)
 * @param {Object} filters - Filter options
 * @param {Object} pagination - Pagination options
 * @returns {Promise<Object>} - Leads with pagination info
 */
const getLeads = async (tenantId, filters = {}, pagination = { page: 1, limit: 10 }) => {
    try {
        const { page, limit } = pagination;
        const skip = (page - 1) * limit;

        // Build query
        if (!mongoose.Types.ObjectId.isValid(tenantId)) {
            throw new ApiError(400, 'Invalid Tenant ID format for filtering leads.');
        }
        const query = { tenantId: new mongoose.Types.ObjectId(tenantId) };

        if (filters.phone) {
            query.phone = filters.phone;
        }
        if (filters.email) {
            query.email = filters.email.toLowerCase();
        }
        if (filters.status) {
            query.status = filters.status;
        }
        if (filters.source) {
            query.source = filters.source;
        }
        if (filters.priority) {
            query.priority = filters.priority;
        }
        if (filters.assignedTo && mongoose.Types.ObjectId.isValid(filters.assignedTo)) {
            query.assignedTo = new mongoose.Types.ObjectId(filters.assignedTo);
        }
        if (filters.projectId && mongoose.Types.ObjectId.isValid(filters.projectId)) {
            query.projectId = new mongoose.Types.ObjectId(filters.projectId);
        }

        if (filters.search && !filters.phone && !filters.email && !filters.fullName) {
            query.$text = { $search: filters.search };
        }
        // If fullName is provided for regex search (from _findLeadAdvanced)
        if (filters.fullName && typeof filters.fullName === 'object' && filters.fullName.$regex) {
            query.fullName = filters.fullName;
        }


        if (filters.minBudget || filters.maxBudget) {
            if (filters.minBudget) query['budget.min'] = { $gte: parseFloat(filters.minBudget) };
            if (filters.maxBudget) query['budget.max'] = { $lte: parseFloat(filters.maxBudget) };
        }

        if (filters.preferredUnitTypes && Array.isArray(filters.preferredUnitTypes) && filters.preferredUnitTypes.length > 0) {
            query.preferredUnitTypes = { $in: filters.preferredUnitTypes };
        }

        if (filters.fromDate || filters.toDate) {
            query.createdAt = {};
            if (filters.fromDate) query.createdAt.$gte = new Date(filters.fromDate);
            if (filters.toDate) query.createdAt.$lte = new Date(filters.toDate);
        }

        logger.debug('[leadService.getLeads] Executing query:', JSON.stringify(query));

        const total = await Lead.countDocuments(query);

        let sort = { createdAt: -1 };
        if (filters.sort) {
            switch (filters.sort) {
                case 'name_asc': sort = { fullName: 1 }; break;
                case 'name_desc': sort = { fullName: -1 }; break;
                case 'priority_high': sort = { priority: -1, createdAt: -1 };
                case 'oldest': sort = { createdAt: 1 }; break;
            }
        }

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
        logger.error('Error getting leads', {
            message: error.message,
            stack: error.stack,
            tenantId,
            filters: JSON.stringify(filters)
        });
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
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new ApiError(400, 'Invalid Lead ID format');
        }
        const lead = await Lead.findById(id)
            .populate('assignedTo', 'name email role')
            .populate('projectId', 'name city')
            .populate({
                path: 'interestedUnits.unitId',
                select: 'number floor type basePrice status towerId projectId', // Select fields from Unit
                populate: [ // Nested population
                    { path: 'towerId', select: 'name' }, // Populate tower details for the unit
                    { path: 'projectId', select: 'name' } // Populate project details for the unit
                ]
            })
            .populate('notes.createdBy', 'name')
            .populate('interactions.createdBy', 'name')
            .populate('attachments.uploadedBy', 'name');

        if (!lead) {
            throw new ApiError(404, 'Lead not found');
        }
        return lead;
    } catch (error) {
        logger.error('Error getting lead by ID', {
            message: error.message,
            stack: error.stack,
            leadId: id
        });
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
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new ApiError(400, 'Invalid Lead ID format');
        }

        delete updateData.tenantId; // Should not be updatable
        delete updateData.createdAt; // Should not be updatable
        // Consider if assignedTo should be updated via a separate assignLead method

        const lead = await Lead.findByIdAndUpdate(id, { $set: updateData }, { new: true, runValidators: true });
        if (!lead) {
            throw new ApiError(404, 'Lead not found for update');
        }
        return lead;
    } catch (error) {
        logger.error('Error updating lead', {
            message: error.message,
            stack: error.stack,
            leadId: id,
            updateData: JSON.stringify(updateData)
        });
        if (error.name === 'ValidationError') {
            logger.error('Lead Update Validation Error details:', error.errors);
        }
        throw error;
    }
};

/**
 * Add an interaction to a lead
 * @param {string} leadId - Lead ID
 * @param {Object} interaction - Interaction data
 * @returns {Promise<Lead>} - Updated lead
 */
const addInteraction = async (leadId, interaction) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(leadId)) {
            throw new ApiError(400, 'Invalid Lead ID format');
        }
        const lead = await Lead.findById(leadId);
        if (!lead) {
            throw new ApiError(404, 'Lead not found to add interaction');
        }
        lead.interactions.push(interaction);
        await lead.save();
        return lead;
    } catch (error) {
        logger.error('Error adding interaction to lead', {
            message: error.message,
            stack: error.stack,
            leadId
        });
        throw error;
    }
};

/**
 * Add a note to a lead
 * @param {string} leadId - Lead ID
 * @param {Object} note - Note data
 * @returns {Promise<Lead>} - Updated lead
 */
const addNote = async (leadId, note) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(leadId)) {
            throw new ApiError(400, 'Invalid Lead ID format');
        }
        const lead = await Lead.findById(leadId);
        if (!lead) {
            throw new ApiError(404, 'Lead not found to add note');
        }
        lead.notes.push(note);
        await lead.save();
        return lead;
    } catch (error) {
        logger.error('Error adding note to lead', {
            message: error.message,
            stack: error.stack,
            leadId
        });
        throw error;
    }
};

/**
 * Mark a lead as interested in a unit
 * @param {string} leadId - Lead ID
 * @param {Object} interestData - Interest data { unitId, interestLevel, notes }
 * @returns {Promise<Lead>} - Updated lead
 */
const addInterestedUnit = async (leadId, interestData) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(leadId) || (interestData.unitId && !mongoose.Types.ObjectId.isValid(interestData.unitId))) {
            throw new ApiError(400, 'Invalid Lead ID or Unit ID format');
        }
        const lead = await Lead.findById(leadId);
        if (!lead) {
            throw new ApiError(404, 'Lead not found to add interested unit');
        }

        const existingInterestIndex = lead.interestedUnits.findIndex(iu => iu.unitId.toString() === interestData.unitId.toString());
        if (existingInterestIndex > -1) {
            lead.interestedUnits[existingInterestIndex].interestLevel = interestData.interestLevel || lead.interestedUnits[existingInterestIndex].interestLevel;
            lead.interestedUnits[existingInterestIndex].notes = interestData.notes || lead.interestedUnits[existingInterestIndex].notes;
        } else {
            lead.interestedUnits.push(interestData);
        }
        await lead.save();
        return lead;
    } catch (error) {
        logger.error('Error adding interested unit to lead', {
            message: error.message,
            stack: error.stack,
            leadId
        });
        throw error;
    }
};

/**
 * Assign lead to a user
 * @param {string} leadId - Lead ID
 * @param {string} userIdToAssign - User ID to assign to
 * @returns {Promise<Lead>} - Updated lead
 */
const assignLead = async (leadId, userIdToAssign) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(leadId) || !mongoose.Types.ObjectId.isValid(userIdToAssign)) {
            throw new ApiError(400, 'Invalid Lead ID or User ID format');
        }
        const lead = await Lead.findById(leadId);
        if (!lead) {
            throw new ApiError(404, 'Lead not found for assignment');
        }

        // It's good practice to also verify the user being assigned exists and belongs to the same tenant,
        // though this might also be handled at a higher level (e.g., in the action handler).
        // const userToAssign = await User.findById(userIdToAssign);
        // if (!userToAssign || userToAssign.tenantId.toString() !== lead.tenantId.toString()) {
        //     throw new ApiError(400, 'User to assign not found or belongs to a different tenant.');
        // }

        lead.assignedTo = userIdToAssign;
        await lead.save();
        return lead.populate('assignedTo', 'name email role');
    } catch (error) {
        logger.error('Error assigning lead', {
            message: error.message,
            stack: error.stack,
            leadId,
            userIdToAssign
        });
        throw error;
    }
};

/**
 * Change lead status
 * @param {string} leadId - Lead ID
 * @param {string} newStatus - New status
 * @returns {Promise<Lead>} - Updated lead
 */
const changeLeadStatus = async (leadId, newStatus) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(leadId)) {
            throw new ApiError(400, 'Invalid Lead ID format');
        }
        const lead = await Lead.findById(leadId);
        if (!lead) {
            throw new ApiError(404, 'Lead not found to change status');
        }
        lead.status = newStatus;
        await lead.save();
        return lead;
    } catch (error) {
        logger.error('Error changing lead status', {
            message: error.message,
            stack: error.stack,
            leadId,
            newStatus
        });
        throw error;
    }
};

/**
 * Add attachment to a lead
 * @param {string} leadId - Lead ID
 * @param {Object} attachment - Attachment data
 * @returns {Promise<Lead>} - Updated lead
 */
const addAttachment = async (leadId, attachment) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(leadId)) {
            throw new ApiError(400, 'Invalid Lead ID format');
        }
        const lead = await Lead.findById(leadId);
        if (!lead) {
            throw new ApiError(404, 'Lead not found to add attachment');
        }
        lead.attachments.push(attachment);
        await lead.save();
        return lead;
    } catch (error) {
        logger.error('Error adding attachment to lead', { error, leadId });
        throw error;
    }
};

/**
 * Delete a lead
 * @param {string} leadId - Lead ID
 * @returns {Promise<boolean>} - Success status
 */
const deleteLead = async (leadId) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(leadId)) {
            throw new ApiError(400, 'Invalid Lead ID format');
        }
        const result = await Lead.deleteOne({ _id: leadId });
        if (result.deletedCount === 0) {
            throw new ApiError(404, 'Lead not found for deletion');
        }
        return true;
    } catch (error) {
        logger.error('Error deleting lead', { error, leadId });
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
        if (!mongoose.Types.ObjectId.isValid(tenantId)) {
            throw new ApiError(400, 'Invalid Tenant ID format for statistics.');
        }
        const tenantObjectId = new mongoose.Types.ObjectId(tenantId);

        const statusCounts = await Lead.aggregate([
            { $match: { tenantId: tenantObjectId } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        const sourceCounts = await Lead.aggregate([
            { $match: { tenantId: tenantObjectId } },
            { $group: { _id: '$source', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        const totalLeads = await Lead.countDocuments({ tenantId: tenantObjectId });
        const convertedLeads = await Lead.countDocuments({ tenantId: tenantObjectId, status: 'converted' });
        const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0;

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentLeads = await Lead.countDocuments({
            tenantId: tenantObjectId,
            createdAt: { $gte: thirtyDaysAgo }
        });

        return {
            totalLeads,
            convertedLeads,
            conversionRate: conversionRate.toFixed(2),
            recentLeads,
            byStatus: statusCounts.map(item => ({ status: item._id, count: item.count })),
            bySource: sourceCounts.map(item => ({ source: item._id, count: item.count }))
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
        if (!mongoose.Types.ObjectId.isValid(tenantId)) {
            throw new ApiError(400, 'Invalid Tenant ID format for import.');
        }
        if (!leadsData || !Array.isArray(leadsData) || leadsData.length === 0) {
            throw new ApiError(400, 'No valid lead data provided for import.');
        }

        const results = { total: leadsData.length, imported: 0, skipped: 0, errors: [] };
        const tenantObjectId = new mongoose.Types.ObjectId(tenantId); // Use consistent ObjectId

        for (const leadData of leadsData) {
            try {
                if (!leadData.fullName || !leadData.phone) {
                    results.errors.push({ message: 'Missing required fields (fullName or phone)', leadData });
                    results.skipped++;
                    continue;
                }

                const existingLead = await Lead.findOne({
                    tenantId: tenantObjectId,
                    phone: leadData.phone
                });
                if (existingLead) {
                    results.errors.push({ message: `Lead with phone ${leadData.phone} already exists.`, leadData });
                    results.skipped++;
                    continue;
                }

                const newLeadData = {
                    tenantId: tenantObjectId,
                    fullName: leadData.fullName,
                    email: leadData.email || null,
                    phone: leadData.phone,
                    alternatePhone: leadData.alternatePhone || null,
                    source: leadData.source || 'other',
                    requirements: leadData.requirements || null,
                    status: leadData.status || 'new',
                    priority: leadData.priority || 'medium',
                    projectId: leadData.projectId && mongoose.Types.ObjectId.isValid(leadData.projectId) ? new mongoose.Types.ObjectId(leadData.projectId) : null,
                    assignedTo: leadData.assignedTo && mongoose.Types.ObjectId.isValid(leadData.assignedTo) ? new mongoose.Types.ObjectId(leadData.assignedTo) : null,
                    budget: (leadData.budgetMin || leadData.budgetMax) ? {
                        min: parseFloat(leadData.budgetMin) || 0,
                        max: parseFloat(leadData.budgetMax) || 0,
                        currency: leadData.currency || 'INR'
                    } : undefined,
                    preferredUnitTypes: leadData.preferredUnitTypes ?
                        leadData.preferredUnitTypes.split(',').map(type => type.trim()).filter(type => type) :
                        [],
                    tags: leadData.tags ? leadData.tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [],
                    // Assuming address fields are flat in CSV: street, city, state, postalCode, country
                    address: (leadData.street || leadData.city) ? {
                        street: leadData.street,
                        city: leadData.city,
                        state: leadData.state,
                        postalCode: leadData.postalCode,
                        country: leadData.country || 'India'
                    } : undefined,
                };

                const lead = new Lead(newLeadData);
                await lead.save();
                results.imported++;
            } catch (error) {
                results.errors.push({ message: `Error importing lead: ${error.message}`, leadData });
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
