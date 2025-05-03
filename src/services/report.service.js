// src/services/report.service.js

const mongoose = require('mongoose');

// Fix the import path to reference individual models directly
const Booking = require('../models/booking.model');
const Lead = require('../models/lead.model');
const Unit = require('../models/unit.model');
const PaymentSchedule = require('../models/payment-schedule.model');
const User = require('../models/user.model');
const logger = require('../utils/logger');

const fs = require('fs');
const path = require('path');
const { parse } = require('json2csv');
const AWS = require('aws-sdk');

// Configure AWS S3
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});

/**
 * Generate sales report
 * @param {string} tenantId - Tenant ID
 * @param {Object} options - Report options
 * @returns {Promise<Object>} - Report data and URL
 */
const generateSalesReport = async (tenantId, options = {}) => {
    try {
        // Build date range match condition
        const dateMatch = {};

        if (options.startDate && options.endDate) {
            dateMatch.createdAt = {
                $gte: new Date(options.startDate),
                $lte: new Date(options.endDate)
            };
        } else {
            // Default to last 30 days
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 30);

            dateMatch.createdAt = {
                $gte: startDate,
                $lte: endDate
            };
        }

        // Build project and tower filters
        const projectTowerMatch = {};

        if (options.projectId) {
            projectTowerMatch.projectId = mongoose.Types.ObjectId(options.projectId);
        }

        if (options.towerId) {
            projectTowerMatch.towerId = mongoose.Types.ObjectId(options.towerId);
        }

        // Get all bookings
        const bookings = await Booking.aggregate([
            {
                $match: {
                    tenantId: mongoose.Types.ObjectId(tenantId),
                    ...dateMatch
                }
            },
            {
                $lookup: {
                    from: 'units',
                    localField: 'unitId',
                    foreignField: '_id',
                    as: 'unit'
                }
            },
            {
                $unwind: '$unit'
            },
            {
                $match: projectTowerMatch
            },
            {
                $lookup: {
                    from: 'towers',
                    localField: 'unit.towerId',
                    foreignField: '_id',
                    as: 'tower'
                }
            },
            {
                $unwind: '$tower'
            },
            {
                $lookup: {
                    from: 'projects',
                    localField: 'unit.projectId',
                    foreignField: '_id',
                    as: 'project'
                }
            },
            {
                $unwind: '$project'
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'createdBy',
                    foreignField: '_id',
                    as: 'agent'
                }
            },
            {
                $unwind: {
                    path: '$agent',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    _id: 1,
                    bookingNumber: 1,
                    bookingDate: '$createdAt',
                    status: 1,
                    customerName: 1,
                    customerEmail: 1,
                    customerPhone: 1,
                    projectName: '$project.name',
                    towerName: '$tower.name',
                    unitNumber: '$unit.number',
                    unitType: '$unit.type',
                    basePrice: 1,
                    totalBookingAmount: 1,
                    agentName: { $ifNull: ['$agent.name', 'Unknown'] }
                }
            },
            {
                $sort: { createdAt: -1 }
            }
        ]);

        // Create CSV data
        const fields = [
            { label: 'Booking Number', value: 'bookingNumber' },
            { label: 'Booking Date', value: row => new Date(row.bookingDate).toLocaleDateString() },
            { label: 'Status', value: 'status' },
            { label: 'Customer Name', value: 'customerName' },
            { label: 'Customer Email', value: 'customerEmail' },
            { label: 'Customer Phone', value: 'customerPhone' },
            { label: 'Project', value: 'projectName' },
            { label: 'Tower', value: 'towerName' },
            { label: 'Unit Number', value: 'unitNumber' },
            { label: 'Unit Type', value: 'unitType' },
            { label: 'Base Price', value: 'basePrice' },
            { label: 'Total Amount', value: 'totalBookingAmount' },
            { label: 'Agent', value: 'agentName' }
        ];

        const csv = parse(bookings, { fields });

        // Create a temporary file
        const tempDir = path.join(__dirname, '../../temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const timestamp = Date.now();
        const filename = `sales_report_${timestamp}.csv`;
        const tempFilePath = path.join(tempDir, filename);

        // Write CSV to file
        fs.writeFileSync(tempFilePath, csv);

        // Upload to S3
        const s3Path = `reports/${tenantId}/sales/${filename}`;

        const s3Params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: s3Path,
            Body: fs.readFileSync(tempFilePath),
            ContentType: 'text/csv',
            ACL: 'private'
        };

        const s3Result = await s3.upload(s3Params).promise();

        // Generate signed URL for download
        const signedUrl = s3.getSignedUrl('getObject', {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: s3Path,
            Expires: 3600 // 1 hour
        });

        // Clean up temp file
        fs.unlinkSync(tempFilePath);

        // Return report data
        return {
            reportType: 'sales',
            filename,
            url: s3Result.Location,
            signedUrl,
            recordCount: bookings.length,
            generatedAt: new Date(),
            filters: {
                startDate: options.startDate,
                endDate: options.endDate,
                projectId: options.projectId,
                towerId: options.towerId
            }
        };
    } catch (error) {
        logger.error('Error generating sales report', { error, tenantId });
        throw error;
    }
};

/**
 * Generate collections report
 * @param {string} tenantId - Tenant ID
 * @param {Object} options - Report options
 * @returns {Promise<Object>} - Report data and URL
 */
const generateCollectionsReport = async (tenantId, options = {}) => {
    try {
        // Build project and tower filters
        const projectTowerMatch = {};

        if (options.projectId) {
            projectTowerMatch['booking.projectId'] = mongoose.Types.ObjectId(options.projectId);
        }

        if (options.towerId) {
            projectTowerMatch['booking.towerId'] = mongoose.Types.ObjectId(options.towerId);
        }

        // Filter by status
        const statusFilter = {};
        if (options.status && options.status !== 'all') {
            if (options.status === 'overdue') {
                statusFilter['installments.status'] = 'overdue';
            } else if (options.status === 'paid') {
                statusFilter['installments.status'] = 'paid';
            } else if (options.status === 'pending') {
                statusFilter['installments.status'] = 'pending';
            }
        }

        // Get all installments
        const installments = await PaymentSchedule.aggregate([
            {
                $match: {
                    tenantId: mongoose.Types.ObjectId(tenantId)
                }
            },
            {
                $lookup: {
                    from: 'bookings',
                    localField: 'bookingId',
                    foreignField: '_id',
                    as: 'booking'
                }
            },
            {
                $unwind: '$booking'
            },
            {
                $match: projectTowerMatch
            },
            {
                $lookup: {
                    from: 'units',
                    localField: 'booking.unitId',
                    foreignField: '_id',
                    as: 'unit'
                }
            },
            {
                $unwind: '$unit'
            },
            {
                $lookup: {
                    from: 'towers',
                    localField: 'unit.towerId',
                    foreignField: '_id',
                    as: 'tower'
                }
            },
            {
                $unwind: '$tower'
            },
            {
                $lookup: {
                    from: 'projects',
                    localField: 'unit.projectId',
                    foreignField: '_id',
                    as: 'project'
                }
            },
            {
                $unwind: '$project'
            },
            {
                $unwind: '$installments'
            },
            {
                $match: statusFilter
            },
            {
                $project: {
                    _id: 0,
                    bookingId: '$booking._id',
                    bookingNumber: '$booking.bookingNumber',
                    customerName: '$booking.customerName',
                    customerPhone: '$booking.customerPhone',
                    projectName: '$project.name',
                    towerName: '$tower.name',
                    unitNumber: '$unit.number',
                    installmentName: '$installments.name',
                    installmentAmount: '$installments.amount',
                    amountPaid: { $ifNull: ['$installments.amountPaid', 0] },
                    amountDue: {
                        $subtract: [
                            '$installments.amount',
                            { $ifNull: ['$installments.amountPaid', 0] }
                        ]
                    },
                    dueDate: '$installments.dueDate',
                    status: '$installments.status',
                    paymentDate: '$installments.paymentDate',
                    daysOverdue: {
                        $cond: [
                            {
                                $and: [
                                    { $lt: ['$installments.dueDate', new Date()] },
                                    {
                                        $gt: [
                                            {
                                                $subtract: [
                                                    '$installments.amount',
                                                    { $ifNull: ['$installments.amountPaid', 0] }
                                                ]
                                            },
                                            0
                                        ]
                                    }
                                ]
                            },
                            {
                                $round: {
                                    $divide: [
                                        { $subtract: [new Date(), '$installments.dueDate'] },
                                        (1000 * 60 * 60 * 24)
                                    ]
                                }
                            },
                            0
                        ]
                    }
                }
            },
            {
                $sort: { dueDate: 1 }
            }
        ]);

        // Create CSV data
        const fields = [
            { label: 'Booking Number', value: 'bookingNumber' },
            { label: 'Customer Name', value: 'customerName' },
            { label: 'Customer Phone', value: 'customerPhone' },
            { label: 'Project', value: 'projectName' },
            { label: 'Tower', value: 'towerName' },
            { label: 'Unit Number', value: 'unitNumber' },
            { label: 'Installment', value: 'installmentName' },
            { label: 'Amount', value: 'installmentAmount' },
            { label: 'Amount Paid', value: 'amountPaid' },
            { label: 'Amount Due', value: 'amountDue' },
            { label: 'Due Date', value: row => row.dueDate ? new Date(row.dueDate).toLocaleDateString() : 'N/A' },
            { label: 'Status', value: 'status' },
            { label: 'Payment Date', value: row => row.paymentDate ? new Date(row.paymentDate).toLocaleDateString() : 'N/A' },
            { label: 'Days Overdue', value: 'daysOverdue' }
        ];

        const csv = parse(installments, { fields });

        // Create a temporary file
        const tempDir = path.join(__dirname, '../../temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const timestamp = Date.now();
        const filename = `collections_report_${timestamp}.csv`;
        const tempFilePath = path.join(tempDir, filename);

        // Write CSV to file
        fs.writeFileSync(tempFilePath, csv);

        // Upload to S3
        const s3Path = `reports/${tenantId}/collections/${filename}`;

        const s3Params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: s3Path,
            Body: fs.readFileSync(tempFilePath),
            ContentType: 'text/csv',
            ACL: 'private'
        };

        const s3Result = await s3.upload(s3Params).promise();

        // Generate signed URL for download
        const signedUrl = s3.getSignedUrl('getObject', {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: s3Path,
            Expires: 3600 // 1 hour
        });

        // Clean up temp file
        fs.unlinkSync(tempFilePath);

        // Return report data
        return {
            reportType: 'collections',
            filename,
            url: s3Result.Location,
            signedUrl,
            recordCount: installments.length,
            generatedAt: new Date(),
            filters: {
                projectId: options.projectId,
                towerId: options.towerId,
                status: options.status
            }
        };
    } catch (error) {
        logger.error('Error generating collections report', { error, tenantId });
        throw error;
    }
};

/**
 * Generate inventory report
 * @param {string} tenantId - Tenant ID
 * @param {Object} options - Report options
 * @returns {Promise<Object>} - Report data and URL
 */
const generateInventoryReport = async (tenantId, options = {}) => {
    try {
        // Build project and tower filters
        const projectTowerMatch = {};

        if (options.projectId) {
            projectTowerMatch.projectId = mongoose.Types.ObjectId(options.projectId);
        }

        if (options.towerId) {
            projectTowerMatch.towerId = mongoose.Types.ObjectId(options.towerId);
        }

        // Filter by status
        if (options.status && options.status !== 'all') {
            projectTowerMatch.status = options.status;
        }

        // Get all units
        const units = await Unit.aggregate([
            {
                $match: {
                    tenantId: mongoose.Types.ObjectId(tenantId),
                    ...projectTowerMatch
                }
            },
            {
                $lookup: {
                    from: 'towers',
                    localField: 'towerId',
                    foreignField: '_id',
                    as: 'tower'
                }
            },
            {
                $unwind: '$tower'
            },
            {
                $lookup: {
                    from: 'projects',
                    localField: 'projectId',
                    foreignField: '_id',
                    as: 'project'
                }
            },
            {
                $unwind: '$project'
            },
            {
                $project: {
                    _id: 1,
                    unitNumber: '$number',
                    type: 1,
                    floor: 1,
                    facing: 1,
                    carpetArea: 1,
                    builtUpArea: 1,
                    superBuiltUpArea: 1,
                    basePrice: 1,
                    status: 1,
                    projectName: '$project.name',
                    towerName: '$tower.name',
                    pricePerSqFt: {
                        $round: {
                            $cond: [
                                { $eq: ['$superBuiltUpArea', 0] },
                                0,
                                { $divide: ['$basePrice', '$superBuiltUpArea'] }
                            ]
                        }
                    }
                }
            },
            {
                $sort: {
                    projectName: 1,
                    towerName: 1,
                    floor: 1,
                    unitNumber: 1
                }
            }
        ]);

        // Create CSV data
        const fields = [
            { label: 'Project', value: 'projectName' },
            { label: 'Tower', value: 'towerName' },
            { label: 'Unit Number', value: 'unitNumber' },
            { label: 'Type', value: 'type' },
            { label: 'Floor', value: 'floor' },
            { label: 'Facing', value: 'facing' },
            { label: 'Carpet Area (sq.ft)', value: 'carpetArea' },
            { label: 'Built-up Area (sq.ft)', value: 'builtUpArea' },
            { label: 'Super Built-up Area (sq.ft)', value: 'superBuiltUpArea' },
            { label: 'Base Price', value: 'basePrice' },
            { label: 'Price Per Sq.Ft', value: 'pricePerSqFt' },
            { label: 'Status', value: 'status' }
        ];

        const csv = parse(units, { fields });

        // Create a temporary file
        const tempDir = path.join(__dirname, '../../temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const timestamp = Date.now();
        const filename = `inventory_report_${timestamp}.csv`;
        const tempFilePath = path.join(tempDir, filename);

        // Write CSV to file
        fs.writeFileSync(tempFilePath, csv);

        // Upload to S3
        const s3Path = `reports/${tenantId}/inventory/${filename}`;

        const s3Params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: s3Path,
            Body: fs.readFileSync(tempFilePath),
            ContentType: 'text/csv',
            ACL: 'private'
        };

        const s3Result = await s3.upload(s3Params).promise();

        // Generate signed URL for download
        const signedUrl = s3.getSignedUrl('getObject', {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: s3Path,
            Expires: 3600 // 1 hour
        });

        // Clean up temp file
        fs.unlinkSync(tempFilePath);

        // Return report data
        return {
            reportType: 'inventory',
            filename,
            url: s3Result.Location,
            signedUrl,
            recordCount: units.length,
            generatedAt: new Date(),
            filters: {
                projectId: options.projectId,
                towerId: options.towerId,
                status: options.status
            }
        };
    } catch (error) {
        logger.error('Error generating inventory report', { error, tenantId });
        throw error;
    }
};

module.exports = {
    generateSalesReport,
    generateCollectionsReport,
    generateInventoryReport
};