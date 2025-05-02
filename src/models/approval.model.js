// src/models/approval.model.js

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Approval Schema
 * Represents an approval request in the system
 */
const ApprovalSchema = new Schema(
    {
        tenantId: {
            type: Schema.Types.ObjectId,
            ref: 'Tenant',
            required: [true, 'Tenant ID is required'],
            index: true,
        },
        type: {
            type: String,
            enum: ['discount', 'special_terms', 'cancellation', 'amendment', 'payment_schedule'],
            required: [true, 'Approval type is required'],
            index: true,
        },
        // Reference to the entity being approved (booking, payment schedule, etc.)
        entityType: {
            type: String,
            enum: ['booking', 'payment_schedule'],
            required: [true, 'Entity type is required'],
        },
        entityId: {
            type: Schema.Types.ObjectId,
            required: [true, 'Entity ID is required'],
            refPath: 'entityType',
            index: true,
        },
        // Financial details for the approval
        amount: {
            type: Number,
            min: 0,
        },
        percentage: {
            type: Number,
            min: 0,
            max: 100,
        },
        // Approval status
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending',
            index: true,
        },
        // Approval request details
        requestedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        justification: {
            type: String,
            trim: true,
        },
        // Approval chain configuration
        approvalChain: [
            {
                level: {
                    type: Number,
                    required: true,
                },
                role: {
                    type: String,
                    required: true,
                },
                minAmount: {
                    type: Number,
                    default: 0,
                },
                maxAmount: {
                    type: Number,
                },
                assignedTo: {
                    type: Schema.Types.ObjectId,
                    ref: 'User',
                },
                status: {
                    type: String,
                    enum: ['pending', 'approved', 'rejected', 'skipped'],
                    default: 'pending',
                },
                comment: {
                    type: String,
                    trim: true,
                },
                timestamp: Date,
            },
        ],
        currentApprovalLevel: {
            type: Number,
            default: 0,
        },
        // Audit fields
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        updatedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
        },
    },
    {
        timestamps: true,
    }
);

// Add compound indexes for efficient querying
ApprovalSchema.index({ tenantId: 1, status: 1 });
ApprovalSchema.index({ tenantId: 1, 'approvalChain.assignedTo': 1, status: 1 });

/**
 * Process approval at current level
 * @param {String} action - 'approve' or 'reject'
 * @param {Object} data - Approval data including user and comment
 */
ApprovalSchema.methods.processApproval = async function (action, data) {
    const { userId, comment } = data;

    // Find current approval level
    const currentLevel = this.currentApprovalLevel;
    const currentApproval = this.approvalChain.find(a => a.level === currentLevel);

    if (!currentApproval) {
        throw new Error('Invalid approval level');
    }

    // Update the approval status at this level
    currentApproval.status = action === 'approve' ? 'approved' : 'rejected';
    currentApproval.comment = comment;
    currentApproval.timestamp = new Date();

    // If rejected, update overall status
    if (action === 'reject') {
        this.status = 'rejected';
    } else {
        // Check if this is the last level
        const nextLevel = this.approvalChain.find(a => a.level === currentLevel + 1);

        if (!nextLevel) {
            // Final approval
            this.status = 'approved';
        } else {
            // Move to next level
            this.currentApprovalLevel = currentLevel + 1;
        }
    }

    this.updatedBy = userId;
    await this.save();

    return this;
};

/**
 * Determine if user can approve at current level
 * @param {String} userId - User ID
 * @returns {Boolean}
 */
ApprovalSchema.methods.canBeApprovedBy = function (userId) {
    if (this.status !== 'pending') {
        return false;
    }

    const currentLevel = this.currentApprovalLevel;
    const currentApproval = this.approvalChain.find(a => a.level === currentLevel);

    if (!currentApproval) {
        return false;
    }

    // If specific user is assigned, check that
    if (currentApproval.assignedTo) {
        return currentApproval.assignedTo.toString() === userId.toString();
    }

    // Otherwise, will be checked against role in service layer
    return true;
};

/**
 * @typedef Approval
 */
const Approval = mongoose.model('Approval', ApprovalSchema);

module.exports = Approval;