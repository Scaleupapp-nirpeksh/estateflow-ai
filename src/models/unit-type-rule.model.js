const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Unit Type Rule Schema
 * Defines pricing and other rules for specific unit types
 */
const UnitTypeRuleSchema = new Schema(
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
            required: [true, 'Project ID is required'],
            index: true,
        },
        unitType: {
            type: String,
            required: [true, 'Unit type is required'],
            trim: true,
            index: true,
        },
        // Pricing rules specific to this unit type
        pricingRules: {
            // Which area to base price on (carpetArea, builtUpArea, superBuiltUpArea)
            priceBasedOn: {
                type: String,
                enum: ['carpetArea', 'builtUpArea', 'superBuiltUpArea'],
                default: 'superBuiltUpArea'
            },
            // Custom premium calculation parameters
            premiumCalculations: {
                type: Map,
                of: mongoose.Schema.Types.Mixed,
                default: {}
            },
            // Additional taxes specific to this unit type
            additionalTaxes: [
                {
                    name: {
                        type: String,
                        required: true
                    },
                    type: {
                        type: String,
                        enum: ['fixed', 'percentage'],
                        default: 'percentage'
                    },
                    value: {
                        type: Number,
                        required: true
                    },
                    description: String
                }
            ],
            // Any other custom rules (stored as JSON)
            customRules: {
                type: mongoose.Schema.Types.Mixed,
                default: {}
            }
        },
        active: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true
    }
);

// Create compound index for faster lookups
UnitTypeRuleSchema.index({ tenantId: 1, projectId: 1, unitType: 1 }, { unique: true });

/**
 * @typedef UnitTypeRule
 */
const UnitTypeRule = mongoose.model('UnitTypeRule', UnitTypeRuleSchema);

module.exports = UnitTypeRule;