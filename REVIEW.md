# EvalOps — Project Review

**Date**: 2026-05-22
**Branch reviewed**: `feat/agents-md-cli-migration` (now merged to `main`)
**Reviewer**: Platform Team / AI Governance

---

## What EvalOps Is

EvalOps is the canonical org-wide evaluation platform — "SonarQube for AI." It runs structured evaluations against prompts, datasets, and agents; enforces pass/warn/fail policy gates; tracks token costs and drift over time; and gives teams the confidence to ship LLM changes. It is built as an Nx monorepo: seven NestJS microservices plus a React frontend plus a FastAPI Python worker, all behind a single API Gateway. Multi-tenant isolation is enforced via PostgreSQL Row Level Security. Agents are defined in the AgentMD YAML format, versioned, and evaluated against named datasets. An SDK instruments agents at runtime and streams trace events back to the platform.

---

## Value Adds

| Capability | Concrete value |
|---|---|
| **Policy engine** | Define pass/warn/fail gates per metric; non-zero exit code blocks CI |
| **Multi-provider support** | OpenAI, Azure OpenAI, Anthropic, Gemini, xAI — swap without schema changes |
| **Evaluation engine (TypeScript)** | `ExactEvaluator` (path extraction + tolerance), `RuleEvaluator` (schema + invariants), `Aggregator`, LLM-as-judge, RAG evaluators, safety checks |
| **Python worker** | `exact_match`, `model_graded`, `similarity` — wraps heavy NLP libs without polluting the Node services |
| **Trace ingestion** | SDK instruments agents in-flight; events stream to `runs.trace_events` (JSONB) for post-run replay/audit |
| **AgentMD format** | Standardised YAML front-matter for agent definitions; parser in `libs/agent-md`; lint gate in CI (`agents-md-validate.yml`) |
| **Cost analytics** | Per-run token cost tracking across all providers in `analytics-service` |
| **Audit trail** | Every mutation logged with user, org, timestamp |
| **Azure Blob artifacts** | SHA-256 content hashing + SAS URL download for run artifacts |
| **OpenTelemetry** | OTLP gRPC export from every service; drop-in with Jaeger/Tempo/Datadog |
| **Recall / compound-nightly** | Automated learning extraction from git history, promoted to `docs/learnings/shared/` nightly |
| **AGENTS.md lint gate** | `agents-md-validate.yml` runs on every PR; blocks merges when the agent contract exceeds the 8KB limit or fails schema rules |

---

## DX Reality Check — Is It Easy to Use Today?

### What works well

- **`npm run setup` → `tilt up`** is a credible one-command local path for developers who have Docker + Node 20.
- **Per-service Swagger** at `/api/docs` on each port means API exploration does not require a frontend.
- **`llms.txt`** at the root gives AI agents a machine-readable API map — good for self-service tooling.
- **`docs/CLI_REFERENCE.md`** documents the existing `run-suite` contract (env vars, flags, exit codes, JUnit output) clearly.
- **Tiltfile** handles Docker networking, Postgres, Redis, Python venv, and hot-reload for all 8 processes in one file.
- **AgentMD + lint gate** means the agent contract is enforced in CI from day one.

### Where developers will struggle

- **Heavy local footprint.** 7 Node services + Python FastAPI + Postgres + Redis means ~9 processes to manage. On a 16GB laptop this is borderline.
- **No umbrella CLI for the core loop.** The only first-party CLI today (`npx nx run evaluation-service:run-suite`) is for CI gate usage, not for the everyday "create dataset → create prompt → run eval → view results" loop. New devs must hand-curl through the gateway or click through the UI. There is no `evalops login && evalops eval run my-spec`.
- **`tools/scripts/` is empty.** The previous `agents-md-lint.cjs` was removed as part of this branch. A developer running `ls tools/` now sees only a README — the locally-runnable lint is gone unless they know to reach for `npx @bcai/ai-resources-cli tools linter/agents-md-lint` themselves.
- **`ASSESSMENT.md` still flags 6 critical blockers** (as of 2026-02-22): RLS not enforced everywhere, `IngestionService` DB write stubbed, no migration files generated, artifact storage missing, auth guards inconsistent, `RateLimitGuard` DI wiring broken. These are not DX issues per se but mean the platform cannot be positioned as production-ready to external teams yet.
- **The quick-start instructs two separate `docker run` commands** for Postgres and Redis. Easy to mistype; no compose file covers the "just infrastructure" case.
- **14 `npm run dev:*` variants** with no `.vscode/tasks.json` to help contributors discover them.
- **`project-config.json` references a `$schema` at `../ai_resources/...`** — valid in monorepo context but breaks for anyone cloning evalops standalone.

---

## Recommendations (Ordered by ROI)

### A — First-class `evalops` CLI ⭐ (highest ROI)

Create `apps/cli/` as a new Nx Node app. Expose:

```
evalops login                         # stores JWT to ~/.evalops/credentials
evalops eval run <spec-name>          # triggers run-suite, streams progress
evalops dataset push <file.json>      # POST /api/core/datasets
evalops agent publish <agent.md>      # POST /api/core/agents (parses AgentMD locally first)
evalops policy check <run-id>         # GET policy verdict, print pass/warn/fail
evalops doctor                        # see recommendation D
```

Reuse the `EVALOPS_API_KEY`/`EVALOPS_API_URL` env contract already documented in `docs/CLI_REFERENCE.md`. Distribute as `npx @evalops/cli`. This collapses the "I need to curl" gap and makes the platform self-service.

### B — GitHub Action: `evalops/evaluate-pr`

A composite action in `.github/actions/evaluate-pr/action.yml`:

```yaml
inputs:
  suite-id: required
  org-id: required
  api-key: required
  fail-on-warn: default 'false'
outputs:
  decision: pass | warn | fail
  report-path: path to junit XML
```

Wraps `run-suite` exit code, posts a PR comment with the verdict table, uploads the JUnit artifact. Minimal new code — all the logic is already in `evaluation-service:run-suite`. Teams adopt EvalOps gates in one copy-paste.

### C — `npm run local-lint` script

Add to `package.json`:
```json
"local-lint": "npx @bcai/ai-resources-cli tools linter/agents-md-lint"
```
and optionally add it to a pre-commit hook (husky or lefthook). This restores the local lint that was lost when `tools/scripts/agents-md-lint.cjs` was deleted, without re-introducing the ESM workaround.

### D — `evalops doctor` (as part of recommendation A)

Replaces `scripts/setup-check.sh` with a typed TypeScript command inside the CLI. Checks:
- Node version ≥ 20
- Docker reachability (`docker info`)
- Postgres connection (`DATABASE_URL`)
- Redis ping (`REDIS_HOST:REDIS_PORT`)
- Required env vars (`JWT_SECRET`, `SERVICE_SECRET`, at least one AI key)

Prints a colour-coded summary. Ships with the CLI so new contributors run `npx @evalops/cli doctor` before filing setup issues.

### E — `docker-compose.dev.yml` (infrastructure only)

Add a minimal compose file that brings up only Postgres and Redis:

```yaml
# docker-compose.dev.yml — infra only, no app services
services:
  postgres:
    image: postgres:15-alpine
    ports: ["5432:5432"]
    environment: { POSTGRES_DB: evalops, POSTGRES_USER: postgres, POSTGRES_PASSWORD: postgres }
    volumes: [postgres_data:/var/lib/postgresql/data]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
volumes:
  postgres_data:
```

Usage: `docker compose -f docker-compose.dev.yml up -d`. Replaces the two-`docker run` quick-start step; trivially copyable into CI.

### F — CI nightly schema-drift check

Add `.github/workflows/nightly-schema-drift.yml`:

```yaml
- name: Check schema drift
  run: npx drizzle-kit generate --config=libs/shared-db/drizzle.config.ts
- name: Fail on uncommitted migrations
  run: git diff --exit-code libs/shared-db/migrations/
```

Runs nightly against `main`. Directly closes ASSESSMENT item #4 ("no database migrations for new schema") and prevents the DB from drifting silently between deploys.

### G — VS Code task definitions (stretch)

`.vscode/tasks.json` with tasks for:
- "Serve: api-gateway", "Serve: evaluation-service" (etc.) — wraps `nx serve <name>`
- "Test: affected" — `nx affected --target=test`
- "Open Swagger: core-service" — `open http://localhost:3002/api/docs`

Contributors stop memorising the 14 `npm run dev:*` variants.

---

## Verdict

**For the internal platform team:** EvalOps is usable today via `tilt up`. The governance layer added on this branch (AGENTS.md lint, compound-nightly, recall, project-config) puts it ahead of most internal platforms in AI observability discipline.

**For external or less-senior adopters:** The heavy service footprint + no umbrella CLI + 6 open critical items in `ASSESSMENT.md` means they will hit friction quickly. The three highest-ROI moves that close most of that gap with bounded effort are:

1. **Recommendation A** — `evalops` CLI (collapses the "how do I actually use this" gap)
2. **Recommendation F** — nightly schema-drift CI (closes the biggest production-readiness risk)
3. **Recommendation B** — `evaluate-pr` GitHub Action (zero-friction adoption for other teams)

Everything else is polish on top of a solid foundation.
