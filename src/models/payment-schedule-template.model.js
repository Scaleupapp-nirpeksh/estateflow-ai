// src/models/payment-schedule-template.model.js

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Payment Schedule Template Schema
 * Represents a reusable template for payment schedules
 */
const PaymentScheduleTemplateSchema = new Schema(
    {
        tenantId: {
            type: Schema.Types.ObjectId,
            ref: 'Tenant',
            required: [true, 'Tenant ID is required'],
            index: true,
        },
        name: {
            type: String,
            required: [true, 'Template name is required'],
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        projectId: {
            type: Schema.Types.ObjectId,
            ref: 'Project',
            index: true,
        },
        // Template installments
        installments: [
            {
                name: {
                    type: String,
                    required: [true, 'Installment name is required'],
                    trim: true,
                },
                description: {
                    type: String,
                    trim: true,
                },
                dueTrigger: {
                    type: String,
                    enum: ['booking_date', 'agreement_date', 'construction_milestone', 'fixed_date'],
                    default: 'booking_date',
                },
                triggerOffset: {
                    value: {
                        type: Number,
                        default: 0,
                    },
                    unit: {
                        type: String,
                        enum: ['days', 'weeks', 'months'],
                        default: 'days',
                    },
                },
                triggerMilestone: {
                    type: String,
                    trim: true,
                },
                percentage: {
                    type: Number,
                    min: 0,
                    max: 100,
                },
                amount: {
                    type: Number,
                    min: 0,
                },
            },
        ],
        isDefault: {
            type: Boolean,
            default: false,
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
PaymentScheduleTemplateSchema.index({ tenantId: 1, projectId: 1 });
PaymentScheduleTemplateSchema.index({ tenantId: 1, isDefault: 1 });

/**
 * Create a payment schedule from this template
 * @param {Object} bookingData - Booking information
 * @param {Object} userData - User information
 * @returns {Object} - New payment schedule data
 */
PaymentScheduleTemplateSchema.methods.createSchedule = function (bookingData, userData) {
    // Validate total percentage
    let totalPercentage = 0;
    let hasFixedAmounts = false;

    this.installments.forEach(installment => {
        if (installment.percentage) {
            totalPercentage += installment.percentage;
        } else if (installment.amount) {
            hasFixedAmounts = true;
        }
    });

    if (totalPercentage > 100) {
        throw new Error('Total percentage in template exceeds 100%');
    }

    if (totalPercentage < 100 && !hasFixedAmounts) {
        throw new Error('Total percentage in template is less than 100% and no fixed amounts specified');
    }

    // Create schedule data
    const scheduleData = {
        tenantId: this.tenantId,
        bookingId: bookingData.bookingId,
        name: this.name,
        description: this.description,
        totalAmount: bookingData.totalAmount,
        installments: this.installments.map(template => {
            const installment = {
                name: template.name,
                description: template.description,
                dueTrigger: template.dueTrigger,
                triggerOffset: template.triggerOffset,
                triggerMilestone: template.triggerMilestone,
                status: 'upcoming',
                editable: true,
            };

            // Calculate amount based on percentage or use fixed amount
            if (template.percentage) {
                installment.percentage = template.percentage;
                installment.amount = (template.percentage / 100) * bookingData.totalAmount;
            } else if (template.amount) {
                installment.amount = template.amount;
                installment.percentage = (template.amount / bookingData.totalAmount) * 100;
            }

            return installment;
        }),
        createdBy: userData.userId,
    };

    return scheduleData;
};

/**
 * Validate template totals
 * @returns {Boolean} - Is valid
 */
PaymentScheduleTemplateSchema.methods.validateTotals = function () {
    let totalPercentage = 0;

    this.installments.forEach(installment => {
        if (installment.percentage) {
            totalPercentage += installment.percentage;
        }
    });

    return totalPercentage <= 100;
};

/**
 * @typedef PaymentScheduleTemplate
 */
const PaymentScheduleTemplate = mongoose.model('PaymentScheduleTemplate', PaymentScheduleTemplateSchema);

module.exports = PaymentScheduleTemplate;