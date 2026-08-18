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
- `GET /api/auth/microsoft` / `GET /api/auth/microsoft/callback` — Microsoft Entra SSO login,
  implemented in `ee/sso` (`@evalops/ee-sso`'s `MicrosoftAuthController`, wired into
  `AuthModule`) and gated by `@RequiresEntitlement('sso')` + `EntitlementGuard`: with no valid
  Enterprise license configured, both routes return `403` with an upsell body
  (`{ upsell: true, feature: 'sso' }`) instead of reaching `MicrosoftAuthService` — the first
  Enterprise-gated route to go live in this codebase (see
  `docs/2026-08-13-sso-relocation-and-entitlement-gating-decision.md`). Free-tier login
  (`/api/auth/login`, `/api/auth/user`) is unaffected regardless of license state.
- `GET|POST /api/auth/admin/custom-roles`, `PATCH|DELETE /api/auth/admin/custom-roles/:id` — CRUD
  for org-scoped custom RBAC roles, implemented in `ee/rbac-custom-roles`
  (`@evalops/ee-rbac-custom-roles`'s `CustomRolesController`, mounted inside the existing
  `PermissionsModule`), enforced by `RbacGuard`/`@Roles(UserRole.ADMIN)` and gated by
  `@RequiresEntitlement('rbac-custom-roles')` + `EntitlementGuard` — the third Enterprise-gated
  route to go live (see `docs/2026-08-13-custom-rbac-entitlement-gating-decision.md`). A custom
  role can never mutate or delete an `isSystemRole: true` built-in role; this invariant is
  enforced unconditionally in `CustomRolesService`, independent of license state. The pre-existing
  free `UserRole`-enum role assignment (`POST /admin/users/:id/role`, the 3 built-in system roles)
  is unaffected.

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
- **Golden sets & calibration** — `GoldenSetsController` (any authenticated org member, via `JwtAuthGuard`): `GET`/`POST /api/evaluation/golden-sets`, `GET`/`POST /api/evaluation/golden-sets/:id/examples`, `GET`/`POST /api/evaluation/golden-sets/:id/calibration-runs`. Curates human-labeled example sets and runs `CalibrationService` to measure an LLM-judge evaluator's Cohen's-kappa agreement with human labels — see the `judge-cache.ts`/`golden-sets.ts` schema entries below and `docs/2026-08-12-calibration-methodology-and-kappa-safeguards-decision.md`
- **PR decoration** — `POST /api/evaluation/pr-decoration` (new, `ee/pr-decoration`'s
  `PrDecorationController`, co-located directly in `evaluation-service`'s `AppModule`) builds a
  structured per-scenario decoration payload for a completed run, gated by
  `EntitlementGuard`/`@RequiresEntitlement('pr-decoration')` — the fourth and final
  Enterprise-gated route to go live (see "Enterprise Directory" below and
  `docs/2026-08-14-pr-decoration-entitlement-gating-decision.md`). `.github/actions/evaluate-pr`
  gained an opt-in `enable-pr-decoration` input (defaults `false`) that calls this endpoint
  best-effort after the free pass/fail CI gate runs; the gate itself is unaffected by entitlement
  state.

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
- **Audit trail** — append-only log of every mutation across the platform. `GET
  /api/audit-trail` (`AuditController`, free tier, unchanged) returns the paginated view. `GET
  /api/audit-trail/export` (new, `ee/audit-export`'s `AuditExportController`) streams a CSV of
  the same org-scoped audit entries, gated by `EntitlementGuard`/`@RequiresEntitlement
  ('audit-export')` — the second Enterprise-gated route to go live, after SSO (see "Enterprise
  Directory" below and `docs/2026-08-13-audit-export-entitlement-gating-decision.md`). CSV
  fields are escaped against formula/CSV-injection (leading `=`/`+`/`-`/`@`/tab/CR characters)
  and the `?limit` query param is validated and capped at 5000 via `AuditExportQueryDto`.

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
  - `judge-cache.ts` — `judge_cache`: deterministic cache of LLM-judge scoring results, keyed on a hash of (evaluator, org, sample, output, prompt fingerprint, model, seed); unique index on `cache_key`, RLS-scoped by `organization_id`. Written via `JudgeCacheRepository` (`src/lib/repositories/judge-cache.repository.ts`). Landed as Phase 2 of the judge-caching-and-calibration plan (`docs/2026-08-12-judge-result-caching-decision.md`); as of Phase 3, all 12 `EvaluatorsLLMService` judge methods route through `JudgeCacheService.getOrCompute`, with `organizationId` threaded from `EvaluationRunnerService.evaluateSample` through the `EvaluatorsService` facade — see `docs/2026-08-12-judge-cache-wiring-and-model-resolution-decision.md`
  - `golden-sets.ts` — `golden_sets` (human-curated example sets), `golden_set_examples` (labeled input/output/expected examples with `human_label`/`is_bad_example` flags, FK to `golden_sets`), `calibration_runs` (per-golden-set judge agreement stats: `agreement_rate`, `kappa`, `is_calibrated`, `is_reliable`, `sample_count`, `disagreements`, FK to `golden_sets`); all three RLS-scoped by `organization_id`. Written via `GoldenSetsRepository` (`src/lib/repositories/golden-sets.repository.ts`). Landed as Phase 4 (schema only) of the judge-caching-and-calibration plan; as of Phase 5, `computeCohensKappa` (`apps/evaluation-service/src/app/evaluation/calibration/cohens-kappa.ts`) and `CalibrationService.runCalibration` (`.../calibration/calibration.service.ts`) dispatch all 12 judge types, binarize scores at `judgeThreshold`, and persist agreement/kappa stats with safeguards against fabricated kappa from swallowed judge failures — see `docs/2026-08-12-calibration-methodology-and-kappa-safeguards-decision.md`. `CalibrationService` is exposed via its own `GoldenSetsModule`/`GoldenSetsController` (`GET/POST /golden-sets`, `:id/examples`, `:id/calibration-runs`), registered in `app.module.ts` (Phase 6); as of Phase 7, the frontend's **Golden Sets** UI (`apps/frontend/src/pages/golden-sets.tsx`, `golden-set-detail.tsx`, routed at `/golden-sets` and `/golden-sets/:id`) consumes these endpoints via `/api/evaluation/golden-sets` for listing/creating sets, labeling examples, and triggering/reviewing calibration runs
- `src/lib/db.ts` — `db` singleton (Drizzle over `postgres-js`)
- `src/lib/dialect-utils.ts` — dialect-agnostic query/error helpers shared across repositories, including `isUniqueConstraintViolation(error)` (checks Postgres `23505` and better-sqlite3 `SQLITE_CONSTRAINT_UNIQUE` codes)
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

### `libs/licensing`

Offline, signed license/entitlement engine for the Enterprise tier (open-core model — see
`docs/2026-08-13-enterprise-licensing-entitlement-engine-decision.md`). `EntitlementService`
verifies an `EVALOPS_LICENSE_KEY`-configured license envelope (Ed25519 signature, public key
committed at `src/lib/keys/license-public-key.pem`) via `LicenseVerifierService`, and exposes a
total (never-throwing) `hasFeature(feature: EnterpriseFeature)` check — features are
`'sso' | 'rbac-custom-roles' | 'audit-export' | 'pr-decoration'`. Fails closed on any
missing/malformed/expired license (`LicenseState.status`: `none | valid | expired_grace |
expired | malformed`), with a 14-day `expired_grace` window before the entitlement fully lapses.
`@RequiresEntitlement(feature)` + `EntitlementGuard` mirror `@Roles()`/`RbacGuard` from
`libs/shared-auth`, for future route-level gating. `LicenseModule.forRoot()` registers the
module (test-overridable public key). `scripts/licensing/sign-license.ts` (`npm run
license:sign`) issues dev/test license envelopes via `signLicenseEnvelope()`. As of this phase,
`apps/auth-service` imports `LicenseModule.forRoot()` and gates the relocated Microsoft Entra
SSO routes (`ee/sso`) with `EntitlementGuard`/`@RequiresEntitlement('sso')` — the first
real route/feature gating by this library (see "Auth Service" above and
`docs/2026-08-13-sso-relocation-and-entitlement-gating-decision.md`); no free-tier route or
behavior is affected. `apps/core-service` now also imports `LicenseModule.forRoot()` and gates
the new `GET /api/audit-trail/export` route (`ee/audit-export`) with the same
`EntitlementGuard`/`@RequiresEntitlement('audit-export')` pattern — the second Enterprise-gated
route to go live; the existing free `GET /api/audit-trail` view is unchanged (see "Integration
and Analytics" above and `docs/2026-08-13-audit-export-entitlement-gating-decision.md`).
`apps/auth-service`'s existing `PermissionsModule` also now imports `CustomRolesModule`
(`ee/rbac-custom-roles`), gating org-scoped custom RBAC role CRUD behind
`EntitlementGuard`/`@RequiresEntitlement('rbac-custom-roles')` — the third Enterprise-gated
route to go live; the existing free `UserRole`-enum role assignment is unchanged (see "Auth
Service" above and `docs/2026-08-13-custom-rbac-entitlement-gating-decision.md`).
`apps/evaluation-service` now also imports `LicenseModule.forRoot()` and gates the new `POST
/api/evaluation/pr-decoration` route (`ee/pr-decoration`) with the same
`EntitlementGuard`/`@RequiresEntitlement('pr-decoration')` pattern — the fourth and final
Enterprise-gated route to go live, closing out the `EnterpriseFeature` union's originally-planned
scope (see "Evaluation Service" above and
`docs/2026-08-14-pr-decoration-entitlement-gating-decision.md`).

---

## Enterprise Directory (`ee/`)

Proprietary Enterprise-tier code lives under `ee/`, licensed separately under `ee/LICENSE`
(not open source, distinct from the root `LICENSE` FSL-1.1-MIT that governs the rest of the
repository — see `docs/2026-08-13-fsl-relicensing-and-ee-directory-decision.md`). It is gated
at runtime by `libs/licensing`'s `EntitlementGuard`.

Structural exclusion from the OSS build is enforced by `@nx/enforce-module-boundaries`
`depConstraints` in `eslint.config.mjs`: no `scope:shared`/`scope:core-integration`/
`scope:core-analytics` library may import `scope:enterprise` (`ee/*`). `apps/frontend`
(`scope:frontend`), `apps/cli` (`scope:cli`), and `apps/api-gateway` (`scope:api-gateway`)
each carry an explicit `onlyDependOnLibsWithTags: ['scope:shared']` constraint with no
`scope:enterprise`, structurally forbidding them from importing `ee/*` — most notably
`apps/frontend`, a Vite browser bundle where an accidental `ee/*` import would ship
proprietary code into the public frontend bundle. Only the composition-root apps
(`auth-service`, `core-service`, `evaluation-service`) may import `ee/*`, and only behind
an `EntitlementGuard`-protected route.

`ee/sso` (`@evalops/ee-sso`) is the first `ee/*` library actually imported by a composition-root
app: it holds the Microsoft Entra SSO connector (`MicrosoftAuthController`,
`MicrosoftAuthService`), relocated out of `apps/auth-service` and wired into `AuthModule` behind
`EntitlementGuard`/`@RequiresEntitlement('sso')`. It depends on user-provisioning behavior
(`findUserByEmail`/`createUserFromMicrosoft`/`updateUserFromMicrosoft`/`login`) via a
`SSO_USER_PROVISIONER` DI-token interface (`SsoUserProvisioner`) rather than importing
`AuthService` directly, so `ee/sso` has no compile-time dependency on `apps/auth-service`
internals; `AuthModule` binds `{ provide: SSO_USER_PROVISIONER, useExisting: AuthService }`. See
`docs/2026-08-13-sso-relocation-and-entitlement-gating-decision.md`.

`ee/audit-export` (`@evalops/ee-audit-export`) is the second `ee/*` library imported by a
composition-root app: `AuditExportController`/`AuditExportService`, wired into `core-service`'s
`AppModule` behind `EntitlementGuard`/`@RequiresEntitlement('audit-export')`, expose `GET
/api/audit-trail/export`. It builds a CSV of the same org-scoped audit entries the free `GET
/api/audit-trail` view (`AuditController`, `libs/core-analytics`) already returns —
`organizationId` is read only from `@CurrentUser()`'s verified JWT claim, never from a client-
suppliable param, mirroring `AuditController`'s org-scoping. CSV field values are escaped
against formula/CSV-injection before being written, and the `?limit` query param is validated
and capped at 5000 via `AuditExportQueryDto`. See
`docs/2026-08-13-audit-export-entitlement-gating-decision.md`.

`ee/rbac-custom-roles` (`@evalops/ee-rbac-custom-roles`) is the third `ee/*` library imported by
a composition-root app: `CustomRolesController`/`CustomRolesService`, mounted inside
`auth-service`'s existing `PermissionsModule` behind
`EntitlementGuard`/`@RequiresEntitlement('rbac-custom-roles')`, expose CRUD for org-scoped
custom RBAC roles (`GET|POST /api/admin/custom-roles`, `PATCH|DELETE
/api/admin/custom-roles/:id`). `organizationId` is read only from `@CurrentUser()`'s verified
JWT claim, mirroring `ee/sso`/`ee/audit-export`'s org-scoping. A custom role can never mutate or
delete a role with `isSystemRole: true`; that invariant is enforced unconditionally inside
`CustomRolesService`, independent of license state. Shipping this feature also surfaced and fixed
a pre-existing CRITICAL bug: `PermissionsService.isSystemAdmin()` previously granted unconditional
admin access to any role whose *name* contained "admin"/"superuser", which this phase's own
user-namable custom roles made directly exploitable; it now correctly requires
`role.isSystemRole === true && role.priority >= 100`. See
`docs/2026-08-13-custom-rbac-entitlement-gating-decision.md`.

`ee/pr-decoration` (`@evalops/ee-pr-decoration`) is the fourth and final `ee/*` library imported
by a composition-root app, completing the `EnterpriseFeature` union's originally-planned scope:
`PrDecorationController`/`PrDecorationService` are declared directly inside
`evaluation-service`'s `AppModule` (not a separate library-owned module) behind
`EntitlementGuard`/`@RequiresEntitlement('pr-decoration')`, exposing `POST
/api/evaluation/pr-decoration`. It looks up the target run via a `RUN_LOOKUP` DI-token
(`RunLookup` structural interface), mirroring `ee/sso`'s `SSO_USER_PROVISIONER` pattern, so it
has no compile-time dependency on `evaluation-service`'s concrete `RunsService`; `organizationId`
is checked against `@CurrentUser()`'s verified JWT claim, mirroring the org-scoping convention
from the other three `ee/*` libraries. `.github/actions/evaluate-pr` gained an opt-in
`enable-pr-decoration` input (default `false`) that calls this endpoint best-effort after the
free CI gate runs, never affecting the gate's own pass/fail outcome. Co-locating the
controller/service directly in `AppModule` (rather than a separate `PrDecorationModule`) was
required to fix a real DI-scoping boot crash found during this phase — see
`docs/2026-08-14-pr-decoration-entitlement-gating-decision.md` for the full history.

This is a lint-time, static-AST boundary, not a runtime sandbox: `@nx/enforce-module-boundaries`
only inspects `import`/`import()` nodes, so a `require()`/`eval()` call naming an `ee/*` path
is invisible to it. A compensating `no-restricted-syntax` ESLint rule in `eslint.config.mjs`
flags the obvious literal-string `require()`/`eval()`/dynamic-`import()` cases naming `ee/*` or
`@evalops/ee-*`, but does not catch arbitrary obfuscation (dynamically constructed strings,
indirect `eval`, etc.) — see `ee/README.md`'s "Known limitation" section for the accepted-risk
framing. The real runtime boundary is `EntitlementGuard` plus code review, not the lint rule.

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
