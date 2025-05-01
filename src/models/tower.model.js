const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Tower Schema
 * Represents a building structure within a project
 */
const TowerSchema = new Schema(
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
        name: {
            type: String,
            required: [true, 'Tower name is required'],
            trim: true,
        },
        totalFloors: {
            type: Number,
            required: [true, 'Total floors is required'],
            min: 1,
        },
        unitsPerFloor: {
            type: Number,
            default: 4,
            min: 1,
        },
        construction: {
            status: {
                type: String,
                enum: ['Planning', 'Foundation', 'Superstructure', 'Finishing', 'Complete'],
                default: 'Planning',
            },
            completionPercentage: {
                type: Number,
                default: 0,
                min: 0,
                max: 100,
            },
            estimatedCompletionDate: {
                type: Date,
                default: null,
            },
        },
        premiums: {
            floorRise: {
                type: {
                    type: String,
                    enum: ['fixed', 'percentage'],
                    default: 'fixed',
                },
                value: {
                    type: Number,
                    default: 0,
                },
                floorStart: {
                    type: Number,
                    default: 1,
                },
            },
            viewPremium: [
                {
                    view: {
                        type: String,
                        trim: true,
                    },
                    percentage: {
                        type: Number,
                        min: 0,
                        max: 100,
                    },
                },
            ],
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

// Add compound indexes for efficient querying
TowerSchema.index({ tenantId: 1, projectId: 1 });
TowerSchema.index({ projectId: 1, 'construction.status': 1 });

/**
 * Calculate floor rise premium for a specific floor
 * @param {Number} floor - The floor number
 * @returns {Object} Premium details
 */
TowerSchema.methods.calculateFloorRisePremium = function (floor) {
    const { floorRise } = this.premiums;

    if (floor < floorRise.floorStart) {
        return { type: floorRise.type, value: 0 };
    }

    const floorDifference = floor - floorRise.floorStart + 1;
    const premium = floorDifference * floorRise.value;

    return {
        type: floorRise.type,
        value: premium,
    };
};

/**
 * Calculate view premium for a specific view
 * @param {String} viewType - The type of view
 * @returns {Number} Premium percentage
 */
TowerSchema.methods.calculateViewPremium = function (viewType) {
    const viewPremium = this.premiums.viewPremium.find(
        (premium) => premium.view === viewType
    );

    return viewPremium ? viewPremium.percentage : 0;
};

/**
 * Calculate total number of units in the tower
 */
TowerSchema.methods.calculateTotalUnits = async function () {
    const Unit = mongoose.model('Unit');
    return Unit.countDocuments({ towerId: this._id });
};

/**
 * Calculate available units in the tower
 */
TowerSchema.methods.calculateAvailableUnits = async function () {
    const Unit = mongoose.model('Unit');
    return Unit.countDocuments({
        towerId: this._id,
        status: 'available'
    });
};

/**
 * @typedef Tower
 */
const Tower = mongoose.model('Tower', TowerSchema);

module.exports = Tower;