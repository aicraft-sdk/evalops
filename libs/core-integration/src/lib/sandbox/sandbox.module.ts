import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { SandboxService } from './sandbox.service';
import { SandboxSecurityService } from './sandbox-security.service';
import { SandboxAuditService } from './sandbox-audit.service';
import { SandboxMonitoringService } from './sandbox-monitoring.service';
import { SandboxController } from './sandbox.controller';
import { SandboxPolicies } from './sandbox-policies';
import { HttpClientService } from '@evalops/shared-common';

@Module({
  imports: [HttpModule, ConfigModule],
  controllers: [SandboxController],
  providers: [
    SandboxService,
    SandboxSecurityService,
    SandboxAuditService,
    SandboxMonitoringService,
    SandboxPolicies,
    HttpClientService,
  ],
  exports: [SandboxService, SandboxPolicies],
})
export class SandboxModule {}
