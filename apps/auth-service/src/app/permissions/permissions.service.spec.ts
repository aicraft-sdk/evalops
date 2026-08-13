import { PermissionsService } from './permissions.service';
import type { PermissionsRepository, UsersRepository, Role } from '@evalops/shared-db';

describe('PermissionsService.hasPermission - isSystemAdmin bypass protection', () => {
  it('does not grant unconditional access to a custom role named "Administrator" with isSystemRole:false and only a narrow permission grant', async () => {
    // A malicious/careless org admin created a custom role literally named "Administrator"
    // (name-substring collision with the real built-in system role) but it is NOT the real
    // system role - isSystemRole is false and it was only granted `run:read`.
    const narrowCustomRole: Role = {
      id: 'role-1',
      name: 'Administrator',
      description: 'custom role',
      organizationId: 'org-1',
      isSystemRole: false,
      priority: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const permissionsRepository = {
      getUserRoles: jest.fn().mockResolvedValue([narrowCustomRole]),
      getUserPermissions: jest.fn().mockResolvedValue([]),
      getUserResourcePermissions: jest.fn().mockResolvedValue([]),
      getRolePermissions: jest
        .fn()
        .mockResolvedValue([{ id: 'perm-1', resourceType: 'run', action: 'read' }]),
    } as unknown as PermissionsRepository;

    const usersRepository = {} as UsersRepository;
    const service = new PermissionsService(permissionsRepository, usersRepository);

    // The narrow grant (run:read) must still work normally.
    await expect(
      service.hasPermission({ userId: 'user-1', resourceType: 'run', action: 'read' }),
    ).resolves.toBe(true);

    // CRITICAL: nothing outside the narrow grant may be allowed just because the role's
    // name contains "admin" - isSystemAdmin() must not bypass hasPermission()'s normal checks
    // for a role that is not actually isSystemRole:true.
    await expect(
      service.hasPermission({ userId: 'user-1', resourceType: 'organization', action: 'admin' }),
    ).resolves.toBe(false);
  });

  it('grants unconditional access to a real system role (isSystemRole:true) regardless of name', async () => {
    const realSystemRole: Role = {
      id: 'role-2',
      name: 'Administrator',
      description: 'built-in',
      organizationId: 'org-1',
      isSystemRole: true,
      priority: 100,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const permissionsRepository = {
      getUserRoles: jest.fn().mockResolvedValue([realSystemRole]),
      getUserPermissions: jest.fn().mockResolvedValue([]),
      getUserResourcePermissions: jest.fn().mockResolvedValue([]),
      getRolePermissions: jest.fn().mockResolvedValue([]),
    } as unknown as PermissionsRepository;

    const usersRepository = {} as UsersRepository;
    const service = new PermissionsService(permissionsRepository, usersRepository);

    await expect(
      service.hasPermission({ userId: 'user-2', resourceType: 'organization', action: 'admin' }),
    ).resolves.toBe(true);
  });
});
