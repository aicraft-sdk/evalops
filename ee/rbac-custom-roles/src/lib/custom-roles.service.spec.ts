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
});
