import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import {
  JwtAuthGuard,
  CurrentUser,
  RateLimitGuard,
  RateLimit,
} from '@evalops/shared-auth';
import { CreateOrganizationDto } from './organizations.dto';

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
  //
  // Rate-limited (5 creations/60s per user) to prevent a single authenticated
  // user from spinning up unbounded organizations — mirrors the
  // RateLimitGuard/@RateLimit convention used by evaluation-service's
  // ingestion route.
  @Post()
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 5, ttl: 60 })
  async createOrganization(
    @Body() organization: CreateOrganizationDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.organizationsService.createOrganizationForUser(
      organization,
      userId,
    );
  }
}
