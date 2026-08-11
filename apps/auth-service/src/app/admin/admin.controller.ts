import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard, RbacGuard, Roles } from '@evalops/shared-auth';
import { UserRole } from '@evalops/shared-auth';
import { UpdateOrganizationDto } from './organization-update.dto';
import { UpdateUserRoleDto } from './update-user-role.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RbacGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('users')
  async getUsers() {
    return this.adminService.getAllUsers();
  }

  @Get('organizations')
  async getOrganizations() {
    return this.adminService.getAllOrganizations();
  }

  @Post('users/:id/role')
  async updateUserRole(
    @Param('id') userId: string,
    @Body() body: UpdateUserRoleDto,
  ) {
    return this.adminService.updateUserRole(userId, body.role);
  }

  @Post('organizations/:id')
  async updateOrganization(
    @Param('id') organizationId: string,
    @Body() body: UpdateOrganizationDto,
  ) {
    return this.adminService.updateOrganization(organizationId, body);
  }
}
