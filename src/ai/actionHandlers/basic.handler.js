// src/ai/actionHandlers/basic.handler.js

const Intents = require('../definitions/intents.js');

/**
 * Handles basic intents like GREETING, GOODBYE, HELP.
 */
class BasicHandler {
    /**
     * Handles the GREETING intent.
     * @param {Object} entities - Extracted entities (likely none for greeting).
     * @param {string} userId - The ID of the user making the request.
     * @param {string} tenantId - The ID of the tenant.
     * @param {string} role - The role of the user.
     * @returns {Promise<Object>} A result object with a message.
     */
    async handleGreeting(entities, userId, tenantId, role) {
        // In the future, we could fetch user's name here if needed
        // const user = await userService.getUserById(userId);
        // const userName = user ? user.name : 'there';
        const greetings = [
            "Hello! How can I assist you with EstateFlow AI today?",
            "Hi there! What can I do for you in EstateFlow AI?",
            "Welcome to EstateFlow AI! How can I help?"
        ];
        const message = greetings[Math.floor(Math.random() * greetings.length)];
        return {
            success: true,
            message: message,
            data: null,
            conversationContextUpdate: {} // No context update for simple greeting
        };
    }

    /**
     * Handles the GOODBYE intent.
     * @param {Object} entities - Extracted entities.
     * @param {string} userId - The ID of the user.
     * @param {string} tenantId - The ID of the tenant.
     * @param {string} role - The role of the user.
     * @returns {Promise<Object>} A result object with a message.
     */
    async handleGoodbye(entities, userId, tenantId, role) {
        const goodbyes = [
            "Goodbye! Have a great day.",
            "Farewell! Let me know if you need anything else later.",
            "See you later!"
        ];
        const message = goodbyes[Math.floor(Math.random() * goodbyes.length)];
        return {
            success: true,
            message: message,
            data: null,
            conversationContextUpdate: { endConversation: true } // Signal to potentially clear context
        };
    }

    /**
     * Handles the HELP intent.
     * @param {Object} entities - Extracted entities.
     * @param {string} userId - The ID of the user.
     * @param {string} tenantId - The ID of the tenant.
     * @param {string} role - The role of the user.
     * @returns {Promise<Object>} A result object with help information.
     */
    async handleHelp(entities, userId, tenantId, role) {
        // Help message can be tailored based on user role in the future
        let helpMessage = "I can help you with managing your real estate projects in EstateFlow AI.\n";
        helpMessage += "You can ask me to:\n";
        helpMessage += "- Show available units (e.g., 'show available 3bhk in Sunrise Towers')\n";
        helpMessage += "- Get details about a unit (e.g., 'details for unit A-101')\n";
        helpMessage += "- Find leads (e.g., 'find lead John Doe')\n";
        helpMessage += "- Log interactions with leads (e.g., 'log a call with Jane for project Alpha')\n";
        helpMessage += "For more specific help, please try asking what you need, or consult the EstateFlow AI documentation.";

        // Example of role-based help (can be expanded)
        if (role === 'Principal' || role === 'BusinessHead') {
            helpMessage += "\nAs a manager, you can also ask for project summaries or agent performance.";
        } else if (role.includes('Agent')) {
            helpMessage += "\nAs an agent, you can ask about your assigned leads or lock units.";
        }

        return {
            success: true,
            message: helpMessage,
            data: null,
            conversationContextUpdate: {}
        };
    }

    /**
    * Handles the UNKNOWN intent (fallback).
    * @param {Object} entities - Extracted entities.
    * @param {string} originalText - The original user input.
    * @param {string} userId - The ID of the user.
    * @param {string} tenantId - The ID of the tenant.
    * @param {string} role - The role of the user.
    * @returns {Promise<Object>} A result object with a message.
    */
    async handleUnknown(entities, originalText, userId, tenantId, role) {
        const responses = [
            `I'm sorry, I didn't quite understand "${originalText}". Could you please rephrase or try asking for 'help'?`,
            `I'm still learning. I couldn't process your request: "${originalText}". Try asking in a different way, or type 'help'.`,
            `My apologies, I'm not sure how to respond to "${originalText}". For assistance, you can type 'help'.`
        ];
        const message = responses[Math.floor(Math.random() * responses.length)];
        return {
            success: false, // Indicate that the primary request was not successful
            message: message,
            data: null,
            conversationContextUpdate: {}
        };
    }
}

module.exports = new BasicHandler();
