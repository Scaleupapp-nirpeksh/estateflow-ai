// src/ai/actionHandlers/analytics.handler.js

const analyticsService = require('../../services/analytics.service.js');
const leadService = require('../../services/lead.service.js'); // For lead conversion rate
const projectService = require('../../services/project.service.js'); // To resolve project names to IDs
const logger = require('../../utils/logger.js');
const Entities = require('../definitions/entities.js');
const { ApiError } = require('../../utils/error-handler.js');
const mongoose = require('mongoose');

class AnalyticsHandler {

    // Helper to parse common time period entities into startDate and endDate
    // This can be expanded significantly
    _parseTimePeriod(timePeriodEntity) {
        const now = new Date();
        let startDate, endDate = new Date(now); // Default end date to today

        if (!timePeriodEntity) { // Default to last 30 days if no period specified
            startDate = new Date(now.setDate(now.getDate() - 30));
            return { startDate, endDate };
        }

        const period = timePeriodEntity.toLowerCase();
        now.setHours(0, 0, 0, 0); // Start of today for consistent comparisons

        if (period.includes("today")) {
            startDate = new Date(now);
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        } else if (period.includes("yesterday")) {
            startDate = new Date(now.setDate(now.getDate() - 1));
            endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 23, 59, 59, 999);
        } else if (period.includes("this week")) {
            const dayOfWeek = now.getDay(); // Sunday - 0, Monday - 1
            startDate = new Date(now.setDate(now.getDate() - dayOfWeek)); // Start of Sunday
            endDate = new Date(startDate); // End of Saturday
            endDate.setDate(startDate.getDate() + 6);
            endDate.setHours(23, 59, 59, 999);
        } else if (period.includes("last week")) {
            const dayOfWeek = now.getDay();
            endDate = new Date(now.setDate(now.getDate() - dayOfWeek - 1)); // End of last Saturday
            endDate.setHours(23, 59, 59, 999);
            startDate = new Date(endDate);
            startDate.setDate(endDate.getDate() - 6); // Start of last Sunday
            startDate.setHours(0, 0, 0, 0);
        } else if (period.includes("this month")) {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999); // Last day of current month
        } else if (period.includes("last month")) {
            endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999); // Last day of previous month
            startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
        } else if (period.includes("last 30 days")) {
            startDate = new Date(new Date().setDate(now.getDate() - 30));
            endDate = new Date(); // today
        } else if (period.includes("last 7 days")) {
            startDate = new Date(new Date().setDate(now.getDate() - 7));
            endDate = new Date(); // today
        }
        // Add more: "this quarter", "last quarter", "this year", "last year"
        // Potentially parse specific date ranges like "from Jan 1 to March 31"
        else {
            // Default if specific phrase not recognized but entity was extracted
            startDate = new Date(now.setDate(now.getDate() - 30)); // Default to last 30 days
        }
        return { startDate, endDate };
    }


    async handleGetSalesPerformanceSummary(entities, userId, tenantId, role, conversationContext) {
        try {
            const timePeriodEntity = entities[Entities.TIME_PERIOD];
            const dateFilters = this._parseTimePeriod(timePeriodEntity);

            const filters = {
                startDate: dateFilters.startDate.toISOString(),
                endDate: dateFilters.endDate.toISOString(),
            };

            if (entities[Entities.PROJECT_NAME]) {
                const project = await projectService.getProjects(tenantId, { search: entities[Entities.PROJECT_NAME], active: undefined }, { page: 1, limit: 1 });
                if (project && project.data.length > 0) {
                    filters.projectId = project.data[0]._id.toString();
                } else {
                    return { success: false, message: `I couldn't find a project named "${entities[Entities.PROJECT_NAME]}".`, data: null, conversationContextUpdate: {} };
                }
            } else if (conversationContext?.activeProjectId) {
                filters.projectId = conversationContext.activeProjectId;
            }
            // Add tower filter if needed

            const performance = await analyticsService.getSalesPerformance(tenantId, filters);

            if (!performance || !performance.summary) {
                return { success: true, message: "I couldn't retrieve sales performance data at this time.", data: null, conversationContextUpdate: {} };
            }

            const summary = performance.summary;
            let message = `Sales Performance Summary`;
            if (timePeriodEntity) message += ` for ${timePeriodEntity}`;
            if (filters.projectId) message += ` for project ${entities[Entities.PROJECT_NAME] || conversationContext.activeProjectName || filters.projectId}`;
            message += `:\n`;
            message += `- Total Sales (Units Booked): ${summary.totalSales}\n`;
            message += `- Total Revenue: ${this._formatCurrency(summary.totalRevenue)}\n`;
            message += `- Total Discounts Given: ${this._formatCurrency(summary.totalDiscounts)}\n`;
            message += `- Average Booking Value: ${this._formatCurrency(summary.averageBookingValue)}\n`;

            if (performance.agentPerformance && performance.agentPerformance.length > 0) {
                message += `\nTop Performing Agents:\n`;
                performance.agentPerformance.slice(0, 3).forEach(agent => { // Show top 3
                    message += `  - ${agent.agentName}: ${agent.bookingCount} bookings, Revenue: ${this._formatCurrency(agent.totalAmount)}\n`;
                });
            }

            return {
                success: true,
                message: message,
                data: performance, // Return full data if frontend wants to display charts etc.
                conversationContextUpdate: {}
            };

        } catch (error) {
            logger.error('[AnalyticsHandler.handleGetSalesPerformanceSummary] Error:', error);
            return this._handleError(error, "getting sales performance summary");
        }
    }

    async handleGetLeadConversionRate(entities, userId, tenantId, role, conversationContext) {
        try {
            // For lead statistics, it's usually tenant-wide or can be filtered by project if leadService supports it
            // leadService.getLeadStatistics currently doesn't take project filters, so this will be tenant-wide.
            // We can enhance leadService.getLeadStatistics later if project-specific conversion is needed.

            const stats = await leadService.getLeadStatistics(tenantId);

            if (!stats) {
                return { success: true, message: "I couldn't retrieve lead conversion statistics at this time.", data: null, conversationContextUpdate: {} };
            }

            let message = `Lead Conversion Statistics for the organization:\n`;
            message += `- Total Leads: ${stats.totalLeads}\n`;
            message += `- Converted Leads: ${stats.convertedLeads}\n`;
            message += `- Conversion Rate: ${stats.conversionRate}%\n`;
            message += `- Leads in Last 30 Days: ${stats.recentLeads}\n`;

            // Potentially add breakdown by status or source if user asks for more detail

            return {
                success: true,
                message: message,
                data: stats,
                conversationContextUpdate: {}
            };
        } catch (error) {
            logger.error('[AnalyticsHandler.handleGetLeadConversionRate] Error:', error);
            return this._handleError(error, "getting lead conversion rate");
        }
    }

    _formatCurrency(amount) {
        if (amount === null || amount === undefined || isNaN(amount)) return 'N/A';
        return '₹' + Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 0 });
    }

    _handleError(error, actionDescription) {
        let message = `Sorry, I encountered an error while ${actionDescription}.`;
        if (error instanceof ApiError) {
            message = error.message;
        }
        if (process.env.NODE_ENV === 'development' && !(error instanceof ApiError)) {
            message += ` Details: ${error.message}`;
        }
        logger.error(`[AnalyticsHandler._handleError] Action: ${actionDescription}, Error: ${error.message}`, { stack: error.stack });
        return {
            success: false,
            message: message,
            data: null,
            errorDetails: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            conversationContextUpdate: {}
        };
    }
}

module.exports = new AnalyticsHandler();
