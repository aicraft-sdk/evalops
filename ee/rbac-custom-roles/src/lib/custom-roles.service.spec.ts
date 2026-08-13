import { CustomRolesService } from './custom-roles.service';
import { ForbiddenException } from '@nestjs/common';

describe('CustomRolesService', () => {
  it('rejects updating a system role', async () => {
    const repo = {
      findRoleById: jest.fn().mockResolvedValue({ id: 'r1', isSystemRole: true, organizationId: 'org-1' }),
      updateRole: jest.fn(),
    };
    const service = new CustomRolesService(repo as never);
    await expect(service.update('org-1', 'r1', { name: 'Hacked Admin' })).rejects.toThrow(ForbiddenException);
    expect(repo.updateRole).not.toHaveBeenCalled();
  });

  it('rejects deleting a system role', async () => {
    const repo = {
      findRoleById: jest.fn().mockResolvedValue({ id: 'r1', isSystemRole: true, organizationId: 'org-1' }),
      deleteRole: jest.fn(),
    };
    const service = new CustomRolesService(repo as never);
    await expect(service.remove('org-1', 'r1')).rejects.toThrow(ForbiddenException);
    expect(repo.deleteRole).not.toHaveBeenCalled();
  });

  it("rejects cross-org access to another org's role", async () => {
    const repo = { findRoleById: jest.fn().mockResolvedValue({ id: 'r1', isSystemRole: false, organizationId: 'org-OTHER' }) };
    const service = new CustomRolesService(repo as never);
    await expect(service.remove('org-1', 'r1')).rejects.toThrow(ForbiddenException);
  });

  it('creates a custom role with isSystemRole explicitly false', async () => {
    const repo = {
      createRole: jest.fn().mockResolvedValue({ id: 'r2' }),
      getOrCreatePermission: jest.fn().mockResolvedValue({ id: 'perm-1' }),
      replaceRolePermissions: jest.fn(),
    };
    const service = new CustomRolesService(repo as never);
    await service.create('org-1', { name: 'Auditor', permissions: [{ resourceType: 'run', action: 'read' }] });
    expect(repo.createRole).toHaveBeenCalledWith(expect.objectContaining({ isSystemRole: false, organizationId: 'org-1' }));
  });

  it('deletes a role that has permissions attached by clearing role_permissions first (simulates ON DELETE no action FK)', async () => {
    // Fake that actually simulates the real Postgres FK relationship: deleteRole() only
    // "succeeds" once no role_permissions rows reference the role - mirrors the real
    // `role_permissions.role_id` FK with `ON DELETE no action`.
    const attachedPermissions = new Map<string, string[]>([['r1', ['perm-1', 'perm-2']]]);
    const repo = {
      findRoleById: jest.fn().mockResolvedValue({ id: 'r1', isSystemRole: false, organizationId: 'org-1' }),
      replaceRolePermissions: jest.fn((roleId: string, permissionIds: string[]) => {
        attachedPermissions.set(roleId, permissionIds);
        return Promise.resolve();
      }),
      clearUserRolesForRole: jest.fn().mockResolvedValue(undefined),
      clearResourcePermissionsForRole: jest.fn().mockResolvedValue(undefined),
      detachPermissionAuditLogForRole: jest.fn().mockResolvedValue(undefined),
      deleteRole: jest.fn((roleId: string) => {
        const attached = attachedPermissions.get(roleId) ?? [];
        if (attached.length > 0) {
          throw new Error(
            'insert or update on table "role_permissions" violates foreign key constraint "role_permissions_role_id_fkey" (simulated FK violation)',
          );
        }
        attachedPermissions.delete(roleId);
        return Promise.resolve(true);
      }),
    };
    const service = new CustomRolesService(repo as never);

    await expect(service.remove('org-1', 'r1')).resolves.toBe(true);

    expect(repo.replaceRolePermissions).toHaveBeenCalledWith('r1', []);
    const replaceCallOrder = repo.replaceRolePermissions.mock.invocationCallOrder[0];
    const deleteCallOrder = repo.deleteRole.mock.invocationCallOrder[0];
    expect(replaceCallOrder).toBeLessThan(deleteCallOrder);
  });

  it('deletes a role that has user_roles attached by clearing user_roles first (simulates ON DELETE no action FK)', async () => {
    // Fake that simulates the real Postgres FK relationship: deleteRole() only "succeeds"
    // once no user_roles rows reference the role - mirrors the real `user_roles.role_id`
    // FK (`user_roles_role_id_roles_id_fk`) with `ON DELETE no action`.
    const attachedUserRoles = new Map<string, string[]>([['r1', ['user-1', 'user-2']]]);
    const repo = {
      findRoleById: jest.fn().mockResolvedValue({ id: 'r1', isSystemRole: false, organizationId: 'org-1' }),
      replaceRolePermissions: jest.fn().mockResolvedValue(undefined),
      clearUserRolesForRole: jest.fn((roleId: string) => {
        attachedUserRoles.delete(roleId);
        return Promise.resolve();
      }),
      clearResourcePermissionsForRole: jest.fn().mockResolvedValue(undefined),
      detachPermissionAuditLogForRole: jest.fn().mockResolvedValue(undefined),
      deleteRole: jest.fn((roleId: string) => {
        const attached = attachedUserRoles.get(roleId) ?? [];
        if (attached.length > 0) {
          throw new Error(
            'insert or update on table "user_roles" violates foreign key constraint "user_roles_role_id_roles_id_fk" (simulated FK violation)',
          );
        }
        return Promise.resolve(true);
      }),
    };
    const service = new CustomRolesService(repo as never);

    await expect(service.remove('org-1', 'r1')).resolves.toBe(true);

    expect(repo.clearUserRolesForRole).toHaveBeenCalledWith('r1');
    const clearCallOrder = repo.clearUserRolesForRole.mock.invocationCallOrder[0];
    const deleteCallOrder = repo.deleteRole.mock.invocationCallOrder[0];
    expect(clearCallOrder).toBeLessThan(deleteCallOrder);
  });

  it('deletes a role that has resource_permissions attached by clearing resource_permissions first (simulates ON DELETE no action FK)', async () => {
    // Mirrors the real `resource_permissions.role_id` FK
    // (`resource_permissions_role_id_..._fk`) with `ON DELETE no action`.
    const attachedResourcePermissions = new Map<string, string[]>([['r1', ['rp-1']]]);
    const repo = {
      findRoleById: jest.fn().mockResolvedValue({ id: 'r1', isSystemRole: false, organizationId: 'org-1' }),
      replaceRolePermissions: jest.fn().mockResolvedValue(undefined),
      clearUserRolesForRole: jest.fn().mockResolvedValue(undefined),
      clearResourcePermissionsForRole: jest.fn((roleId: string) => {
        attachedResourcePermissions.delete(roleId);
        return Promise.resolve();
      }),
      detachPermissionAuditLogForRole: jest.fn().mockResolvedValue(undefined),
      deleteRole: jest.fn((roleId: string) => {
        const attached = attachedResourcePermissions.get(roleId) ?? [];
        if (attached.length > 0) {
          throw new Error(
            'insert or update on table "resource_permissions" violates foreign key constraint "resource_permissions_role_id_roles_id_fk" (simulated FK violation)',
          );
        }
        return Promise.resolve(true);
      }),
    };
    const service = new CustomRolesService(repo as never);

    await expect(service.remove('org-1', 'r1')).resolves.toBe(true);

    expect(repo.clearResourcePermissionsForRole).toHaveBeenCalledWith('r1');
    const clearCallOrder = repo.clearResourcePermissionsForRole.mock.invocationCallOrder[0];
    const deleteCallOrder = repo.deleteRole.mock.invocationCallOrder[0];
    expect(clearCallOrder).toBeLessThan(deleteCallOrder);
  });

  it('deletes a role that has permission_audit_log rows attached by detaching them first (simulates ON DELETE no action FK)', async () => {
    // Mirrors the real `permission_audit_log.role_id` FK
    // (`permission_audit_log_role_id_..._fk`) with `ON DELETE no action`. Audit rows are
    // detached (role_id set to null), not deleted, to preserve audit history.
    const attachedAuditLogRows = new Map<string, string[]>([['r1', ['log-1']]]);
    const repo = {
      findRoleById: jest.fn().mockResolvedValue({ id: 'r1', isSystemRole: false, organizationId: 'org-1' }),
      replaceRolePermissions: jest.fn().mockResolvedValue(undefined),
      clearUserRolesForRole: jest.fn().mockResolvedValue(undefined),
      clearResourcePermissionsForRole: jest.fn().mockResolvedValue(undefined),
      detachPermissionAuditLogForRole: jest.fn((roleId: string) => {
        attachedAuditLogRows.delete(roleId);
        return Promise.resolve();
      }),
      deleteRole: jest.fn((roleId: string) => {
        const attached = attachedAuditLogRows.get(roleId) ?? [];
        if (attached.length > 0) {
          throw new Error(
            'insert or update on table "permission_audit_log" violates foreign key constraint "permission_audit_log_role_id_roles_id_fk" (simulated FK violation)',
          );
        }
        return Promise.resolve(true);
      }),
    };
    const service = new CustomRolesService(repo as never);

    await expect(service.remove('org-1', 'r1')).resolves.toBe(true);

    expect(repo.detachPermissionAuditLogForRole).toHaveBeenCalledWith('r1');
    const detachCallOrder = repo.detachPermissionAuditLogForRole.mock.invocationCallOrder[0];
    const deleteCallOrder = repo.deleteRole.mock.invocationCallOrder[0];
    expect(detachCallOrder).toBeLessThan(deleteCallOrder);
  });
});
