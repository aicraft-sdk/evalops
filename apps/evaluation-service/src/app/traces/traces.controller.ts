import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { TracesService } from './traces.service';
import { JwtAuthGuard, CurrentUser, AuthenticatedUser } from '@evalops/shared-auth';
import { GetSpansQueryDto, SearchSpansQueryDto } from './traces.dto';

@Controller('traces')
@UseGuards(JwtAuthGuard)
export class TracesController {
  constructor(private readonly tracesService: TracesService) {}

  /**
   * GET /api/traces/runs/:runId/spans
   * Get paginated spans for a specific run with optional filters
   */
  @Get('runs/:runId/spans')
  async getSpansForRun(
    @Param('runId') runId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetSpansQueryDto,
  ) {
    return this.tracesService.getSpansForRun(
      runId,
      user.organizationId,
      query,
    );
  }

  /**
   * GET /api/traces/runs/:runId/spans/:spanId
   * Get a single span by spanId with its direct children
   */
  @Get('runs/:runId/spans/:spanId')
  async getSpanById(
    @Param('spanId') spanId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tracesService.getSpanById(spanId, user.organizationId);
  }

  /**
   * GET /api/traces/runs/:runId/tree
   * Get hierarchical span tree for a run
   */
  @Get('runs/:runId/tree')
  async getSpanTree(
    @Param('runId') runId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tracesService.getSpanTree(runId, user.organizationId);
  }

  /**
   * GET /api/traces/search
   * Search spans across runs with filters
   */
  @Get('search')
  async searchSpans(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SearchSpansQueryDto,
  ) {
    return this.tracesService.searchSpans(user.organizationId, query);
  }
}
