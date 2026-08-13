import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard, CurrentUser } from '@evalops/shared-auth';
import { EntitlementGuard, RequiresEntitlement } from '@evalops/licensing';
import { AuditExportService } from './audit-export.service';

/**
 * `organizationId` is read only from `@CurrentUser()` (the verified JWT claim set by
 * `JwtStrategy`), never from a query/body param — the export can only ever cover the
 * requesting user's own organization, mirroring the free `AuditController`'s org-scoping
 * and deliberately avoiding the `POST /policies/evaluate/:runId`-class IDOR (an
 * org-scope check missing on a client-suppliable identifier).
 */
@Controller('audit-trail/export')
@UseGuards(JwtAuthGuard, EntitlementGuard)
@RequiresEntitlement('audit-export')
export class AuditExportController {
  constructor(private readonly auditExportService: AuditExportService) {}

  @Get()
  async export(
    @CurrentUser() user: { organizationId: string },
    @Query('limit') limit: string | undefined,
    @Res() res: Response,
  ) {
    const csv = await this.auditExportService.buildCsv(
      user.organizationId,
      limit ? parseInt(limit, 10) : 1000,
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-trail.csv"');
    res.send(csv);
  }
}
