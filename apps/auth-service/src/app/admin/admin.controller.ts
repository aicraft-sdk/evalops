import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard, RbacGuard, Roles, CurrentUser } from '@evalops/shared-auth';
import { UserRole } from '@evalops/shared-auth';
import { InsertOrganization } from '@evalops/shared-db';

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
    @Body() body: { role: string },
  ) {
    return this.adminService.updateUserRole(userId, body.role);
  }

  @Post('organizations/:id')
  async updateOrganization(
    @Param('id') organizationId: string,
    @Body() body: Partial<InsertOrganization>,
  ) {
    return this.adminService.updateOrganization(organizationId, body);
  }
}
