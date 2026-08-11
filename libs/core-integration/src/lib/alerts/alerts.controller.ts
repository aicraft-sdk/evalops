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
    // `InsertAlertConfig` (drizzle-zod's z.infer<createInsertSchema(...)>)
    // resolves to an effectively-empty type under this app's
    // strictNullChecks:false tsconfig — the same conditional-type collapse
    // documented on AlertsRepository.createConfig() above, just surfacing
    // via drizzle-zod instead of $inferInsert. Fixing that project-wide gap
    // is out of scope here; `body` still carries the real request payload
    // at runtime, so this cast restores the same looseness this call site
    // had before createConfig()'s parameter was narrowed away from
    // `Record<string, unknown>`.
    return this.alertsRepository.createConfig({
      ...body,
      organizationId: user.organizationId,
      createdBy: user.id,
    } as unknown as Parameters<AlertsRepository['createConfig']>[0]);
  }

  @UseGuards(JwtAuthGuard)
  @Post('check/:runId')
  async checkRunAlerts(@Param('runId') runId: string) {
    await this.alertsService.checkRunAlerts(runId);
    return { checked: true, runId };
  }
}
