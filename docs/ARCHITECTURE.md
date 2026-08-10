# EvalOps Architecture

## Overview

EvalOps is a microservices platform built as an Nx monorepo. Four NestJS services communicate through a single API Gateway. All services share a PostgreSQL database via Drizzle ORM and an optional Redis instance for rate limiting and idempotency.

---

## Service Map

```
Client (browser / SDK)
        │
        ▼
┌──────────────────┐
│   API Gateway    │  :3000  NestJS proxy — CORS, JWT forwarding, routing
└───────┬──────────┘
        │  Routes by prefix
   ┌────┴─────────────────────────┐
   │              │                │
   ▼              ▼                ▼
Auth :3001   Core :3002       Eval :3003
             (+ integration
              + analytics)
                  │                │
                  ▼                ▼
             ┌────────────────────────┐
             │   PostgreSQL + Redis   │
             └────────────────────────┘
```

### API Gateway (port 3000)

Single entry point. Proxies all `/api/<prefix>/*` requests to the matching downstream service using `@nestjs/http-proxy-middleware` (or direct Axios). Handles CORS globally. Enforces `JwtAuthGuard` at the gateway itself (registered as `APP_GUARD`, alongside `ThrottlerGuard`) — unauthenticated requests are now rejected here rather than only downstream. Routes that must stay public opt out with `@Public()`, e.g. the GitHub webhook sub-path (`/api/integration/webhooks/github/*`, which authenticates via HMAC signature, not a Bearer JWT) and the gateway's own scaffold root route. The gateway also rejects path-traversal sequences (including percent-encoded and backslash forms) in the proxied path before forwarding. Downstream services still validate the token independently as a second layer of defense.

Path routing:

| Path prefix | Downstream |
|-------------|------------|
| `/api/auth/*` | auth-service :3001 |
| `/api/core/*` | core-service :3002 |
| `/api/evaluation/*` | evaluation-service :3003 |
| `/api/integration/*` | core-service :3002 |
| `/api/analytics/*` | core-service :3002 |

### Auth Service (port 3001)

Owns all identity concerns. Exposes:
- `POST /api/auth/register` / `POST /api/auth/login` — issue JWTs (local strategy via Passport)
- `GET /api/auth/user` — return current user from JWT
- `GET|POST /api/auth/users` — user management (admin only)
- `GET /api/auth/organizations/:id` — fetch an organization (any authenticated user)
- `POST /api/auth/organizations` — self-service organization creation: any authenticated
  user may create a brand new organization and becomes its `ORG_ADMIN` via an
  `organization_members` row; rate-limited to 5 creations/60s per user via
  `RateLimitGuard`/`@RateLimit`
- `POST /api/auth/admin/organizations/:id` — admin-only update of an *existing*
  organization's name (admin only, enforced by `RbacGuard`, validated by
  `UpdateOrganizationDto`)
- `POST /api/auth/admin/*` — admin panel routes (admin only, enforced by `RbacGuard`)

JWT payload shape:

```typescript
{
  sub: string;        // user ID
  email: string;
  role: UserRole;     // 'admin' | 'org_admin' | 'member' | 'viewer'
  organizationId: string | null;
}
```

### Core Service (port 3002)

Manages all durable entities that eval specs reference, plus the integration and analytics
functionality formerly owned by the now-decommissioned `integration-service` and
`analytics-service` (see "Integration and Analytics (within Core Service)" below):
- **Prompts** — versioned LLM prompt strings with variable placeholders
- **Datasets** — collections of `{input, expectedOutput, metadata}` samples
- **Agents** — AgentMD-formatted agent definitions with model configs and versions
- **Eval Specs** — evaluation configurations linking dataset + prompt/agent + evaluator list + model config
- **Templates** — reusable prompt template patterns
- **Providers / Models** — registered AI provider credentials and model registry

### Evaluation Service (port 3003)

The evaluation engine:
- **Runs** — execution of an eval spec; tracks status, results, scores, cost
- **Ingestion** — accepts streaming trace events from SDK-instrumented agents via `POST /api/evaluation/ingestion/events`; persists to `runs.trace_events` JSONB (10 MB cap per run)
- **Evaluation engine** — orchestrates evaluators (exact match, LLM judge, rule-based, RAG metrics, safety)
- **Policy engine** — compares run scores to policy thresholds; emits pass/warn/fail verdicts. Policies are self-service: `GET /api/evaluation/policies` (any authenticated user), `POST /api/evaluation/policies/evaluate/:runId`, and `POST`/`PUT /api/evaluation/policies/:id`/`DELETE /api/evaluation/policies/:id` to create, update, and delete org-scoped policies (org_admin / admin only, enforced by `RbacGuard`) — no direct SQL seeding required

### Integration and Analytics (within Core Service)

`integration-service` and `analytics-service` were permanently deleted; both apps' real
functionality now lives inside `core-service` via `libs/core-integration` and
`libs/core-analytics` respectively. The API Gateway routes both `/api/integration/*` and
`/api/analytics/*` to `core-service :3002`.

Integration (`libs/core-integration`):
- **Artifacts** — stores run outputs in Azure Blob Storage; serves presigned SAS download URLs; receives completion notifications from evaluation-service via `POST /artifacts/:runId/notify` (protected by `ServiceAuthGuard`)
- **Webhooks** — outbound webhook delivery on run completion events
- **Alerts** — configurable alerting on policy failures

Analytics (`libs/core-analytics`):
- **Dashboard** — aggregated metrics: total runs, pass rate, avg cost, p95 latency
- **Cost analytics** — per-provider, per-model token cost breakdown over time
- **Audit trail** — append-only log of every mutation across the platform

---

## Security Model

### Authentication

Every service registers a global `APP_GUARD` that applies `JwtAuthGuard` to all routes. Routes that must be public (login, register, health checks) use the `@Public()` decorator to opt out.

```typescript
// In each service's AppModule
providers: [
  { provide: APP_GUARD, useClass: JwtAuthGuard },
]
```

`JwtAuthGuard` uses `passport-jwt` with the `JWT_SECRET` env var. The secret is required at startup — the service will throw `Error('JWT_SECRET is required')` rather than fall back to a default.

### Authorization (RBAC)

Role checks are done with `RbacGuard` + `@Roles()` decorator:

```typescript
@UseGuards(RbacGuard)
@Roles(UserRole.ADMIN)
@Get('users')
getUsers() {}
```

Roles: `admin > org_admin > member > viewer`

### Service-to-Service Auth

Internal routes (e.g., the artifact notify endpoint) are protected by `ServiceAuthGuard`, which checks the `X-Service-Token` header against `SERVICE_SECRET`. The `HttpClientService` shared utility automatically appends this header on all outbound service calls.

### Multi-Tenant Isolation

Every request sets the PostgreSQL session variable `app.org_id` via `TenantInterceptor` (registered globally via `APP_INTERCEPTOR`). Row Level Security policies on all tables enforce:

```sql
CREATE POLICY tenant_isolation ON prompts
  USING (organization_id = current_setting('app.org_id', true)::uuid);
```

Users without an `organizationId` (e.g., personal accounts) bypass RLS via a separate `NULL` policy.

The `organization_members` table (added for self-service organization creation — see
`docs/2026-08-10-self-service-organization-creation-decision.md`) is the one exception to
the blanket `tenant_isolation` pattern above: its INSERT policy checks
`user_id = current_setting('app.user_id', true)` instead of `organization_id = app.org_id`,
because a user creating a new org legitimately writes a membership row for an org that
differs from their current session's `app.org_id`.

### Rate Limiting

The ingestion endpoint (`POST /api/evaluation/ingestion/events`) is rate-limited to 100 requests per user per minute via `RateLimitGuard` (Redis-backed sliding window). The guard degrades gracefully when Redis is unavailable.

`POST /api/auth/organizations` (self-service organization creation) is rate-limited to 5 creations per user per 60s using the same `RateLimitGuard`/`@RateLimit` mechanism, to prevent a single authenticated user from spinning up unbounded organizations.

---

## Shared Libraries

### `libs/shared-db`

Single source of truth for all database schema. All services import from `@evalops/shared-db`.

- `src/lib/schema/` — Drizzle table definitions organized by domain:
  - `auth.ts` — users, organizations, permissions
  - `core.ts` — prompts, datasets, flows, agents, agent_versions, eval_specs, templates, organization_members
  - `evaluation.ts` — runs, policies, policy_violations, baselines
  - `integration.ts` — webhooks, audit_log
- `src/lib/db.ts` — `db` singleton (Drizzle over `postgres-js`)
- `migrations/` — generated SQL migration files
- `migrations/rls.sql` — Row Level Security policies (must be run once by a superuser)

### `libs/shared-auth`

Reusable auth primitives:
- Guards: `JwtAuthGuard`, `RbacGuard`, `RateLimitGuard`, `ServiceAuthGuard`
- Decorators: `@Public()`, `@Roles(...roles)`, `@CurrentUser()`, `@RateLimit({ttl, limit})`
- Enums: `UserRole`

### `libs/shared-common`

Cross-cutting concerns:
- `LoggingInterceptor` — structured JSON request/response logs with `x-request-id` correlation
- `TenantInterceptor` — sets `app.org_id` Postgres session variable from JWT payload
- `RedisModule` — global `@Global()` module providing `REDIS_CLIENT` token (`ioredis`)
- `HttpClientService` — Axios wrapper that auto-attaches `X-Service-Token`
- `initTelemetry(serviceName)` — OpenTelemetry SDK bootstrap (call before NestJS bootstrap)

### `libs/sdk`

Client SDK used by agent applications to stream trace events to EvalOps:

```typescript
import { IngestionClient } from '@evalops/sdk';

const client = new IngestionClient({
  baseUrl: 'https://your-evalops.example.com',
  apiKey: '<jwt-token>',
});

await client.ingestEvents([{
  runId: 'run-abc',
  type: 'assistant_message',
  timestamp: new Date().toISOString(),
  data: { content: 'Hello world', tokenUsage: { prompt: 10, completion: 5 } },
}]);
```

### `libs/evaluators`

Pure TypeScript evaluation logic (no NestJS dependencies):
- `ExactEvaluator` — strict/fuzzy string matching, numeric tolerance, dot-path extraction
- `RuleEvaluator` — JSON schema validation, invariant conditions, partial scoring
- `Aggregator` — computes pass rates and per-evaluator summaries across samples

### `libs/agent-md`

Parser for the AgentMD format — YAML front-matter describing an agent's identity and model configuration:

```markdown
---
name: my-rag-agent
version: "1.2.0"
description: Answers questions from a knowledge base
model:
  provider: openai
  name: gpt-4o
  temperature: 0.1
tools:
  - retrieval
  - code_interpreter
---

You are a helpful assistant...
```

---

## Data Flow: Trace Ingestion

```
Agent (SDK)
    │
    │ POST /api/evaluation/ingestion/events
    │ { events: TraceEvent[], idempotencyKey? }
    ▼
Evaluation Service — IngestionController
    │
    ├─ IdempotencyService → Redis (dedup check)
    ├─ Group events by runId
    └─ DatabaseStorageService.appendTraceEvents()
           │
           └─ UPDATE runs
              SET trace_events = COALESCE(trace_events,'[]') || $events
              WHERE id = $runId
              -- Guard: reject if > 10 MB

    (On run complete)
    │
    │ POST /api/integration/artifacts/:runId/notify  [X-Service-Token]
    ▼
Core Service (libs/core-integration) — ArtifactsController.notifyRunComplete()
    └─ Logs artifact hashes, triggers async post-processing
```

---

## Observability

### Structured Logging

`LoggingInterceptor` (registered globally in every service, including `api-gateway` and `auth-service`) emits pino-backed JSON on every request:

```json
{
  "requestId": "uuid",
  "traceId": "otel-trace-id",
  "spanId": "otel-span-id",
  "method": "GET",
  "path": "/api/core/prompts",
  "statusCode": 200,
  "durationMs": 42,
  "organizationId": "org-abc",
  "userId": "user-123"
}
```

`LoggingExceptionFilter` (registered globally as `APP_FILTER`) is a backstop that emits the same log shape for requests rejected by a Guard (e.g. a 401 from `JwtAuthGuard`) before they ever reach `LoggingInterceptor`. `requestTimingMiddleware` stamps arrival time before Guards run so `durationMs` stays accurate even for guard-rejected requests.

### OpenTelemetry

`initTelemetry(serviceName)` is called in each service's `main.ts` before NestJS bootstraps. It instruments HTTP, PostgreSQL, and Redis automatically via `@opentelemetry/auto-instrumentations-node`, exporting traces via OTLP gRPC to `OTEL_EXPORTER_OTLP_ENDPOINT` (default `http://localhost:4317`).

To run a local Jaeger collector:

```bash
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 4317:4317 \
  jaegertracing/all-in-one:latest
```

Then set:

```env
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

Traces appear at http://localhost:16686.

### Swagger / OpenAPI

Each service exposes interactive API docs at `/api/docs`:

| Service | URL |
|---------|-----|
| API Gateway | http://localhost:3000/api/docs |
| Auth Service | http://localhost:3001/api/docs |
| Core Service | http://localhost:3002/api/docs |
| Evaluation Service | http://localhost:3003/api/docs |

---

## Deployment Architecture

See [`docs/DEPLOYMENT.md`](DEPLOYMENT.md) for full instructions.

```
Internet
    │
    ▼
Ingress (nginx / Traefik)
    │
    ▼
api-gateway  (Deployment, 2+ replicas)
    │
    ├─► auth-service       (Deployment)
    ├─► core-service       (Deployment)
    └─► evaluation-service (Deployment)

frontend  (nginx static, Deployment)

PostgreSQL  (Bitnami Helm chart or managed cloud)
Redis       (Bitnami Helm chart or managed cloud)
```

All configuration is in `helm/evalops/`. Secrets are managed via Kubernetes Secrets + External Secrets Operator (see [`docs/SECRETS.md`](SECRETS.md)).
