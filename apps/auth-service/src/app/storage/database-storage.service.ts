import { Injectable } from '@nestjs/common';
import { db } from '@evalops/shared-db';
import {
  users,
  organizations,
  roles,
  userRoles,
  permissions,
  rolePermissions,
  resourcePermissions,
  permissionAuditLog,
  type User,
  type UpsertUser,
  type Organization,
  type InsertOrganization,
  type Role,
  type InsertRole,
  type UserRole,
  type InsertUserRole,
  type Permission,
  type InsertPermission,
  type RolePermission,
  type InsertRolePermission,
  type ResourcePermission,
  type InsertResourcePermission,
  type PermissionAuditLog,
  type InsertPermissionAuditLog,
} from '@evalops/shared-db';
import { eq, and, or } from 'drizzle-orm';

@Injectable()
export class DatabaseStorageService {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(users.email);
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const { id, ...updateData } = userData as any;
    const [user] = await db
      .insert(users)
      .values(userData as typeof users.$inferInsert)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...updateData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Organization operations
  async getOrganization(id: string): Promise<Organization | undefined> {
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id));
    return organization;
  }

  async createOrganization(
    organization: InsertOrganization,
  ): Promise<Organization> {
    const [newOrg] = await db
      .insert(organizations)
      .values(organization as typeof organizations.$inferInsert)
      .returning();
    return newOrg;
  }

  async getAllOrganizations(): Promise<Organization[]> {
    return await db.select().from(organizations).orderBy(organizations.name);
  }

  async updateOrganization(
    id: string,
    organization: Partial<InsertOrganization>,
  ): Promise<Organization> {
    const [updatedOrg] = await db
      .update(organizations)
      .set({ ...organization })
      .where(eq(organizations.id, id))
      .returning();
    return updatedOrg;
  }

  // Permission operations
  async getUserRoles(userId: string): Promise<Role[]> {
    return await db
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

  async getUserPermissions(userId: string): Promise<Permission[]> {
    const userRolesList = await this.getUserRoles(userId);
    const roleIds = userRolesList.map((r) => r.id);

    if (roleIds.length === 0) {
      return [];
    }

    return await db
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
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(
        or(...roleIds.map((roleId) => eq(rolePermissions.roleId, roleId))),
      );
  }

  async getUserResourcePermissions(
    userId: string,
  ): Promise<ResourcePermission[]> {
    const userRolesList = await this.getUserRoles(userId);
    const roleIds = userRolesList.map((r) => r.id);

    return await db
      .select()
      .from(resourcePermissions)
      .where(
        or(
          eq(resourcePermissions.userId, userId),
          ...(roleIds.length > 0
            ? roleIds.map((roleId) => eq(resourcePermissions.roleId, roleId))
            : []),
        ),
      );
  }

  async getResourcePermissions(
    resourceType: string,
    resourceId: string,
  ): Promise<ResourcePermission[]> {
    return await db
      .select()
      .from(resourcePermissions)
      .where(
        and(
          eq(resourcePermissions.resourceType, resourceType as any),
          eq(resourcePermissions.resourceId, resourceId),
        ),
      );
  }

  async getRolePermissions(roleId: string): Promise<Permission[]> {
    return await db
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
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, roleId));
  }

  async createResourcePermission(
    permission: InsertResourcePermission,
  ): Promise<ResourcePermission> {
    const [newPerm] = await db
      .insert(resourcePermissions)
      .values(permission as typeof resourcePermissions.$inferInsert)
      .returning();
    return newPerm;
  }

  async createUserRole(role: InsertUserRole): Promise<UserRole> {
    const [newUserRole] = await db
      .insert(userRoles)
      .values(role as typeof userRoles.$inferInsert)
      .returning();
    return newUserRole;
  }

  async removeUserRole(userId: string, roleId: string): Promise<void> {
    await db
      .delete(userRoles)
      .where(
        and(
          eq(userRoles.userId, userId),
          eq(userRoles.roleId, roleId),
        ),
      );
  }

  async createRole(role: InsertRole): Promise<Role> {
    const [newRole] = await db
      .insert(roles)
      .values(role as typeof roles.$inferInsert)
      .returning();
    return newRole;
  }

  async createPermission(permission: InsertPermission): Promise<Permission> {
    const [newPerm] = await db
      .insert(permissions)
      .values(permission as typeof permissions.$inferInsert)
      .returning();
    return newPerm;
  }

  async getPermissionByTypeAndAction(
    resourceType: string,
    action: string,
  ): Promise<Permission | undefined> {
    const [perm] = await db
      .select()
      .from(permissions)
      .where(
        and(
          eq(permissions.resourceType, resourceType as any),
          eq(permissions.action, action as any),
        ),
      )
      .limit(1);
    return perm;
  }

  async createRolePermission(
    rolePermission: InsertRolePermission,
  ): Promise<RolePermission> {
    const [newRolePerm] = await db
      .insert(rolePermissions)
      .values(rolePermission as typeof rolePermissions.$inferInsert)
      .returning();
    return newRolePerm;
  }

  async createPermissionAuditLog(
    log: InsertPermissionAuditLog,
  ): Promise<PermissionAuditLog> {
    const [newLog] = await db
      .insert(permissionAuditLog)
      .values(log as typeof permissionAuditLog.$inferInsert)
      .returning();
    return newLog;
  }

  async getUsersByRole(roleId: string): Promise<Omit<User, 'passwordHash'>[]> {
    return await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
        role: users.role,
        organizationId: users.organizationId,
        entraId: users.entraId,
        upn: users.upn,
        tenantId: users.tenantId,
        department: users.department,
        jobTitle: users.jobTitle,
        isActive: users.isActive,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(userRoles)
      .innerJoin(users, eq(userRoles.userId, users.id))
      .where(eq(userRoles.roleId, roleId));
  }
}

