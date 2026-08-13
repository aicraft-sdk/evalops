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
