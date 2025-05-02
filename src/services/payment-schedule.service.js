// src/services/payment-schedule.service.js

const mongoose = require('mongoose');
const PaymentSchedule = require('../models/payment-schedule.model');
const PaymentScheduleTemplate = require('../models/payment-schedule-template.model');
const Booking = require('../models/booking.model');
const Approval = require('../models/approval.model');
const { ApiError } = require('../utils/error-handler');
const logger = require('../utils/logger');

/**
 * Create payment schedule for a booking
 * @param {Object} scheduleData - Schedule creation data
 * @returns {Promise<PaymentSchedule>} - Created payment schedule
 */
const createPaymentSchedule = async (scheduleData) => {
    try {
        // Validate booking exists
        const booking = await Booking.findById(scheduleData.bookingId);
        if (!booking) {
            throw new ApiError(404, 'Booking not found');
        }

        // Check tenant ID matches
        if (booking.tenantId.toString() !== scheduleData.tenantId.toString()) {
            throw new ApiError(403, 'Tenant ID mismatch');
        }

        // Check if booking already has a payment schedule
        if (booking.paymentScheduleId) {
            throw new ApiError(400, 'Booking already has a payment schedule');
        }

        // Create from template if specified
        let schedule;
        if (scheduleData.templateId) {
            const template = await PaymentScheduleTemplate.findById(scheduleData.templateId);
            if (!template) {
                throw new ApiError(404, 'Payment schedule template not found');
            }

            // Create schedule from template
            const templateData = template.createSchedule({
                bookingId: booking._id,
                totalAmount: booking.totalBookingAmount,
            }, {
                userId: scheduleData.userId,
            });

            schedule = new PaymentSchedule({
                ...templateData,
                tenantId: scheduleData.tenantId,
            });
        } else {
            // Create custom schedule
            schedule = new PaymentSchedule({
                tenantId: scheduleData.tenantId,
                bookingId: scheduleData.bookingId,
                name: scheduleData.name,
                description: scheduleData.description || '',
                totalAmount: scheduleData.totalAmount || booking.totalBookingAmount,
                installments: scheduleData.installments || [],
                createdBy: scheduleData.userId,
            });
        }

        // Calculate installment amounts if using percentages
        schedule.recalculateAmounts();

        // Calculate due dates if applicable
        if (scheduleData.calculateDueDates) {
            schedule.calculateDueDates(booking.createdAt);
        }

        // Save the schedule
        await schedule.save();

        // Update booking with schedule reference
        await Booking.findByIdAndUpdate(booking._id, {
            paymentScheduleId: schedule._id,
            updatedBy: scheduleData.userId,
            updatedAt: new Date(),
        });

        return schedule;
    } catch (error) {
        logger.error('Error creating payment schedule', { error });
        throw error;
    }
};

/**
 * Get payment schedule by ID
 * @param {string} id - Payment schedule ID
 * @returns {Promise<PaymentSchedule>} - Payment schedule details
 */
const getPaymentScheduleById = async (id) => {
    try {
        const schedule = await PaymentSchedule.findById(id)
            .populate('bookingId', 'bookingNumber customerName unitId')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name')
            .populate('changeHistory.changedBy', 'name');

        if (!schedule) {
            throw new ApiError(404, 'Payment schedule not found');
        }

        return schedule;
    } catch (error) {
        logger.error('Error getting payment schedule', { error, scheduleId: id });
        throw error;
    }
};

/**
 * Get payment schedule by booking ID
 * @param {string} bookingId - Booking ID
 * @returns {Promise<PaymentSchedule>} - Payment schedule
 */
const getPaymentScheduleByBookingId = async (bookingId) => {
    try {
        const schedule = await PaymentSchedule.findOne({ bookingId })
            .populate('bookingId', 'bookingNumber customerName unitId')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name')
            .populate('changeHistory.changedBy', 'name');

        if (!schedule) {
            throw new ApiError(404, 'Payment schedule not found for this booking');
        }

        return schedule;
    } catch (error) {
        logger.error('Error getting payment schedule by booking', { error, bookingId });
        throw error;
    }
};

/**
 * Update installment in payment schedule
 * @param {string} id - Payment schedule ID
 * @param {number} installmentIndex - Installment index to update
 * @param {Object} updateData - Update data
 * @param {Object} userData - User information
 * @returns {Promise<PaymentSchedule>} - Updated payment schedule
 */
const updateInstallment = async (id, installmentIndex, updateData, userData) => {
    try {
        const schedule = await PaymentSchedule.findById(id);

        if (!schedule) {
            throw new ApiError(404, 'Payment schedule not found');
        }

        // Check if installment exists
        if (installmentIndex < 0 || installmentIndex >= schedule.installments.length) {
            throw new ApiError(400, 'Invalid installment index');
        }

        const installment = schedule.installments[installmentIndex];

        // Check if installment is editable
        if (!installment.editable) {
            throw new ApiError(400, 'This installment is not editable');
        }

        // Check if update needs approval
        let needsApproval = false;
        const significantChange = userData.requireApproval ||
            (updateData.amount && Math.abs(updateData.amount - installment.amount) > 10000) ||
            (updateData.percentage && Math.abs(updateData.percentage - installment.percentage) > 5);

        // Changes to paid or partially paid installments always need approval
        if (['paid', 'partially_paid'].includes(installment.status)) {
            needsApproval = true;
        } else if (significantChange) {
            needsApproval = true;
        }

        if (needsApproval) {
            // Create approval request
            const approvalService = require('./approval.service');

            const approval = await approvalService.createApproval({
                tenantId: schedule.tenantId,
                type: 'payment_schedule',
                entityType: 'payment_schedule',
                entityId: schedule._id,
                amount: updateData.amount || installment.amount,
                percentage: updateData.percentage || installment.percentage,
                userId: userData.userId,
                justification: userData.reason || 'Payment schedule modification',
            });

            // Update with pending approval
            userData.approvalId = approval._id;
        }

        // Apply update to schedule
        await schedule.updateInstallment(installmentIndex, updateData, userData);

        return schedule;
    } catch (error) {
        logger.error('Error updating installment', { error, scheduleId: id, installmentIndex });
        throw error;
    }
};

/**
 * Update payment schedule total amount
 * @param {string} id - Payment schedule ID
 * @param {number} totalAmount - New total amount
 * @param {Object} userData - User information
 * @returns {Promise<PaymentSchedule>} - Updated payment schedule
 */
const updateTotalAmount = async (id, totalAmount, userData) => {
    try {
        const schedule = await PaymentSchedule.findById(id);

        if (!schedule) {
            throw new ApiError(404, 'Payment schedule not found');
        }

        // Check if significant change
        const significantChange = Math.abs(totalAmount - schedule.totalAmount) > 10000;

        // Check if any installments are paid
        const hasPaidInstallments = schedule.installments.some(
            i => i.status === 'paid' || i.status === 'partially_paid'
        );

        // Determine if approval is needed
        let needsApproval = hasPaidInstallments || significantChange;

        if (needsApproval) {
            // Create approval request
            const approvalService = require('./approval.service');

            const approval = await approvalService.createApproval({
                tenantId: schedule.tenantId,
                type: 'payment_schedule',
                entityType: 'payment_schedule',
                entityId: schedule._id,
                amount: totalAmount,
                userId: userData.userId,
                justification: userData.reason || 'Payment schedule total amount update',
            });

            // Add approval reference
            userData.approvalId = approval._id;
        }

        // Update the schedule
        schedule.totalAmount = totalAmount;
        schedule.updatedBy = userData.userId;

        // Add to change history
        schedule.changeHistory.push({
            changedBy: userData.userId,
            changedAt: new Date(),
            installmentIndex: -1, // Indicates total amount change
            previousValues: {
                amount: schedule.totalAmount,
            },
            newValues: {
                amount: totalAmount,
            },
            reason: userData.reason || 'Total amount update',
            approvalId: userData.approvalId,
        });

        // Recalculate amounts
        schedule.recalculateAmounts();

        await schedule.save();

        return schedule;
    } catch (error) {
        logger.error('Error updating total amount', { error, scheduleId: id });
        throw error;
    }
};

/**
 * Record payment for an installment
 * @param {string} id - Payment schedule ID
 * @param {number} installmentIndex - Installment index
 * @param {Object} paymentData - Payment data
 * @returns {Promise<PaymentSchedule>} - Updated payment schedule
 */
const recordPayment = async (id, installmentIndex, paymentData) => {
    try {
        const schedule = await PaymentSchedule.findById(id);

        if (!schedule) {
            throw new ApiError(404, 'Payment schedule not found');
        }

        // Check if installment exists
        if (installmentIndex < 0 || installmentIndex >= schedule.installments.length) {
            throw new ApiError(400, 'Invalid installment index');
        }

        const installment = schedule.installments[installmentIndex];

        // Validate payment amount
        if (paymentData.amount <= 0) {
            throw new ApiError(400, 'Payment amount must be greater than zero');
        }

        if (paymentData.amount > installment.amount - installment.amountPaid) {
            throw new ApiError(400, 'Payment amount exceeds remaining amount due');
        }

        // Update installment
        installment.amountPaid += paymentData.amount;
        installment.paymentDate = new Date();
        installment.paymentMethod = paymentData.method;
        installment.reference = paymentData.reference;

        // Update status based on payment
        if (installment.amountPaid >= installment.amount) {
            installment.status = 'paid';
        } else {
            installment.status = 'partially_paid';
        }

        schedule.updatedBy = paymentData.userId;

        await schedule.save();

        return schedule;
    } catch (error) {
        logger.error('Error recording payment', { error, scheduleId: id, installmentIndex });
        throw error;
    }
};

/**
 * Create payment schedule template
 * @param {Object} templateData - Template data
 * @returns {Promise<PaymentScheduleTemplate>} - Created template
 */
const createPaymentScheduleTemplate = async (templateData) => {
    try {
        // Validate template data
        let totalPercentage = 0;
        templateData.installments.forEach(installment => {
            if (installment.percentage) {
                totalPercentage += installment.percentage;
            }
        });

        if (totalPercentage > 100) {
            throw new ApiError(400, 'Total percentage in template exceeds 100%');
        }

        // Create template
        const template = new PaymentScheduleTemplate({
            tenantId: templateData.tenantId,
            name: templateData.name,
            description: templateData.description || '',
            projectId: templateData.projectId || null,
            installments: templateData.installments,
            isDefault: templateData.isDefault || false,
            createdBy: templateData.userId,
        });

        // If setting as default, unset any other default templates
        if (template.isDefault) {
            await PaymentScheduleTemplate.updateMany(
                {
                    tenantId: template.tenantId,
                    isDefault: true,
                    projectId: template.projectId || null
                },
                { isDefault: false }
            );
        }

        await template.save();

        return template;
    } catch (error) {
        logger.error('Error creating payment schedule template', { error });
        throw error;
    }
};

/**
 * Get payment schedule templates
 * @param {string} tenantId - Tenant ID
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>} - Payment schedule templates
 */
const getPaymentScheduleTemplates = async (tenantId, filters = {}) => {
    try {
        // Build query with tenant isolation
        const query = { tenantId: tenantId };

        // Add project filter if provided
        if (filters.projectId) {
            query.$or = [
                { projectId: filters.projectId },
                { projectId: null } // Include global templates
            ];
        }

        // Add default filter if provided
        if (filters.isDefault !== undefined) {
            query.isDefault = filters.isDefault;
        }

        logger.info('Searching for templates with query:', { query });

        const templates = await PaymentScheduleTemplate.find(query)
            .populate('projectId', 'name')
            .populate('createdBy', 'name')
            .sort({ isDefault: -1, name: 1 });

        logger.info(`Found ${templates.length} templates`);

        return templates;
    } catch (error) {
        logger.error('Error getting payment schedule templates', { error, tenantId });
        throw error;
    }
};

/**
 * Get payment schedule template by ID
 * @param {string} id - Template ID
 * @returns {Promise<PaymentScheduleTemplate>} - Template details
 */
const getPaymentScheduleTemplateById = async (id) => {
    try {
        const template = await PaymentScheduleTemplate.findById(id)
            .populate('projectId', 'name')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name');

        if (!template) {
            throw new ApiError(404, 'Payment schedule template not found');
        }

        return template;
    } catch (error) {
        logger.error('Error getting payment schedule template', { error, templateId: id });
        throw error;
    }
};

/**
 * Update payment schedule template
 * @param {string} id - Template ID
 * @param {Object} updateData - Update data
 * @returns {Promise<PaymentScheduleTemplate>} - Updated template
 */
const updatePaymentScheduleTemplate = async (id, updateData) => {
    try {
        const template = await PaymentScheduleTemplate.findById(id);

        if (!template) {
            throw new ApiError(404, 'Payment schedule template not found');
        }

        // Update fields
        if (updateData.name) template.name = updateData.name;
        if (updateData.description !== undefined) template.description = updateData.description;
        if (updateData.projectId !== undefined) template.projectId = updateData.projectId;
        if (updateData.installments) template.installments = updateData.installments;

        // Handle default status
        if (updateData.isDefault !== undefined) {
            // If setting as default, unset any other default templates
            if (updateData.isDefault && !template.isDefault) {
                await PaymentScheduleTemplate.updateMany(
                    {
                        tenantId: template.tenantId,
                        isDefault: true,
                        projectId: template.projectId || null
                    },
                    { isDefault: false }
                );
            }

            template.isDefault = updateData.isDefault;
        }

        template.updatedBy = updateData.userId;

        // Validate template
        let totalPercentage = 0;
        template.installments.forEach(installment => {
            if (installment.percentage) {
                totalPercentage += installment.percentage;
            }
        });

        if (totalPercentage > 100) {
            throw new ApiError(400, 'Total percentage in template exceeds 100%');
        }

        await template.save();

        return template;
    } catch (error) {
        logger.error('Error updating payment schedule template', { error, templateId: id });
        throw error;
    }
};

/**
 * Delete payment schedule template
 * @param {string} id - Template ID
 * @returns {Promise<boolean>} - Success status
 */
const deletePaymentScheduleTemplate = async (id) => {
    try {
        const result = await PaymentScheduleTemplate.deleteOne({ _id: id });

        if (result.deletedCount === 0) {
            throw new ApiError(404, 'Payment schedule template not found');
        }

        return true;
    } catch (error) {
        logger.error('Error deleting payment schedule template', { error, templateId: id });
        throw error;
    }
};


/**
 * Get payment statistics
 * @param {string} tenantId - Tenant ID
 * @param {Object} filters - Optional filters
 * @returns {Promise<Object>} - Payment statistics
 */
const getPaymentStatistics = async (tenantId, filters = {}) => {
    try {
        // Build query with tenant isolation
        const query = { tenantId };

        // Add project filter if provided
        if (filters.projectId) {
            query.projectId = filters.projectId;
        }

        // Add tower filter if provided
        if (filters.towerId) {
            query.towerId = filters.towerId;
        }

        // Map to store results
        const statistics = {
            totalBookingsAmount: 0,
            totalCollectedAmount: 0,
            totalPendingAmount: 0,
            overdue: {
                total: {
                    count: 0,
                    amount: 0
                },
                ranges: {
                    upTo5Days: { count: 0, amount: 0 },
                    upTo15Days: { count: 0, amount: 0 },
                    upTo30Days: { count: 0, amount: 0 },
                    over30Days: { count: 0, amount: 0 }
                }
            },
            byTower: {},
            byUnit: {}
        };

        // Get all payment schedules
        const schedules = await PaymentSchedule.find(query)
            .populate({
                path: 'bookingId',
                select: 'unitId totalBookingAmount status',
                populate: {
                    path: 'unitId',
                    select: 'number type floor towerId projectId',
                    populate: [
                        { path: 'towerId', select: 'name' },
                        { path: 'projectId', select: 'name' }
                    ]
                }
            });

        const today = new Date();

        // Process each schedule
        for (const schedule of schedules) {
            const booking = schedule.bookingId;
            if (!booking) continue;  // Skip if booking not found

            const unit = booking.unitId;
            if (!unit) continue;  // Skip if unit not found

            // Initialize tower stats if not exists
            if (!statistics.byTower[unit.towerId._id]) {
                statistics.byTower[unit.towerId._id] = {
                    name: unit.towerId.name,
                    totalAmount: 0,
                    collectedAmount: 0,
                    pendingAmount: 0,
                    overdueAmount: 0,
                    overdueCount: 0
                };
            }

            // Initialize unit stats if not exists
            const unitKey = unit._id.toString();
            if (!statistics.byUnit[unitKey]) {
                statistics.byUnit[unitKey] = {
                    unitNumber: unit.number,
                    type: unit.type,
                    floor: unit.floor,
                    tower: unit.towerId.name,
                    project: unit.projectId.name,
                    totalAmount: 0,
                    collectedAmount: 0,
                    pendingAmount: 0,
                    overdueInstallments: [],
                    upcomingInstallments: []
                };
            }

            // Update booking totals
            statistics.totalBookingsAmount += schedule.totalAmount;
            statistics.byTower[unit.towerId._id].totalAmount += schedule.totalAmount;
            statistics.byUnit[unitKey].totalAmount = schedule.totalAmount;

            // Track collected and pending amounts
            let collectedAmount = 0;
            let pendingAmount = 0;

            // Process each installment
            for (const installment of schedule.installments) {
                // Skip if no due date
                if (!installment.dueDate) continue;

                const amountPaid = installment.amountPaid || 0;
                const amountDue = installment.amount - amountPaid;

                // Add to collected amount
                collectedAmount += amountPaid;

                // Check if installment is due and has pending amount
                if (amountDue > 0) {
                    pendingAmount += amountDue;

                    // Check if overdue
                    if (new Date(installment.dueDate) < today) {
                        const daysDiff = Math.floor((today - new Date(installment.dueDate)) / (1000 * 60 * 60 * 24));

                        // Update overdue statistics
                        statistics.overdue.total.count++;
                        statistics.overdue.total.amount += amountDue;

                        // Update tower statistics
                        statistics.byTower[unit.towerId._id].overdueCount++;
                        statistics.byTower[unit.towerId._id].overdueAmount += amountDue;

                        // Update by range
                        if (daysDiff <= 5) {
                            statistics.overdue.ranges.upTo5Days.count++;
                            statistics.overdue.ranges.upTo5Days.amount += amountDue;
                        } else if (daysDiff <= 15) {
                            statistics.overdue.ranges.upTo15Days.count++;
                            statistics.overdue.ranges.upTo15Days.amount += amountDue;
                        } else if (daysDiff <= 30) {
                            statistics.overdue.ranges.upTo30Days.count++;
                            statistics.overdue.ranges.upTo30Days.amount += amountDue;
                        } else {
                            statistics.overdue.ranges.over30Days.count++;
                            statistics.overdue.ranges.over30Days.amount += amountDue;
                        }

                        // Add to unit's overdue installments
                        statistics.byUnit[unitKey].overdueInstallments.push({
                            name: installment.name,
                            dueDate: installment.dueDate,
                            amount: installment.amount,
                            amountPaid: amountPaid,
                            amountDue: amountDue,
                            daysPastDue: daysDiff
                        });
                    } else {
                        // Add to unit's upcoming installments
                        statistics.byUnit[unitKey].upcomingInstallments.push({
                            name: installment.name,
                            dueDate: installment.dueDate,
                            amount: installment.amount,
                            amountPaid: amountPaid,
                            amountDue: amountDue,
                            daysToGo: Math.floor((new Date(installment.dueDate) - today) / (1000 * 60 * 60 * 24))
                        });
                    }
                }
            }

            // Update total statistics
            statistics.totalCollectedAmount += collectedAmount;
            statistics.totalPendingAmount += pendingAmount;

            // Update tower statistics
            statistics.byTower[unit.towerId._id].collectedAmount += collectedAmount;
            statistics.byTower[unit.towerId._id].pendingAmount += pendingAmount;

            // Update unit statistics
            statistics.byUnit[unitKey].collectedAmount = collectedAmount;
            statistics.byUnit[unitKey].pendingAmount = pendingAmount;
        }

        // Convert tower map to array
        statistics.byTower = Object.values(statistics.byTower);

        // Convert unit map to array
        statistics.byUnit = Object.values(statistics.byUnit);

        // Sort overdue and upcoming installments by date
        for (const unit of statistics.byUnit) {
            unit.overdueInstallments.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
            unit.upcomingInstallments.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
        }

        // Calculate percentages
        if (statistics.totalBookingsAmount > 0) {
            statistics.collectionPercentage = (statistics.totalCollectedAmount / statistics.totalBookingsAmount) * 100;
            statistics.pendingPercentage = (statistics.totalPendingAmount / statistics.totalBookingsAmount) * 100;
            statistics.overduePercentage = (statistics.overdue.total.amount / statistics.totalBookingsAmount) * 100;
        }

        return statistics;
    } catch (error) {
        logger.error('Error getting payment statistics', { error, tenantId });
        throw error;
    }
};

module.exports = {
    createPaymentSchedule,
    getPaymentScheduleById,
    getPaymentScheduleByBookingId,
    updateInstallment,
    updateTotalAmount,
    recordPayment,
    createPaymentScheduleTemplate,
    getPaymentScheduleTemplates,
    getPaymentScheduleTemplateById,
    updatePaymentScheduleTemplate,
    deletePaymentScheduleTemplate,
    getPaymentStatistics
};