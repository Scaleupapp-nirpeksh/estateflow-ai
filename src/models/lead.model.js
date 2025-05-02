// src/models/lead.model.js

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Lead Schema
 * Represents a potential customer in the sales pipeline
 */
const LeadSchema = new Schema(
    {
        tenantId: {
            type: Schema.Types.ObjectId,
            ref: 'Tenant',
            required: [true, 'Tenant ID is required'],
            index: true,
        },
        projectId: {
            type: Schema.Types.ObjectId,
            ref: 'Project',
            index: true,
        },
        fullName: {
            type: String,
            required: [true, 'Full name is required'],
            trim: true,
        },
        email: {
            type: String,
            trim: true,
            lowercase: true,
        },
        phone: {
            type: String,
            required: [true, 'Phone number is required'],
            trim: true,
            index: true,
        },
        alternatePhone: {
            type: String,
            trim: true,
        },
        status: {
            type: String,
            enum: ['new', 'contacted', 'qualified', 'negotiation', 'converted', 'lost'],
            default: 'new',
            index: true,
        },
        source: {
            type: String,
            enum: ['website', 'referral', 'walk-in', 'advertisement', 'social', 'partner', 'other'],
            default: 'other',
            index: true,
        },
        assignedTo: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            index: true,
        },
        preferredUnitTypes: [{
            type: String,
            trim: true,
        }],
        budget: {
            min: {
                type: Number,
                min: 0,
            },
            max: {
                type: Number,
                min: 0,
            },
            currency: {
                type: String,
                default: 'INR',
            },
        },
        requirements: {
            type: String,
            trim: true,
        },
        priority: {
            type: String,
            enum: ['low', 'medium', 'high', 'urgent'],
            default: 'medium',
            index: true,
        },
        notes: [{
            content: {
                type: String,
                required: true,
            },
            createdBy: {
                type: Schema.Types.ObjectId,
                ref: 'User',
                required: true,
            },
            createdAt: {
                type: Date,
                default: Date.now,
            },
        }],
        interactions: [{
            type: {
                type: String,
                enum: ['call', 'email', 'meeting', 'site-visit', 'whatsapp', 'other'],
                required: true,
            },
            date: {
                type: Date,
                required: true,
            },
            details: {
                type: String,
                trim: true,
            },
            outcome: {
                type: String,
                enum: ['positive', 'neutral', 'negative', 'follow-up'],
            },
            nextAction: {
                type: String,
                trim: true,
            },
            nextActionDate: {
                type: Date,
            },
            createdBy: {
                type: Schema.Types.ObjectId,
                ref: 'User',
                required: true,
            },
        }],
        interestedUnits: [{
            unitId: {
                type: Schema.Types.ObjectId,
                ref: 'Unit',
            },
            interestLevel: {
                type: String,
                enum: ['low', 'medium', 'high'],
                default: 'medium',
            },
            notes: {
                type: String,
            },
        }],
        attachments: [{
            name: {
                type: String,
                required: true,
            },
            url: {
                type: String,
                required: true,
            },
            type: {
                type: String,
                required: true,
            },
            uploadedBy: {
                type: Schema.Types.ObjectId,
                ref: 'User',
                required: true,
            },
            uploadedAt: {
                type: Date,
                default: Date.now,
            },
        }],
        tags: [{
            type: String,
            trim: true,
        }],
        address: {
            street: String,
            city: String,
            state: String,
            postalCode: String,
            country: {
                type: String,
                default: 'India',
            },
        },
    },
    {
        timestamps: true,
    }
);

// Add compound indexes for efficient querying
LeadSchema.index({ tenantId: 1, status: 1 });
LeadSchema.index({ tenantId: 1, assignedTo: 1 });
LeadSchema.index({ tenantId: 1, priority: 1 });
LeadSchema.index({ tenantId: 1, source: 1 });
LeadSchema.index({ phone: 1, tenantId: 1 }, { unique: true });
LeadSchema.index({ fullName: 'text', email: 'text', phone: 'text', requirements: 'text' });

/**
 * Add a new interaction to the lead
 * @param {Object} interaction - Interaction data
 * @returns {Promise<Lead>} - Updated lead
 */
LeadSchema.methods.addInteraction = async function (interaction) {
    this.interactions.push(interaction);

    // Update status based on interaction if specified
    if (interaction.updateStatus) {
        this.status = interaction.updateStatus;
    }

    // Update last updated
    this.updatedAt = new Date();

    return this.save();
};

/**
 * Add a note to the lead
 * @param {Object} note - Note data
 * @returns {Promise<Lead>} - Updated lead
 */
LeadSchema.methods.addNote = async function (note) {
    this.notes.push(note);
    return this.save();
};

/**
 * Mark a lead as interested in a unit
 * @param {Object} interest - Interest data
 * @returns {Promise<Lead>} - Updated lead
 */
LeadSchema.methods.addInterestedUnit = async function (interest) {
    // Check if already interested in this unit
    const existingIndex = this.interestedUnits.findIndex(
        unit => unit.unitId.toString() === interest.unitId.toString()
    );

    if (existingIndex >= 0) {
        // Update existing interest
        this.interestedUnits[existingIndex] = {
            ...this.interestedUnits[existingIndex],
            ...interest,
        };
    } else {
        // Add new interest
        this.interestedUnits.push(interest);
    }

    return this.save();
};

/**
 * @typedef Lead
 */
const Lead = mongoose.model('Lead', LeadSchema);

module.exports = Lead;