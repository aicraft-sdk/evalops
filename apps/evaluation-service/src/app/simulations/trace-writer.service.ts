import { Injectable, Logger } from '@nestjs/common';
import { db } from '@evalops/shared-db';
import {
  traceSpans,
  type TraceSpan,
  type InsertTraceSpan,
} from '@evalops/shared-db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

/**
 * TraceWriterService
 *
 * Writes OTLP-shaped spans to the trace_spans table.
 * Maintains parent-child relationships via parent_span_id.
 *
 * Span Taxonomy (Phase 1):
 * - simulation.run - Root span for entire simulation
 * - simulation.turn - One turn (user message + agent response)
 * - llm.call - LLM API call (agent or judge)
 * - tool.call - Tool invocation
 * - tool.result - Tool response
 * - judge.call - Judge evaluation
 */
@Injectable()
export class TraceWriterService {
  private readonly logger = new Logger(TraceWriterService.name);

  /**
   * Generate a new trace ID (UUID v4)
   */
  generateTraceId(): string {
    return randomUUID();
  }

  /**
   * Generate a new span ID (UUID v4)
   */
  generateSpanId(): string {
    return randomUUID();
  }

  /**
   * Create a root span for a simulation run
   */
  async createRootSpan(
    runId: string,
    organizationId: string,
    traceId?: string
  ): Promise<TraceSpan> {
    const spanId = this.generateSpanId();
    const finalTraceId = traceId || this.generateTraceId();

    const span: InsertTraceSpan = {
      traceId: finalTraceId,
      spanId,
      parentSpanId: null,
      name: 'simulation.run',
      startTime: new Date(),
      endTime: null,
      attributes: {
        run_id: runId,
      },
      events: [],
      runId,
      organizationId,
    };

    const [created] = await db.insert(traceSpans).values([span]).returning();

    this.logger.debug(`Created root span ${spanId} for run ${runId}`);
    return created;
  }

  /**
   * Create a child span
   */
  async createSpan(
    runId: string,
    organizationId: string,
    name: string,
    parentSpanId: string,
    traceId: string,
    attributes?: Record<string, unknown>,
    events?: Array<{
      name: string;
      timestamp: Date;
      attributes?: Record<string, unknown>;
    }>
  ): Promise<TraceSpan> {
    const spanId = this.generateSpanId();

    const span: InsertTraceSpan = {
      traceId,
      spanId,
      parentSpanId,
      name,
      startTime: new Date(),
      endTime: null,
      attributes: attributes || {},
      events:
        events?.map((e) => ({
          name: e.name,
          timestamp: e.timestamp.toISOString(),
          attributes: e.attributes || {},
        })) || [],
      runId,
      organizationId,
    };

    const [created] = await db.insert(traceSpans).values([span]).returning();

    this.logger.debug(`Created span ${spanId} (${name}) for run ${runId}`);
    return created;
  }

  /**
   * Update a span's end time and optionally add attributes/events
   */
  async endSpan(
    spanId: string,
    attributes?: Record<string, unknown>,
    events?: Array<{
      name: string;
      timestamp: Date;
      attributes?: Record<string, unknown>;
    }>
  ): Promise<void> {
    const updateData: Partial<InsertTraceSpan> = {
      endTime: new Date(),
    };

    if (attributes) {
      // Merge with existing attributes
      const [existing] = await db
        .select()
        .from(traceSpans)
        .where(eq(traceSpans.spanId, spanId));

      if (existing) {
        updateData.attributes = {
          ...(existing.attributes as Record<string, unknown>),
          ...attributes,
        };
      } else {
        updateData.attributes = attributes;
      }
    }

    if (events) {
      // Append to existing events
      const [existing] = await db
        .select()
        .from(traceSpans)
        .where(eq(traceSpans.spanId, spanId));

      if (existing) {
        const existingEvents = (existing.events as unknown[]) || [];
        updateData.events = [
          ...existingEvents,
          ...events.map((e) => ({
            name: e.name,
            timestamp: e.timestamp.toISOString(),
            attributes: e.attributes || {},
          })),
        ];
      } else {
        updateData.events = events.map((e) => ({
          name: e.name,
          timestamp: e.timestamp.toISOString(),
          attributes: e.attributes || {},
        }));
      }
    }

    await db
      .update(traceSpans)
      .set(updateData)
      .where(eq(traceSpans.spanId, spanId));

    this.logger.debug(`Ended span ${spanId}`);
  }

  /**
   * Get all spans for a run
   */
  async getSpansForRun(runId: string): Promise<TraceSpan[]> {
    return await db
      .select()
      .from(traceSpans)
      .where(eq(traceSpans.runId, runId))
      .orderBy(traceSpans.startTime);
  }

  /**
   * Get spans by trace ID
   */
  async getSpansByTraceId(traceId: string): Promise<TraceSpan[]> {
    return await db
      .select()
      .from(traceSpans)
      .where(eq(traceSpans.traceId, traceId))
      .orderBy(traceSpans.startTime);
  }

  /**
   * Get a span by span ID
   */
  async getSpan(spanId: string): Promise<TraceSpan | undefined> {
    const [span] = await db
      .select()
      .from(traceSpans)
      .where(eq(traceSpans.spanId, spanId));
    return span;
  }
}
