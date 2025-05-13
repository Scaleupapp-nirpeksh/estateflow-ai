// src/ai/actionHandlers/inventory.handler.js

const projectService = require('../../services/project.service.js');
const towerService = require('../../services/tower.service.js');
const unitService = require('../../services/unit.service.js');
const logger = require('../../utils/logger.js');
const Entities = require('../definitions/entities.js');
const { ApiError } = require('../../utils/error-handler.js');
const mongoose = require('mongoose');

class InventoryHandler {

    // Helper to find project by name or ID, using context
    async _findProject(entities, tenantId, conversationContext, askForClarification = false) {
        const projectIdFromEntity = entities['PROJECT_ID']; // Assuming LLM might use this if it's an ID
        const projectNameFromEntity = entities[Entities.PROJECT_NAME];

        if (projectIdFromEntity && mongoose.Types.ObjectId.isValid(projectIdFromEntity)) {
            const project = await projectService.getProjectById(projectIdFromEntity);
            if (project && project.tenantId.toString() === tenantId) return project;
        }

        if (conversationContext?.activeProjectId && !projectNameFromEntity && !projectIdFromEntity) {
            const project = await projectService.getProjectById(conversationContext.activeProjectId);
            if (project && project.tenantId.toString() === tenantId) return project;
        }

        if (projectNameFromEntity) {
            const projectsResult = await projectService.getProjects(tenantId, { search: projectNameFromEntity, active: undefined }, { page: 1, limit: askForClarification ? 5 : 1 });
            if (projectsResult && projectsResult.data.length > 0) {
                if (projectsResult.data.length === 1) {
                    return await projectService.getProjectById(projectsResult.data[0]._id); // Get full details
                } else if (askForClarification) {
                    return projectsResult.data; // Return array for clarification
                }
                logger.warn(`[InventoryHandler._findProject] Ambiguous search for project "${projectNameFromEntity}", found ${projectsResult.data.length}.`);
                return null;
            }
        }
        return null;
    }

    // Helper to find tower by name or ID, using project and context
    async _findTower(entities, tenantId, projectContext, conversationContext, askForClarification = false) {
        const towerIdFromEntity = entities['TOWER_ID'];
        const towerNameFromEntity = entities[Entities.TOWER_NAME];
        let projectIdToSearchIn = projectContext?._id || conversationContext?.activeProjectId;

        if (towerIdFromEntity && mongoose.Types.ObjectId.isValid(towerIdFromEntity)) {
            const tower = await towerService.getTowerById(towerIdFromEntity);
            // Ensure tower belongs to the tenant (indirectly via project or directly if tower model has tenantId)
            if (tower && tower.tenantId.toString() === tenantId) return tower;
        }

        if (conversationContext?.activeTowerId && !towerNameFromEntity && !towerIdFromEntity) {
            const tower = await towerService.getTowerById(conversationContext.activeTowerId);
            if (tower && tower.tenantId.toString() === tenantId) return tower;
        }

        if (towerNameFromEntity && projectIdToSearchIn) {
            // Assuming towerService.getTowers can filter by name within a project
            const towersResult = await towerService.getTowers(projectIdToSearchIn, { name: towerNameFromEntity, active: undefined }, { page: 1, limit: askForClarification ? 5 : 1 });
            if (towersResult && towersResult.data.length > 0) {
                if (towersResult.data.length === 1) {
                    return await towerService.getTowerById(towersResult.data[0]._id); // Get full details
                } else if (askForClarification) {
                    return towersResult.data; // Return array for clarification
                }
                logger.warn(`[InventoryHandler._findTower] Ambiguous search for tower "${towerNameFromEntity}", found ${towersResult.data.length}.`);
                return null;
            }
        }
        return null;
    }

    // Helper to find unit by number, using project/tower and context
    async _findUnit(entities, tenantId, projectContext, towerContext, conversationContext, askForClarification = false) {
        const unitNumberFromEntity = entities[Entities.UNIT_NUMBER];
        const unitIdFromEntity = entities[Entities.UNIT_ID];

        if (unitIdFromEntity && mongoose.Types.ObjectId.isValid(unitIdFromEntity)) {
            const unit = await unitService.getUnitById(unitIdFromEntity);
            if (unit && unit.tenantId.toString() === tenantId) return unit;
        }

        if (conversationContext?.activeUnitId && !unitNumberFromEntity && !unitIdFromEntity) {
            const unit = await unitService.getUnitById(conversationContext.activeUnitId);
            if (unit && unit.tenantId.toString() === tenantId) return unit;
        }

        if (unitNumberFromEntity) {
            const unitFilters = { tenantId, number: unitNumberFromEntity };
            if (towerContext?._id) unitFilters.towerId = towerContext._id;
            else if (projectContext?._id) unitFilters.projectId = projectContext._id;
            // If no project/tower context, search might be too broad or fail.
            // Consider prompting if project/tower context is missing for unit number search.

            const unitsResult = await unitService.getUnits(unitFilters, { page: 1, limit: askForClarification ? 5 : 1 });
            if (unitsResult && unitsResult.data.length > 0) {
                if (unitsResult.data.length === 1) {
                    return await unitService.getUnitById(unitsResult.data[0]._id); // Get full details
                } else if (askForClarification) {
                    return unitsResult.data; // Return array for clarification
                }
                logger.warn(`[InventoryHandler._findUnit] Ambiguous search for unit "${unitNumberFromEntity}", found ${unitsResult.data.length}.`);
                return null;
            }
        }
        return null;
    }


    async handleListProjects(entities, userId, tenantId, role, conversationContext) {
        try {
            const filters = { city: entities[Entities.LOCATION], active: true };
            const pagination = { page: 1, limit: 10 };
            const projectsResult = await projectService.getProjects(tenantId, filters, pagination);

            if (!projectsResult || projectsResult.data.length === 0) {
                return { success: true, message: `I couldn't find any active projects${filters.city ? ` in ${filters.city}` : ''}.`, data: null, conversationContextUpdate: {} };
            }
            const projectNames = projectsResult.data.map(p => `${p.name} (Towers: ${p.towerCount || 0}, Units: ${p.totalUnits || 0})${p.city ? ` in ${p.city}` : ''}`).join('\n - ');
            const message = `Here are some projects I found:\n - ${projectNames}\nYou can ask for details about a specific project.`;
            return { success: true, message: message, data: projectsResult.data, conversationContextUpdate: {} };
        } catch (error) {
            logger.error('[InventoryHandler.handleListProjects] Error:', error);
            return this._handleError(error, "listing projects");
        }
    }

    async handleGetProjectDetails(entities, userId, tenantId, role, conversationContext) {
        try {
            const project = await this._findProject(entities, tenantId, conversationContext, true);
            if (!project) {
                return { success: false, message: `I couldn't find the project "${entities[Entities.PROJECT_NAME] || conversationContext.activeProjectName || 'specified'}". Please try a different name or ID.`, data: null, conversationContextUpdate: {} };
            }
            if (Array.isArray(project)) {
                const projectOptions = project.map(p => `${p.name} (ID: ${p._id}) in ${p.city}`).join('\n - ');
                return { success: false, message: `I found multiple projects matching "${entities[Entities.PROJECT_NAME]}":\n - ${projectOptions}\nPlease specify by ID or provide more details.`, data: project, conversationContextUpdate: {} };
            }

            const unitStats = project.unitStats || { total: 0, available: 0, booked: 0, sold: 0 };
            const towerCount = project.towers ? project.towers.length : (await towerService.getTowers(project._id, {}, { page: 1, limit: 0 })).pagination.total;

            let message = `Project: ${project.name} (ID: ${project._id})\nLocation: ${project.address}, ${project.city}\nStatus: ${project.active ? 'Active' : 'Inactive'}\nDescription: ${project.description || 'N/A'}\n`;
            message += `Towers: ${towerCount}\nTotal Units: ${unitStats.total}, Available: ${unitStats.available}, Booked: ${unitStats.booked}, Sold: ${unitStats.sold}\n`;
            if (project.amenities && project.amenities.length > 0) message += `Amenities: ${project.amenities.join(', ')}\n`;
            message += `What else about ${project.name}? (e.g., 'list its towers', 'show available units')`;

            return {
                success: true,
                message: message,
                data: project,
                conversationContextUpdate: { activeProjectId: project._id.toString(), activeProjectName: project.name, activeTowerId: null, activeTowerName: null, activeUnitId: null, activeUnitNumber: null } // Reset tower/unit context
            };
        } catch (error) {
            logger.error('[InventoryHandler.handleGetProjectDetails] Error:', error);
            return this._handleError(error, `getting details for project "${entities[Entities.PROJECT_NAME] || ''}"`);
        }
    }

    async handleGetTowerDetails(entities, userId, tenantId, role, conversationContext) {
        try {
            const project = await this._findProject(entities, tenantId, conversationContext); // Find project context first
            const tower = await this._findTower(entities, tenantId, project, conversationContext, true);

            if (!tower) {
                let msg = `I couldn't find tower "${entities[Entities.TOWER_NAME] || conversationContext.activeTowerName || 'specified'}"`;
                if (project) msg += ` in project ${project.name}`;
                else if (conversationContext.activeProjectName) msg += ` in project ${conversationContext.activeProjectName}`;
                msg += `. Please try a different name or ID.`;
                return { success: false, message: msg, data: null, conversationContextUpdate: {} };
            }
            if (Array.isArray(tower)) {
                const towerOptions = tower.map(t => `${t.name} (ID: ${t._id})`).join('\n - ');
                return { success: false, message: `I found multiple towers matching "${entities[Entities.TOWER_NAME]}". Which one?\n - ${towerOptions}\nPlease specify by ID.`, data: tower, conversationContextUpdate: {} };
            }

            const unitStats = tower.unitStats || { total: 0, available: 0 }; // Tower model might have these from getTowerById
            let message = `Tower: ${tower.name} (ID: ${tower._id}) in Project: ${tower.projectId.name}\n`;
            message += `Total Floors: ${tower.totalFloors}\nConstruction: ${tower.construction?.status || 'N/A'} (${tower.construction?.completionPercentage || 0}% complete)\n`;
            message += `Total Units: ${unitStats.total}, Available: ${unitStats.available}\n`;
            if (tower.premiums?.floorRise?.value) message += `Floor Rise: ${tower.premiums.floorRise.type} @ ${tower.premiums.floorRise.value} from floor ${tower.premiums.floorRise.floorStart}\n`;
            message += `What next for tower ${tower.name}? (e.g., 'show its available units')`;

            return {
                success: true,
                message: message,
                data: tower,
                conversationContextUpdate: {
                    activeTowerId: tower._id.toString(),
                    activeTowerName: tower.name,
                    activeProjectId: tower.projectId._id.toString(), // Ensure project context is also set/updated
                    activeProjectName: tower.projectId.name,
                    activeUnitId: null, activeUnitNumber: null // Reset unit context
                }
            };
        } catch (error) {
            logger.error('[InventoryHandler.handleGetTowerDetails] Error:', error);
            return this._handleError(error, "getting tower details");
        }
    }

    async handleGetAvailableUnits(entities, userId, tenantId, role, conversationContext) {
        try {
            const filters = { tenantId, status: 'available' };
            if (entities[Entities.UNIT_TYPE]) filters.type = entities[Entities.UNIT_TYPE];
            if (entities[Entities.MIN_PRICE]) filters.minPrice = parseFloat(entities[Entities.MIN_PRICE]);
            if (entities[Entities.MAX_PRICE]) filters.maxPrice = parseFloat(entities[Entities.MAX_PRICE]);
            // Add more filters: area, views, floor etc.

            const project = await this._findProject(entities, tenantId, conversationContext);
            if (entities[Entities.PROJECT_NAME] && !project) { // If project name was specified but not found
                return { success: false, message: `I couldn't find project "${entities[Entities.PROJECT_NAME]}".`, data: null, conversationContextUpdate: {} };
            }
            if (project && !Array.isArray(project)) filters.projectId = project._id;


            const tower = await this._findTower(entities, tenantId, project, conversationContext);
            if (entities[Entities.TOWER_NAME] && !tower) { // If tower name was specified but not found
                let msg = `I couldn't find tower "${entities[Entities.TOWER_NAME]}"`;
                if (project) msg += ` in project ${project.name}`;
                return { success: false, message: msg, data: null, conversationContextUpdate: {} };
            }
            if (tower && !Array.isArray(tower)) filters.towerId = tower._id;

            const pagination = { page: 1, limit: 5 };
            const unitsResult = await unitService.getUnits(filters, pagination);

            if (!unitsResult || unitsResult.data.length === 0) {
                let message = "I couldn't find any available units matching your criteria";
                if (filters.type) message += ` of type ${filters.type}`;
                if (project && !Array.isArray(project)) message += ` in project ${project.name}`;
                if (tower && !Array.isArray(tower)) message += ` in tower ${tower.name}`;
                return { success: true, message: `${message}.`, data: null, conversationContextUpdate: {} };
            }

            const unitDescriptions = unitsResult.data.map(u =>
                `${u.number} (${u.type}, ${u.carpetArea} sqft, Base Price: ₹${(u.basePrice / 100000).toFixed(0)}L) in Tower: ${u.towerId.name}`
            ).join('\n - ');

            let responseMessage = `Found ${unitsResult.pagination.total} available unit(s). Here are the first ${unitsResult.data.length}:\n - ${unitDescriptions}`;
            if (unitsResult.pagination.total > unitsResult.data.length) responseMessage += "\nMore available.";
            responseMessage += "\nAsk for details on a unit number.";

            return {
                success: true,
                message: responseMessage,
                data: unitsResult.data,
                conversationContextUpdate: {
                    activeProjectId: project?._id?.toString(),
                    activeProjectName: project?.name,
                    activeTowerId: tower?._id?.toString(),
                    activeTowerName: tower?.name,
                }
            };
        } catch (error) {
            logger.error('[InventoryHandler.handleGetAvailableUnits] Error:', error);
            return this._handleError(error, "finding available units");
        }
    }

    async handleGetUnitDetails(entities, userId, tenantId, role, conversationContext) {
        try {
            const project = await this._findProject(entities, tenantId, conversationContext);
            const tower = await this._findTower(entities, tenantId, project, conversationContext);
            const unit = await this._findUnit(entities, tenantId, project, tower, conversationContext, true);

            if (!unit) {
                let msg = `I couldn't find unit "${entities[Entities.UNIT_NUMBER] || 'specified'}"`;
                if (tower && !Array.isArray(tower)) msg += ` in tower ${tower.name}`;
                else if (project && !Array.isArray(project)) msg += ` in project ${project.name}`;
                msg += `. Please provide more specific details or check the unit number.`;
                return { success: false, message: msg, data: null, conversationContextUpdate: {} };
            }
            if (Array.isArray(unit)) { // Multiple units found
                const unitOptions = unit.map(u => `Unit ${u.number} in Tower ${u.towerId?.name || 'N/A'}, Project ${u.projectId?.name || 'N/A'} (ID: ${u._id})`).join('\n - ');
                return { success: false, message: `I found multiple units matching "${entities[Entities.UNIT_NUMBER]}":\n - ${unitOptions}\nPlease specify by ID or be more specific with project/tower.`, data: unit, conversationContextUpdate: {} };
            }

            const priceDetails = unit.priceDetails || await unitService.calculateUnitPrice(unit._id);

            let message = `Details for Unit ${unit.number} in Tower ${unit.towerId.name}, Project ${unit.projectId.name}:\n`;
            message += `- Type: ${unit.type}, Floor: ${unit.floor}\n`;
            message += `- Carpet Area: ${unit.carpetArea} sqft, Super Built-up: ${unit.superBuiltUpArea} sqft\n`;
            message += `- Status: ${unit.status}\n`;
            message += `- Base Price (Unit): ₹${(unit.basePrice / 100000).toFixed(1)}L\n`;
            message += `- Calculated Total Price: ₹${(priceDetails.totalPrice / 100000).toFixed(1)}L (incl. premiums, taxes)\n`;
            if (unit.views && unit.views.length > 0) message += `- Views: ${unit.views.join(', ')}\n`;
            message += `What next? (e.g., 'calculate its full price breakdown', 'lock this unit')`;

            return {
                success: true,
                message: message,
                data: unit,
                conversationContextUpdate: {
                    activeUnitId: unit._id.toString(), activeUnitNumber: unit.number,
                    activeTowerId: unit.towerId._id.toString(), activeTowerName: unit.towerId.name,
                    activeProjectId: unit.projectId._id.toString(), activeProjectName: unit.projectId.name
                }
            };
        } catch (error) {
            logger.error('[InventoryHandler.handleGetUnitDetails] Error:', error);
            return this._handleError(error, `getting details for unit "${entities[Entities.UNIT_NUMBER] || ''}"`);
        }
    }

    async handleGetUnitPrice(entities, userId, tenantId, role, conversationContext) {
        try {
            const project = await this._findProject(entities, tenantId, conversationContext);
            const tower = await this._findTower(entities, tenantId, project, conversationContext);
            const unit = await this._findUnit(entities, tenantId, project, tower, conversationContext);

            if (!unit) {
                return { success: false, message: `I need a specific unit to calculate its price. Please specify the unit number, and optionally project/tower.`, data: null, conversationContextUpdate: {} };
            }
            if (Array.isArray(unit)) { // Should ideally not happen if _findUnit is called without askForClarification, or if it returns null for ambiguity
                return { success: false, message: `Multiple units found. Please specify one unit.`, data: null, conversationContextUpdate: {} };
            }

            const priceDetails = await unitService.calculateUnitPrice(unit._id.toString()); // Ensure ID is string

            let message = `Price breakdown for Unit ${unit.number} (Tower: ${unit.towerId.name}, Project: ${unit.projectId.name}):\n`;
            message += `- Base Unit Price: ${this._formatCurrency(unit.basePrice)}\n`;
            message += `- Calculated Base Price (Area * Rate): ${this._formatCurrency(priceDetails.basePrice)}\n`;
            if (priceDetails.premiums && priceDetails.premiums.length > 0) {
                message += `- Premiums Total: ${this._formatCurrency(priceDetails.premiumTotal)}\n`;
                priceDetails.premiums.forEach(p => {
                    message += `  - ${p.description || p.type}: ${this._formatCurrency(p.amount)}\n`;
                });
            }
            if (priceDetails.additionalCharges && priceDetails.additionalCharges.length > 0) {
                message += `- Additional Charges Total: ${this._formatCurrency(priceDetails.additionalChargesTotal)}\n`;
                priceDetails.additionalCharges.forEach(c => {
                    message += `  - ${c.name}: ${this._formatCurrency(c.amount)}\n`;
                });
            }
            message += `- Subtotal (before tax): ${this._formatCurrency(priceDetails.subtotal)}\n`;
            message += `- Taxes Total: ${this._formatCurrency(priceDetails.taxes.total)}\n`;
            if (priceDetails.taxes.gst) message += `  - GST (${priceDetails.taxes.gst.rate}%): ${this._formatCurrency(priceDetails.taxes.gst.amount)}\n`;
            if (priceDetails.taxes.stampDuty) message += `  - Stamp Duty (${priceDetails.taxes.stampDuty.rate}%): ${this._formatCurrency(priceDetails.taxes.stampDuty.amount)}\n`;
            if (priceDetails.taxes.registration) message += `  - Registration (${priceDetails.taxes.registration.rate}%): ${this._formatCurrency(priceDetails.taxes.registration.amount)}\n`;
            message += `- FINAL TOTAL PRICE: ${this._formatCurrency(priceDetails.totalPrice)}`;

            return {
                success: true,
                message: message,
                data: priceDetails,
                conversationContextUpdate: {
                    activeUnitId: unit._id.toString(), activeUnitNumber: unit.number,
                    activeTowerId: unit.towerId._id.toString(), activeTowerName: unit.towerId.name,
                    activeProjectId: unit.projectId._id.toString(), activeProjectName: unit.projectId.name
                }
            };
        } catch (error) {
            logger.error('[InventoryHandler.handleGetUnitPrice] Error:', error);
            return this._handleError(error, "calculating unit price");
        }
    }

    async handleGetProjectUnitStats(entities, userId, tenantId, role, conversationContext) {
        try {
            const project = await this._findProject(entities, tenantId, conversationContext, true);
            if (!project) {
                return { success: false, message: `I couldn't find project "${entities[Entities.PROJECT_NAME] || conversationContext.activeProjectName || 'specified'}".`, data: null, conversationContextUpdate: {} };
            }
            if (Array.isArray(project)) {
                const projectOptions = project.map(p => `${p.name} (ID: ${p._id})`).join('\n - ');
                return { success: false, message: `I found multiple projects matching "${entities[Entities.PROJECT_NAME]}":\n - ${projectOptions}\nPlease specify by ID.`, data: project, conversationContextUpdate: {} };
            }

            // getProjectById already populates unitStats
            const detailedProject = await projectService.getProjectById(project._id);
            const stats = detailedProject.unitStats || { total: 0, available: 0, booked: 0, sold: 0, types: [] };

            let message = `Unit Statistics for Project ${detailedProject.name}:\n`;
            message += `- Total Units: ${stats.total}\n`;
            message += `- Available: ${stats.available}\n`;
            message += `- Booked: ${stats.booked}\n`;
            message += `- Sold: ${stats.sold}\n`;
            if (stats.types && stats.types.length > 0) {
                message += `- By Type:\n`;
                stats.types.forEach(typeStat => {
                    message += `  - ${typeStat.type || 'N/A'}: ${typeStat.count} units\n`;
                });
            }
            return {
                success: true,
                message: message,
                data: stats,
                conversationContextUpdate: { activeProjectId: detailedProject._id.toString(), activeProjectName: detailedProject.name }
            };
        } catch (error) {
            logger.error('[InventoryHandler.handleGetProjectUnitStats] Error:', error);
            return this._handleError(error, "getting project unit statistics");
        }
    }

    async handleGetTowerConstructionStatus(entities, userId, tenantId, role, conversationContext) {
        try {
            const project = await this._findProject(entities, tenantId, conversationContext);
            const tower = await this._findTower(entities, tenantId, project, conversationContext, true);

            if (!tower) {
                let msg = `I couldn't find tower "${entities[Entities.TOWER_NAME] || conversationContext.activeTowerName || 'specified'}"`;
                if (project && !Array.isArray(project)) msg += ` in project ${project.name}`;
                return { success: false, message: msg + ".", data: null, conversationContextUpdate: {} };
            }
            if (Array.isArray(tower)) {
                const towerOptions = tower.map(t => `${t.name} (ID: ${t._id})`).join('\n - ');
                return { success: false, message: `I found multiple towers matching "${entities[Entities.TOWER_NAME]}". Which one?\n - ${towerOptions}\nPlease specify by ID.`, data: tower, conversationContextUpdate: {} };
            }

            const construction = tower.construction || { status: 'N/A', completionPercentage: 0 };
            let message = `Construction status for Tower ${tower.name} (Project: ${tower.projectId.name}):\n`;
            message += `- Status: ${construction.status}\n`;
            message += `- Completion: ${construction.completionPercentage}%\n`;
            if (construction.estimatedCompletionDate) {
                message += `- Estimated Completion: ${new Date(construction.estimatedCompletionDate).toLocaleDateString()}\n`;
            }
            return {
                success: true,
                message: message,
                data: construction,
                conversationContextUpdate: {
                    activeTowerId: tower._id.toString(),
                    activeTowerName: tower.name,
                    activeProjectId: tower.projectId._id.toString(),
                    activeProjectName: tower.projectId.name
                }
            };
        } catch (error) {
            logger.error('[InventoryHandler.handleGetTowerConstructionStatus] Error:', error);
            return this._handleError(error, "getting tower construction status");
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
        return {
            success: false,
            message: message,
            data: null,
            errorDetails: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            conversationContextUpdate: {}
        };
    }
}

module.exports = new InventoryHandler();
