import { Injectable, Logger } from '@nestjs/common';
import { AlertRuleService } from './alert-rule.service';
import { AlertNotificationService } from './alert-notification.service';
import { type AlertEvent } from '@evalops/shared-db';

/**
 * Public facade for the alerts subsystem.
 * Rule evaluation → AlertRuleService; notification dispatch → AlertNotificationService.
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private ruleService: AlertRuleService,
    private notificationService: AlertNotificationService,
  ) {}

  async checkRunAlerts(runId: string): Promise<void> {
    const alerts = await this.ruleService.checkRunAlerts(runId);
    for (const alert of alerts) {
      try {
        await this.notificationService.createAndSendAlert(alert);
      } catch (error: unknown) {
        this.logger.error(
          `Failed to dispatch alert (run ${runId}):`,
          error,
        );
      }
    }
  }

  async createAlert(
    config: Parameters<AlertNotificationService['createAndSendAlert']>[0],
  ): Promise<AlertEvent> {
    return this.notificationService.createAndSendAlert(config);
  }
}
