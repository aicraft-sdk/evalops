import { Injectable, Logger } from '@nestjs/common';
import { db } from '@evalops/shared-db';
import { traceSpans, runs, type TraceSpan } from '@evalops/shared-db';
import { eq, and } from 'drizzle-orm';
import { TraceEvent, Event, ToolCall } from '@evalops/sdk';

/**
 * Span `attributes` is a jsonb column with no static schema, so values read
 * from it are `unknown`. These helpers safely coerce to the primitive type
 * TraceEvent fields expect, falling back when the shape doesn't match.
 */
function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Backward compatibility service for trace events
 * Converts spans back to TraceEvent format for frontend compatibility
 */
@Injectable()
export class TraceCompatibilityService {
  private readonly logger = new Logger(TraceCompatibilityService.name);

  /**
   * Get trace events for a run, reading from spans if migrated, otherwise from trace_events
   */
  async getTraceEventsForRun(runId: string): Promise<TraceEvent[]> {
    const [run] = await db
      .select()
      .from(runs)
      .where(eq(runs.id, runId))
      .limit(1);

    if (!run) {
      return [];
    }

    // If migrated, read from spans and convert to TraceEvent format
    if (run.traceMigratedAt) {
      return this.convertSpansToTraceEvents(runId, run.organizationId);
    }

    // Otherwise, return legacy trace_events
    if (run.traceEvents && Array.isArray(run.traceEvents)) {
      return run.traceEvents as TraceEvent[];
    }

    return [];
  }

  /**
   * Convert spans back to TraceEvent format for backward compatibility
   */
  private async convertSpansToTraceEvents(
    runId: string,
    organizationId: string,
  ): Promise<TraceEvent[]> {
    // Get all spans for the run, ordered by start time
    const spans = await db
      .select()
      .from(traceSpans)
      .where(
        and(
          eq(traceSpans.runId, runId),
          eq(traceSpans.organizationId, organizationId),
        ),
      )
      .orderBy(traceSpans.startTime);

    if (spans.length === 0) {
      return [];
    }

    // Group spans by traceId (each trace represents one TraceEvent)
    const tracesMap = new Map<string, TraceSpan[]>();
    for (const span of spans) {
      const traceSpansForId = tracesMap.get(span.traceId);
      if (traceSpansForId) {
        traceSpansForId.push(span);
      } else {
        tracesMap.set(span.traceId, [span]);
      }
    }

    // Convert each trace to a TraceEvent
    const traceEvents: TraceEvent[] = [];
    for (const [traceId, traceSpans] of tracesMap.entries()) {
      try {
        const traceEvent = this.convertTraceToTraceEvent(traceId, traceSpans);
        if (traceEvent) {
          traceEvents.push(traceEvent);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to convert trace ${traceId} to TraceEvent: ${error?.message}`,
          error,
        );
      }
    }

    return traceEvents;
  }

  /**
   * Convert a single trace (collection of spans) to TraceEvent format
   */
  private convertTraceToTraceEvent(
    traceId: string,
    spans: TraceSpan[],
  ): TraceEvent | null {
    // Find root span (agent.run)
    const rootSpan = spans.find((s) => s.name === 'agent.run' && !s.parentSpanId);
    if (!rootSpan) {
      this.logger.warn(`No root span found for trace ${traceId}`);
      return null;
    }

    // Extract attributes from root span
    const attrs = asRecord(rootSpan.attributes);
    const agentId = asString(attrs.agent_id);
    const agentVersion = asString(attrs.agent_version);
    const datasetId = asString(attrs.dataset_id);
    const datasetVersion = asString(attrs.dataset_version);

    // Collect events (llm.call spans)
    const events: Event[] = [];
    const llmSpans = spans.filter((s) => s.name === 'llm.call' && s.parentSpanId === rootSpan.spanId);
    for (const llmSpan of llmSpans) {
      const llmAttrs = asRecord(llmSpan.attributes);
      const eventType = asString(llmAttrs.event_type);
      if (eventType === 'user_message' || eventType === 'assistant_message') {
        events.push({
          type: eventType,
          timestamp: llmSpan.startTime,
          content: asString(llmAttrs.content),
          metadata: asRecord(llmAttrs.metadata),
        });
      } else if (eventType === 'error') {
        events.push({
          type: 'error',
          timestamp: llmSpan.startTime,
          metadata: {
            error: asString(llmAttrs.error),
            ...asRecord(llmAttrs.metadata),
          },
        });
      }
    }

    // Collect tool calls
    const toolCalls: ToolCall[] = [];
    const toolCallSpans = spans.filter(
      (s) => s.name === 'tool.call' && s.parentSpanId === rootSpan.spanId,
    );
    for (const toolCallSpan of toolCallSpans) {
      const toolAttrs = asRecord(toolCallSpan.attributes);

      // Find corresponding tool.result span
      const toolResultSpan = spans.find(
        (s) => s.name === 'tool.result' && s.parentSpanId === toolCallSpan.spanId,
      );
      const toolResultAttrs = toolResultSpan
        ? asRecord(toolResultSpan.attributes)
        : undefined;

      const duration = toolCallSpan.endTime && toolCallSpan.startTime
        ? toolCallSpan.endTime.getTime() - toolCallSpan.startTime.getTime()
        : undefined;

      toolCalls.push({
        toolName: asString(toolAttrs.tool_name),
        arguments: asRecord(toolAttrs.arguments),
        timestamp: toolCallSpan.startTime,
        duration,
        result: toolResultAttrs?.result,
        error: toolResultAttrs ? asOptionalString(toolResultAttrs.error) : undefined,
      });
    }

    // Calculate timings
    const startTime = rootSpan.startTime;
    const endTime = rootSpan.endTime || undefined;
    const totalDuration = endTime
      ? endTime.getTime() - startTime.getTime()
      : undefined;

    // Extract token usage and cost from root span attributes
    const promptTokens = asNumber(attrs.prompt_tokens);
    const completionTokens = asNumber(attrs.completion_tokens);
    const cost = asNumber(attrs.cost);

    return {
      runId: rootSpan.runId,
      agentId,
      agentVersion,
      datasetId,
      datasetVersion,
      events,
      toolCalls,
      timings: {
        startTime,
        endTime,
        totalDuration,
        toolCallDuration: asOptionalNumber(attrs.tool_call_duration_ms),
        llmCallDuration: asOptionalNumber(attrs.llm_call_duration_ms),
      },
      tokens: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      cost,
    };
  }
}
