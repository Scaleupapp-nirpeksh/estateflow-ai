// src/services/nlu.engine.service.js

const OpenAI = require('openai');
const config = require('../config');
const logger = require('../utils/logger');
const Intents = require('../ai/definitions/intents.js');
const Entities = require('../ai/definitions/entities.js');

class NLUEngineService {
    constructor() {
        if (!config.llm.apiKey) {
            logger.error('OpenAI API key is not configured.');
            throw new Error('OpenAI API key is missing. Please set OPENAI_API_KEY in your .env file.');
        }
        this.openai = new OpenAI({
            apiKey: config.llm.apiKey,
        });
        this.model = config.llm.model || 'gpt-4o-mini';
        this.maxTokens = config.llm.maxTokens || 200; // Slightly increased for potentially more complex entity extraction
        this.temperature = config.llm.temperature || 0.2; // Keep low for NLU
    }

    /**
     * Understands the user's text and returns a structured NLU output.
     * @param {string} text - The user's input message.
     * @param {Object} conversationContext - The current conversation context.
     * @returns {Promise<Object>} - An object like { intent: string, entities: Object, confidence: number, rawResponse: string }.
     */
    async understand(text, conversationContext = {}) {
        try {
            const prompt = this._buildPrompt(text, conversationContext);

            logger.debug(`[NLUEngineService] Sending prompt to OpenAI: ${prompt}`);

            const completion = await this.openai.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: 'system',
                        content: this._getSystemMessage(),
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                max_tokens: this.maxTokens,
                temperature: this.temperature,
                response_format: { type: "json_object" },
            });

            const rawResponse = completion.choices[0].message.content;
            logger.debug(`[NLUEngineService] Raw response from OpenAI: ${rawResponse}`);

            const parsedNLU = this._parseLLMResponse(rawResponse, text);
            return parsedNLU;

        } catch (error) {
            logger.error('[NLUEngineService] Error calling OpenAI API:', {
                message: error.message,
                stack: error.stack,
            });
            return {
                intent: Intents.UNKNOWN,
                entities: {},
                confidence: 0.0,
                originalText: text,
                error: 'Failed to understand input due to NLU error.',
            };
        }
    }

    /**
     * Constructs the system message for the LLM.
     * This message guides the LLM on its role and expected output format.
     * @returns {string} The system message.
     */
    _getSystemMessage() {
        const intentList = Object.values(Intents).join(', ');
        // Provide more specific examples for entity extraction
        return `You are an NLU (Natural Language Understanding) engine for EstateFlow AI, a real estate management platform.
Your task is to analyze user input and identify the user's intent and any relevant entities.
Respond ONLY with a valid JSON object containing "intent" and "entities".
The "intent" MUST be one of the following: ${intentList}.
The "entities" should be an object where keys are entity types and values are the extracted information.
If you are unsure about the intent, classify it as "${Intents.UNKNOWN}".
Prioritize identifying a specific intent over "${Intents.UNKNOWN}" if possible.

Extract entities accurately. Do not infer or create entities that are not explicitly mentioned or clearly implied.
If a specific value for an entity is not present, do not include the entity key in the JSON.

Entity Extraction Examples:
- User: "Show available 3BHK units in 'Sunrise Towers' under 2 crores"
  Entities: {"${Entities.UNIT_TYPE}": "3BHK", "${Entities.PROJECT_NAME}": "Sunrise Towers", "${Entities.MAX_PRICE}": "20000000"}
- User: "What is the price of unit A-101 in 'Greenwood Estates'?"
  Entities: {"${Entities.UNIT_NUMBER}": "A-101", "${Entities.PROJECT_NAME}": "Greenwood Estates"}
- User: "List all projects in Mumbai"
  Entities: {"${Entities.LOCATION}": "Mumbai"}
- User: "details for unit B-202"
  Entities: {"${Entities.UNIT_NUMBER}": "B-202"}
- User: "show me my new leads"
  Entities: {"${Entities.STATUS_VALUE}": "new"} (implicitly for leads)
- User: "log a call with John Doe about project Alpha"
  Entities: {"${Entities.INTERACTION_TYPE}": "call", "${Entities.LEAD_NAME}": "John Doe", "${Entities.PROJECT_NAME}": "Alpha"}
- User: "lock unit C-501 for 90 minutes"
  Entities: {"${Entities.UNIT_NUMBER}": "C-501", "${Entities.DURATION}": "90 minutes"}

Focus on the primary intent. If the user asks a question that seems out of scope for real estate management, try to map it to "HELP" or "UNKNOWN".
Output JSON format:
{
  "intent": "INTENT_NAME",
  "entities": {
    "ENTITY_TYPE_1": "extracted value 1",
    "ENTITY_TYPE_2": "extracted value 2"
  }
}`;
    }

    _buildPrompt(text, conversationContext) {
        let contextualInfo = '';
        if (conversationContext && conversationContext.activeProjectName) {
            contextualInfo += ` Current active project context: "${conversationContext.activeProjectName}".`;
        }
        if (conversationContext && conversationContext.activeTowerName) {
            contextualInfo += ` Current active tower context: "${conversationContext.activeTowerName}".`;
        }
        if (conversationContext && conversationContext.activeUnitNumber) {
            contextualInfo += ` Current active unit context: "${conversationContext.activeUnitNumber}".`;
        }
        if (conversationContext && conversationContext.activeLeadName) {
            contextualInfo += ` Current active lead context: "${conversationContext.activeLeadName}".`;
        }
        // Add more context as needed

        return `User input: "${text}"\n${contextualInfo}\nIdentify the intent and entities based on the system instructions. Respond with JSON.`;
    }

    _parseLLMResponse(llmResponse, originalText) {
        try {
            const parsedJson = JSON.parse(llmResponse);

            const intent = Object.values(Intents).includes(parsedJson.intent)
                ? parsedJson.intent
                : Intents.UNKNOWN;

            const entities = parsedJson.entities && typeof parsedJson.entities === 'object'
                ? parsedJson.entities
                : {};

            // Basic confidence, can be refined if LLM provides it
            const confidence = intent === Intents.UNKNOWN ? 0.5 : 0.9;

            return {
                intent,
                entities,
                confidence,
                originalText,
                rawResponse: llmResponse,
            };
        } catch (error) {
            logger.warn('[NLUEngineService] Failed to parse LLM JSON response:', {
                response: llmResponse,
                error: error.message,
            });
            return {
                intent: Intents.UNKNOWN,
                entities: {},
                confidence: 0.0,
                originalText,
                error: 'Failed to parse NLU response.',
                rawResponse: llmResponse,
            };
        }
    }
}

module.exports = new NLUEngineService();
