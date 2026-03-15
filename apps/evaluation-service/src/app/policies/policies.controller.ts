import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { PoliciesService } from './policies.service';
import { JwtAuthGuard, CurrentUser } from '@evalops/shared-auth';

@Controller('policies')
export class PoliciesController {
  constructor(private policiesService: PoliciesService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getPolicies(@CurrentUser() user: any) {
    return this.policiesService.getActivePolicies(user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('evaluate/:runId')
  async evaluateRun(@Param('runId') runId: string) {
    return this.policiesService.evaluateRun(runId);
  }
}

