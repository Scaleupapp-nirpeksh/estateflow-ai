// src/ai/actionHandlers/lead.handler.js

const leadService = require('../../services/lead.service.js');
const unitService = require('../../services/unit.service.js'); // For finding units
const userService = require('../../services/user.service.js');
const logger = require('../../utils/logger.js');
const Entities = require('../definitions/entities.js');
const Intents = require('../definitions/intents.js');
const { ApiError } = require('../../utils/error-handler.js');
const mongoose = require('mongoose');

class LeadHandler {

    async _findLead(entities, tenantId, conversationContext, askForClarification = false) {
        const leadIdFromEntity = entities[Entities.LEAD_ID];
        const leadNameFromEntity = entities[Entities.LEAD_NAME];
        const leadPhoneFromEntity = entities[Entities.LEAD_PHONE];
        const leadEmailFromEntity = entities[Entities.LEAD_EMAIL];

        // Priority 1: Explicit ID from current utterance
        if (leadIdFromEntity && mongoose.Types.ObjectId.isValid(leadIdFromEntity)) {
            const lead = await leadService.getLeadById(leadIdFromEntity);
            if (lead && lead.tenantId.toString() === tenantId) return lead;
        }

        // Priority 2: Active lead from context if no specific lead mentioned in current utterance
        if (conversationContext && conversationContext.activeLeadId &&
            mongoose.Types.ObjectId.isValid(conversationContext.activeLeadId) &&
            !leadIdFromEntity && !leadNameFromEntity && !leadPhoneFromEntity && !leadEmailFromEntity) {
            logger.debug(`[LeadHandler._findLead] Using activeLeadId from context: ${conversationContext.activeLeadId}`);
            const lead = await leadService.getLeadById(conversationContext.activeLeadId);
            if (lead && lead.tenantId.toString() === tenantId) return lead;
        }

        // Priority 3: Search by other identifiers
        const searchFilters = { tenantId };
        let searchCriteriaUsed = null;

        if (leadNameFromEntity) {
            searchFilters.$text = { $search: leadNameFromEntity };
            searchCriteriaUsed = `name "${leadNameFromEntity}"`;
        } else if (leadPhoneFromEntity) {
            searchFilters.phone = leadPhoneFromEntity;
            searchCriteriaUsed = `phone "${leadPhoneFromEntity}"`;
        } else if (leadEmailFromEntity) {
            searchFilters.email = leadEmailFromEntity.toLowerCase();
            searchCriteriaUsed = `email "${leadEmailFromEntity}"`;
        }

        if (searchCriteriaUsed) {
            // Fetch more than 1 to check for duplicates if we need to ask for clarification
            const leadsResult = await leadService.getLeads(tenantId, searchFilters, { page: 1, limit: askForClarification ? 5 : 1 });
            if (leadsResult && leadsResult.data.length > 0) {
                if (leadsResult.data.length === 1) {
                    return await leadService.getLeadById(leadsResult.data[0]._id); // Fetch full details
                } else if (askForClarification) {
                    // Multiple leads found, return them for clarification
                    return leadsResult.data;
                }
                // If not asking for clarification, and multiple found, it's ambiguous.
                // For now, we'll let it fall through to null, but this is where disambiguation UI/logic would go.
                logger.warn(`[LeadHandler._findLead] Ambiguous search for ${searchCriteriaUsed}, found ${leadsResult.data.length} leads.`);
                return null; // Or throw an error / return a special object indicating ambiguity
            }
        }
        return null; // No lead found
    }

    async handleGetLeadDetails(entities, userId, tenantId, role, conversationContext) {
        try {
            const lead = await this._findLead(entities, tenantId, conversationContext);

            if (!lead) {
                let leadIdentifier = entities[Entities.LEAD_NAME] || entities[Entities.LEAD_PHONE] || entities[Entities.LEAD_ID] || "the specified lead";
                if (conversationContext?.activeLeadName && !leadIdentifier) leadIdentifier = `lead ${conversationContext.activeLeadName}`;
                return { success: false, message: `I couldn't find ${leadIdentifier}. Please check the name, phone, or ID, or be more specific.`, data: null, conversationContextUpdate: {} };
            }
            if (Array.isArray(lead)) { // Multiple leads found by name/phone/email
                const leadOptions = lead.map(l => `${l.fullName} (Phone: ${l.phone}, ID: ${l._id})`).join('\n - ');
                return { success: false, message: `I found multiple leads matching your description:\n - ${leadOptions}\nPlease specify by ID or a more unique identifier.`, data: lead, conversationContextUpdate: {} };
            }


            if (['JuniorAgent', 'SeniorAgent'].includes(role) && (!lead.assignedTo || lead.assignedTo._id.toString() !== userId)) {
                return { success: false, message: "You do not have permission to view this lead's details.", data: null, conversationContextUpdate: {} };
            }

            let message = `Details for Lead: ${lead.fullName} (ID: ${lead._id})\n`;
            message += `- Status: ${lead.status}\n`;
            message += `- Phone: ${lead.phone}\n`;
            if (lead.email) message += `- Email: ${lead.email}\n`;
            if (lead.alternatePhone) message += `- Alt. Phone: ${lead.alternatePhone}\n`;
            if (lead.assignedTo) message += `- Assigned To: ${lead.assignedTo.name || 'N/A'}\n`;
            if (lead.source) message += `- Source: ${lead.source}\n`;
            if (lead.priority) message += `- Priority: ${lead.priority}\n`;
            if (lead.projectId) message += `- Interested Project: ${lead.projectId.name || lead.projectId}\n`;
            if (lead.preferredUnitTypes && lead.preferredUnitTypes.length > 0) message += `- Preferred Units: ${lead.preferredUnitTypes.join(', ')}\n`;
            if (lead.budget && (lead.budget.min || lead.budget.max)) {
                message += `- Budget: ${lead.budget.min || 'N/A'} - ${lead.budget.max || 'N/A'} ${lead.budget.currency || ''}\n`;
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
                const interested = lead.interestedUnits.map(iu => `Unit ${iu.unitId?.number || iu.unitId} (Interest: ${iu.interestLevel})`).join(', ');
                message += `- Interested Units: ${interested}\n`;
            }

            message += `What would you like to do next with this lead? (e.g., 'add a note', 'log a call', 'update priority to high')`;

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
                // Simplified: assumes projectService can find project by name to get ID
                // In a real scenario, you might need a robust project lookup
                const project = await this._findProjectByName(entities[Entities.PROJECT_NAME], tenantId);
                if (project) filters.projectId = project._id;
                else return { success: false, message: `Could not find project "${entities[Entities.PROJECT_NAME]}".`, data: null, conversationContextUpdate: {} };
            }
            if (entities[Entities.PREFERRED_UNIT_TYPES_LIST]) {
                filters.preferredUnitTypes = entities[Entities.PREFERRED_UNIT_TYPES_LIST].split(',').map(s => s.trim()).filter(s => s);
            }
            if (entities[Entities.BUDGET_MIN]) filters.minBudget = parseFloat(entities[Entities.BUDGET_MIN]);
            if (entities[Entities.BUDGET_MAX]) filters.maxBudget = parseFloat(entities[Entities.BUDGET_MAX]);


            if (entities[Entities.AGENT_NAME] && (role === 'Principal' || role === 'BusinessHead' || role === 'SalesDirector')) {
                const agentUsers = await userService.getUsers(tenantId, { $text: { $search: entities[Entities.AGENT_NAME] } }); // Using text search for name
                if (agentUsers && agentUsers.length === 1) {
                    filters.assignedTo = agentUsers[0]._id;
                } else if (agentUsers && agentUsers.length > 1) {
                    const agentOptions = agentUsers.map(a => `${a.name} (ID: ${a._id})`).join('\n - ');
                    return { success: false, message: `I found multiple agents matching "${entities[Entities.AGENT_NAME]}":\n - ${agentOptions}\nPlease specify by ID.`, data: agentUsers, conversationContextUpdate: {} };
                } else {
                    return { success: false, message: `Could not find agent named "${entities[Entities.AGENT_NAME]}".`, data: null, conversationContextUpdate: {} };
                }
            } else if (entities[Entities.AGENT_ID]) {
                filters.assignedTo = entities[Entities.AGENT_ID];
            }


            const leadsResult = await leadService.getLeads(tenantId, filters, pagination);

            if (!leadsResult || leadsResult.data.length === 0) {
                let message = "I couldn't find any leads matching your criteria.";
                if (intent === Intents.LIST_MY_LEADS) message = "You currently have no leads assigned to you matching these criteria.";
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

            const lead = await this._findLead(entities, tenantId, conversationContext, true); // askForClarification = true
            if (!lead) {
                return { success: false, message: "Which lead do you want to add this note to? Please specify their name, phone, or ID.", data: null, conversationContextUpdate: {} };
            }
            if (Array.isArray(lead)) {
                const leadOptions = lead.map(l => `${l.fullName} (Phone: ${l.phone}, ID: ${l._id})`).join('\n - ');
                return { success: false, message: `I found multiple leads. Which one do you mean for the note?\n - ${leadOptions}\nPlease specify by ID.`, data: lead, conversationContextUpdate: {} };
            }

            if (['JuniorAgent', 'SeniorAgent'].includes(role) && (!lead.assignedTo || lead.assignedTo._id.toString() !== userId)) {
                return { success: false, message: "You can only add notes to leads assigned to you.", data: null, conversationContextUpdate: {} };
            }

            const noteData = { content: noteContent, createdBy: userId };
            const updatedLead = await leadService.addNote(lead._id, noteData);

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

            if (!interactionType) {
                return { success: false, message: "What type of interaction was it (e.g., call, email, meeting)?", data: null, conversationContextUpdate: {} };
            }
            if (!interactionDetails) {
                return { success: false, message: "Please provide some details about the interaction.", data: null, conversationContextUpdate: {} };
            }

            const lead = await this._findLead(entities, tenantId, conversationContext, true);
            if (!lead) {
                return { success: false, message: "Which lead was this interaction with? Please specify their name, phone, or ID.", data: null, conversationContextUpdate: {} };
            }
            if (Array.isArray(lead)) {
                const leadOptions = lead.map(l => `${l.fullName} (Phone: ${l.phone}, ID: ${l._id})`).join('\n - ');
                return { success: false, message: `I found multiple leads. Which one was this interaction for?\n - ${leadOptions}\nPlease specify by ID.`, data: lead, conversationContextUpdate: {} };
            }

            if (['JuniorAgent', 'SeniorAgent'].includes(role) && (!lead.assignedTo || lead.assignedTo._id.toString() !== userId)) {
                return { success: false, message: "You can only log interactions for leads assigned to you.", data: null, conversationContextUpdate: {} };
            }

            const interactionData = {
                type: interactionType.toLowerCase(),
                date: entities[Entities.DATE] ? new Date(entities[Entities.DATE]) : new Date(),
                details: interactionDetails,
                outcome: entities[Entities.INTERACTION_OUTCOME]?.toLowerCase(),
                createdBy: userId,
            };

            const updatedLead = await leadService.addInteraction(lead._id, interactionData);

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
            if (!newStatus) {
                return { success: false, message: "What status would you like to set? (e.g., qualified, contacted)", data: null, conversationContextUpdate: {} };
            }
            const validStatuses = ['new', 'contacted', 'qualified', 'negotiation', 'converted', 'lost'];
            if (!validStatuses.includes(newStatus.toLowerCase())) {
                return { success: false, message: `"${newStatus}" is not a valid lead status. Valid statuses are: ${validStatuses.join(', ')}.`, data: null, conversationContextUpdate: {} };
            }

            const lead = await this._findLead(entities, tenantId, conversationContext, true);
            if (!lead) {
                return { success: false, message: "Which lead's status do you want to update? Please specify their name, phone, or ID.", data: null, conversationContextUpdate: {} };
            }
            if (Array.isArray(lead)) {
                const leadOptions = lead.map(l => `${l.fullName} (Phone: ${l.phone}, ID: ${l._id})`).join('\n - ');
                return { success: false, message: `I found multiple leads. Which one do you want to update the status for?\n - ${leadOptions}\nPlease specify by ID.`, data: lead, conversationContextUpdate: {} };
            }

            if (['JuniorAgent', 'SeniorAgent'].includes(role) && (!lead.assignedTo || lead.assignedTo._id.toString() !== userId)) {
                return { success: false, message: "You can only update the status for leads assigned to you.", data: null, conversationContextUpdate: {} };
            }

            const updatedLead = await leadService.changeLeadStatus(lead._id, newStatus.toLowerCase());

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
            const fieldToUpdate = entities[Entities.LEAD_FIELD_TO_UPDATE]?.toLowerCase().replace(/\s+/g, ''); // Normalize: "alternate phone" -> "alternatephone"
            let fieldValue = entities[Entities.LEAD_FIELD_VALUE]; // General value

            if (!fieldToUpdate) {
                return { success: false, message: "Which field of the lead do you want to update?", data: null, conversationContextUpdate: {} };
            }

            const lead = await this._findLead(entities, tenantId, conversationContext, true);
            if (!lead) {
                return { success: false, message: "Which lead do you want to update? Please specify their name, phone, or ID.", data: null, conversationContextUpdate: {} };
            }
            if (Array.isArray(lead)) {
                const leadOptions = lead.map(l => `${l.fullName} (Phone: ${l.phone}, ID: ${l._id})`).join('\n - ');
                return { success: false, message: `I found multiple leads. Which one do you want to update?\n - ${leadOptions}\nPlease specify by ID.`, data: lead, conversationContextUpdate: {} };
            }

            if (['JuniorAgent', 'SeniorAgent'].includes(role) && (!lead.assignedTo || lead.assignedTo._id.toString() !== userId)) {
                return { success: false, message: "You can only update leads assigned to you.", data: null, conversationContextUpdate: {} };
            }

            const updateData = {};
            let readableFieldName = entities[Entities.LEAD_FIELD_TO_UPDATE]; // For messages

            switch (fieldToUpdate) {
                case 'alternatephone':
                case 'altphone':
                    if (!fieldValue) return { success: false, message: "What is the new alternate phone number?", data: null, conversationContextUpdate: {} };
                    updateData.alternatePhone = fieldValue;
                    readableFieldName = readableFieldName || "alternate phone";
                    break;
                case 'email':
                    if (!fieldValue || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fieldValue)) return { success: false, message: "Please provide a valid email address.", data: null, conversationContextUpdate: {} };
                    updateData.email = fieldValue.toLowerCase();
                    readableFieldName = readableFieldName || "email";
                    break;
                case 'priority':
                    if (!fieldValue || !['low', 'medium', 'high', 'urgent'].includes(fieldValue.toLowerCase())) {
                        return { success: false, message: `Invalid priority "${fieldValue}". Choose from low, medium, high, urgent.`, data: null, conversationContextUpdate: {} };
                    }
                    updateData.priority = fieldValue.toLowerCase();
                    readableFieldName = readableFieldName || "priority";
                    break;
                case 'requirements':
                    fieldValue = entities[Entities.REQUIREMENTS_TEXT] || fieldValue;
                    if (!fieldValue) return { success: false, message: "What are the new requirements for the lead?", data: null, conversationContextUpdate: {} };
                    updateData.requirements = fieldValue;
                    readableFieldName = readableFieldName || "requirements";
                    break;
                case 'budget':
                    const minBudget = entities[Entities.BUDGET_MIN] ? parseFloat(entities[Entities.BUDGET_MIN]) : null;
                    const maxBudget = entities[Entities.BUDGET_MAX] ? parseFloat(entities[Entities.BUDGET_MAX]) : null;
                    const currency = entities[Entities.BUDGET_CURRENCY] || lead.budget?.currency || 'INR';
                    if (minBudget === null && maxBudget === null) {
                        return { success: false, message: "Please specify at least a minimum or maximum budget.", data: null, conversationContextUpdate: {} };
                    }
                    updateData.budget = { min: minBudget, max: maxBudget, currency: currency };
                    readableFieldName = readableFieldName || "budget";
                    break;
                case 'tags':
                    const tagList = entities[Entities.TAG_LIST] || fieldValue;
                    if (!tagList) return { success: false, message: "What tags would you like to add/set?", data: null, conversationContextUpdate: {} };
                    updateData.tags = tagList.split(',').map(tag => tag.trim()).filter(tag => tag);
                    readableFieldName = readableFieldName || "tags";
                    break;
                case 'preferredunittypes':
                case 'unittypes':
                    const unitTypesList = entities[Entities.PREFERRED_UNIT_TYPES_LIST] || fieldValue;
                    if (!unitTypesList) return { success: false, message: "What are the preferred unit types?", data: null, conversationContextUpdate: {} };
                    updateData.preferredUnitTypes = unitTypesList.split(',').map(type => type.trim()).filter(type => type);
                    readableFieldName = readableFieldName || "preferred unit types";
                    break;
                case 'address': // More complex, might need sub-fields or a dedicated intent
                case 'streetaddress':
                case 'city':
                case 'state':
                case 'postalcode':
                case 'country':
                    // For simplicity, allow updating the whole address object or individual parts if LLM extracts them
                    updateData.address = lead.address || {}; // Start with existing or empty
                    if (entities[Entities.ADDRESS_STREET]) updateData.address.street = entities[Entities.ADDRESS_STREET];
                    if (entities[Entities.ADDRESS_CITY]) updateData.address.city = entities[Entities.ADDRESS_CITY];
                    if (entities[Entities.ADDRESS_STATE]) updateData.address.state = entities[Entities.ADDRESS_STATE];
                    if (entities[Entities.ADDRESS_POSTAL_CODE]) updateData.address.postalCode = entities[Entities.ADDRESS_POSTAL_CODE];
                    if (entities[Entities.ADDRESS_COUNTRY]) updateData.address.country = entities[Entities.ADDRESS_COUNTRY];
                    if (fieldToUpdate === 'address' && fieldValue && typeof fieldValue === 'string') { // If user just says "update address to 123 Main St, Anytown"
                        updateData.address.street = fieldValue; // Simplified, LLM needs to be good or use more entities
                    }
                    if (Object.keys(updateData.address).length === 0) {
                        return { success: false, message: "Please specify the address details to update.", data: null, conversationContextUpdate: {} };
                    }
                    readableFieldName = readableFieldName || "address";
                    break;
                default:
                    return { success: false, message: `I cannot update the field "${fieldToUpdate || 'unknown'}". You can ask to update fields like priority, budget, tags, etc.`, data: null, conversationContextUpdate: {} };
            }

            if (Object.keys(updateData).length === 0) {
                return { success: false, message: "No valid field and value provided for update.", data: null, conversationContextUpdate: {} };
            }

            const updatedLead = await leadService.updateLead(lead._id, updateData);

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
            const unitNumber = entities[Entities.UNIT_NUMBER];
            const interestLevel = entities[Entities.INTEREST_LEVEL] || 'medium'; // Default interest
            const notes = entities[Entities.NOTE_CONTENT]; // Optional notes about this interest

            if (!unitNumber) {
                return { success: false, message: "Which unit number are they interested in?", data: null, conversationContextUpdate: {} };
            }

            const lead = await this._findLead(entities, tenantId, conversationContext, true);
            if (!lead) {
                return { success: false, message: "Which lead is interested? Please specify their name, phone, or ID.", data: null, conversationContextUpdate: {} };
            }
            if (Array.isArray(lead)) {
                const leadOptions = lead.map(l => `${l.fullName} (Phone: ${l.phone}, ID: ${l._id})`).join('\n - ');
                return { success: false, message: `I found multiple leads. Which one is interested in the unit?\n - ${leadOptions}\nPlease specify by ID.`, data: lead, conversationContextUpdate: {} };
            }

            // Permission Check
            if (['JuniorAgent', 'SeniorAgent'].includes(role) && (!lead.assignedTo || lead.assignedTo._id.toString() !== userId)) {
                return { success: false, message: "You can only update leads assigned to you.", data: null, conversationContextUpdate: {} };
            }

            // Find the unit to get its ID
            const projectNameFromEntity = entities[Entities.PROJECT_NAME];
            const towerNameFromEntity = entities[Entities.TOWER_NAME];

            let projectIdForUnitSearch = conversationContext.activeProjectId;
            if (projectNameFromEntity) {
                const proj = await this._findProjectByName(projectNameFromEntity, tenantId);
                if (proj) projectIdForUnitSearch = proj._id;
                else return { success: false, message: `Could not find project "${projectNameFromEntity}".`, data: null, conversationContextUpdate: {} };
            }

            let towerIdForUnitSearch = conversationContext.activeTowerId;
            if (towerNameFromEntity && projectIdForUnitSearch) {
                const tower = await this._findTowerByName(towerNameFromEntity, projectIdForUnitSearch, tenantId);
                if (tower) towerIdForUnitSearch = tower._id;
                else return { success: false, message: `Could not find tower "${towerNameFromEntity}" in project "${projectNameFromEntity || conversationContext.activeProjectName}".`, data: null, conversationContextUpdate: {} };
            }

            const unitFilters = { tenantId, number: unitNumber };
            if (towerIdForUnitSearch) unitFilters.towerId = towerIdForUnitSearch;
            else if (projectIdForUnitSearch) unitFilters.projectId = projectIdForUnitSearch;

            const unitsResult = await unitService.getUnits(unitFilters, { page: 1, limit: 1 });
            if (!unitsResult || unitsResult.data.length === 0) {
                return { success: false, message: `Could not find unit number "${unitNumber}". Please specify project or tower if needed.`, data: null, conversationContextUpdate: {} };
            }
            const unitId = unitsResult.data[0]._id;

            const interestData = {
                unitId: unitId,
                interestLevel: interestLevel.toLowerCase(),
                notes: notes
            };

            const updatedLead = await leadService.addInterestedUnit(lead._id, interestData);

            return {
                success: true,
                message: `Marked unit ${unitNumber} as an interested unit for lead ${updatedLead.fullName}.`,
                data: updatedLead,
                conversationContextUpdate: { activeLeadId: updatedLead._id.toString(), activeLeadName: updatedLead.fullName }
            };

        } catch (error) {
            logger.error('[LeadHandler.handleAddInterestedUnitToLead] Error:', error);
            return this._handleError(error, "adding interested unit to lead");
        }
    }

    // Helper to find project by name (simplified)
    async _findProjectByName(projectName, tenantId) {
        const projectsResult = await require('../../services/project.service.js').getProjects(tenantId, { search: projectName, active: true }, { page: 1, limit: 1 });
        if (projectsResult && projectsResult.data.length > 0) {
            return projectsResult.data[0];
        }
        return null;
    }
    // Helper to find tower by name within a project (simplified)
    async _findTowerByName(towerName, projectId, tenantId) {
        const towersResult = await require('../../services/tower.service.js').getTowers(projectId, { name: towerName, active: true }, { page: 1, limit: 1 }); // Assuming getTowers supports name filter
        if (towersResult && towersResult.data.length > 0) {
            return towersResult.data[0];
        }
        return null;
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

module.exports = new LeadHandler();
