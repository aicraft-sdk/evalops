# Self-Service Organization Creation

## What Changed

`POST /api/auth/organizations` no longer requires an existing `ORG_ADMIN`/`ADMIN` role —
any authenticated user can now create a brand new organization. The creating user becomes
that new org's `ORG_ADMIN` via a row in a new `organization_members` table (migration
`0005_add_organization_members.sql`), scoped to the new org only; their `users.organizationId`
"home" org and role are left untouched. The request body is validated by a new
`CreateOrganizationDto` (class-validator, `name` required), and the route is rate-limited
to 5 creations per user per 60s via `RateLimitGuard`/`@RateLimit`, mirroring the convention
already used by evaluation-service's ingestion route. The admin-only `POST
/api/auth/admin/organizations/:id` route (updating an *existing* org) was hardened
alongside this change with an equivalent `UpdateOrganizationDto`, closing the same
whitelist-validation gap (see "Why").

Three fixes landed as part of doubt-verify cycles on the same flow:
- `OrgContextInterceptor` was reading `request.user.sub`/`.userId`, which no
  `JwtStrategy.validate()` implementation actually returns (all return `{ id: ... }`) — this
  made `app.user_id` resolve to `''` in production, which the new `organization_members`
  INSERT RLS policy (the first policy in the schema to check `user_id`) then rejected,
  500-ing every real self-service create-organization request. Fixed to read `.id`.
- `organizations.repository.ts`'s dev-mode `createWithAdminMember` could leave an orphaned
  org row if the membership insert failed (no cross-driver transaction support between the
  async/sync SQLite vs. Postgres code paths); it now explicitly deletes the just-created org
  on membership-insert failure before rethrowing.
- The admin org-update route had the same DTO-injection gap as the original create route
  (see "Why") and was closed as a sibling fix.

## Why

Before this change, creating an organization required an existing `ORG_ADMIN`/`ADMIN` role
— but a brand-new user has no organization and therefore no role to check against, so there
was no legitimate way for a new user to ever get their first organization without an
operator manually inserting one. This was a catch-22 blocking self-service onboarding.

Separately, both the create and update organization routes previously accepted
`InsertOrganization` (a Zod-inferred plain TypeScript type) as the `@Body()` param type.
NestJS's global `ValidationPipe` (`whitelist: true, transform: true`) only validates and
strips unknown properties when the body param's *runtime* metatype is an actual class — a
plain type/interface resolves to `Object` at runtime and the pipe silently no-ops. This
meant a client could supply `id`, `createdAt`, or `updatedAt` in the request body and have
them flow straight through to the repository layer. Replacing both DTOs with
class-validator-decorated classes (`CreateOrganizationDto`, `UpdateOrganizationDto`) closes
that gap for both routes.

## Alternatives Considered

- **Require an invite/approval step before org creation:** Rejected for this phase — adds
  onboarding friction and a moderation queue that the platform doesn't have infrastructure
  for yet. Rate limiting (5/60s) plus RLS-scoped membership rows was judged sufficient
  protection against abuse for now.
- **Grant the creator `ADMIN` (platform-wide) instead of `ORG_ADMIN` (org-scoped):**
  Rejected — would give every self-service org creator platform-wide admin rights, a much
  larger blast radius than the org they just created.
- **Reuse the blanket `tenant_isolation` RLS policy pattern for `organization_members`:**
  Rejected. Every other tenant-scoped table's RLS policy checks
  `organization_id = current_setting('app.org_id')`, but a self-service create-org request's
  session is still pinned to the user's *existing* `app.org_id` (or none) at the moment the
  membership row for the *new* org is written — a blanket policy would reject the INSERT in
  production. Instead, `organization_members`'s INSERT policy checks
  `user_id = current_setting('app.user_id')`, i.e. "you may only grant membership to
  yourself," which is exactly what the self-service flow needs while still being safe (a
  user can never insert a membership row for a different user).
- **Mutate `users.organizationId`/`users.role` directly on org creation:** Rejected — would
  silently move the user out of any org they already belonged to. The separate
  `organization_members` table lets a user belong to (and be `ORG_ADMIN` of) multiple orgs
  without disturbing their existing "home" org.

## Impact

- **End users:** Any authenticated user can now create an organization via
  `POST /api/auth/organizations` without operator intervention, becoming its `ORG_ADMIN`.
  Their existing org membership and role elsewhere are unaffected.
- **Operators/admins:** No workflow change for existing orgs; `POST
  /admin/organizations/:id` (rename) still requires platform `ADMIN` and now validates
  input more strictly (unknown fields silently stripped instead of passed through).
- **Database:** New `organization_members` table and RLS policies (migration `0005`);
  requires running migrations before deploying this change to any environment enforcing RLS.
  SQLite dev-mode (`EVALOPS_DEV_MODE=1`) does not enforce RLS, so this table's INSERT policy
  gap only surfaces against real Postgres — a real-Postgres e2e test
  (`create-organization.real-postgres.e2e.spec.ts`, self-skips without `REAL_PG_URL`) now
  exercises the full JWT → `OrgContextInterceptor` → RLS-checked-INSERT pipeline to catch
  regressions of this class going forward.
- **Docs updated alongside this decision:** `docs/ARCHITECTURE.md` (Auth Service route
  list, Rate Limiting section, Multi-Tenant Isolation section, `shared-db` schema file
  list).
