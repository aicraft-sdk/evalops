import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RbacGuard, Roles, UserRole, CurrentUser } from '@evalops/shared-auth';
import { EntitlementGuard, RequiresEntitlement } from '@evalops/licensing';
import { CustomRolesService } from './custom-roles.service';
import { CreateCustomRoleDto, UpdateCustomRoleDto } from './custom-roles.dto';

/**
 * `organizationId` is read only from `@CurrentUser()` (the verified JWT claim), never from a
 * query/body param — mirrors the org-scoping convention established by `ee/audit-export`
 * (deliberately avoiding the `POST /policies/evaluate/:runId`-class cross-tenant IDOR).
 *
 * Guard order matters: `JwtAuthGuard` (authenticates) -> `RbacGuard` (requires ADMIN role) ->
 * `EntitlementGuard` (requires the `rbac-custom-roles` Enterprise entitlement). System-role
 * protection (a custom role can never mutate/mimic an `isSystemRole: true` role) is enforced
 * unconditionally inside `CustomRolesService`, independent of license state — it is a security
 * invariant, not a commercial gate.
 */
@Controller('admin/custom-roles')
@UseGuards(JwtAuthGuard, RbacGuard, EntitlementGuard)
@Roles(UserRole.ADMIN)
@RequiresEntitlement('rbac-custom-roles')
export class CustomRolesController {
  constructor(private readonly customRolesService: CustomRolesService) {}

  @Get()
  list(@CurrentUser() user: { organizationId: string }) {
    return this.customRolesService.list(user.organizationId);
  }

  @Post()
  create(@CurrentUser() user: { organizationId: string }, @Body() dto: CreateCustomRoleDto) {
    return this.customRolesService.create(user.organizationId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { organizationId: string },
    @Param('id') id: string,
    @Body() dto: UpdateCustomRoleDto,
  ) {
    return this.customRolesService.update(user.organizationId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: { organizationId: string }, @Param('id') id: string) {
    return this.customRolesService.remove(user.organizationId, id);
  }
}
