import { Module } from '@nestjs/common';
import { RedisModule } from '@evalops/shared-common';
import { RateLimitGuard } from '@evalops/shared-auth';
import { AuditExportController } from './audit-export.controller';
import { AuditExportService } from './audit-export.service';

@Module({
  imports: [RedisModule],
  controllers: [AuditExportController],
  providers: [AuditExportService, RateLimitGuard],
})
export class AuditExportModule {}
