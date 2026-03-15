import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard, RbacGuard, Roles } from '@evalops/shared-auth';
import { UserRole } from '@evalops/shared-auth';
import { InsertOrganization } from '@evalops/shared-db';

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private organizationsService: OrganizationsService) {}

  @Get(':id')
  async getOrganization(@Param('id') id: string) {
    return this.organizationsService.getOrganization(id);
  }

  @Post()
  @UseGuards(RbacGuard)
  @Roles(UserRole.ORG_ADMIN, UserRole.ADMIN)
  async createOrganization(@Body() organization: InsertOrganization) {
    return this.organizationsService.createOrganization(organization);
  }
}
