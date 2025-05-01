const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Unit Schema
 * Represents an individual property for sale
 */
const UnitSchema = new Schema(
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
        towerId: {
            type: Schema.Types.ObjectId,
            ref: 'Tower',
            required: [true, 'Tower ID is required'],
            index: true,
        },
        number: {
            type: String,
            required: [true, 'Unit number is required'],
            trim: true,
        },
        floor: {
            type: Number,
            required: [true, 'Floor number is required'],
            min: 0,
        },
        type: {
            type: String,
            required: [true, 'Unit type is required'],
            trim: true,
            index: true,
        },
        carpetArea: {
            type: Number,
            required: [true, 'Carpet area is required'],
            min: 0,
        },
        builtUpArea: {
            type: Number,
            required: [true, 'Built-up area is required'],
            min: 0,
        },
        superBuiltUpArea: {
            type: Number,
            required: [true, 'Super built-up area is required'],
            min: 0,
        },
        basePrice: {
            type: Number,
            required: [true, 'Base price is required'],
            min: 0,
        },
        status: {
            type: String,
            enum: ['available', 'locked', 'booked', 'sold'],
            default: 'available',
            index: true,
        },
        lockedUntil: {
            type: Date,
            default: null,
        },
        lockedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        views: [
            {
                type: String,
                trim: true,
            },
        ],
        attributes: {
            bedrooms: {
                type: Number,
                default: 1,
                min: 0,
            },
            bathrooms: {
                type: Number,
                default: 1,
                min: 0,
            },
            balconies: {
                type: Number,
                default: 0,
                min: 0,
            },
            parking: {
                type: Number,
                default: 0,
                min: 0,
            },
            furnished: {
                type: Boolean,
                default: false,
            },
            storeRoom: {
                type: Boolean,
                default: false,
            },
            servantsQuarters: {
                type: Boolean,
                default: false,
            },
        },
        premiumAdjustments: [
            {
                type: {
                    type: String,
                    enum: ['floor', 'view', 'corner', 'park', 'special', 'discount'],
                    required: true,
                },
                amount: {
                    type: Number,
                    default: 0,
                },
                percentage: {
                    type: Number,
                    default: 0,
                },
                description: {
                    type: String,
                    default: '',
                },
            },
        ],
        additionalCharges: [
            {
                name: {
                    type: String,
                    required: true,
                    trim: true,
                },
                amount: {
                    type: Number,
                    required: true,
                    min: 0,
                },
                required: {
                    type: Boolean,
                    default: true,
                },
                description: {
                    type: String,
                    default: '',
                },
            },
        ],
    },
    {
        timestamps: true,
    }
);

// Add compound indexes for efficient querying
UnitSchema.index({ projectId: 1, towerId: 1, status: 1 });
UnitSchema.index({ projectId: 1, type: 1, status: 1 });
UnitSchema.index({ tenantId: 1, status: 1 });
UnitSchema.index({ tenantId: 1, projectId: 1, status: 1 });

/**
 * Check if the unit is available
 * @returns {Boolean}
 */
UnitSchema.methods.isAvailable = function () {
    return this.status === 'available';
};

/**
 * Check if the unit is locked and if the lock is still valid
 * @returns {Boolean}
 */
UnitSchema.methods.isLocked = function () {
    return (
        this.status === 'locked' &&
        this.lockedUntil &&
        this.lockedUntil > new Date()
    );
};

/**
 * Calculate the total price of the unit including all premiums and charges
 * @returns {Object} Detailed price breakdown
 */
UnitSchema.methods.calculatePrice = async function () {
    try {
        // Fetch related models
        const Project = mongoose.model('Project');
        const Tower = mongoose.model('Tower');

        const project = await Project.findById(this.projectId);
        const tower = await Tower.findById(this.towerId);

        if (!project || !tower) {
            throw new Error('Project or Tower not found');
        }

        // Base price calculation
        const basePrice = this.basePrice * this.superBuiltUpArea;

        // Premium calculations
        let premiums = [];
        let premiumTotal = 0;

        // Floor rise premium
        const floorPremium = tower.calculateFloorRisePremium(this.floor);
        if (floorPremium.value > 0) {
            let floorPremiumAmount = 0;

            if (floorPremium.type === 'fixed') {
                floorPremiumAmount = floorPremium.value * this.superBuiltUpArea;
            } else {
                // Percentage
                floorPremiumAmount = (basePrice * floorPremium.value) / 100;
            }

            premiums.push({
                type: 'floor',
                amount: floorPremiumAmount,
                percentage: floorPremium.type === 'percentage' ? floorPremium.value : null,
                description: `Floor rise premium for floor ${this.floor}`,
            });

            premiumTotal += floorPremiumAmount;
        }

        // View premiums
        for (const view of this.views) {
            const viewPercentage = tower.calculateViewPremium(view);
            if (viewPercentage > 0) {
                const viewAmount = (basePrice * viewPercentage) / 100;
                premiums.push({
                    type: 'view',
                    amount: viewAmount,
                    percentage: viewPercentage,
                    description: `Premium for ${view} view`,
                });

                premiumTotal += viewAmount;
            }
        }

        // Additional premium adjustments
        for (const premium of this.premiumAdjustments) {
            let amount = premium.amount;

            if (premium.percentage > 0) {
                amount = (basePrice * premium.percentage) / 100;
            }

            premiums.push({
                type: premium.type,
                amount: amount,
                percentage: premium.percentage > 0 ? premium.percentage : null,
                description: premium.description,
            });

            if (premium.type === 'discount') {
                premiumTotal -= amount;
            } else {
                premiumTotal += amount;
            }
        }

        // Additional charges
        let additionalChargesTotal = 0;
        for (const charge of this.additionalCharges) {
            additionalChargesTotal += charge.amount;
        }

        // Subtotal
        const subtotal = basePrice + premiumTotal + additionalChargesTotal;

        // Tax calculations
        const gst = (subtotal * project.gstRate) / 100;
        const stampDuty = (subtotal * project.stampDutyRate) / 100;
        const registration = (subtotal * project.registrationRate) / 100;

        const taxTotal = gst + stampDuty + registration;

        // Total price
        const totalPrice = subtotal + taxTotal;

        return {
            basePrice: basePrice,
            premiums: premiums,
            premiumTotal: premiumTotal,
            additionalCharges: this.additionalCharges,
            additionalChargesTotal: additionalChargesTotal,
            subtotal: subtotal,
            taxes: {
                gst: {
                    rate: project.gstRate,
                    amount: gst,
                },
                stampDuty: {
                    rate: project.stampDutyRate,
                    amount: stampDuty,
                },
                registration: {
                    rate: project.registrationRate,
                    amount: registration,
                },
            },
            taxTotal: taxTotal,
            totalPrice: totalPrice,
        };
    } catch (error) {
        throw error;
    }
};

/**
 * Lock the unit for a potential buyer
 * @param {ObjectId} userId - User ID who is locking the unit
 * @param {Number} minutes - Lock duration in minutes
 */
UnitSchema.methods.lock = async function (userId, minutes = 60) {
    if (this.status !== 'available') {
        throw new Error(`Unit is not available. Current status: ${this.status}`);
    }

    const lockExpiry = new Date();
    lockExpiry.setMinutes(lockExpiry.getMinutes() + minutes);

    this.status = 'locked';
    this.lockedBy = userId;
    this.lockedUntil = lockExpiry;

    await this.save();
    return this;
};

/**
 * Release a locked unit
 */
UnitSchema.methods.release = async function () {
    if (this.status !== 'locked') {
        throw new Error(`Unit is not locked. Current status: ${this.status}`);
    }

    this.status = 'available';
    this.lockedBy = null;
    this.lockedUntil = null;

    await this.save();
    return this;
};

/**
 * Mark unit as booked
 * @param {ObjectId} bookingId - Booking ID reference
 */
UnitSchema.methods.book = async function (bookingId) {
    if (this.status !== 'locked' && this.status !== 'available') {
        throw new Error(`Unit cannot be booked. Current status: ${this.status}`);
    }

    this.status = 'booked';
    this.lockedBy = null;
    this.lockedUntil = null;
    this.bookingId = bookingId;

    await this.save();
    return this;
};

/**
 * Mark unit as sold
 */
UnitSchema.methods.sell = async function () {
    if (this.status !== 'booked') {
        throw new Error(`Unit cannot be sold. Current status: ${this.status}`);
    }

    this.status = 'sold';

    await this.save();
    return this;
};

/**
 * @typedef Unit
 */
const Unit = mongoose.model('Unit', UnitSchema);

module.exports = Unit;