import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PermissionsRepository, roles } from '@evalops/shared-db';
import type { CreateCustomRoleDto, UpdateCustomRoleDto } from './custom-roles.dto';

@Injectable()
export class CustomRolesService {
  constructor(private readonly permissionsRepository: PermissionsRepository) {}

  async list(organizationId: string) {
    return this.permissionsRepository.listCustomRolesByOrg(organizationId);
  }

  async create(organizationId: string, dto: CreateCustomRoleDto) {
    const role = await this.permissionsRepository.createRole({
      name: dto.name,
      description: dto.description ?? null,
      organizationId,
      isSystemRole: false,
      priority: dto.priority ?? 0,
    } as typeof roles.$inferInsert);
    const permissionIds = await Promise.all(
      dto.permissions.map((p) =>
        this.permissionsRepository.getOrCreatePermission(p.resourceType, p.action).then((perm) => perm.id),
      ),
    );
    await this.permissionsRepository.replaceRolePermissions(role.id, permissionIds);
    return role;
  }

  async update(organizationId: string, roleId: string, dto: UpdateCustomRoleDto) {
    const role = await this.assertMutableCustomRole(organizationId, roleId);
    const updated = await this.permissionsRepository.updateRole(role.id, {
      name: dto.name,
      description: dto.description,
    });
    if (dto.permissions) {
      const permissionIds = await Promise.all(
        dto.permissions.map((p) =>
          this.permissionsRepository.getOrCreatePermission(p.resourceType, p.action).then((perm) => perm.id),
        ),
      );
      await this.permissionsRepository.replaceRolePermissions(role.id, permissionIds);
    }
    return updated;
  }

  async remove(organizationId: string, roleId: string) {
    await this.assertMutableCustomRole(organizationId, roleId);
    // role_permissions.role_id has `ON DELETE no action` - clear attached permission rows
    // first or deleteRole() throws an unhandled FK violation for any role with >=1 permission.
    await this.permissionsRepository.replaceRolePermissions(roleId, []);
    return this.permissionsRepository.deleteRole(roleId);
  }

  private async assertMutableCustomRole(organizationId: string, roleId: string) {
    const role = await this.permissionsRepository.findRoleById(roleId);
    if (!role) throw new NotFoundException('Role not found');
    if (role.organizationId !== organizationId) {
      throw new ForbiddenException('Role belongs to a different organization');
    }
    if (role.isSystemRole) {
      throw new ForbiddenException('Built-in system roles cannot be modified or deleted');
    }
    return role;
  }
}
