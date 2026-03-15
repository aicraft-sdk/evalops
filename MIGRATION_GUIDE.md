# Migration Guide: Replit to Nx Monorepo

This guide documents the migration from the Replit-based setup to the Nx monorepo structure.

## Overview of Changes

### Architecture Changes

1. **Monorepo Structure**: Converted from a single Express.js app to an Nx monorepo with separate frontend and backend apps
2. **Backend Framework**: Migrated from Express.js to NestJS
3. **Authentication**: Replaced Replit OIDC with JWT-based authentication
4. **Build System**: Integrated Nx for build orchestration and caching

### Directory Structure Changes

**Before:**
```
evalops/
├── client/          # React frontend
├── server/          # Express.js backend
├── shared/          # Shared types
└── package.json
```

**After:**
```
evalops/
├── apps/
│   ├── frontend/    # React frontend (moved from client/)
│   └── api/         # NestJS backend (moved from server/)
├── libs/
│   ├── shared/      # Shared types (moved from shared/)
│   └── shared-db/   # Database schema (extracted from shared/)
└── package.json
```

## Authentication Migration

### Before (Replit OIDC)

- Used Replit's OIDC provider
- Session-based authentication with PostgreSQL sessions
- Environment variables: `REPLIT_DOMAINS`, `REPL_ID`, `ISSUER_URL`

### After (JWT)

- JWT token-based authentication
- Tokens stored in localStorage on frontend
- Environment variables: `JWT_SECRET`, `JWT_EXPIRES_IN`

### Migration Steps for Users

1. **Login Flow Changed**:
   - Old: Redirect to `/api/login` (Replit OIDC)
   - New: POST to `/api/auth/login` with email/password, receive JWT token

2. **Token Storage**:
   - Old: Session cookies (handled by browser)
   - New: JWT token in localStorage (managed by frontend)

3. **API Requests**:
   - Old: Cookies sent automatically with `credentials: "include"`
   - New: JWT token sent in `Authorization: Bearer <token>` header

## Code Changes

### Backend Routes Migration

**Before (Express.js):**
```typescript
// server/routes.ts
app.get('/api/prompts', isAuthenticated, async (req, res) => {
  // handler
});
```

**After (NestJS):**
```typescript
// apps/api/src/prompts/prompts.controller.ts
@Controller('prompts')
@UseGuards(JwtAuthGuard)
export class PromptsController {
  @Get()
  async getPrompts() {
    // handler
  }
}
```

### Frontend Imports

**Before:**
```typescript
import type { User } from "@shared/schema";
```

**After:**
```typescript
import type { User } from "@evalops/shared";
```

### Database Access

**Before:**
```typescript
import { db } from "./db";
import * as schema from "@shared/schema";
```

**After:**
```typescript
import { db } from "@evalops/shared-db";
import * as schema from "@evalops/shared-db";
```

## Environment Variables

### Removed Variables

- `REPLIT_DOMAINS` - No longer needed
- `REPL_ID` - No longer needed
- `ISSUER_URL` - No longer needed

### New Variables

- `JWT_SECRET` - Secret key for signing JWT tokens
- `JWT_EXPIRES_IN` - Token expiration time (e.g., "7d", "24h")

### Updated Variables

- `ALLOWED_ORIGINS` - Now used for CORS configuration (comma-separated list)

## Build and Development

### Before

```bash
npm run dev        # Single command for both frontend and backend
npm run build     # Build both
```

### After

```bash
npm run dev                    # Run both frontend and backend
npm run dev:frontend          # Run only frontend
npm run dev:api               # Run only backend
npm run build                 # Build both
npm run build:frontend        # Build only frontend
npm run build:api             # Build only backend
```

## Testing

### Before

Tests were in `server/__tests__/` and `client/src/test/`

### After

- Backend tests: `apps/api/src/__tests__/`
- Frontend tests: `apps/frontend/src/test/`
- Use Nx test commands: `nx test api`, `nx test frontend`

## Database Migrations

The database schema remains unchanged. However, the Drizzle config location changed:

**Before:**
```bash
drizzle-kit push
```

**After:**
```bash
npm run db:push
# or
drizzle-kit push --config=libs/shared-db/drizzle.config.ts
```

## Deployment Changes

### Before (Replit)

- Deployed directly on Replit platform
- Used Replit's database and file storage
- Replit-specific deployment configuration

### After

- Standard deployment options:
  - Docker containers
  - Cloud platforms (AWS, GCP, Azure)
  - Platform-as-a-Service (Railway, Render, etc.)
- Requires external PostgreSQL database (Neon, Supabase, etc.)
- Requires external file storage (S3, etc.) if needed

## Breaking Changes

1. **Authentication API**: Login endpoint changed from `/api/login` to `/api/auth/login`
2. **Import Paths**: All `@shared` imports must be updated to `@evalops/shared` or `@evalops/shared-db`
3. **Session Management**: No longer uses server-side sessions; uses stateless JWT tokens
4. **Development Mode**: Default user creation in development mode may need adjustment

## Migration Checklist

- [x] Nx workspace initialized
- [x] Shared libraries created
- [x] Backend migrated to NestJS
- [x] Frontend moved to apps/frontend
- [x] Authentication replaced with JWT
- [x] Environment variables updated
- [x] Build configuration set up
- [x] Tests migrated
- [ ] All Express routes migrated to NestJS controllers (in progress)
- [ ] All services migrated to NestJS services (in progress)
- [ ] Frontend login page updated for JWT
- [ ] Microsoft Entra ID integration tested
- [ ] Python worker integration verified

## Next Steps

1. Complete migration of all Express routes to NestJS controllers
2. Migrate all services to NestJS services with dependency injection
3. Update frontend login page to use new JWT authentication
4. Test all endpoints and features
5. Update CI/CD pipelines if applicable
6. Deploy to new environment

## Support

For issues or questions about the migration, please refer to:
- Nx documentation: https://nx.dev
- NestJS documentation: https://docs.nestjs.com
- Project README.md

