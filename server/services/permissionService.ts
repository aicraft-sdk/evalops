import { storage } from '../storage';
import { 
  Role, Permission, ResourcePermission, 
  resourceTypeEnum, permissionActionEnum 
} from '@shared/schema';

export type ResourceType = 'organization' | 'dataset' | 'prompt' | 'flow' | 'eval_spec' | 'run' | 'model' | 'provider' | 'policy' | 'baseline';
export type PermissionAction = 'read' | 'write' | 'delete' | 'execute' | 'manage' | 'admin';

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

export class PermissionService {
  private permissionCache = new Map<string, UserPermissions>();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

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
          check.action
        );
        if (resourcePerm !== null) {
          return resourcePerm;
        }
      }

      // Check role-based permissions
      return await this.checkRolePermissions(
        userPerms.roles, 
        check.resourceType, 
        check.action
      );
    } catch (error) {
      console.error('Permission check error:', error);
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
    const roles = await storage.getUserRoles(userId);
    const permissions = await storage.getUserPermissions(userId);
    const resourcePermissions = await storage.getUserResourcePermissions(userId);

    const userPermissions: UserPermissions = {
      roles,
      permissions, 
      resourcePermissions
    };

    // Cache with timestamp
    (userPermissions as any)._cached = Date.now();
    this.permissionCache.set(cacheKey, userPermissions);

    return userPermissions;
  }

  /**
   * Check if user has system admin role
   */
  private isSystemAdmin(roles: Role[]): boolean {
    return roles.some(role => 
      role.name.toLowerCase().includes('admin') || 
      role.name.toLowerCase().includes('superuser')
    );
  }

  /**
   * Check resource-specific permissions
   */
  private async checkResourcePermission(
    userId: string, 
    resourceType: ResourceType, 
    resourceId: string, 
    action: PermissionAction
  ): Promise<boolean | null> {
    const resourcePerms = await storage.getResourcePermissions(resourceType, resourceId);
    
    // Look for explicit user permission
    const userPerm = resourcePerms.find(p => 
      p.userId === userId && 
      (p.action === action || p.action === 'admin')
    );
    
    if (userPerm) {
      return userPerm.granted;
    }

    // Look for role-based resource permission
    const userRoles = await storage.getUserRoles(userId);
    const rolePerm = resourcePerms.find(p => 
      p.roleId && 
      userRoles.some(r => r.id === p.roleId) &&
      (p.action === action || p.action === 'admin')
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
    roles: Role[], 
    resourceType: ResourceType, 
    action: PermissionAction
  ): Promise<boolean> {
    for (const role of roles) {
      const rolePermissions = await storage.getRolePermissions(role.id);
      
      const hasPermission = rolePermissions.some(perm => 
        perm.resourceType === resourceType && 
        (perm.action === action || perm.action === 'admin')
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
    expiresAt?: Date
  ): Promise<void> {
    await storage.createResourcePermission({
      userId,
      resourceType,
      resourceId,
      action,
      granted: true,
      grantedBy,
      expiresAt: expiresAt?.toISOString(),
    });

    // Clear cache
    this.clearUserCache(userId);
    
    // Audit log
    await this.logPermissionChange({
      action: 'grant',
      userId,
      resourceType,
      resourceId,
      permission: action,
      performedBy: grantedBy
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
    revokedBy: string
  ): Promise<void> {
    await storage.createResourcePermission({
      userId,
      resourceType,
      resourceId,
      action,
      granted: false,
      grantedBy: revokedBy,
    });

    // Clear cache
    this.clearUserCache(userId);
    
    // Audit log
    await this.logPermissionChange({
      action: 'revoke',
      userId,
      resourceType,
      resourceId,
      permission: action,
      performedBy: revokedBy
    });
  }

  /**
   * Assign role to user
   */
  async assignRole(userId: string, roleId: string, assignedBy: string): Promise<void> {
    await storage.createUserRole({
      userId,
      roleId,
      assignedBy
    });

    // Clear cache
    this.clearUserCache(userId);
    
    // Audit log
    await this.logPermissionChange({
      action: 'role_assigned',
      userId,
      roleId,
      performedBy: assignedBy
    });
  }

  /**
   * Remove role from user
   */
  async removeRole(userId: string, roleId: string, removedBy: string): Promise<void> {
    await storage.removeUserRole(userId, roleId);

    // Clear cache
    this.clearUserCache(userId);
    
    // Audit log
    await this.logPermissionChange({
      action: 'role_removed',
      userId,
      roleId,
      performedBy: removedBy
    });
  }

  /**
   * Get all users with access to a specific resource
   */
  async getResourceAccessList(resourceType: ResourceType, resourceId: string): Promise<any[]> {
    const resourcePerms = await storage.getResourcePermissions(resourceType, resourceId);
    const users = [];

    for (const perm of resourcePerms) {
      if (perm.userId) {
        const user = await storage.getUser(perm.userId);
        if (user) {
          users.push({
            user,
            permission: perm.action,
            granted: perm.granted,
            expiresAt: perm.expiresAt
          });
        }
      }
      
      if (perm.roleId) {
        const roleUsers = await storage.getUsersByRole(perm.roleId);
        for (const user of roleUsers) {
          users.push({
            user,
            permission: perm.action,
            granted: perm.granted,
            source: 'role'
          });
        }
      }
    }

    return users;
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
        permissions: ['admin']
      },
      {
        name: 'Data Scientist',
        description: 'Can create and run evaluations, manage datasets',
        isSystemRole: true,
        priority: 50,
        permissions: ['read', 'write', 'execute']
      },
      {
        name: 'ML Engineer', 
        description: 'Can manage models and providers, run evaluations',
        isSystemRole: true,
        priority: 40,
        permissions: ['read', 'write', 'execute']
      },
      {
        name: 'Analyst',
        description: 'Can view and analyze evaluation results',
        isSystemRole: true,
        priority: 20,
        permissions: ['read']
      }
    ];

    for (const roleData of defaultRoles) {
      // Create role
      const role = await storage.createRole({
        name: roleData.name,
        description: roleData.description,
        organizationId,
        isSystemRole: roleData.isSystemRole,
        priority: roleData.priority
      });

      // Create permissions for each resource type
      const resourceTypes: ResourceType[] = [
        'dataset', 'prompt', 'flow', 'eval_spec', 'run', 'model', 'provider', 'policy', 'baseline'
      ];

      for (const resourceType of resourceTypes) {
        for (const action of roleData.permissions) {
          await storage.createRolePermission({
            roleId: role.id,
            permissionId: await this.getOrCreatePermission(resourceType, action as PermissionAction)
          });
        }
      }
    }
  }

  /**
   * Get or create permission by resource type and action
   */
  private async getOrCreatePermission(
    resourceType: ResourceType, 
    action: PermissionAction
  ): Promise<string> {
    let permission = await storage.getPermissionByTypeAndAction(resourceType, action);
    
    if (!permission) {
      permission = await storage.createPermission({
        name: `${resourceType}.${action}`,
        resourceType,
        action,
        description: `${action} access to ${resourceType} resources`,
        isSystemPermission: true
      });
    }

    return permission.id;
  }

  /**
   * Log permission changes for audit trail
   */
  private async logPermissionChange(logData: any): Promise<void> {
    await storage.createPermissionAuditLog({
      action: logData.action,
      userId: logData.userId,
      targetUserId: logData.targetUserId,
      resourceType: logData.resourceType,
      resourceId: logData.resourceId,
      permission: logData.permission,
      roleId: logData.roleId,
      details: logData.details || {},
      performedBy: logData.performedBy
    });
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
    const cacheTime = (cached as any)._cached;
    return cacheTime && (Date.now() - cacheTime < this.cacheTimeout);
  }

  /**
   * Clear all caches (useful for testing)
   */
  clearAllCaches(): void {
    this.permissionCache.clear();
  }
}

// Export singleton instance
export const permissionService = new PermissionService();