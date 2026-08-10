import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import {
  JwtAuthGuard,
  CurrentUser,
  AuthenticatedUser,
} from '@evalops/shared-auth';
import { AlertsRepository } from '@evalops/shared-db';
import { InsertAlertConfig } from '@evalops/shared-db';

@Controller('alerts')
export class AlertsController {
  constructor(
    private alertsService: AlertsService,
    private alertsRepository: AlertsRepository,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getAlerts(@CurrentUser() user: AuthenticatedUser) {
    return this.alertsRepository.findEventsByOrg(user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('configs')
  async getAlertConfigs(@CurrentUser() user: AuthenticatedUser) {
    return this.alertsRepository.findConfigsByOrg(user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('configs')
  async createAlertConfig(
    @Body() body: InsertAlertConfig,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.alertsRepository.createConfig({
      ...body,
      organizationId: user.organizationId,
      createdBy: user.id,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('check/:runId')
  async checkRunAlerts(@Param('runId') runId: string) {
    await this.alertsService.checkRunAlerts(runId);
    return { checked: true, runId };
  }
}
