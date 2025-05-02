const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Tenant Schema
 * Represents a tenant organization
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
            trim: true,
            unique: true,
            lowercase: true,
        },
        contactEmail: {
            type: String,
            required: [true, 'Contact email is required'],
            trim: true,
            lowercase: true,
        },
        contactPhone: {
            type: String,
            trim: true,
        },
        address: {
            type: String,
            trim: true,
        },
        logo: {
            type: String,
            default: null,
        },
        gstIn: {
            type: String,
            trim: true,
        },
        active: {
            type: Boolean,
            default: true,
        },
        subscription: {
            plan: {
                type: String,
                enum: ['Starter', 'Growth', 'Premium', 'Signature'],
                default: 'Starter',
            },
            expiresAt: {
                type: Date,
                default: () => new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
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
        // Tenant-wide business rules
        settings: {
            businessRules: {
                maxDiscountPercentage: {
                    type: Number,
                    default: 10
                },
                floorRisePremium: {
                    type: Number,
                    default: 100
                },
                lockPeriodMinutes: {
                    type: Number,
                    default: 60
                }
            },
            // Tenant-wide pricing rules
            pricingRules: {
                type: mongoose.Schema.Types.Mixed,
                default: {}
            }
        }
    },
    {
        timestamps: true,
    }
);

/**
 * @typedef Tenant
 */
const Tenant = mongoose.model('Tenant', TenantSchema);

module.exports = Tenant;