// src/utils/csv-parser.js

const Papa = require('papaparse');
const { ApiError } = require('./error-handler');
const logger = require('./logger');

/**
 * Parse CSV file data into JSON
 * @param {Buffer|string} fileData - CSV file data
 * @param {Object} options - Parser options
 * @returns {Promise<Array>} - Parsed data as array of objects
 */
const parseCSV = (fileData, options = {}) => {
    return new Promise((resolve, reject) => {
        // Default options
        const parserOptions = {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true,
            ...options,
            complete: (results) => {
                if (results.errors && results.errors.length > 0) {
                    const errorMessage = results.errors.map(err => `Row ${err.row}: ${err.message}`).join('; ');
                    return reject(new ApiError(400, `CSV parsing errors: ${errorMessage}`));
                }

                resolve(results.data);
            },
            error: (error) => {
                reject(new ApiError(400, `CSV parsing error: ${error.message}`));
            }
        };

        // Parse the CSV data
        Papa.parse(fileData.toString(), parserOptions);
    });
};

/**
 * Validate parsed CSV data against a schema
 * @param {Array} data - Parsed CSV data
 * @param {Object} schema - Validation schema
 * @returns {Object} - Validation results
 */
const validateCSVData = (data, schema) => {
    const results = {
        valid: true,
        errors: [],
        validData: []
    };

    data.forEach((row, index) => {
        const rowErrors = [];

        // Check required fields
        for (const field of schema.required || []) {
            if (!row[field] || row[field].toString().trim() === '') {
                rowErrors.push(`Missing required field: ${field}`);
            }
        }

        // Check field types
        for (const [field, type] of Object.entries(schema.types || {})) {
            if (row[field] !== undefined && row[field] !== null) {
                if (type === 'number' && isNaN(Number(row[field]))) {
                    rowErrors.push(`Field ${field} must be a number`);
                } else if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row[field])) {
                    rowErrors.push(`Field ${field} must be a valid email`);
                } else if (type === 'phone' && !/^[0-9+\-\s()]{7,20}$/.test(row[field])) {
                    rowErrors.push(`Field ${field} must be a valid phone number`);
                } else if (type === 'date' && isNaN(Date.parse(row[field]))) {
                    rowErrors.push(`Field ${field} must be a valid date`);
                } else if (type === 'enum' && schema.enums && schema.enums[field] && !schema.enums[field].includes(row[field])) {
                    rowErrors.push(`Field ${field} must be one of: ${schema.enums[field].join(', ')}`);
                }
            }
        }

        // Add row to results
        if (rowErrors.length > 0) {
            results.valid = false;
            results.errors.push({
                row: index + 2, // +2 because index is 0-based and we account for header row
                errors: rowErrors
            });
        } else {
            results.validData.push(row);
        }
    });

    return results;
};

/**
 * Transform parsed CSV data according to a mapping
 * @param {Array} data - Parsed CSV data
 * @param {Object} mapping - Field mapping
 * @returns {Array} - Transformed data
 */
const transformCSVData = (data, mapping) => {
    return data.map(row => {
        const transformedRow = {};

        // Apply mappings
        for (const [csvField, modelField] of Object.entries(mapping)) {
            if (typeof modelField === 'string') {
                // Simple field mapping
                if (row[csvField] !== undefined) {
                    transformedRow[modelField] = row[csvField];
                }
            } else if (typeof modelField === 'function') {
                // Transform function
                transformedRow[csvField] = modelField(row[csvField], row);
            }
        }

        return transformedRow;
    });
};

module.exports = {
    parseCSV,
    validateCSVData,
    transformCSVData
};