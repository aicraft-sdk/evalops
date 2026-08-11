# EvalOps Platform — Assessment

**Date**: 2026-02-22
**Version**: post-Plan-05 merge
**Author**: Platform Team

---

## Executive Summary

EvalOps is now the **canonical evaluation platform** for the AI Agent Platform, consolidating the best of both the original `evalops` and the retired `agent-evaluation` projects.
The merge adds AgentMD support, trace event ingestion, enhanced evaluators, an SDK library, and foundational security/observability constructs.

This document describes the current state, what still needs to be built to call this production-ready, and what bugs/design issues need to be fixed.

---

## What Was Merged (Plan 05)

| Feature | Source | Status |
|---|---|---|
| `libs/sdk` — TraceEvent schema, IngestionClient, hashing, PII redaction | agent-evaluation | ✅ Added |
| `libs/evaluators` — ExactEvaluator (path+tolerance), RuleEvaluator (schema+invariants), Aggregator | agent-evaluation | ✅ Added |
| `libs/agent-md` — AgentMD types + parser | agent-evaluation | ✅ Added |
| `agents` + `agent_versions` tables | agent-evaluation | ✅ Added |
| `runs.agentId`, `runs.agentVersion`, `runs.traceEvents`, `runs.artifactHashes` | agent-evaluation | ✅ Added |
| `IngestionModule` in evaluation-service | agent-evaluation | ✅ Added (stub) |
| `AgentsModule` in core-service | agent-evaluation | ✅ Added |
| `RbacGuard` + `@Roles()` decorator | agent-evaluation | ✅ Added to shared-auth |
| `RateLimitGuard` + `@RateLimit()` decorator | agent-evaluation | ✅ Added to shared-auth |
| `UserRole` enum | agent-evaluation | ✅ Added to shared-auth |
| `tsconfig.base.json` path aliases for new libs | — | ✅ Updated |

---

## What Is Missing for a Solid Production System

### Critical (Blocking Production)

#### 1. Authentication is not enforced on most endpoints
- **Problem**: `JwtAuthGuard` is defined in `shared-auth` but it is not applied globally or consistently across services. `AgentsController`, `IngestionController`, and many other controllers have no `@UseGuards()` decorator.
- **Fix**: Apply `JwtAuthGuard` as a global guard in each NestJS app module (`APP_GUARD` provider), then use `@Public()` to whitelist health checks. Or apply guards consistently on all controllers.

#### 2. `RbacGuard` and `RateLimitGuard` are not wired anywhere
- **Problem**: The guards were created but no endpoint uses `@Roles()` or `@RateLimit()` yet. No Redis client is injected for `RateLimitGuard`.
- **Fix**: Wire Redis (`ioredis`) via a shared `RedisModule`. Apply `@Roles()` to sensitive mutation endpoints (create/delete agents, eval spec management). Apply `@RateLimit()` to ingestion and evaluation run creation.

#### 3. `IngestionModule` is stubbed — trace events are not persisted
- **Problem**: `IngestionService.ingestEvents()` groups events by runId but does not call the database. The DB write is noted as a TODO.
- **Fix**: Inject `DatabaseStorageService` (or a new `RunsRepository`) into `IngestionService`. Add `appendTraceEvents(runId, events)` method that does a Drizzle `UPDATE runs SET trace_events = $1 WHERE id = $2`. Also wire the runs table reference from `StorageModule`.

#### 4. No database migrations for new schema
- **Problem**: The `agents`, `agent_versions` tables and new `runs` columns (`agent_id`, `agent_version`, `trace_events`, `artifact_hashes`) exist in the Drizzle schema but `npm run db:push` has not been run. This means the DB is out of sync.
- **Fix**: Run `drizzle-kit generate` to create migration files, then `drizzle-kit push` or integrate into the deployment pipeline. Add migration verification to CI.

#### 5. No S3 / object storage for artifacts
- **Problem**: `runs.artifact_hashes` stores content hashes but the actual artifact bytes have no storage backend. `agent-evaluation` had S3 with signed URLs.
- **Fix**: Integrate an S3-compatible storage adapter (AWS S3, MinIO, Azure Blob). Add `ArtifactsService` that uploads blobs and returns a signed URL. Store the URL alongside the hash in the runs record. Alternatively add BYTEA columns in PostgreSQL for small artifacts.

#### 6. No multi-tenant isolation (PostgreSQL RLS)
- **Problem**: `agent-evaluation` had PostgreSQL Row Level Security policies. EvalOps uses Drizzle `WHERE organizationId = $1` clauses, but there is no database-level enforcement. A bug or missing WHERE clause can leak cross-tenant data.
- **Fix**: Implement PostgreSQL RLS policies on all tables containing `organization_id`. Set `SET app.current_org_id = ?` at the start of each request via a Drizzle middleware or NestJS interceptor. Alternatively add integration tests that verify cross-tenant isolation.

---

### High Priority (Pre-Production)

#### 7. No OpenTelemetry observability
- **Problem**: `agent-evaluation` had OpenTelemetry traces and metrics. EvalOps uses `console.log` and basic Winston logging. There are no distributed traces, no latency histograms, no error rate metrics.
- **Fix**: Add `@opentelemetry/sdk-node`, `@opentelemetry/instrumentation-nestjs-core`, and `@opentelemetry/instrumentation-http`. Create a `libs/observability` Nx lib exporting `OtelModule` with `TracingService` and `MetricsService`. Export to OTLP (Jaeger/Tempo/Datadog).

#### 8. AgentMD parser depends on `js-yaml` as an optional peer dep
- **Problem**: The `AgentMDParser` does a dynamic `require('js-yaml')` that will fail with a cryptic error if the package is not installed. `js-yaml` is not in `evalops/package.json`.
- **Fix**: Add `js-yaml` and `@types/js-yaml` as dependencies. Remove the dynamic require and use a direct import. Alternatively switch to `yaml` (the npm package) which ships its own types.

#### 9. No service-to-service JWT authentication
- **Problem**: The microservices call each other without authentication (e.g. evaluation-service calls core-service). `agent-evaluation` had service tokens.
- **Fix**: Implement short-lived service JWTs signed with a shared secret (`SERVICE_JWT_SECRET` env var). Add `ServiceAuthGuard` that validates the `X-Service-Token` header on inter-service routes. Issue tokens at startup in each service.

#### 10. `RateLimitGuard` constructor signature is incompatible with NestJS DI
- **Problem**: `RateLimitGuard` expects a generic redis-like object but does not use `@Inject()` — it relies on the consumer passing the Redis client via the constructor. This will fail when NestJS tries to instantiate it as a provider.
- **Fix**: Change the constructor to use `@Inject('REDIS_CLIENT')` and `@Optional()`. Provide a no-op fallback if Redis is unavailable. Ensure consuming modules provide `'REDIS_CLIENT'` token.

#### 11. Missing frontend pages for agents
- **Problem**: The React frontend has pages for prompts, datasets, eval specs, runs, and policies — but no UI for the new agents feature.
- **Fix**: Add `AgentsPage`, `AgentDetailPage`, `AgentVersionHistoryPage` components following the existing Shadcn/TanStack Query pattern. Add routes in the Wouter router.

#### 12. `evalSpecs` cannot reference agents
- **Problem**: `eval_specs` links to `prompt_id` or `flow_id` but has no `agent_id` column. You cannot create an eval spec that runs an agent against a dataset.
- **Fix**: Add optional `agentId` and `agentVersion` columns to `eval_specs`. Update the evaluation runner to resolve the agent definition when an eval spec has an agent reference.

---

### Medium Priority

#### 13. Python worker has no ExactEvaluator / RuleEvaluator equivalents
- **Problem**: The Python worker (`python_worker/`) implements `model_graded`, `exact_match`, and `similarity` but does not have the path-extraction or schema-validation evaluators added in `libs/evaluators`.
- **Fix**: Add `exact_path` and `rule` evaluator types to the Python worker's evaluator registry. Keep them in sync with the TypeScript implementations.

#### 14. No webhook / CI integration for agent-based runs
- **Problem**: CI/CD integration (`libs/cicd`) triggers evaluation runs but has no concept of agent runs. It only triggers prompt-based or flow-based runs.
- **Fix**: Extend the `cicd` schema and `integration-service` to support triggering agent evaluations when a new agent version is pushed.

#### 15. Idempotency service has no Redis in production configuration
- **Problem**: `IngestionModule` provides a no-op Redis stub. In production, duplicate event batches will be reprocessed.
- **Fix**: Replace the stub with a real `ioredis` client bound to `REDIS_URL`. Ideally create a shared `RedisModule` in `libs/shared` that all services import.

#### 16. `AgentsService` calls `storage.createAgent()` but the method returns only the `id`
- **Problem**: The return type of `createAgent` was defined to return just the `id` string, but `AgentsService.create()` needs to return an object `{ id }`. This is consistent but callers expecting a full `Agent` object will need to call `findOne()` afterward.
- **Fix**: Currently acceptable. Document in JSDoc that the full agent can be retrieved via `findOne()`. Or change `createAgent` to return the full `Agent` object (preferred for single round-trips).

#### 17. No test coverage for new libs
- **Problem**: `libs/sdk`, `libs/evaluators`, `libs/agent-md` have no test files.
- **Fix**: Add unit tests:
  - `exact-evaluator.spec.ts` — path extraction, tolerance, case-insensitive
  - `rule-evaluator.spec.ts` — schema validation, invariant conditions
  - `aggregator.spec.ts` — passRate calculation, byEvaluator grouping
  - `redaction.spec.ts` — PII patterns, object recursion
  - `hashing.spec.ts` — deterministic, SHA-256

---

### Low Priority / Nice-to-Have

#### 18. No API documentation (OpenAPI / Swagger)
- **Problem**: None of the NestJS apps have `@nestjs/swagger` configured. External consumers have no schema to work from.
- **Fix**: Add `SwaggerModule.setup()` in each app's `main.ts`. Decorate DTOs and controllers with `@ApiProperty`, `@ApiOperation` annotations.

#### 19. No rate limits on evaluation run creation
- **Problem**: A single org can trigger unlimited evaluation runs, potentially overwhelming the Python worker and AI provider rate limits.
- **Fix**: Apply `@RateLimit({ ttl: 60, limit: 10 })` on `POST /runs` in the evaluation-service.

#### 20. `agent-evaluation` project not yet marked deprecated in `PROJECT_INDEX.md`
- **Problem**: `PROJECT_INDEX.md` still lists `agent-evaluation` as an active project. This may confuse developers.
- **Fix**: Update `PROJECT_INDEX.md` — mark `agent-evaluation` as `[DEPRECATED — merged into evalops]` and point to evalops.

---

## What Needs to Be Fixed (Bugs / Design Issues)

### Bug: `IngestionService` injects unused `db` and `runs` parameters
The `IngestionService` constructor signature defines `db` and `runs` parameters that are typed but never used. The actual DB integration is stubbed. This will cause a NestJS DI error unless the parameters are removed or properly wired.
**Fix**: Either remove `db` and `runs` until the full wiring is done, or inject `DatabaseStorageService` properly via `StorageModule`.

### Bug: `DatabaseStorageService` imports `eq` twice (was already imported, now `and` was added separately)
In the updated `database-storage.service.ts`, `eq` was already imported from `drizzle-orm` and `and` was added in the same import statement. No duplicate — this is fine. But it was originally `import { eq, desc }` and is now `import { eq, and, desc }` — this is correct.

### Design Issue: `runs.traceEvents` is JSONB with no size limit
Storing full trace event arrays in a JSONB column will cause performance problems for long agent runs with thousands of events.
**Fix**: Move trace events to a dedicated `trace_events` table with one row per event (runId FK, eventIndex, eventType, payload). Keep a summary object in `runs.metrics`.

### Design Issue: `IdempotencyService.redis` constructor param type uses a hand-rolled interface
The Redis interface is typed as a minimal duck-typed object. This will cause issues when ioredis is swapped for another client.
**Fix**: Use `import type { Redis } from 'ioredis'` as the type, or create a `RedisClient` interface in `libs/shared`.

### Design Issue: `AgentMDParser` swallows parse errors as warnings
When AgentMD content fails to parse, the parser returns an empty/partial `AgentMD` with errors in `parseErrors[]`. The caller (AgentsService) only logs a `warn`. This means malformed agent definitions are silently stored.
**Fix**: In `AgentsService.create()`, if `parseErrors` contains any critical errors (missing `metadata.name`, missing `model.provider`), throw a `BadRequestException` with the list of errors rather than storing a broken definition.

---

## Summary Table

| Category | Count |
|---|---|
| Critical (blocking production) | 6 |
| High priority | 7 |
| Medium priority | 5 |
| Low priority | 3 |
| Bugs | 2 |
| Design issues | 4 |
| **Total action items** | **27** |

---

## Recommended Next Steps (Priority Order)

1. **Run DB migrations** — `drizzle-kit generate && drizzle-kit push` to sync new schema
2. **Wire IngestionService to DB** — connect trace event persistence to the runs table
3. **Add global JWT guard** — enforce authentication across all services
4. **Wire RateLimitGuard with Redis** — create `RedisModule` in `libs/shared`
5. **Add js-yaml dependency** — fix AgentMDParser peer dep issue
6. **Add OTel observability** — create `libs/observability` with NestJS tracing module
7. **Add S3 artifact storage** — attach MinIO/S3 for run artifact blobs
8. **Implement PostgreSQL RLS** — add row-level security policies
9. **Add agent eval spec support** — link eval specs to agents
10. **Deprecate agent-evaluation** — update PROJECT_INDEX.md
