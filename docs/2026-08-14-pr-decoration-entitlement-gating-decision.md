# PR Decoration: New `ee/pr-decoration` Library, Entitlement-Gated (Phase 6)

## What Changed

A new `ee/pr-decoration` Nx library (`@evalops/ee-pr-decoration`) adds `POST
/api/evaluation/pr-decoration`, wired directly into `evaluation-service`'s `AppModule` behind
`@UseGuards(JwtAuthGuard, EntitlementGuard)` + `@RequiresEntitlement('pr-decoration')`. With no
valid Enterprise license configured, the route returns `403` with an upsell body instead of
reaching `PrDecorationService`. `BuildPrDecorationDto` validates the request body (`runId:
string`) via a per-route `@UsePipes(new ValidationPipe({whitelist, forbidNonWhitelisted,
transform}))`, matching `golden-sets.controller.ts`/`policies.controller.ts`'s convention since
`evaluation-service` has no global `ValidationPipe`. `PrDecorationService.buildDecoration()` looks
up the run via a `RUN_LOOKUP` DI token (structural `RunLookup` interface, mirroring the
`SSO_USER_PROVISIONER` pattern from `ee/sso`) rather than importing `RunsService` directly, so
`ee/pr-decoration` has no compile-time dependency on `apps/evaluation-service` internals; it
throws `ForbiddenException` if the looked-up run's `organizationId` does not match the requesting
user's `@CurrentUser()`-derived `organizationId`, closing the same class of cross-tenant IDOR
`ee/sso`/`ee/audit-export`/`ee/rbac-custom-roles` already guard against. On success it returns a
structured per-scenario decoration payload (`{ entitled: true, scenarios: [{name, decision}] }`).

On the Action side, `.github/actions/evaluate-pr/action.yml` gained a new opt-in
`enable-pr-decoration` input (`required: false`, `default: "false"`). `run.js`'s new
`maybeDecorate()` function is called after the gate decision is computed (but before
`process.exit()`): when enabled, it fires a best-effort `POST
/api/evaluation/pr-decoration` per completed run and only logs the outcome — a `403` (no
license) or any other failure is caught and logged non-fatally, never thrown out of `main()`, so
the existing free pass/fail CI gate is completely unaffected regardless of entitlement state. The
existing "Post PR comment" step in `action.yml` (posting the pass/warn/fail verdict comment) is
unmodified by this phase and does not yet render the decoration payload into the PR comment body
— wiring the decoration response into the visible PR comment is a fast-follow, not part of this
diff.

During this phase, a real DI-scoping boot-crash bug was found and fixed before merge: the initial
implementation wrapped `PrDecorationController`/`PrDecorationService` in the library's own
`PrDecorationModule`, imported into `AppModule`, while `{ provide: RUN_LOOKUP, useExisting:
RunsService }` was bound in `AppModule`'s own `providers:` array. NestJS scopes non-`@Global()`
providers per-module, so a binding declared in a parent module's own `providers:` array is not
automatically visible inside a child module it imports — booting the compiled app crashed with
`UnknownDependenciesException: ... Symbol(RUN_LOOKUP) at index [0] is available in the
PrDecorationModule context`. Fixed by deleting `PrDecorationModule` (and its export from
`ee/pr-decoration/src/index.ts`) and co-locating `PrDecorationController`/`PrDecorationService`
directly in `AppModule`'s own `controllers:`/`providers:` arrays, mirroring the documented
`auth.module.ts` `SSO_USER_PROVISIONER` pattern — `ee/sso` never had a separate `SsoModule` for
the identical reason. A new regression test
(`apps/evaluation-service/src/app/app-module-boot.e2e.spec.ts`) boots the real, unmodified
`AppModule` via `Test.createTestingModule({imports:[AppModule]}).compile()` + `app.init()` — the
exact module graph `main.ts` passes to `NestFactory.create()` — and asserts `PrDecorationService`
resolves via the DI container. Neither pre-existing test type caught this class of bug: the unit
spec hand-constructs `PrDecorationService` directly (`new PrDecorationService(runsService as
never)`), bypassing Nest's DI container entirely, and `calibration.http-e2e.spec.ts` boots only a
hand-picked module subset that excludes `RunsModule`/`PrDecorationModule` altogether. A follow-up
commit corrected an inaccurate claim in that new test's own comment about which module registers
an `OnModuleInit` hook (`LicenseModule.forRoot()` does register one —
`EntitlementService.onModuleInit()` — but it is a synchronous, try/catch-guarded local file read
with no DB/network I/O, so the test's no-live-Postgres-required claim still holds).

The same phase also fixed `ee/pr-decoration/eslint.config.mjs`: its `jsonc-eslint-parser`
override had no `files:` filter, so ESLint parsed every `.ts`/`.mjs` file in the library as JSON.
Fixed by copying the `files:`-scoped override blocks from `ee/audit-export`'s
`eslint.config.mjs`. Once the parsing errors no longer masked real lint output, this surfaced a
genuine unused `class-transformer` dependency in `ee/pr-decoration/package.json` (never imported
by the library's source; it had still resolved at runtime only via the root workspace
dependency) — removed.

## Why

`ee/pr-decoration` is the plan's designated fourth and final Enterprise-gated feature (per
`docs/plans/2026-08-12-enterprise-tier-phase1-plan.md` and the `EnterpriseFeature` union already
defined in `docs/2026-08-13-enterprise-licensing-entitlement-engine-decision.md`), following SSO
(Phase 3), audit export (Phase 4), and custom RBAC roles (Phase 5). It follows the same
established pattern: a new `ee/*` library, gated with `EntitlementGuard`/
`@RequiresEntitlement(feature)`, wired into a composition-root `AppModule`, org-scoped via
`@CurrentUser()`'s verified JWT claim rather than a client-suppliable identifier, and additive to
the free CI gate rather than modifying it — `enable-pr-decoration` defaults to `false` and, even
when enabled, never affects the gate's own `process.exit()` behavior.

The structured comment-block payload (a JSON scenario list of `{name, decision}` pairs, delivered
via the endpoint and intended for the existing `actions/github-script` comment mechanism) was
chosen over literal, git-diff-line-anchored GitHub Checks-API annotations per the plan's own
documented rationale (Phase 6 preamble): this domain — AI-agent simulation scenarios — has no
inherent source-file/line mapping the way static-analysis findings do, so line-anchored
annotations would require inventing a synthetic mapping with no natural grounding. This is a
scope-narrowing implementation choice, not a change to the gating mechanism or feature boundary;
a richer Checks-API UX remains a plausible fast-follow.

The DI-scoping bug was fixed within this same phase (rather than deferred) because it was a
boot-crash, not a latent edge case — the compiled app could not start at all with
`PrDecorationModule` wired in, making it a blocking defect in the feature's own wiring, not
optional hardening. Unlike Phase 5's `isSystemAdmin()` bug chain (a pre-existing, dormant
vulnerability made newly reachable by that phase's feature, documented as an accepted residual
risk pattern in `ee/README.md`), this bug was introduced, found, and fully fixed and
regression-tested within this single phase before anything shipped — it is recorded here as
project history, not carried forward as an open gap.

## Alternatives Considered

- **Literal GitHub Checks-API line-anchored annotations, matching the design doc's "inline PR
  annotation payload" phrasing literally:** Rejected per the plan's own `[CHECKPOINT]`
  recommended default. AI-agent simulation scenarios have no inherent source-file/line mapping;
  synthesizing one would be an invented abstraction with no grounding in the actual failure data,
  for no clear user benefit over a structured comment block.
- **Keep `PrDecorationController`/`PrDecorationService` inside the library's own
  `PrDecorationModule`, importing it into `AppModule` instead of co-locating declarations:**
  Rejected once found to boot-crash. NestJS's per-module provider scoping means a `{ provide:
  RUN_LOOKUP, useExisting: RunsService }` binding declared in `AppModule`'s own `providers:` array
  is only resolvable by consumers declared in that same module — a separate `PrDecorationModule`
  has no visibility into it. This mirrors `ee/sso`'s identical, already-documented rejection of a
  dedicated `SsoModule` for the same structural reason.
- **Have `ee/pr-decoration` import `RunsService` directly instead of the `RUN_LOOKUP` DI-token/
  `RunLookup` structural-interface pattern:** Rejected. That would give an `ee/*` library a
  compile-time dependency on one specific composition root's internal service, defeating the
  point of `ee/*` being a boundary-respecting, independently reusable library — the same reasoning
  already applied to `ee/sso`'s `SSO_USER_PROVISIONER` token.
- **Render the decoration payload directly into the existing "Post PR comment" `github-script`
  step in this same phase:** Deferred, not rejected outright. The endpoint and its entitlement
  gating are the phase's exit criteria (`npx nx test evaluation-service` passes; the endpoint
  403s with no license, 200s with an entitled license; the existing pass/fail gate is unchanged);
  wiring the response body into the visible PR comment is additional scope with no bearing on
  whether the gating mechanism itself works, and is left as a natural fast-follow.

## Impact

- **End users / Enterprise customers:** CI pipelines using the `evaluate-pr` composite action can
  now opt in via `enable-pr-decoration: "true"` to have the action call `POST
  /api/evaluation/pr-decoration` for each completed run after the quality gate result is computed.
  With a valid, `pr-decoration`-entitled Enterprise license on the target EvalOps instance, the
  call succeeds; without one, it 403s and is logged non-fatally — the pass/fail gate behavior is
  identical either way. The decoration response is not yet surfaced in the PR comment itself.
- **Free-tier / all existing deployments:** No behavior change unless `enable-pr-decoration` is
  explicitly set to `"true"` in the workflow YAML (opt-in, defaults `"false"`). The existing
  pass/fail/warn CI gate and its PR comment are completely unmodified.
- **Contributors:** `ee/pr-decoration` is the fourth and final `ee/*` library actually imported by
  a composition-root app (after `ee/sso`, `ee/audit-export`, `ee/rbac-custom-roles`), completing
  the `EnterpriseFeature` union's originally-planned scope. The DI-scoping bug is a reusable
  cautionary precedent: any new `ee/*` library needing an app-owned DI-token binding
  (`useExisting`) must co-locate its controller/service declarations directly in the consuming
  `AppModule`, not wrap them in the library's own module — `ee/sso`'s `AuthModule` wiring already
  established this; `ee/pr-decoration` re-confirms it and adds a real regression test
  (`app-module-boot.e2e.spec.ts`) that boots the actual production module graph, which is now
  available as a template for catching this bug class in any future `ee/*` library.
- **Docs updated alongside this decision:** `docs/ARCHITECTURE.md` (Evaluation Service route
  list, `libs/licensing` section, "Enterprise Directory" section), `README.md` (`libs/licensing`
  Shared Libraries row, API Overview table), `docs/CLI_GUIDE.md` (`evaluate-pr` composite action
  example), `docs/2026-08-13-enterprise-licensing-entitlement-engine-decision.md` (Impact
  section, closing out the `EnterpriseFeature` union's four predicted features).
