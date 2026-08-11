# EvalOps — Presentation Source

> One file with everything needed to build a deck: problem framing, architecture,
> value proposition, use cases, honest trade-offs, and a roadmap.
> Each `---` section maps to roughly one presentation slide or talking point.

---

## Slide 1 — The Problem

**Shipping LLM features is flying blind.**

Teams integrating AI models face a set of problems that classical QA does not solve:

| Classical QA problem | LLM-specific problem |
|---|---|
| Does the function return the right value? | Does the model *usually* return a useful answer? |
| Did the build break? | Did the prompt drift after a model upgrade? |
| Is the latency within SLA? | Is the cost per call still under budget? |
| Did the schema change? | Did the output format silently change? |
| Are tests passing? | Are policy constraints (safety, tone, PII) still satisfied? |

Without a structured evaluation layer, teams rely on:
- Manual spot-checking in a chat UI
- A/B testing in production (users are the test environment)
- One-off scripts that nobody maintains
- Vibes

**The gap:** There is no "SonarQube for AI" — no tool that enforces quality gates, tracks drift, and blocks deployments when LLM behaviour regresses.

EvalOps fills that gap.

---

## Slide 2 — What EvalOps Is

**EvalOps is a structured evaluation and policy enforcement platform for LLM-based features.**

One-liner: *"SonarQube for AI."*

It does four things:

1. **Run evaluations** — execute structured tests against prompts, agents, and datasets using multiple evaluation strategies (exact match, rule-based, LLM-as-judge, RAG).
2. **Enforce policies** — define pass/warn/fail gates per metric; block CI deployments when thresholds are missed.
3. **Track drift** — store every run result with its cost, trace events, and artifact hashes; surface regressions over time in a dashboard.
4. **Govern agents** — register agents in a standard format (AgentMD), version them, link eval specs to specific agent versions, and enforce the agent contract via CI.

**Positioning:**

| Product | What it does | What EvalOps adds |
|---|---|---|
| Unit tests | Assert on deterministic code | Probabilistic eval over LLM outputs |
| LangSmith / Helicone | Observability / tracing | Policy gates + CI integration + multi-tenant isolation |
| Promptfoo | Local eval CLI | Production deployment, multi-tenant, REST API |
| Braintrust | Eval SaaS | Self-hosted, extensible, org-controlled data |

---

## Slide 3 — Architecture Overview

```
                        Browser / CI Runner
                               │
                          ┌────▼────┐
                          │Frontend │  React 18 + Vite + Shadcn UI  :4200
                          └────┬────┘
                               │ HTTP / REST
                    ┌──────────▼──────────┐
                    │     API Gateway      │  NestJS — JWT forwarding, CORS  :3000
                    └─┬──────┬──────┬─────┘
          ┌───────────┘      │      └──────────────┐
    ┌─────▼────┐   ┌─────────▼──────┐   ┌──────────▼──────┐
    │   Auth   │   │     Core       │   │   Evaluation     │
    │  :3001   │   │    :3002       │   │     :3003        │
    │ Users    │   │ Prompts        │   │ Runs, Policies   │
    │ Orgs     │   │ Datasets       │   │ Trace ingestion  │
    │ JWT/RBAC │   │ Agents         │   │ Policy engine    │
    └──────────┘   │ EvalSpecs      │   └────────┬─────────┘
                   └────────────────┘            │
                                                 ▼
                                        ┌────────────────┐
                                        │ Python Worker  │  FastAPI  :5055
                                        │ LLM-as-judge   │
                                        │ Similarity     │
                                        │ Model-graded   │
                                        └────────────────┘
          ┌──────────────────────────────────────────────────────┐
    ┌─────▼──────┐                              ┌────────────────▼──┐
    │ Integration│                              │    Analytics      │
    │   :3004    │                              │      :3005        │
    │ Azure Blob │                              │ Dashboard metrics │
    │ Webhooks   │                              │ Cost analytics    │
    │ Alerts     │                              │ Audit trail       │
    └────────────┘                              └───────────────────┘
                    ┌──────────────────────────────────┐
                    │   PostgreSQL + Redis              │
                    │   Drizzle ORM / RLS / ioredis     │
                    └──────────────────────────────────┘
```

**Traffic flow for a CI evaluation run:**

```
CI Runner
  → POST /api/evaluation/runs  (API Gateway → Evaluation Service)
  → Evaluation Service resolves EvalSpec → Dataset → Prompt/Agent
  → For each sample: calls AI provider OR delegates to Python Worker
  → Evaluators score each result (TypeScript or Python)
  → Aggregator computes passRate + policy verdict
  → Run record written to PostgreSQL with trace_events JSONB
  → Integration Service fires webhooks (CI callback URL)
  → CI Runner exits 0 (pass) or 1 (fail) based on policy verdict
```

---

## Slide 4 — Technology Stack

| Layer | Choice | Why |
|---|---|---|
| Monorepo | **Nx** | Affected-only builds/tests; shared libs with path aliases; consistent task targets |
| Services | **NestJS 11** | DI container, guard system, interceptors, Swagger auto-gen |
| Frontend | **React 18 + Vite + Shadcn UI** | Fast dev server; TanStack Query for server state; Wouter for routing |
| Database ORM | **Drizzle ORM** | Type-safe SQL; schema-as-code; Drizzle Kit migrations |
| Database | **PostgreSQL 15** | Row Level Security for multi-tenant isolation; JSONB for trace events |
| Cache / Queue | **Redis + ioredis + Bull** | Rate limiting; job queues for long-running evaluations |
| Auth | **JWT + Passport** | Stateless; service-to-service via `X-Service-Token` |
| AI providers | **Vercel AI SDK + direct SDKs** | OpenAI, Azure OpenAI, Anthropic, Gemini, xAI behind a common interface |
| Python worker | **FastAPI + uvicorn** | Heavy NLP evaluation (sentence-transformers, LLM-judge) without polluting Node |
| Observability | **OpenTelemetry SDK** | OTLP gRPC export; compatible with Jaeger, Tempo, Datadog |
| Local dev | **Tilt** | Manages all 8 processes + Docker infra + hot-reload in one dashboard |
| CI | **GitHub Actions** | Lint (affected), type-check, test (Postgres + Redis services), Docker build |
| Agent format | **AgentMD (YAML front-matter)** | Standardised contract for agent definitions; parsed by `libs/agent-md` |
| AI governance | **Repo-local `scripts/agents-md-lint.js`** | AGENTS.md lint gate (self-contained, no external registry) |

---

## Slide 5 — Shared Libraries

The monorepo exposes six libraries that all services import:

```
libs/
  shared-db/      Drizzle ORM schema + migrations + db singleton
                  → Single source of truth for every table
  shared-auth/    JwtAuthGuard, RbacGuard, ServiceAuthGuard
                  @Roles(), @Public(), UserRole enum
                  → Authentication enforced at the framework level
  shared-common/  LoggingInterceptor, TenantInterceptor, RedisModule
                  HttpClientService (auto-injects X-Service-Token)
                  initTelemetry(serviceName) — OTel bootstrap
                  → Cross-cutting concerns in one place
  sdk/            TraceEvent schema, IngestionClient, PII redaction, SHA-256 hashing
                  → Agents instrument themselves with 3 lines of code
  evaluators/     ExactEvaluator (JSON path + tolerance)
                  RuleEvaluator (JSON Schema + invariant conditions)
                  Aggregator (passRate, byEvaluator breakdown)
                  → Pure TypeScript; no NestJS dependency; testable in isolation
  agent-md/       AgentMD types + YAML front-matter parser
                  → Shared between core-service, CLI, and lint tools
```

**Key architectural constraint:** All inter-service HTTP calls go through `HttpClientService`, which auto-attaches the `X-Service-Token` header. No service calls another service directly.

---

## Slide 6 — Evaluation Engine Deep Dive

### Evaluator types

| Type | What it checks | Config |
|---|---|---|
| **ExactEvaluator** | JSON path equality, with optional tolerance and case-insensitivity | `{ path: "$.answer", expected: "Paris", tolerance: 0 }` |
| **RuleEvaluator** | JSON Schema validation + custom invariant conditions | `{ schema: {...}, invariants: ["$.score > 0.5"] }` |
| **LLM-as-judge** | Delegates scoring to a judge model with a rubric prompt | `{ model: "gpt-4o", rubric: "Rate correctness 0-1" }` |
| **RAG evaluator** | Checks retrieval faithfulness and answer groundedness | `{ groundedness: 0.8, faithfulness: 0.9 }` |
| **Safety check** | Pattern-based PII / toxic content detection | via Python worker |
| **Similarity** | Embedding cosine similarity | via Python worker |

### Policy engine

Policies attach to an eval spec and define thresholds:

```typescript
{
  name: "Production Quality Gate",
  rules: [
    { metric: "passRate",     operator: "gte", threshold: 0.9,  severity: "fail" },
    { metric: "cost_usd",     operator: "lte", threshold: 0.05, severity: "warn" },
    { metric: "safety_score", operator: "gte", threshold: 0.99, severity: "fail" },
  ]
}
```

The evaluation runner aggregates results, applies policy rules, and emits an overall verdict: `pass | warn | fail`. The CI runner exits non-zero on `fail` (and optionally on `warn`).

### Trace ingestion

```typescript
// In your agent:
import { IngestionClient } from '@evalops/sdk';

const client = new IngestionClient({ runId, apiKey });
await client.ingest([
  { eventType: 'llm_call', payload: { model, prompt, response, tokens } },
  { eventType: 'tool_call', payload: { tool: 'search', input, output } },
]);
```

Events are batched, SHA-256 hashed for deduplication, PII-redacted, and stored in `runs.trace_events` JSONB.

---

## Slide 7 — Multi-Tenant Architecture

Every table has an `organization_id` column. Tenant isolation is enforced at two levels:

**Level 1 — Application:** `TenantInterceptor` extracts `organizationId` from the JWT payload and attaches it to every Drizzle query via `WHERE organization_id = :orgId`.

**Level 2 — Database:** PostgreSQL Row Level Security (RLS) policies on all tables enforce `app.org_id = organization_id`. The `TenantInterceptor` sets `SET LOCAL app.org_id = ?` at the start of each request.

**Result:** Even if a developer forgets a `WHERE` clause in application code, the database rejects cross-tenant reads.

```
JWT: { sub: user-123, org: org-ABC }
         │
    TenantInterceptor
         │
    SET LOCAL app.org_id = 'org-ABC'
         │
    Drizzle query → PostgreSQL RLS → only org-ABC rows visible
```

RBAC roles (descending privilege): `admin > org_admin > member > viewer`.
`@Roles(UserRole.ORG_ADMIN)` + `RbacGuard` enforce role gates on mutation endpoints.

---

## Slide 8 — AgentMD: The Agent Contract

AgentMD is a YAML front-matter format for defining AI agents as structured, versioned documents.

```yaml
---
name: fraud-detection-agent
version: "2.1.0"
description: Detects fraudulent transactions using pattern matching + LLM scoring
model:
  provider: anthropic
  name: claude-opus-4-7
  temperature: 0.0
tools:
  - transaction_lookup
  - risk_scoring
  - alert_trigger
constraints:
  max_tokens: 4096
  timeout_seconds: 30
---
You are a fraud detection specialist. Given a transaction record,
identify whether it is fraudulent. Always explain your reasoning.
Never decline to answer. Output JSON: { decision, confidence, reasons }.
```

**What this enables:**
- Version-controlled agent definitions (the YAML lives in the repo alongside code)
- Lint gate (`agents-md-validate.yml`) enforces the schema and size limit (<8KB) on every PR
- The `agent-md` parser validates definitions before they're stored via the API
- Eval specs can reference `agentId` + `agentVersion` — you can run evaluations against specific versions

---

## Slide 9 — CI/CD Integration

### For teams adopting EvalOps

```yaml
# .github/workflows/eval-gate.yml
- name: Run evaluation quality gate
  run: |
    npx nx run evaluation-service:run-suite \
      --suite-name="Production Quality Gates" \
      --org-id=${{ secrets.EVALOPS_ORG_ID }} \
      --fail-on-warn=true \
      --output-format=junit \
      --commit-sha=${{ github.sha }}
  env:
    EVALOPS_API_KEY: ${{ secrets.EVALOPS_API_KEY }}
    EVALOPS_API_URL: ${{ secrets.EVALOPS_API_URL }}

- name: Upload test results
  uses: actions/upload-artifact@v4
  with:
    name: eval-results
    path: test-results/simulation-results.xml
```

**Exit codes:** `0` = all pass, `1` = at least one fail (or warn with `--fail-on-warn=true`).

**JUnit output** integrates with GitHub Actions UI, GitLab CI, Jenkins natively.

### EvalOps's own CI

```
Push to main / PR →
  lint (Nx affected) →
  type-check (tsc --noEmit) →
  test (Postgres + Redis as service containers) →
  build (all apps) →
  Docker build + push (tagged with git SHA) →
  Helm deploy (optional, on tag)
```

Additionally:
- `agents-md-validate.yml` — runs on every PR; checks AGENTS.md schema via the repo-local `scripts/agents-md-lint.js`

---

## Slide 10 — Value: For Which Teams?

| Team type | How they use EvalOps | Key value |
|---|---|---|
| **Teams shipping prompts** | Create a dataset of golden examples, define an exact/rule evaluator, wire the gate into CI. Prompt changes that regress accuracy are caught before merge. | Confidence to iterate quickly |
| **Teams building agents** | Define the agent in AgentMD, version it, run eval specs against each version. The trace ingestion SDK captures every tool call for post-run inspection. | Regression detection across agent versions |
| **Platform / infra teams** | Multi-tenant platform with RBAC means they can host evals for multiple product teams without data leakage. Cost analytics show per-team AI spend. | Org-wide cost visibility + governance |
| **Security / compliance** | Safety evaluators check for PII, toxic content, and policy violations. Audit trail logs every mutation with user + timestamp. RLS prevents cross-tenant access. | Evidence for audit and compliance reviews |
| **Data scientists** | Create datasets from production logs, run LLM-as-judge evaluations, inspect trace events for debugging. | Structured experiment tracking |

---

## Slide 11 — Pros (What Works Well)

**Architecture**
- Clean Nx monorepo: shared libs are first-class, affected-only builds keep CI fast.
- Drizzle ORM keeps the schema as TypeScript — type-safe SQL, no ORMagic surprises.
- Python worker offloads heavy NLP (sentence-transformers, LLM-judge) without forcing Python on the Node services.
- OpenTelemetry baked in from the start — not an afterthought.

**Developer experience**
- `npm run setup` + `tilt up` is a genuine one-command path once Docker is running.
- Per-service Swagger docs mean the API is self-documenting.
- `llms.txt` at the root gives AI agents a machine-readable map of every endpoint.
- AgentMD format standardises agent definitions across the whole org.

**Governance**
- `agents-md-validate.yml` enforces the agent contract on every PR via a repo-local linter (`scripts/agents-md-lint.js`) — no external CLI or registry required.
- AGENTS.md slimmed to the three-tier format (what it is / what it can do / what it must not do) — under the 8KB lint limit.

**Evaluator design**
- Pure TypeScript evaluators (`libs/evaluators`) have no NestJS dependency — fully testable in isolation.
- Path-extraction in `ExactEvaluator` handles nested JSON output without custom parsing.
- Policy engine is data-driven (JSON config) — no code deploy required to adjust thresholds.

---

## Slide 12 — Cons and Gaps (Honest Assessment)

**Production readiness (from `docs/archive/ASSESSMENT.md`, 2026-02-22)**

| # | Issue | Risk |
|---|---|---|
| 1 | `JwtAuthGuard` not applied globally on all services | Auth bypass possible on unguarded endpoints |
| 2 | `RbacGuard` + `RateLimitGuard` not wired | Rate limiting and RBAC are dead code until connected |
| 3 | `IngestionService` DB write is stubbed (TODO comment) | Trace events accepted but not persisted |
| 4 | No Drizzle migration files generated | DB schema drifts silently; `db:push` is fine for dev, not production |
| 5 | No artifact storage backend (S3/MinIO/Blob) | `artifact_hashes` stored but actual bytes lost |
| 6 | RLS not enforced everywhere | `docs/archive/ASSESSMENT.md` identifies some controllers without tenant isolation |

**Developer experience**
- **No umbrella CLI.** The only first-party CLI is the CI gate runner (`run-suite`). The everyday loop (create dataset → create prompt → run eval → read results) requires either UI clicks or manual curl commands.
- **Heavy local footprint.** 9 processes (7 Node + 1 Python + 1 gateway) + Postgres + Redis stress a standard laptop.
- **Quick-start uses two `docker run` commands** instead of a compose file — easy to mis-configure.
- **No VS Code task definitions** — 14 `npm run dev:*` variants undiscoverable without reading the README.

**Evaluator gaps**
- Python worker's `exact_match` does not implement the path-extraction logic from TypeScript `ExactEvaluator` — divergence risk.
- `eval_specs` has no `agentId` column yet — you cannot create a spec that runs an agent against a dataset from the UI.
- No test coverage for `libs/sdk`, `libs/evaluators`, or `libs/agent-md`.

**Operational**
- No idempotency in the Python worker evaluation loop — retries cause duplicate scoring.
- Trace events stored as JSONB (unbounded size) — a 10,000-event agent run will degrade query performance.

---

## Slide 13 — Roadmap: Next 90 Days

**Critical (close the production-readiness gap)**

1. Wire `JwtAuthGuard` globally via `APP_GUARD` in all service modules; use `@Public()` for health checks.
2. Create `RedisModule` in `libs/shared-common`; wire `RateLimitGuard` on ingestion + run creation.
3. Connect `IngestionService.ingestEvents()` to Drizzle `runs` update — close the stub.
4. Run `drizzle-kit generate` + commit migration files; add nightly schema-drift CI check.
5. Add `agentId` + `agentVersion` columns to `eval_specs`; update runner to resolve agent definitions.

**DX (make it easy for other teams to adopt)**

6. Build `apps/cli/` — `evalops` umbrella CLI (login, eval run, dataset push, agent publish, doctor).
7. Create `.github/actions/evaluate-pr/` — composite action for PR comment + JUnit upload.
8. Add `"local-lint"` script to `package.json`; add pre-commit hook option.
9. Add `docker-compose.dev.yml` (infra only).

**Test coverage**

10. Add unit tests for `libs/evaluators`, `libs/sdk`, `libs/agent-md`.
11. Add integration test asserting cross-tenant RLS blocks data access.

**Stretch**

12. Move `trace_events` from JSONB column to dedicated `trace_events` table (one row per event).
13. Add `.vscode/tasks.json` with serve/test/swagger tasks.
14. Deprecate `agent-evaluation` project in `PROJECT_INDEX.md`.

---

## Slide 14 — Adoption Path for a New Team

**Day 1 — Install the gate**

```bash
# 1. Register your org
curl -X POST https://evalops.internal/api/auth/register ...

# 2. Create a dataset (golden examples)
curl -X POST https://evalops.internal/api/core/datasets \
  -H "Authorization: Bearer $TOKEN" \
  -d @my-dataset.json

# 3. Create an eval spec
curl -X POST https://evalops.internal/api/core/eval-specs \
  -d '{ "datasetId": "...", "evaluators": [{ "type": "exact", ... }] }'

# 4. Add the CI gate
# → see docs/CLI_REFERENCE.md for the full GitHub Actions snippet
```

**Day 2 — Add your agent**

```bash
# Publish your AgentMD definition
curl -X POST https://evalops.internal/api/core/agents \
  -d @my-agent.md
```

**Day 7 — Read your first dashboard**

- Token cost trends per dataset
- Pass rate over time per eval spec
- Policy violations by severity
- Audit trail of who ran what and when

**After the `evalops` CLI ships (Recommendation A)**, this entire flow collapses to:

```bash
evalops login
evalops dataset push my-dataset.json
evalops eval run my-spec --watch
```

---

## Slide 15 — Summary

**EvalOps in one sentence:** A self-hosted, multi-tenant platform that enforces quality gates on LLM features the same way SonarQube enforces code quality gates — continuously, in CI, with a dashboard.

**The opportunity:** AI teams are shipping LLM features with no structured quality layer. EvalOps fills that gap with a platform that is already architecturally sound.

**The honest gap:** It is not yet production-ready (6 critical items open) and it lacks the DX surface that would make adoption frictionless for new teams (no umbrella CLI, no composite GH Action).

**The three moves that change the picture:**

| # | What | Effort | Impact |
|---|---|---|---|
| A | `evalops` umbrella CLI | ~2 weeks | Collapses the adoption barrier for new teams |
| F | Nightly schema-drift CI | ~2 hours | Closes biggest production risk (silent DB drift) |
| B | `evaluate-pr` GitHub Action | ~4 hours | Zero-friction adoption: one copy-paste to wire a quality gate |

**Result after those three moves:** A platform that any team in the org can wire up in a day, that blocks production regressions in CI, and that accumulates knowledge about evaluation quality over time via the `docs/learnings/shared/` convention.
