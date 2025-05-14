// src/ai/actionHandlers/lead.handler.js

const leadService = require('../../services/lead.service.js');
const unitService = require('../../services/unit.service.js');
const userService = require('../../services/user.service.js');
const projectService = require('../../services/project.service.js');
const towerService = require('../../services/tower.service.js');
const logger = require('../../utils/logger.js');
const Entities = require('../definitions/entities.js');
const Intents = require('../definitions/intents.js');
const { ApiError } = require('../../utils/error-handler.js');
const mongoose = require('mongoose');

class LeadHandler {

    _escapeRegex(string) {
        if (typeof string !== 'string') return '';
        return string.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    }

    async _findLeadAdvanced(entities, tenantId, conversationContext) {
        const leadIdFromEntity = entities[Entities.LEAD_ID];
        const leadNameFromEntity = entities[Entities.LEAD_NAME];
        const leadPhoneFromEntity = entities[Entities.LEAD_PHONE];
        const leadEmailFromEntity = entities[Entities.LEAD_EMAIL];

        // Priority 1: Explicit ID from current utterance
        if (leadIdFromEntity && mongoose.Types.ObjectId.isValid(leadIdFromEntity)) {
            logger.debug(`[LeadHandler._findLeadAdvanced] Attempting find by explicit ID: ${leadIdFromEntity}`);
            const lead = await leadService.getLeadById(leadIdFromEntity);
            if (lead && lead.tenantId.toString() === tenantId) return lead;
        }

        // Priority 2: Active lead from context IF no new lead identifiers are present in the current utterance
        const noNewIdentifiersInUtterance = !leadIdFromEntity && !leadNameFromEntity && !leadPhoneFromEntity && !leadEmailFromEntity;
        if (noNewIdentifiersInUtterance && conversationContext?.activeLeadId && mongoose.Types.ObjectId.isValid(conversationContext.activeLeadId)) {
            logger.debug(`[LeadHandler._findLeadAdvanced] Using activeLeadId from context: ${conversationContext.activeLeadId}`);
            const lead = await leadService.getLeadById(conversationContext.activeLeadId);
            if (lead && lead.tenantId.toString() === tenantId) return lead;
        }

        // Priority 3: Search by Phone (should be exact and unique per tenant)
        if (leadPhoneFromEntity) {
            const searchFilters = { tenantId, phone: leadPhoneFromEntity };
            logger.debug(`[LeadHandler._findLeadAdvanced] Searching by exact phone: ${leadPhoneFromEntity}`);
            const leadsResult = await leadService.getLeads(tenantId, searchFilters, { page: 1, limit: 2 });
            if (leadsResult && leadsResult.data.length === 1) return await leadService.getLeadById(leadsResult.data[0]._id);
            if (leadsResult && leadsResult.data.length > 1) {
                logger.warn(`[LeadHandler._findLeadAdvanced] Ambiguous result for phone search (should be unique): ${leadPhoneFromEntity}. Found ${leadsResult.data.length} leads.`);
                return leadsResult.data;
            }
        }

        // Priority 4: Search by Email (should be unique per tenant)
        if (leadEmailFromEntity) {
            const searchFilters = { tenantId, email: leadEmailFromEntity.toLowerCase() };
            logger.debug(`[LeadHandler._findLeadAdvanced] Searching by exact email: ${leadEmailFromEntity}`);
            const leadsResult = await leadService.getLeads(tenantId, searchFilters, { page: 1, limit: 2 });
            if (leadsResult && leadsResult.data.length === 1) return await leadService.getLeadById(leadsResult.data[0]._id);
            if (leadsResult && leadsResult.data.length > 1) {
                logger.warn(`[LeadHandler._findLeadAdvanced] Ambiguous result for email search (should be unique): ${leadEmailFromEntity}. Found ${leadsResult.data.length} leads.`);
                return leadsResult.data;
            }
        }

        // Priority 5: Search by Name (most likely to be ambiguous)
        if (leadNameFromEntity) {
            const searchFilters = {
                tenantId,
                fullName: { $regex: new RegExp(this._escapeRegex(leadNameFromEntity), 'i') }
            };
            logger.debug(`[LeadHandler._findLeadAdvanced] Searching by name regex: ${leadNameFromEntity}`);
            const leadsResult = await leadService.getLeads(tenantId, searchFilters, { page: 1, limit: 5 });
            if (leadsResult && leadsResult.data.length === 1) return await leadService.getLeadById(leadsResult.data[0]._id);
            if (leadsResult && leadsResult.data.length > 0) return leadsResult.data;
        }

        logger.debug(`[LeadHandler._findLeadAdvanced] No lead found matching provided criteria or context.`);
        return null;
    }

    async _resolveLeadForAction(entities, userId, tenantId, role, conversationContext) {
        const leadOrLeads = await this._findLeadAdvanced(entities, tenantId, conversationContext);

        if (!leadOrLeads) {
            let leadIdentifier = entities[Entities.LEAD_NAME] || entities[Entities.LEAD_PHONE] || entities[Entities.LEAD_EMAIL] || entities[Entities.LEAD_ID] || "the specified lead";
            if (conversationContext?.activeLeadName && !Object.values(entities).filter(e => e !== undefined && e !== null && e !== '').length) {
                leadIdentifier = `lead ${conversationContext.activeLeadName}`;
            }
            return { error: true, message: `I couldn't find ${leadIdentifier}. Please be more specific or use an ID.`, data: null, conversationContextUpdate: {} };
        }

        if (Array.isArray(leadOrLeads)) {
            const leadOptions = leadOrLeads.map(l => `${l.fullName} (Phone: ${l.phone}, ID: ${l._id})`).join('\n - ');
            return { error: true, message: `I found multiple leads matching your description:\n - ${leadOptions}\nPlease specify by ID to proceed with the action.`, data: leadOrLeads, conversationContextUpdate: {} };
        }

        const lead = leadOrLeads;

        if (['JuniorAgent', 'SeniorAgent'].includes(role) && (!lead.assignedTo || lead.assignedTo._id.toString() !== userId)) {
            if (conversationContext?.lastNLUOutput?.intent !== Intents.GET_LEAD_DETAILS && conversationContext?.lastNLUOutput?.intent !== Intents.LIST_MY_LEADS) {
                return { error: true, message: `You do not have permission to perform actions on lead ${lead.fullName} as it is not assigned to you.`, data: null, conversationContextUpdate: {} };
            }
        }
        return { error: false, lead };
    }

    async handleGetLeadDetails(entities, userId, tenantId, role, conversationContext) {
        try {
            const resolution = await this._resolveLeadForAction(entities, userId, tenantId, role, conversationContext);
            if (resolution.error) return { ...resolution, success: false };
            const lead = resolution.lead;

            let message = `Details for Lead: ${lead.fullName} (ID: ${lead._id})\n`;
            message += `- Status: ${lead.status}\n`;
            message += `- Phone: ${lead.phone}\n`;
            if (lead.email) message += `- Email: ${lead.email}\n`;
            if (lead.alternatePhone) message += `- Alt. Phone: ${lead.alternatePhone}\n`;
            if (lead.assignedTo) message += `- Assigned To: ${lead.assignedTo.name || 'N/A'}\n`; else message += `- Assigned To: Unassigned\n`;
            if (lead.source) message += `- Source: ${lead.source}\n`;
            if (lead.priority) message += `- Priority: ${lead.priority}\n`;
            if (lead.projectId && lead.projectId.name) message += `- Interested Project: ${lead.projectId.name}\n`;
            else if (lead.projectId) message += `- Interested Project ID: ${lead.projectId}\n`;
            if (lead.preferredUnitTypes && lead.preferredUnitTypes.length > 0) message += `- Preferred Units: ${lead.preferredUnitTypes.join(', ')}\n`;
            if (lead.budget && (lead.budget.min || lead.budget.max)) {
                message += `- Budget: ${this._formatCurrency(lead.budget.min)} - ${this._formatCurrency(lead.budget.max)} ${lead.budget.currency || ''}\n`;
            }
            if (lead.requirements) message += `- Requirements: ${lead.requirements}\n`;
            if (lead.tags && lead.tags.length > 0) message += `- Tags: ${lead.tags.join(', ')}\n`;
            if (lead.address && lead.address.street) message += `- Address: ${lead.address.street}, ${lead.address.city || ''}\n`;

            if (lead.notes && lead.notes.length > 0) {
                const lastNote = lead.notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
                message += `- Last Note: "${lastNote.content}" by ${lastNote.createdBy?.name || 'Unknown'} on ${new Date(lastNote.createdAt).toLocaleDateString()}\n`;
            }
            if (lead.interactions && lead.interactions.length > 0) {
                const lastInteraction = lead.interactions.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
                message += `- Last Interaction: ${lastInteraction.type} on ${new Date(lastInteraction.date).toLocaleDateString()} - "${lastInteraction.details}" (Outcome: ${lastInteraction.outcome || 'N/A'})\n`;
            }
            if (lead.interestedUnits && lead.interestedUnits.length > 0) {
                const interested = lead.interestedUnits.map(iu => {
                    const unitNumber = iu.unitId?.number || iu.unitId?.toString() || 'Unknown Unit';
                    return `Unit ${unitNumber} (Interest: ${iu.interestLevel})`;
                }).join(', ');
                message += `- Interested Units: ${interested}\n`;
            }
            message += `What would you like to do next with this lead?`;

            return {
                success: true,
                message: message,
                data: lead,
                conversationContextUpdate: {
                    activeLeadId: lead._id.toString(),
                    activeLeadName: lead.fullName
                }
            };
        } catch (error) {
            logger.error('[LeadHandler.handleGetLeadDetails] Error:', error);
            return this._handleError(error, "getting lead details");
        }
    }

    async handleListLeads(entities, userId, tenantId, role, conversationContext, intent) {
        try {
            const filters = { tenantId };
            const pagination = { page: 1, limit: 5 };

            if (intent === Intents.LIST_MY_LEADS) {
                filters.assignedTo = userId;
            }

            if (entities[Entities.STATUS_VALUE]) filters.status = entities[Entities.STATUS_VALUE].toLowerCase();
            if (entities[Entities.LEAD_SOURCE]) filters.source = entities[Entities.LEAD_SOURCE].toLowerCase();
            if (entities[Entities.LEAD_PRIORITY]) filters.priority = entities[Entities.LEAD_PRIORITY].toLowerCase();
            if (entities[Entities.PROJECT_NAME]) {
                const project = await this._findProjectByName(entities[Entities.PROJECT_NAME], tenantId);
                if (project) filters.projectId = project._id.toString();
                else return { success: false, message: `Could not find project "${entities[Entities.PROJECT_NAME]}".`, data: null, conversationContextUpdate: {} };
            }
            if (entities[Entities.PREFERRED_UNIT_TYPES_LIST]) {
                filters.preferredUnitTypes = entities[Entities.PREFERRED_UNIT_TYPES_LIST].split(',').map(s => s.trim()).filter(s => s);
            }
            if (entities[Entities.BUDGET_MIN]) filters.minBudget = parseFloat(entities[Entities.BUDGET_MIN]);
            if (entities[Entities.BUDGET_MAX]) filters.maxBudget = parseFloat(entities[Entities.BUDGET_MAX]);

            if (entities[Entities.AGENT_NAME] && (role === 'Principal' || role === 'BusinessHead' || role === 'SalesDirector')) {
                const agentUsers = await userService.getUsers(tenantId, { $text: { $search: entities[Entities.AGENT_NAME] } });
                if (agentUsers && agentUsers.length === 1) {
                    filters.assignedTo = agentUsers[0]._id.toString();
                } else if (agentUsers && agentUsers.length > 1) {
                    const agentOptions = agentUsers.map(a => `${a.name} (ID: ${a._id})`).join('\n - ');
                    return { success: false, message: `I found multiple agents matching "${entities[Entities.AGENT_NAME]}":\n - ${agentOptions}\nPlease specify by ID.`, data: agentUsers, conversationContextUpdate: {} };
                } else {
                    return { success: false, message: `Could not find agent named "${entities[Entities.AGENT_NAME]}".`, data: null, conversationContextUpdate: {} };
                }
            } else if (entities[Entities.AGENT_ID] && mongoose.Types.ObjectId.isValid(entities[Entities.AGENT_ID])) {
                filters.assignedTo = entities[Entities.AGENT_ID];
            }

            const leadsResult = await leadService.getLeads(tenantId, filters, pagination);

            if (!leadsResult || leadsResult.data.length === 0) {
                let message = "I couldn't find any leads matching your criteria.";
                const noFiltersApplied = !Object.keys(entities).some(key =>
                    ![Entities.LEAD_NAME, Entities.LEAD_PHONE, Entities.LEAD_EMAIL, Entities.LEAD_ID].includes(key) && entities[key]
                );
                if (intent === Intents.LIST_MY_LEADS && noFiltersApplied) message = "You currently have no leads assigned to you.";
                else if (intent === Intents.LIST_MY_LEADS) message = "You currently have no leads assigned to you matching these criteria.";
                return { success: true, message: message, data: null, conversationContextUpdate: {} };
            }

            const leadDescriptions = leadsResult.data.map(l =>
                `${l.fullName} (Status: ${l.status}, Prio: ${l.priority || 'N/A'}, Assigned: ${l.assignedTo ? l.assignedTo.name : 'Unassigned'})`
            ).join('\n - ');

            let responseMessage = `Found ${leadsResult.pagination.total} lead(s). Here are the first ${leadsResult.data.length}:\n - ${leadDescriptions}`;
            if (leadsResult.pagination.total > leadsResult.data.length) {
                responseMessage += "\nThere are more. You can ask for details on a specific lead or refine your search.";
            }

            return {
                success: true,
                message: responseMessage,
                data: leadsResult.data,
                conversationContextUpdate: {}
            };
        } catch (error) {
            logger.error(`[LeadHandler.${intent}] Error:`, error);
            return this._handleError(error, "listing leads");
        }
    }

    async handleCreateLeadNote(entities, userId, tenantId, role, conversationContext) {
        try {
            const noteContent = entities[Entities.NOTE_CONTENT];
            if (!noteContent) {
                return { success: false, message: "What note would you like to add?", data: null, conversationContextUpdate: {} };
            }

            const resolution = await this._resolveLeadForAction(entities, userId, tenantId, role, conversationContext);
            if (resolution.error) return { ...resolution, success: false };
            const lead = resolution.lead;

            const noteData = { content: noteContent, createdBy: userId };
            const updatedLead = await leadService.addNote(lead._id.toString(), noteData);

            return {
                success: true,
                message: `Note added to lead ${updatedLead.fullName}.`,
                data: { leadId: updatedLead._id, note: noteContent },
                conversationContextUpdate: { activeLeadId: updatedLead._id.toString(), activeLeadName: updatedLead.fullName }
            };
        } catch (error) {
            logger.error('[LeadHandler.handleCreateLeadNote] Error:', error);
            return this._handleError(error, "adding a note");
        }
    }

    async handleLogLeadInteraction(entities, userId, tenantId, role, conversationContext) {
        try {
            const interactionType = entities[Entities.INTERACTION_TYPE];
            const interactionDetails = entities[Entities.INTERACTION_DETAILS];

            if (!interactionType || !interactionDetails) {
                return { success: false, message: "Please specify the type of interaction and some details.", data: null, conversationContextUpdate: {} };
            }

            const resolution = await this._resolveLeadForAction(entities, userId, tenantId, role, conversationContext);
            if (resolution.error) return { ...resolution, success: false };
            const lead = resolution.lead;

            const interactionData = {
                type: interactionType.toLowerCase(),
                date: entities[Entities.DATE] ? new Date(entities[Entities.DATE]) : new Date(),
                details: interactionDetails,
                outcome: entities[Entities.INTERACTION_OUTCOME]?.toLowerCase(),
                createdBy: userId,
            };
            const updatedLead = await leadService.addInteraction(lead._id.toString(), interactionData);
            return {
                success: true,
                message: `${interactionType.charAt(0).toUpperCase() + interactionType.slice(1)} logged for lead ${updatedLead.fullName}.`,
                data: { leadId: updatedLead._id, interaction: interactionData },
                conversationContextUpdate: { activeLeadId: updatedLead._id.toString(), activeLeadName: updatedLead.fullName }
            };
        } catch (error) {
            logger.error('[LeadHandler.handleLogLeadInteraction] Error:', error);
            return this._handleError(error, "logging an interaction");
        }
    }

    async handleUpdateLeadStatus(entities, userId, tenantId, role, conversationContext) {
        try {
            const newStatus = entities[Entities.STATUS_VALUE];
            if (!newStatus) return { success: false, message: "What status would you like to set? (e.g., qualified, contacted)", data: null, conversationContextUpdate: {} };
            const validStatuses = ['new', 'contacted', 'qualified', 'negotiation', 'converted', 'lost'];
            if (!validStatuses.includes(newStatus.toLowerCase())) {
                return { success: false, message: `"${newStatus}" is not a valid lead status. Valid are: ${validStatuses.join(', ')}.`, data: null, conversationContextUpdate: {} };
            }

            const resolution = await this._resolveLeadForAction(entities, userId, tenantId, role, conversationContext);
            if (resolution.error) return { ...resolution, success: false };
            const lead = resolution.lead;

            const updatedLead = await leadService.changeLeadStatus(lead._id.toString(), newStatus.toLowerCase());
            return {
                success: true,
                message: `Status for lead ${updatedLead.fullName} updated to "${newStatus}".`,
                data: { leadId: updatedLead._id, newStatus: newStatus },
                conversationContextUpdate: { activeLeadId: updatedLead._id.toString(), activeLeadName: updatedLead.fullName }
            };
        } catch (error) {
            logger.error('[LeadHandler.handleUpdateLeadStatus] Error:', error);
            return this._handleError(error, "updating lead status");
        }
    }

    async handleUpdateLeadField(entities, userId, tenantId, role, conversationContext) {
        try {
            const fieldToUpdate = entities[Entities.LEAD_FIELD_TO_UPDATE]?.toLowerCase().replace(/\s+/g, '');
            if (!fieldToUpdate) {
                return { success: false, message: "Which field of the lead do you want to update?", data: null, conversationContextUpdate: {} };
            }

            const resolution = await this._resolveLeadForAction(entities, userId, tenantId, role, conversationContext);
            if (resolution.error) return { ...resolution, success: false };
            const lead = resolution.lead;

            const updateData = {};
            let readableFieldName = entities[Entities.LEAD_FIELD_TO_UPDATE] || fieldToUpdate;
            let fieldValue = entities[Entities.LEAD_FIELD_VALUE];

            switch (fieldToUpdate) {
                case 'alternatephone': case 'altphone':
                    const altPhone = entities[Entities.LEAD_PHONE] || fieldValue;
                    if (!altPhone) return { success: false, message: "What is the new alternate phone number?", data: null, conversationContextUpdate: {} };
                    updateData.alternatePhone = altPhone;
                    readableFieldName = "alternate phone";
                    break;
                case 'email':
                    const emailVal = entities[Entities.LEAD_EMAIL] || fieldValue;
                    if (!emailVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) return { success: false, message: "Please provide a valid email address.", data: null, conversationContextUpdate: {} };
                    updateData.email = emailVal.toLowerCase();
                    readableFieldName = "email";
                    break;
                case 'priority':
                    const priorityVal = entities[Entities.LEAD_PRIORITY] || fieldValue;
                    if (!priorityVal || !['low', 'medium', 'high', 'urgent'].includes(priorityVal.toLowerCase())) {
                        return { success: false, message: `Invalid priority "${priorityVal}". Choose from low, medium, high, urgent.`, data: null, conversationContextUpdate: {} };
                    }
                    updateData.priority = priorityVal.toLowerCase();
                    readableFieldName = "priority";
                    break;
                case 'requirements':
                    const reqText = entities[Entities.REQUIREMENTS_TEXT] || fieldValue;
                    if (!reqText) return { success: false, message: "What are the new requirements for the lead?", data: null, conversationContextUpdate: {} };
                    updateData.requirements = reqText;
                    readableFieldName = "requirements";
                    break;
                case 'budget':
                    const minBudgetStr = entities[Entities.BUDGET_MIN] || (fieldValue?.min);
                    const maxBudgetStr = entities[Entities.BUDGET_MAX] || (fieldValue?.max);
                    const currency = entities[Entities.BUDGET_CURRENCY] || fieldValue?.currency || lead.budget?.currency || 'INR';

                    const minBudget = minBudgetStr ? parseFloat(minBudgetStr) : null;
                    const maxBudget = maxBudgetStr ? parseFloat(maxBudgetStr) : null;

                    if (minBudget === null && maxBudget === null && typeof fieldValue !== 'object') {
                        return { success: false, message: "Please specify at least a minimum or maximum budget.", data: null, conversationContextUpdate: {} };
                    }
                    updateData.budget = {
                        min: isNaN(minBudget) ? null : minBudget,
                        max: isNaN(maxBudget) ? null : maxBudget,
                        currency: currency
                    };
                    readableFieldName = "budget";
                    break;
                case 'tags':
                    const tagList = entities[Entities.TAG_LIST] || fieldValue;
                    if (!tagList) return { success: false, message: "What tags would you like to add/set?", data: null, conversationContextUpdate: {} };
                    updateData.tags = Array.isArray(tagList) ? tagList : tagList.split(',').map(tag => tag.trim()).filter(tag => tag);
                    readableFieldName = "tags";
                    break;
                case 'preferredunittypes': case 'unittypes':
                    const unitTypesList = entities[Entities.PREFERRED_UNIT_TYPES_LIST] || fieldValue;
                    if (!unitTypesList) return { success: false, message: "What are the preferred unit types?", data: null, conversationContextUpdate: {} };
                    updateData.preferredUnitTypes = Array.isArray(unitTypesList) ? unitTypesList : unitTypesList.split(',').map(type => type.trim()).filter(type => type);
                    readableFieldName = "preferred unit types";
                    break;
                default:
                    return { success: false, message: `I cannot update the field "${readableFieldName}". You can ask to update fields like priority, budget, tags, etc.`, data: null, conversationContextUpdate: {} };
            }

            if (Object.keys(updateData).length === 0) {
                return { success: false, message: "No valid field and value provided for update.", data: null, conversationContextUpdate: {} };
            }

            const updatedLead = await leadService.updateLead(lead._id.toString(), updateData);

            return {
                success: true,
                message: `${readableFieldName.charAt(0).toUpperCase() + readableFieldName.slice(1)} for lead ${updatedLead.fullName} has been updated.`,
                data: updatedLead,
                conversationContextUpdate: { activeLeadId: updatedLead._id.toString(), activeLeadName: updatedLead.fullName }
            };
        } catch (error) {
            logger.error('[LeadHandler.handleUpdateLeadField] Error:', error);
            return this._handleError(error, "updating lead field");
        }
    }

    async handleAddInterestedUnitToLead(entities, userId, tenantId, role, conversationContext) {
        try {
            const resolution = await this._resolveLeadForAction(entities, userId, tenantId, role, conversationContext);
            if (resolution.error) return { ...resolution, success: false };
            const lead = resolution.lead;

            // **FIX: Use Entities.UNIT_NUMBER for unitNumber**
            const unitNumber = entities[Entities.UNIT_NUMBER];
            const interestLevel = (entities[Entities.INTEREST_LEVEL] || 'medium').toLowerCase();
            const notes = entities[Entities.NOTE_CONTENT];

            if (!unitNumber) {
                return { success: false, message: "Which unit number are they interested in?", data: null, conversationContextUpdate: {} };
            }
            if (!['low', 'medium', 'high'].includes(interestLevel)) {
                return { success: false, message: `Invalid interest level "${entities[Entities.INTEREST_LEVEL]}". Please use low, medium, or high.`, data: null, conversationContextUpdate: {} };
            }

            const projectForUnit = await this._findProjectForUnit(entities, tenantId, conversationContext);
            const towerForUnit = await this._findTowerForUnit(entities, tenantId, projectForUnit, conversationContext);

            // Pass unitNumber string to _findUnitForInterest
            const unitToAdd = await this._findUnitForInterest(unitNumber, tenantId, projectForUnit, towerForUnit, conversationContext);

            if (!unitToAdd || Array.isArray(unitToAdd)) {
                let unitIdentifier = unitNumber || "the specified unit";
                let contextMessage = "";
                if (towerForUnit && !Array.isArray(towerForUnit)) contextMessage += ` in tower ${towerForUnit.name}`;
                else if (projectForUnit && !Array.isArray(projectForUnit)) contextMessage += ` in project ${projectForUnit.name}`;

                return { success: false, message: `Could not uniquely identify unit "${unitIdentifier}"${contextMessage}. Please specify project or tower if needed, or use the unit ID.`, data: null, conversationContextUpdate: {} };
            }

            const interestData = {
                unitId: unitToAdd._id.toString(),
                interestLevel: interestLevel,
                notes: notes
            };
            const updatedLead = await leadService.addInterestedUnit(lead._id.toString(), interestData);

            const populatedUnit = await unitService.getUnitById(unitToAdd._id.toString());

            return {
                success: true,
                message: `Marked unit ${populatedUnit.number} (Project: ${populatedUnit.projectId.name}, Tower: ${populatedUnit.towerId.name}) as an interested unit for lead ${updatedLead.fullName}.`,
                data: updatedLead,
                conversationContextUpdate: { activeLeadId: updatedLead._id.toString(), activeLeadName: updatedLead.fullName }
            };

        } catch (error) {
            logger.error('[LeadHandler.handleAddInterestedUnitToLead] Error:', error);
            return this._handleError(error, "adding interested unit to lead");
        }
    }

    async handleAssignLeadToAgent(entities, userId, tenantId, role, conversationContext) {
        try {
            if (!['Principal', 'BusinessHead', 'SalesDirector'].includes(role)) {
                return { success: false, message: "You do not have permission to assign leads.", data: null, conversationContextUpdate: {} };
            }

            const agentNameOrId = entities[Entities.AGENT_NAME] || entities[Entities.AGENT_ID];
            if (!agentNameOrId) {
                return { success: false, message: "Which agent do you want to assign the lead to?", data: null, conversationContextUpdate: {} };
            }

            const leadResolution = await this._resolveLeadForAction(entities, userId, tenantId, role, conversationContext);
            if (leadResolution.error && leadResolution.data) {
                return { ...leadResolution, success: false };
            } else if (leadResolution.error) {
                return { ...leadResolution, success: false };
            }
            const lead = leadResolution.lead;

            let agentToAssign;
            if (mongoose.Types.ObjectId.isValid(agentNameOrId)) {
                agentToAssign = await userService.getUserById(agentNameOrId);
            } else {
                const agents = await userService.getUsers(tenantId, { $text: { $search: agentNameOrId }, role: { $in: ['SeniorAgent', 'JuniorAgent', 'SalesDirector', 'BusinessHead', 'Principal'] } });
                if (agents && agents.length === 1) agentToAssign = agents[0];
                else if (agents && agents.length > 1) {
                    const agentOptions = agents.map(a => `${a.name} (Role: ${a.role}, ID: ${a._id})`).join('\n - ');
                    return { success: false, message: `Found multiple users matching "${agentNameOrId}":\n - ${agentOptions}\nPlease specify the agent by their ID.`, data: agents, conversationContextUpdate: {} };
                }
            }

            if (!agentToAssign || agentToAssign.tenantId.toString() !== tenantId) {
                return { success: false, message: `Could not find agent "${agentNameOrId}" in your organization.`, data: null, conversationContextUpdate: {} };
            }
            const assignableRoles = ['Principal', 'BusinessHead', 'SalesDirector', 'SeniorAgent', 'JuniorAgent'];
            if (!assignableRoles.includes(agentToAssign.role)) {
                return { success: false, message: `User ${agentToAssign.name} (Role: ${agentToAssign.role}) cannot be assigned leads directly.`, data: null, conversationContextUpdate: {} };
            }

            const updatedLead = await leadService.assignLead(lead._id.toString(), agentToAssign._id.toString());
            return {
                success: true,
                message: `Lead ${updatedLead.fullName} has been assigned to ${agentToAssign.name}.`,
                data: updatedLead,
                conversationContextUpdate: { activeLeadId: updatedLead._id.toString(), activeLeadName: updatedLead.fullName }
            };
        } catch (error) {
            logger.error('[LeadHandler.handleAssignLeadToAgent] Error:', error);
            return this._handleError(error, "assigning lead");
        }
    }

    async _findProjectByName(projectName, tenantId) {
        const projectsResult = await projectService.getProjects(tenantId, { search: projectName, active: true }, { page: 1, limit: 1 });
        return (projectsResult && projectsResult.data.length > 0) ? projectsResult.data[0] : null;
    }

    async _findTowerByName(towerName, projectId, tenantId) {
        const pId = typeof projectId === 'string' ? projectId : projectId?.toString();
        if (!pId) return null;
        const towersResult = await towerService.getTowers(pId, { name: towerName, active: true }, { page: 1, limit: 1 });
        return (towersResult && towersResult.data.length > 0) ? towersResult.data[0] : null;
    }

    async _findProjectForUnit(entities, tenantId, conversationContext) {
        const projectName = entities[Entities.PROJECT_NAME];
        if (projectName) {
            return await this._findProjectByName(projectName, tenantId);
        }
        if (conversationContext?.activeProjectId && mongoose.Types.ObjectId.isValid(conversationContext.activeProjectId)) {
            return await projectService.getProjectById(conversationContext.activeProjectId);
        }
        return null;
    }

    async _findTowerForUnit(entities, tenantId, projectContext, conversationContext) {
        const towerName = entities[Entities.TOWER_NAME];
        const projectId = projectContext?._id?.toString() || conversationContext?.activeProjectId;
        if (towerName && projectId) {
            return await this._findTowerByName(towerName, projectId, tenantId);
        }
        if (conversationContext?.activeTowerId && mongoose.Types.ObjectId.isValid(conversationContext.activeTowerId)) {
            const towerInContext = await towerService.getTowerById(conversationContext.activeTowerId);
            if (towerInContext && (!projectId || (towerInContext.projectId && towerInContext.projectId._id && towerInContext.projectId._id.toString() === projectId))) {
                return towerInContext;
            }
        }
        return null;
    }

    async _findUnitForInterest(unitNumber, tenantId, projectContext, towerContext, conversationContext) {
        if (!unitNumber) return null;

        const filters = { tenantId, number: unitNumber };
        if (towerContext?._id) filters.towerId = towerContext._id.toString();
        else if (projectContext?._id) filters.projectId = projectContext._id.toString();
        else if (conversationContext?.activeTowerId) filters.towerId = conversationContext.activeTowerId;
        else if (conversationContext?.activeProjectId) filters.projectId = conversationContext.activeProjectId;

        const unitsResult = await unitService.getUnits(filters, { page: 1, limit: 2 }); // limit 2 to check ambiguity
        if (unitsResult && unitsResult.data.length === 1) {
            return await unitService.getUnitById(unitsResult.data[0]._id);
        }
        if (unitsResult && unitsResult.data.length > 1) { // Added to return array for disambiguation
            return unitsResult.data;
        }
        return null;
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
        logger.error(`[LeadHandler._handleError] Action: ${actionDescription}, Error: ${error.message}`, { stack: error.stack });
        return {
            success: false,
            message: message,
            data: null,
            errorDetails: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            conversationContextUpdate: {}
        };
    }
}

module.exports = new LeadHandler();
