# ee/ — EvalOps Enterprise

Code in this directory is licensed under `ee/LICENSE`, distinct from the FSL-1.1-MIT
license covering the rest of this repository (see root `LICENSE`). It is gated at
runtime by `@evalops/licensing`'s `EntitlementGuard` and is structurally excludable
from the OSS build: no `scope:shared`/`scope:core-analytics`/`scope:core-integration`
library may import from here (enforced by `eslint.config.mjs`'s
`@nx/enforce-module-boundaries` `depConstraints` — see Phase 2 of
`docs/plans/2026-08-12-enterprise-tier-phase1-plan.md`). Only the intended composition
roots — `auth-service`, `core-service` (`scope:core-domain`), and `evaluation-service`
(all currently `tags: []`, matched only by the permissive wildcard `depConstraints`
entry) — may import `ee/*` libraries, and only behind an `EntitlementGuard`-protected
route. `apps/frontend` (`scope:frontend`), `apps/cli` (`scope:cli`), and
`apps/api-gateway` (`scope:api-gateway`) each carry an explicit restrictive
`depConstraints` entry (`onlyDependOnLibsWithTags: ['scope:shared']`, no
`scope:enterprise`) that structurally forbids them from importing `ee/*` — this
matters most for `apps/frontend`, a Vite browser bundle where an accidental `ee/*`
import would ship proprietary code into the public frontend bundle.

## Known limitation: this is a lint-time structural boundary, not a runtime sandbox

`@nx/enforce-module-boundaries` only inspects static `import` / `import()` AST nodes. It has
no visibility into `require()` or `eval()` — a workspace-relative or aliased `require('ee/...')`
(or `eval('require')('ee/...')`) call is invisible to this rule and will not be flagged by
`npx nx run-many --target=lint --all`. This is not hypothetical: `shared-common` and `shared-db`
already use `require()` / `eval('require')(...)` to lazy-load `@evalops/dev-runtime` in dev mode
(so a native `better-sqlite3` addon doesn't get statically bundled into production builds) — the
same mechanism could, in principle, be pointed at `ee/*` code by a future contributor without
tripping the lint rule.

As with `sandbox-security.service.ts`'s validator, treat this as a best-effort static pre-filter
with a documented, accepted gap — not a runtime enforcement boundary. The real boundary a
malicious or careless `require()`/`eval()`/dynamic-`import()` call could cross is: (1) the
`EntitlementGuard` runtime check that gates every `ee/*` feature behind a valid license, and
(2) code review. A coarse compensating lint rule (`no-restricted-syntax` in `eslint.config.mjs`)
flags the obvious/easy case — a `require()`/`eval()`/dynamic-`import()` call whose argument is
either a plain string literal (`require('ee/sso')`) or a zero-interpolation template literal
(`` require(`ee/sso`) `` — syntactically just as "obvious" as a plain string, not real
obfuscation) naming an `ee/*` path or `@evalops/ee-*` package — but it does not (and cannot, via
static source analysis alone) catch arbitrary obfuscation: a template literal WITH interpolation
(`` require(`ee/${moduleName}`) ``), an indirectly-referenced `eval`/`require` via a variable
(`const r = require; r('ee/sso')`), or a `Function`-constructor equivalent
(`Function('return require("ee/sso")')()`). Do not treat a clean `no-restricted-syntax` pass as
proof that no OSS code reaches `ee/*` at runtime.

## Known limitation: `audit-export`'s rate limit is count-based, not concurrency-based

`GET /api/audit-trail/export` (`ee/audit-export`) is protected by
`@RateLimit({ limit: 5, ttl: 60 })` (commit `68fd2fd`), which closes the original
fully-unbounded-request DoS: `AuditRepository.findEnhancedByOrg` fires one extra DB query per
row (N+1), so 5000-row requests (the `@Max(5000)` cap on `?limit`) each hold one connection from
the shared, default-max-10 `pg` pool for many sequential queries. Five requests per user per 60
seconds is a real, meaningful reduction from the prior unbounded state.

It does not close a *multi-account* variant: `POST /auth/register` has no rate limit of its own,
and Enterprise entitlement (`EntitlementGuard`/`EntitlementService.hasFeature()`) is
deployment-wide, not per-org, so any org's valid license entitles every account on the
deployment, including cheaply self-registered ones. An attacker can register 3 accounts and fire
5 concurrent export requests from each (3 x 5 = 15 concurrent requests) — under the per-user
limit on every single account, but 15 > the pool's default max of 10 connections, still
approaching/exceeding the connection pool.

This is a known, accepted residual risk, not an oversight: it was identified during a
DoS-hardening pass and deliberately not fixed further, because the root causes (open
registration, deployment-wide entitlement, fixed pool size, and the underlying N+1 query
pattern) are repo-wide gaps, not specific to `audit-export`, and are out of scope for a
single-endpoint fix. A dedicated future hardening pass is required, covering: registration
throttling, concurrency-aware (not just count-based) rate limiting, and/or DB pool sizing. See
`docs/2026-08-13-audit-export-entitlement-gating-decision.md` for the full history of what was
tried and the exact math behind this residual risk.

Three related, accepted observability/robustness gaps in the shared `RateLimitGuard`
(`libs/shared-auth/src/lib/guards/rate-limit.guard.ts`), found during the same pass and left
undocumented until now:
- The guard's Redis-unavailable fail-open branch (`if (!this.redis) return true;`) logs nothing,
  so a Redis outage silently disables rate limiting across every `@RateLimit`-protected route in
  the repo with no operational signal. MEDIUM-severity.
- A `429` rejection (`count > options.limit`) is thrown with no logging, so there is currently no
  record of rate-limit rejections for monitoring or abuse detection. MEDIUM-severity.
- The guard has no `try`/`catch` around its Redis calls (`this.redis.incr(key)` /
  `.expire(...)`), and the underlying `ioredis` client has no `commandTimeout` configured. If
  Redis is reachable but slow/degraded (as opposed to cleanly absent, which the first bullet
  above covers), a request can hang for a meaningful multi-second period retrying the Redis
  command before erroring, rather than failing open or closed quickly. HIGH-severity — an
  availability/robustness gap, distinct from the two logging gaps above, not just a logging
  omission.
All three are accepted, documented gaps for a future hardening pass — not blocking for this
phase.

## Known limitation: `isSystemAdmin()` fails closed under dev-mode SQLite

`PermissionsService.isSystemAdmin()` (`apps/auth-service/src/app/permissions/permissions.service.ts`)
checks `role.isSystemRole === true && role.priority >= 100` to grant the unconditional
Administrator bypass. `roles.isSystemRole` is a pg-core `boolean()` column; on production
Postgres this round-trips as a real JS `true`/`false`, so the strict-equality check is correct
there. Under `EVALOPS_DEV_MODE=1` (dev/CI-only SQLite, never a supported production deployment
target), reads are never coerced back to a JS boolean — `better-sqlite3` returns the raw stored
integer (`0`/`1`), so a real Administrator role reads back as `1`, and `1 === true` is `false`.

The practical effect: under dev-mode SQLite only, `isSystemAdmin()`'s unconditional bypass never
fires for anyone, including the real Administrator role — every permission check falls through to
the normal role/resource-permission grant lookup instead. This **fails closed** (denies the
bypass rather than granting it to the wrong roles, the opposite direction of every other finding
in this phase's remediation chain) and has no effect on production Postgres, where the column
round-trips correctly. Found during Phase 5's final doubt-verify/re-hunt pass while closing an
unrelated dev-mode SQLite boolean-binding bug (see
`docs/2026-08-13-custom-rbac-entitlement-gating-decision.md`'s "Dev-mode SQLite boolean binding"
section) — pre-existing, not introduced by that fix, and left as an accepted, documented gap
rather than fixed in this phase, since it is non-exploitable and dev-mode-only.

A future pass touching this file should change the check to a truthy comparison
(`role.isSystemRole && role.priority >= 100`), matching the dev-mode-safe pattern already used in
`ee/rbac-custom-roles/src/lib/custom-roles.service.ts`'s `assertMutableCustomRole()` (`if
(role.isSystemRole)`), plus a regression test exercising the real dev-mode SQLite read path (the
existing `isSystemAdmin()` test suite uses hand-built mock `Role` objects with real JS booleans,
so it does not exercise this gap).
