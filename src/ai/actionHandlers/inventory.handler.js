// src/ai/actionHandlers/inventory.handler.js

const projectService = require('../../services/project.service.js');
const towerService = require('../../services/tower.service.js');
const unitService = require('../../services/unit.service.js');
const logger = require('../../utils/logger.js');
const Entities = require('../definitions/entities.js');
const { ApiError } = require('../../utils/error-handler.js'); // Assuming ApiError is in error-handler

class InventoryHandler {
    /**
     * Handles LIST_PROJECTS intent.
     * @param {Object} entities - Extracted entities (e.g., LOCATION).
     * @param {string} userId - The ID of the user.
     * @param {string} tenantId - The ID of the tenant.
     * @param {string} role - The role of the user.
     * @param {Object} conversationContext - Current conversation context.
     * @returns {Promise<Object>} Result object with message and data.
     */
    async handleListProjects(entities, userId, tenantId, role, conversationContext) {
        try {
            const filters = {
                city: entities[Entities.LOCATION], // Assuming LOCATION entity maps to city
                active: true, // Default to active projects
            };
            const pagination = { page: 1, limit: 10 }; // Default pagination

            const projectsResult = await projectService.getProjects(tenantId, filters, pagination);

            if (!projectsResult || projectsResult.data.length === 0) {
                return {
                    success: true,
                    message: `I couldn't find any active projects${filters.city ? ` in ${filters.city}` : ''}.`,
                    data: null,
                    conversationContextUpdate: {}
                };
            }

            const projectNames = projectsResult.data.map(p => `${p.name} (ID: ${p._id})${p.city ? ` in ${p.city}` : ''}`).join('\n - ');
            const message = `Here are some projects I found:\n - ${projectNames}\nYou can ask for details about a specific project by its name or ID.`;

            return {
                success: true,
                message: message,
                data: projectsResult.data, // Optionally return full data
                conversationContextUpdate: {}
            };
        } catch (error) {
            logger.error('[InventoryHandler.handleListProjects] Error:', error);
            return this._handleError(error, "listing projects");
        }
    }

    /**
     * Handles GET_PROJECT_DETAILS intent.
     * @param {Object} entities - Extracted entities (e.g., PROJECT_NAME or PROJECT_ID).
     * @param {string} userId - The ID of the user.
     * @param {string} tenantId - The ID of the tenant.
     * @param {string} role - The role of the user.
     * @param {Object} conversationContext - Current conversation context.
     * @returns {Promise<Object>} Result object with message and data.
     */
    async handleGetProjectDetails(entities, userId, tenantId, role, conversationContext) {
        try {
            const projectNameOrId = entities[Entities.PROJECT_NAME] || entities['PROJECT_ID']; // LLM might use PROJECT_ID
            if (!projectNameOrId) {
                return { success: false, message: "Please specify a project name or ID.", data: null, conversationContextUpdate: {} };
            }

            let project;
            // Attempt to find by ID first if it looks like an ID, then by name
            if (/^[0-9a-fA-F]{24}$/.test(projectNameOrId)) { // Basic ObjectId check
                project = await projectService.getProjectById(projectNameOrId);
            } else {
                // This requires projectService to have a findByName method or similar logic
                // For now, we'll assume getProjects can be used with a search filter
                const projectsResult = await projectService.getProjects(tenantId, { search: projectNameOrId, active: undefined }, { page: 1, limit: 1 });
                if (projectsResult && projectsResult.data.length > 0) {
                    // If multiple matches, could ask user to clarify. For now, take the first.
                    project = await projectService.getProjectById(projectsResult.data[0]._id);
                }
            }

            if (!project || project.tenantId.toString() !== tenantId) {
                return { success: false, message: `I couldn't find a project named "${projectNameOrId}" or you don't have access.`, data: null, conversationContextUpdate: {} };
            }

            const unitStats = project.unitStats || { total: 0, available: 0, booked: 0, sold: 0 };
            const message = `Project: ${project.name}\nLocation: ${project.address}, ${project.city}\nStatus: ${project.active ? 'Active' : 'Inactive'}\nTotal Units: ${unitStats.total}\nAvailable: ${unitStats.available}\nDescription: ${project.description || 'N/A'}\nWhat else would you like to know about ${project.name}?`;

            return {
                success: true,
                message: message,
                data: project,
                conversationContextUpdate: { activeProjectId: project._id.toString(), activeProjectName: project.name }
            };
        } catch (error) {
            logger.error('[InventoryHandler.handleGetProjectDetails] Error:', error);
            return this._handleError(error, `getting details for project "${entities[Entities.PROJECT_NAME] || ''}"`);
        }
    }


    /**
     * Handles GET_AVAILABLE_UNITS intent.
     * @param {Object} entities - Extracted entities (e.g., UNIT_TYPE, PROJECT_NAME, TOWER_NAME, MIN_PRICE, MAX_PRICE).
     * @param {string} userId - The ID of the user.
     * @param {string} tenantId - The ID of the tenant.
     * @param {string} role - The role of the user.
     * @param {Object} conversationContext - Current conversation context.
     * @returns {Promise<Object>} Result object with message and data.
     */
    async handleGetAvailableUnits(entities, userId, tenantId, role, conversationContext) {
        try {
            const filters = {
                tenantId: tenantId,
                status: 'available', // Always look for available units
                type: entities[Entities.UNIT_TYPE],
                minPrice: entities[Entities.MIN_PRICE] ? parseFloat(entities[Entities.MIN_PRICE]) : undefined,
                maxPrice: entities[Entities.MAX_PRICE] ? parseFloat(entities[Entities.MAX_PRICE]) : undefined,
                minArea: entities[Entities.MIN_AREA] ? parseInt(entities[Entities.MIN_AREA], 10) : undefined,
                maxArea: entities[Entities.MAX_AREA] ? parseInt(entities[Entities.MAX_AREA], 10) : undefined,
                // Potentially add more filters like view, floor from entities
            };

            // Use project/tower from context if available and not specified in current query
            const projectName = entities[Entities.PROJECT_NAME] || conversationContext.activeProjectName;
            const towerName = entities[Entities.TOWER_NAME] || conversationContext.activeTowerName;

            let projectIdToFilter = conversationContext.activeProjectId;
            let towerIdToFilter = conversationContext.activeTowerId;

            if (projectName && (!projectIdToFilter || projectName !== conversationContext.activeProjectName)) {
                // User specified a new project, find its ID
                const projectResult = await projectService.getProjects(tenantId, { search: projectName, active: true }, { page: 1, limit: 1 });
                if (projectResult && projectResult.data.length > 0) {
                    projectIdToFilter = projectResult.data[0]._id.toString();
                } else {
                    return { success: false, message: `I couldn't find a project named "${projectName}".`, data: null, conversationContextUpdate: {} };
                }
            }
            filters.projectId = projectIdToFilter;

            if (towerName && projectIdToFilter && (!towerIdToFilter || towerName !== conversationContext.activeTowerName)) {
                // User specified a new tower, find its ID within the project context
                const towerResult = await towerService.getTowers(projectIdToFilter, { search: towerName, active: true }, { page: 1, limit: 1 }); // Assuming towerService.getTowers supports search
                if (towerResult && towerResult.data.length > 0) {
                    towerIdToFilter = towerResult.data[0]._id.toString();
                } else {
                    return { success: false, message: `I couldn't find a tower named "${towerName}" in project "${projectName || 'the current project'}".`, data: null, conversationContextUpdate: {} };
                }
            }
            filters.towerId = towerIdToFilter;


            const pagination = { page: 1, limit: 5 }; // Show a few results

            logger.debug('[InventoryHandler.handleGetAvailableUnits] Filters for unitService:', filters);
            const unitsResult = await unitService.getUnits(filters, pagination);

            if (!unitsResult || unitsResult.data.length === 0) {
                let message = "I couldn't find any available units matching your criteria";
                if (filters.type) message += ` of type ${filters.type}`;
                if (projectName) message += ` in project ${projectName}`;
                if (towerName) message += ` in tower ${towerName}`;
                message += ".";
                return { success: true, message: message, data: null, conversationContextUpdate: {} };
            }

            const unitDescriptions = unitsResult.data.map(u =>
                `${u.number} (${u.type || 'N/A'}, ${u.carpetArea || 'N/A'} sqft, Price: ${u.basePrice ? `₹${(u.basePrice / 100000).toFixed(2)}L` : 'N/A'}) in Tower: ${u.towerId ? u.towerId.name : 'N/A'}, Project: ${u.projectId ? u.projectId.name : 'N/A'}`
            ).join('\n - ');

            let responseMessage = `I found ${unitsResult.pagination.total} available unit(s) matching your criteria. Here are the first ${unitsResult.data.length}:\n - ${unitDescriptions}`;
            if (unitsResult.pagination.total > unitsResult.data.length) {
                responseMessage += "\nThere are more units. You can ask for more details or refine your search.";
            }
            responseMessage += "\nYou can ask for details about a specific unit number.";

            return {
                success: true,
                message: responseMessage,
                data: unitsResult.data,
                conversationContextUpdate: { // Update context if project/tower was resolved
                    activeProjectId: projectIdToFilter,
                    activeProjectName: projectName, // This might need to be fetched if only ID was in context
                    activeTowerId: towerIdToFilter,
                    activeTowerName: towerName, // This might need to be fetched
                }
            };
        } catch (error) {
            logger.error('[InventoryHandler.handleGetAvailableUnits] Error:', error);
            return this._handleError(error, "finding available units");
        }
    }

    /**
     * Handles GET_UNIT_DETAILS intent.
     * @param {Object} entities - Extracted entities (e.g., UNIT_NUMBER, PROJECT_NAME, TOWER_NAME).
     * @param {string} userId - The ID of the user.
     * @param {string} tenantId - The ID of the tenant.
     * @param {string} role - The role of the user.
     * @param {Object} conversationContext - Current conversation context.
     * @returns {Promise<Object>} Result object with message and data.
     */
    async handleGetUnitDetails(entities, userId, tenantId, role, conversationContext) {
        try {
            const unitNumber = entities[Entities.UNIT_NUMBER];
            if (!unitNumber) {
                return { success: false, message: "Please specify a unit number.", data: null, conversationContextUpdate: {} };
            }

            // Try to find the unit. This is tricky without a direct ID.
            // We might need to search within a project/tower context if provided or available in conversationContext.
            let unitToQuery = null;
            const projectIdFromContext = conversationContext.activeProjectId || (entities[Entities.PROJECT_NAME] ? await this._findProjectIdByName(entities[Entities.PROJECT_NAME], tenantId) : null);
            const towerIdFromContext = conversationContext.activeTowerId || (entities[Entities.TOWER_NAME] && projectIdFromContext ? await this._findTowerIdByName(entities[Entities.TOWER_NAME], projectIdFromContext, tenantId) : null);

            const unitFilters = {
                tenantId: tenantId,
                number: unitNumber,
            };
            if (towerIdFromContext) unitFilters.towerId = towerIdFromContext;
            else if (projectIdFromContext) unitFilters.projectId = projectIdFromContext; // Search in project if tower not specific

            const unitsResult = await unitService.getUnits(unitFilters, { page: 1, limit: 1 });

            if (!unitsResult || unitsResult.data.length === 0) {
                let message = `I couldn't find unit "${unitNumber}"`;
                if (towerIdFromContext && conversationContext.activeTowerName) message += ` in tower ${conversationContext.activeTowerName}`;
                else if (projectIdFromContext && conversationContext.activeProjectName) message += ` in project ${conversationContext.activeProjectName}`;
                message += `. Please try specifying the project or tower if you know it.`;
                return { success: false, message: message, data: null, conversationContextUpdate: {} };
            }

            // Assuming the first result is the one we want if multiple match (should be rare for unit numbers within a tower/project)
            const unitId = unitsResult.data[0]._id;
            const unitDetails = await unitService.getUnitById(unitId); // This service call populates project/tower

            if (!unitDetails || unitDetails.tenantId.toString() !== tenantId) {
                return { success: false, message: `I couldn't retrieve details for unit "${unitNumber}".`, data: null, conversationContextUpdate: {} };
            }

            const priceDetails = unitDetails.priceDetails || await unitService.calculateUnitPrice(unitId);

            let message = `Details for Unit ${unitDetails.number} in Tower ${unitDetails.towerId.name}, Project ${unitDetails.projectId.name}:\n`;
            message += `- Type: ${unitDetails.type}\n`;
            message += `- Floor: ${unitDetails.floor}\n`;
            message += `- Carpet Area: ${unitDetails.carpetArea} sqft\n`;
            message += `- Status: ${unitDetails.status}\n`;
            message += `- Base Price (calculated): ₹${(priceDetails.basePrice / 100000).toFixed(2)}L\n`;
            message += `- Total Price (incl. premiums, taxes): ₹${(priceDetails.totalPrice / 100000).toFixed(2)}L\n`;
            if (unitDetails.views && unitDetails.views.length > 0) {
                message += `- Views: ${unitDetails.views.join(', ')}\n`;
            }
            message += `What would you like to do with this unit? (e.g., 'calculate full price', 'lock this unit')`;

            return {
                success: true,
                message: message,
                data: unitDetails,
                conversationContextUpdate: {
                    activeUnitId: unitDetails._id.toString(),
                    activeUnitNumber: unitDetails.number,
                    activeTowerId: unitDetails.towerId._id.toString(),
                    activeTowerName: unitDetails.towerId.name,
                    activeProjectId: unitDetails.projectId._id.toString(),
                    activeProjectName: unitDetails.projectId.name
                }
            };

        } catch (error) {
            logger.error('[InventoryHandler.handleGetUnitDetails] Error:', error);
            return this._handleError(error, `getting details for unit "${entities[Entities.UNIT_NUMBER] || ''}"`);
        }
    }

    // Helper to find project ID by name (simplified)
    async _findProjectIdByName(projectName, tenantId) {
        const projectsResult = await projectService.getProjects(tenantId, { search: projectName, active: true }, { page: 1, limit: 1 });
        if (projectsResult && projectsResult.data.length > 0) {
            return projectsResult.data[0]._id.toString();
        }
        return null;
    }
    // Helper to find tower ID by name within a project (simplified)
    async _findTowerIdByName(towerName, projectId, tenantId) {
        // Assuming towerService.getTowers takes projectId and filters for name
        const towersResult = await towerService.getTowers(projectId, { name: towerName, active: true }, { page: 1, limit: 1 });
        if (towersResult && towersResult.data.length > 0) {
            return towersResult.data[0]._id.toString();
        }
        return null;
    }

    _handleError(error, actionDescription) {
        let message = `Sorry, I encountered an error while ${actionDescription}.`;
        if (error instanceof ApiError) {
            message = error.message; // Use specific message from ApiError
        }
        // In development, you might want to return more error details
        if (process.env.NODE_ENV === 'development' && !(error instanceof ApiError)) {
            message += ` Details: ${error.message}`;
        }
        return {
            success: false,
            message: message,
            data: null,
            errorDetails: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            conversationContextUpdate: {}
        };
    }

    // ... other inventory handler methods will go here (GET_UNIT_PRICE, etc.)
}

module.exports = new InventoryHandler();
