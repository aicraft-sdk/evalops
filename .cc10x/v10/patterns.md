# Project Patterns
<!-- CC10X MEMORY CONTRACT: Do not rename headings. Used as Edit anchors. -->

## User Standards
- Nx monorepo — always update nx.json and Tiltfile when adding/removing projects
- E-series governance tracking — document significant changes in AI_CHANGES.md
- AgentMD format for agent definitions; lint gate in CI (agents-md-validate.yml)
- No test mocks for DB — integration tests should use real DB where practical
- NestJS services use APP_GUARD for global guards, @Public() to whitelist health checks

## Architecture Patterns
- Microservices: api-gateway (3000), auth-service (3001), core-service (3002), evaluation-service (3003), integration-service (3004), analytics-service (3005)
- Frontend: apps/frontend/ (React 18 + Vite + Shadcn UI) — canonical; client/ is the stale duplicate
- libs/: shared-db (Drizzle ORM), shared-auth, shared-common, sdk, evaluators, agent-md, shared
- Python worker: python_worker/ (FastAPI, port 5055) — heavy NLP evals
- libs/evaluators/ has typed EvaluatorResult, ExactEvaluator, RuleEvaluator, Aggregator — use these instead of any

## Code Conventions
- TypeScript (primary), Python (python_worker/)
- NestJS 11 for services; React 18 + Vite for frontend
- Drizzle ORM (not TypeORM) for DB queries
- Test runner: Jest for NestJS services, Vitest for frontend/libs, Playwright for E2E
- Zod for runtime validation and type inference (z.infer<typeof schema>)

## File Structure
- Apps: apps/{service-name}/src/app/{module}/
- Libs: libs/{lib-name}/src/lib/
- Tests: co-located *.spec.ts or apps/api/src/__tests__/ (legacy, being migrated)
- CI workflows: .github/workflows/
- Docs: docs/ (21 markdown files) + root-level docs (README, AGENTS.md, etc.)

## Testing Patterns
- NestJS unit tests: co-located *.spec.ts
- Integration tests: apps/api/src/__tests__/ (legacy, migrating to owning services)
- E2E: tests/e2e/ (Playwright)
- Python: python_worker/test_*.py (pytest)

## Common Gotchas
- Python circular import with helper utils: resource modules and client.py must NOT import each other; place shared helpers (e.g. _raise_for_status) in a separate _http.py module; client.py re-exports for external callers; resources import from _http directly
- httpx raise_for_status() drops response body from the exception string — always wrap with a helper that re-raises with body[:500] appended; field-level 422 errors are undebuggable without this
- PIPESTATUS[0] pattern in bash: `cmd | tee file; EXIT_CODE=${PIPESTATUS[0]}` captures the exit code of `cmd` (not tee); plain `$?` after a pipe captures tee's exit code which is always 0
- GitHub Actions outputs must always be written to $GITHUB_OUTPUT even when a value is unavailable; write a default first, then overwrite conditionally — a missing write leaves the output as empty string which silently passes all `if: steps.x.outputs.y == 'fail'` checks
- Python SDK uv venv pattern: uv requires a venv (`uv venv .venv`) before `uv pip install`; pip3 with system Python on macOS is blocked by PEP 668 without `--break-system-packages`; use `uv venv .venv && uv pip install -e ".[extras]"` for isolated installs; run tests with `.venv/bin/python -m pytest`
- pytest-evalops plugin skip pattern: when EVALOPS_TOKEN is absent, call `pytest.skip()` (not `pytest.fail()`) in pytest_runtest_call — skip means "not configured", fail means "eval ran and failed"
- GitHub Actions composite action: `runs.using: 'composite'` with `shell: bash` steps; inputs accessed via `${{ inputs.name }}`; outputs must come from a named step via `value: ${{ steps.stepid.outputs.key }}`; `if:` conditions on steps use the standard expression syntax — no `env.GITHUB_STEP_SUMMARY` needed for simple gates
- better-sqlite3 uses `export =` CommonJS style — cannot use `import Database from 'better-sqlite3'` without esModuleInterop; use `const Database = require('better-sqlite3') as typeof import('better-sqlite3')` instead
- EVALOPS_DEV_MODE=1 must be set in process.env BEFORE any module that transitively imports shared-db/db.ts is loaded — db.ts reads the env var at module-load time; dynamic import() in CLI commands satisfies this when set before the import
- SQLite text().array() doesn't exist — Postgres text[].array() must become text(mode:'json') with $defaultFn(() => JSON.stringify([])); consumers must JSON.parse the value
- SQLite integer(mode:'boolean') stores 0/1; Drizzle maps it to TypeScript boolean automatically when mode is set
- SQLite $defaultFn(() => new Date().toISOString()) replaces Postgres .defaultNow() — ISO string stored, not Date object
- SQLite pgEnum has no equivalent — store as text() with application-level validation; omit the enum type from SQLite schema files
- Better-sqlite3 + drizzle: drizzle returns Promises even though better-sqlite3 is sync under the hood; await db.select() works correctly
- Cross-lib require in shared-db/db.ts: `require('@evalops/dev-runtime')` pulls dev-runtime via path alias at tsc time → TS6059 warning from bare tsc --noEmit; Nx build resolves correctly; treat Nx build as the truth (same pattern as sdk-formatters)
- `evalops dev` must set EVALOPS_DEV_MODE=1 before ANY dynamic import of shared-db or service modules; use await import('@evalops/dev-runtime') after setting the env var
- SQLite DDL via drizzle: drizzle/better-sqlite3 doesn't auto-create tables; either use drizzle-kit push or exec() raw CREATE TABLE IF NOT EXISTS SQL before using ORM methods
- SQLite JSON text column cross-dialect normalization: after db.select() on a column that stores a Postgres text[].array() equivalent as text(mode:'json'), Drizzle does NOT automatically parse it — pat.scopes arrives as a raw JSON string; guard: `if (typeof x === 'string') x = JSON.parse(x as unknown as string)`; Postgres drizzle handles arrays natively so this guard is a no-op on Postgres
- eval('require') for optional dev-only native addons: use `eval('require')(moduleName)` in NestJS useFactory or any webpack-bundled file to prevent webpack from statically tracing the require and bundling the native addon into prod; no eslint-disable comment needed — no-eval ESLint rule is NOT configured in this project (adding a redundant disable comment triggers no-unused-disable-directive)
- Module-load-time env var: add `// IMPORTANT: evaluated at module load time — ENV_VAR must be set before any import that loads this module` above any `const x = process.env.Y` at file top level; without this comment, future devs silently break the guard by adding a static import


- CLI --password flag = process-list exposure: NEVER accept secrets as CLI args (visible in `ps aux`, shell history, CI logs); always read from environment variable (EVALOPS_PASSWORD) or interactive prompt on TTY; --username is fine as it is non-secret
- requireAuth type assertion gap: if only serviceToken is set and token is absent, the `asserts config is CliConfig & { token: string }` assertion does NOT populate token — must explicitly copy: `(config as { token: string }).token = config.serviceToken`; all downstream code using config.token gets undefined otherwise
- waitFor unconditional call: fire-and-forget commands (like eval) MUST gate waitFor behind --watch; print run ID immediately after create so user can recover if they need to poll manually later
- PAT mint fallback silent: when JWT fallback is used, user believes they have a 90-day PAT but only have ~1h JWT; must console.warn explicitly before fallback
- ENOENT-only bare catch: catch {} on file reads silently hides JSON corruption and permission errors; always check `(err as NodeJS.ErrnoException).code !== 'ENOENT'` and console.warn on unexpected errors
- PAT scope enforcement: @RequireScopes(scope) alone is NOT enforcement — ApiAuthGuard.validatePat() must call getAllAndOverride(SCOPES_KEY,[handler,class]) AND filter missing scopes + throw UnauthorizedException; without the reflector call, any PAT bypasses all scope checks silently with no compile error
- NestJS ValidationPipe must be registered: app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true})) in main.ts BEFORE app.listen(); class-validator decorators on DTOs are completely inert without it — silently accepts any input, no error
- Guard non-critical writes are fire-and-forget: `this.xxx.updateLastUsed(id).catch(()=>undefined)` — awaiting any DB write inside canActivate() converts DB latency into auth latency for all callers; DB failure converts valid auth into HTTP 500
- @nx/js:tsc cross-lib import = TS6059: path-alias imports pull source files from other libs into rootDir check; define a minimal local interface (e.g. FormattableRun{decision,duration,status,cost}) instead of importing the full type; the concrete type in the consuming service satisfies it structurally
- Drizzle 0.39 $inferInsert only includes notNull-without-default columns — columns with `.default(...)` or nullable are excluded; use `Omit<$inferSelect, 'id'|'createdAt'|...>&{id?:string;...}` for insert param types that need all columns; cast to `as any` at .values()/.set() call site for Drizzle's internal Exactly<> check
- cicdRuns table has no webhookEventId column — createRunWithWebhookEvent passes runData as-is (no FK link); transactional atomicity is still guaranteed via db.transaction
- Drizzle db.transaction(async tx => ...) is the canonical atomic-write pattern; all repository methods using separate sequential writes that must be consistent must use this
- update() Drizzle .returning() gives empty array (undefined after destructure) when no row matches WHERE — return type must be T | undefined, not T; callers with pre-check are safe; callers that return the result without null-check will now have correct types
- bare catch {} silently swallows errors — always use catch(err: unknown) with logger.warn/error call; NestJS Logger.warn(message, error) signature accepts the error object as second arg
- no-floating-promises requires parserOptions.project in each project's ESLint config — adding it to root eslint.config.mjs without per-project wiring errors ALL projects; Phase 3 must add parserOptions.project to each of 15 project eslint.config.mjs files
- Frontend React (apps/frontend/**) legitimately uses console — exclude from no-console rule in eslint.config.mjs; NestJS services must use Logger instead
- Dead try-catch wrapper pattern `try { ... } catch(e) { throw e; }` is a no-op — remove entirely, keep inner body; Phase 1 collapsed but left this wrapper in sandbox-security.service.ts (now removed)
- NestJS controllers: NEVER use `throw new Error(...)` for client-facing failures — Nest default exception filter maps unknown errors to 500. Use `ForbiddenException` (403), `UnauthorizedException` (401), `BadRequestException` (400), `InternalServerErrorException` (500 for server-config issues) from `@nestjs/common`
- ESLint flat config last-match-wins: `no-console:off` override MUST come AFTER the `no-console:error` block in the array — if placed before, the error rule silently wins; confirmed working in this project's eslint.config.mjs
- `@typescript-eslint/ban-ts-comment` option `'ts-nocheck': true` means ALLOW the directive (not ban it); use `false` to ban — naming is counterintuitive; current config allows @ts-nocheck as a Phase 3 deferral bridge
- drizzle-zod `.extend()` breaks the generated INSERT type (strips most fields) — for SELECT return types always use `typeof table.$inferSelect`, never `InsertX & { id; createdAt }` pattern
- Dynamic ESM `await import('@typescript-eslint/parser')` fails TS2307 under Node16 moduleResolution — use `require()` cast instead inside try-catch
- nock is not in default devDeps; sandbox integration tests require it — add `nock @types/nock` to devDependencies when needed
- withTenantContext Proxy pattern: db.* routes to per-request PoolClient (app.org_id already set) via AsyncLocalStorage; globalDb is fallback outside requests — the Proxy is the key; existing imports unchanged
- TenantInterceptor is deleted — OrgContextInterceptor+withTenantContext is the single RLS entry point; do not re-add TenantInterceptor
- rls.sql uses ::uuid cast but organization_id columns are varchar — must use ::text cast for RLS policies; rls.sql has been corrected
- AzureBlobService constructor threw at startup when creds absent — fixed to set client=null + warn; isAvailable getter + assertAvailable() guards all public methods
- TenantInterceptor (already existed) and OrgContextInterceptor (new) are complementary: TenantInterceptor sets DB session var, OrgContextInterceptor adds AsyncLocalStorage context; both should remain registered
- `|| true` on type-check in ci.yml:59 — silently passes TS errors; must be removed (FIXED WS2)
- client/ vs apps/frontend/ confusion — always use apps/frontend/ as canonical (client/ deleted WS1)
- apps/api/ is stale monolith — new features go in dedicated *-service/ (deleted WS1)
- Test deps in dependencies (not devDependencies) — bloats prod install (FIXED WS1)
- package.json name is "rest-express" (Replit leftover) — now "evalops" (FIXED WS1)
- AgentMDParser swallows parse errors as warn — callers should check parseErrors[] and throw BadRequestException on critical errors
- dist/ is checked in — add to .gitignore (FIXED WS1)
- When typing any-typed HTTP-response code with Record<string,unknown>, use-sites passing extracted props to typed params must ALSO be updated with EvaluatorSpec-style interfaces or as-casts — changing only the param type produces 26+ TS2345 errors
- RuleEvaluator only understands config.schema and config.invariants — throws/noError/custom fields in expected are silently ignored (vacuous scenarios)
- Parser returns parseErrors: undefined (not null) on success — YAML null ≠ JS undefined in exact-match evals
- evalops-self.eval.yaml must be pre-imported into platform DB before `npm run self-eval` can succeed — the CLI does a live API lookup, not a local YAML read
- grep exits 1 (not 0) when 0 matches found — grep -c exit 1 means clean, not failure
- withTenantContext now accepts TenantContext{orgId,userId,role} object — all 3 set on same PoolClient before fn(); all 3 cleared in finally block; set_config(..., false) is session-level (not transaction-local); cleanup in finally is the compensating action
- OrgContextInterceptor Reflector injection: APP_INTERCEPTOR useClass satisfies DI automatically — no module import changes needed when adding constructor args via useClass pattern
- tsconfig.lib.json paths override shadows tsconfig.base.json — new @evalops/* imports in shared-common require path entry in tsconfig.lib.json paths array or tsc will fail with TS2307
- reflector.get(handler) ?? reflector.get(class) chain works for @Public() check but diverges from project convention (guards use getAllAndOverride); use getAllAndOverride in new interceptors
- requestContext AsyncLocalStorage is currently write-only in this codebase — no service calls getStore(); extending RequestContext interface is backward-safe until a consumer is added
- SandboxService reads configService in constructor — NestJS TestingModule.compile() fires constructor before beforeEach mock setup; mock must be provided BEFORE compile() via useValue/useFactory, not after
- no-floating-promises in Nx flat config requires two parts: (1) root scope to **/src/**/*.ts excl spec/test/e2e; (2) per-project parserOptions.project pointing to tsconfig.app.json (apps) or tsconfig.lib.json (libs) with tsconfigRootDir; without BOTH, the rule is inert or crashes config files
- NestJS service main.ts bootstrap() needs eslint-disable-next-line @typescript-eslint/no-floating-promises — standard pattern for top-level bootstrap; add when wiring parserOptions.project
- catch(error:unknown) + getErrorMessage() pattern established in Phase 3: use getErrorMessage() from @evalops/shared-common; stack = error instanceof Error ? error.stack : undefined; DO NOT do catch(error:any) then immediately cast error as any
- prompt-flow re-wrap anti-pattern: throw new Error(msg) inside catch discards original AxiosError type — prefer throw error after logging, or new Error(msg, {cause:error}) to preserve cause chain
- sandbox-audit intentional swallow: returns ''/[] on audit DB failure — callers cannot distinguish empty from failure; if callers need error channel, use {result:[], error?:string} return type
- getUserProfile null-return-on-error: zero callers confirmed; when callers added, replace return null with throw ServiceUnavailableException('Graph API unavailable')
- Pre-existing TS errors in libs/shared-db/evaluators.ts (Drizzle Exactly<>) and sandbox-related tests — not introduced by WS3/WS4, trace to commit a7bb882
- ALERT_COOLDOWN_MINUTES in alerts.service.ts is in-process only (no DB column) — resets on service restart; both isInCooldown and setCooldown must reference same constant
- coverageThresholds (plural) vs coverageThreshold (singular) — Jest silently ignores the plural form; use coverageThreshold (FIXED WS2)
- Trivy image-ref SHA: docker/metadata-action format=short produces 7-char SHA but github.sha is 40-char — use extract-short-sha step with cut -c1-7 (FIXED WS2)

## API Patterns
- Gateway routes to services via HTTP; no gRPC between services
- JWT auth via JwtAuthGuard (not globally applied yet — ASSESSMENT critical item #1)
- Service-to-service calls use EVALOPS_SERVICE_TOKEN (env var)

## Error Handling
- NestJS: NestJS Logger (not console.*) in services; 101 console.* calls remain (cleanup target)
- OpenTelemetry configured in libs/shared-common (OTLP gRPC) — good baseline
- No Sentry/error-tracking integration

## Dependencies
- @ai-sdk/{anthropic,openai,google,xai}: multi-provider AI SDK
- drizzle-orm + drizzle-kit: ORM + migrations
- bull: Redis-backed queues
- ioredis: Redis client
- zod: runtime validation + type inference

## Project SKILL_HINTS
- cc10x:architecture-patterns  <!-- NestJS microservices, multi-service Nx -->

- Phase 4 NestJS split: extracted leaf service must be in providers[]; NOT in exports[] unless another module consumes it directly — EvaluationRunnerService is internal to EvaluationModule; exporting it widens public API without benefit
- Phase 4 leaf services must not inject sibling leaf services — only orchestrator/facade injects multiple leaves; AlertRuleService must not call AlertNotificationService; if rule checks produce alert data, return it as AlertData[] and let the facade dispatch
- Drizzle schema split: per-bounded-context files (runs.ts, baselines.ts, simulations.ts, traces.ts); cross-boundary relations live in index.ts only; Drizzle merges multiple relations() definitions for the same table at runtime; evaluation.ts becomes an 8-line re-export hub
- LLM evaluator error catch blocks: return {score:0, cost:0} always — non-zero fallback (0.5/0.7/0.8) produces false positives in metric aggregation and policy decisions; score:0.5 sentinel in evaluateAnswerCorrectness (no expectedAnswer case) is a guard clause, NOT a catch fallback
- Promise.allSettled for independent async checks: use Promise.allSettled (not Promise.all) when sub-checks are independent and partial failure should log+continue; iterate results.entries() with a labels array; outer catch only needed for Promise.allSettled itself throwing
- Dispatch loop resilience: for...of await loops over independent notifications need per-iteration try-catch; one createAndSendAlert DB failure must not abort the remaining alerts
- policyScore in updateRun() is silently discarded by Drizzle — no column in runs table; createInsertSchema(table) as any makes Partial<InsertRun> = Partial<any> which accepts any field without TS error; Drizzle silently drops unknown fields at runtime (pre-existing bug)
- Frontend large pages (eval-specs.tsx 54KB, run-details.tsx 55KB, runs.tsx 44KB, prompts.tsx 28KB, RunDetailsModal.tsx 38KB): state too interwoven for obvious component extraction; stop criterion met; needs dedicated frontend-epic with state management design first
- Phase 5 Repository Layer pattern: 18 @Injectable() repos in libs/shared-db/src/lib/repositories/; all import `db` proxy from `../db` (NOT pool/Client — bypasses RLS); SharedDbModule @Global() with REPOSITORIES constant in both providers+exports; imported once at AppModule root; sub-feature-modules do not need to import it separately
- Drizzle 0.39 $inferInsert type gap: only includes notNull+noDefault columns; nullable/defaulted columns excluded; use `Omit<typeof table.$inferSelect,'id'|'createdAt'|'updatedAt'>&{id?:string;createdAt?:Date}` local type + `as any` cast at .values()/.set() — do NOT use createInsertSchema(table) as any (makes InsertX=any with no type safety)
- Repository update() return type: Drizzle `.returning()` on no-row-match returns []; `const [x]=[]` gives x=undefined; declare return type `T|undefined` (not T); current callers are safe because they pre-check with findById first
- Atomic repository method: expose `completeRun(id,data)` / `createXWithY(a,b)` that wrap both writes in `db.transaction(async tx=>{...})` — cleaner than passing tx context to callers; add to the repository class, not the service
- Bare catch in Promise.all callbacks: always `catch(err:unknown){this.logger.warn(msg,err); fallback='default'}` — silent bare catch gives caller valid-shaped data with silently wrong content
- NX CLI exit code masking: `nx run svc:build` exits 0 even when webpack fails ("compiled with N errors"); detect real build failure via grep for "compiled with N errors" in stdout, not NX exit code

## Last Updated
2026-05-26T07:30:00Z
