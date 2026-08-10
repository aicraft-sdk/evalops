import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { PoliciesService } from './policies.service';
import { JwtAuthGuard, CurrentUser, AuthenticatedUser } from '@evalops/shared-auth';

@Controller('policies')
export class PoliciesController {
  constructor(private policiesService: PoliciesService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getPolicies(@CurrentUser() user: AuthenticatedUser) {
    return this.policiesService.getActivePolicies(user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('evaluate/:runId')
  async evaluateRun(@Param('runId') runId: string) {
    return this.policiesService.evaluateRun(runId);
  }
}

