# Golden-Set Calibration REST API

## What Changed

`apps/evaluation-service/src/app/golden-sets/` gained a new `GoldenSetsController`
mounted at `/golden-sets` (i.e. `/api/evaluation/golden-sets` through the gateway) with
five routes: `POST/GET /golden-sets`, `POST/GET /golden-sets/:id/examples`, and
`POST/GET /golden-sets/:id/calibration-runs`. This is a single-controller design — there
is no separate `CalibrationController`; the `calibration-runs` routes are nested on
`GoldenSetsController` and delegate to the pre-existing `CalibrationService`. All five
routes are gated by `JwtAuthGuard` only (no `RbacGuard`/`@Roles`), with request bodies
validated by three new DTOs (`CreateGoldenSetDto`, `AddGoldenSetExampleDto`,
`RunCalibrationDto`, `class-validator` with `whitelist: true, forbidNonWhitelisted: true`).
Org-scoping is enforced explicitly: `GoldenSetsService.getOwnedGoldenSet()` fetches the
parent golden set and throws `NotFoundException` (not a 403, to avoid leaking existence)
on any organization mismatch or missing row, and every read/write on a `:id` calls it
first — including the calibration-runs POST route, which calls
`GoldenSetsService.verifyGoldenSetOwnership()` before delegating to
`CalibrationService.runCalibration()`, since `CalibrationService` itself performs no
org-scoping on its `goldenSetId` lookup. A follow-up fix in the same phase (`87be1bc`)
also stopped `CalibrationService` from persisting raw judge error messages into
`excludedExamples.reason` (which is returned verbatim by the calibration-runs GET route)
— the real error is now logged server-side only, and a generic reason string is stored
instead. This is the first externally-reachable API surface for the whole
judge-caching-and-calibration feature; Phases 1-5 (judge-result caching, golden-set
schema, Cohen's-kappa computation) were all internal infrastructure with no route.

## Why

Phases 1-5 built the judge caching and calibration machinery, but none of it was
reachable without a REST surface — a golden set could only be created and calibrated by
calling `CalibrationService` directly from a test or a future caller. A single controller
(rather than a separate `GoldenSetsController` + `CalibrationController`) keeps golden
sets and the calibration runs performed against them under one resource path, matching
how the data is actually used (you always calibrate a specific golden set, never a
calibration run in isolation). `JwtAuthGuard`-only access (no RBAC role check) was chosen
because labeling examples and running a calibration is an eval-authoring activity closer
to creating datasets or eval specs (no RBAC restriction beyond authentication) than to a
governance/compliance action like policy creation (which requires `org_admin`/`admin`).
Explicit ownership verification in the controller — rather than trusting
`CalibrationService` to org-scope itself — was a deliberate choice to avoid repeating this
repo's own documented cross-tenant IDOR precedent on `POST /policies/evaluate/:runId`
(see project memory) on a brand-new, externally-reachable endpoint.

## Alternatives Considered

- **RBAC-gate golden-sets/calibration like policy creation (`RbacGuard` +
  `@Roles(ORG_ADMIN, ADMIN)`):** Rejected for this phase. Golden-set labeling and
  calibration don't gate deployments or change enforcement behavior the way a policy
  does — restricting them to admins would block the exact eval-authoring workflow (an
  engineer labeling examples to sanity-check a judge) this feature exists to serve. The
  plan explicitly leaves this as a one-line follow-up if product direction changes.
- **Add org-scoping inside `CalibrationService.runCalibration()` itself, instead of a
  controller-level ownership check:** Rejected for this phase, to avoid touching
  `CalibrationService`'s already-tested Phase 5 logic. The controller-level check fully
  closes the externally-reachable gap (nothing calls `runCalibration()` except this
  controller today), but it does mean any future non-HTTP caller of
  `CalibrationService` must remember to org-scope independently — tracked in Impact below.
- **Separate `CalibrationController` class:** Rejected in favor of nesting
  `calibration-runs` routes on `GoldenSetsController`, since every calibration run is
  scoped to exactly one golden set and the two resources share the same ownership check.
- **Return the raw judge-call error message in `excludedExamples.reason`:** This was the
  original Phase 5 behavior; closed in the same phase (`87be1bc`) once it was recognized
  that the calibration-runs GET route serves that field verbatim to clients, and a judge
  provider error can contain internal endpoint/key detail.

## Impact

- **API consumers:** Any authenticated org member can now create golden sets, add
  labeled examples, and trigger/list calibration runs via
  `POST`/`GET /api/evaluation/golden-sets(/:id/examples|/:id/calibration-runs)` —
  previously only reachable by calling `CalibrationService` directly (e.g. from a test).
  No frontend exists yet for this surface (Phase 7 of the plan); it is API-only for now.
- **Docs updated alongside this decision:** `README.md` (API Overview table + a new Key
  Features bullet), `docs/ARCHITECTURE.md` (Evaluation Service section).
- **Migration steps:** None. No schema change in this phase — `golden_sets`,
  `golden_set_examples`, and `calibration_runs` were already added in Phase 4.
- **Ongoing maintenance:** `CalibrationService.runCalibration()` still performs no
  org-scoping of its own — any new caller added in the future (a cron job, an internal
  service call, a second controller) must independently verify golden-set ownership
  first, the same way `GoldenSetsController` does, or it will reopen the cross-tenant
  IDOR this phase closed for the HTTP path.
