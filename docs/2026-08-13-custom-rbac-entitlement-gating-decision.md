# Custom RBAC Roles: New `ee/rbac-custom-roles` Library, Entitlement-Gated (Phase 5)

## What Changed

A new `ee/rbac-custom-roles` Nx library (`@evalops/ee-rbac-custom-roles`) adds
`CustomRolesController`/`CustomRolesService`, mounted at `admin/custom-roles` inside
`auth-service`'s existing `PermissionsModule` (`GET|POST /api/admin/custom-roles`,
`PATCH|DELETE /api/admin/custom-roles/:id` — `/api/auth/admin/custom-roles` through the API
Gateway), behind `@UseGuards(JwtAuthGuard, RbacGuard, EntitlementGuard)` +
`@Roles(UserRole.ADMIN)` + `@RequiresEntitlement('rbac-custom-roles')`. With no valid Enterprise
license configured, all four routes return `403` with an upsell body instead of reaching
`CustomRolesService`. `organizationId` is read only from `@CurrentUser()` — the verified JWT
claim, never a client-suppliable param — mirroring the org-scoping convention from `ee/sso` and
`ee/audit-export`. `CreateCustomRoleDto`/`UpdateCustomRoleDto` validate role name, description,
and a `permissions[]` array of `{resourceType, action}` pairs against fixed enum lists via
`class-validator`; `priority` is capped at `@Max(99)`, reserving `100` for the built-in
Administrator role. `CustomRolesService.assertMutableCustomRole()` enforces, unconditionally and
independent of license state, that a custom role can never mutate or delete a role with
`isSystemRole: true` — a security invariant, not a commercial gate. `PermissionsRepository`
(`libs/shared-db`) gained `listCustomRolesByOrg`, `createRole`, `updateRole`, `deleteRole`,
`findRoleById`, `replaceRolePermissions`, and a promoted `getOrCreatePermission` (moved from
`PermissionsService` as a pure delegation, no behavior change). `apps/auth-service/src/app/
permissions/permissions.module.ts` now imports `CustomRolesModule`.

During this phase, review and a follow-up hunt found and fixed three real bugs, two of them
pre-existing and security-critical:

1. **CRITICAL — `PermissionsService.isSystemAdmin()` substring-match bypass (pre-existing).**
   The original check granted unconditional admin access to any role whose `name` contained
   `"admin"` or `"superuser"` (case-insensitive), regardless of `isSystemRole` or actual
   `role_permissions` grants. `CreateCustomRoleDto` has no reserved-word check on `name`, so
   Phase 5's own custom-role creation made this directly reachable: an org admin could name a
   narrowly-scoped custom role "Data Admin" and, once assigned to a user, silently grant
   unrestricted access via the already-live `POST /permissions/check` path. Round 1 fix (commit
   `3376133`) changed the check to `role.isSystemRole === true` only, dropping the
   name-substring branch entirely.
2. **Round-1 fix over-granted (found immediately after).** `isSystemRole === true` alone means
   "built-in, not org-created" (a mutation-protection flag), not "has admin access" —
   `initializeDefaultRoles()` seeds 4 roles as `isSystemRole: true` (Administrator `priority:
   100`, Data Scientist `priority: 50`, ML Engineer `priority: 40`, Analyst `priority: 20`), so
   the round-1 condition granted the admin bypass to all four instead of only the real
   Administrator. Round 3 fix (commit `b3ef020`) adds the existing `priority >= 100`
   convention (already reserved for Administrator by `CreateCustomRoleDto`'s `@Max(99)`) as a
   required second condition: `isSystemAdmin()` now returns true only when
   `role.isSystemRole === true && role.priority >= 100`. A regression test proves a
   Data-Scientist-shaped role no longer bypasses `hasPermission()` for an admin action while the
   real Administrator role still does.
3. **HIGH — `CustomRolesService.remove()` DELETE-FK violation.** `role_permissions.role_id` has
   `ON DELETE no action`; `remove()` called `deleteRole()` without first clearing attached
   `role_permissions` rows, so deleting any role with ≥1 permission threw an unhandled FK
   violation (`500`) against real Postgres — invisible to the phase's original mocked-repository
   tests. Fixed by calling `replaceRolePermissions(roleId, [])` before `deleteRole()`.

A new integration test (`apps/auth-service/src/__tests__/custom-roles-entitlement.integration.
test.ts`) boots the real `AuthModule`/`PermissionsModule`/`AdminModule` graph via `supertest` to
prove: the route 403s with the upsell body with no license; it 200/201s and creates an
`isSystemRole: false` role with a valid, `rbac-custom-roles`-entitled license; a non-ADMIN
(viewer-role) user gets 403 (`RbacGuard`); the pre-existing, separate `UserRole`-enum admin
role-assignment system (`POST /admin/users/:id/role`) is unaffected; PATCH/DELETE against an
`isSystemRole: true` role 403s even with a valid, entitled license; and org A can never
list/PATCH/DELETE a role belonging to org B.

## Why

`ee/rbac-custom-roles` is the plan's designated third Enterprise-gated feature (per
`docs/2026-08-12-enterprise-tier-phase1-plan.md` and the `EnterpriseFeature` union already
defined in `docs/2026-08-13-enterprise-licensing-entitlement-engine-decision.md`), following SSO
(Phase 3) and audit export (Phase 4). It follows the same established pattern: a new `ee/*`
library, gated with `EntitlementGuard`/`@RequiresEntitlement(feature)`, built on top of the
*existing* free RBAC primitives (`roles`/`role_permissions`/`permissions` tables,
`PermissionsRepository`, the 3 built-in system roles) rather than replacing them — free-tier
users keep basic role assignment via the pre-existing `UserRole` enum and
`POST /admin/users/:id/role`; only the ability to define new, org-scoped custom roles with
fine-grained resource/action permission sets requires a license. The `isSystemAdmin()` bug chain
was fixed within this same phase because Phase 5's own feature — user-namable custom roles — is
what made the pre-existing substring-match bypass concretely reachable for the first time; fixing
it was treated as a blocking part of shipping the feature safely, not a follow-up. The DELETE-FK
fix was likewise required for the feature's own DELETE endpoint to function against real Postgres
at all, not an optional hardening pass.

## Alternatives Considered

- **Ship custom-role CRUD without touching `isSystemAdmin()`, since the substring bug predates
  this phase:** Rejected. The bug was pre-existing but dormant — no route previously let a
  regular user pick an arbitrary role `name`. Custom-role creation makes `name` fully
  user-supplied for the first time, so shipping the feature without fixing the check would ship
  a concretely exploitable privilege-escalation path (name a role "Data Admin", get it assigned,
  gain unconditional admin) as a direct, foreseeable consequence of this phase's own work.
- **Stop at the round-1 `isSystemRole === true` fix:** Rejected once found insufficient.
  `initializeDefaultRoles()` seeds 4 different `isSystemRole: true` roles at 4 different
  priorities; treating "built-in" as synonymous with "admin" would have over-granted admin
  access to Data Scientist/ML Engineer/Analyst — a smaller-blast-radius bug than the original
  substring match, but still a real over-grant, so it was closed in the same phase rather than
  deferred.
- **Add a reserved-word check on `CreateCustomRoleDto.name` instead of fixing
  `isSystemAdmin()`:** Rejected as insufficient on its own. Blocking specific substrings
  ("admin", "superuser") in role names is a weaker, evadable control (e.g. "Root", "Owner",
  homoglyphs) compared to fixing the check to key off `isSystemRole && priority >= 100`, which
  is the actual, structural signal for "is the real built-in Administrator role" and cannot be
  spoofed by a client-supplied `name` string at all — `CreateCustomRoleDto.priority` is
  independently capped at `@Max(99)`, so a custom role can never reach `priority >= 100` either.
- **Have `CustomRolesService.remove()` reject deletion of any role with attached permissions
  (require the caller to detach them first) instead of clearing them automatically:** Rejected.
  That would just move the FK-violation-shaped foot-gun to callers of the DELETE endpoint instead
  of removing it; automatically clearing `role_permissions` via `replaceRolePermissions(roleId,
  [])` before `deleteRole()` is the same cascade-cleanup semantics a client of a "delete this
  role" endpoint reasonably expects.

## Impact

- **End users / Enterprise customers:** Anyone with a configured, valid Enterprise license
  entitled to `rbac-custom-roles` can now define, list, update, and delete org-scoped custom
  roles with fine-grained resource/action permission sets via `/api/auth/admin/custom-roles`.
  Free-tier customers continue to see `403` with an upsell body on those routes; the pre-existing
  free `UserRole`-enum role-assignment system (`POST /admin/users/:id/role`, the 3 built-in
  system roles) is completely unaffected.
- **All existing deployments (free and Enterprise), regardless of this feature's entitlement
  state:** The `isSystemAdmin()` fix closes a real privilege-escalation path that was reachable
  the moment any route allowed a user-supplied role `name` — this phase's own custom-role
  creation was that route. Any deployment that had already assigned a custom or renamed role
  containing "admin"/"superuser" in its name (not possible before this phase shipped, since no
  prior route allowed arbitrary role creation) would have been affected; no such deployments are
  known to exist since custom-role creation and the fix landed in the same phase.
- **Contributors:** `ee/rbac-custom-roles` is the third `ee/*` library actually imported by a
  composition-root app (after `ee/sso`, `ee/audit-export`), reinforcing the established pattern:
  Enterprise code lives in `ee/*`, is wired into a composition-root module behind
  `EntitlementGuard`/`@RequiresEntitlement(feature)`, builds on top of (never modifies in place)
  the free code path it extends, and security invariants (system-role protection, org-scoping)
  are enforced unconditionally in the service layer, independent of license state. The
  `priority >= 100`-reserved-for-Administrator convention, previously implicit only in
  `CreateCustomRoleDto`'s `@Max(99)` comment, is now also the load-bearing condition inside
  `isSystemAdmin()` itself — any future change to either must keep both in sync.
- **Docs updated alongside this decision:** `docs/ARCHITECTURE.md` ("Auth Service" route list,
  `libs/licensing` section, "Enterprise Directory" section), `README.md` (`libs/licensing`
  Shared Libraries row, API Overview table),
  `docs/2026-08-13-enterprise-licensing-entitlement-engine-decision.md` (Impact section).
