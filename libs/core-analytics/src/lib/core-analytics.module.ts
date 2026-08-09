import { Module } from '@nestjs/common';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [AnalyticsModule, AuditModule],
})
export class CoreAnalyticsModule {}
