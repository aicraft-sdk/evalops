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
}
