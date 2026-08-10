import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard, CurrentUser } from '@evalops/shared-auth';
import { InsertOrganization } from '@evalops/shared-db';

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private organizationsService: OrganizationsService) {}

  @Get(':id')
  async getOrganization(@Param('id') id: string) {
    return this.organizationsService.getOrganization(id);
  }

  // Any authenticated user may create a brand new organization — there is no
  // existing org context to check an ORG_ADMIN/ADMIN role against, so the
  // RbacGuard role check that gates managing an EXISTING org does not apply
  // here. The creator becomes the new org's ORG_ADMIN (see
  // OrganizationsService.createOrganizationForUser); their role in any org
  // they already belong to is unaffected.
  @Post()
  async createOrganization(
    @Body() organization: InsertOrganization,
    @CurrentUser('id') userId: string,
  ) {
    return this.organizationsService.createOrganizationForUser(
      organization,
      userId,
    );
  }
}
