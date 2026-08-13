import { Module } from '@nestjs/common';
import { AuditExportController } from './audit-export.controller';
import { AuditExportService } from './audit-export.service';

@Module({
  controllers: [AuditExportController],
  providers: [AuditExportService],
})
export class AuditExportModule {}
