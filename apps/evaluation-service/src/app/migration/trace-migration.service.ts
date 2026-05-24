import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { db } from '@evalops/shared-db';
import { runs, traceSpans, type Run } from '@evalops/shared-db';
import type { TraceEvent } from '@evalops/sdk';
import { eq, isNotNull, and, sql } from 'drizzle-orm';
import { TraceEventAdapterService } from '../ingestion/trace-event-adapter.service';
import { DatabaseStorageService } from '../storage/database-storage.service';

export interface MigrationProgress {
  totalRuns: number;
  processedRuns: number;
  migratedRuns: number;
  skippedRuns: number;
  failedRuns: number;
  totalSpansCreated: number;
}

@Injectable()
export class TraceMigrationService {
  private readonly logger = new Logger(TraceMigrationService.name);
  private readonly BATCH_SIZE = 100; // Process runs in batches
  private readonly SPANS_BATCH_SIZE = 1000; // Insert spans in batches

  constructor(
    private readonly traceEventAdapter: TraceEventAdapterService,
    private readonly storageService: DatabaseStorageService,
  ) {}

  /**
   * Migrate all runs with trace_events to trace_spans
   * Idempotent: skips runs that are already migrated
   */
  async migrateAllRuns(
    organizationId?: string,
  ): Promise<MigrationProgress> {
    const progress: MigrationProgress = {
      totalRuns: 0,
      processedRuns: 0,
      migratedRuns: 0,
      skippedRuns: 0,
      failedRuns: 0,
      totalSpansCreated: 0,
    };

    this.logger.log('Starting trace migration...');

    // Build query to find runs with trace_events that haven't been migrated
    const conditions = [
      isNotNull(runs.traceEvents),
      sql`${runs.traceEvents} != '[]'::jsonb`, // Not empty array
      sql`${runs.traceMigratedAt} IS NULL`, // Not yet migrated
    ];

    if (organizationId) {
      conditions.push(eq(runs.organizationId, organizationId));
    }

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(runs)
      .where(and(...conditions));

    progress.totalRuns = Number(count);
    this.logger.log(`Found ${progress.totalRuns} runs to migrate`);

    if (progress.totalRuns === 0) {
      return progress;
    }

    // Process in batches
    let offset = 0;
    while (offset < progress.totalRuns) {
      const batchRuns = await db
        .select()
        .from(runs)
        .where(and(...conditions))
        .limit(this.BATCH_SIZE)
        .offset(offset);

      if (batchRuns.length === 0) {
        break;
      }

      for (const run of batchRuns) {
        try {
          const spansCreated = await this.migrateRun(run);
          if (spansCreated > 0) {
            progress.migratedRuns++;
            progress.totalSpansCreated += spansCreated;
            this.logger.debug(
              `Migrated run ${run.id}: ${spansCreated} spans created`,
            );
          } else {
            progress.skippedRuns++;
            this.logger.debug(`Skipped run ${run.id}: no spans created`);
          }
        } catch (error) {
          progress.failedRuns++;
          this.logger.error(
            `Failed to migrate run ${run.id}: ${error?.message}`,
            error,
          );
        }
        progress.processedRuns++;
      }

      offset += this.BATCH_SIZE;
      this.logger.log(
        `Progress: ${progress.processedRuns}/${progress.totalRuns} runs processed`,
      );
    }

    this.logger.log(
      `Migration complete: ${progress.migratedRuns} migrated, ${progress.skippedRuns} skipped, ${progress.failedRuns} failed`,
    );

    return progress;
  }

  /**
   * Migrate a single run's trace_events to trace_spans
   * Idempotent: returns 0 if already migrated
   */
  async migrateRun(run: Run): Promise<number> {
    // Check if already migrated
    if (run.traceMigratedAt) {
      this.logger.debug(`Run ${run.id} already migrated at ${run.traceMigratedAt}`);
      return 0;
    }

    // Check if trace_events exists and is not empty
    if (!run.traceEvents || !Array.isArray(run.traceEvents) || run.traceEvents.length === 0) {
      this.logger.debug(`Run ${run.id} has no trace_events to migrate`);
      return 0;
    }

    // Check if spans already exist for this run (idempotency check)
    const existingSpans = await db
      .select({ count: sql<number>`count(*)` })
      .from(traceSpans)
      .where(eq(traceSpans.runId, run.id))
      .limit(1);

    if (Number(existingSpans[0]?.count ?? 0) > 0) {
      this.logger.debug(
        `Run ${run.id} already has spans, marking as migrated`,
      );
      // Mark as migrated even though we didn't create the spans
      await db
        .update(runs)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .set({ traceMigratedAt: new Date() } as any) // Drizzle Exactly<> type limitation
        .where(eq(runs.id, run.id));
      return 0;
    }

    let totalSpansCreated = 0;

    try {
      // Convert each TraceEvent to spans
      for (const traceEvent of run.traceEvents as TraceEvent[]) {
        try {
          const result = await this.traceEventAdapter.convertAndStore(
            traceEvent,
            run.organizationId,
          );
          totalSpansCreated += result.spansCreated;
        } catch (error) {
          this.logger.warn(
            `Failed to convert TraceEvent for run ${run.id}: ${error?.message}`,
            error,
          );
          // Continue with other events
        }
      }

      // Mark run as migrated
      await db
        .update(runs)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .set({ traceMigratedAt: new Date() } as any) // Drizzle Exactly<> type limitation
        .where(eq(runs.id, run.id));

      this.logger.log(
        `Migrated run ${run.id}: ${totalSpansCreated} spans created from ${run.traceEvents.length} trace events`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to migrate run ${run.id}: ${error?.message}`,
        error,
      );
      throw error;
    }

    return totalSpansCreated;
  }

  async migrateRunById(runId: string): Promise<number> {
    const [run] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
    if (!run) throw new NotFoundException(`Run ${runId} not found`);
    return this.migrateRun(run);
  }

  /**
   * Get migration status for a specific run
   */
  async getRunMigrationStatus(runId: string): Promise<{
    migrated: boolean;
    migratedAt: Date | null;
    spanCount: number;
    traceEventCount: number;
  }> {
    const [run] = await db
      .select()
      .from(runs)
      .where(eq(runs.id, runId))
      .limit(1);

    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    const [{ count: spanCount }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(traceSpans)
      .where(eq(traceSpans.runId, runId));

    return {
      migrated: !!run.traceMigratedAt,
      migratedAt: run.traceMigratedAt || null,
      spanCount: Number(spanCount),
      traceEventCount: Array.isArray(run.traceEvents)
        ? run.traceEvents.length
        : 0,
    };
  }
}
