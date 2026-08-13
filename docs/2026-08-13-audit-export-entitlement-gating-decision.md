# Audit-Trail CSV Export: New `ee/audit-export` Library, Entitlement-Gated (Phase 4)

## What Changed

A new `ee/audit-export` Nx library (`@evalops/ee-audit-export`) adds `GET
/api/audit-trail/export`, a CSV export of the audit trail, wired into `core-service`'s
`AppModule` behind `EntitlementGuard`/`@RequiresEntitlement('audit-export')`. With no valid
Enterprise license configured, the route returns `403` with an upsell body instead of reaching
`AuditExportService`. The existing free `GET /api/audit-trail` view (`AuditController`,
`libs/core-analytics`) is completely unchanged and stays available with no license required.

`AuditExportController` reads `organizationId` only from `@CurrentUser()` — the verified JWT
claim — never from a query or body parameter, mirroring `AuditController`'s org-scoping and
deliberately avoiding the class of IDOR previously seen on `POST
/policies/evaluate/:runId` (an org-scope check missing on a client-suppliable identifier).
`AuditExportService.buildCsv()` sanitizes every field against CSV/formula injection: any field
value starting with `=`, `+`, `-`, `@`, tab, or CR is prefixed with a literal single quote (the
standard Excel/Sheets/LibreOffice "treat as text" convention) before standard CSV quoting is
applied, since audit fields like `userName` are derived from user-controlled input (email) and
untrusted by the time they reach export. A new `AuditExportQueryDto` validates and caps the
`?limit` query param (`1`–`5000`, must be an integer) via `class-validator`, closing off both an
unvalidated-input path to the DB layer and an unbounded-`limit` resource-exhaustion vector
against `AuditRepository.findEnhancedByOrg`. `apps/core-service/src/app/app.module.ts` now
imports `LicenseModule.forRoot()` and `AuditExportModule`. A new integration test
(`apps/core-service/src/__tests__/audit-export-entitlement.integration.test.ts`) boots the real
`CoreAnalyticsModule` + `AuditExportModule` via `supertest` to prove: the free view still 200s
with no license; the export 403s with the upsell body with no license; the export 200s and
returns a real, correctly-scoped, injection-safe CSV for an entitled org; and the `?limit`
validation/cap actually rejects bad input.

## Why

`ee/audit-export` was the plan's designated second Enterprise-gated feature (per
`docs/2026-08-12-enterprise-tier-phase1-plan.md` and the `EnterpriseFeature` union already
defined in `docs/2026-08-13-enterprise-licensing-entitlement-engine-decision.md`), following SSO
in Phase 3 (`docs/2026-08-13-sso-relocation-and-entitlement-gating-decision.md`). Building it as
a brand-new `ee/*` library on top of the *existing* free `AuditController`/`libs/core-analytics`
view — rather than modifying that controller in place — keeps the free/paid boundary at the
directory/module level (enforced by `@nx/enforce-module-boundaries`, per "Enterprise Directory"
in `docs/ARCHITECTURE.md`) instead of an in-file conditional, and guarantees the free view's
behavior and test coverage are untouched by construction. CSV-injection sanitization and
limit-capping were treated as required, non-optional parts of this feature rather than
follow-up hardening: an audit-trail export is a data-exfiltration-adjacent surface administrators
routinely open in spreadsheet software, and an uncapped `limit` on an org-scoped table query is
an easy, obvious resource-exhaustion vector to close at DTO-validation time rather than
discover in production.

## Alternatives Considered

- **Add `?format=csv` to the existing free `AuditController`/`GET /api/audit-trail` and gate
  only that query param:** Rejected. Gating a query param rather than a distinct route would
  put Enterprise-only logic inside the free, OSS-licensed `libs/core-analytics` controller,
  undermining the FSL-1.1-MIT / `ee/LICENSE` split the same way the SSO decision doc rejected
  gating Microsoft Entra SSO in place inside `apps/auth-service`.
- **Skip CSV-injection sanitization since audit data is "internal":** Rejected. `userName` is
  derived from user-supplied email at signup and is not trusted input by the time it reaches an
  export a human will open in Excel/Sheets; the sanitization cost is a handful of lines and
  covers a well-known vulnerability class.
- **Leave `?limit` unvalidated (trust callers):** Rejected. An unvalidated `limit` passes
  straight through to `AuditRepository.findEnhancedByOrg`'s query volume; a caller (malicious or
  buggy) could request an unbounded result set. `AuditExportQueryDto` with `@Min`/`@Max`/`@IsInt`
  closes this at the edge with a real `400` instead of letting malformed input reach the DB
  layer.

## Impact

- **End users / Enterprise customers:** Anyone with a configured, valid Enterprise license
  (`EVALOPS_LICENSE_KEY`) can now export their organization's audit trail as CSV via `GET
  /api/audit-trail/export` (`GET /api/analytics/audit-trail/export` through the API Gateway).
  Free-tier customers continue to see `403` with an upsell body on that route; the existing free
  `GET /api/audit-trail` view is completely unaffected.
- **Contributors:** `ee/audit-export` is the second `ee/*` library actually imported by a
  composition-root app (after `ee/sso`), reinforcing the pattern from
  `docs/2026-08-13-sso-relocation-and-entitlement-gating-decision.md`: Enterprise code lives in
  `ee/*`, is wired into a composition-root `AppModule` behind
  `EntitlementGuard`/`@RequiresEntitlement(feature)`, and never modifies the free code path it
  builds on top of.
- **Docs updated alongside this decision:** `docs/ARCHITECTURE.md` ("Integration and Analytics"
  audit-trail entry, `libs/licensing` section, "Enterprise Directory" section), `README.md`
  (`libs/licensing` Shared Libraries row, API Overview table),
  `docs/2026-08-13-enterprise-licensing-entitlement-engine-decision.md` (Impact section).

## Update: DoS-hardening chase on the export endpoint, and the accepted residual risk

After this feature shipped, a doubt-verify pass and a follow-up re-hunt found the endpoint's
resource-exhaustion protection insufficient in two successive rounds. Both fixes were applied;
the third-round gap they surfaced is being accepted as a documented residual risk rather than
chased further, per an explicit user decision.

**Round 1 — `@Max(5000)` limit cap alone was insufficient.** `AuditExportQueryDto`'s
`?limit` cap (`1`-`5000`, `class-validator`) bounds a single request's result size, but
`AuditRepository.findEnhancedByOrg` fires one extra DB query per row (N+1). At `limit=5000`,
a single request can hold one connection from the shared `pg` pool (default `max: 10`, unset in
`libs/shared-db/src/lib/db.ts`) for up to 5001 sequential queries. As few as ~10 concurrent
requests — from a single user, or spread across a few — could exhaust the entire platform's
connection pool, denying DB access to every org, not just the requester's own. The cap alone did
not address concurrency.

**Round 2 — per-user rate limiting closed the single-account case, but not a multi-account
variant.** Commit `68fd2fd` applied the existing `RateLimitGuard`/`@RateLimit` convention
(mirrors `organizations.controller.ts`) to the export route: `@RateLimit({ limit: 5, ttl: 60 })`,
keyed per-user via `request.user.id`. This is a real, meaningful improvement over the prior
fully-unbounded state — a single account can no longer fire unlimited concurrent/rapid export
requests. A follow-up re-hunt found this insufficient against a multi-account variant:
`POST /auth/register` (`apps/auth-service/src/app/auth/auth.controller.ts`) carries no
`@RateLimit` of its own and is open to anyone, and Enterprise entitlement
(`EntitlementGuard`/`EntitlementService.hasFeature()`) is deployment-wide, not per-org — one
valid license on the deployment entitles every account on it, including ones registered seconds
ago. The exact math: an attacker registers 3 accounts (cheap, unrate-limited) and fires 5
concurrent export requests from each — 3 x 5 = 15 concurrent requests, each individually under
the per-user limit of 5, but 15 exceeds the pool's default 10-connection max. The same
resource-exhaustion outcome as Round 1 remains reachable, just requiring a small amount of
account-creation cost instead of none.

The same re-hunt also found 3 observability/robustness gaps in the shared `RateLimitGuard`
(`libs/shared-auth/src/lib/guards/rate-limit.guard.ts`), not specific to this endpoint:
- MEDIUM: its Redis-unavailable fail-open branch (`if (!this.redis) return true;`) logs nothing,
  so a Redis outage silently disables rate limiting repo-wide with no operational signal.
- MEDIUM: a `429` rejection is thrown with no logging, so there is no record of rate-limit
  rejections for monitoring or abuse detection.
- HIGH: the guard has no `try`/`catch` around its Redis calls and the `ioredis` client has no
  `commandTimeout` configured, so an unhandled Redis client error (Redis reachable but
  slow/degraded, distinct from cleanly absent) can cause an unlogged multi-second hang on the
  request path rather than a fast, clean fail-open or fail-closed response — an
  availability/robustness gap, not just a missing log line.

**Decision: stop here, keep the Round-2 fix as-is, document the remaining gap as accepted
residual risk.** The user explicitly decided not to pursue a Round 3 fix in this phase. Rationale:
- The remaining gap is systemic, not local to `audit-export` — it requires fixing open
  registration, deployment-wide (not per-org) entitlement scoping, and/or DB pool sizing, all of
  which are repo-wide concerns well beyond this single endpoint's scope.
- The Round-2 fix already converts an unbounded, zero-cost DoS into one that requires
  registering multiple accounts and coordinating concurrent requests — a real increase in
  attacker cost and a meaningful reduction in risk, even though it does not close the gap
  entirely.
- Continuing to chase this specific endpoint risks local-optimizing a symptom of a broader,
  unaddressed architectural gap (open registration + deployment-wide entitlement + fixed pool
  size) instead of fixing it once, correctly, in a dedicated pass.

**What a future hardening pass needs to address**, to fully close this class of risk:
1. Registration throttling (rate-limit or otherwise gate `POST /auth/register`, e.g. per-IP or
   with CAPTCHA/email verification), so cheap multi-account creation is no longer free.
2. Concurrency-aware rate limiting (bound *simultaneous in-flight* requests per user/org, not
   just requests-per-time-window), so N accounts racing concurrently cannot each stay under a
   per-account ceiling while collectively exceeding the pool.
3. Per-org (not deployment-wide) entitlement scoping, so a self-registered account cannot ride an
   unrelated org's Enterprise license.
4. DB connection pool sizing/isolation review (e.g. a dedicated, bounded pool for
   expensive/export-style queries, or fixing the underlying N+1 in
   `AuditRepository.findEnhancedByOrg` so a single request no longer holds a connection across
   thousands of sequential queries) — this closes the root cause rather than only the request
   rate.
5. Logging for both `RateLimitGuard` MEDIUM-severity observability gaps above (fail-open branch,
   429 rejections), so the interim state is at least observable while the systemic fix is
   pending.
6. `try`/`catch` + a `commandTimeout` around `RateLimitGuard`'s Redis calls, so a degraded (not
   just absent) Redis backend fails fast and cleanly instead of hanging the request for several
   seconds — closes the HIGH-severity gap above.

No code changed as part of this update — `ee/audit-export`'s Round-2 rate-limiting fix (commit
`68fd2fd`) is unmodified. This section is a documentation-only accepted-risk record. See also
`ee/README.md`'s "Known limitation: `audit-export`'s rate limit is count-based, not
concurrency-based" section for the user-facing summary.
