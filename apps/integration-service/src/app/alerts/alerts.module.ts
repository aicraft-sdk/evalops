import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { AlertRuleService } from './alert-rule.service';
import { AlertNotificationService } from './alert-notification.service';

@Module({
  imports: [HttpModule],
  controllers: [AlertsController],
  providers: [AlertsService, AlertRuleService, AlertNotificationService],
  exports: [AlertsService],
})
export class AlertsModule {}
