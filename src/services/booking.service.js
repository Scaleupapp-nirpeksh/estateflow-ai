// src/services/booking.service.js

const mongoose = require('mongoose');
const Booking = require('../models/booking.model');
const Lead = require('../models/lead.model');
const Unit = require('../models/unit.model');
const Project = require('../models/project.model');
const PaymentSchedule = require('../models/payment-schedule.model');
const { ApiError } = require('../utils/error-handler');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const AWS = require('aws-sdk');


// Helper Functions (Consider moving outside if used elsewhere)
const formatCurrency = (amount) => {
    // Use Intl for more robust formatting if needed, but this is fine for INR
    return '₹ ' + (amount || 0).toLocaleString('en-IN');
};

const drawTable = (doc, data, headers, startX, startY, colWidths, rowHeight) => {
    let currentY = startY;
    const startContentY = currentY + rowHeight; // Y position where content rows start
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);
    const endX = startX + tableWidth;

    // Draw Headers
    doc.font('Helvetica-Bold');
    let currentX = startX;
    headers.forEach((header, i) => {
        doc.text(header, currentX, currentY, {
            width: colWidths[i],
            align: 'center' // Center align headers
        });
        currentX += colWidths[i];
    });

    // Draw Header Bottom Line
    doc.moveTo(startX, startContentY)
        .lineTo(endX, startContentY)
        .stroke();

    // Draw Rows
    doc.font('Helvetica');
    let rowY = startContentY;
    data.forEach(row => {
        let cellX = startX;
        const rowBottomY = rowY + rowHeight;

        row.forEach((cell, i) => {
            doc.text(cell, cellX + 5, rowY + 5, { // Add small padding
                width: colWidths[i] - 10, // Adjust width for padding
                align: i === 0 ? 'left' : 'right' // Left align first column, right align others
            });
            cellX += colWidths[i];
        });

        // Draw Row Bottom Line
        doc.moveTo(startX, rowBottomY)
            .lineTo(endX, rowBottomY)
            .stroke();

        rowY = rowBottomY; // Move Y for the next row
    });

    // Draw Vertical Lines
    currentX = startX;
    doc.moveTo(startX, startY) // Left border
        .lineTo(startX, rowY)
        .stroke();
    colWidths.forEach(width => {
        currentX += width;
        doc.moveTo(currentX, startY) // Inner and Right borders
            .lineTo(currentX, rowY)
            .stroke();
    });


    return rowY; // Return the Y position after the table
};

/**
 * Create a booking from a lead
 * @param {Object} bookingData - Booking data including lead and unit
 * @returns {Promise<Booking>} - Created booking
 */
const createBooking = async (bookingData) => {
    try {
        // Validate lead exists
        const lead = await Lead.findById(bookingData.leadId);
        if (!lead) {
            throw new ApiError(404, 'Lead not found');
        }

        // Validate unit exists and is available
        const unit = await Unit.findById(bookingData.unitId);
        if (!unit) {
            throw new ApiError(404, 'Unit not found');
        }

        if (unit.status !== 'available' && unit.status !== 'locked') {
            throw new ApiError(400, `Unit is not available for booking. Current status: ${unit.status}`);
        }

        // Get project for tax rates
        const project = await Project.findById(unit.projectId);
        if (!project) {
            throw new ApiError(404, 'Project not found');
        }

        // Generate booking number
        const bookingNumber = await generateBookingNumber(bookingData.tenantId);

        // Prepare booking data
        const booking = new Booking({
            tenantId: bookingData.tenantId,
            bookingNumber,
            leadId: lead._id,
            customerName: lead.fullName,
            customerEmail: lead.email,
            customerPhone: lead.phone,
            unitId: unit._id,
            projectId: unit.projectId,
            towerId: unit.towerId,
            basePrice: bookingData.basePrice || unit.basePrice,
            premiums: bookingData.premiums || [],
            discounts: bookingData.discounts || [],
            additionalCharges: bookingData.additionalCharges || [],
            status: 'draft',
            createdBy: bookingData.userId,
        });

        // Calculate taxes based on project settings
        booking.taxes = {
            gst: {
                rate: project.gstRate,
                amount: (booking.basePrice * project.gstRate) / 100,
            },
            stampDuty: {
                rate: project.stampDutyRate,
                amount: (booking.basePrice * project.stampDutyRate) / 100,
            },
            registration: {
                rate: project.registrationRate,
                amount: (booking.basePrice * project.registrationRate) / 100,
            },
            otherTaxes: [],
        };

        // Calculate total booking amount
        booking.totalBookingAmount = booking.calculateTotal();

        // Check for discounts that need approval
        if (booking.hasPendingApprovals()) {
            booking.status = 'pending_approval';
        }

        // Save booking
        await booking.save();

        // Update unit status to booked
        await Unit.findByIdAndUpdate(unit._id, {
            status: 'booked',
            bookingId: booking._id,
        });

        // Update lead status to converted
        await Lead.findByIdAndUpdate(lead._id, {
            status: 'converted',
        });

        return booking;
    } catch (error) {
        logger.error('Error creating booking', { error });
        throw error;
    }
};

/**
 * Generate unique booking number
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<string>} - Unique booking number
 */
const generateBookingNumber = async (tenantId) => {
    try {
        // Get current date
        const now = new Date();
        const year = now.getFullYear().toString().substr(-2);
        const month = (now.getMonth() + 1).toString().padStart(2, '0');

        // Get count of bookings for this tenant in current month
        const count = await Booking.countDocuments({
            tenantId,
            createdAt: {
                $gte: new Date(now.getFullYear(), now.getMonth(), 1),
                $lt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
            },
        });

        // Generate booking number: BK-YY-MM-XXXX
        const sequence = (count + 1).toString().padStart(4, '0');
        const bookingNumber = `BK-${year}-${month}-${sequence}`;

        return bookingNumber;
    } catch (error) {
        logger.error('Error generating booking number', { error });
        throw error;
    }
};

/**
 * Get bookings with filtering and pagination
 * @param {string} tenantId - Tenant ID
 * @param {Object} filters - Filter options
 * @param {Object} pagination - Pagination options
 * @returns {Promise<Object>} - Bookings with pagination info
 */
const getBookings = async (tenantId, filters = {}, pagination = { page: 1, limit: 10 }) => {
    try {
        const { page, limit } = pagination;
        const skip = (page - 1) * limit;

        // Build query
        const query = { tenantId };

        // Add status filter if provided
        if (filters.status) {
            query.status = filters.status;
        }

        // Add unit filter if provided
        if (filters.unitId) {
            query.unitId = filters.unitId;
        }

        // Add project filter if provided
        if (filters.projectId) {
            query.projectId = filters.projectId;
        }

        // Add lead filter if provided
        if (filters.leadId) {
            query.leadId = filters.leadId;
        }

        // Add tower filter if provided
        if (filters.towerId) {
            query.towerId = filters.towerId;
        }

        // Add date range filter if provided
        if (filters.fromDate || filters.toDate) {
            query.createdAt = {};

            if (filters.fromDate) {
                query.createdAt.$gte = new Date(filters.fromDate);
            }

            if (filters.toDate) {
                query.createdAt.$lte = new Date(filters.toDate);
            }
        }

        // Add search filter if provided
        if (filters.search) {
            query.$or = [
                { customerName: new RegExp(filters.search, 'i') },
                { customerEmail: new RegExp(filters.search, 'i') },
                { customerPhone: new RegExp(filters.search, 'i') },
                { bookingNumber: new RegExp(filters.search, 'i') },
            ];
        }

        // Count total documents
        const total = await Booking.countDocuments(query);

        // Execute query with pagination
        const bookings = await Booking.find(query)
            .populate('leadId', 'fullName email phone')
            .populate('unitId', 'number floor type basePrice')
            .populate('projectId', 'name')
            .populate('towerId', 'name')
            .populate('createdBy', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        return {
            data: bookings,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
            },
        };
    } catch (error) {
        logger.error('Error getting bookings', { error, tenantId });
        throw error;
    }
};

/**
 * Get booking by ID
 * @param {string} id - Booking ID
 * @returns {Promise<Booking>} - Booking details
 */
const getBookingById = async (id) => {
    try {
        const booking = await Booking.findById(id)
            .populate('leadId', 'fullName email phone')
            .populate('unitId', 'number floor type carpetArea builtUpArea superBuiltUpArea basePrice')
            .populate('projectId', 'name address city')
            .populate('towerId', 'name')
            .populate('paymentScheduleId')
            .populate('createdBy', 'name')
            .populate('updatedBy', 'name')
            .populate('cancellation.requestedBy', 'name')
            .populate('cancellation.approvedBy', 'name')
            .populate('notes.createdBy', 'name');

        if (!booking) {
            throw new ApiError(404, 'Booking not found');
        }

        return booking;
    } catch (error) {
        logger.error('Error getting booking', { error, bookingId: id });
        throw error;
    }
};

/**
 * Update booking
 * @param {string} id - Booking ID
 * @param {Object} updateData - Update data
 * @returns {Promise<Booking>} - Updated booking
 */
const updateBooking = async (id, updateData) => {
    try {
        const booking = await Booking.findById(id);

        if (!booking) {
            throw new ApiError(404, 'Booking not found');
        }

        // Prevent updating certain fields directly
        const restrictedFields = [
            'tenantId',
            'bookingNumber',
            'status',
            'unitId',
            'projectId',
            'towerId',
            'paymentScheduleId',
            'notes',
            'documents',
            'createdBy',
            'createdAt'
        ];

        Object.keys(updateData).forEach(key => {
            if (!restrictedFields.includes(key)) {
                booking[key] = updateData[key];
            }
        });

        // Recalculate total
        booking.totalBookingAmount = booking.calculateTotal();

        // Update the booking
        booking.updatedBy = updateData.userId;
        booking.updatedAt = new Date();

        await booking.save();
        return booking;
    } catch (error) {
        logger.error('Error updating booking', { error, bookingId: id });
        throw error;
    }
};

/**
 * Add note to booking
 * @param {string} id - Booking ID
 * @param {Object} note - Note data
 * @returns {Promise<Booking>} - Updated booking
 */
const addNote = async (id, note) => {
    try {
        const booking = await Booking.findById(id);

        if (!booking) {
            throw new ApiError(404, 'Booking not found');
        }

        booking.notes.push(note);
        booking.updatedBy = note.createdBy;
        booking.updatedAt = new Date();

        await booking.save();
        return booking;
    } catch (error) {
        logger.error('Error adding note to booking', { error, bookingId: id });
        throw error;
    }
};

/**
 * Add document to booking
 * @param {string} id - Booking ID
 * @param {Object} document - Document data
 * @returns {Promise<Booking>} - Updated booking
 */
const addDocument = async (id, document) => {
    try {
        const booking = await Booking.findById(id);

        if (!booking) {
            throw new ApiError(404, 'Booking not found');
        }

        // Check if document with same type exists
        const existingDocIndex = booking.documents.findIndex(
            doc => doc.type === document.type
        );

        if (existingDocIndex >= 0) {
            // Increment version and add new document
            const version = booking.documents[existingDocIndex].version + 1;
            document.version = version;
        } else {
            document.version = 1;
        }

        booking.documents.push(document);
        booking.updatedBy = document.createdBy;
        booking.updatedAt = new Date();

        await booking.save();
        return booking;
    } catch (error) {
        logger.error('Error adding document to booking', { error, bookingId: id });
        throw error;
    }
};

/**
 * Add discount to booking
 * @param {string} id - Booking ID
 * @param {Object} discount - Discount data
 * @returns {Promise<Booking>} - Updated booking
 */
const addDiscount = async (id, discount) => {
    try {
        const booking = await Booking.findById(id);

        if (!booking) {
            throw new ApiError(404, 'Booking not found');
        }

        // Add discount to booking
        booking.discounts.push(discount);

        // Check if approval is needed
        if (discount.status === 'pending') {
            booking.status = 'pending_approval';
        }

        // Recalculate total
        booking.totalBookingAmount = booking.calculateTotal();

        booking.updatedBy = discount.createdBy;
        booking.updatedAt = new Date();

        await booking.save();
        return booking;
    } catch (error) {
        logger.error('Error adding discount to booking', { error, bookingId: id });
        throw error;
    }
};

/**
 * Update booking status
 * @param {string} id - Booking ID
 * @param {string} status - New status
 * @param {Object} userData - User data for audit
 * @returns {Promise<Booking>} - Updated booking
 */
const updateBookingStatus = async (id, status, userData) => {
    try {
        const booking = await Booking.findById(id);

        if (!booking) {
            throw new ApiError(404, 'Booking not found');
        }

        // Validate status transition
        const validTransitions = {
            'draft': ['pending_approval', 'approved', 'cancelled'],
            'pending_approval': ['approved', 'cancelled'],
            'approved': ['executed', 'cancelled'],
            'executed': ['cancelled'],
            'cancelled': []
        };

        if (!validTransitions[booking.status].includes(status)) {
            throw new ApiError(400, `Cannot change status from ${booking.status} to ${status}`);
        }

        // Special case for cancellation
        if (status === 'cancelled') {
            if (!userData.reason) {
                throw new ApiError(400, 'Cancellation reason is required');
            }

            booking.cancellation = {
                date: new Date(),
                reason: userData.reason,
                requestedBy: userData.userId,
                approvedBy: userData.approvedBy || userData.userId,
            };

            // Update unit status back to available
            await Unit.findByIdAndUpdate(booking.unitId, {
                status: 'available',
                bookingId: null,
            });
        }

        booking.status = status;
        booking.updatedBy = userData.userId;
        booking.updatedAt = new Date();

        await booking.save();
        return booking;
    } catch (error) {
        logger.error('Error updating booking status', { error, bookingId: id });
        throw error;
    }
};

/**
 * Generate cost sheet for booking
 * @param {string} id - Booking ID
 * @param {Object} options - Options (e.g., { userId: string, version?: number })
 * @returns {Promise<Object>} - { booking: UpdatedBookingObject, costSheet: CostSheetDocumentObject }
 */
const generateCostSheet = async (id, options = {}) => {
    try {
        // --- 1. Fetch Required Data ---
        const booking = await getBookingById(id); // Assuming getBookingById is defined elsewhere
        if (!booking) {
            throw new ApiError(404, 'Booking not found');
        }

        const Tenant = require('../models/tenant.model'); // Lazy require model
        const tenant = await Tenant.findById(booking.tenantId);
        if (!tenant) {
            throw new ApiError(404, 'Tenant not found for booking');
        }

        const Unit = require('../models/unit.model'); // Lazy require model
        const unit = await Unit.findById(booking.unitId)
            .populate('towerId', 'name totalFloors') // Populate required fields only
            .populate('projectId', 'name address city');
        if (!unit || !unit.towerId || !unit.projectId) { // Check populated fields too
            throw new ApiError(404, 'Unit, Tower, or Project details not found');
        }

        let paymentSchedule = null;
        if (booking.paymentScheduleId) {
            const PaymentSchedule = require('../models/payment-schedule.model'); // Lazy require model
            paymentSchedule = await PaymentSchedule.findById(booking.paymentScheduleId);
            if (!paymentSchedule) {
                logger.warn(`Payment schedule ID ${booking.paymentScheduleId} linked but not found`, { bookingId: id });
                // Decide if this should be an error or just proceed without it
                // throw new ApiError(404, 'Payment schedule not found');
            }
        }

        // --- 2. Setup PDF Document & S3 ---
        const doc = new PDFDocument({
            margin: 50,
            size: 'A4',
            autoFirstPage: false // We'll add pages manually for better control
        });

        const s3 = new AWS.S3({ // Consider initializing S3 client outside if used frequently
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            region: process.env.AWS_REGION
        });

        const tempDir = path.join(__dirname, '../../temp/cost-sheets'); // More specific temp dir
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const timestamp = Date.now();
        const tempFileName = `cost-sheet-${booking._id}-${timestamp}.pdf`;
        const tempFilePath = path.join(tempDir, tempFileName);
        const writeStream = fs.createWriteStream(tempFilePath);
        doc.pipe(writeStream);

        // --- Font Embedding Example (If using Robust Fix) ---
        /*
        try {
            const fontRegularPath = path.join(__dirname, '../../assets/fonts/YourSansSerif-Regular.ttf');
            const fontBoldPath = path.join(__dirname, '../../assets/fonts/YourSansSerif-Bold.ttf');
            const fontItalicPath = path.join(__dirname, '../../assets/fonts/YourSansSerif-Italic.ttf'); // e.g., LiberationSans-Italic.ttf

            // Register fonts with the names you'll use in doc.font()
            if (fs.existsSync(fontRegularPath)) doc.registerFont('Helvetica', fontRegularPath); else logger.warn('Regular font not found');
            if (fs.existsSync(fontBoldPath)) doc.registerFont('Helvetica-Bold', fontBoldPath); else logger.warn('Bold font not found');
            if (fs.existsSync(fontItalicPath)) doc.registerFont('Helvetica-Italic', fontItalicPath); else logger.warn('Italic font not found');

        } catch(fontError) {
            logger.error('Error registering custom fonts', { error: fontError });
            // Decide how to proceed: throw error, use fallback fonts?
        }
        */

        // --- 3. Build PDF Content ---

        // --- Page 1: Details & Price ---
        doc.addPage();

        // Tenant Logo (Optional)
        if (tenant.logo) {
            try {
                // Using fetch requires Node 18+ or node-fetch package
                const logoResponse = await fetch(tenant.logo);
                if (!logoResponse.ok) throw new Error(`Failed to fetch logo: ${logoResponse.statusText}`);
                const logoBuffer = Buffer.from(await logoResponse.arrayBuffer()); // More robust way
                doc.image(logoBuffer, {
                    fit: [100, 50], // Adjust size as needed
                    align: 'center'
                }).moveDown(0.5);
            } catch (error) {
                logger.error('Error fetching or adding logo to cost sheet', { error, logoUrl: tenant.logo, bookingId: id });
                // Continue without logo gracefully
            }
        } else {
            doc.moveDown(1); // Add space if no logo
        }


        // Header
        doc.fontSize(20).font('Helvetica-Bold').text('COST SHEET', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica').text(`Ref: ${booking.bookingNumber}`, doc.page.margins.left, doc.y, { align: 'left' });
        doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, doc.page.margins.left, doc.y, { align: 'right' }); // Use locale
        doc.moveDown(1.5);


        // Project & Unit Details
        doc.fontSize(14).font('Helvetica-Bold').text('PROPERTY DETAILS', { underline: true }).moveDown(0.5);
        doc.fontSize(10).font('Helvetica');
        const projectDetails = [
            `Project Name: ${unit.projectId.name}`,
            `Tower: ${unit.towerId.name}`,
            `Floor: ${unit.floor}`,
            `Unit No: ${unit.number}`,
            `Type: ${unit.type}`,
            `Carpet Area: ${unit.carpetArea} sq. ft.`,
            `Built-up Area: ${unit.builtUpArea} sq. ft.`,
            `Super Built-up Area: ${unit.superBuiltUpArea} sq. ft.`, // Used for pricing? Specify if so.
            `Address: ${unit.projectId.address}, ${unit.projectId.city}`
        ];
        doc.list(projectDetails, { bulletRadius: 1.5, textIndent: 10, lineGap: 2 }).moveDown(1);


        // Customer Details
        doc.fontSize(14).font('Helvetica-Bold').text('CUSTOMER DETAILS', { underline: true }).moveDown(0.5);
        doc.fontSize(10).font('Helvetica');
        const customerDetails = [
            `Name: ${booking.customerName}`,
            `Phone: ${booking.customerPhone}`,
            `Email: ${booking.customerEmail || 'N/A'}`,
            `Address: ${booking.customerAddress || 'N/A'}`
        ];
        doc.list(customerDetails, { bulletRadius: 1.5, textIndent: 10, lineGap: 2 }).moveDown(1.5);


        // Price Breakdown Table
        doc.fontSize(14).font('Helvetica-Bold').text('PRICE BREAKDOWN', { underline: true }).moveDown(0.5);
        const pricePerSqFt = booking.basePrice > 0 && unit.superBuiltUpArea > 0
            ? booking.basePrice / unit.superBuiltUpArea
            : 0;
        const priceBreakdownData = [];

        priceBreakdownData.push(['Base Unit Price', formatCurrency(booking.basePrice), `@ ${formatCurrency(Math.round(pricePerSqFt))} / sq. ft.`]);

        let premiumTotal = 0;
        if (booking.premiums && booking.premiums.length > 0) {
            booking.premiums.forEach(p => {
                premiumTotal += p.amount;
                priceBreakdownData.push([p.description || p.type || 'Premium Charge', formatCurrency(p.amount), '']);
            });
            priceBreakdownData.push(['Total Premiums', formatCurrency(premiumTotal), '']);
        }

        let discountTotal = 0;
        if (booking.discounts && booking.discounts.length > 0) {
            booking.discounts.forEach(d => {
                if (d.status === 'approved') { // Only apply approved discounts
                    discountTotal += d.amount;
                    priceBreakdownData.push([
                        `${d.description || d.type || 'Discount'}`,
                        `(${formatCurrency(d.amount)})`, // Indicate subtraction
                        d.percentage ? `${d.percentage}%` : ''
                    ]);
                }
            });
            if (discountTotal > 0) {
                priceBreakdownData.push(['Total Discounts', `(${formatCurrency(discountTotal)})`, '']);
            }
        }

        let chargesTotal = 0;
        if (booking.additionalCharges && booking.additionalCharges.length > 0) {
            booking.additionalCharges.forEach(c => {
                chargesTotal += c.amount;
                priceBreakdownData.push([c.name || 'Additional Charge', formatCurrency(c.amount), '']);
            });
            priceBreakdownData.push(['Total Additional Charges', formatCurrency(chargesTotal), '']);
        }

        let taxTotal = 0;
        const taxDetails = [];
        if (booking.taxes) {
            // Combine all taxes for simplicity or list individually
            if (booking.taxes.gst) { taxTotal += booking.taxes.gst.amount; taxDetails.push(`GST (${booking.taxes.gst.rate}%)`); }
            if (booking.taxes.stampDuty) { taxTotal += booking.taxes.stampDuty.amount; taxDetails.push(`Stamp Duty (${booking.taxes.stampDuty.rate}%)`); }
            if (booking.taxes.registration) { taxTotal += booking.taxes.registration.amount; taxDetails.push(`Reg. Fee (${booking.taxes.registration.rate}%)`); }
            if (booking.taxes.otherTaxes) { booking.taxes.otherTaxes.forEach(t => { taxTotal += t.amount; taxDetails.push(`${t.name} (${t.rate}%)`); }); }

            priceBreakdownData.push(['Taxes & Fees', formatCurrency(taxTotal), taxDetails.join(', ')]);
        }

        // Total Cost Row (Bold) - Add logic to calculate if not stored directly
        priceBreakdownData.push(['TOTAL COST OF PROPERTY', formatCurrency(booking.totalBookingAmount), '']);

        const priceColWidths = [250, 150, 130]; // Adjust width based on A4 size and margins
        let currentY = drawTable(doc, priceBreakdownData, ['Item', 'Amount (INR)', 'Details'], doc.page.margins.left, doc.y, priceColWidths, 20); // Use smaller row height
        doc.y = currentY; // Update doc's Y position
        doc.moveDown(2);

        // --- Page 2: Payment Schedule (Optional) ---
        if (paymentSchedule && paymentSchedule.installments && paymentSchedule.installments.length > 0) {
            doc.addPage();
            doc.fontSize(14).font('Helvetica-Bold').text('PAYMENT SCHEDULE', { underline: true }).moveDown(0.5);

            const scheduleTableData = paymentSchedule.installments.map((inst, index) => [
                (index + 1).toString(),
                inst.name || `Milestone ${index + 1}`,
                inst.percentage ? `${inst.percentage.toFixed(2)}%` : '-',
                formatCurrency(inst.amount),
                inst.dueDate ? new Date(inst.dueDate).toLocaleDateString('en-IN') : 'As per demand'
            ]);

            const scheduleColWidths = [30, 200, 70, 120, 110]; // Adjust widths
            currentY = drawTable(doc, scheduleTableData, ['#', 'Milestone / Description', '%', 'Amount (INR)', 'Due Date'], doc.page.margins.left, doc.y, scheduleColWidths, 20);
            doc.y = currentY;
            doc.moveDown(2);
        }

        // --- Page 3: Terms & Conditions ---
        doc.addPage();
        doc.fontSize(14).font('Helvetica-Bold').text('TERMS & CONDITIONS', { underline: true }).moveDown(0.5);

        // Consider loading T&Cs from a config file or database
        const terms = [
            'This cost sheet is indicative and valid for 15 days from the date of issue, subject to realization of the booking amount.',
            'All payments must be made via Cheque/DD/NEFT/RTGS favoring "[Company Bank Account Name]". Mention Booking Ref No.',
            'Prices are firm only upon execution of the Agreement for Sale.',
            'Delayed payments will attract interest at 18% per annum from the due date.',
            'GST, Stamp Duty, Registration Charges, and any other applicable government levies will be charged extra as applicable at the time of demand/payment.',
            'Allocation of car parking space(s) is subject to availability, type (covered/open), and additional charges as applicable.',
            'Maintenance charges, corpus fund, and other society formation expenses are payable at the time of possession as per the agreement.',
            'The Super Built-up Area includes proportionate loading of common areas like lobbies, staircases, etc.',
            'Minor alterations in specifications/layout may occur due to architectural or statutory requirements.',
            'This cost sheet does not constitute a legal offer or agreement. The Agreement for Sale shall be the final binding document.',
            // Add more relevant terms
        ];

        doc.fontSize(9).font('Helvetica'); // Smaller font for T&Cs
        doc.list(terms, { bulletRadius: 1.5, lineGap: 4 });
        doc.moveDown(1.5);

        // Declaration
        doc.fontSize(10).font('Helvetica-Bold').text('DECLARATION', { underline: true }).moveDown(0.5);
        doc.fontSize(9).font('Helvetica')
            .text('I/We have read, understood, and accept the price breakdown and the terms & conditions mentioned herein.', {
                lineGap: 3
            }).moveDown(2);

        // Signatures
        const signatureY = doc.y > doc.page.height - 150 ? doc.addPage().y + 50 : doc.y; // Check if space needed or add new page

        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('_________________________', doc.page.margins.left, signatureY);
        doc.text('_________________________', doc.page.width / 2 + 20, signatureY);
        doc.moveDown(0.5);
        doc.text('Customer Signature(s)', doc.page.margins.left, doc.y);
        doc.text(`For ${tenant.name}`, doc.page.width / 2 + 20, doc.y);
        doc.moveDown(1);
        doc.text('Date: ______________', doc.page.margins.left, doc.y);
        doc.text('Authorized Signatory', doc.page.width / 2 + 20, doc.y);


        // --- Footer Note ---
        const pageHeight = doc.page.height;
        const footerY = pageHeight - doc.page.margins.bottom + 10; // Position slightly below margin

        // Use regular Helvetica instead of Italic
        doc.fontSize(8).font('Helvetica') // *** FIX: Changed from Helvetica-Italic ***
            .text('This is a computer-generated document. All amounts are in Indian Rupees (INR). E.&O.E.',
                doc.page.margins.left,
                footerY, // Position at bottom
                {
                    width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
                    align: 'center',
                    lineGap: 2
                });


        // --- 4. Finalize PDF, Upload & Update Booking ---
        doc.end();

        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', (err) => {
                logger.error('PDF write stream error', { error: err, bookingId: id });
                reject(new ApiError(500, 'Failed to write PDF file'));
            });
        });

        // Upload to S3
        const fileContent = fs.readFileSync(tempFilePath);
        const s3Key = `bookings/${booking.tenantId}/${booking._id}/cost-sheet-${timestamp}.pdf`;

        const s3Params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: s3Key,
            Body: fileContent,
            ContentType: 'application/pdf',
            ACL: 'private' // Or 'public-read' if needed, but signed URLs are better
        };

        logger.info(`Uploading cost sheet to S3: ${s3Params.Bucket}/${s3Params.Key}`);
        const s3Result = await s3.upload(s3Params).promise();
        logger.info(`Successfully uploaded cost sheet to ${s3Result.Location}`);

        // Clean up temporary file
        try {
            fs.unlinkSync(tempFilePath);
        } catch (unlinkError) {
            logger.warn('Could not delete temporary cost sheet file', { path: tempFilePath, error: unlinkError });
        }

        // Generate Signed URL for temporary access
        const signedUrl = s3.getSignedUrl('getObject', {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: s3Key,
            Expires: 3600 // 1 hour validity
        });

        // Prepare document data for booking update
        const documentData = {
            type: 'cost_sheet', // Use consistent naming (e.g., snake_case)
            name: `Cost Sheet - ${booking.bookingNumber || id}`,
            url: s3Result.Location, // Store the permanent S3 location
            s3Key: s3Key, // Store the key for potential future operations
            metadata: {
                generatedAt: timestamp,
                version: options.version || 1,
                generatedByUserId: options.userId
            },
            createdBy: options.userId, // Record who triggered the generation
            createdAt: new Date(),
        };

        // Assume addDocument function updates the booking and returns the updated object
        const updatedBooking = await addDocument(id, documentData); // Assuming addDocument is defined elsewhere

        return {
            booking: updatedBooking,
            costSheet: {
                ...documentData,
                signedUrl: signedUrl // Include the temporary signed URL in the response
            }
        };

    } catch (error) {
        logger.error('Critical error in generateCostSheet function', {
            error: error instanceof Error ? { message: error.message, stack: error.stack, code: error.code } : error, // Log more error details
            bookingId: id,
            options: options
        });

        // Re-throw specific ApiErrors, wrap others
        if (error instanceof ApiError) {
            throw error;
        } else {
            // Avoid leaking internal details like file paths from ENOENT errors
            throw new ApiError(500, 'An unexpected error occurred while generating the cost sheet.');
        }
    }
};

/**
 * Get booking statistics for a tenant
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} - Booking statistics
 */
const getBookingStatistics = async (tenantId) => {
    try {
        // Get count by status
        const statusCounts = await Booking.aggregate([
            { $match: { tenantId: new mongoose.Types.ObjectId(tenantId) } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        // Get count by project
        const projectCounts = await Booking.aggregate([
            { $match: { tenantId: new mongoose.Types.ObjectId(tenantId) } },
            { $group: { _id: '$projectId', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]);

        // Get projects for lookup
        const projectIds = projectCounts.map(p => p._id);
        const projects = await Project.find({
            _id: { $in: projectIds }
        }, { name: 1 });

        // Map project names
        const projectMap = {};
        projects.forEach(p => {
            projectMap[p._id] = p.name;
        });

        // Get bookings created in the last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentBookings = await Booking.countDocuments({
            tenantId,
            createdAt: { $gte: thirtyDaysAgo }
        });

        // Get total booking value
        const bookingValueResult = await Booking.aggregate([
            { $match: { tenantId: new mongoose.Types.ObjectId(tenantId) } },
            { $group: { _id: null, totalValue: { $sum: '$totalBookingAmount' } } }
        ]);

        const totalBookings = await Booking.countDocuments({ tenantId });
        const totalValue = bookingValueResult.length > 0 ? bookingValueResult[0].totalValue : 0;

        return {
            totalBookings,
            totalValue,
            recentBookings,
            averageValue: totalBookings > 0 ? totalValue / totalBookings : 0,
            byStatus: statusCounts.map(item => ({
                status: item._id,
                count: item.count
            })),
            byProject: projectCounts.map(item => ({
                projectId: item._id,
                projectName: projectMap[item._id] || 'Unknown Project',
                count: item.count
            }))
        };
    } catch (error) {
        logger.error('Error getting booking statistics', { error, tenantId });
        throw error;
    }
};

module.exports = {
    createBooking,
    getBookings,
    getBookingById,
    updateBooking,
    addNote,
    addDocument,
    addDiscount,
    updateBookingStatus,
    generateCostSheet,
    getBookingStatistics,
};