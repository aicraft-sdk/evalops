# Active Context
<!-- CC10X: Do not rename headings. Used as Edit anchors. -->

## Current Focus
COMPLETE — wf-20260525T210000Z-e8f9a0b1 Phase 4 DX ALL PHASES DONE. GitHub Action composite (action.yml, YAML valid, PIPESTATUS+tee stdout capture, decision default); eval-gate job in ci.yml (needs:test, if:vars.EVALOPS_URL!='', continue-on-error:true); .env.example 11 lines (4 required vars); .env.optional.example (all optional vars); QUICKSTART.md 185 lines; python_sdk/ evalops-sdk 0.1.0 (httpx+pydantic v2, 6 resource modules, pytest-evalops plugin, _http.py circular-import fix, runs.wait_for transient-503 retry); 18/18 Python tests; 9/9 verifier AC pass; 208/208 NestJS regression clean. ALL 4 DX PHASES VERIFIED.

## Current Focus (prev)
COMPLETE — wf-20260525T185000Z-c6d7e8f9 Phase 2 CLI Commander rewrite: apps/cli/ → @evalops/cli@0.2.0 with Commander + bin entry + 13 commands (login/logout/whoami/init/eval/spec/dataset/agent/policy/token/run/doctor) + EvalOpsClient migration + api-client.ts deleted + credentials apiKey→token compat. 1 REM-FIX cycle (password argv security, requireAuth type lie, waitFor catch, PAT fallback warning, spec-push file-exists, 4 HIGH fixes). 10/10 verifier PASS. cli:build exit 0. 31/31 CLI tests. 208/208 regression.

## Recent Changes
- [2026-05-26] REM-FIX wf-20260525T210000Z-e8f9a0b1 ALL_ISSUES (5 fixes): action.yml run-id OUTPUT_FILE+tee+PIPESTATUS capture; action.yml decision=unknown default before JUnit check; python_sdk/src/evalops/_http.py new module (_raise_for_status helper); runs.py wait_for transient-503 retry (max 5, then TimeoutError); client.py __exit__ try/except close(); all 6 resource files r.raise_for_status()→_raise_for_status(r). 18/18 Python tests. action.yml YAML valid. 208/208 NestJS regression.
- [2026-05-25] Phase 4 DX: .github/actions/eval-action/action.yml (composite action, inputs: spec/evalops-url/evalops-token/fail-on-warn/comment-on-pr, outputs: decision/run-id/junit-path); eval-gate job in ci.yml (needs:test, if:vars.EVALOPS_URL!='', continue-on-error:true); .env.example→11 lines (4 required vars); .env.optional.example (all optional vars preserved); QUICKSTART.md (185 lines, 5 sections); python_sdk/ (evalops-sdk 0.1.0, httpx+pydantic v2, 6 resource modules, pytest-evalops plugin); 10/10 Python tests pass; 208/208 NestJS regression
- [2026-05-25] Phase 3 REM-FIX ALL_ISSUES: CRITICAL-2 scopes normalization in personal-access-tokens.repository.ts (typeof pat.scopes === 'string' guard + JSON.parse); CRITICAL-1 IMPORTANT comment above isDevMode in db.ts + improved error message mentioning EVALOPS_DEV_MODE=1; HIGH-1 bcrypt bare catch→catch(err)+console.warn in dev.ts; HIGH-2 require(@evalops/dev-runtime)→eval('require')(...) in redis.module.ts to block webpack static analysis. New test file: libs/dev-runtime/src/__tests__/remfix-silent-hunter.spec.ts (23/23). 4/4 builds exit 0. 208/208 regression.
- [2026-05-25] Phase 3 DX: libs/dev-runtime/ created (MemoryRedis, sqlite-db.ts, in-process.ts stub); core.sqlite.ts + sqlite-index.ts; dialect-utils.ts; db.ts EVALOPS_DEV_MODE branching (no DATABASE_URL throw in dev); redis.module.ts MemoryRedis in dev; apps/cli/src/commands/dev.ts (seed + Express health); main.ts registerDev; tsconfig.base.json aliases; better-sqlite3 installed; 15/15 tests; 208/208 regression
- [2026-05-25] Phase 2 REM-FIX: password argv removed (EVALOPS_PASSWORD env); requireAuth copies serviceToken→token; eval.ts waitFor wrapped in try/catch + gated behind --watch; PAT mint fallback emits console.warn; spec-commands file-exists pre-check; credentials non-ENOENT warning; SDK calls in eval+token wrapped with contextual error messages; cli:test 31/31; cli:build exit 0
- [2026-05-25] Phase 2 CLI Commander rewrite: @evalops/cli@0.2.0; apps/cli/package.json (name/bin/files/publishConfig); BannerPlugin shebang in webpack; main.ts Commander program (13 commands); all 6 existing commands migrated to EvalOpsClient; api-client.ts deleted; credentials.ts apiKey→token compat; login.ts mints PAT after JWT auth; 6 new commands (init/eval/spec-commands/token/run-get/whoami); apps/cli/src/__tests__/phase2.spec.ts + remfix-phase2.spec.ts
- [2026-05-25] Phase 1a REM: ValidationPipe added to auth-service/main.ts; updateLastUsed fire-and-forget; SCOPES_KEY enforcement added to ApiAuthGuard.validatePat(); PAT_TOKEN_PREFIX extracted as constant in shared-auth
- [2026-05-25] Phase 1c: libs/sdk-formatters/ new lib (FormattableRun minimal interface, no shared-db dep); evaluation-service/cli/junit-formatter.ts + json-formatter.ts → re-exports from @evalops/sdk-formatters; run-suite.ts imports from @evalops/sdk-formatters; tsconfig.base.json path alias added
- [2026-05-25] Phase 1b: EvalOpsClient with 7 resource modules (datasets/specs/runs/agents/policies/tokens/ingest) in libs/sdk + makeFetcher (native fetch + AbortController); sdk:build exit 0; client.spec.ts 3/3 pass
- [2026-05-25] Phase 1a: personalAccessTokens pgTable + PersonalAccessTokensRepository + TokensController (POST/GET/DELETE /api/auth/tokens) + ApiAuthGuard (PAT prefix routing + scope enforcement) + @RequireScopes decorator; auth-service:build exit 0
- [2026-05-25] REM-FIX #41: agents.repository.ts — $inferInsert→CreateAgentData/UpdateAgentData/CreateAgentVersionData (Omit<$inferSelect,auto-cols>&{optional}) fixes 4 TS2353 errors; core-service:build exit 0
- [2026-05-25] REM-FIX #41: agents.repository.type-safety.spec.ts — type contract test added (3 tests); core-service:test 3/3 suites, 5/5 tests pass
- [2026-05-25] REM-FIX #40: audit.repository.ts — Logger added, catch(err:unknown)+logger.warn in findEnhancedByOrg
- [2026-05-25] REM-FIX #40: runs.repository.ts — completeRun(id,artifactHashes) atomic transaction method added
- [2026-05-25] REM-FIX #40: ingestion.service.ts — completeRun() delegates to runsRepository.completeRun() (atomic)
- [2026-05-25] REM-FIX #40: cicd.repository.ts — createRunWithWebhookEvent(webhookData,runData) transactional method added; updateRun→T|undefined
- [2026-05-25] REM-FIX #40: webhooks.service.ts — processPushWebhook+processPullRequestWebhook use createRunWithWebhookEvent for main+PR paths
- [2026-05-25] REM-FIX #40: 9 repos update() return type → T|undefined: runs,cicd,datasets,flows,models,orgs,providers,prompts,review-queue
- [2026-05-25] REM-FIX #40: ingestion.integration.test.ts — mock+assertions updated for completeRun atomic method
- [2026-05-24] Phase 4: evaluation.service.ts 832→290 LOC — evaluation-runner.service.ts extracted (per-sample eval + code exec + language norm)
- [2026-05-24] Phase 4: evaluators.service.ts 786→180 LOC (facade) — evaluators-deterministic.service.ts (216) + evaluators-llm.service.ts (562) extracted
- [2026-05-24] Phase 4: alerts.service.ts 664→38 LOC (facade) — alert-rule.service.ts (269) + alert-notification.service.ts (341) extracted
- [2026-05-24] Phase 4: schema/evaluation.ts 671→8 LOC (re-export) — runs.ts + baselines.ts + simulations.ts + traces.ts split; index.ts re-exports all
- [2026-05-24] Phase 4 REM-FIX #1: lateral injection AlertRuleService→AlertNotificationService removed; LLM catch fallbacks → score:0; EvaluationRunnerService removed from exports; undefined guard for evaluator.schema; catch(error:unknown) fixes; remfix-28.spec.ts (14 tests)
- [2026-05-24] Phase 4 REM-FIX #2: Promise.allSettled in alert-rule.service.ts.checkRunAlerts (partial alert loss fixed); per-iteration try-catch in alerts.service.ts (loop abort on DB error fixed); Logger added to alerts.service.ts; alert-rule.service.spec.ts + alerts.service.spec.ts (4 tests)
- [2026-05-24] REM-FIX task 31 HIGH-2: alerts.service.ts — per-iteration try-catch on createAndSendAlert; Logger field added
- [2026-05-24] Phase 3: python-worker/prompt-flow/sandbox-audit/sandbox-execution — catch(error:any)→unknown + getErrorMessage(); imports from @evalops/shared-common
- [2026-05-24] Phase 3: microsoft-auth.service.ts — Logger field added; 3 console.* → this.logger.*; eslint-disable comments removed
- [2026-05-24] Phase 3: reviews.service.ts — as any → Record<string,unknown> (3 span.attributes sites)
- [2026-05-24] Phase 3: trace-migration.service.ts — 2 Drizzle .set() as any annotated with eslint-disable + Drizzle Exactly<> comment
- [2026-05-24] Phase 3: schema/evaluation.ts — 14/15 as any annotated with eslint-disable + Drizzle comment
- [2026-05-24] Phase 3: 9 per-project eslint.config.mjs — parserOptions.project wired; root eslint.config.mjs no-floating-promises scoped to **/src/**/*.ts excl spec/test/e2e
- [2026-05-24] Phase 3: 6 main.ts + run-suite.ts — bootstrap()/main() eslint-disable-next-line no-floating-promises comments added
- [2026-05-24] Phase 2: shared-db/db.ts — TenantContext interface exported; withTenantContext signature changed to TenantContext object; 3 set_config calls (org_id/user_id/role) on same PoolClient; finally clears all three
- [2026-05-24] Phase 2: shared-common/request-context.ts — RequestContext extended with userId:string + role:string
- [2026-05-24] Phase 2: OrgContextInterceptor — Reflector constructor injection; @Public() short-circuit; fail-closed UnauthorizedException on user-without-orgId; userId/role extraction; TenantContext object passed to withTenantContext + requestContext
- [2026-05-24] Phase 2: webhook.processor.ts — withTenantContext call updated from string to { orgId, userId: '', role: '' }
- [2026-05-24] Phase 2: rls.sql → 0003_enable_rls.sql + _journal.json entry (idx:3, tag:0003_enable_rls)
- [2026-05-24] Phase 2: tsconfig.lib.json — added @evalops/shared-auth path mapping
- [2026-05-24] REM-FIX task 7: WebhooksController — NestJS Logger replaces console.warn/log
- [2026-05-24] REM-FIX task 7: TemplateEngine — NestJS Logger replaces console.warn (2 sites)
- [2026-05-24] REM-FIX task 7: eslint.config.mjs — added apps/frontend/**/*.ts(x) to no-console:off override
- [2026-05-24] REM-FIX task 7: microsoft-auth.service.ts getUserProfile — added Phase 3 TODO (zero callers, no-throw safe)
- [2026-05-24] REM-FIX task 7: sandbox-security.service.ts validateJavaScriptAST — removed dead try{throw} wrapper
- [2026-05-24] Phase 1 hygiene: eslint.config.mjs hardened (no-explicit-any:error, ban-ts-comment, no-floating-promises, no-console with CLI override)
- [2026-05-24] Phase 1 hygiene: 6 dead tests git rm'd (eval-service 4, core-service 2)
- [2026-05-24] Phase 1 hygiene: providers+models controllers: throw Error→ForbiddenException; microsoft-auth: →ISE/Unauthorized; auth.service: →BadRequestException
- [2026-05-24] Phase 1 hygiene: git rm -r migrations/ (orphan 40.6KB root SQL); @types/nock removed from devDeps; try-catch collapsed in sandbox-security
- [2026-05-24] sandbox-audit.service.ts: removed InsertSandboxAuditLog import+annotation, changed 3 SELECT return types to typeof sandboxAuditLog.$inferSelect — 5 TS errors fixed
- [2026-05-24] sandbox-security.service.ts: replaced dynamic ESM import('@typescript-eslint/parser') with require() — 1 TS error fixed
- [2026-05-24] ws4-self-eval-artifacts.test.ts: updated continue-on-error expectation true→false (hardened gate)
- [2026-05-24] package.json: added nock + @types/nock as devDependencies
- [2026-05-23] COMMITTED 5366e25: RLS + AzureBlobService — withTenantContext+Proxy (shared-db/db.ts); OrgContextInterceptor in all 5 services; TenantInterceptor deleted; 24 RLS policies in DB; OtlpAuthGuard Logger; WebhookProcessor withTenantContext; 15 tests pass
- [2026-05-23] REM-FIX task 31: withTenantContext+Proxy in shared-db/db.ts; OrgContextInterceptor uses withTenantContext; TenantInterceptor deleted; rls.sql+DB: 16→24 policies; OtlpAuthGuard Logger added; WebhookProcessor wraps withTenantContext
- [2026-05-23] ASSESSMENT blockers: AzureBlobService graceful degradation (8 tests pass), RLS 16 policies applied to DB, OrgContextInterceptor + requestContext created and wired in 5 services
- [2026-05-23] rls.sql fixed: ::uuid → ::text (organization_id columns are varchar in schema)
- [2026-05-23] WORKFLOW COMPLETE: All 4 workstreams verified passing — WS1 (dead code), WS2 (CI quality), WS3 (type safety 87→0 any), WS4 (dogfood self-eval)
- [2026-05-23] WS3-REM: evaluation.service.ts — EvaluatorSpec interface + authToken param fix; ALERT_COOLDOWN_MINUTES constant extracted in alerts.service.ts
- [2026-05-23] WS4-REM: evalops-self.eval.yaml — fixed parseErrors:null→undefined, fixed throws/noError semantics, added policy-verdict comments; CI self-evals job: timeout-minutes:10 + secrets guard; ws4 tests strengthened to 16/16 (added ✅ assertion)
- [2026-05-23] WS3: Type safety - 87 any hits eliminated (100%) across 4 files; EvaluatorConfig/TemplateContext interfaces added; error:unknown narrowing; Record<string,unknown> for jsonb; ESLint no-explicit-any:warn in eslint.config.mjs
- [2026-05-23] WS4: Created evalops-self.eval.yaml (8 scenarios), self-eval npm script, self-evals CI job, closed E5 in AI_CHANGES.md
- [2026-05-23] WS2-REM: Fixed Trivy SHA mismatch; added secrets-check guard to simulation-gates

## Next Steps
Phase 4 DX COMPLETE. All 4 DX phases done. No further planned phases in wf-20260525T210000Z-e8f9a0b1.

Phase 1 DX (PAT auth + SDK + formatters) VERIFIED 7/7 PASS.
Phase 2 DX (CLI Commander rewrite) VERIFIED 10/10 PASS.
Phase 3 DX (evalops dev embedded mode) VERIFIED 10/10 PASS.

Deferred from Phase 3:
- 12 remaining Postgres schema files need .sqlite.ts equivalents (agents, ai-providers, azure, baselines, cicd, evaluators, integration, permissions, policies, runs, simulations, traces)
- Full NestJS sub-app mounting in in-process.ts (blocked by circular dep at lib-build time — stub approach used)

Deferred items from old audit:
1. Frontend 4.4: eval-specs.tsx (54KB), run-details.tsx (55KB), runs.tsx (44KB), prompts.tsx (28KB), RunDetailsModal.tsx (38KB) — needs dedicated frontend-epic with state management design first
2. shared-db:test target not configured — repositories.spec.ts exists but no jest runner wired; requires jest.config.cts + tsconfig.spec.json + project.json
3. 8 service files with direct drizzle-orm imports (traces/otlp/simulations/trace-compatibility/trace-migration/reviews in evaluation-service; sandbox-audit in integration-service) — not in database-storage.service.ts scope; future cleanup
4. cicdRuns schema: could add webhook_event_id FK for richer audit trail linkage (follow-up migration)
5. Optional: import evalops-self.eval.yaml into the platform DB so `npm run self-eval` works end-to-end — requires running platform instance

## Decisions
- [SCOPE-RESOLVED: wf:wf-20260524T120000Z-c4d5e6f7 scope:ALL_ISSUES user chose "Fix all issues"]
- Workstream sequence: 1 → 2 → 3+4 in parallel (per approved plan)
- WS1 remediation scope: ALL_ISSUES (user chose to fix all 4 critical + 1 high + mediums)
- WS2 remediation scope: ALL_ISSUES (Trivy SHA mismatch + simulation-gates infra guard)
- Canonical frontend: apps/frontend/ (has newer pages: agents, agent-detail, review-queue, simulations)
- apps/api/ to be retired (pre-split monolith; covered by dedicated *-service/)

## Learnings
- Phase 3 DX REM-FIX COMPLETE (wf-20260525T200000Z-d7e8f9a0): SQLite text() columns return raw JSON string for postgres text[].array() equivalents — normalize after query: `if (typeof x === 'string') x = JSON.parse(x as unknown as string)`; eval('require') blocks webpack static bundling of optional native addons (no eslint-disable needed — no-eval not configured); module-load-time env var reads (isDevMode) need IMPORTANT comment warning about import order; bcrypt bare catch → catch(err)+console.warn. 10/10 verifier PASS.
- Phase 1 DX COMPLETE (wf-20260525T174800Z-b5c6d7e8): PAT auth (personalAccessTokens table + repo + TokensController + ApiAuthGuard with scope enforcement + PAT_TOKEN_PREFIX constant), EvalOpsClient with 7 resource modules (native fetch, no axios), libs/sdk-formatters (FormattableRun minimal interface, no shared-db dep); 7/7 integration verifier PASS
- PAT scope enforcement: SetMetadata(SCOPES_KEY) alone is NOT enforcement — guard must call getAllAndOverride(SCOPES_KEY,[handler,class]) AND filter missing scopes + throw UnauthorizedException; easy to miss, silent bypass otherwise
- ValidationPipe({whitelist:true,transform:true}) MUST be in NestJS main.ts before app.listen() — class-validator decorators on DTOs are completely inert without it; no compile error; silently accepts any input
- Guard non-critical writes must be fire-and-forget: updateLastUsed.catch(()=>undefined) — awaiting any DB write in canActivate() makes DB latency block auth for all callers
- PAT_TOKEN_PREFIX constant in shared-auth: bare string literal duplicated in controller+guard causes silent drift on rename; export named constant and import in both
- @nx/js:tsc executor cross-lib source import = TS6059 "not under rootDir": path-alias imports pull in source files from other libs; define minimal local interface (FormattableRun{decision,duration,status,cost}) instead of importing full type; consuming side (evaluation-service) passes the full Run type which satisfies it structurally
- EvalOpsClient native fetch: AbortController timeout covers TCP+response headers only; res.json() body read is not covered — document limitation in comment
- Phase 2 CLI Commander rewrite COMPLETE (wf-20260525T185000Z-c6d7e8f9): @evalops/cli@0.2.0, BannerPlugin shebang, Commander program tree (13 commands), api-client.ts deleted, all commands use EvalOpsClient, credentials apiKey→token compat, login mints PAT, 6 new commands (init/eval/spec-commands/token/run-get/whoami). 1 REM-FIX cycle: password argv removed, requireAuth assertion fixed, waitFor try/catch, PAT fallback warning, spec file-exists check, credentials ENOENT discriminator, SDK error wrapping. 10/10 verifier PASS.
- CLI --password flag is a process-list security hole: NEVER accept secrets as CLI args; use EVALOPS_PASSWORD env var + TTY prompt fallback; --username is fine (non-secret)
- requireAuth assertion gap: `asserts config is T & { token: string }` must populate token for ALL code paths that return without exit; if serviceToken-only path is allowed, copy serviceToken→token before returning
- eval.ts waitFor design: always gate behind --watch; print run ID immediately after create (before the gate) so user can recover on timeout; wrap waitFor in try/catch and re-throw with run ID in the error message
- CLI eval.ts SDK type: EvalSpecResponse (not SpecResponse) — verify via grep when building new SDK consumers
- Commander command file naming: never name files *.spec.ts or *.test.ts (renamed spec.ts → spec-commands.ts); Jest picks them up as empty test suites and fails
- Phase 1 Quick Hygiene COMPLETE (wf-20260524T120000Z-c4d5e6f7): ESLint hardened (no-explicit-any:error, ban-ts-comment, no-floating-promises, no-console with CLI+frontend override), 6 dead @ts-nocheck+describe.skip tests deleted, 500→403/401 authz fixed (ForbiddenException/UnauthorizedException/BadRequestException), orphan /migrations/ deleted, @types/nock removed, dead try-catch collapsed, Logger migrated in webhooks.controller.ts + template-engine.service.ts
- auth.integration.test.ts: pre-existing TS2349 (supertest `import *` call signature) from commit a7bb882 — Phase 3 cleanup target
- `ban-ts-comment` option `'ts-nocheck': true` = ALLOWED (not banned) — counterintuitive; if intent is to ban, change to `false`; revisit at Phase 3
- `auth.service.ts` has 10 per-line `// eslint-disable-next-line @typescript-eslint/no-explicit-any` suppressions — primary Phase 3 `UserRecord` interface target
- `no-floating-promises:error` rule in root eslint.config.mjs is inert without per-project `parserOptions.project` wiring — Phase 3 must add to all 15 service/lib ESLint configs
- `getUserProfile` in microsoft-auth.service.ts: zero callers in entire monorepo — Phase 3 target to throw `ServiceUnavailableException` instead of `return null`
- `microsoft-auth.service.ts`: 3 console.* calls with per-line `eslint-disable-next-line no-console` (lines 34, 59, 165) — Phase 3 Logger migration; `MicrosoftAuthService` still needs `private readonly logger` field
- ESLint flat config last-match-wins: permissive override blocks (no-console:off) MUST come after restrictive blocks (no-console:error) in the config array
- drizzle-zod createInsertSchema().extend() broken type — only exposes overridden+extended fields; use typeof table.$inferSelect for SELECT return types, never InsertX & {id; createdAt}
- nock@14+ ships bundled TypeScript types — do NOT add @types/nock alongside; @types/nock@10 is stale and redundant, bundled types win
- require() cast for @typescript-eslint/parser is safe under module:commonjs — synchronous require() throws {code:MODULE_NOT_FOUND} identically to dynamic import()
- RLS connection affinity: fire-and-forget `db.execute(set_config)` uses a different pool connection than handler queries — MUST use `pool.connect()` + `PoolClient` scoped to the request with `requestDbStore.run(tenantDb, fn)`
- Proxy on Drizzle `db` export: transparent routing to per-request instance when in ALS context; existing `import { db }` in all services works unchanged; bind() required for methods
- BullMQ processors bypass HTTP interceptor stack — must call `withTenantContext` directly with `organizationId` from job payload
- client/ and apps/frontend/ are near-duplicates; apps/frontend/ has newer pages so it's the survivor
- apps/api/ tests must be migrated (describe.skip + @ts-nocheck bridge) before deletion — NestJS DI prevents direct import rewire
- When migrating any-typed HTTP-response-consuming code to Record<string,unknown>, all use-sites passing extracted properties to typed params must also be updated; changing only the parameter type generates many TS2345 errors
- EvaluatorSpec interface pattern: add named fields + [key: string]: unknown index sig when typing loose config from JSON
- evalops-self.eval.yaml is an import artifact — must be pre-imported into platform DB via UI or `evalops dataset push` before `npm run self-eval` can succeed
- RuleEvaluator only understands config.schema and config.invariants — throws/noError in expected are silently ignored (vacuous scenarios)
- Parser returns parseErrors: undefined (not null) on success — YAML null ≠ JS undefined in exact-match evals
- grep exits 1 (not 0) when 0 matches found — exit 1 from grep -c means clean, not failure
- pre-existing TS errors in shared-db/evaluators.ts (Drizzle Exactly<> API), simulation-workflow.e2e.ts, reviews.controller.ts — not WS3/WS4 regressions
- In-process cooldown (ALERT_COOLDOWN_MINUTES=15) resets on service restart — no cooldown_minutes column in DB schema
- Phase 2 Correctness Hardening COMPLETE (wf-20260524T140000Z-d5e6f7a8): TenantContext{orgId,userId,role} in withTenantContext (3 set_config calls on same PoolClient, all 3 cleared in finally); RequestContext extended; OrgContextInterceptor fail-closed on missing orgId + @Public() short-circuit via Reflector; rls.sql→0003_enable_rls.sql + _journal.json idx:3; 11/11 tests PASS; 10/10 verifier scenarios PASS
- tsconfig.lib.json shared-common: local paths override shadows tsconfig.base.json — any new @evalops/* import in shared-common must also be added to tsconfig.lib.json paths array
- OrgContextInterceptor uses reflector.get(handler) ?? reflector.get(class) chain for @Public() — functional today but diverges from AllAndOverride convention in guards; fix before adding class-level @Public() decorators
- requestContext (AsyncLocalStorage) is currently write-only — no service reads getStore(); adding userId/role to RequestContext interface is backward-safe
- BullMQ webhook processor: pass {orgId, userId:'', role:''} — no JWT in queue context; safe since RLS policies are org-scoped only; if user-scoped RLS policies added later, processors would need service-account userId
- SandboxService constructor reads apiKey synchronously — NestJS TestingModule.compile() calls constructor before beforeEach mock setup; fix requires providing pre-configured mock value BEFORE compile() (not after)
- Phase 3 Type Safety + Logger COMPLETE (wf-20260524T160000Z-f7a8b9c0): catch(error:unknown)+getErrorMessage() in 4 services, Logger in microsoft-auth, as any annotated (not eliminated) in trace-migration/schema/evaluation per Drizzle Exactly<> limitation, parserOptions.project wired in 9 ESLint configs, no-floating-promises scoped at root, bootstrap() disable in 6 main.ts+run-suite.ts; 10/10 verifier PASS
- Phase 4 Readability COMPLETE (wf-20260524T180000Z-e2f3a4b5): evaluation.service.ts 832→290 + evaluation-runner.service.ts; evaluators.service.ts 786→180 facade + evaluators-deterministic/llm; alerts.service.ts 664→38 facade + alert-rule/notification; schema/evaluation.ts 671→8 + runs/baselines/simulations/traces split; 2 REM-FIX cycles; 10/10 verifier PASS (187/187 tests)
- Phase 5 Repository Layer COMPLETE (wf-20260524T220000Z-a1b2c3d4): 18 repository classes in libs/shared-db/src/lib/repositories/ (agents, alerts, audit, cicd, custom-evaluators, datasets, eval-specs, flows, metrics, models, organizations, permissions, prompts, providers, review-queue, runs, sample-results, users); SharedDbModule @Global(); database-storage.service.ts+storage.module.ts deleted from all 5 services; azure-blob.service.ts preserved; 2 REM-FIX cycles (transaction gaps, audit Logger warn, update()→T|undefined, agents $inferInsert type fix); 11/11 re-verify PASS; 208/208 tests
- Drizzle 0.39 $inferInsert excludes nullable/defaulted columns — use Omit<$inferSelect,'id'|'createdAt'|'updatedAt'>&{optionals?} with as any cast at .values()/.set() for insert param types; createInsertSchema(table) as any makes InsertX=any (no type safety)
- Repository atomic method pattern: add completeRun()/createXWithY() to the repository class to wrap multi-step writes in db.transaction(tx=>...) rather than exposing tx context to callers
- Bare catch {} in Promise.all callbacks: always catch(err:unknown)+logger.warn(msg,err) — silent swallow produces valid-shaped data with wrong content; caller cannot detect failure
- NX CLI exits 0 even when service build fails (webpack 'compiled with N errors') — detect build failure via grep for "compiled with N errors" in output, not NX exit code
- update() → returning() destructuring: const [x] = db.update().returning() gives x=undefined on no-match; declare return type as T|undefined; current callers safe because they pre-check with findById
- NestJS service split pattern: extracted service in providers[]; only orchestrator/facade injects multiple leaves; leaves must not inject each other (lateral injection); EvaluationRunnerService is private to EvaluationModule (not in exports[])
- Drizzle schema split: cross-boundary relations go in index.ts not in per-file relations() blocks; multiple relations() calls for same table are merged by Drizzle at runtime; evaluation.ts hub re-exports all bounded-context schema files
- LLM evaluator catch blocks: always return {score:0, cost:0} on error — non-zero fallback scores produce false positives in metric aggregation and policy decisions; score:0.5 in evaluateAnswerCorrectness is a guard clause (no expectedAnswer), NOT a catch fallback
- Promise.allSettled with label array: standard pattern for independent async sub-checks where partial failure should log+continue: `const results = await Promise.allSettled([...]);` then iterate `results.entries()` collecting fulfilled values + logging rejected with label[i]
- Facade dispatch loop: for...of await with per-iteration try-catch — one notification DB failure must not abort subsequent alerts
- Frontend large pages (44-55KB): stopped at stop criterion — state in eval-specs/run-details/runs/prompts is too interwoven for non-obvious component extraction; needs dedicated frontend-epic with state management design first
- policyScore field in updateRun() call is silently discarded by Drizzle — no policyScore column in runs table; InsertRun resolves to any via createInsertSchema cast so TypeScript cannot catch it (pre-existing, not introduced by Phase 4)
- sandbox.service.spec.ts (integration-service) has 4 pre-existing test failures from commit a7bb882 — createSandbox/executeCode/deleteSandbox/getSandboxStatus fail due to missing API key in test context; not regressions
- no-floating-promises at root eslint.config.mjs must be scoped to **/src/**/*.ts excl spec/test/e2e — otherwise crashes on jest.config.cts, eslint.config.mjs, webpack.config.cjs config files
- All NestJS service main.ts bootstrap() calls need eslint-disable-next-line no-floating-promises once per-project parserOptions.project is wired — it is the standard pattern for top-level bootstrap
- Per-project ESLint parserOptions.project block needs files:[src/**/*.ts]+ignores:[spec/test/e2e] to match tsconfig.app.json include/exclude scope exactly
- prompt-flow.service.ts catch blocks re-wrap errors as new Error() instead of re-throwing — loses AxiosError type/payload; fix with throw error or new Error(msg, {cause:error}) before Phase 4
- sandbox-audit.service.ts intentional swallow: returns ''/[] on DB failure with log — callers cannot distinguish empty from failure; consider {logs:[], error?:string} return type if callers added

## References
- Plan: `/Users/david.gracia/.claude/plans/how-we-can-make-gentle-papert.md`
- Design: N/A
- Research: N/A

## Blockers
- None

## Session Settings
# AUTO_PROCEED: false

## Last Updated
2026-05-26T07:30:00Z
