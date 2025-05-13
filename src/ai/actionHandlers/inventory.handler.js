// src/ai/actionHandlers/inventory.handler.js

const projectService = require('../../services/project.service.js');
const towerService = require('../../services/tower.service.js');
const unitService = require('../../services/unit.service.js');
const logger = require('../../utils/logger.js');
const Entities = require('../definitions/entities.js');
const { ApiError } = require('../../utils/error-handler.js');
const mongoose = require('mongoose');

class InventoryHandler {

    _escapeRegex(string) {
        if (typeof string !== 'string') return '';
        return string.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    }

    async _findProjectAdvanced(entities, tenantId, conversationContext) {
        const projectIdFromEntity = entities[Entities.PROJECT_ID]; // NLU might extract PROJECT_ID directly
        const projectNameFromEntity = entities[Entities.PROJECT_NAME];

        // Priority 1: Explicit ID from current utterance
        if (projectIdFromEntity && mongoose.Types.ObjectId.isValid(projectIdFromEntity)) {
            logger.debug(`[InventoryHandler._findProjectAdvanced] Attempting find by explicit ID: ${projectIdFromEntity}`);
            const project = await projectService.getProjectById(projectIdFromEntity);
            if (project && project.tenantId.toString() === tenantId) return project;
        }

        // Priority 2: Active project from context IF no new project identifier is present in the current utterance
        const noNewProjectIdentifier = !projectIdFromEntity && !projectNameFromEntity;
        if (noNewProjectIdentifier && conversationContext?.activeProjectId && mongoose.Types.ObjectId.isValid(conversationContext.activeProjectId)) {
            logger.debug(`[InventoryHandler._findProjectAdvanced] Using activeProjectId from context: ${conversationContext.activeProjectId}`);
            const project = await projectService.getProjectById(conversationContext.activeProjectId);
            if (project && project.tenantId.toString() === tenantId) return project;
        }

        // Priority 3: Search by name
        if (projectNameFromEntity) {
            logger.debug(`[InventoryHandler._findProjectAdvanced] Searching by name: ${projectNameFromEntity}`);
            // Use the 'search' filter which leverages the text index on Project model (name, description, address)
            const projectsResult = await projectService.getProjects(tenantId, { search: projectNameFromEntity, active: undefined }, { page: 1, limit: 5 }); // active: undefined to search all
            if (projectsResult && projectsResult.data.length === 1) {
                return await projectService.getProjectById(projectsResult.data[0]._id); // Fetch full details
            }
            if (projectsResult && projectsResult.data.length > 1) {
                return projectsResult.data; // Ambiguous: return array for disambiguation
            }
        }
        logger.debug(`[InventoryHandler._findProjectAdvanced] No project found.`);
        return null;
    }

    async _findTowerAdvanced(entities, tenantId, projectContextId, conversationContext) {
        const towerIdFromEntity = entities[Entities.TOWER_ID];
        const towerNameFromEntity = entities[Entities.TOWER_NAME];

        let effectiveProjectId = projectContextId || conversationContext?.activeProjectId;

        // Priority 1: Explicit Tower ID
        if (towerIdFromEntity && mongoose.Types.ObjectId.isValid(towerIdFromEntity)) {
            logger.debug(`[InventoryHandler._findTowerAdvanced] Attempting find by explicit Tower ID: ${towerIdFromEntity}`);
            const tower = await towerService.getTowerById(towerIdFromEntity);
            // Validate tenant and project context if available
            if (tower && tower.tenantId.toString() === tenantId) {
                if (!effectiveProjectId || tower.projectId.toString() === effectiveProjectId) {
                    return tower;
                }
                logger.warn(`[InventoryHandler._findTowerAdvanced] Tower ID ${towerIdFromEntity} found, but not in current project context ${effectiveProjectId}.`);
            }
        }

        // Priority 2: Active tower from context IF no new tower identifier and project context matches
        const noNewTowerIdentifier = !towerIdFromEntity && !towerNameFromEntity;
        if (noNewTowerIdentifier && conversationContext?.activeTowerId && mongoose.Types.ObjectId.isValid(conversationContext.activeTowerId)) {
            const towerInContext = await towerService.getTowerById(conversationContext.activeTowerId);
            if (towerInContext && towerInContext.tenantId.toString() === tenantId) {
                // If there's an effective project context, ensure the tower from context belongs to it
                if (!effectiveProjectId || towerInContext.projectId.toString() === effectiveProjectId) {
                    logger.debug(`[InventoryHandler._findTowerAdvanced] Using activeTowerId from context: ${conversationContext.activeTowerId}`);
                    return towerInContext;
                }
            }
        }

        // Priority 3: Search by Tower Name (REQUIRES project context)
        if (towerNameFromEntity) {
            if (!effectiveProjectId) {
                logger.debug(`[InventoryHandler._findTowerAdvanced] Tower name "${towerNameFromEntity}" provided without project context.`);
                return { requiresProjectContext: true, forTowerName: towerNameFromEntity }; // Signal that project context is needed
            }
            logger.debug(`[InventoryHandler._findTowerAdvanced] Searching for tower "${towerNameFromEntity}" in project ID "${effectiveProjectId}"`);
            const towersResult = await towerService.getTowers(
                effectiveProjectId,
                { name: { $regex: new RegExp(this._escapeRegex(towerNameFromEntity), 'i') }, active: undefined },
                { page: 1, limit: 5 }
            );
            if (towersResult && towersResult.data.length === 1) {
                return await towerService.getTowerById(towersResult.data[0]._id); // Fetch full details
            }
            if (towersResult && towersResult.data.length > 1) {
                return towersResult.data; // Ambiguous
            }
        }
        logger.debug(`[InventoryHandler._findTowerAdvanced] No tower found.`);
        return null;
    }

    async _findUnitAdvanced(entities, tenantId, projectContextId, towerContextId, conversationContext) {
        const unitIdFromEntity = entities[Entities.UNIT_ID];
        const unitNumberFromEntity = entities[Entities.UNIT_NUMBER];

        // Priority 1: Explicit Unit ID
        if (unitIdFromEntity && mongoose.Types.ObjectId.isValid(unitIdFromEntity)) {
            logger.debug(`[InventoryHandler._findUnitAdvanced] Attempting find by explicit Unit ID: ${unitIdFromEntity}`);
            const unit = await unitService.getUnitById(unitIdFromEntity);
            if (unit && unit.tenantId.toString() === tenantId) {
                // Optional: Validate against project/tower context if provided
                if (towerContextId && unit.towerId.toString() !== towerContextId) return null;
                if (projectContextId && unit.projectId.toString() !== projectContextId) return null;
                return unit;
            }
        }

        // Priority 2: Active unit from context IF no new unit identifier and project/tower context matches
        const noNewUnitIdentifier = !unitIdFromEntity && !unitNumberFromEntity;
        if (noNewUnitIdentifier && conversationContext?.activeUnitId && mongoose.Types.ObjectId.isValid(conversationContext.activeUnitId)) {
            const unitInContext = await unitService.getUnitById(conversationContext.activeUnitId);
            if (unitInContext && unitInContext.tenantId.toString() === tenantId) {
                // Ensure unit from context matches current project/tower context if they exist
                const currentProjectContext = projectContextId || conversationContext?.activeProjectId;
                const currentTowerContext = towerContextId || conversationContext?.activeTowerId;
                if (currentTowerContext && unitInContext.towerId.toString() !== currentTowerContext) { /* Mismatch */ }
                else if (currentProjectContext && unitInContext.projectId.toString() !== currentProjectContext) { /* Mismatch */ }
                else {
                    logger.debug(`[InventoryHandler._findUnitAdvanced] Using activeUnitId from context: ${conversationContext.activeUnitId}`);
                    return unitInContext;
                }
            }
        }

        // Priority 3: Search by Unit Number (REQUIRES tower or at least project context)
        if (unitNumberFromEntity) {
            const filters = { tenantId, number: unitNumberFromEntity };
            let effectiveTowerId = towerContextId || conversationContext?.activeTowerId;
            let effectiveProjectId = projectContextId || conversationContext?.activeProjectId;

            if (effectiveTowerId) {
                filters.towerId = effectiveTowerId;
                logger.debug(`[InventoryHandler._findUnitAdvanced] Searching for unit "${unitNumberFromEntity}" in tower ID "${effectiveTowerId}"`);
            } else if (effectiveProjectId) {
                filters.projectId = effectiveProjectId;
                logger.debug(`[InventoryHandler._findUnitAdvanced] Searching for unit "${unitNumberFromEntity}" in project ID "${effectiveProjectId}"`);
            } else {
                logger.debug(`[InventoryHandler._findUnitAdvanced] Unit number "${unitNumberFromEntity}" provided without project/tower context.`);
                return { requiresProjectOrTowerContext: true, forUnitNumber: unitNumberFromEntity };
            }

            const unitsResult = await unitService.getUnits(filters, { page: 1, limit: 5 }); // Exact match on number should yield 1 if scoped
            if (unitsResult && unitsResult.data.length === 1) {
                return await unitService.getUnitById(unitsResult.data[0]._id); // Fetch full details
            }
            if (unitsResult && unitsResult.data.length > 1) { // Should be rare if unit numbers are unique within tower/project
                return unitsResult.data; // Ambiguous
            }
        }
        logger.debug(`[InventoryHandler._findUnitAdvanced] No unit found.`);
        return null;
    }

    // --- Resolver Wrappers for Main Handlers ---
    async _resolveProject(entities, tenantId, conversationContext) {
        const projectOrProjects = await this._findProjectAdvanced(entities, tenantId, conversationContext);
        if (!projectOrProjects) {
            const nameHint = entities[Entities.PROJECT_NAME] || conversationContext.activeProjectName || 'the specified project';
            return { error: true, message: `I couldn't find ${nameHint}. Please try a different name or ID.` };
        }
        if (Array.isArray(projectOrProjects)) {
            const projectOptions = projectOrProjects.map(p => `${p.name} (ID: ${p._id}) in ${p.city}`).join('\n - ');
            return { error: true, message: `I found multiple projects matching "${entities[Entities.PROJECT_NAME]}":\n - ${projectOptions}\nPlease specify by ID or provide more details.`, data: projectOrProjects };
        }
        return { error: false, project: projectOrProjects };
    }

    async _resolveTower(entities, tenantId, projectContext, conversationContext) { // projectContext is the resolved Project object
        const projectContextId = projectContext?._id?.toString();
        const towerOrTowers = await this._findTowerAdvanced(entities, tenantId, projectContextId, conversationContext);

        if (!towerOrTowers) {
            let msg = `I couldn't find tower "${entities[Entities.TOWER_NAME] || conversationContext.activeTowerName || 'specified'}"`;
            if (projectContext) msg += ` in project ${projectContext.name}`;
            else if (conversationContext.activeProjectName && !entities[Entities.PROJECT_NAME]) msg += ` in project ${conversationContext.activeProjectName}`;
            return { error: true, message: msg + ". Please try a different name or ID." };
        }
        if (towerOrTowers.requiresProjectContext) {
            return { error: true, message: `To find tower "${towerOrTowers.forTowerName}", please specify which project it belongs to.` };
        }
        if (Array.isArray(towerOrTowers)) {
            const towerOptions = towerOrTowers.map(t => `${t.name} (ID: ${t._id})`).join('\n - ');
            let msg = `I found multiple towers matching "${entities[Entities.TOWER_NAME]}"`;
            if (projectContext) msg += ` in project ${projectContext.name}`;
            msg += `:\n - ${towerOptions}\nPlease specify by ID.`;
            return { error: true, message: msg, data: towerOrTowers };
        }
        return { error: false, tower: towerOrTowers };
    }

    async _resolveUnit(entities, tenantId, projectContext, towerContext, conversationContext) { // projectContext & towerContext are resolved objects
        const projectContextId = projectContext?._id?.toString();
        const towerContextId = towerContext?._id?.toString();
        const unitOrUnits = await this._findUnitAdvanced(entities, tenantId, projectContextId, towerContextId, conversationContext);

        if (!unitOrUnits) {
            let msg = `I couldn't find unit "${entities[Entities.UNIT_NUMBER] || conversationContext.activeUnitNumber || 'specified'}"`;
            if (towerContext) msg += ` in tower ${towerContext.name}`;
            else if (projectContext) msg += ` in project ${projectContext.name}`;
            return { error: true, message: msg + ". Please provide more specific details or check the unit number." };
        }
        if (unitOrUnits.requiresProjectOrTowerContext) {
            return { error: true, message: `To find unit "${unitOrUnits.forUnitNumber}", please specify which project and/or tower it belongs to.` };
        }
        if (Array.isArray(unitOrUnits)) {
            const unitOptions = unitOrUnits.map(u => `Unit ${u.number} (ID: ${u._id}) in Tower ${u.towerId?.name || 'N/A'}`).join('\n - ');
            return { error: true, message: `I found multiple units matching "${entities[Entities.UNIT_NUMBER]}":\n - ${unitOptions}\nPlease specify by ID or be more specific.`, data: unitOrUnits };
        }
        return { error: false, unit: unitOrUnits };
    }

    // --- Main Handler Functions ---
    async handleListProjects(entities, userId, tenantId, role, conversationContext) {
        try {
            const filters = { city: entities[Entities.LOCATION], active: true }; // Default to active
            if (entities[Entities.STATUS_VALUE] === 'inactive' || entities[Entities.STATUS_VALUE] === 'all') {
                filters.active = entities[Entities.STATUS_VALUE] === 'inactive' ? false : undefined; // undefined for all
            }
            const pagination = { page: 1, limit: 10 };
            const projectsResult = await projectService.getProjects(tenantId, filters, pagination);

            if (!projectsResult || projectsResult.data.length === 0) {
                let msg = "I couldn't find any projects";
                if (filters.active === true) msg = "I couldn't find any active projects";
                else if (filters.active === false) msg = "I couldn't find any inactive projects";
                if (filters.city) msg += ` in ${filters.city}`;
                return { success: true, message: `${msg}.`, data: null, conversationContextUpdate: {} };
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
            const resolution = await this._resolveProject(entities, tenantId, conversationContext);
            if (resolution.error) return { ...resolution, success: false, conversationContextUpdate: { activeProjectId: null, activeProjectName: null, activeTowerId: null, activeTowerName: null, activeUnitId: null, activeUnitNumber: null } };
            const project = resolution.project;

            const detailedProject = await projectService.getProjectById(project._id.toString());

            const unitStats = detailedProject.unitStats || { total: 0, available: 0, booked: 0, sold: 0 };
            const towerCount = detailedProject.towerCount !== undefined ? detailedProject.towerCount : (await towerService.getTowers(detailedProject._id.toString(), {}, { page: 1, limit: 0 })).pagination.total;

            let message = `Project: ${detailedProject.name} (ID: ${detailedProject._id})\nLocation: ${detailedProject.address}, ${detailedProject.city}\nStatus: ${detailedProject.active ? 'Active' : 'Inactive'}\nDescription: ${detailedProject.description || 'N/A'}\n`;
            message += `Towers: ${towerCount}\nTotal Units: ${unitStats.total}, Available: ${unitStats.available}, Booked: ${unitStats.booked}, Sold: ${unitStats.sold}\n`;
            if (detailedProject.amenities && detailedProject.amenities.length > 0) message += `Amenities: ${detailedProject.amenities.join(', ')}\n`;
            message += `What else about ${detailedProject.name}? (e.g., 'list its towers', 'show available units')`;

            return {
                success: true,
                message: message,
                data: detailedProject,
                conversationContextUpdate: { activeProjectId: detailedProject._id.toString(), activeProjectName: detailedProject.name, activeTowerId: null, activeTowerName: null, activeUnitId: null, activeUnitNumber: null }
            };
        } catch (error) {
            logger.error('[InventoryHandler.handleGetProjectDetails] Error:', error);
            return this._handleError(error, `getting project details`);
        }
    }

    async handleGetTowerDetails(entities, userId, tenantId, role, conversationContext) {
        try {
            const projectResolution = await this._resolveProject(entities, tenantId, conversationContext);
            if (projectResolution.error && entities[Entities.PROJECT_NAME] && !entities[Entities.TOWER_ID]) { // If project was named and not found/ambiguous, and no Tower ID given
                return { ...projectResolution, success: false, conversationContextUpdate: {} };
            }
            const projectContext = projectResolution.project; // This might be null if only tower ID was given

            const towerResolution = await this._resolveTower(entities, tenantId, projectContext, conversationContext);
            if (towerResolution.error) return { ...towerResolution, success: false, conversationContextUpdate: {} };
            const tower = towerResolution.tower;

            const detailedTower = await towerService.getTowerById(tower._id.toString());

            const unitStats = detailedTower.unitStats || { total: 0, available: 0 };
            let message = `Tower: ${detailedTower.name} (ID: ${detailedTower._id}) in Project: ${detailedTower.projectId.name}\n`;
            message += `Total Floors: ${detailedTower.totalFloors}\nConstruction: ${detailedTower.construction?.status || 'N/A'} (${detailedTower.construction?.completionPercentage || 0}% complete)\n`;
            message += `Total Units: ${unitStats.total}, Available: ${unitStats.available}\n`;
            if (detailedTower.premiums?.floorRise?.value) message += `Floor Rise: ${detailedTower.premiums.floorRise.type} @ ${this._formatCurrency(detailedTower.premiums.floorRise.value)} from floor ${detailedTower.premiums.floorRise.floorStart}\n`;
            message += `What next for tower ${detailedTower.name}? (e.g., 'show its available units')`;

            return {
                success: true,
                message: message,
                data: detailedTower,
                conversationContextUpdate: {
                    activeTowerId: detailedTower._id.toString(),
                    activeTowerName: detailedTower.name,
                    activeProjectId: detailedTower.projectId._id.toString(),
                    activeProjectName: detailedTower.projectId.name,
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
            // Add other filters like area, views, floor

            const projectResolution = await this._resolveProject(entities, tenantId, conversationContext);
            const projectContext = projectResolution.project;
            if (projectResolution.error && entities[Entities.PROJECT_NAME]) return { ...projectResolution, success: false, conversationContextUpdate: {} };
            if (projectContext) filters.projectId = projectContext._id.toString();

            const towerResolution = await this._resolveTower(entities, tenantId, projectContext, conversationContext);
            const towerContext = towerResolution.tower;
            if (towerResolution.error && entities[Entities.TOWER_NAME]) return { ...towerResolution, success: false, conversationContextUpdate: {} };
            if (towerContext) filters.towerId = towerContext._id.toString();

            const pagination = { page: 1, limit: 5 };
            const unitsResult = await unitService.getUnits(filters, pagination);

            let currentProjectName = projectContext?.name || conversationContext.activeProjectName;
            let currentTowerName = towerContext?.name || conversationContext.activeTowerName;

            if (!unitsResult || unitsResult.data.length === 0) {
                let message = "I couldn't find any available units matching your criteria";
                if (filters.type) message += ` of type ${filters.type}`;
                if (currentProjectName) message += ` in project ${currentProjectName}`;
                if (currentTowerName) message += ` in tower ${currentTowerName}`;
                return {
                    success: true, message: `${message}.`, data: null,
                    conversationContextUpdate: {
                        activeProjectId: projectContext?._id?.toString() || conversationContext.activeProjectId,
                        activeProjectName: currentProjectName,
                        activeTowerId: towerContext?._id?.toString() || conversationContext.activeTowerId,
                        activeTowerName: currentTowerName,
                    }
                };
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
                    activeProjectId: projectContext?._id?.toString() || conversationContext.activeProjectId,
                    activeProjectName: currentProjectName,
                    activeTowerId: towerContext?._id?.toString() || conversationContext.activeTowerId,
                    activeTowerName: currentTowerName,
                }
            };
        } catch (error) {
            logger.error('[InventoryHandler.handleGetAvailableUnits] Error:', error);
            return this._handleError(error, "finding available units");
        }
    }

    async handleGetUnitDetails(entities, userId, tenantId, role, conversationContext) {
        try {
            const projectResolution = await this._resolveProject(entities, tenantId, conversationContext);
            const projectContext = projectResolution.project;
            if (projectResolution.error && entities[Entities.PROJECT_NAME] && !entities[Entities.UNIT_ID] && !entities[Entities.TOWER_ID]) return { ...projectResolution, success: false, conversationContextUpdate: {} };

            const towerResolution = await this._resolveTower(entities, tenantId, projectContext, conversationContext);
            const towerContext = towerResolution.tower;
            if (towerResolution.error && entities[Entities.TOWER_NAME] && !entities[Entities.UNIT_ID]) return { ...towerResolution, success: false, conversationContextUpdate: {} };

            const unitResolution = await this._resolveUnit(entities, tenantId, projectContext, towerContext, conversationContext);
            if (unitResolution.error) return { ...unitResolution, success: false, conversationContextUpdate: {} };
            const unit = unitResolution.unit;

            const detailedUnit = await unitService.getUnitById(unit._id.toString());

            const priceDetails = detailedUnit.priceDetails || await unitService.calculateUnitPrice(detailedUnit._id.toString());

            let message = `Details for Unit ${detailedUnit.number} in Tower ${detailedUnit.towerId.name}, Project ${detailedUnit.projectId.name}:\n`;
            message += `- Type: ${detailedUnit.type}, Floor: ${detailedUnit.floor}\n`;
            message += `- Carpet Area: ${detailedUnit.carpetArea} sqft, Super Built-up: ${detailedUnit.superBuiltUpArea} sqft\n`;
            message += `- Status: ${detailedUnit.status}\n`;
            message += `- Base Price (Unit): ${this._formatCurrency(detailedUnit.basePrice)}\n`;
            message += `- Calculated Total Price: ${this._formatCurrency(priceDetails.totalPrice)} (incl. premiums, taxes)\n`;
            if (detailedUnit.views && detailedUnit.views.length > 0) message += `- Views: ${detailedUnit.views.join(', ')}\n`;
            message += `What next? (e.g., 'calculate its full price breakdown', 'lock this unit')`;

            return {
                success: true,
                message: message,
                data: detailedUnit,
                conversationContextUpdate: {
                    activeUnitId: detailedUnit._id.toString(), activeUnitNumber: detailedUnit.number,
                    activeTowerId: detailedUnit.towerId._id.toString(), activeTowerName: detailedUnit.towerId.name,
                    activeProjectId: detailedUnit.projectId._id.toString(), activeProjectName: detailedUnit.projectId.name
                }
            };
        } catch (error) {
            logger.error('[InventoryHandler.handleGetUnitDetails] Error:', error);
            return this._handleError(error, `getting unit details`);
        }
    }

    async handleGetUnitPrice(entities, userId, tenantId, role, conversationContext) {
        try {
            const projectResolution = await this._resolveProject(entities, tenantId, conversationContext);
            const projectContext = projectResolution.project;
            if (projectResolution.error && entities[Entities.PROJECT_NAME] && !entities[Entities.UNIT_ID] && !entities[Entities.TOWER_ID]) return { ...projectResolution, success: false, conversationContextUpdate: {} };

            const towerResolution = await this._resolveTower(entities, tenantId, projectContext, conversationContext);
            const towerContext = towerResolution.tower;
            if (towerResolution.error && entities[Entities.TOWER_NAME] && !entities[Entities.UNIT_ID]) return { ...towerResolution, success: false, conversationContextUpdate: {} };

            const unitResolution = await this._resolveUnit(entities, tenantId, projectContext, towerContext, conversationContext);
            if (unitResolution.error) return { ...unitResolution, success: false, conversationContextUpdate: {} };
            const unit = unitResolution.unit;

            const priceDetails = await unitService.calculateUnitPrice(unit._id.toString());
            const detailedUnit = await unitService.getUnitById(unit._id.toString());

            let message = `Price breakdown for Unit ${detailedUnit.number} (Tower: ${detailedUnit.towerId.name}, Project: ${detailedUnit.projectId.name}):\n`;
            message += `- Base Unit Price (Rate * Area): ${this._formatCurrency(detailedUnit.basePrice * detailedUnit.superBuiltUpArea)} (Rate: ${this._formatCurrency(detailedUnit.basePrice)}/sqft on SBA: ${detailedUnit.superBuiltUpArea} sqft)\n`;
            message += `- Calculated Base Price (from pricing engine): ${this._formatCurrency(priceDetails.basePrice)}\n`;
            if (priceDetails.premiums && priceDetails.premiums.length > 0) {
                message += `- Premiums Total: ${this._formatCurrency(priceDetails.premiumTotal)}\n`;
                priceDetails.premiums.forEach(p => { message += `  - ${p.description || p.type}: ${this._formatCurrency(p.amount)}\n`; });
            }
            if (priceDetails.additionalCharges && priceDetails.additionalCharges.length > 0) {
                message += `- Additional Charges Total: ${this._formatCurrency(priceDetails.additionalChargesTotal)}\n`;
                priceDetails.additionalCharges.forEach(c => { message += `  - ${c.name}: ${this._formatCurrency(c.amount)}\n`; });
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
                    activeUnitId: detailedUnit._id.toString(), activeUnitNumber: detailedUnit.number,
                    activeTowerId: detailedUnit.towerId._id.toString(), activeTowerName: detailedUnit.towerId.name,
                    activeProjectId: detailedUnit.projectId._id.toString(), activeProjectName: detailedUnit.projectId.name
                }
            };
        } catch (error) {
            logger.error('[InventoryHandler.handleGetUnitPrice] Error:', error);
            return this._handleError(error, "calculating unit price");
        }
    }

    async handleGetProjectUnitStats(entities, userId, tenantId, role, conversationContext) {
        try {
            const resolution = await this._resolveProject(entities, tenantId, conversationContext);
            if (resolution.error) return { ...resolution, success: false, conversationContextUpdate: {} };
            const project = resolution.project;

            const detailedProject = await projectService.getProjectById(project._id.toString());
            const stats = detailedProject.unitStats || { total: 0, available: 0, booked: 0, sold: 0, types: [] };

            let message = `Unit Statistics for Project ${detailedProject.name}:\n`;
            message += `- Total Units: ${stats.total}\n- Available: ${stats.available}\n- Booked: ${stats.booked}\n- Sold: ${stats.sold}\n`;
            if (stats.types && stats.types.length > 0) {
                message += `- By Type:\n`;
                stats.types.forEach(typeStat => { message += `  - ${typeStat.type || 'N/A'}: ${typeStat.count} units\n`; });
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
            const projectResolution = await this._resolveProject(entities, tenantId, conversationContext);
            const projectContext = projectResolution.project;
            if (projectResolution.error && entities[Entities.PROJECT_NAME] && !entities[Entities.TOWER_ID]) return { ...projectResolution, success: false, conversationContextUpdate: {} };

            const towerResolution = await this._resolveTower(entities, tenantId, projectContext, conversationContext);
            if (towerResolution.error) return { ...towerResolution, success: false, conversationContextUpdate: {} };
            const tower = towerResolution.tower;

            const detailedTower = await towerService.getTowerById(tower._id.toString());
            const construction = detailedTower.construction || { status: 'N/A', completionPercentage: 0 };
            let message = `Construction status for Tower ${detailedTower.name} (Project: ${detailedTower.projectId.name}):\n`;
            message += `- Status: ${construction.status}\n- Completion: ${construction.completionPercentage}%\n`;
            if (construction.estimatedCompletionDate) {
                message += `- Estimated Completion: ${new Date(construction.estimatedCompletionDate).toLocaleDateString()}\n`;
            }
            return {
                success: true,
                message: message,
                data: construction,
                conversationContextUpdate: {
                    activeTowerId: detailedTower._id.toString(),
                    activeTowerName: detailedTower.name,
                    activeProjectId: detailedTower.projectId._id.toString(),
                    activeProjectName: detailedTower.projectId.name
                }
            };
        } catch (error) {
            logger.error('[InventoryHandler.handleGetTowerConstructionStatus] Error:', error);
            return this._handleError(error, "getting tower construction status");
        }
    }

    async handleLockUnit(entities, userId, tenantId, role, conversationContext) {
        try {
            const durationString = entities[Entities.DURATION];
            let minutesToLock = 60;
            if (durationString) {
                const durationParts = durationString.toLowerCase().split(" ");
                const value = parseInt(durationParts[0]);
                if (!isNaN(value)) {
                    if (durationParts.includes("hour") || durationParts.includes("hours")) minutesToLock = value * 60;
                    else if (durationParts.includes("minute") || durationParts.includes("minutes")) minutesToLock = value;
                }
            }

            const projectResolution = await this._resolveProject(entities, tenantId, conversationContext);
            const projectContext = projectResolution.project;
            if (projectResolution.error && entities[Entities.PROJECT_NAME] && !entities[Entities.UNIT_ID] && !entities[Entities.TOWER_ID]) return { ...projectResolution, success: false, conversationContextUpdate: {} };

            const towerResolution = await this._resolveTower(entities, tenantId, projectContext, conversationContext);
            const towerContext = towerResolution.tower;
            if (towerResolution.error && entities[Entities.TOWER_NAME] && !entities[Entities.UNIT_ID]) return { ...towerResolution, success: false, conversationContextUpdate: {} };

            const unitResolution = await this._resolveUnit(entities, tenantId, projectContext, towerContext, conversationContext);
            if (unitResolution.error) return { ...unitResolution, success: false, conversationContextUpdate: {} };
            const unit = unitResolution.unit;

            const lockedUnitDetails = await unitService.lockUnit(unit._id.toString(), userId, minutesToLock);
            const finalLockedUnit = await unitService.getUnitById(lockedUnitDetails._id.toString()); // Re-fetch for populated names

            return {
                success: true,
                message: `Unit ${finalLockedUnit.number} in Tower ${finalLockedUnit.towerId.name}, Project ${finalLockedUnit.projectId.name} has been locked for you for ${minutesToLock} minutes. It will be automatically released at ${new Date(finalLockedUnit.lockedUntil).toLocaleTimeString()}.`,
                data: finalLockedUnit,
                conversationContextUpdate: {
                    activeUnitId: finalLockedUnit._id.toString(), activeUnitNumber: finalLockedUnit.number,
                    activeTowerId: finalLockedUnit.towerId._id.toString(), activeTowerName: finalLockedUnit.towerId.name,
                    activeProjectId: finalLockedUnit.projectId._id.toString(), activeProjectName: finalLockedUnit.projectId.name
                }
            };
        } catch (error) {
            logger.error('[InventoryHandler.handleLockUnit] Error:', error);
            return this._handleError(error, "locking the unit");
        }
    }

    async handleReleaseUnit(entities, userId, tenantId, role, conversationContext) {
        try {
            const projectResolution = await this._resolveProject(entities, tenantId, conversationContext);
            const projectContext = projectResolution.project;
            if (projectResolution.error && entities[Entities.PROJECT_NAME] && !entities[Entities.UNIT_ID] && !entities[Entities.TOWER_ID]) return { ...projectResolution, success: false, conversationContextUpdate: {} };

            const towerResolution = await this._resolveTower(entities, tenantId, projectContext, conversationContext);
            const towerContext = towerResolution.tower;
            if (towerResolution.error && entities[Entities.TOWER_NAME] && !entities[Entities.UNIT_ID]) return { ...towerResolution, success: false, conversationContextUpdate: {} };

            const unitResolution = await this._resolveUnit(entities, tenantId, projectContext, towerContext, conversationContext);
            if (unitResolution.error) return { ...unitResolution, success: false, conversationContextUpdate: {} };
            const unit = unitResolution.unit;

            if (unit.status === 'locked' && unit.lockedBy && unit.lockedBy.toString() !== userId && !['Principal', 'BusinessHead', 'SalesDirector'].includes(role)) {
                return { success: false, message: `Unit ${unit.number} was locked by another user. Only they or a manager can release it.`, data: null, conversationContextUpdate: {} };
            }

            const releasedUnitDetails = await unitService.releaseUnit(unit._id.toString());
            const finalReleasedUnit = await unitService.getUnitById(releasedUnitDetails._id.toString());

            return {
                success: true,
                message: `Unit ${finalReleasedUnit.number} in Tower ${finalReleasedUnit.towerId.name}, Project ${finalReleasedUnit.projectId.name} has been released and is now available.`,
                data: finalReleasedUnit,
                conversationContextUpdate: {
                    activeUnitId: null, activeUnitNumber: null,
                    activeTowerId: finalReleasedUnit.towerId._id.toString(), activeTowerName: finalReleasedUnit.towerId.name,
                    activeProjectId: finalReleasedUnit.projectId._id.toString(), activeProjectName: finalReleasedUnit.projectId.name
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
            message = error.message;
        }
        if (process.env.NODE_ENV === 'development' && !(error instanceof ApiError)) {
            message += ` Details: ${error.message}`;
        }
        logger.error(`[InventoryHandler._handleError] Action: ${actionDescription}, Error: ${error.message}`, { stack: error.stack });
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
