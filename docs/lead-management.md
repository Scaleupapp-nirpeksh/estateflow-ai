# Lead Management System

This document provides an overview of the Lead Management System in EstateFlow AI.

## Overview

The Lead Management System is designed to track and manage potential customers throughout the sales process. It provides a comprehensive set of APIs to create, read, update, and delete leads, as well as specialized operations like adding interactions, notes, and tracking interested units.

## Core Components

### Models

1. **Lead**: Represents a potential customer in the sales pipeline
   - Contains basic contact information
   - Tracks lead status and source
   - Records interactions and notes
   - Stores interested units
   - Manages attachments and tags

### Services

1. **Lead Service**: Handles lead operations
   - CRUD operations for leads
   - Lead listing with advanced filtering
   - Status management
   - Interaction and note tracking
   - Statistics generation

### API Endpoints

1. **Lead Endpoints**: Exposes lead functionality via REST API
   - Lead creation and management
   - Filtering and pagination
   - Assignment and status changes
   - Interaction recording
   - Statistics reporting

## Lead Status Flow

Leads follow a specific status flow:
new → contacted → qualified → negotiation → converted/lost
- **New**: Lead has been created but not yet contacted
- **Contacted**: Initial contact has been made
- **Qualified**: Lead has been qualified as a potential customer
- **Negotiation**: Discussions about specific units or terms
- **Converted**: Lead has been converted to a customer
- **Lost**: Lead has been lost to a competitor or disqualified

## Interactions and Communication

The system tracks all interactions with leads:

1. **Call**: Phone conversations
2. **Email**: Email communications
3. **Meeting**: In-person or virtual meetings
4. **Site-Visit**: Visits to the property
5. **WhatsApp**: Messages via WhatsApp
6. **Other**: Any other form of interaction

Each interaction can have:
- Date and time
- Details
- Outcome (positive/neutral/negative/follow-up)
- Next action
- Next action date

## User Roles and Permissions

1. **Principal/Business Head**:
   - Full access to all leads
   - Can assign, delete, and manage all leads

2. **Sales Director**:
   - Full access to all leads
   - Can assign leads to agents
   - Cannot delete leads

3. **Senior/Junior Agents**:
   - Access to assigned leads only
   - Can update assigned leads
   - Cannot delete or assign leads

4. **Collections Manager**:
   - View-only access to all leads
   - Cannot update, delete, or assign leads