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
        this.maxTokens = config.llm.maxTokens || 250;
        this.temperature = config.llm.temperature || 0.1;
    }

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

    _getSystemMessage() {
        const intentList = Object.values(Intents).join(', ');
        return `You are an NLU (Natural Language Understanding) engine for EstateFlow AI, a real estate management platform.
Your task is to analyze user input and identify the user's intent and any relevant entities.
Respond ONLY with a valid JSON object containing "intent" and "entities".
The "intent" MUST be one of the following: ${intentList}.
The "entities" should be an object where keys are entity types and values are the extracted information.
If you are unsure about the intent, classify it as "${Intents.UNKNOWN}".
Prioritize identifying a specific intent over "${Intents.UNKNOWN}" if possible.

Extract ALL relevant entities accurately. Do not infer or create entities that are not explicitly mentioned or clearly implied.
If a specific value for an entity is not present, do not include the entity key in the JSON.
A unit identifier like "A-101" should be extracted as "${Entities.UNIT_NUMBER}", not "${Entities.UNIT_ID}". "${Entities.UNIT_ID}" is reserved for MongoDB ObjectIds.

Entity Extraction Examples:
- User: "Show available 3BHK units in 'Sunrise Towers' under 2 crores"
  Entities: {"${Entities.UNIT_TYPE}": "3BHK", "${Entities.PROJECT_NAME}": "Sunrise Towers", "${Entities.MAX_PRICE}": "20000000"}
- User: "What is the sales performance for last month?"
  Entities: {"${Entities.TIME_PERIOD}": "last month"}
- User: "update lead John Doe's priority to high"
  Entities: {"${Entities.LEAD_NAME}": "John Doe", "${Entities.LEAD_FIELD_TO_UPDATE}": "priority", "${Entities.LEAD_FIELD_VALUE}": "high"}
- User: "Mark unit 'A-1202' in Tower A of 25 Downtown Heights Premium as interested for lead Jane Johnson with high interest. Note: she loved the master bedroom."
  Entities: {"${Entities.UNIT_NUMBER}": "A-1202", "${Entities.TOWER_NAME}": "Tower A", "${Entities.PROJECT_NAME}": "25 Downtown Heights Premium", "${Entities.LEAD_NAME}": "Jane Johnson", "${Entities.INTEREST_LEVEL}": "high", "${Entities.NOTE_CONTENT}": "she loved the master bedroom"}

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
        if (conversationContext?.activeProjectName) {
            contextualInfo += ` Current active project context: "${conversationContext.activeProjectName}" (ID: ${conversationContext.activeProjectId || 'unknown'}).`;
        }
        if (conversationContext?.activeTowerName) {
            contextualInfo += ` Current active tower context: "${conversationContext.activeTowerName}" (ID: ${conversationContext.activeTowerId || 'unknown'}).`;
        }
        if (conversationContext?.activeUnitNumber) {
            contextualInfo += ` Current active unit context: "${conversationContext.activeUnitNumber}" (ID: ${conversationContext.activeUnitId || 'unknown'}).`;
        }
        if (conversationContext?.activeLeadName) {
            contextualInfo += ` Current active lead context: "${conversationContext.activeLeadName}" (ID: ${conversationContext.activeLeadId || 'unknown'}).`;
        }
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
            const confidence = intent === Intents.UNKNOWN ? 0.5 : 0.9;
            return { intent, entities, confidence, originalText, rawResponse: llmResponse };
        } catch (error) {
            logger.warn('[NLUEngineService] Failed to parse LLM JSON response:', { response: llmResponse, error: error.message });
            return { intent: Intents.UNKNOWN, entities: {}, confidence: 0.0, originalText, error: 'Failed to parse NLU response.', rawResponse: llmResponse };
        }
    }
}

module.exports = new NLUEngineService();
