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
    // createRoleWithPermissions performs createRole + getOrCreatePermission x N +
    // replaceRolePermissions atomically inside a single transaction on the production Postgres
    // path (see its doc comment on PermissionsRepository) - closes the same unwrapped-write gap
    // deleteRoleWithDependents closed for remove(): a mid-sequence failure here previously left
    // an orphan zero-permission role.
    return this.permissionsRepository.createRoleWithPermissions(
      {
        name: dto.name,
        description: dto.description ?? null,
        organizationId,
        isSystemRole: false,
        priority: dto.priority ?? 0,
      } as typeof roles.$inferInsert,
      dto.permissions.map((p) => ({ resourceType: p.resourceType, action: p.action })),
    );
  }

  async update(organizationId: string, roleId: string, dto: UpdateCustomRoleDto) {
    const role = await this.assertMutableCustomRole(organizationId, roleId);
    // Permission-id resolution stays outside the transaction: getOrCreatePermission touches the
    // shared, role-independent `permissions` table (idempotent lookup-or-create), not this
    // role's own data, so it carries no atomicity risk for THIS role's write sequence.
    const permissionIds = dto.permissions
      ? await Promise.all(
          dto.permissions.map((p) =>
            this.permissionsRepository.getOrCreatePermission(p.resourceType, p.action).then((perm) => perm.id),
          ),
        )
      : undefined;
    // updateRoleWithPermissions performs updateRole + replaceRolePermissions atomically inside a
    // single transaction on the production Postgres path (see its doc comment on
    // PermissionsRepository) - a mid-sequence failure here previously could silently wipe an
    // EXISTING role's permissions to zero with no rollback.
    return this.permissionsRepository.updateRoleWithPermissions(
      role.id,
      { name: dto.name, description: dto.description },
      permissionIds,
    );
  }

  async remove(organizationId: string, roleId: string) {
    await this.assertMutableCustomRole(organizationId, roleId);
    // roles.id is referenced by 4 FKs, all `ON DELETE no action` - every one must be cleared
    // (or, for permission_audit_log, detached) or a raw deleteRole() would throw an unhandled
    // FK violation for any role with >=1 row in a referencing table. deleteRoleWithDependents
    // runs the whole clear/detach/delete sequence inside a single transaction (see its doc
    // comment on PermissionsRepository), so a failure partway through never reaches the final
    // delete step.
    return this.permissionsRepository.deleteRoleWithDependents(roleId);
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
