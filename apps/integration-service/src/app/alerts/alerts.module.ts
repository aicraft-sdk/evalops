import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { AlertRuleService } from './alert-rule.service';
import { AlertNotificationService } from './alert-notification.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule, HttpModule],
  controllers: [AlertsController],
  providers: [AlertsService, AlertRuleService, AlertNotificationService],
  exports: [AlertsService],
})
export class AlertsModule {}
