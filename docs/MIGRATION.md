# Migration Guide: Express.js to NestJS Microservices

## Overview

This document describes the migration from the original Express.js monolithic backend to a NestJS microservices architecture.

## Key Changes

### Architecture

**Before**: Single Express.js server (`server/` directory)
**After**: 6 NestJS microservices + API Gateway

### Authentication

**Before**: Replit OIDC authentication
**After**: JWT-based authentication with optional Microsoft Entra ID SSO

### Service Communication

**Before**: Direct function calls within the same process
**After**: HTTP calls between services, BullMQ for async operations

### Database

**Before**: Direct database access via `storage.ts`
**After**: Shared database with service-specific storage services

## Service Mapping

### Express.js Routes → NestJS Services

| Express Route | NestJS Service | Endpoint |
|--------------|----------------|----------|
| `/api/auth/*` | `auth-service` | `/api/auth/*` |
| `/api/users/*` | `auth-service` | `/api/users/*` |
| `/api/organizations/*` | `auth-service` | `/api/organizations/*` |
| `/api/prompts/*` | `core-service` | `/api/prompts/*` |
| `/api/flows/*` | `core-service` | `/api/flows/*` |
| `/api/datasets/*` | `core-service` | `/api/datasets/*` |
| `/api/eval-specs/*` | `core-service` | `/api/eval-specs/*` |
| `/api/runs/*` | `evaluation-service` | `/api/runs/*` |
| `/api/policies/*` | `evaluation-service` | `/api/policies/*` |
| `/api/webhooks/*` | `integration-service` | `/api/webhooks/*` |
| `/api/azure/*` | `integration-service` | `/api/azure/*` |
| `/api/analytics/*` | `analytics-service` | `/api/analytics/*` |
| `/api/audit/*` | `analytics-service` | `/api/audit/*` |

## Code Migration

### Storage Service

**Before**: `server/storage.ts` - Single storage service
**After**: Service-specific `DatabaseStorageService` in each service

### Services

**Before**: `server/services/*.ts` - All services in one directory
**After**: Services organized by microservice:
- `apps/auth-service/src/app/auth/`
- `apps/core-service/src/app/prompts/`, `datasets/`, etc.
- `apps/evaluation-service/src/app/evaluation/`, `policies/`, etc.

### Authentication

**Before**: `server/replitAuth.ts` - Replit OIDC
**After**: 
- `apps/auth-service/src/app/auth/` - JWT authentication
- `apps/auth-service/src/app/auth/microsoft/` - Microsoft Entra ID SSO

## API Changes

### Endpoints

Most endpoints remain the same, but now routed through API Gateway:

**Before**: `http://localhost:5000/api/prompts`
**After**: `http://localhost:3000/api/core/prompts` (via API Gateway)

### Authentication

**Before**: Replit session cookies
**After**: JWT tokens in Authorization header

```typescript
// Before
fetch('/api/prompts', { credentials: 'include' })

// After
fetch('/api/core/prompts', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
```

## Environment Variables

### Removed (Replit-specific)

- `REPLIT_DB_URL`
- `REPLIT_USER_ID`
- `REPLIT_USERNAME`
- `REPLIT_OIDC_*`

### Added

- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `AUTH_SERVICE_URL`, `CORE_SERVICE_URL`, etc.
- `REDIS_HOST`, `REDIS_PORT`
- `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`

## Migration Steps

1. **Update Frontend**: Use API Gateway endpoints instead of direct service calls
2. **Update Environment Variables**: Remove Replit-specific vars, add new ones
3. **Database Migration**: Run `npm run db:push` to ensure schema is up to date
4. **Start Services**: Use `npm run dev` to start all services
5. **Test**: Verify all endpoints work through API Gateway

## Breaking Changes

1. **Authentication**: Must use JWT tokens instead of Replit sessions
2. **API Routes**: All routes now go through API Gateway with service prefixes
3. **Service Communication**: Services communicate via HTTP instead of direct calls
4. **Database**: Shared database strategy (can migrate to database-per-service later)

## Rollback Plan

If needed, the old Express.js server code is preserved in `server/` directory. To rollback:

1. Stop NestJS services
2. Start Express.js server: `node server/index.ts`
3. Update frontend to use old endpoints
4. Revert environment variables

## Support

For issues or questions about the migration, see:
- `docs/ARCHITECTURE.md` - Architecture details
- `docs/DEPLOYMENT.md` - Deployment guide
- GitHub Issues - Report bugs or ask questions

