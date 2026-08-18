import { Controller, Get, Query, Res, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard, CurrentUser, RateLimitGuard, RateLimit } from '@evalops/shared-auth';
import { EntitlementGuard, RequiresEntitlement } from '@evalops/licensing';
import { AuditExportService } from './audit-export.service';
import { AuditExportQueryDto } from './audit-export.dto';

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

  // Rate-limited (5 requests/60s per user) to close a connection-pool-exhaustion DoS
  // risk: AuditRepository.findEnhancedByOrg fires one extra query per row (N+1), and
  // each request holds a connection from the globally-shared, default-max-10 pg pool
  // for the request's full duration — without a request-rate cap, a handful of
  // concurrent requests to this bulk-export endpoint could exhaust the platform's
  // entire DB connection pool. Mirrors the RateLimitGuard/@RateLimit convention
  // already used for org creation (organizations.controller.ts) and SDK ingestion
  // (ingestion.controller.ts) — 5/60s matches the org-creation precedent for a
  // similarly infrequent, sensitive, non-polled operation.
  @Get()
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 5, ttl: 60 })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async export(
    @CurrentUser() user: { organizationId: string },
    @Query() query: AuditExportQueryDto,
    @Res() res: Response,
  ) {
    const csv = await this.auditExportService.buildCsv(
      user.organizationId,
      query.limit ?? 1000,
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-trail.csv"');
    res.send(csv);
  }
}
