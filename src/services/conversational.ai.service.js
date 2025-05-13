// src/services/conversational.ai.service.js

const logger = require('../utils/logger');
const nluEngineService = require('./nlu.engine.service.js');
const Intents = require('../ai/definitions/intents.js');
const basicHandler = require('../ai/actionHandlers/basic.handler.js');
const inventoryHandler = require('../ai/actionHandlers/inventory.handler.js');
const leadHandler = require('../ai/actionHandlers/lead.handler.js');

class ConversationalAIService {
    constructor() {
        this.intentToActionMap = {
            [Intents.GREETING]: basicHandler.handleGreeting.bind(basicHandler),
            [Intents.GOODBYE]: basicHandler.handleGoodbye.bind(basicHandler),
            [Intents.HELP]: basicHandler.handleHelp.bind(basicHandler),

            // Inventory Intents
            [Intents.LIST_PROJECTS]: inventoryHandler.handleListProjects.bind(inventoryHandler),
            [Intents.GET_PROJECT_DETAILS]: inventoryHandler.handleGetProjectDetails.bind(inventoryHandler),
            [Intents.GET_AVAILABLE_UNITS]: inventoryHandler.handleGetAvailableUnits.bind(inventoryHandler),
            [Intents.GET_UNIT_DETAILS]: inventoryHandler.handleGetUnitDetails.bind(inventoryHandler),
            [Intents.GET_UNIT_PRICE]: inventoryHandler.handleGetUnitPrice.bind(inventoryHandler),
            [Intents.GET_TOWER_DETAILS]: inventoryHandler.handleGetTowerDetails.bind(inventoryHandler),
            [Intents.GET_PROJECT_UNIT_STATS]: inventoryHandler.handleGetProjectUnitStats.bind(inventoryHandler),
            [Intents.GET_TOWER_CONSTRUCTION_STATUS]: inventoryHandler.handleGetTowerConstructionStatus.bind(inventoryHandler),
            [Intents.LOCK_UNIT]: inventoryHandler.handleLockUnit.bind(inventoryHandler),
            [Intents.RELEASE_UNIT]: inventoryHandler.handleReleaseUnit.bind(inventoryHandler),

            // Lead Intents
            [Intents.GET_LEAD_DETAILS]: leadHandler.handleGetLeadDetails.bind(leadHandler),
            [Intents.LIST_MY_LEADS]: (entities, userId, tenantId, role, context) => leadHandler.handleListLeads(entities, userId, tenantId, role, context, Intents.LIST_MY_LEADS),
            [Intents.LIST_LEADS_BY_CRITERIA]: (entities, userId, tenantId, role, context) => leadHandler.handleListLeads(entities, userId, tenantId, role, context, Intents.LIST_LEADS_BY_CRITERIA),
            [Intents.CREATE_LEAD_NOTE]: leadHandler.handleCreateLeadNote.bind(leadHandler),
            [Intents.LOG_LEAD_INTERACTION]: leadHandler.handleLogLeadInteraction.bind(leadHandler),
            [Intents.UPDATE_LEAD_STATUS]: leadHandler.handleUpdateLeadStatus.bind(leadHandler),
            [Intents.UPDATE_LEAD_FIELD]: leadHandler.handleUpdateLeadField.bind(leadHandler),
            [Intents.ADD_INTERESTED_UNIT_TO_LEAD]: leadHandler.handleAddInterestedUnitToLead.bind(leadHandler),
            [Intents.ASSIGN_LEAD_TO_AGENT]: leadHandler.handleAssignLeadToAgent.bind(leadHandler),
        };
    }

    async _notImplementedHandler(intentName, entities, userId, tenantId, role, conversationContext) {
        logger.warn(`[ConversationalAIService] Intent ${intentName} is defined but its handler is not yet implemented or mapped correctly.`);
        return {
            success: false,
            message: `I understand you want to perform an action related to '${intentName.toLowerCase().replace(/_/g, ' ')}', but I'm not fully equipped to do that yet.`,
            data: null,
            conversationContextUpdate: {}
        };
    }

    async processMessage(userId, tenantId, role, userMessage, conversationContext = {}) {
        logger.info(`[ConversationalAIService] Processing message for user ${userId} in tenant ${tenantId}: "${userMessage}"`);
        logger.debug('[ConversationalAIService] Current context:', conversationContext);

        if (!userMessage || userMessage.trim() === '') {
            return {
                success: false,
                message: "Please provide a message.",
                data: null,
                conversationContextUpdate: conversationContext,
            };
        }

        const nluOutput = await nluEngineService.understand(userMessage, conversationContext);
        logger.debug('[ConversationalAIService] NLU Output:', nluOutput);

        let updatedContext = this._manageContext(conversationContext, {
            lastUserMessage: userMessage,
            lastNLUOutput: { intent: nluOutput.intent, entities: nluOutput.entities },
        });

        let actionResult;
        const handlerFunction = this.intentToActionMap[nluOutput.intent];

        if (handlerFunction) {
            try {
                actionResult = await handlerFunction(nluOutput.entities, userId, tenantId, role, updatedContext);
            } catch (error) {
                logger.error(`[ConversationalAIService] Error executing action for intent ${nluOutput.intent}:`, error);
                actionResult = {
                    success: false,
                    message: `Sorry, I encountered an error while trying to ${nluOutput.intent.toLowerCase().replace(/_/g, ' ')}. Please try again.`,
                    data: null,
                    errorDetails: process.env.NODE_ENV === 'development' ? error.message : undefined,
                    conversationContextUpdate: {}
                };
            }
        } else if (nluOutput.intent === Intents.UNKNOWN || nluOutput.error) {
            actionResult = await basicHandler.handleUnknown(nluOutput.entities, nluOutput.originalText, userId, tenantId, role);
            if (nluOutput.error) {
                actionResult.message = `${nluOutput.error} ${actionResult.message}`;
            }
        } else {
            logger.warn(`[ConversationalAIService] No action handler found for intent: ${nluOutput.intent}`);
            actionResult = await this._notImplementedHandler(nluOutput.intent, nluOutput.entities, userId, tenantId, role, updatedContext);
        }

        if (actionResult && actionResult.conversationContextUpdate) {
            updatedContext = this._manageContext(updatedContext, actionResult.conversationContextUpdate);
            delete actionResult.conversationContextUpdate;
        }

        logger.info(`[ConversationalAIService] Responding to user ${userId}: "${actionResult.message}"`);
        return { ...actionResult, conversationContext: updatedContext };
    }

    _manageContext(currentContext, updates) {
        const newContext = { ...currentContext };
        for (const key in updates) {
            if (updates[key] !== undefined) {
                if (updates[key] === null && newContext[key] !== undefined) {
                    delete newContext[key];
                } else if (updates[key] !== null) {
                    newContext[key] = updates[key];
                }
            }
        }
        if (newContext.endConversation) {
            return { conversationEnded: true };
        }
        // Only keep relevant context for a few turns or based on active entities
        const CONTEXT_KEYS_TO_KEEP = ['activeProjectId', 'activeProjectName', 'activeTowerId', 'activeTowerName', 'activeUnitId', 'activeUnitNumber', 'activeLeadId', 'activeLeadName', 'lastNLUOutput', 'lastUserMessage'];
        const prunedContext = {};
        CONTEXT_KEYS_TO_KEEP.forEach(key => {
            if (newContext[key] !== undefined) {
                prunedContext[key] = newContext[key];
            }
        });
        // If conversation ended, just return that signal
        if (newContext.conversationEnded) return { conversationEnded: true };

        return prunedContext;
    }
}

module.exports = new ConversationalAIService();
