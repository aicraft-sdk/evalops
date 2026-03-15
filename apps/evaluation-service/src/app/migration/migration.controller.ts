import { Controller, Post, Get, Param, UseGuards } from '@nestjs/common';
import { TraceMigrationService } from './trace-migration.service';
import { JwtAuthGuard, CurrentUser, RbacGuard, Roles } from '@evalops/shared-auth';
import { UserRole } from '@evalops/shared-auth';

@Controller('migration')
@UseGuards(JwtAuthGuard, RbacGuard)
export class MigrationController {
  constructor(private readonly migrationService: TraceMigrationService) {}

  /**
   * POST /api/migration/traces
   * Migrate all runs with trace_events to trace_spans
   * Admin only
   */
  @Roles(UserRole.ADMIN, UserRole.ORG_ADMIN)
  @Post('traces')
  async migrateAllTraces(@CurrentUser() user: any) {
    return this.migrationService.migrateAllRuns(user.organizationId);
  }

  /**
   * POST /api/migration/traces/:runId
   * Migrate a specific run's trace_events to trace_spans
   */
  @Post('traces/:runId')
  async migrateRunTraces(@Param('runId') runId: string) {
    const status = await this.migrationService.getRunMigrationStatus(runId);
    if (status.migrated) {
      return {
        message: `Run ${runId} already migrated`,
        ...status,
      };
    }
    const spansCreated = await this.migrationService.migrateRunById(runId);
    return {
      message: `Migrated run ${runId}`,
      spansCreated,
      ...(await this.migrationService.getRunMigrationStatus(runId)),
    };
  }

  /**
   * GET /api/migration/traces/:runId/status
   * Get migration status for a specific run
   */
  @Get('traces/:runId/status')
  async getMigrationStatus(@Param('runId') runId: string) {
    return this.migrationService.getRunMigrationStatus(runId);
  }
}
