// src/services/conversational.ai.service.js

const logger = require('../utils/logger');
const nluEngineService = require('./nlu.engine.service.js');
const Intents = require('../ai/definitions/intents.js');
const basicHandler = require('../ai/actionHandlers/basic.handler.js');
const inventoryHandler = require('../ai/actionHandlers/inventory.handler.js'); // Added
// const leadHandler = require('../ai/actionHandlers/lead.handler.js'); // Placeholder

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
            // Add other inventory intents here as they are implemented in the handler
            // [Intents.GET_UNIT_PRICE]: inventoryHandler.handleGetUnitPrice.bind(inventoryHandler),
            // [Intents.GET_TOWER_DETAILS]: inventoryHandler.handleGetTowerDetails.bind(inventoryHandler),
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
                // Pass the current updatedContext to the handler
                actionResult = await handlerFunction(nluOutput.entities, userId, tenantId, role, updatedContext);
            } catch (error) {
                logger.error(`[ConversationalAIService] Error executing action for intent ${nluOutput.intent}:`, error);
                actionResult = {
                    success: false,
                    message: `Sorry, I encountered an error while trying to ${nluOutput.intent.toLowerCase().replace(/_/g, ' ')}. Please try again.`,
                    data: null,
                    errorDetails: process.env.NODE_ENV === 'development' ? error.message : undefined,
                    conversationContextUpdate: {} // Reset or specific error context
                };
            }
        } else if (nluOutput.intent === Intents.UNKNOWN || nluOutput.error) {
            actionResult = await basicHandler.handleUnknown(nluOutput.entities, nluOutput.originalText, userId, tenantId, role);
            if (nluOutput.error) {
                actionResult.message = `${nluOutput.error} ${actionResult.message}`;
            }
        } else {
            logger.warn(`[ConversationalAIService] No action handler found for intent: ${nluOutput.intent}`);
            actionResult = {
                success: false,
                message: `I'm not sure how to handle the request for "${nluOutput.intent.toLowerCase().replace(/_/g, ' ')}" yet.`,
                data: null,
                conversationContextUpdate: {}
            };
        }

        // Merge context updates from the action result into the updatedContext
        // The handler function itself returns conversationContextUpdate
        if (actionResult && actionResult.conversationContextUpdate) {
            updatedContext = this._manageContext(updatedContext, actionResult.conversationContextUpdate);
            delete actionResult.conversationContextUpdate; // Remove from final response to client
        }

        logger.info(`[ConversationalAIService] Responding to user ${userId}: "${actionResult.message}"`);
        return { ...actionResult, conversationContext: updatedContext };
    }

    _manageContext(currentContext, updates) {
        // Simple merge. More sophisticated logic can be added for history, summarization, etc.
        // Ensure that specific null/undefined values in updates don't accidentally clear existing context if that's not desired.
        const newContext = { ...currentContext };
        for (const key in updates) {
            if (updates[key] !== undefined) { // Only update if value is provided
                newContext[key] = updates[key];
            }
        }

        if (newContext.endConversation) {
            // For a true reset, return a completely new initial context object
            // For now, just marking it as ended, the client might handle full reset.
            return { conversationEnded: true };
        }
        // Prune old context if it gets too large
        // delete newContext.lastNLUOutput; // Example: don't keep too much history
        return newContext;
    }
}

module.exports = new ConversationalAIService();
