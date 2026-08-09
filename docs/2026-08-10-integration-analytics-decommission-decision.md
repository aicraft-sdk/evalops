# Integration/Analytics Service Decommission (Phase 5 — Final)

## What Changed

`apps/integration-service` and `apps/analytics-service` have been permanently deleted from
the repo, along with every reference to them: `Tiltfile` entries, Helm chart resources
(`helm/evalops/templates/services.yaml`, `values.yaml`, `values.production.yaml`),
`package.json` npm scripts, `apps/cli/src/commands/doctor.ts` health checks, and the
`.github/workflows/ci.yml` build/test matrix (commits `467ceaa`, `4d3f36e`, `85ac2b2`,
`fb5ccd0`, `e23df63`, `3858d84`, parent `fc52d9f`). `apps/` now contains exactly six
directories: `api-gateway`, `auth-service`, `cli`, `core-service`, `evaluation-service`,
`frontend`. Both services' real functionality — Azure Blob artifacts, webhooks, alerts,
sandbox execution (`libs/core-integration`), dashboard metrics, cost analytics, and audit
trail (`libs/core-analytics`) — already lived permanently inside `core-service` from an
earlier migration phase; this phase only removed the now-dead standalone app shells and
every build/deploy/doc reference that still pointed at them. The API Gateway continues to
route both `/api/integration/*` and `/api/analytics/*` to `core-service :3002`
(`apps/api-gateway/src/app/gateway/gateway.service.ts`), unchanged from a consumer's
perspective.

## Why

`integration-service` and `analytics-service` had been reduced to empty scaffold shells
(no real logic, just boilerplate `AppModule`/`main.ts`/health controller) for several
phases while their functionality lived in `core-service`. Keeping them around cost real
maintenance: duplicate `Dockerfile`s and CI build/test steps for apps that did nothing,
duplicate Helm `Deployment`/`Service` resources consuming cluster resources for no
functional benefit, and — most importantly — an active source of confusion for anyone
reading the codebase, since the presence of the directories implied the services still
did something. The migration's correctness had already been independently verified and
doubt-verified (live-booted post-deletion, routes/auth/proxy confirmed intact, real
webhook delivery and real sandbox execution proven working end-to-end through
`api-gateway`), so there was no remaining technical reason to keep the shells as a
rollback seam.

## Alternatives Considered

- **Keep the empty shells indefinitely as a safety net:** Rejected. They were pure dead
  weight — no code path in the running system ever depended on them once `core-service`
  took over — and their continued presence in CI/Helm/Tiltfile actively misled
  contributors into thinking two more live services existed.
- **Exclude the apps from CI/build without deleting the directories:** Rejected. This
  would have removed the maintenance burden but not the confusion; a contributor
  browsing `apps/` would still see `integration-service`/`analytics-service` and
  reasonably assume they were live.
- **Land the full cleanup as one large commit:** Rejected in favor of splitting it into
  focused commits (app deletion, then `Tiltfile`, then Helm, then npm scripts, then CLI
  doctor, then CI) so each concern is independently reviewable and revertible if a
  problem surfaces in exactly one of them.

## Impact

- **Contributors:** Any local workflow, muscle memory, or stale branch that runs
  `nx serve integration-service`, `nx test analytics-service`, or similar will now fail
  with "Cannot find project" — the equivalent functionality is exercised via
  `core-service` (`nx serve core-service`, `nx test core-service`).
- **API consumers:** No change. `/api/integration/*` and `/api/analytics/*` continue to
  resolve through the gateway to `core-service :3002`, exactly as they did once the
  earlier migration phase relocated the logic into `libs/core-integration` /
  `libs/core-analytics`.
- **Rollback:** The rollback seam is now removed — reverting this decommission would
  require reverting the full commit range (`467ceaa`..`3858d84`) rather than toggling a
  still-present shell service back on.
- **Docs updated alongside this decision:** `README.md` (architecture diagram, services
  table, project structure tree, API overview table/note), `docs/ARCHITECTURE.md`
  (service map diagram, gateway routing table, Integration/Analytics sections merged
  into Core Service, trace-ingestion data-flow diagram, Swagger URL table, deployment
  diagram), `docs/CLI_GUIDE.md`, `docs/DEPLOYMENT.md`, `docs/LOCAL_DEV.md`,
  `docs/TESTING.md`, `docs/TILT_SETUP.md`, `docs/SETUP.md`, `docs/QUICK_START.md`,
  `docs/SANDBOX_INTEGRATION.md`, `docs/SANDBOX_TESTING.md`.
- **Known out-of-scope item:** `apps/evaluation-service/src/app/ingestion/ingestion.service.ts`
  still has a method/log string named `notifyIntegrationService`, which is now a
  misleading name (source code, not documentation — intentionally left for a future,
  separately-scoped cleanup pass).
