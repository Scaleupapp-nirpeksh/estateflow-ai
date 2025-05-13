// src/ai/definitions/entities.js
// Add new entities and keep existing ones

const Entities = Object.freeze({
    // Common Entities
    PROJECT_NAME: 'PROJECT_NAME',
    TOWER_NAME: 'TOWER_NAME',
    UNIT_NUMBER: 'UNIT_NUMBER',
    UNIT_ID: 'UNIT_ID',
    LEAD_ID: 'LEAD_ID',
    LEAD_NAME: 'LEAD_NAME',
    LEAD_PHONE: 'LEAD_PHONE',
    LEAD_EMAIL: 'LEAD_EMAIL',
    BOOKING_ID: 'BOOKING_ID',
    BOOKING_NUMBER: 'BOOKING_NUMBER',
    AGENT_NAME: 'AGENT_NAME',
    AGENT_ID: 'AGENT_ID',
    CUSTOMER_NAME: 'CUSTOMER_NAME',
    DATE: 'DATE',
    DATE_RANGE: 'DATE_RANGE',
    TIME_PERIOD: 'TIME_PERIOD',
    DURATION: 'DURATION',
    AMOUNT: 'AMOUNT',
    PERCENTAGE: 'PERCENTAGE',
    LOCATION: 'LOCATION', // e.g., City
    STATUS_VALUE: 'STATUS_VALUE',
    FILTER_CRITERIA: 'FILTER_CRITERIA',

    // Inventory Specific
    UNIT_TYPE: 'UNIT_TYPE',
    MIN_PRICE: 'MIN_PRICE',
    MAX_PRICE: 'MAX_PRICE',
    MIN_AREA: 'MIN_AREA',
    MAX_AREA: 'MAX_AREA',
    AREA_TYPE: 'AREA_TYPE',
    AMENITY_TYPE: 'AMENITY_TYPE',
    CONSTRUCTION_STATUS: 'CONSTRUCTION_STATUS',

    // Lead Specific
    NOTE_CONTENT: 'NOTE_CONTENT',
    INTERACTION_TYPE: 'INTERACTION_TYPE',
    INTERACTION_DETAILS: 'INTERACTION_DETAILS',
    INTERACTION_OUTCOME: 'INTERACTION_OUTCOME',
    LEAD_SOURCE: 'LEAD_SOURCE',
    LEAD_PRIORITY: 'LEAD_PRIORITY',
    LEAD_FIELD_TO_UPDATE: 'LEAD_FIELD_TO_UPDATE', // New: e.g., "budget", "alternate phone", "tags"
    LEAD_FIELD_VALUE: 'LEAD_FIELD_VALUE',       // New: The actual value for the field
    BUDGET_MIN: 'BUDGET_MIN',                   // New
    BUDGET_MAX: 'BUDGET_MAX',                   // New
    BUDGET_CURRENCY: 'BUDGET_CURRENCY',         // New
    REQUIREMENTS_TEXT: 'REQUIREMENTS_TEXT',     // New
    TAG_LIST: 'TAG_LIST',                       // New: e.g., "HNI, Investor"
    ADDRESS_STREET: 'ADDRESS_STREET',           // New
    ADDRESS_CITY: 'ADDRESS_CITY',               // New
    ADDRESS_STATE: 'ADDRESS_STATE',             // New
    ADDRESS_POSTAL_CODE: 'ADDRESS_POSTAL_CODE', // New
    ADDRESS_COUNTRY: 'ADDRESS_COUNTRY',         // New
    PREFERRED_UNIT_TYPES_LIST: 'PREFERRED_UNIT_TYPES_LIST', // New
    INTEREST_LEVEL: 'INTEREST_LEVEL', // New for interested units

    // Approval Specific
    JUSTIFICATION_TEXT: 'JUSTIFICATION_TEXT',

    // Document Specific
    DOCUMENT_TYPE: 'DOCUMENT_TYPE',
    KEY_TERM_TO_SEARCH: 'KEY_TERM_TO_SEARCH',
});

module.exports = Entities;
