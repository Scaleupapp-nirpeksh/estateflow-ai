# Booking Workflow System

## Overview

The Booking Workflow system is a comprehensive solution for managing the conversion of leads into confirmed property bookings. It provides an end-to-end workflow from booking creation to execution, with robust support for approvals, payment scheduling, and document generation.

## Core Components

### 1. Booking Management

The system allows for the creation of bookings from qualified leads, tracking the entire booking lifecycle:

- **Booking Creation**: Convert leads to bookings with associated property units
- **Status Management**: Track bookings through stages (draft, pending_approval, approved, executed, cancelled)
- **Financial Details**: Calculate and track pricing, premiums, discounts, and taxes
- **Document Management**: Generate cost sheets and booking agreements

### 2. Approval System

A flexible approval workflow is implemented to handle discounts, special terms, and other exceptions:

- **Multi-level Approvals**: Configure approval chains based on amount thresholds
- **Role-based Approvals**: Different roles have different approval authorities
- **Approval History**: Track approval decisions with timestamps and comments
- **Status Updates**: Automatically update booking status based on approval decisions

### 3. Payment Schedule Management

The system includes comprehensive payment schedule management:

- **Customizable Templates**: Create reusable payment schedule templates
- **Flexible Installments**: Support for percentage-based and fixed amount installments
- **Dynamic Recalculation**: Automatically adjust future installments when changes are made
- **Change Tracking**: Maintain full audit trail of all schedule modifications
- **Payment Recording**: Track payments against installments

## Data Models

### Booking Model

The central entity that tracks the entire booking process:

- Customer information (from Lead)
- Property details (Unit, Project, Tower)
- Financial information (pricing, premiums, discounts, taxes)
- Status tracking
- Documents
- Notes and comments

### Approval Model

Manages approval requests for discounts, cancellations, and other exceptions:

- Approval type (discount, cancellation, etc.)
- Entity reference (booking, payment schedule, etc.)
- Financial details (amount, percentage)
- Approval chain configuration
- Status and history tracking

### Payment Schedule Model

Tracks payment plans for bookings:

- Schedule information and total amount
- Individual installments with amount, due dates, and status
- Payment recording
- Change history with full audit trail

### Payment Schedule Template Model

Provides reusable templates for quick payment schedule creation:

- Template configuration with name and description
- Installment definitions with triggers and amounts
- Project-specific or tenant-wide templates

## API Endpoints

### Booking Endpoints

- `POST /api/v1/bookings` - Create booking from lead
- `GET /api/v1/bookings` - List bookings with filtering
- `GET /api/v1/bookings/:id` - Get booking details
- `PUT /api/v1/bookings/:id` - Update booking
- `POST /api/v1/bookings/:id/notes` - Add note to booking
- `POST /api/v1/bookings/:id/discounts` - Add discount to booking
- `POST /api/v1/bookings/:id/status` - Update booking status
- `POST /api/v1/bookings/:id/documents/cost-sheet` - Generate cost sheet

### Approval Endpoints

- `GET /api/v1/approvals` - List approvals with filtering
- `GET /api/v1/approvals/pending` - Get pending approvals for current user
- `GET /api/v1/approvals/:id` - Get approval details
- `POST /api/v1/approvals/:id/approve` - Approve request
- `POST /api/v1/approvals/:id/reject` - Reject request

### Payment Schedule Endpoints

- `POST /api/v1/bookings/:bookingId/payment-schedule` - Create payment schedule
- `GET /api/v1/bookings/:bookingId/payment-schedule` - Get payment schedule
- `GET /api/v1/payment-schedules/:id` - Get payment schedule by ID
- `PUT /api/v1/payment-schedules/:id/installments/:index` - Update installment
- `PUT /api/v1/payment-schedules/:id/total` - Update total amount
- `POST /api/v1/payment-schedules/:id/installments/:index/payment` - Record payment

### Payment Schedule Template Endpoints

- `POST /api/v1/payment-schedule-templates` - Create template
- `GET /api/v1/payment-schedule-templates` - List templates
- `GET /api/v1/payment-schedule-templates/:id` - Get template details
- `PUT /api/v1/payment-schedule-templates/:id` - Update template
- `DELETE /api/v1/payment-schedule-templates/:id` - Delete template

## Role-Based Permissions

### Principal/Business Head

- Full access to all bookings
- Can approve any level of discount
- Can create and modify payment schedules
- Can cancel bookings without approval

### Sales Director

- Create and manage bookings
- Limited discount approval authority
- Create payment schedules
- Request booking cancellations

### Sales Agents (Senior/Junior)

- Create bookings from leads
- Request discounts (subject to approval)
- Add notes to bookings
- Generate cost sheets

### Collections Manager

- View bookings
- Manage payment schedules
- Record payments
- Cannot create or cancel bookings

### Finance Manager

- View bookings
- Manage payment schedules
- Record payments
- Access financial reports

## Key Features

1. **Flexible Approval Workflows**: Configure approval chains based on discount amount, ensuring proper authorization for pricing exceptions.

2. **Customizable Payment Schedules**: Create fully adjustable payment plans with support for percentage or fixed amount installments.

3. **Dynamic Recalculation**: When payment schedules are modified, the system can automatically redistribute the remaining amount among future installments.

4. **Comprehensive Audit Trail**: All changes to bookings and payment schedules are tracked with user information and timestamps.

5. **Document Generation**: Generate cost sheets and other booking documents with tenant branding.

6. **Status Tracking**: Monitor bookings through their entire lifecycle from draft to execution or cancellation.

7. **Integration with Lead Management**: Seamlessly convert qualified leads to bookings, updating lead status automatically.

8. **Integration with Inventory Management**: Update unit status based on booking activities, ensuring inventory is accurately reflected.