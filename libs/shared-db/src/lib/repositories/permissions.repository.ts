import { Injectable } from '@nestjs/common';
import { db } from '../db';
import {
  roles,
  userRoles,
  permissions,
  rolePermissions,
  resourcePermissions,
  permissionAuditLog,
} from '../schema';
import { eq, and, or } from 'drizzle-orm';

// EVALOPS_DEV_MODE must be set before any shared-db import (see db.ts) — safe
// to read here since it is already frozen by the time this module loads.
const isDevMode = process.env['EVALOPS_DEV_MODE'] === '1';

@Injectable()
export class PermissionsRepository {
  async getUserRoles(userId: string): Promise<(typeof roles.$inferSelect)[]> {
    return db
      .select({
        id: roles.id,
        name: roles.name,
        description: roles.description,
        organizationId: roles.organizationId,
        isSystemRole: roles.isSystemRole,
        priority: roles.priority,
        createdAt: roles.createdAt,
        updatedAt: roles.updatedAt,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId));
  }

  async getUserPermissions(
    userId: string,
  ): Promise<(typeof permissions.$inferSelect)[]> {
    const userRolesList = await this.getUserRoles(userId);
    const roleIds = userRolesList.map((r) => r.id);

    if (roleIds.length === 0) {
      return [];
    }

    return db
      .select({
        id: permissions.id,
        name: permissions.name,
        resourceType: permissions.resourceType,
        action: permissions.action,
        description: permissions.description,
        isSystemPermission: permissions.isSystemPermission,
        createdAt: permissions.createdAt,
      })
      .from(rolePermissions)
      .innerJoin(
        permissions,
        eq(rolePermissions.permissionId, permissions.id),
      )
      .where(
        or(...roleIds.map((roleId) => eq(rolePermissions.roleId, roleId))),
      );
  }

  async getUserResourcePermissions(
    userId: string,
  ): Promise<(typeof resourcePermissions.$inferSelect)[]> {
    const userRolesList = await this.getUserRoles(userId);
    const roleIds = userRolesList.map((r) => r.id);

    return db
      .select()
      .from(resourcePermissions)
      .where(
        or(
          eq(resourcePermissions.userId, userId),
          ...(roleIds.length > 0
            ? roleIds.map((roleId) =>
                eq(resourcePermissions.roleId, roleId),
              )
            : []),
        ),
      );
  }

  async getResourcePermissions(
    resourceType: string,
    resourceId: string,
  ): Promise<(typeof resourcePermissions.$inferSelect)[]> {
    return db
      .select()
      .from(resourcePermissions)
      .where(
        and(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          eq(resourcePermissions.resourceType, resourceType as any),
          eq(resourcePermissions.resourceId, resourceId),
        ),
      );
  }

  async getRolePermissions(
    roleId: string,
  ): Promise<(typeof permissions.$inferSelect)[]> {
    return db
      .select({
        id: permissions.id,
        name: permissions.name,
        resourceType: permissions.resourceType,
        action: permissions.action,
        description: permissions.description,
        isSystemPermission: permissions.isSystemPermission,
        createdAt: permissions.createdAt,
      })
      .from(rolePermissions)
      .innerJoin(
        permissions,
        eq(rolePermissions.permissionId, permissions.id),
      )
      .where(eq(rolePermissions.roleId, roleId));
  }

  async createResourcePermission(
    data: typeof resourcePermissions.$inferInsert,
  ): Promise<typeof resourcePermissions.$inferSelect> {
    const [perm] = await db
      .insert(resourcePermissions)
      .values(data)
      .returning();
    return perm;
  }

  async createUserRole(
    data: typeof userRoles.$inferInsert,
  ): Promise<typeof userRoles.$inferSelect> {
    const [newUserRole] = await db
      .insert(userRoles)
      .values(data)
      .returning();
    return newUserRole;
  }

  async removeUserRole(userId: string, roleId: string): Promise<void> {
    await db
      .delete(userRoles)
      .where(
        and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)),
      );
  }

  /**
   * `roles.isSystemRole` / `permissions.isSystemPermission` are declared as Postgres
   * `boolean()` columns (see `schema/permissions.ts`), whose `mapToDriverValue` is an identity
   * passthrough — correct for `node-postgres` (production), which binds JS booleans natively.
   * In dev mode these same table objects run against a real `better-sqlite3` connection (see
   * `db.ts`), which refuses to bind a raw JS `boolean`
   * (`TypeError: SQLite3 can only bind numbers, strings, bigints, buffers, and null`) — this
   * crashes on ANY write to either column, including the column's own client-side default value
   * when the field is omitted entirely from `.values()` (Drizzle still injects `col.default` as
   * a bound param in that case). Coerces to SQLite-native `0`/`1` ONLY in dev mode; on the
   * production Postgres path this is a no-op identity passthrough, so `db.insert(...)` behavior
   * there is unchanged. Always resolves a concrete value (never leaves the field `undefined`) so
   * Drizzle never falls back to its own client-side boolean default injection.
   */
  private devModeBoolean(value: boolean | null | undefined, defaultValue: boolean): boolean {
    const resolved = value ?? defaultValue;
    if (!isDevMode) return resolved;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime value is SQLite-native 0/1, typed as `boolean` because callers assign this straight into a boolean-typed insert field
    return (resolved ? 1 : 0) as any;
  }

  /**
   * `@evalops/shared-db` is path-mapped straight to `.ts` source, so every consuming app
   * recompiles `typeof roles.$inferInsert` / `typeof permissions.$inferInsert` under ITS OWN
   * tsconfig — none of the 5 backend apps (including `auth-service`, which loads this file
   * transitively through `ee/rbac-custom-roles`) enable `strictNullChecks`, and Drizzle's
   * `$inferInsert` conditional types silently collapse to only the NOT-NULL/no-default columns
   * in that mode (confirmed project pattern), dropping `isSystemRole`/`isSystemPermission`
   * (both nullable, both have a column default) from the inferred type entirely in those apps
   * even though a real caller's object may carry them. Reads via an index cast so this compiles
   * identically everywhere, without changing any of this file's public method signatures.
   */
  private readOptionalBoolean(
    source: typeof roles.$inferInsert | typeof permissions.$inferInsert,
    key: 'isSystemRole' | 'isSystemPermission',
  ): boolean | null | undefined {
    return (source as unknown as Record<string, unknown>)[key] as boolean | null | undefined;
  }

  async createRole(
    data: typeof roles.$inferInsert,
  ): Promise<typeof roles.$inferSelect> {
    const insertData = {
      ...data,
      isSystemRole: this.devModeBoolean(this.readOptionalBoolean(data, 'isSystemRole'), false),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see readOptionalBoolean: $inferInsert collapses under non-strict consuming-app tsconfigs
    } as any;
    const [role] = await db.insert(roles).values(insertData).returning();
    return role;
  }

  async createPermission(
    data: typeof permissions.$inferInsert,
  ): Promise<typeof permissions.$inferSelect> {
    const insertData = {
      ...data,
      isSystemPermission: this.devModeBoolean(this.readOptionalBoolean(data, 'isSystemPermission'), true),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see readOptionalBoolean: $inferInsert collapses under non-strict consuming-app tsconfigs
    } as any;
    const [perm] = await db.insert(permissions).values(insertData).returning();
    return perm;
  }

  async findPermissionByTypeAndAction(
    resourceType: string,
    action: string,
  ): Promise<typeof permissions.$inferSelect | undefined> {
    const [perm] = await db
      .select()
      .from(permissions)
      .where(
        and(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          eq(permissions.resourceType, resourceType as any),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          eq(permissions.action, action as any),
        ),
      )
      .limit(1);
    return perm;
  }

  async createRolePermission(
    data: typeof rolePermissions.$inferInsert,
  ): Promise<typeof rolePermissions.$inferSelect> {
    const [rolePerm] = await db
      .insert(rolePermissions)
      .values(data)
      .returning();
    return rolePerm;
  }

  async createPermissionAuditLog(
    data: typeof permissionAuditLog.$inferInsert,
  ): Promise<typeof permissionAuditLog.$inferSelect> {
    const [log] = await db
      .insert(permissionAuditLog)
      .values(data)
      .returning();
    return log;
  }

  /**
   * Promoted from `PermissionsService.getOrCreatePermission` (Phase 5, Task 5.1 — pure
   * delegation, no behavior change). Also the shared lookup used by the new
   * `ee/rbac-custom-roles` custom-role CRUD feature.
   */
  async getOrCreatePermission(
    resourceType: string,
    action: string,
  ): Promise<typeof permissions.$inferSelect> {
    const existing = await this.findPermissionByTypeAndAction(resourceType, action);
    if (existing) return existing;
    return this.createPermission({
      name: `${resourceType}.${action}`,
      resourceType,
      action,
      description: `${action} access to ${resourceType} resources`,
      isSystemPermission: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as typeof permissions.$inferInsert);
  }

  async updateRole(
    id: string,
    updates: Partial<Pick<typeof roles.$inferSelect, 'name' | 'description' | 'priority'>>,
  ): Promise<typeof roles.$inferSelect | undefined> {
    const [updated] = await db
      .update(roles)
      .set({ ...updates, updatedAt: new Date() } as Partial<typeof roles.$inferInsert>)
      .where(eq(roles.id, id))
      .returning();
    return updated;
  }

  async deleteRole(id: string): Promise<boolean> {
    const deleted = await db.delete(roles).where(eq(roles.id, id)).returning();
    return deleted.length > 0;
  }

  async findRoleById(id: string): Promise<typeof roles.$inferSelect | undefined> {
    const [role] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
    return role;
  }

  async listCustomRolesByOrg(organizationId: string): Promise<(typeof roles.$inferSelect)[]> {
    return db
      .select()
      .from(roles)
      .where(and(eq(roles.organizationId, organizationId), eq(roles.isSystemRole, false)));
  }

  async replaceRolePermissions(roleId: string, permissionIds: string[]): Promise<void> {
    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    if (permissionIds.length === 0) return;
    await db
      .insert(rolePermissions)
      .values(permissionIds.map((permissionId) => ({ roleId, permissionId })));
  }

  /**
   * `user_roles.role_id` has `ON DELETE no action` (`user_roles_role_id_roles_id_fk`) and
   * `user_id`/`role_id` are both NOT NULL, so an assignment row cannot be usefully kept once
   * its role is gone - deletes every user_roles row referencing this role.
   */
  async clearUserRolesForRole(roleId: string): Promise<void> {
    await db.delete(userRoles).where(eq(userRoles.roleId, roleId));
  }

  /**
   * `resource_permissions.role_id` has `ON DELETE no action`
   * (`resource_permissions_role_id_roles_id_fk`) and, like `permission_audit_log.role_id`, IS
   * nullable - so these rows could theoretically be detached (nulled) instead of deleted.
   * They are deleted instead because a `resource_permissions` row with BOTH `user_id` and
   * `role_id` null would become permanently unreachable via
   * `getUserResourcePermissions`'s query shape (an `OR` over `eq(userId, ...)` and
   * `eq(roleId, ...)` clauses - neither ever matches a doubly-null row): a role-scoped grant
   * with its role gone is meaningless, so it is deleted outright rather than left as
   * unreachable orphaned data.
   */
  async clearResourcePermissionsForRole(roleId: string): Promise<void> {
    await db.delete(resourcePermissions).where(eq(resourcePermissions.roleId, roleId));
  }

  /**
   * `permission_audit_log.role_id` has `ON DELETE no action`
   * (`permission_audit_log_role_id_roles_id_fk`) and is nullable, like
   * `resource_permissions.role_id` but unlike `user_roles.role_id` (NOT NULL). Detaches (nulls
   * out) role_id instead of deleting rows, to preserve audit history for a role that has since
   * been deleted - unlike `resource_permissions`, an audit-log row stays meaningfully
   * queryable after `role_id` is nulled (it remains reachable by its own id/userId/
   * performedBy), so nulling here does not create the same unreachable-orphan problem
   * `resource_permissions` would have.
   */
  async detachPermissionAuditLogForRole(roleId: string): Promise<void> {
    await db
      .update(permissionAuditLog)
      .set({ roleId: null } as Partial<typeof permissionAuditLog.$inferInsert>)
      .where(eq(permissionAuditLog.roleId, roleId));
  }

  /**
   * Atomically updates a role's `name`/`description`/`priority` and, when `permissionIds` is
   * given, replaces its full permission set (`DELETE FROM role_permissions` immediately followed
   * by an `INSERT`) — both writes run inside a single Drizzle transaction on the production
   * Postgres path (same `isDevMode`-branch structure as `deleteRoleWithDependents` above), so a
   * mid-sequence failure (a DB error on the INSERT, or a concurrent `remove()` on the same role
   * committing in the gap between the DELETE and INSERT) rolls back the whole write instead of
   * leaving an EXISTING role's permissions silently wiped to zero. `permissionIds` is omitted
   * entirely (not `[]`) when the caller did not ask to change permissions — matches
   * `CustomRolesService.update()`'s existing "only touch permissions if `dto.permissions` was
   * provided" contract; passing `[]` explicitly still clears all permissions (the pre-existing
   * `replaceRolePermissions` no-permissions-left behavior).
   *
   * In dev mode (SQLite): drizzle's better-sqlite3 driver only supports synchronous transaction
   * callbacks, while the node-postgres driver used in production requires an async one — see
   * `OrganizationsRepository.createWithAdminMember` / `deleteRoleWithDependents` above for the
   * established precedent. The two writes still run sequentially in this same order and a throw
   * from the first (updateRole) still prevents the second (replaceRolePermissions) from ever
   * running; real atomicity across BOTH writes together is only guaranteed on the production
   * Postgres path.
   */
  async updateRoleWithPermissions(
    id: string,
    updates: Partial<Pick<typeof roles.$inferSelect, 'name' | 'description' | 'priority'>>,
    permissionIds?: string[],
  ): Promise<typeof roles.$inferSelect | undefined> {
    if (isDevMode) {
      const [updated] = await db
        .update(roles)
        .set({ ...updates, updatedAt: new Date() } as Partial<typeof roles.$inferInsert>)
        .where(eq(roles.id, id))
        .returning();
      if (permissionIds) {
        await db.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
        if (permissionIds.length > 0) {
          await db
            .insert(rolePermissions)
            .values(permissionIds.map((permissionId) => ({ roleId: id, permissionId })));
        }
      }
      return updated;
    }

    return db.transaction(async (tx) => {
      const [updated] = await tx
        .update(roles)
        .set({ ...updates, updatedAt: new Date() } as Partial<typeof roles.$inferInsert>)
        .where(eq(roles.id, id))
        .returning();
      if (permissionIds) {
        await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
        if (permissionIds.length > 0) {
          await tx
            .insert(rolePermissions)
            .values(permissionIds.map((permissionId) => ({ roleId: id, permissionId })));
        }
      }
      return updated;
    });
  }

  /**
   * Atomically creates a role, resolves/creates every `{resourceType, action}` permission spec
   * (the same lookup-or-create logic as `getOrCreatePermission`, inlined per-branch below so each
   * lookup+create pair uses the SAME transaction-scoped client as the role/role-permission
   * writes), and assigns the resulting permission ids to the new role via `role_permissions` —
   * all inside a single Drizzle transaction on the production Postgres path (same
   * `isDevMode`-branch structure as `deleteRoleWithDependents`/`updateRoleWithPermissions`
   * above). This is a milder version of the gap `updateRoleWithPermissions` closes — a
   * mid-sequence failure here previously left an ORPHAN zero-permission role rather than wiping
   * an existing one — fixed for consistency (same root cause: unwrapped multi-statement writes).
   *
   * In dev mode (SQLite): same caveat as the other transactional methods above — the writes run
   * sequentially, not wrapped in `db.transaction()`, so real atomicity is only guaranteed on the
   * production Postgres path.
   */
  async createRoleWithPermissions(
    data: typeof roles.$inferInsert,
    permissionSpecs: { resourceType: string; action: string }[],
  ): Promise<typeof roles.$inferSelect> {
    if (isDevMode) {
      const roleInsertData = {
        ...data,
        isSystemRole: this.devModeBoolean(this.readOptionalBoolean(data, 'isSystemRole'), false),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see readOptionalBoolean: $inferInsert collapses under non-strict consuming-app tsconfigs
      } as any;
      const [role] = await db.insert(roles).values(roleInsertData).returning();
      const permissionIds: string[] = [];
      for (const spec of permissionSpecs) {
        const [existing] = await db
          .select()
          .from(permissions)
          .where(
            and(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              eq(permissions.resourceType, spec.resourceType as any),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              eq(permissions.action, spec.action as any),
            ),
          )
          .limit(1);
        const [created] = existing
          ? [existing]
          : await db
              .insert(permissions)
              .values({
                name: `${spec.resourceType}.${spec.action}`,
                resourceType: spec.resourceType,
                action: spec.action,
                description: `${spec.action} access to ${spec.resourceType} resources`,
                isSystemPermission: this.devModeBoolean(true, true),
              } as typeof permissions.$inferInsert)
              .returning();
        permissionIds.push(created.id);
      }
      if (permissionIds.length > 0) {
        await db
          .insert(rolePermissions)
          .values(permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })));
      }
      return role;
    }

    return db.transaction(async (tx) => {
      const [role] = await tx.insert(roles).values(data).returning();
      const permissionIds: string[] = [];
      for (const spec of permissionSpecs) {
        const [existing] = await tx
          .select()
          .from(permissions)
          .where(
            and(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              eq(permissions.resourceType, spec.resourceType as any),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              eq(permissions.action, spec.action as any),
            ),
          )
          .limit(1);
        const [created] = existing
          ? [existing]
          : await tx
              .insert(permissions)
              .values({
                name: `${spec.resourceType}.${spec.action}`,
                resourceType: spec.resourceType,
                action: spec.action,
                description: `${spec.action} access to ${spec.resourceType} resources`,
                isSystemPermission: true,
              } as typeof permissions.$inferInsert)
              .returning();
        permissionIds.push(created.id);
      }
      if (permissionIds.length > 0) {
        await tx
          .insert(rolePermissions)
          .values(permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })));
      }
      return role;
    });
  }

  /**
   * Atomically deletes a custom role together with every row that references it via an
   * `ON DELETE no action` FK: clears `role_permissions`, `user_roles`, `resource_permissions`
   * (all deleted - see the doc comments above for why each is deleted rather than nulled),
   * detaches `permission_audit_log` (nulled, not deleted, to preserve audit history), then
   * deletes the role itself. All 5 writes run inside a single Drizzle transaction on the
   * production Postgres path so the role is never left half-detached - or, in the worst case,
   * deleted while a dependent row still references it - if one of the writes fails.
   *
   * In dev mode (SQLite): drizzle's better-sqlite3 driver only supports synchronous
   * transaction callbacks, while the node-postgres driver used in production requires an
   * async one - the same callback cannot satisfy both dialects (see
   * `OrganizationsRepository.createWithAdminMember` for the established precedent). The steps
   * still run sequentially in this same order and a throw from any step still propagates
   * without invoking the next one, so a mid-sequence failure still means `deleteRole` (the
   * final step) never runs and the role itself is never deleted - real multi-statement
   * atomicity for the OTHER, already-applied writes is only guaranteed on the production
   * Postgres path.
   */
  async deleteRoleWithDependents(roleId: string): Promise<boolean> {
    if (isDevMode) {
      await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
      await db.delete(userRoles).where(eq(userRoles.roleId, roleId));
      await db.delete(resourcePermissions).where(eq(resourcePermissions.roleId, roleId));
      await db
        .update(permissionAuditLog)
        .set({ roleId: null } as Partial<typeof permissionAuditLog.$inferInsert>)
        .where(eq(permissionAuditLog.roleId, roleId));
      const deleted = await db.delete(roles).where(eq(roles.id, roleId)).returning();
      return deleted.length > 0;
    }

    return db.transaction(async (tx) => {
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
      await tx.delete(userRoles).where(eq(userRoles.roleId, roleId));
      await tx.delete(resourcePermissions).where(eq(resourcePermissions.roleId, roleId));
      await tx
        .update(permissionAuditLog)
        .set({ roleId: null } as Partial<typeof permissionAuditLog.$inferInsert>)
        .where(eq(permissionAuditLog.roleId, roleId));
      const deleted = await tx.delete(roles).where(eq(roles.id, roleId)).returning();
      return deleted.length > 0;
    });
  }
}
