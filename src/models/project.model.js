const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Project Schema
 * Represents a real estate development project
 */
const ProjectSchema = new Schema(
    {
        tenantId: {
            type: Schema.Types.ObjectId,
            ref: 'Tenant',
            required: [true, 'Tenant ID is required'],
            index: true,
        },
        name: {
            type: String,
            required: [true, 'Project name is required'],
            trim: true,
        },
        address: {
            type: String,
            required: [true, 'Project address is required'],
            trim: true,
        },
        city: {
            type: String,
            required: [true, 'City is required'],
            trim: true,
            index: true,
        },
        description: {
            type: String,
            default: '',
        },
        amenities: [
            {
                type: String,
                trim: true,
            },
        ],
        gstRate: {
            type: Number,
            default: 5,
            min: 0,
            max: 100,
        },
        stampDutyRate: {
            type: Number,
            default: 5,
            min: 0,
            max: 100,
        },
        registrationRate: {
            type: Number,
            default: 1,
            min: 0,
            max: 100,
        },
        active: {
            type: Boolean,
            default: true,
            index: true,
        },
        logo: {
            type: String,
            default: null,
        },
        images: [
            {
                type: String,
            },
        ],
        // Custom pricing model for this project
        customPricingModel: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        },
        location: {
            type: {
                type: String,
                enum: ['Point'],
                default: 'Point',
            },
            coordinates: {
                type: [Number], // [longitude, latitude]
                default: [0, 0],
            },
        },
    },
    {
        timestamps: true,
    }
);

// Add compound index for tenant and city
ProjectSchema.index({ tenantId: 1, city: 1 });

// Add text index for search
ProjectSchema.index({ name: 'text', description: 'text', address: 'text' });

/**
 * Calculate total number of units in the project
 */
ProjectSchema.methods.calculateTotalUnits = async function () {
    const Unit = mongoose.model('Unit');
    return Unit.countDocuments({ projectId: this._id });
};

/**
 * Calculate available units in the project
 */
ProjectSchema.methods.calculateAvailableUnits = async function () {
    const Unit = mongoose.model('Unit');
    return Unit.countDocuments({
        projectId: this._id,
        status: 'available'
    });
};

/**
 * @typedef Project
 */
const Project = mongoose.model('Project', ProjectSchema);

module.exports = Project;