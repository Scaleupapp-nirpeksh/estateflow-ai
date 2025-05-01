# EstateFlow AI Development Guide

This document serves as a comprehensive guide for the development of EstateFlow AI, including current state, next steps, architecture decisions, and implementation details.

## Current State

### Day 1 Morning (Completed)

- Repository setup with Git
- Project scaffolding with Node.js
- Basic application structure with Express
- Configuration management with environment variables
- Logging setup with Winston
- Error handling utilities
- Database connection configuration for MongoDB
- Initial API routing structure
- Authentication and validation middleware skeletons

### Day 1 Afternoon (Completed)

- Database schemas for Tenant and User models
- Authentication system with JWT
- Tenant management service and API
- User management service and API
- Role-based access control implementation

### Project Structure

The project follows a domain-driven modular structure:

```
estateflow-ai/
├── src/
│   ├── api/              # API routes and middleware
│   │   ├── v1/           # API version 1 routes
│   │   └── middleware/   # API middleware
│   ├── models/           # MongoDB schemas
│   ├── services/         # Business logic services
│   │   └── ai/           # LLM integration services
│   ├── utils/            # Utility functions
│   ├── config/           # Configuration management
│   ├── jobs/             # Background jobs
│   ├── app.js            # Express application
│   └── server.js         # Server entry point
├── tests/                # Test suite (to be implemented)
├── .env.example          # Environment variables template
└── package.json          # Project dependencies
```

## Next Steps

### Immediate Next Tasks (Day 1 Afternoon)

1. **Database Schema Implementation**
   - Create Tenant schema
   - Create User schema
   - Implement database indexing for performance
   - Add validation for schema fields

2. **Authentication System**
   - Implement user registration service
   - Implement login and token generation
   - Create refresh token rotation
   - Set up secure password handling

3. **Multi-tenant Architecture**
   - Implement tenant creation flow
   - Create tenant isolation middleware
   - Set up tenant-specific settings

### Day 2 Planned Tasks

1. **Inventory Management**
   - Create Project/Tower/Unit schemas
   - Implement inventory CRUD operations
   - Set up unit status management
   - Implement dynamic pricing rules

2. **LLM Integration Foundation**
   - Set up OpenAI API client
   - Create conversation management
   - Implement intent classification framework
   - Design prompt templates

## Architecture Decisions

### Database Design

- **Multi-tenant Data Model**: Each entity includes a `tenantId` field for strict data isolation
- **Compound Indexes**: Will be used for efficient querying across tenant boundaries
- **Embedded vs Referenced Documents**: We'll use a mix based on entity relationships and query patterns

### API Structure

- **RESTful Design**: Following REST principles for resource management
- **Versioned APIs**: `/api/v1/...` pattern to allow for future versioning
- **JWT Authentication**: Stateless authentication with short-lived access tokens and refresh tokens

### LLM Integration

- **Abstraction Layer**: LLM interactions will be isolated in dedicated services
- **Intent-Based Architecture**: User inputs will be classified into intents with extracted entities
- **Prompt Engineering**: Structured system prompts with dynamic content insertion

## Technical Implementation Details

### Authentication Flow

1. User registers or logs in
2. System generates JWT access token (short-lived) and refresh token (longer-lived)
3. Client includes access token in each request
4. When access token expires, client uses refresh token to obtain a new pair

### Multi-tenant Architecture

- Every API endpoint will include tenant isolation middleware
- Database queries will automatically filter by tenant ID
- Role permissions will be tenant-specific
- Shared resources will use tenant-based isolation

### LLM Integration Strategy

- OpenAI GPT-4o will be used as the primary model
- Context management will maintain conversation history
- Function calling will be used for structured outputs
- Tenant-specific rules will be injected into system prompts

## Development Guidelines

### Coding Standards

- Follow ESLint and Prettier configurations
- Use async/await for asynchronous operations
- Implement comprehensive error handling
- Add JSDoc comments for all functions and classes

### Git Workflow

- Currently using a single `main` branch for rapid development
- Commit messages should be descriptive and follow conventional commits format
- Regular commits should be made to track progress

### Testing Strategy

- Unit tests for services and utilities
- Integration tests for API endpoints
- Mocking for external dependencies
- Test database for MongoDB operations

## Open Challenges & Considerations

### Performance Optimization

- Need to implement caching for frequently accessed data
- Consider database query optimization for larger datasets
- Implement pagination for list endpoints

### Security Considerations

- Need to enhance input validation
- Consider implementing rate limiting
- Add audit logging for sensitive operations

### LLM Cost Management

- Need to implement token optimization
- Consider caching common LLM responses
- Implement usage tracking and quotas

## Contact & Support

For questions or support related to this development guide, please contact the project maintainer.

---

Last Updated: May 1, 2025