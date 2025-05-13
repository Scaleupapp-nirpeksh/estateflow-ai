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
        let projectIdToSearchIn = projectContext?._id?.toString() || conversationContext?.activeProjectId;


        if (towerIdFromEntity && mongoose.Types.ObjectId.isValid(towerIdFromEntity)) {
            const tower = await towerService.getTowerById(towerIdFromEntity);
            if (tower && tower.tenantId.toString() === tenantId) return tower; // Assuming tower model has tenantId
        }

        if (conversationContext?.activeTowerId && !towerNameFromEntity && !towerIdFromEntity) {
            const tower = await towerService.getTowerById(conversationContext.activeTowerId);
            if (tower && tower.tenantId.toString() === tenantId) return tower;
        }

        if (towerNameFromEntity && projectIdToSearchIn) {
            const towersResult = await towerService.getTowers(projectIdToSearchIn, { name: towerNameFromEntity, active: undefined }, { page: 1, limit: askForClarification ? 5 : 1 });
            if (towersResult && towersResult.data.length > 0) {
                if (towersResult.data.length === 1) {
                    return await towerService.getTowerById(towersResult.data[0]._id);
                } else if (askForClarification) {
                    return towersResult.data;
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
            if (towerContext?._id) unitFilters.towerId = towerContext._id.toString();
            else if (projectContext?._id) unitFilters.projectId = projectContext._id.toString();

            const unitsResult = await unitService.getUnits(unitFilters, { page: 1, limit: askForClarification ? 5 : 1 });
            if (unitsResult && unitsResult.data.length > 0) {
                if (unitsResult.data.length === 1) {
                    return await unitService.getUnitById(unitsResult.data[0]._id);
                } else if (askForClarification) {
                    return unitsResult.data;
                }
                logger.warn(`[InventoryHandler._findUnit] Ambiguous search for unit "${unitNumberFromEntity}", found ${unitsResult.data.length}.`);
                return null;
            }
        }
        return null;
    }

    // ... (handleListProjects, handleGetProjectDetails, handleGetTowerDetails, handleGetAvailableUnits, handleGetUnitDetails, handleGetUnitPrice, handleGetProjectUnitStats, handleGetTowerConstructionStatus remain the same as Sprint 2.5)
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
            const towerCount = project.towers ? project.towers.length : (await towerService.getTowers(project._id.toString(), {}, { page: 1, limit: 0 })).pagination.total;

            let message = `Project: ${project.name} (ID: ${project._id})\nLocation: ${project.address}, ${project.city}\nStatus: ${project.active ? 'Active' : 'Inactive'}\nDescription: ${project.description || 'N/A'}\n`;
            message += `Towers: ${towerCount}\nTotal Units: ${unitStats.total}, Available: ${unitStats.available}, Booked: ${unitStats.booked}, Sold: ${unitStats.sold}\n`;
            if (project.amenities && project.amenities.length > 0) message += `Amenities: ${project.amenities.join(', ')}\n`;
            message += `What else about ${project.name}? (e.g., 'list its towers', 'show available units')`;

            return {
                success: true,
                message: message,
                data: project,
                conversationContextUpdate: { activeProjectId: project._id.toString(), activeProjectName: project.name, activeTowerId: null, activeTowerName: null, activeUnitId: null, activeUnitNumber: null }
            };
        } catch (error) {
            logger.error('[InventoryHandler.handleGetProjectDetails] Error:', error);
            return this._handleError(error, `getting details for project "${entities[Entities.PROJECT_NAME] || ''}"`);
        }
    }

    async handleGetTowerDetails(entities, userId, tenantId, role, conversationContext) {
        try {
            const project = await this._findProject(entities, tenantId, conversationContext);
            const tower = await this._findTower(entities, tenantId, project, conversationContext, true);

            if (!tower) {
                let msg = `I couldn't find tower "${entities[Entities.TOWER_NAME] || conversationContext.activeTowerName || 'specified'}"`;
                if (project && !Array.isArray(project)) msg += ` in project ${project.name}`;
                else if (conversationContext.activeProjectName && !project) msg += ` in project ${conversationContext.activeProjectName}`;
                msg += `. Please try a different name or ID.`;
                return { success: false, message: msg, data: null, conversationContextUpdate: {} };
            }
            if (Array.isArray(tower)) {
                const towerOptions = tower.map(t => `${t.name} (ID: ${t._id})`).join('\n - ');
                return { success: false, message: `I found multiple towers matching "${entities[Entities.TOWER_NAME]}". Which one?\n - ${towerOptions}\nPlease specify by ID.`, data: tower, conversationContextUpdate: {} };
            }

            // Ensure projectId is populated for the message
            const towerProject = tower.projectId || (project && !Array.isArray(project) ? project : await projectService.getProjectById(tower.projectId));


            const unitStats = tower.unitStats || { total: 0, available: 0 };
            let message = `Tower: ${tower.name} (ID: ${tower._id}) in Project: ${towerProject.name}\n`;
            message += `Total Floors: ${tower.totalFloors}\nConstruction: ${tower.construction?.status || 'N/A'} (${tower.construction?.completionPercentage || 0}% complete)\n`;
            message += `Total Units: ${unitStats.total}, Available: ${unitStats.available}\n`;
            if (tower.premiums?.floorRise?.value) message += `Floor Rise: ${tower.premiums.floorRise.type} @ ${this._formatCurrency(tower.premiums.floorRise.value)} from floor ${tower.premiums.floorRise.floorStart}\n`;
            message += `What next for tower ${tower.name}? (e.g., 'show its available units')`;

            return {
                success: true,
                message: message,
                data: tower,
                conversationContextUpdate: {
                    activeTowerId: tower._id.toString(),
                    activeTowerName: tower.name,
                    activeProjectId: towerProject._id.toString(),
                    activeProjectName: towerProject.name,
                    activeUnitId: null, activeUnitNumber: null
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

            const project = await this._findProject(entities, tenantId, conversationContext);
            if (entities[Entities.PROJECT_NAME] && !project) {
                return { success: false, message: `I couldn't find project "${entities[Entities.PROJECT_NAME]}".`, data: null, conversationContextUpdate: {} };
            }
            if (project && !Array.isArray(project)) filters.projectId = project._id.toString();


            const tower = await this._findTower(entities, tenantId, project, conversationContext);
            if (entities[Entities.TOWER_NAME] && !tower) {
                let msg = `I couldn't find tower "${entities[Entities.TOWER_NAME]}"`;
                if (project && !Array.isArray(project)) msg += ` in project ${project.name}`;
                return { success: false, message: msg, data: null, conversationContextUpdate: {} };
            }
            if (tower && !Array.isArray(tower)) filters.towerId = tower._id.toString();

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
                `${u.number} (${u.type}, ${u.carpetArea} sqft, Base Price: ${this._formatCurrency(u.basePrice)}) in Tower: ${u.towerId.name}`
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
            if (Array.isArray(unit)) {
                const unitOptions = unit.map(u => `Unit ${u.number} in Tower ${u.towerId?.name || 'N/A'}, Project ${u.projectId?.name || 'N/A'} (ID: ${u._id})`).join('\n - ');
                return { success: false, message: `I found multiple units matching "${entities[Entities.UNIT_NUMBER]}":\n - ${unitOptions}\nPlease specify by ID or be more specific with project/tower.`, data: unit, conversationContextUpdate: {} };
            }

            const priceDetails = unit.priceDetails || await unitService.calculateUnitPrice(unit._id.toString());

            let message = `Details for Unit ${unit.number} in Tower ${unit.towerId.name}, Project ${unit.projectId.name}:\n`;
            message += `- Type: ${unit.type}, Floor: ${unit.floor}\n`;
            message += `- Carpet Area: ${unit.carpetArea} sqft, Super Built-up: ${unit.superBuiltUpArea} sqft\n`;
            message += `- Status: ${unit.status}\n`;
            message += `- Base Price (Unit): ${this._formatCurrency(unit.basePrice)}\n`;
            message += `- Calculated Total Price: ${this._formatCurrency(priceDetails.totalPrice)} (incl. premiums, taxes)\n`;
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

            if (!unit || Array.isArray(unit)) { // Ensure unit is found and unambiguous
                return { success: false, message: `I need a specific, unique unit to calculate its price. Please specify the unit number, and optionally project/tower. If multiple matches were found previously, please use the unit ID.`, data: null, conversationContextUpdate: {} };
            }

            const priceDetails = await unitService.calculateUnitPrice(unit._id.toString());

            let message = `Price breakdown for Unit ${unit.number} (Tower: ${unit.towerId.name}, Project: ${unit.projectId.name}):\n`;
            message += `- Base Unit Price (Rate * Area): ${this._formatCurrency(unit.basePrice * unit.superBuiltUpArea)} (Rate: ${this._formatCurrency(unit.basePrice)}/sqft on SBA: ${unit.superBuiltUpArea} sqft)\n`;
            message += `- Calculated Base Price (from pricing engine): ${this._formatCurrency(priceDetails.basePrice)}\n`;
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

            const detailedProject = await projectService.getProjectById(project._id.toString());
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

            const towerDetails = await towerService.getTowerById(tower._id.toString()); // Re-fetch to ensure projectId is populated
            const construction = towerDetails.construction || { status: 'N/A', completionPercentage: 0 };
            let message = `Construction status for Tower ${towerDetails.name} (Project: ${towerDetails.projectId.name}):\n`;
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
                    activeTowerId: towerDetails._id.toString(),
                    activeTowerName: towerDetails.name,
                    activeProjectId: towerDetails.projectId._id.toString(),
                    activeProjectName: towerDetails.projectId.name
                }
            };
        } catch (error) {
            logger.error('[InventoryHandler.handleGetTowerConstructionStatus] Error:', error);
            return this._handleError(error, "getting tower construction status");
        }
    }

    async handleLockUnit(entities, userId, tenantId, role, conversationContext) {
        try {
            const durationString = entities[Entities.DURATION]; // e.g., "2 hours", "90 minutes"
            let minutesToLock = 60; // Default lock time

            if (durationString) {
                const durationParts = durationString.toLowerCase().split(" ");
                const value = parseInt(durationParts[0]);
                if (!isNaN(value)) {
                    if (durationParts.includes("hour") || durationParts.includes("hours")) {
                        minutesToLock = value * 60;
                    } else if (durationParts.includes("minute") || durationParts.includes("minutes")) {
                        minutesToLock = value;
                    }
                }
            }

            const project = await this._findProject(entities, tenantId, conversationContext);
            const tower = await this._findTower(entities, tenantId, project, conversationContext);
            const unit = await this._findUnit(entities, tenantId, project, tower, conversationContext);

            if (!unit || Array.isArray(unit)) {
                return { success: false, message: "Which specific unit would you like to lock? Please provide the unit number and optionally project/tower.", data: null, conversationContextUpdate: {} };
            }

            const lockedUnit = await unitService.lockUnit(unit._id.toString(), userId, minutesToLock);

            // Optionally, if a lead name was mentioned (e.g., "for Jane Johnson"), add a note.
            // This requires lead identification similar to leadHandler._findLead
            // For now, we'll skip this part to keep the lock action focused.

            return {
                success: true,
                message: `Unit ${lockedUnit.number} in ${lockedUnit.towerId.name} has been locked for you for ${minutesToLock} minutes. It will be automatically released at ${new Date(lockedUnit.lockedUntil).toLocaleTimeString()}.`,
                data: lockedUnit,
                conversationContextUpdate: {
                    activeUnitId: lockedUnit._id.toString(), activeUnitNumber: lockedUnit.number,
                    activeTowerId: lockedUnit.towerId._id.toString(), activeTowerName: lockedUnit.towerId.name,
                    activeProjectId: lockedUnit.projectId._id.toString(), activeProjectName: lockedUnit.projectId.name
                }
            };
        } catch (error) {
            logger.error('[InventoryHandler.handleLockUnit] Error:', error);
            return this._handleError(error, "locking the unit");
        }
    }

    async handleReleaseUnit(entities, userId, tenantId, role, conversationContext) {
        try {
            const project = await this._findProject(entities, tenantId, conversationContext);
            const tower = await this._findTower(entities, tenantId, project, conversationContext);
            const unit = await this._findUnit(entities, tenantId, project, tower, conversationContext);

            if (!unit || Array.isArray(unit)) {
                return { success: false, message: "Which specific unit would you like to release? Please provide the unit number and optionally project/tower.", data: null, conversationContextUpdate: {} };
            }

            // Permission check: Only the user who locked or a manager can release
            if (unit.status === 'locked' && unit.lockedBy && unit.lockedBy.toString() !== userId && !['Principal', 'BusinessHead', 'SalesDirector'].includes(role)) {
                return { success: false, message: `Unit ${unit.number} was locked by another user. Only they or a manager can release it.`, data: null, conversationContextUpdate: {} };
            }

            const releasedUnit = await unitService.releaseUnit(unit._id.toString());

            return {
                success: true,
                message: `Unit ${releasedUnit.number} in ${releasedUnit.towerId.name} has been released and is now available.`,
                data: releasedUnit,
                conversationContextUpdate: {
                    // Clear active unit if it was the one released, or keep project/tower context
                    activeUnitId: null, activeUnitNumber: null,
                    activeTowerId: releasedUnit.towerId._id.toString(), activeTowerName: releasedUnit.towerId.name,
                    activeProjectId: releasedUnit.projectId._id.toString(), activeProjectName: releasedUnit.projectId.name
                }
            };
        } catch (error) {
            logger.error('[InventoryHandler.handleReleaseUnit] Error:', error);
            return this._handleError(error, "releasing the unit");
        }
    }

    _formatCurrency(amount) {
        if (amount === null || amount === undefined || isNaN(amount)) return 'N/A';
        return '₹' + Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 0 });
    }

    _handleError(error, actionDescription) {
        let message = `Sorry, I encountered an error while ${actionDescription}.`;
        if (error instanceof ApiError) {
            message = error.message; // Use specific message from ApiError
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
