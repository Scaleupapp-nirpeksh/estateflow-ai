// src/models/booking.model.js

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Booking Schema
 * Represents a property booking in the system
 */
const BookingSchema = new Schema(
    {
        tenantId: {
            type: Schema.Types.ObjectId,
            ref: 'Tenant',
            required: [true, 'Tenant ID is required'],
            index: true,
        },
        bookingNumber: {
            type: String,
            required: [true, 'Booking number is required'],
            trim: true,
            unique: true,
        },
        // Customer information from lead
        leadId: {
            type: Schema.Types.ObjectId,
            ref: 'Lead',
            required: [true, 'Lead ID is required'],
            index: true,
        },
        customerName: {
            type: String,
            required: [true, 'Customer name is required'],
            trim: true,
        },
        customerEmail: {
            type: String,
            trim: true,
            lowercase: true,
        },
        customerPhone: {
            type: String,
            required: [true, 'Customer phone is required'],
            trim: true,
        },
        // Property information
        unitId: {
            type: Schema.Types.ObjectId,
            ref: 'Unit',
            required: [true, 'Unit ID is required'],
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
        },
        // Financial information
        basePrice: {
            type: Number,
            required: [true, 'Base price is required'],
            min: 0,
        },
        premiums: [
            {
                type: {
                    type: String,
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
        discounts: [
            {
                type: {
                    type: String,
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
                approvalId: {
                    type: Schema.Types.ObjectId,
                    ref: 'Approval',
                },
                status: {
                    type: String,
                    enum: ['pending', 'approved', 'rejected'],
                    default: 'pending',
                },
            },
        ],
        taxes: {
            gst: {
                rate: {
                    type: Number,
                    default: 0,
                },
                amount: {
                    type: Number,
                    default: 0,
                },
            },
            stampDuty: {
                rate: {
                    type: Number,
                    default: 0,
                },
                amount: {
                    type: Number,
                    default: 0,
                },
            },
            registration: {
                rate: {
                    type: Number,
                    default: 0,
                },
                amount: {
                    type: Number,
                    default: 0,
                },
            },
            otherTaxes: [
                {
                    name: {
                        type: String,
                        required: true,
                    },
                    rate: {
                        type: Number,
                        default: 0,
                    },
                    amount: {
                        type: Number,
                        default: 0,
                    },
                },
            ],
        },
        additionalCharges: [
            {
                name: {
                    type: String,
                    required: true,
                },
                amount: {
                    type: Number,
                    required: true,
                },
                description: {
                    type: String,
                    default: '',
                },
            },
        ],
        totalBookingAmount: {
            type: Number,
            required: [true, 'Total booking amount is required'],
            min: 0,
        },
        // Booking status
        status: {
            type: String,
            enum: ['draft', 'pending_approval', 'approved', 'executed', 'cancelled'],
            default: 'draft',
            index: true,
        },
        // Documents
        documents: [
            {
                type: {
                    type: String,
                    enum: ['cost_sheet', 'booking_form', 'agreement', 'receipt', 'other'],
                    required: true,
                },
                name: {
                    type: String,
                    required: true,
                },
                url: {
                    type: String,
                    required: true,
                },
                version: {
                    type: Number,
                    default: 1,
                },
                createdAt: {
                    type: Date,
                    default: Date.now,
                },
                createdBy: {
                    type: Schema.Types.ObjectId,
                    ref: 'User',
                    required: true,
                },
            },
        ],
        // Notes & comments
        notes: [
            {
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
            },
        ],
        // Payment schedule reference
        paymentScheduleId: {
            type: Schema.Types.ObjectId,
            ref: 'PaymentSchedule',
        },
        // Cancellation details (if applicable)
        cancellation: {
            date: Date,
            reason: String,
            requestedBy: {
                type: Schema.Types.ObjectId,
                ref: 'User',
            },
            approvedBy: {
                type: Schema.Types.ObjectId,
                ref: 'User',
            },
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
BookingSchema.index({ tenantId: 1, status: 1 });
BookingSchema.index({ tenantId: 1, leadId: 1 });
BookingSchema.index({ tenantId: 1, unitId: 1 });
BookingSchema.index({ tenantId: 1, projectId: 1 });

/**
 * Calculate total booking amount
 */
BookingSchema.methods.calculateTotal = function () {
    // Calculate base price total
    let total = this.basePrice;

    // Add premiums
    if (this.premiums && this.premiums.length > 0) {
        for (const premium of this.premiums) {
            total += premium.amount;
        }
    }

    // Subtract discounts (only approved discounts)
    if (this.discounts && this.discounts.length > 0) {
        for (const discount of this.discounts) {
            if (discount.status === 'approved') {
                total -= discount.amount;
            }
        }
    }

    // Add additional charges
    if (this.additionalCharges && this.additionalCharges.length > 0) {
        for (const charge of this.additionalCharges) {
            total += charge.amount;
        }
    }

    // Add taxes
    if (this.taxes) {
        if (this.taxes.gst) {
            total += this.taxes.gst.amount;
        }
        if (this.taxes.stampDuty) {
            total += this.taxes.stampDuty.amount;
        }
        if (this.taxes.registration) {
            total += this.taxes.registration.amount;
        }
        if (this.taxes.otherTaxes && this.taxes.otherTaxes.length > 0) {
            for (const tax of this.taxes.otherTaxes) {
                total += tax.amount;
            }
        }
    }

    return total;
};

/**
 * Add a note to the booking
 */
BookingSchema.methods.addNote = async function (note) {
    this.notes.push(note);
    await this.save();
    return this;
};

/**
 * Check if booking has pending approvals
 */
BookingSchema.methods.hasPendingApprovals = function () {
    if (!this.discounts || this.discounts.length === 0) {
        return false;
    }

    return this.discounts.some(discount => discount.status === 'pending');
};

/**
 * @typedef Booking
 */
const Booking = mongoose.model('Booking', BookingSchema);

module.exports = Booking;