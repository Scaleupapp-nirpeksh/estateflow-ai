# Inventory Management System

This document provides an overview of the inventory management system in EstateFlow AI.

## Overview

The inventory management system is designed to handle real estate inventory, including projects, towers (buildings), and individual units (apartments/properties). It provides a comprehensive set of APIs to create, read, update, and delete inventory items, as well as specialized operations like locking units for potential buyers.

## Core Components

### Models

1. **Project**: Represents a real estate development project
   - Contains basic details like name, address, city
   - Includes tax rates (GST, stamp duty, registration)
   - Manages project-level attributes and settings

2. **Tower**: Represents a building within a project
   - Stores details like name, total floors
   - Manages construction status tracking
   - Contains premium settings (floor rise, view premium)

3. **Unit**: Represents an individual property for sale
   - Stores physical attributes (area, floor, features)
   - Manages pricing information (base price, premiums)
   - Tracks status (available, locked, booked, sold)

### Services

1. **Project Service**: Handles project operations
   - CRUD operations for projects
   - Project listing with filtering
   - Status management

2. **Tower Service**: Manages tower operations
   - CRUD operations for towers
   - Construction status updates
   - Premium rule management

3. **Unit Service**: Handles unit operations
   - CRUD operations for units
   - Unit listing with advanced filtering
   - Status management (lock, release, book, sell)
   - Price calculation with all premiums and taxes

### Background Jobs

1. **Unit Lock Job**: Automatically releases expired unit locks
   - Runs every 5 minutes
   - Prevents units from being locked indefinitely

## Pricing System

The inventory system includes a sophisticated pricing engine that calculates the total price of units including:

1. Base price (rate per sq. ft. × area)
2. Floor rise premiums (increases with higher floors)
3. View premiums (additional % for desirable views)
4. Special location premiums (corner units, etc.)
5. Additional charges (parking, club membership, etc.)
6. Applicable taxes (GST, stamp duty, registration)

## API Endpoints

### Project Endpoints

- `POST /api/v1/inventory/projects` - Create a new project
- `GET /api/v1/inventory/projects` - List projects with filtering
- `GET /api/v1/inventory/projects/:id` - Get project details
- `PUT /api/v1/inventory/projects/:id` - Update project
- `PUT /api/v1/inventory/projects/:id/status` - Set project status
- `DELETE /api/v1/inventory/projects/:id` - Delete project

### Tower Endpoints

- `POST /api/v1/inventory/towers` - Create a new tower
- `GET /api/v1/inventory/towers` - List towers with filtering
- `GET /api/v1/inventory/towers/:id` - Get tower details
- `PUT /api/v1/inventory/towers/:id` - Update tower
- `PUT /api/v1/inventory/towers/:id/construction` - Update construction status
- `PUT /api/v1/inventory/towers/:id/premiums` - Update premium rules
- `DELETE /api/v1/inventory/towers/:id` - Delete tower

### Unit Endpoints

- `POST /api/v1/inventory/units` - Create a new unit
- `POST /api/v1/inventory/units/bulk` - Create multiple units
- `GET /api/v1/inventory/units` - List units with filtering
- `GET /api/v1/inventory/units/:id` - Get unit details
- `PUT /api/v1/inventory/units/:id` - Update unit
- `GET /api/v1/inventory/units/:id/price` - Calculate unit price
- `POST /api/v1/inventory/units/:id/lock` - Lock unit for buyer
- `POST /api/v1/inventory/units/:id/release` - Release locked unit
- `PUT /api/v1/inventory/units/:id/status` - Change unit status
- `DELETE /api/v1/inventory/units/:id` - Delete unit

## Permission Structure

The inventory system implements role-based access control:

1. **Principal/Business Head**:
   - Create/update/delete projects and towers
   - Manage pricing rules
   - Full unit management

2. **Sales Director**:
   - View all inventory
   - Lock/release units
   - Change unit status

3. **Senior/Junior Agents**:
   - View all inventory
   - Lock/release units (only their own locks)

4. **Other Roles**:
   - View-only access to inventory

## Example Workflow

A typical workflow for inventory management:

1. Create a project with basic details
2. Add towers to the project with floor details
3. Define pricing rules (floor rise, view premiums)
4. Add units to towers (individual or bulk)
5. Set units as available for sale
6. Sales agents can lock units for potential buyers
7. After payment, update unit status to booked or sold

## Unit Status Flow

Units follow a specific status flow:

```
available → locked → booked → sold
      ↑         |
      └---------┘
```

- **Available**: Unit is ready for sale
- **Locked**: Unit is temporarily reserved for a potential buyer
- **Booked**: Unit has been booked with initial payment
- **Sold**: Unit transaction is complete

Locks automatically expire based on the configured timeout.

## Testing

The inventory system includes comprehensive unit tests:

- `tests/unit/services/project.service.test.js`
- `tests/unit/services/tower.service.test.js`
- `tests/unit/services/unit.service.test.js`

Run tests with:
```
npm test
```