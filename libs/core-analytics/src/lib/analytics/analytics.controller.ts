import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard, CurrentUser } from '@evalops/shared-auth';

@Controller('analytics')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('trends')
  async getTrends(
    @CurrentUser() user: { organizationId: string },
    @Query('days') days?: string,
  ) {
    return this.analyticsService.getTrends(
      user.organizationId,
      days ? parseInt(days, 10) : 30,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('cost-breakdown')
  async getCostBreakdown(
    @CurrentUser() user: { organizationId: string },
    @Query('days') days?: string,
  ) {
    return this.analyticsService.getCostBreakdown(
      user.organizationId,
      days ? parseInt(days, 10) : 30,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('performance-comparison')
  async getPerformanceComparison(
    @CurrentUser() user: { organizationId: string },
    @Query('days') days?: string,
  ) {
    return this.analyticsService.getPerformanceComparison(
      user.organizationId,
      days ? parseInt(days, 10) : 30,
    );
  }
}

