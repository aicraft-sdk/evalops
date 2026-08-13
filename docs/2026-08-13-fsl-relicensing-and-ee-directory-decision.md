# Relicensing to FSL-1.1-MIT + `ee/` Enterprise Directory Split

## What Changed

The repository's root `LICENSE` changed from bare MIT to the Functional Source License,
Version 1.1, MIT Future License (FSL-1.1-MIT): source-available with a "no Competing Use"
limitation (no offering the Software, or a substitute/substantially-similar service, to third
parties in competition with the Licensor), and a grant of the MIT license after a time-delayed
future conversion. `package.json`'s `license` field changed from `"MIT"` to
`"SEE LICENSE IN LICENSE"`. The root `LICENSE` file currently carries a
`[LICENSOR NAME]` `[CHECKPOINT]` placeholder pending legal sign-off.

A new `ee/` directory was scaffolded to hold proprietary Enterprise-tier code, licensed
separately under `ee/LICENSE` (also placeholder text pending legal review) — explicitly not
FSL-1.1-MIT and not open source. `ee/README.md` documents that `ee/*` code is gated at runtime
by `libs/licensing`'s `EntitlementGuard`.

Structural (not just license-text) separation between the OSS core and `ee/` is enforced via
new `@nx/enforce-module-boundaries` `depConstraints` in `eslint.config.mjs`: a `scope:enterprise`
tag applied to `ee/*`, with no `scope:shared`/`scope:core-integration`/`scope:core-analytics`
library permitted to depend on it, and explicit `onlyDependOnLibsWithTags: ['scope:shared']`
constraints added for `apps/frontend`, `apps/cli`, and `apps/api-gateway` (previously
unrestricted apps that would otherwise have fallen through to the permissive wildcard rule).
Only the composition-root apps (`auth-service`, `core-service`, `evaluation-service`) may import
`ee/*`. A compensating `no-restricted-syntax` ESLint rule was added to flag the obvious
`require()`/`eval()`/dynamic-`import()` literal-string cases that bypass the AST-based
`enforce-module-boundaries` check, documented as a non-exhaustive, lint-time-only control.

## Why

EvalOps is adopting an open-core business model: the OSS core stays source-available (not
permissively MIT) so that a competitor cannot take the code and offer it as a competing hosted
service, while Enterprise-tier features (SSO, custom RBAC roles, audit export, PR decoration —
see `docs/2026-08-13-enterprise-licensing-entitlement-engine-decision.md`) live in a separately
licensed, non-open-source `ee/` tree gated by `libs/licensing`'s entitlement engine. FSL-1.1-MIT
was chosen over bare MIT specifically to close the "someone forks the OSS core and resells it as
a competing hosted service" gap, while the future MIT conversion preserves long-term
open-source goodwill (precedent: Sentry, GitLab EE-style open-core licensing). The Nx
`depConstraints` boundary exists because a license file alone is a legal control, not a
technical one — without it, nothing would stop an OSS library or a public-facing app bundle
(most importantly `apps/frontend`, a browser bundle) from accidentally importing and shipping
proprietary `ee/*` code.

## Alternatives Considered

- **Keep bare MIT for the whole repository:** Rejected. Permissive MIT would let a competitor
  freely fork and resell the OSS core as a competing hosted service, undermining the Enterprise
  tier's commercial value.
- **Fully proprietary/closed-source relicense of the entire repository:** Rejected. Would
  sacrifice the open-source community/adoption benefits and contradicts the open-core model
  where the free tier (CLI/SDK/CI-gate/policy-engine/golden-sets-calibration/basic RBAC/RLS
  multi-tenancy/audit viewing) is meant to stay genuinely open and self-hostable.
- **License-text-only separation for `ee/` (no code-level enforcement):** Rejected. A license
  file cannot stop an accidental `import` from an OSS library or the public `apps/frontend`
  bundle into `ee/*` at build time; the Nx `depConstraints` boundary provides that structural
  enforcement, with a documented, accepted lint-time-only limitation (no visibility into dynamic
  `require()`/`eval()`) rather than a false claim of runtime sandboxing.

## Impact

- **Contributors:** Any new OSS library or app must be correctly tagged (`scope:shared`,
  `scope:frontend`, `scope:cli`, `scope:api-gateway`, etc.) for the `depConstraints` boundary to
  apply — an untagged (`tags: []`) app or library falls through to the permissive wildcard rule
  and is *not* protected from importing `ee/*`, as was found and fixed for `libs/dev-runtime`,
  `apps/frontend`, `apps/cli`, and `apps/api-gateway` in this phase.
- **Legal/business:** Both `LICENSE` and `ee/LICENSE` currently contain `[CHECKPOINT]`
  placeholder text (`[LICENSOR NAME]`, `[YEAR]`) that must be resolved with actual legal entity
  names before any public release or tag — this is a known, tracked gap, not an oversight.
- **End users / downstream consumers:** The OSS core is no longer permissively MIT-licensed;
  anyone redistributing or building a competing hosted offering on top of the OSS core is now
  subject to FSL-1.1-MIT's "no Competing Use" limitation. No behavior change for self-hosted,
  non-competing use.
- **Docs updated alongside this decision:** `README.md` (`## License` section), `docs/ARCHITECTURE.md`
  (new `## Enterprise Directory (\`ee/\`)` section).
