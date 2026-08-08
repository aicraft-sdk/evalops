import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { TraceEvent } from '@evalops/sdk';
import { RunsRepository } from '@evalops/shared-db';
import { IdempotencyService } from './idempotency.service';
import { TraceEventAdapterService } from './trace-event-adapter.service';

/**
 * Handles ingestion of trace events from SDK-instrumented agents.
 *
 * Events are validated, deduplicated via idempotency key, and persisted
 * to both trace_spans table (new) and runs.trace_events JSONB column (legacy, feature flag).
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  private readonly useLegacyJsonb: boolean;

  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly runsRepository: RunsRepository,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly traceEventAdapter: TraceEventAdapterService
  ) {
    // Feature flag: enable legacy JSONB writes (default: true for backward compatibility)
    this.useLegacyJsonb =
      this.configService.get<string>('ENABLE_LEGACY_TRACE_EVENTS', 'true') ===
      'true';
  }

  async ingestEvents(
    events: TraceEvent[],
    idempotencyKey?: string
  ): Promise<{ success: boolean; messageId?: string; skipped?: boolean }> {
    if (idempotencyKey) {
      const dup = await this.idempotency.isDuplicate(idempotencyKey);
      if (dup) {
        this.logger.debug(`Duplicate ingestion request, key=${idempotencyKey}`);
        return { success: true, skipped: true };
      }
    }

    // Group events by runId for ordered processing
    const byRun = new Map<string, TraceEvent[]>();
    for (const ev of events) {
      if (!byRun.has(ev.runId)) byRun.set(ev.runId, []);
      byRun.get(ev.runId)!.push(ev);
    }

    this.logger.log(
      `Received ${events.length} trace events across ${byRun.size} run(s)`
    );

    // Process each run's events
    for (const [runId, runEvents] of byRun.entries()) {
      // Get organizationId from run
      const run = await this.runsRepository.findById(runId);
      if (!run) {
        this.logger.warn(`Run ${runId} not found, skipping trace ingestion`);
        continue;
      }

      const organizationId = run.organizationId;

      // Convert to spans and store in trace_spans (new path)
      try {
        await this.traceEventAdapter.convertAndStoreBatch(
          runEvents,
          organizationId
        );
        this.logger.debug(
          `Converted ${runEvents.length} TraceEvents to spans for run ${runId}`
        );
      } catch (error) {
        this.logger.error(
          `Failed to convert TraceEvents to spans for run ${runId}: ${error?.message}`
        );
        // Continue with legacy path even if span conversion fails
      }

      // Optionally write to legacy JSONB (feature flag)
      if (this.useLegacyJsonb) {
        try {
          await this.runsRepository.appendTraceEvents(runId, runEvents);
        } catch (error) {
          this.logger.error(
            `Failed to append trace events to JSONB for run ${runId}: ${error?.message}`
          );
          // Don't fail the entire request if legacy write fails
        }
      }
    }

    if (idempotencyKey) {
      await this.idempotency.markSeen(idempotencyKey);
    }

    const messageId = `ing_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 9)}`;
    return { success: true, messageId };
  }

  async completeRun(
    runId: string,
    artifactHashes: Record<string, string>
  ): Promise<{ success: boolean }> {
    this.logger.log(
      `Completing run ${runId}, artifacts=${Object.keys(artifactHashes).length}`
    );

    await this.runsRepository.completeRun(runId, artifactHashes);

    // Fire-and-forget: notify integration-service to process artifact metadata
    this.notifyIntegrationService(runId, artifactHashes).catch((err) => {
      this.logger.warn(
        `Failed to notify integration-service for run ${runId}: ${err?.message}`
      );
    });

    return { success: true };
  }

  private async notifyIntegrationService(
    runId: string,
    artifactHashes: Record<string, string>
  ): Promise<void> {
    const integrationUrl = this.configService.get<string>(
      'CORE_SERVICE_URL',
      'http://core-service:3002'
    );
    const serviceSecret = this.configService.get<string>('SERVICE_SECRET', '');

    await this.httpService
      .post(
        `${integrationUrl}/api/artifacts/${runId}/notify`,
        { artifactHashes },
        {
          headers: {
            'X-Service-Token': serviceSecret,
            'Content-Type': 'application/json',
          },
          timeout: 5000,
        }
      )
      .toPromise();
  }
}
