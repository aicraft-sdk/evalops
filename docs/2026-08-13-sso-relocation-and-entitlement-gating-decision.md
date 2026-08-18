# Microsoft Entra SSO Relocation and Entitlement Gating (Phase 3)

## What Changed

The Microsoft Entra SSO connector (`MicrosoftAuthController`, `MicrosoftAuthService`) was moved
out of `apps/auth-service/src/app/auth/microsoft/` into a new `ee/sso` Nx library
(`@evalops/ee-sso`), and both of its routes — `GET /api/auth/microsoft` and
`GET /api/auth/microsoft/callback` — are now gated with `@UseGuards(EntitlementGuard)` +
`@RequiresEntitlement('sso')`. With no valid Enterprise license configured
(`EVALOPS_LICENSE_KEY` unset or invalid), both routes now return `403` with an upsell body
(`{ upsell: true, feature: 'sso' }`) instead of reaching `MicrosoftAuthService`.
`MicrosoftAuthController` previously depended on `AuthService` directly for user provisioning
(`findUserByEmail`/`createUserFromMicrosoft`/`updateUserFromMicrosoft`/`login`); since `ee/sso`
must not have a compile-time dependency on `apps/auth-service` internals, that dependency was
replaced with a new `SSO_USER_PROVISIONER` DI-token interface (`SsoUserProvisioner`), and
`AuthModule` binds it via `{ provide: SSO_USER_PROVISIONER, useExisting: AuthService }`. This
`useExisting` binding is declared directly in `AuthModule` (not a separate `SsoModule`) because
NestJS scopes providers per-module — the binding is only resolvable by consumers declared in the
same module as `AuthService` — mirroring how `@evalops/shared-auth`'s `PAT_VALIDATOR` is wired
for `ApiAuthGuard` in `tokens.module.ts`. `apps/auth-service/src/app/app.module.ts` now imports
`LicenseModule.forRoot()`. A new integration test
(`apps/auth-service/src/__tests__/no-license-free-login.integration.test.ts`) exercises the real
`AuthModule` end to end (via `supertest`, `AuthService` overridden) to prove both that free
login (`POST /api/auth/login`, `GET /api/auth/user`) is unaffected with no license configured,
and that the relocated SSO routes genuinely 403 with the upsell body in that state.

## Why

This is the first Enterprise-gated feature to actually go live — Phase 1/2 of the Enterprise
Tier plan (`docs/plans/2026-08-12-enterprise-tier-phase1-plan.md`) shipped the `libs/licensing`
entitlement engine and the `ee/` directory/module-boundary scaffolding, but neither phase gated
any real user-facing route (see
`docs/2026-08-13-enterprise-licensing-entitlement-engine-decision.md`'s Impact section, updated
alongside this doc). SSO was chosen as the plan's designated first Enterprise feature (per
`activeContext.md`/`patterns.md`'s open-core model), so relocating it into `ee/` and gating it
with `EntitlementGuard` was the natural first proof that the entitlement engine and the `ee/`
module-boundary actually enforce something in production, not just in isolation. Introducing
`SSO_USER_PROVISIONER` as a DI-token interface (rather than `ee/sso` importing `AuthService`
directly) keeps the `@nx/enforce-module-boundaries` constraint meaningful in both directions:
`ee/sso` has no compile-time knowledge of `apps/auth-service`'s concrete `AuthService`
implementation, so it stays a portable, independently-testable library rather than becoming
tightly coupled to one composition root's internals.

## Alternatives Considered

- **Leave `MicrosoftAuthController`/`MicrosoftAuthService` in `apps/auth-service` and gate them
  in place:** Rejected. Leaving Enterprise-only code inside an OSS-licensed app directory would
  make the FSL-1.1-MIT / `ee/LICENSE` split (see
  `docs/2026-08-13-fsl-relicensing-and-ee-directory-decision.md`) unenforceable for this feature
  — anyone building the OSS-only tree would still get the SSO connector's source, with only a
  runtime guard (rather than the codebase itself) marking it Enterprise-only.
- **Wrap the relocated code in a dedicated `SsoModule` instead of declaring providers directly in
  `AuthModule`:** Rejected for this phase. NestJS's per-module provider scoping means a
  `{ provide: SSO_USER_PROVISIONER, useExisting: AuthService }` binding is only resolvable by
  consumers in the same module as `AuthService` (a plain, non-`@Global()` provider); a separate
  `SsoModule` would need to re-export `AuthService` or accept a more indirect wiring path for no
  functional benefit at this scale.
- **Have `ee/sso` import `AuthService` directly instead of introducing `SsoUserProvisioner`:**
  Rejected. That would give an `ee/*` library a compile-time dependency on one specific
  composition root's internal service, defeating the point of `ee/*` being a boundary-respecting,
  independently reusable library boundary.

## Impact

- **End users:** Anyone without a configured Enterprise license (`EVALOPS_LICENSE_KEY`) can no
  longer log in via Microsoft Entra SSO — `GET /api/auth/microsoft` now returns `403` with an
  upsell body. Free-tier email/password login and JWT/PAT-authenticated routes are unaffected.
- **Existing Enterprise/self-hosted deployments relying on SSO before this phase:** Must obtain
  and configure a valid Enterprise license envelope (see
  `docs/2026-08-13-enterprise-licensing-entitlement-engine-decision.md`) before upgrading past
  this phase, or Entra login will start failing with `403`.
- **Contributors:** Any future Enterprise-gated route added to a composition-root app should
  follow this same pattern — code lives in `ee/*`, a DI-token interface decouples it from the
  composition root's concrete services where needed, and `@RequiresEntitlement(feature)` +
  `EntitlementGuard` enforce the gate.
- **Docs updated alongside this decision:** `docs/ARCHITECTURE.md` ("Auth Service" route list,
  `libs/licensing` section, "Enterprise Directory (`ee/`)" section),
  `docs/2026-08-13-enterprise-licensing-entitlement-engine-decision.md` (Impact section),
  `README.md` (`libs/licensing` Shared Libraries row).
