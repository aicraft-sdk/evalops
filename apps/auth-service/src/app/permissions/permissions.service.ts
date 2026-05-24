import { Injectable, Logger } from '@nestjs/common';
import {
  PermissionsRepository,
  UsersRepository,
  permissions,
  roles,
  userRoles,
  rolePermissions,
  resourcePermissions,
  permissionAuditLog,
} from '@evalops/shared-db';
import {
  type Role,
  type Permission,
  type ResourcePermission,
  type InsertResourcePermission,
  type InsertUserRole,
  type InsertRole,
  type InsertPermission,
  type InsertRolePermission,
  type InsertPermissionAuditLog,
} from '@evalops/shared-db';

export type ResourceType =
  | 'organization'
  | 'dataset'
  | 'prompt'
  | 'flow'
  | 'eval_spec'
  | 'run'
  | 'model'
  | 'provider'
  | 'policy'
  | 'baseline';

export type PermissionAction =
  | 'read'
  | 'write'
  | 'delete'
  | 'execute'
  | 'manage'
  | 'admin';

interface PermissionCheck {
  userId: string;
  resourceType: ResourceType;
  resourceId?: string;
  action: PermissionAction;
}

interface UserPermissions {
  roles: Role[];
  permissions: Permission[];
  resourcePermissions: ResourcePermission[];
}

@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);
  private permissionCache = new Map<string, UserPermissions>();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor(
    private permissionsRepository: PermissionsRepository,
    private usersRepository: UsersRepository,
  ) {}

  /**
   * Check if user has permission to perform action on resource
   */
  async hasPermission(check: PermissionCheck): Promise<boolean> {
    try {
      const userPerms = await this.getUserPermissions(check.userId);

      // Check system admin role first
      if (this.isSystemAdmin(userPerms.roles)) {
        return true;
      }

      // Check resource-specific permissions
      if (check.resourceId) {
        const resourcePerm = await this.checkResourcePermission(
          check.userId,
          check.resourceType,
          check.resourceId,
          check.action,
        );
        if (resourcePerm !== null) {
          return resourcePerm;
        }
      }

      // Check role-based permissions
      return await this.checkRolePermissions(
        userPerms.roles,
        check.resourceType,
        check.action,
      );
    } catch (error: unknown) {
      this.logger.error('Permission check error:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  /**
   * Get all permissions for a user (with caching)
   */
  private async getUserPermissions(userId: string): Promise<UserPermissions> {
    const cacheKey = `user_${userId}`;
    const cached = this.permissionCache.get(cacheKey);

    if (cached && this.isCacheValid(cached)) {
      return cached;
    }

    // Fetch fresh permissions from database
    const userRolesList = await this.permissionsRepository.getUserRoles(userId);
    const userPerms = await this.permissionsRepository.getUserPermissions(userId);
    const userResourcePerms =
      await this.permissionsRepository.getUserResourcePermissions(userId);

    const userPermissions: UserPermissions = {
      roles: userRolesList as Role[],
      permissions: userPerms as Permission[],
      resourcePermissions: userResourcePerms as ResourcePermission[],
    };

    // Cache with timestamp
    (userPermissions as unknown as Record<string, unknown>)['_cached'] = Date.now();
    this.permissionCache.set(cacheKey, userPermissions);

    return userPermissions;
  }

  /**
   * Check if user has system admin role
   */
  private isSystemAdmin(userRolesList: Role[]): boolean {
    return userRolesList.some(
      (role) =>
        role.name.toLowerCase().includes('admin') ||
        role.name.toLowerCase().includes('superuser'),
    );
  }

  /**
   * Check resource-specific permissions
   */
  private async checkResourcePermission(
    userId: string,
    resourceType: ResourceType,
    resourceId: string,
    action: PermissionAction,
  ): Promise<boolean | null> {
    const resourcePerms = await this.permissionsRepository.getResourcePermissions(
      resourceType,
      resourceId,
    ) as ResourcePermission[];

    // Look for explicit user permission
    const userPerm = resourcePerms.find(
      (p) =>
        p.userId === userId &&
        (p.action === action || p.action === 'admin'),
    );

    if (userPerm) {
      return userPerm.granted;
    }

    // Look for role-based resource permission
    const userRolesList = await this.permissionsRepository.getUserRoles(userId) as Role[];
    const rolePerm = resourcePerms.find(
      (p) =>
        p.roleId &&
        userRolesList.some((r) => r.id === p.roleId) &&
        (p.action === action || p.action === 'admin'),
    );

    if (rolePerm) {
      return rolePerm.granted;
    }

    return null; // No explicit resource permission found
  }

  /**
   * Check role-based permissions
   */
  private async checkRolePermissions(
    userRolesList: Role[],
    resourceType: ResourceType,
    action: PermissionAction,
  ): Promise<boolean> {
    for (const role of userRolesList) {
      const rolePermissions = await this.permissionsRepository.getRolePermissions(
        role.id,
      ) as Permission[];

      const hasPermission = rolePermissions.some(
        (perm) =>
          perm.resourceType === resourceType &&
          (perm.action === action || perm.action === 'admin'),
      );

      if (hasPermission) {
        return true;
      }
    }

    return false;
  }

  /**
   * Grant permission to user for specific resource
   */
  async grantResourcePermission(
    userId: string,
    resourceType: ResourceType,
    resourceId: string,
    action: PermissionAction,
    grantedBy: string,
    expiresAt?: Date,
  ): Promise<void> {
    await this.permissionsRepository.createResourcePermission({
      userId,
      resourceType,
      resourceId,
      action,
      granted: true,
      grantedBy,
      expiresAt: expiresAt || undefined,
    } as typeof resourcePermissions.$inferInsert);

    // Clear cache
    this.clearUserCache(userId);

    // Audit log
    await this.logPermissionChange({
      action: 'grant',
      userId,
      resourceType,
      resourceId,
      permission: action,
      performedBy: grantedBy,
    });
  }

  /**
   * Revoke permission from user for specific resource
   */
  async revokeResourcePermission(
    userId: string,
    resourceType: ResourceType,
    resourceId: string,
    action: PermissionAction,
    revokedBy: string,
  ): Promise<void> {
    await this.permissionsRepository.createResourcePermission({
      userId,
      resourceType,
      resourceId,
      action,
      granted: false,
      grantedBy: revokedBy,
    } as typeof resourcePermissions.$inferInsert);

    // Clear cache
    this.clearUserCache(userId);

    // Audit log
    await this.logPermissionChange({
      action: 'revoke',
      userId,
      resourceType,
      resourceId,
      permission: action,
      performedBy: revokedBy,
    });
  }

  /**
   * Assign role to user
   */
  async assignRole(
    userId: string,
    roleId: string,
    assignedBy: string,
  ): Promise<void> {
    await this.permissionsRepository.createUserRole({
      userId,
      roleId,
      assignedBy,
    } as typeof userRoles.$inferInsert);

    // Clear cache
    this.clearUserCache(userId);

    // Audit log
    await this.logPermissionChange({
      action: 'role_assigned',
      userId,
      roleId,
      performedBy: assignedBy,
    });
  }

  /**
   * Remove role from user
   */
  async removeRole(userId: string, roleId: string, removedBy: string): Promise<void> {
    await this.permissionsRepository.removeUserRole(userId, roleId);

    // Clear cache
    this.clearUserCache(userId);

    // Audit log
    await this.logPermissionChange({
      action: 'role_removed',
      userId,
      roleId,
      performedBy: removedBy,
    });
  }

  /**
   * Get all users with access to a specific resource
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getResourceAccessList(
    resourceType: ResourceType,
    resourceId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any[]> {
    const resourcePerms = await this.permissionsRepository.getResourcePermissions(
      resourceType,
      resourceId,
    ) as ResourcePermission[];
    const result = [];

    for (const perm of resourcePerms) {
      if (perm.userId) {
        const user = await this.usersRepository.findById(perm.userId);
        if (user) {
          result.push({
            user,
            permission: perm.action,
            granted: perm.granted,
            expiresAt: perm.expiresAt,
          });
        }
      }

      if (perm.roleId) {
        const roleUsers = await this.usersRepository.findByRole(perm.roleId);
        for (const user of roleUsers) {
          result.push({
            user,
            permission: perm.action,
            granted: perm.granted,
            source: 'role',
          });
        }
      }
    }

    return result;
  }

  /**
   * Initialize default roles and permissions
   */
  async initializeDefaultRoles(organizationId: string): Promise<void> {
    const defaultRoles = [
      {
        name: 'Administrator',
        description: 'Full system access and user management',
        isSystemRole: true,
        priority: 100,
        permissions: ['admin'],
      },
      {
        name: 'Data Scientist',
        description: 'Can create and run evaluations, manage datasets',
        isSystemRole: true,
        priority: 50,
        permissions: ['read', 'write', 'execute'],
      },
      {
        name: 'ML Engineer',
        description: 'Can manage models and providers, run evaluations',
        isSystemRole: true,
        priority: 40,
        permissions: ['read', 'write', 'execute'],
      },
      {
        name: 'Analyst',
        description: 'Can view and analyze evaluation results',
        isSystemRole: true,
        priority: 20,
        permissions: ['read'],
      },
    ];

    for (const roleData of defaultRoles) {
      // Create role
      const role = await this.permissionsRepository.createRole({
        name: roleData.name,
        description: roleData.description,
        organizationId,
        isSystemRole: roleData.isSystemRole,
        priority: roleData.priority,
      } as typeof roles.$inferInsert) as Role;

      // Create permissions for each resource type
      const resourceTypes: ResourceType[] = [
        'dataset',
        'prompt',
        'flow',
        'eval_spec',
        'run',
        'model',
        'provider',
        'policy',
        'baseline',
      ];

      for (const resourceType of resourceTypes) {
        for (const action of roleData.permissions) {
          const permission = await this.getOrCreatePermission(
            resourceType,
            action as PermissionAction,
          );
          await this.permissionsRepository.createRolePermission({
            roleId: role.id,
            permissionId: permission.id,
          } as typeof rolePermissions.$inferInsert);
        }
      }
    }
  }

  /**
   * Get or create permission by resource type and action
   */
  private async getOrCreatePermission(
    resourceType: ResourceType,
    action: PermissionAction,
  ): Promise<Permission> {
    let permission = await this.permissionsRepository.findPermissionByTypeAndAction(
      resourceType,
      action,
    ) as Permission | undefined;

    if (!permission) {
      permission = await this.permissionsRepository.createPermission({
        name: `${resourceType}.${action}`,
        resourceType,
        action,
        description: `${action} access to ${resourceType} resources`,
        isSystemPermission: true,
      } as typeof permissions.$inferInsert) as Permission;
    }

    return permission;
  }

  /**
   * Log permission changes for audit trail
   */
  private async logPermissionChange(logData: Record<string, unknown>): Promise<void> {
    await this.permissionsRepository.createPermissionAuditLog({
      action: logData['action'],
      userId: logData['userId'],
      targetUserId: logData['targetUserId'],
      resourceType: logData['resourceType'],
      resourceId: logData['resourceId'],
      permission: logData['permission'],
      roleId: logData['roleId'],
      details: logData['details'] || {},
      performedBy: logData['performedBy'],
    } as typeof permissionAuditLog.$inferInsert);
  }

  /**
   * Clear user permissions cache
   */
  private clearUserCache(userId: string): void {
    this.permissionCache.delete(`user_${userId}`);
  }

  /**
   * Check if cached permissions are still valid
   */
  private isCacheValid(cached: UserPermissions): boolean {
    const cacheTime = (cached as unknown as Record<string, unknown>)['_cached'];
    return Boolean(cacheTime) && Date.now() - (cacheTime as number) < this.cacheTimeout;
  }

  /**
   * Clear all caches (useful for testing)
   */
  clearAllCaches(): void {
    this.permissionCache.clear();
  }
}
