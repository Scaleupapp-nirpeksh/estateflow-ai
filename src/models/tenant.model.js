const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Tenant Schema
 * Represents an organization with its own isolated data
 */
const TenantSchema = new Schema(
    {
        name: {
            type: String,
            required: [true, 'Tenant name is required'],
            trim: true,
        },
        domain: {
            type: String,
            required: [true, 'Domain is required'],
            unique: true,
            trim: true,
        },
        logo: {
            type: String,
            default: null,
        },
        address: {
            type: String,
            default: null,
        },
        gstIn: {
            type: String,
            default: null,
        },
        contactEmail: {
            type: String,
            required: [true, 'Contact email is required'],
            trim: true,
            lowercase: true,
        },
        contactPhone: {
            type: String,
            default: null,
        },
        settings: {
            businessRules: {
                maxDiscountPercentage: {
                    type: Number,
                    default: 5,
                },
                floorRisePremium: {
                    type: Number,
                    default: 0,
                },
                lockPeriodMinutes: {
                    type: Number,
                    default: 60,
                },
            },
            costSheetTemplate: {
                type: Schema.Types.ObjectId,
                ref: 'Template',
                default: null,
            },
            emailTemplates: {
                reminder: {
                    type: Schema.Types.ObjectId,
                    ref: 'Template',
                    default: null,
                },
                costSheet: {
                    type: Schema.Types.ObjectId,
                    ref: 'Template',
                    default: null,
                },
            },
            languagePreference: {
                type: String,
                default: 'en',
            },
        },
        subscription: {
            plan: {
                type: String,
                enum: ['Starter', 'Growth', 'Premium', 'Signature'],
                default: 'Starter',
            },
            expiresAt: {
                type: Date,
                default: () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // Default 1 year from now
            },
            limits: {
                storageGB: {
                    type: Number,
                    default: 100,
                },
                aiMessagesPerMonth: {
                    type: Number,
                    default: 25000,
                },
            },
        },
        active: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
    }
);

// Add indexes for better query performance
TenantSchema.index({ domain: 1 });
TenantSchema.index({ 'subscription.plan': 1 });
TenantSchema.index({ active: 1 });

/**
 * @typedef Tenant
 */
const Tenant = mongoose.model('Tenant', TenantSchema);

module.exports = Tenant;