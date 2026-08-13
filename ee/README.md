# ee/ — EvalOps Enterprise

Code in this directory is licensed under `ee/LICENSE`, distinct from the FSL-1.1-MIT
license covering the rest of this repository (see root `LICENSE`). It is gated at
runtime by `@evalops/licensing`'s `EntitlementGuard` and is structurally excludable
from the OSS build: no `scope:shared`/`scope:core-analytics`/`scope:core-integration`
library may import from here (enforced by `eslint.config.mjs`'s
`@nx/enforce-module-boundaries` `depConstraints` — see Phase 2 of
`docs/plans/2026-08-12-enterprise-tier-phase1-plan.md`). Only apps
(`auth-service`, `core-service`, `evaluation-service`) may import `ee/*` libraries,
and only behind an `EntitlementGuard`-protected route.

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
flags the obvious/easy case — a `require()`/`eval()` call whose literal string argument names an
`ee/*` path or `@evalops/ee-*` package — but it does not (and cannot, via static source analysis
alone) catch arbitrary obfuscation (e.g. a dynamically constructed string, indirect `eval`, or a
`Function`-constructor equivalent). Do not treat a clean `no-restricted-syntax` pass as proof that
no OSS code reaches `ee/*` at runtime.
