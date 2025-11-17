
# EvalOps Control Plane — Replit MVP Build Brief (TypeScript)

## 1) Purpose
Build a “SonarQube for AI” MVP that enforces measurable quality gates on LLM features using evaluators, datasets, and policies. The platform must let teams define evaluations, run them reproducibly against Azure/OpenAI deployments or Prompt Flow pipelines, and block releases when policies are not met.

## 2) Outcomes (what success looks like)
- Teams can register prompts/flows, datasets, and evaluation specs.
- A run can be executed from the UI and via CI, producing metrics, costs, and a pass/warn/fail decision based on policies.
- Decision logs are auditable (who changed what, when, and why).
- Runs are reproducible: same artifacts + same seeds + same config ⇒ statistically consistent outcomes within confidence bands.
- Baselines are versioned and drift against current runs is visible.

## 3) Scope of this MVP (build now)
- **Control Plane (TS)**: REST API + UI to manage artifacts (prompts, flows, datasets, eval specs, baselines, policies, runs).
- **Evaluation Engine (TS)**: First‑class metrics for exact‑match / schema‑validity / LLM‑as‑judge (pairwise win‑rate with k repeats).
- **Adapters**:
  - Azure/OpenAI inference adapter (completion/chat, embeddings not required for MVP).
  - Prompt Flow adapter (discover and trigger flows marked as “test/eval”; capture inputs/outputs/latency).
- **Policies & Quality Gates**: Declarative policies evaluated after each run; decision recorded and displayed.
- **Auth & RBAC**: Email-based sign‑in and roles: Admin, Editor, Viewer. (Enterprise SSO via Microsoft Entra ID is planned for a later phase.)
- **Artifact Versioning**: Immutability guarantees with content hash and human semantic version; baselines pinned to versions.
- **Storage**: Postgres (or a managed Postgres) for metadata + Blob-like storage (Replit-hosted file store for MVP) for large artifacts and run outputs.
- **Secrets**: Centralized configuration for Azure/OpenAI endpoints, keys, and Prompt Flow workspaces.
- **CI Hook**: Minimal GitHub check endpoint that returns pass/warn/fail for a given commit SHA and evaluation id.

## 4) Out of scope (defer)
- Full OpenAI Evals Python runner integration (we emulate core evaluators in TS for now).
- Multi-cloud model matrix, red‑teaming suites, or safety taxonomies beyond PII/jailbreak smoke tests.
- Complex orchestrations or custom sandboxing. No containerized workers in MVP.
- SSO with Entra, SCIM provisioning, and fine‑grained resource ACLs (keep a simple role model).

## 5) Key concepts and entities
- **Prompt**: A versioned prompt definition (content + metadata). May reference a model/deployment hint.
- **Flow**: External executable pipeline reference (Prompt Flow id and parameters).
- **Dataset**: Tabular or JSONL samples with ground truth where applicable. Each dataset is versioned and immutable.
- **Eval Spec**: A configuration that binds {artifact(s), dataset, evaluators, repetitions, seeds, model config}. No code in the spec.
- **Run**: A concrete execution of an eval spec producing raw outputs, metrics, cost, and a decision.
- **Baseline**: A tagged run to compare against for regressions (quality or cost).
- **Policy**: Declarative thresholds and statistical tests that map metrics to pass/warn/fail outcomes.

## 6) Determinism & statistical rigor (MVP rules)
- Always run with fixed random seeds and **k ≥ 3** repetitions for LLM‑as‑judge metrics.
- Report mean, standard deviation, and bootstrap confidence intervals for critical metrics.
- Gate decisions must reference evidence (metric values, CI bounds, baseline deltas, sample links).

## 7) Evaluation capabilities (MVP)
- **Exact/Partial Match**: String or field‑level comparison for extraction tasks.
- **Schema Validity**: JSON schema validation and function‑tool call shape checks.
- **LLM‑as‑Judge (Pairwise)**: Compare candidate vs baseline responses with an independent judge model; supports small juries (multiple models); computes win‑rate and significance approximation.
- **Operational Metrics**: Latency (P50/P95), cost accounting (input/output tokens, total cost), error rate, retry rate.

## 8) Quality gates (examples of decisions; implement as declarative rules)
- Block if JSON schema validity < 100%.
- Warn if total cost increased more than a fixed percentage versus baseline.
- Block if pairwise win‑rate over baseline < threshold **and** statistically significant.
- Warn if latency P95 exceeds a service SLO.

## 9) UI guidelines (style & flows)
- **Style**: Clean enterprise aesthetic, light/dark modes, spacious layout, sans‑serif typography, crisp data tables, and focused dialogs. Avoid visual clutter. Clear status badges (pass/warn/fail).
- **Primary screens**:
  - *Dashboard*: recent runs, policy outcomes, drift indicators, cost trends.
  - *Artifacts*: prompts, flows, datasets with version history and diff view (metadata‑only diff).
  - *Eval Specs*: create/edit forms; preview of the impact set (which tests will run).
  - *Runs*: list and detail views with metrics, cost, artifacts used, and the final decision with evidence.
  - *Policies*: rule sets with simulation mode (dry‑run against historical runs).
  - *Auditing*: who changed what and when; exportable as CSV/JSON.
- **UX details**: “Run now” button; dry‑run (no model calls) for sanity checks; pagination for large datasets; deeplinks to failing samples for manual adjudication.

## 10) Authentication & roles (MVP)
- Email link or one‑time code sign‑in.
- Roles:
  - **Admin**: manage settings, secrets, and policies.
  - **Editor**: create/edit artifacts and run evals.
  - **Viewer**: read‑only access, download reports.
- Organization scoping: all resources belong to an org; users may belong to multiple orgs.

## 11) Integrations
- **Azure/OpenAI**: configurable provider with deployment name, API version, endpoint, and key per environment.
- **Azure Prompt Flow**: registry of flows by workspace; ability to trigger test‑marked flows; capture inputs/outputs and timing.
- **GitHub**: simple status check endpoint that returns pass/warn/fail for a given commit + eval id (consumed by a GitHub Action or manual script later).

## 12) Storage & data retention
- Metadata and metrics in Postgres (or a managed Postgres). For Replit, a single Postgres instance is sufficient.
- Large payloads (raw outputs, per‑sample traces) stored in a blob‑like file store; keep at most N most recent runs per eval in MVP settings.
- Retention policy: default 30–60 days for raw traces; metrics and decisions retained longer for auditing.

## 13) Secrets & configuration (to set in Replit)
- Provider keys and endpoints for Azure/OpenAI (per environment).
- Optional Prompt Flow workspace identifiers and auth.
- Database DSN.
- Feature flags: enable/disable LLM‑as‑judge, set default repetitions, enable cost accounting.

## 14) CI integration (minimal for MVP)
- An HTTP endpoint that, given a commit SHA and an eval spec id, triggers an eval run and returns pass/warn/fail with a summary. This enables a GitHub check in a subsequent phase. No deep CI tooling inside Replit at this stage.

## 15) Operational concerns
- **Caching**: memoize model inferences keyed by (input, prompt version, model id, parameters) to speed up regressions.
- **Rate limiting & backoff**: protect providers and avoid noisy failures.
- **Error handling**: clear retry policies; partial run resumption; per‑sample failure logging.
- **Observability**: minimal request logging and run telemetry; aggregate metrics view; health checks.

## 16) Risks & mitigations
- **Model drift**: pin deployments and keep track of provider model versions; expose a drift dashboard and re‑baseline workflow.
- **Flaky decisions**: always report confidence intervals; require minimum effect size for blocking gates.
- **Adoption**: tie gates to business outcomes (reduced hallucinations, cost caps, latency SLOs); provide sensible default policies.

## 17) Non‑functional requirements
- Reproducibility first; all artifacts are content‑addressed and immutable once released.
- Response times: UI interactions < 300 ms typical; eval runs are async with progress indicators.
- Security: encrypt secrets at rest; never store provider keys in logs or run outputs.
- Accessibility: keyboard navigation and standard ARIA patterns.

## 18) Deliverables for the MVP in Replit
- TypeScript project with:
  - Control Plane API and UI.
  - Evaluation Engine supporting the listed metrics.
  - Provider adapters (Azure/OpenAI, Prompt Flow).
  - Persistence layer (Postgres + file store).
  - Auth and roles as specified.
  - Minimal CI endpoint for pass/warn/fail decisions.
- Seed data: example artifacts and datasets (metadata only; samples can be dummy placeholders). No proprietary data bundled.

## 19) Immediate next steps after MVP
- Add OpenAI Evals Python runner as an optional external worker (for teams that already invested in Evals).
- Add Microsoft Entra ID SSO and granular resource-level permissions.
- Introduce safety packs (PII, jailbreak prompts) and red‑team suites.
- Implement diff‑aware runs (execute only tests impacted by changes).
- Export metrics to Azure Data Explorer or Application Insights for enterprise observability.

## 20) Assumptions to validate
- Teams can provide or curate small, high‑signal datasets per use case.
- Azure/OpenAI keys and Prompt Flow workspaces are available for non‑prod testing.
- Postgres or an equivalent managed instance is acceptable within Replit constraints.
