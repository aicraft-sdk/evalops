# Enterprise Licensing/Entitlement Engine (Phase 1)

## What Changed

Added a new `libs/licensing` Nx library implementing an offline, cryptographically-signed
license/entitlement engine: `LicenseVerifierService` verifies a base64-encoded envelope
(`{ payload, signature }`) against a committed Ed25519 public key
(`src/lib/keys/license-public-key.pem`) using Node's `crypto.verify`; `computeLicenseStatus`
derives a `LicenseState` (`none | valid | expired_grace | expired | malformed`) from the decoded
`LicenseClaims` (`licenseId`, `orgName`, `features: string[]`, `issuedAt`, `expiresAt`) and the
current time, with a 14-day `expired_grace` window; `EntitlementService.hasFeature(feature)` is a
total function (never throws) exposing per-feature checks for the four Enterprise features
(`sso`, `rbac-custom-roles`, `audit-export`, `pr-decoration`). `@RequiresEntitlement(feature)` +
`EntitlementGuard` (deliberately fail loud with a 500 if applied without the decorator, unlike
`RbacGuard`'s "no metadata → allow" default) exist for future route-level gating.
`LicenseModule.forRoot()` registers the module with a test-overridable public key.
`scripts/licensing/sign-license.ts` (`npm run license:sign`) plus the exported
`signLicenseEnvelope()` util let a dev/test license be issued locally without touching the real
production private key. `tsconfig.base.json` gained the `@evalops/licensing` path alias and
`package.json` gained the `license:sign` script. This phase is purely additive: the library is
not imported by any app (`apps/`) yet, so no existing free-tier route or behavior is gated or
otherwise changed.

## Why

EvalOps is adopting an open-core business model (self-hosted-first; no hosted/Cloud
infrastructure or billing/metering this phase — see `activeContext.md`/`patterns.md`): SSO
(including the existing Microsoft Entra connector), custom RBAC roles beyond the 3 built-in,
audit export, and PR decoration move behind an Enterprise license, while CLI/SDK/CI-gate/
policy-engine/golden-sets-calibration/basic RBAC/full RLS multi-tenancy/audit viewing stay free.
An offline, signed-license-file mechanism (private key never enters the repo; only the public
key is committed) was chosen over an online license server because no license-server/
control-plane infrastructure exists or is being built this phase (explicitly deferred to a
future Cloud phase), it matches SonarQube/GitLab self-hosted-EE licensing precedent, and many
self-hosted/enterprise buyers actively avoid phone-home licensing. The engine is fail-closed
(any missing/malformed/expired license disables Enterprise features) but with a 14-day grace
period on expiry specifically to avoid an instant production lockout of e.g. SSO login over a
lapsed-license weekend.

## Alternatives Considered

- **Online license server / phone-home validation:** Rejected for this phase. No control-plane
  infrastructure exists yet (planned for a future Cloud phase), and self-hosted enterprise
  buyers commonly resist licensing schemes that require outbound network calls to a vendor
  server.
- **Instant lockout on expiry (no grace period):** Rejected. A hard cutoff the moment a license
  expires risks breaking production SSO/RBAC/audit-export over a weekend or renewal-processing
  delay; a bounded 14-day grace window (loudly logged) balances enforcement against operational
  safety.
- **`EntitlementGuard` mirroring `RbacGuard`'s "no metadata → allow" default:** Rejected.
  `RbacGuard` treats an undecorated route as unrestricted by design, but the same default on
  `EntitlementGuard` would mean a forgotten `@RequiresEntitlement()` decorator silently leaks a
  paid feature for free with no error. `EntitlementGuard` instead throws a 500 when applied
  without the decorator, treating it as a configuration bug, not an entitlement decision.

## Impact

- **End users / free-tier customers:** None at the time this phase shipped — `libs/licensing`
  existed standalone and was not imported by any app. **Update:** a later phase of this same
  plan wired `LicenseModule`/`EntitlementGuard` into `auth-service` and gated the Microsoft Entra
  SSO login routes behind `@RequiresEntitlement('sso')` — the prediction below has been
  fulfilled; see `docs/2026-08-13-sso-relocation-and-entitlement-gating-decision.md` for that
  decision. Free-tier login/JWT/PAT behavior remains unaffected.
- **Future phases (this plan):** Later phases of
  `docs/plans/2026-08-12-enterprise-tier-phase1-plan.md` will wire `LicenseModule`/
  `EntitlementGuard`/`@RequiresEntitlement()` into other services (custom RBAC roles, audit
  export, PR decoration), at which point those routes become genuinely license-gated too.
  **Update:** a subsequent phase wired `LicenseModule`/`EntitlementGuard` into `core-service`
  and gated a new `GET /api/audit-trail/export` route behind `@RequiresEntitlement
  ('audit-export')` — the second prediction fulfilled; see
  `docs/2026-08-13-audit-export-entitlement-gating-decision.md`. The existing free `GET
  /api/audit-trail` view remains unaffected. **Update:** a subsequent phase added the
  `ee/rbac-custom-roles` library and gated new org-scoped custom-role CRUD routes
  (`/api/auth/admin/custom-roles`) behind `@RequiresEntitlement('rbac-custom-roles')` — the
  third prediction fulfilled; see
  `docs/2026-08-13-custom-rbac-entitlement-gating-decision.md`. The existing free
  `UserRole`-enum role assignment remains unaffected. Only `pr-decoration` of the four features in
  the `EnterpriseFeature` union remains ungated as of this update.
- **Contributors:** A new `EnterpriseFeature` union (`'sso' | 'rbac-custom-roles' |
  'audit-export' | 'pr-decoration'`) is now the single source of truth for what counts as an
  Enterprise feature; any future Enterprise-gated capability should extend this union rather
  than inventing a parallel feature-flag mechanism.
- **Docs updated alongside this decision:** `docs/ARCHITECTURE.md` (new `libs/licensing`
  Shared Libraries entry), `README.md` (new Shared Libraries table row).
- **Ops/release:** Issuing a real production license requires the (not-yet-built, out of scope
  for this phase) private-key-holding signing process; `scripts/licensing/sign-license.ts` is
  dev/test tooling only and must never be pointed at the real production private key.
