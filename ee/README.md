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
