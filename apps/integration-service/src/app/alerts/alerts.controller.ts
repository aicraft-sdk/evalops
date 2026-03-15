import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard, CurrentUser } from '@evalops/shared-auth';
import { DatabaseStorageService } from '../storage/database-storage.service';
import { InsertAlertConfig } from '@evalops/shared-db';

@Controller('alerts')
export class AlertsController {
  constructor(
    private alertsService: AlertsService,
    private storageService: DatabaseStorageService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getAlerts(@CurrentUser() user: any) {
    return this.storageService.getAlertEvents(user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('configs')
  async getAlertConfigs(@CurrentUser() user: any) {
    return this.storageService.getAlertConfigs(user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('configs')
  async createAlertConfig(
    @Body() body: InsertAlertConfig,
    @CurrentUser() user: any,
  ) {
    return this.storageService.createAlertConfig({
      ...body,
      organizationId: user.organizationId,
      createdBy: user.id,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('check/:runId')
  async checkRunAlerts(
    @Param('runId') runId: string,
    @CurrentUser() user: any,
  ) {
    await this.alertsService.checkRunAlerts(runId);
    return { checked: true, runId };
  }
}

