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
