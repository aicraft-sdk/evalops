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

## Update: `evaluate-pr`'s fetch-timeout hardening, and an accepted residual risk on the run-execution budget

After this feature shipped, a doubt-verify pass on Phase 6 as a whole found — unrelated to
PR-decoration itself — that `.github/actions/evaluate-pr/run.js`'s HTTP calls (the free-tier CI
gate's own suite-execution/polling logic, not the new gated endpoint) had no request timeout at
all, risking multi-minute-to-unbounded CI stalls against a hanging server. Five remediation
rounds followed; the third introduced a regression later corrected by a fourth, and a fifth found
and fixed an unhandled-propagation gap the second round's own verification had missed. All five
are closed; a residual risk surfaced along the way is accepted rather than chased further.

**Round 1 — `maybeDecorate()`'s fetch had no timeout.** The new opt-in PR-decoration call itself
could hang for Node/undici's implicit ~5-minute default against an unresponsive server, before its
already-non-fatal `catch` block would log and move on — technically never affecting the CI gate's
exit code, but not meaningfully "non-blocking" in practice. Fixed by adding `signal:
AbortSignal.timeout(10_000)` to its `fetch()` call, verified against a real hanging local server
(pre-fix: hung past a 20s hard kill; post-fix: aborts and logs non-fatally at ~10.09s).

**Round 2 — the same gap existed in `request()`, the shared helper backing nearly every other
call in the script, including `pollRun()`'s per-poll status GET.** A single hung poll could itself
consume up to ~5 minutes before `pollRun()`'s own `while (Date.now() - start < timeoutMs)` check
ever re-evaluated, silently letting real elapsed time exceed the `timeoutMs` the eventual timeout
error message claims. Fixed identically: `signal: AbortSignal.timeout(10_000)` added to
`request()`'s single shared `fetch()` call, verified against a real hanging server for the general
case and for `pollRun()`'s genuinely-hung-forever/outer-`timeoutMs` contract specifically.
**Correction (added in Round 5 below): this verification did not cover, and this round did not
actually fix, the case where a single poll is merely slow rather than permanently hung** —
`pollRun()`'s per-poll `request()` call had no `try/catch` of its own, so once `AbortSignal.timeout`
started firing on individual polls (as a direct consequence of this round's own change), a lone
transient-slow response would throw straight out of `pollRun()`'s `while` loop instead of being
retried within it. That gap went unnoticed through Rounds 2–4 and is what Round 5 found and fixed.

**Round 3 — Round 2's blanket 10s cap regressed `POST .../suites/:suiteId/run`.** That endpoint is
architecturally synchronous server-side (`runSuite()` awaits every scenario's real LLM execution
before responding), and `AIProviderService.withResilience` alone defaults to a 30s timeout with up
to 3 retries — a single healthy call can legitimately take well over 10s. The blanket cap would
false-positive-fail healthy CI runs on any non-trivial suite. Caught by re-review before merging,
with a live reproduction proving the false-positive (an 18s-delayed-but-healthy server: old code
aborted at ~11s, correct behavior would have been to wait).

**Round 4 — fix: give `request()` a per-call `timeoutMs` parameter.** Default `10_000` (unchanged,
correct for the fast metadata GETs: suite/scenario list, `pollRun()`'s poll GET). The `POST
.../run` call site now passes a dedicated `RUN_TIMEOUT_MS = 600_000` (10 minutes), matching
`pollRun()`'s own pre-existing budget assumption. Verified via a real reproduction: the actual
pre-fix code false-aborts against an 18s-delayed server; the fixed code completes successfully
against the same server at ~18s elapsed; the fast-GET paths remain correctly bounded at ~10s
against a genuinely hung server.

**Round 5 — a 5th doubt-verify pass found `pollRun()` itself had no `try/catch` around its
per-poll `request()` call, so Round 2's new `AbortSignal.timeout` on that same call could now
throw straight out of `pollRun()`'s `while` loop and propagate uncaught through `main()` to
`main().catch()`, hard-failing the whole CI run on a single transient slow poll response — even
though the run might have completed healthily well within the outer 600s polling budget the
`while` loop exists specifically to tolerate. Reproduced directly against the pre-fix code: an
11s-then-healthy fake poll response caused `pollRun()` to throw `The operation was aborted due to
timeout` and exit 1 at ~10s elapsed, never reaching the run's actual completion one second later.
Fixed by wrapping the per-poll `request()` call in `pollRun()`'s loop in its own `try/catch`: a
caught error is logged non-fatally (`Poll for run ${runId} failed non-fatally: ${err.message}`,
matching `maybeDecorate()`'s existing non-fatal-logging style) and the loop continues to its next
iteration (respecting the existing 3000ms inter-poll delay and the outer `timeoutMs` budget)
instead of throwing. The loop's final `throw new Error(...)` timed-out case is unchanged — if
polling genuinely never succeeds within `timeoutMs`, that still surfaces as a real, hard failure.
Verified via two real reproductions against the fixed code: (1) the same 11s-then-healthy fake
server now logs one non-fatal poll failure and completes successfully (exit 0, ~13s elapsed,
previously exit 1); (2) a genuinely-hung-forever fake server (never responds to any poll), driven
through a test-only copy of `run.js` with `pollRun()`'s call site's `timeoutMs` scaled down to
4000ms (the shipped file's real 600,000ms default is unchanged), still throws the expected
`Run run-1 timed out after 4s` and exits 1 at ~13s elapsed rather than looping forever — proving
the outer budget genuinely still governs total wait time even though a single poll's own
`request()` timeout (10s default) is independent of and can exceed `pollRun()`'s outer budget.

**Accepted residual risk: `RUN_TIMEOUT_MS = 600_000` is a plausible, not rigorously-proven,
budget.** A final re-hunt independently re-derived the real worst-case duration rather than
trusting that `pollRun()`'s pre-existing 600s default had itself been correctly sized:
`withResilience`'s actual retry/backoff math (2 timed-out 30s attempts + backoff + a 3rd
successful-but-slow 30s attempt) puts a single AI call's worst-case success time at roughly 93s,
not the ~30s the round-3 fix's own reasoning assumed — and neither turns-per-scenario nor
scenarios-per-suite has any system-enforced cap. A realistic large suite (or a suite that hits
transient retries — exactly the condition `withResilience` exists to tolerate) can legitimately
exceed 600s, causing a false-negative CI failure for a suite that would have passed given more
time. This does not regress anything — it is strictly better than the pre-Round-1 state, where
every non-trivial suite POST was already guaranteed to fail against the (even shorter) blanket
10s cap — but `RUN_TIMEOUT_MS`'s specific value remains an inherited, not independently-verified,
assumption.

**Decision: accept as documented residual risk, do not chase further in this phase.** Per user
decision. Rationale:
- The properly correct fix is architectural, not a timeout-value tweak: make `POST .../run`
  return immediately (run IDs only) and let the already-designed-for-this `pollRun()` loop own the
  full wait, rather than holding one synchronous HTTP call open for up to 10 minutes. That is a
  meaningfully larger change than a REM-FIX cycle should attempt, and is unrelated to anything
  Phase 6 (or this whole Enterprise Tier plan) set out to build — this whole timeout sub-chain was
  discovered incidentally while hunting an unrelated bug class, not part of the original plan
  scope.
- The same re-hunt also found a related, pre-existing, not-newly-introduced gap: `runSuite()` has
  no server-side cancellation wired to the client's abort signal, so a client-side timeout leaves
  the server executing the suite to completion regardless. Raising the client-side budget from 10s
  to 600s makes this pre-existing gap more likely to actually manifest (more suites now run long
  enough to hit it) but does not introduce it.
- No further code change was made as part of this update — the current, corrected `run.js` shipped
  as-is. A future dedicated pass should: (1) make suite execution genuinely asynchronous
  (return-immediately + poll), closing this class of budget-guessing entirely; (2) add explicit,
  system-enforced caps on turns-per-scenario and scenarios-per-suite if unbounded suite size is
  not actually an intended capability; (3) wire server-side request cancellation so an abandoned
  client doesn't leave orphaned work running.

**Round 6 (final) — `pollRun()`'s catch block couldn't distinguish a transient failure from a
real HTTP error, so a genuinely broken run silently retried for the full 10-minute budget instead
of failing on the first poll.** Round 5's fix wrapped `pollRun()`'s per-poll `request()` call in a
`try/catch` that logs and retries on ANY caught error, but `request()`'s two throw paths —
`AbortSignal.timeout` firing (transient) vs. the `if (!resp.ok) { throw new Error(...) }` branch
firing on a real 4xx/5xx (permanent) — were both plain, untyped `Error` objects, indistinguishable
in the catch block. A bad run ID (404) or expired/invalid auth (401/403) therefore retried silently
every 3s for the full `timeoutMs` (600,000ms in production) before eventually surfacing only the
generic `Run ${runId} timed out after 600s` message, discarding the actionable HTTP error entirely.
Both a re-review and a re-hunt independently reproduced this live against a real fake HTTP server.
Fixed by adding a `class HttpStatusError extends Error` (carrying `status` and the already-captured
response body text) thrown only by `request()`'s `!resp.ok` branch; `pollRun()`'s catch block now
checks `err instanceof HttpStatusError` and re-throws immediately (fail-fast) for that case, while
every other error type (native `AbortSignal.timeout`/`DOMException`, network-level failures like
`TypeError: fetch failed`) keeps the existing non-fatal-log-and-retry behavior unchanged. The
outer genuinely-hung-forever contract (`while (Date.now() - start < timeoutMs)` and the final
`throw new Error(...timed out after...)`) was not touched by this change.

This round also closed the actual root cause of the sub-chain's length: all five prior rounds were
verified only by ad-hoc manual reproduction against a throwaway or test-only copy of `run.js`,
each covering exactly one failure shape and leaving an adjacent one uncovered. A real, persisted
automated test file (`.github/actions/evaluate-pr/run.test.js`, Node's built-in `node:test` module
— no new dependency, no established alternative convention exists for testing a plain composite-
action script outside the Nx project graph) now exercises `pollRun()` directly against a real
`http.Server`, covering both contracts together in the same suite: (a) tolerates one transient
network-level failure (`req.socket.destroy()` before any response) then succeeds — proving Round
5's behavior still holds; (b) fails fast (~3ms, not the full budget) on a real, fast HTTP 404 for
every poll, asserting the thrown error `instanceof HttpStatusError` with `status === 404` — proving
this round's fix. Run via `node --test .github/actions/evaluate-pr/run.test.js` (no `package.json`
was added in `.github/actions/evaluate-pr/` to avoid Nx auto-detecting a stray project from a bare
`package.json` with no `nx`/`type` awareness of the composite action's own ESM resolution; a
documented `node --test` invocation was judged the safer, equally-idiomatic option the task
explicitly allowed). Making `pollRun()`/`request()`/`HttpStatusError` importable also required
guarding `run.js`'s previously-unconditional bottom-of-file `main().catch(...)` auto-invocation
behind an `if (process.argv[1] === fileURLToPath(import.meta.url))` "is this the entry module"
check — otherwise merely importing the file for testing would itself run `main()` and call
`process.exit()`. Verified this glue change is behavior-preserving for the real composite-action
invocation path (`node run.js` with no env vars still exits 1 with the original error message).

**Decision: this closes the fetch-timeout sub-chain.** Six rounds total (5 timeout-hardening +
this HTTP-status-vs-transient distinction), each verified with a real HTTP server reproduction
against the actual shipped code rather than assumption. The separately-documented
`RUN_TIMEOUT_MS = 600_000` budget-sizing residual risk above is a different, still-accepted issue,
unrelated to this fix, and remains open as documented.
