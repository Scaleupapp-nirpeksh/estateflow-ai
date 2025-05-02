// src/models/payment-schedule.model.js

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Payment Schedule Schema
 * Represents a payment plan for a booking
 */
const PaymentScheduleSchema = new Schema(
    {
        tenantId: {
            type: Schema.Types.ObjectId,
            ref: 'Tenant',
            required: [true, 'Tenant ID is required'],
            index: true,
        },
        bookingId: {
            type: Schema.Types.ObjectId,
            ref: 'Booking',
            required: [true, 'Booking ID is required'],
            index: true,
        },
        name: {
            type: String,
            required: [true, 'Schedule name is required'],
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        totalAmount: {
            type: Number,
            required: [true, 'Total amount is required'],
            min: 0,
        },
        // Individual payment installments
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
                dueDate: {
                    type: Date,
                },
                dueTrigger: {
                    type: String,
                    enum: ['booking_date', 'agreement_date', 'construction_milestone', 'fixed_date'],
                    default: 'fixed_date',
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
                amount: {
                    type: Number,
                    min: 0,
                },
                percentage: {
                    type: Number,
                    min: 0,
                    max: 100,
                },
                status: {
                    type: String,
                    enum: ['upcoming', 'due', 'paid', 'partially_paid', 'overdue'],
                    default: 'upcoming',
                },
                amountPaid: {
                    type: Number,
                    default: 0,
                    min: 0,
                },
                paymentDate: Date,
                paymentMethod: {
                    type: String,
                    trim: true,
                },
                reference: {
                    type: String,
                    trim: true,
                },
                editable: {
                    type: Boolean,
                    default: true,
                },
            },
        ],
        // Audit trail for changes to payment schedule
        changeHistory: [
            {
                changedBy: {
                    type: Schema.Types.ObjectId,
                    ref: 'User',
                    required: true,
                },
                changedAt: {
                    type: Date,
                    default: Date.now,
                },
                installmentIndex: {
                    type: Number,
                    required: true,
                },
                previousValues: {
                    amount: Number,
                    percentage: Number,
                    dueDate: Date,
                },
                newValues: {
                    amount: Number,
                    percentage: Number,
                    dueDate: Date,
                },
                reason: {
                    type: String,
                    trim: true,
                },
                approvalId: {
                    type: Schema.Types.ObjectId,
                    ref: 'Approval',
                },
            },
        ],
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
PaymentScheduleSchema.index({ tenantId: 1, bookingId: 1 });
PaymentScheduleSchema.index({ 'installments.status': 1 });

/**
 * Recalculate installment amounts when percentages are used
 */
PaymentScheduleSchema.methods.recalculateAmounts = function () {
    let totalPercentage = 0;
    let totalFixedAmount = 0;

    // Calculate total of percentage-based installments
    this.installments.forEach(installment => {
        if (installment.percentage > 0) {
            totalPercentage += installment.percentage;
        } else if (installment.amount > 0) {
            totalFixedAmount += installment.amount;
        }
    });

    // Calculate amounts for percentage-based installments
    const remainingAmount = this.totalAmount - totalFixedAmount;

    if (totalPercentage > 0) {
        this.installments.forEach(installment => {
            if (installment.percentage > 0) {
                installment.amount = (installment.percentage / 100) * this.totalAmount;
            }
        });
    }

    return this;
};

/**
 * Update an installment with change tracking
 * @param {Number} index - Installment index
 * @param {Object} updateData - New installment data
 * @param {Object} userData - User info for audit
 */
PaymentScheduleSchema.methods.updateInstallment = async function (index, updateData, userData) {
    if (index < 0 || index >= this.installments.length) {
        throw new Error('Invalid installment index');
    }

    const installment = this.installments[index];
    const previousValues = {
        amount: installment.amount,
        percentage: installment.percentage,
        dueDate: installment.dueDate,
    };

    // Update installment data
    Object.keys(updateData).forEach(key => {
        if (key !== 'status' && key !== 'amountPaid') {
            installment[key] = updateData[key];
        }
    });

    // Add change history entry
    this.changeHistory.push({
        changedBy: userData.userId,
        changedAt: new Date(),
        installmentIndex: index,
        previousValues,
        newValues: {
            amount: installment.amount,
            percentage: installment.percentage,
            dueDate: installment.dueDate,
        },
        reason: userData.reason || 'Schedule adjustment',
        approvalId: userData.approvalId,
    });

    // Recalculate other installments if necessary
    if (userData.redistributeRemaining && (previousValues.amount !== installment.amount || previousValues.percentage !== installment.percentage)) {
        this.redistributeRemainingAmount(index);
    }

    this.updatedBy = userData.userId;
    await this.save();

    return this;
};

/**
 * Redistribute remaining amount among future installments
 * @param {Number} changedIndex - Index of the changed installment
 */
PaymentScheduleSchema.methods.redistributeRemainingAmount = function (changedIndex) {
    const remainingInstallments = this.installments.filter(
        (_, i) => i > changedIndex && i.status === 'upcoming'
    );

    if (remainingInstallments.length === 0) {
        return;
    }

    // Calculate total already allocated
    let allocatedAmount = 0;
    this.installments.forEach((installment, i) => {
        if (i <= changedIndex || installment.status !== 'upcoming') {
            allocatedAmount += installment.amount;
        }
    });

    // Calculate remaining amount to distribute
    const remainingAmount = this.totalAmount - allocatedAmount;

    if (remainingAmount <= 0) {
        return;
    }

    // Calculate total percentage of remaining installments
    let totalRemainingPercentage = 0;
    remainingInstallments.forEach(installment => {
        totalRemainingPercentage += installment.percentage || 0;
    });

    // Distribute remaining amount
    if (totalRemainingPercentage > 0) {
        // Distribute proportionally based on percentages
        remainingInstallments.forEach(installment => {
            const proportion = installment.percentage / totalRemainingPercentage;
            installment.amount = proportion * remainingAmount;
        });
    } else {
        // Distribute equally
        const equalAmount = remainingAmount / remainingInstallments.length;
        remainingInstallments.forEach(installment => {
            installment.amount = equalAmount;
            installment.percentage = (equalAmount / this.totalAmount) * 100;
        });
    }
};

/**
 * Calculate due dates based on triggers
 * @param {Date} bookingDate - Booking creation date
 * @param {Date} agreementDate - Agreement signing date
 */
PaymentScheduleSchema.methods.calculateDueDates = function (bookingDate, agreementDate) {
    this.installments.forEach(installment => {
        if (installment.dueTrigger === 'fixed_date' && installment.dueDate) {
            // Already has a fixed date
            return;
        }

        let baseDate;
        switch (installment.dueTrigger) {
            case 'booking_date':
                baseDate = new Date(bookingDate);
                break;
            case 'agreement_date':
                baseDate = agreementDate ? new Date(agreementDate) : null;
                break;
            case 'construction_milestone':
                // Will be set separately when milestone is reached
                return;
            default:
                return;
        }

        if (!baseDate) {
            return;
        }

        // Calculate offset
        const { value, unit } = installment.triggerOffset;
        switch (unit) {
            case 'days':
                baseDate.setDate(baseDate.getDate() + value);
                break;
            case 'weeks':
                baseDate.setDate(baseDate.getDate() + (value * 7));
                break;
            case 'months':
                baseDate.setMonth(baseDate.getMonth() + value);
                break;
            default:
                break;
        }

        installment.dueDate = baseDate;
    });

    return this;
};

/**
 * @typedef PaymentSchedule
 */
const PaymentSchedule = mongoose.model('PaymentSchedule', PaymentScheduleSchema);

module.exports = PaymentSchedule;