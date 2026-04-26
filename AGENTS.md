# AGENTS.md — EvalOps

## Project / Scope

EvalOps is a platform for evaluating, monitoring, and enforcing quality gates on
LLM-based features. It runs structured evaluations against prompts, datasets, and
agents; enforces pass/fail policies; and tracks costs and drift over time.

Nx monorepo with npm. Seven NestJS microservices plus a React frontend:

```
apps/
  frontend/           React 18 + Vite + Shadcn UI (port 4200)
  api-gateway/        NestJS routing proxy, CORS, JWT forwarding (port 3000)
  auth-service/       Users, organizations, JWT auth, RBAC (port 3001)
  core-service/       Prompts, datasets, agents, eval specs (port 3002)
  evaluation-service/ Evaluation engine, policies, trace ingestion (port 3003)
  integration-service/ Azure Blob artifacts, webhooks, alerts (port 3004)
  analytics-service/  Dashboard metrics, cost analytics, audit (port 3005)

libs/
  shared-db/    Drizzle ORM schema + migrations, db singleton
  shared-auth/  JwtAuthGuard, RbacGuard, ServiceAuthGuard, @Roles, @Public
  shared-common/ LoggingInterceptor, TenantInterceptor, RedisModule, HttpClientService
  sdk/          Client SDK for trace event ingestion
  evaluators/   ExactEvaluator, RuleEvaluator, Aggregator (pure TypeScript)
  agent-md/     Parser for the AgentMD YAML format

python_worker/  FastAPI service for advanced LLM evaluations (port 5055)
```

All client requests go through `api-gateway` (port 3000), which routes by path prefix
(`/api/auth/*`, `/api/core/*`, `/api/evaluation/*`, `/api/integration/*`,
`/api/analytics/*`).

## Non-Negotiable Constraints

- Every service must register `JwtAuthGuard` globally via `APP_GUARD`. Public routes
  opt out with `@Public()` — never disable the global guard.
- Multi-tenant isolation is enforced via PostgreSQL Row Level Security (`app.org_id`
  session variable set by `TenantInterceptor`). Always propagate `organizationId`.
- Use `HttpClientService` for inter-service calls — it auto-attaches `X-Service-Token`.
  Never call downstream services directly without the service token header.
- All database access goes through Drizzle ORM (`libs/shared-db`). No raw SQL outside
  migration files except RLS policy definitions.
- Use structured logging via `LoggingInterceptor`. Do not use raw `console.log` or
  `Logger` in production code paths.
- Ingestion endpoint rate limit (100 req/user/min via Redis) must not be bypassed.

## Build, Run & Test

```bash
# Install
npm install

# Build / lint / test
npm run build          # all projects
npm run check          # lint all (or: nx run-many --target=lint --all)
npm test               # all tests

# Dev servers
npm run dev            # all services concurrently (recommended)
npm run dev:gateway    # API gateway only

# Database
npm run db:push        # push schema (dev only)

# Quality gate
npm run check && npm test && npm run build
```

Tilt is recommended for local multi-service development: `npm run tilt:up`.

## Security & Safety

- `JWT_SECRET` is required at startup for all services — fail-fast if missing.
- Do not commit secrets, database credentials, or API keys. Use environment variables.
- RLS policies enforce tenant isolation at the database level; do not disable or bypass.
- `ServiceAuthGuard` on internal routes checks `X-Service-Token` against `SERVICE_SECRET`.
- Rate limiting on ingestion endpoints is Redis-backed; degrades gracefully when Redis
  is unavailable — do not remove the guard.
- RBAC roles in descending privilege: `admin > org_admin > member > viewer`. Always
  use `@Roles()` + `RbacGuard` for admin routes.

## Agent Operating Rules

- Read the relevant app `README.md` before modifying a service.
- Dependency injection only — no direct instantiation of services or guards.
- DTOs must use `class-validator` and `class-transformer` decorators.
- Use `@evalops/` path aliases for cross-library imports.
- Test files are co-located with source: `*.spec.ts` or `*.test.ts`.
- Before closing a task: `npm run check && npm test && npm run build` must all exit 0.
- Use `initTelemetry(serviceName)` in `main.ts` before NestJS bootstrap for every service.
- **Learnings**: Team knowledge in `docs/learnings/shared/`; run `recall compound` after sessions and `recall promote` to share findings team-wide.
