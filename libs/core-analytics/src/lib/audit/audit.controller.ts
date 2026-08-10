import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard, CurrentUser } from '@evalops/shared-auth';

@Controller('audit-trail')
export class AuditController {
  constructor(private auditService: AuditService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getAuditTrail(
    @CurrentUser() user: { organizationId: string },
    @Query('limit') limit?: string,
  ) {
    return this.auditService.getAuditTrail(
      user.organizationId,
      limit ? parseInt(limit, 10) : 100,
    );
  }
}

