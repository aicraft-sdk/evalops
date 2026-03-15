import {
  Controller,
  Post,
  Body,
  Param,
  Headers,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { BatchEventsDto, CompleteRunDto } from './ingestion.dto';
import { RateLimitGuard, RateLimit } from '@evalops/shared-auth';

/**
 * Ingestion API — receives trace events from SDK-instrumented agents.
 *
 * POST /ingestion/events         — batch ingest trace events (rate-limited: 100 req/min)
 * POST /ingestion/runs/:id/complete — mark run complete + store artifact hashes
 */
@Controller('ingestion')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post('events')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 100, ttl: 60 })
  async ingestEvents(
    @Body() dto: BatchEventsDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.ingestionService.ingestEvents(dto.events, idempotencyKey);
  }

  @Post('runs/:id/complete')
  @HttpCode(HttpStatus.OK)
  async completeRun(
    @Param('id') runId: string,
    @Body() dto: CompleteRunDto,
  ) {
    return this.ingestionService.completeRun(runId, dto.artifactHashes);
  }
}
