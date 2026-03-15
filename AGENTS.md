# Agent Instructions

This file provides guidance to AI coding agents when working with code in this repository.

You are working on **EvalOps**, a production-ready platform for evaluating, monitoring, and enforcing quality gates on LLM-based features. EvalOps lets you run structured evaluations against prompts, datasets, and agents, enforce pass/fail policies, track costs and drift over time, and ship LLM changes with confidence.

## Project Structure

This is an **Nx monorepo** built as seven NestJS microservices plus a React frontend:

```
apps/
  frontend/                # React 18 + Vite + Shadcn UI (port 4200)
  api-gateway/            # NestJS API Gateway (port 3000) - routing proxy, CORS, JWT forwarding
  auth-service/           # NestJS auth service (port 3001) - users, organizations, JWT auth, RBAC
  core-service/           # NestJS core service (port 3002) - prompts, datasets, agents, eval specs, templates
  evaluation-service/     # NestJS evaluation service (port 3003) - runs, evaluation engine, policies, trace ingestion
  integration-service/    # NestJS integration service (port 3004) - Azure Blob artifacts, webhooks, alerts
  analytics-service/      # NestJS analytics service (port 3005) - dashboard metrics, cost analytics, audit trail

libs/
  shared-db/              # Drizzle ORM schema + migrations, db singleton
  shared-auth/            # JwtAuthGuard, RbacGuard, ServiceAuthGuard, @Roles, @Public
  shared-common/          # LoggingInterceptor, TenantInterceptor, RedisModule, HttpClientService, initTelemetry()
  sdk/                    # Client SDK for trace event ingestion from agents
  evaluators/             # ExactEvaluator, RuleEvaluator, Aggregator — pure TypeScript evaluator logic
  agent-md/               # Parser for the AgentMD YAML format

python_worker/            # FastAPI service for advanced LLM evaluations (port 5055)
```

## Build Instructions

This project uses **npm** as its package manager and **Nx** for monorepo management.

```bash
# Install dependencies
npm install

# Build all projects
npm run build

# Build specific service
npm run build:gateway
npm run build:auth
npm run build:core
npm run build:evaluation
npm run build:integration
npm run build:analytics
npm run build:frontend

# Lint all projects
npm run check
# OR
nx run-many --target=lint --all

# Test all projects
npm test
# OR
npm run test:unit        # Unit tests only
npm run test:e2e         # E2E tests only

# Run specific service
npm run dev              # Start all services concurrently
npm run dev:gateway      # Start API gateway only
npm run dev:auth         # Start auth service only
npm run dev:core         # Start core service only
npm run dev:evaluation    # Start evaluation service only
npm run dev:integration  # Start integration service only
npm run dev:analytics    # Start analytics service only
npm run dev:frontend     # Start frontend only

# Database migrations
npm run db:push          # Push schema to DB directly (dev only)
npx drizzle-kit generate # Generate migration SQL from schema
npx drizzle-kit studio   # Open Drizzle Studio (DB GUI)

# Development with Tilt (recommended)
npm run tilt:up          # Start Tilt dev dashboard
npm run tilt:down         # Stop Tilt

# Quick start (automated setup)
npm run setup            # Checks prerequisites, generates secrets, starts Docker, runs migrations
npm run quick-start      # Uses Tilt if available, otherwise manual start
```

**After making code changes**, always run:

```bash
npm run check && npm test && npm run build
```

## Architecture Overview

### Service Communication

All requests go through the **API Gateway** (port 3000), which routes by path prefix:

| Path prefix          | Downstream Service  | Port |
| -------------------- | ------------------- | ---- |
| `/api/auth/*`        | auth-service        | 3001 |
| `/api/core/*`        | core-service        | 3002 |
| `/api/evaluation/*`  | evaluation-service  | 3003 |
| `/api/integration/*` | integration-service | 3004 |
| `/api/analytics/*`   | analytics-service   | 3005 |

The gateway handles CORS globally and forwards the JWT `Authorization` header unchanged. Downstream services validate the token independently.

### Request Flow

1. **Client** → `api-gateway` (port 3000)

   - Routes by prefix to downstream service
   - Forwards JWT `Authorization` header
   - Handles CORS

2. **Downstream Service** (e.g., `core-service`)

   - `JwtAuthGuard` validates JWT (registered globally via `APP_GUARD`)
   - `TenantInterceptor` sets `app.org_id` Postgres session variable from JWT payload
   - `LoggingInterceptor` emits structured JSON logs with `x-request-id` correlation
   - Row Level Security (RLS) enforces tenant isolation at database level

3. **Database**: All services share PostgreSQL via Drizzle ORM (`libs/shared-db`)

### Security Model

#### Authentication

Every service registers a global `APP_GUARD` that applies `JwtAuthGuard` to all routes. Routes that must be public (login, register, health checks) use the `@Public()` decorator to opt out.

```typescript
// In each service's AppModule
providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }];
```

`JwtAuthGuard` uses `passport-jwt` with the `JWT_SECRET` env var (required at startup).

#### Authorization (RBAC)

Role checks are done with `RbacGuard` + `@Roles()` decorator:

```typescript
@UseGuards(RbacGuard)
@Roles(UserRole.ADMIN)
@Get('users')
getUsers() {}
```

Roles: `admin > org_admin > member > viewer`

#### Service-to-Service Auth

Internal routes (e.g., artifact notify endpoint) are protected by `ServiceAuthGuard`, which checks the `X-Service-Token` header against `SERVICE_SECRET`. The `HttpClientService` shared utility automatically appends this header on all outbound service calls.

#### Multi-Tenant Isolation

Every request sets the PostgreSQL session variable `app.org_id` via `TenantInterceptor` (registered globally via `APP_INTERCEPTOR`). Row Level Security policies on all tables enforce tenant isolation:

```sql
CREATE POLICY tenant_isolation ON prompts
  USING (organization_id = current_setting('app.org_id', true)::uuid);
```

Users without an `organizationId` (e.g., personal accounts) bypass RLS via a separate `NULL` policy.

#### Rate Limiting

The ingestion endpoint (`POST /api/evaluation/ingestion/events`) is rate-limited to 100 requests per user per minute via `RateLimitGuard` (Redis-backed sliding window). The guard degrades gracefully when Redis is unavailable.

## Code Conventions

### NestJS Patterns

- **Dependency Injection**: Use `@Injectable()` decorator and constructor injection
- **Guards**: Use `@UseGuards()` for authentication/authorization (e.g., `JwtAuthGuard`, `RbacGuard`, `ServiceAuthGuard`)
- **Interceptors**: Use `@UseInterceptors()` for cross-cutting concerns (e.g., `LoggingInterceptor`, `TenantInterceptor`)
- **Modules**: Organize by feature domain (e.g., `AuthModule`, `PromptsModule`, `RunsModule`)
- **Services**: Business logic lives in services, not controllers
- **DTOs**: Use `class-validator` and `class-transformer` for request/response validation
- **Global Guards/Interceptors**: Register via `APP_GUARD` and `APP_INTERCEPTOR` providers

### TypeScript Patterns

- **Strict typing**: Use interfaces/types for all data structures
- **Path aliases**: Use `@evalops/` prefix for library imports (e.g., `@evalops/shared-db`, `@evalops/shared-auth`)
- **Error handling**: Use NestJS exceptions (`NotFoundException`, `ForbiddenException`, etc.)
- **Async/await**: Prefer async/await over Promises for readability

### Database Patterns

- **Drizzle ORM**: All database access goes through Drizzle ORM (`libs/shared-db`)
- **Schema organization**: Table definitions organized by domain (`auth.ts`, `core.ts`, `evaluation.ts`, `integration.ts`)
- **Migrations**: Use `drizzle-kit` to generate migrations from schema changes
- **RLS policies**: Row Level Security policies enforce tenant isolation (see `migrations/rls.sql`)

### Shared Libraries

- **shared-db**: Single source of truth for all database schema
- **shared-auth**: Reusable auth primitives (guards, decorators, enums)
- **shared-common**: Cross-cutting concerns (logging, tenant, Redis, HTTP client, telemetry)
- **sdk**: Client SDK for trace event ingestion from agents
- **evaluators**: Pure TypeScript evaluation logic (no NestJS dependencies)
- **agent-md**: Parser for AgentMD YAML format

### Important Boundaries

**DO NOT:**

- Bypass `JwtAuthGuard` or `RbacGuard` for protected routes (use `@Public()` decorator instead)
- Access database directly without using Drizzle ORM
- Skip tenant isolation checks (RLS handles this, but always propagate `organizationId`)
- Use raw `Logger` instead of structured logging via `LoggingInterceptor`
- Call services directly without going through API Gateway (in production)
- Hardcode service URLs (use environment variables)

**DO:**

- Use `@Public()` decorator for public routes (login, register, health checks)
- Use `@Roles()` decorator for role-based access control
- Use `@CurrentUser()` decorator to access current user from JWT
- Use `TenantInterceptor` to set `app.org_id` (already registered globally)
- Use `HttpClientService` for inter-service calls (auto-attaches `X-Service-Token`)
- Use `initTelemetry(serviceName)` in `main.ts` before NestJS bootstrap
- Write tests for all new services, controllers, and guards

## Testing

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run E2E tests only
npm run test:e2e

# Run tests for specific project
nx test core-service
nx test evaluation-service
```

Test files should be co-located with source files: `*.spec.ts` or `*.test.ts`.

## Environment Variables

### Required

- `JWT_SECRET`: Required for JWT token validation (all services)
- `SERVICE_SECRET`: Required for service-to-service authentication
- `DATABASE_URL`: PostgreSQL connection string (e.g., `postgresql://postgres:postgres@localhost:5432/evalops`)

### Optional

- `REDIS_URL`: Redis connection string (defaults to `redis://localhost:6379`)
- `OTEL_EXPORTER_OTLP_ENDPOINT`: OpenTelemetry collector endpoint (defaults to `http://localhost:4317`)
- AI Provider Keys (at least one required):
  - `OPENAI_API_KEY`
  - `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`
  - `ANTHROPIC_API_KEY`
- `GOOGLE_API_KEY`
- `XAI_API_KEY`
- `OPENSANDBOX_SERVER_URL`: OpenSandbox server URL (defaults to `http://localhost:8080`)
- `OPENSANDBOX_API_KEY`: API key for OpenSandbox authentication

See [`.env.example`](.env.example) for the full reference.

## Database

- **PostgreSQL**: All services share a single PostgreSQL database via Drizzle ORM
- **Redis**: Rate limiting, idempotency, caching (optional but recommended)

Run migrations:

```bash
npm run db:push          # Dev only: push schema directly
npx drizzle-kit generate # Generate migration SQL
npx drizzle-kit studio   # Open DB GUI
```

Row Level Security (RLS) policies must be applied once by a superuser (see `libs/shared-db/migrations/rls.sql`).

## API Documentation

Each service exposes interactive Swagger/OpenAPI docs at `/api/docs`:

- API Gateway: http://localhost:3000/api/docs
- Auth Service: http://localhost:3001/api/docs
- Core Service: http://localhost:3002/api/docs
- Evaluation Service: http://localhost:3003/api/docs
- Integration Service: http://localhost:3004/api/docs
- Analytics Service: http://localhost:3005/api/docs

## Git Workflow

1. **Branch naming**: `feature/[description]` or `fix/[description]`
2. **Commit messages**: Follow conventional commits:
   - `feat: [description]` for features
   - `fix: [description]` for bug fixes
   - `refactor: [description]` for refactoring
   - `docs: [description]` for documentation
   - `test: [description]` for tests
3. **PR requirements**:
   - All quality gates must pass (lint, test, build)
   - PR description includes summary of changes
   - Link to related issue if applicable

## Quality Gates

Before considering work complete:

1. **Linting passes**: `npm run check`
2. **Tests pass**: `npm test`
3. **Build succeeds**: `npm run build`
4. **Type checking**: No TypeScript errors

## Context Management

- **Linkage over duplication**: Reference specific files and sections when possible
- **Minimize context**: Read only what you need
- **Use hunks**: When referencing code, point to specific file sections
- **Keep specs stable**: Update documentation when patterns change, but keep core instructions stable

## Related Documentation

- [README.md](README.md) - Getting started guide
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - Detailed architecture
- [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md) - Local development guide
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) - Deployment instructions
- [docs/SECRETS.md](docs/SECRETS.md) - Production secrets management
- [docs/MIGRATION.md](docs/MIGRATION.md) - Migration notes from Express.js monolith

## Key Services Reference

- **API Gateway**: Single entry point, routes by prefix, handles CORS, forwards JWT
- **Auth Service**: User management, organizations, JWT issuance, RBAC
- **Core Service**: Prompts, datasets, agents (AgentMD), eval specs, templates
- **Evaluation Service**: Runs, evaluation engine, policies, trace ingestion
- **Integration Service**: Azure Blob artifacts, webhooks, alerts
- **Analytics Service**: Dashboard metrics, cost analytics, audit trail
- **Python Worker**: FastAPI service for advanced LLM evaluations

### OpenSandbox Integration

EvalOps uses [OpenSandbox](https://github.com/alibaba/OpenSandbox) for secure, isolated code execution:

- **Custom Evaluators**: User-uploaded evaluators execute in isolated sandboxes
- **LLM Code Execution**: Code generated by agents executes safely
- **Python Worker**: Enhanced with sandbox isolation for all code execution

**Services**:

- `integration-service`: Sandbox lifecycle management (`/api/sandboxes`)
- `evaluation-service`: Evaluator execution (`SandboxExecutionService`)

**Security Features**:

- Network egress policies (FQDN-based allowlist)
- Resource limits (CPU, memory, timeout)
- Code validation (AST-based analysis)
- Audit logging and monitoring

See [docs/SANDBOX_INTEGRATION.md](docs/SANDBOX_INTEGRATION.md) for details.

## Evaluation Workflows

### Creating an Evaluation Run

1. Create/select a **dataset** (via `core-service`)
2. Create/select a **prompt** or **agent** (via `core-service`)
3. Create an **eval spec** linking dataset + prompt/agent + evaluators (via `core-service`)
4. Create a **run** from the eval spec (via `evaluation-service`)
5. Optionally ingest **trace events** during agent execution (via SDK)
6. Run completes → **policy engine** evaluates results → pass/warn/fail verdict

### Trace Ingestion

Agents instrumented with the SDK can stream trace events to EvalOps:

```typescript
import { IngestionClient } from '@evalops/sdk';

const client = new IngestionClient({
  baseUrl: 'https://your-evalops.example.com',
  apiKey: '<jwt-token>',
});

await client.ingestEvents([
  {
    runId: 'run-abc',
    type: 'assistant_message',
    timestamp: new Date().toISOString(),
    data: { content: 'Hello world', tokenUsage: { prompt: 10, completion: 5 } },
  },
]);
```

Events are persisted to `runs.trace_events` JSONB column (10 MB cap per run).
