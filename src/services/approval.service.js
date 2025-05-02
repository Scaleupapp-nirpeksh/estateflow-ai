// src/services/approval.service.js

const mongoose = require('mongoose');
const Approval = require('../models/approval.model');
const Booking = require('../models/booking.model');
const User = require('../models/user.model');
const { ApiError } = require('../utils/error-handler');
const logger = require('../utils/logger');

/**
 * Create an approval request
 * @param {Object} approvalData - Approval request data
 * @returns {Promise<Approval>} - Created approval
 */
const createApproval = async (approvalData) => {
    try {
        // Validate entity exists
        let entityModel;
        switch (approvalData.entityType) {
            case 'booking':
                entityModel = Booking;
                break;
            case 'payment_schedule':
                entityModel = require('../models/payment-schedule.model');
                break;
            default:
                throw new ApiError(400, 'Invalid entity type');
        }

        const entity = await entityModel.findById(approvalData.entityId);
        if (!entity) {
            throw new ApiError(404, 'Entity not found');
        }

        // Check tenant ID matches
        if (entity.tenantId.toString() !== approvalData.tenantId.toString()) {
            throw new ApiError(403, 'Tenant ID mismatch');
        }

        // Generate approval chain based on amount
        const approvalChain = await generateApprovalChain(
            approvalData.tenantId,
            approvalData.type,
            approvalData.amount,
            approvalData.percentage
        );

        // Create approval
        const approval = new Approval({
            tenantId: approvalData.tenantId,
            type: approvalData.type,
            entityType: approvalData.entityType,
            entityId: approvalData.entityId,
            amount: approvalData.amount,
            percentage: approvalData.percentage,
            requestedBy: approvalData.userId,
            status: 'pending',
            justification: approvalData.justification,
            approvalChain,
            currentApprovalLevel: 1, // Start at first level
            createdBy: approvalData.userId,
        });

        await approval.save();

        // If entity is a booking, update its status
        if (approvalData.entityType === 'booking') {
            await Booking.findByIdAndUpdate(approvalData.entityId, {
                status: 'pending_approval',
                updatedBy: approvalData.userId,
                updatedAt: new Date(),
            });
        }

        return approval;
    } catch (error) {
        logger.error('Error creating approval', { error });
        throw error;
    }
};

/**
 * Generate approval chain based on amount/percentage
 * @param {string} tenantId - Tenant ID
 * @param {string} type - Approval type
 * @param {number} amount - Amount for approval
 * @param {number} percentage - Percentage for approval
 * @returns {Promise<Array>} - Approval chain
 */
const generateApprovalChain = async (tenantId, type, amount, percentage) => {
    try {
        // TODO: In a real system, this would be configurable per tenant
        // For now, using a simple hardcoded chain based on amount

        const approvalChain = [];

        // Get all principals, business heads, and sales directors
        const approvers = await User.find({
            tenantId,
            role: { $in: ['Principal', 'BusinessHead', 'SalesDirector'] },
            active: true,
        });

        const principals = approvers.filter(u => u.role === 'Principal');
        const businessHeads = approvers.filter(u => u.role === 'BusinessHead');
        const salesDirectors = approvers.filter(u => u.role === 'SalesDirector');

        // Default assignee (first principal, or first business head if no principal)
        const defaultAssignee = principals.length > 0
            ? principals[0]._id
            : businessHeads.length > 0
                ? businessHeads[0]._id
                : null;

        // For discount approvals
        if (type === 'discount') {
            if (amount > 1000000 || percentage > 10) {
                // High value/percentage - require Principal approval
                approvalChain.push({
                    level: 1,
                    role: 'Principal',
                    minAmount: 1000000,
                    assignedTo: principals.length > 0 ? principals[0]._id : defaultAssignee,
                    status: 'pending',
                });
            } else if (amount > 500000 || percentage > 5) {
                // Medium value/percentage - require BusinessHead approval
                approvalChain.push({
                    level: 1,
                    role: 'BusinessHead',
                    minAmount: 500000,
                    maxAmount: 1000000,
                    assignedTo: businessHeads.length > 0 ? businessHeads[0]._id : defaultAssignee,
                    status: 'pending',
                });
            } else {
                // Low value/percentage - require SalesDirector approval
                approvalChain.push({
                    level: 1,
                    role: 'SalesDirector',
                    maxAmount: 500000,
                    assignedTo: salesDirectors.length > 0 ? salesDirectors[0]._id : defaultAssignee,
                    status: 'pending',
                });
            }
        } else if (type === 'cancellation') {
            // Cancellations always require BusinessHead approval
            approvalChain.push({
                level: 1,
                role: 'BusinessHead',
                assignedTo: businessHeads.length > 0 ? businessHeads[0]._id : defaultAssignee,
                status: 'pending',
            });
        } else {
            // Other approvals - standard chain
            approvalChain.push({
                level: 1,
                role: 'SalesDirector',
                assignedTo: salesDirectors.length > 0 ? salesDirectors[0]._id : defaultAssignee,
                status: 'pending',
            });
        }

        return approvalChain;
    } catch (error) {
        logger.error('Error generating approval chain', { error });
        throw error;
    }
};

/**
 * Get approvals with filtering and pagination
 * @param {string} tenantId - Tenant ID
 * @param {Object} filters - Filter options
 * @param {Object} pagination - Pagination options
 * @returns {Promise<Object>} - Approvals with pagination info
 */
const getApprovals = async (tenantId, filters = {}, pagination = { page: 1, limit: 10 }) => {
    try {
        const { page, limit } = pagination;
        const skip = (page - 1) * limit;

        // Build query
        const query = { tenantId };

        // Add status filter if provided
        if (filters.status) {
            query.status = filters.status;
        }

        // Add type filter if provided
        if (filters.type) {
            query.type = filters.type;
        }

        // Add entity filter if provided
        if (filters.entityId) {
            query.entityId = filters.entityId;
        }

        if (filters.entityType) {
            query.entityType = filters.entityType;
        }

        // Add assigned filter if provided
        if (filters.assignedTo) {
            query['approvalChain.assignedTo'] = filters.assignedTo;
            query.status = 'pending'; // Only pending approvals can be assigned
        }

        // Add role filter if provided
        if (filters.role) {
            query['approvalChain.role'] = filters.role;
            query.status = 'pending'; // Only pending approvals can have a role
        }

        // Count total documents
        const total = await Approval.countDocuments(query);

        // Execute query with pagination
        const approvals = await Approval.find(query)
            .populate('requestedBy', 'name email')
            .populate('createdBy', 'name')
            .populate('approvalChain.assignedTo', 'name email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        return {
            data: approvals,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
            },
        };
    } catch (error) {
        logger.error('Error getting approvals', { error, tenantId });
        throw error;
    }
};

/**
 * Get approval by ID
 * @param {string} id - Approval ID
 * @returns {Promise<Approval>} - Approval details
 */
const getApprovalById = async (id) => {
    try {
        const approval = await Approval.findById(id)
            .populate('requestedBy', 'name email')
            .populate('createdBy', 'name')
            .populate('approvalChain.assignedTo', 'name email')
            .populate({
                path: 'entityId',
                select: 'customerName bookingNumber unitId totalBookingAmount',
                populate: {
                    path: 'unitId',
                    select: 'number type floor'
                }
            });

        if (!approval) {
            throw new ApiError(404, 'Approval not found');
        }

        return approval;
    } catch (error) {
        logger.error('Error getting approval', { error, approvalId: id });
        throw error;
    }
};

/**
 * Process approval (approve or reject)
 * @param {string} id - Approval ID
 * @param {string} action - 'approve' or 'reject'
 * @param {Object} actionData - Action data
 * @returns {Promise<Approval>} - Updated approval
 */
const processApproval = async (id, action, actionData) => {
    try {
        const approval = await Approval.findById(id);

        if (!approval) {
            throw new ApiError(404, 'Approval not found');
        }

        // Check if approval is pending
        if (approval.status !== 'pending') {
            throw new ApiError(400, `Cannot ${action} an approval that is not pending`);
        }

        // Check if user can approve at current level
        if (!approval.canBeApprovedBy(actionData.userId)) {
            // Check if user has the required role
            const currentLevel = approval.currentApprovalLevel;
            const currentApproval = approval.approvalChain.find(a => a.level === currentLevel);

            const user = await User.findById(actionData.userId);
            if (!user) {
                throw new ApiError(404, 'User not found');
            }

            if (user.role !== currentApproval.role && user.role !== 'Principal') {
                throw new ApiError(403, 'You do not have permission to process this approval');
            }
        }

        // Process the approval
        await approval.processApproval(action, {
            userId: actionData.userId,
            comment: actionData.comment,
        });

        // Update the entity based on approval result
        await updateEntityAfterApproval(approval, action === 'approve', actionData.userId);

        return approval;
    } catch (error) {
        logger.error('Error processing approval', { error, approvalId: id });
        throw error;
    }
};

/**
 * Update entity after approval is processed
 * @param {Approval} approval - Approval object
 * @param {boolean} isApproved - Whether approval was approved
 * @param {string} userId - User ID performing the action
 * @returns {Promise<void>}
 */
const updateEntityAfterApproval = async (approval, isApproved, userId) => {
    try {
        const { entityType, entityId, type } = approval;

        if (entityType === 'booking') {
            const booking = await Booking.findById(entityId);

            if (!booking) {
                throw new ApiError(404, 'Booking not found');
            }

            if (type === 'discount') {
                // Update discount status
                booking.discounts.forEach(discount => {
                    if (discount.approvalId && discount.approvalId.toString() === approval._id.toString()) {
                        discount.status = isApproved ? 'approved' : 'rejected';
                    }
                });

                // Update booking status if all discounts are processed
                const hasPendingDiscounts = booking.discounts.some(d => d.status === 'pending');

                if (!hasPendingDiscounts) {
                    booking.status = 'approved';
                }

                // Recalculate total if discount was approved
                if (isApproved) {
                    booking.totalBookingAmount = booking.calculateTotal();
                }

                booking.updatedBy = userId;
                booking.updatedAt = new Date();

                await booking.save();
            } else if (type === 'cancellation') {
                // Update booking status if cancellation was approved
                if (isApproved) {
                    await Booking.findByIdAndUpdate(entityId, {
                        status: 'cancelled',
                        'cancellation.approvedBy': userId,
                        'cancellation.date': new Date(),
                        updatedBy: userId,
                        updatedAt: new Date(),
                    });

                    // Update unit status to available
                    const unitId = booking.unitId;
                    await Unit.findByIdAndUpdate(unitId, {
                        status: 'available',
                        bookingId: null,
                    });
                }
            }
        } else if (entityType === 'payment_schedule') {
            // Handle payment schedule approvals
            if (isApproved) {
                const PaymentSchedule = require('../models/payment-schedule.model');
                const schedule = await PaymentSchedule.findById(entityId);

                if (!schedule) {
                    throw new ApiError(404, 'Payment schedule not found');
                }

                // Special handling based on approval type
                if (type === 'payment_schedule') {
                    // Mark approval ID in change history entries
                    schedule.changeHistory.forEach(entry => {
                        if (!entry.approvalId) {
                            entry.approvalId = approval._id;
                        }
                    });

                    schedule.updatedBy = userId;
                    await schedule.save();
                }
            }
        }
    } catch (error) {
        logger.error('Error updating entity after approval', {
            error,
            approvalId: approval._id,
            entityType: approval.entityType,
            entityId: approval.entityId
        });
        throw error;
    }
};

/**
 * Get pending approvals for a user
 * @param {string} tenantId - Tenant ID
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Pending approvals
 */
const getPendingApprovalsForUser = async (tenantId, userId) => {
    try {
        // Get user to check role
        const user = await User.findById(userId);

        if (!user) {
            throw new ApiError(404, 'User not found');
        }

        const query = {
            tenantId,
            status: 'pending',
        };

        // If not Principal, add specific conditions
        if (user.role !== 'Principal') {
            query.$or = [
                { 'approvalChain.assignedTo': userId },
                {
                    [`approvalChain.${user.role}`]: { $exists: true },
                    currentApprovalLevel: { $exists: true }
                }
            ];
        }

        const approvals = await Approval.find(query)
            .populate('requestedBy', 'name email')
            .populate('approvalChain.assignedTo', 'name email')
            .populate({
                path: 'entityId',
                select: 'customerName bookingNumber unitId totalBookingAmount',
                populate: {
                    path: 'unitId',
                    select: 'number type floor'
                }
            })
            .sort({ createdAt: -1 });

        return approvals;
    } catch (error) {
        logger.error('Error getting pending approvals for user', { error, userId, tenantId });
        throw error;
    }
};

module.exports = {
    createApproval,
    getApprovals,
    getApprovalById,
    processApproval,
    getPendingApprovalsForUser,
};