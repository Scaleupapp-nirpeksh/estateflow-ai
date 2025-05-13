// src/api/v1/ai.routes.js

const express = require('express');
const { check } = require('express-validator');
const { validate } = require('../middleware/validation.js'); // Corrected path
const { authenticate } = require('../middleware/auth.js'); // Corrected path
const conversationalAIService = require('../../services/conversational.ai.service.js'); // Corrected path
const logger = require('../../utils/logger.js'); // Corrected path

const router = express.Router();

/**
 * @route   POST /api/v1/ai/converse
 * @desc    Send a message to the conversational AI
 * @access  Private (Authenticated users)
 */
router.post(
    '/converse',
    authenticate, // Ensures req.user is populated
    [
        check('userInput').notEmpty().withMessage('userInput is required.').isString(),
        check('conversationContext').optional().isObject(),
        validate,
    ],
    async (req, res, next) => {
        try {
            const { userInput, conversationContext } = req.body;
            const { id: userId, tenantId, role } = req.user; // From authenticate middleware

            if (!userId || !tenantId || !role) {
                logger.warn('[ai.routes] User details missing from authenticated request.');
                return res.status(401).json({
                    status: 'error',
                    message: 'Authentication details are incomplete.',
                });
            }

            const aiResponse = await conversationalAIService.processMessage(
                userId,
                tenantId,
                role,
                userInput,
                conversationContext || {} // Pass empty object if no context
            );

            res.status(200).json({
                status: aiResponse.success ? 'success' : 'partial_success', // Or 'error' based on your preference
                message: aiResponse.message,
                data: aiResponse.data, // Any structured data returned by the action
                conversationContext: aiResponse.conversationContext, // The updated context
                ...(aiResponse.errorDetails && { errorDetails: aiResponse.errorDetails }),
            });
        } catch (error) {
            // The conversationalAIService should ideally handle its internal errors
            // and format them, but this is a fallback.
            logger.error('[ai.routes] Unexpected error in /converse:', error);
            next(error); // Pass to global error handler
        }
    }
);

module.exports = router;

