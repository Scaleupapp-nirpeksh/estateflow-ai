// src/ai/definitions/entities.js
// Corrected content for entities.js

/**
 * Defines the types of entities that the NLU engine will extract from user input.
 * These entities provide the parameters for actions and queries.
 */
const Entities = Object.freeze({
    // Common Entities
    PROJECT_NAME: 'PROJECT_NAME',
    TOWER_NAME: 'TOWER_NAME',
    UNIT_NUMBER: 'UNIT_NUMBER', // e.g., "A-101"
    UNIT_ID: 'UNIT_ID', // MongoDB ObjectId
    LEAD_ID: 'LEAD_ID', // MongoDB ObjectId or custom ID
    LEAD_NAME: 'LEAD_NAME',
    LEAD_PHONE: 'LEAD_PHONE',
    LEAD_EMAIL: 'LEAD_EMAIL',
    BOOKING_ID: 'BOOKING_ID', // MongoDB ObjectId
    BOOKING_NUMBER: 'BOOKING_NUMBER', // e.g., "BK-25-05-0001"
    AGENT_NAME: 'AGENT_NAME',
    AGENT_ID: 'AGENT_ID', // MongoDB ObjectId
    CUSTOMER_NAME: 'CUSTOMER_NAME',
    DATE: 'DATE', // Specific date
    DATE_RANGE: 'DATE_RANGE', // e.g., "last week", "next month"
    TIME_PERIOD: 'TIME_PERIOD', // e.g., "this month", "last quarter"
    DURATION: 'DURATION', // e.g., "60 minutes", "2 hours"
    AMOUNT: 'AMOUNT',
    PERCENTAGE: 'PERCENTAGE',
    LOCATION: 'LOCATION', // e.g., "Mumbai", "North Bangalore"
    STATUS_VALUE: 'STATUS_VALUE', // e.g., "available", "qualified", "approved"
    FILTER_CRITERIA: 'FILTER_CRITERIA', // Generic for various filters

    // Inventory Specific
    UNIT_TYPE: 'UNIT_TYPE', // e.g., "3BHK", "Office Space"
    MIN_PRICE: 'MIN_PRICE',
    MAX_PRICE: 'MAX_PRICE',
    MIN_AREA: 'MIN_AREA',
    MAX_AREA: 'MAX_AREA',
    AREA_TYPE: 'AREA_TYPE', // e.g., "carpet area", "super built-up area"
    AMENITY_TYPE: 'AMENITY_TYPE', // e.g., "garden-facing", "sea view"
    CONSTRUCTION_STATUS: 'CONSTRUCTION_STATUS',

    // Lead Specific
    NOTE_CONTENT: 'NOTE_CONTENT',
    INTERACTION_TYPE: 'INTERACTION_TYPE', // e.g., "call", "email"
    INTERACTION_DETAILS: 'INTERACTION_DETAILS',
    INTERACTION_OUTCOME: 'INTERACTION_OUTCOME',
    LEAD_SOURCE: 'LEAD_SOURCE',
    LEAD_PRIORITY: 'LEAD_PRIORITY',

    // Approval Specific
    JUSTIFICATION_TEXT: 'JUSTIFICATION_TEXT',

    // Document Specific
    DOCUMENT_TYPE: 'DOCUMENT_TYPE', // e.g., "cost sheet", "agreement"
    KEY_TERM_TO_SEARCH: 'KEY_TERM_TO_SEARCH', // For searching within document content
});

module.exports = Entities;
