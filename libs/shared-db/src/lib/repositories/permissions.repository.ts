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

  async createRole(
    data: typeof roles.$inferInsert,
  ): Promise<typeof roles.$inferSelect> {
    const [role] = await db.insert(roles).values(data).returning();
    return role;
  }

  async createPermission(
    data: typeof permissions.$inferInsert,
  ): Promise<typeof permissions.$inferSelect> {
    const [perm] = await db.insert(permissions).values(data).returning();
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
   * (`resource_permissions_role_id_roles_id_fk`). A role-scoped resource grant is meaningless
   * once its role is gone - deletes every resource_permissions row referencing this role.
   */
  async clearResourcePermissionsForRole(roleId: string): Promise<void> {
    await db.delete(resourcePermissions).where(eq(resourcePermissions.roleId, roleId));
  }

  /**
   * `permission_audit_log.role_id` has `ON DELETE no action`
   * (`permission_audit_log_role_id_roles_id_fk`) but is nullable, unlike user_roles/
   * resource_permissions. Detaches (nulls out) role_id instead of deleting rows, to preserve
   * audit history for a role that has since been deleted.
   */
  async detachPermissionAuditLogForRole(roleId: string): Promise<void> {
    await db
      .update(permissionAuditLog)
      .set({ roleId: null } as Partial<typeof permissionAuditLog.$inferInsert>)
      .where(eq(permissionAuditLog.roleId, roleId));
  }
}
