import { Injectable, Logger } from '@nestjs/common';
import { db } from '@evalops/shared-db';
import { traceSpans, runs, type TraceSpan } from '@evalops/shared-db';
import { eq, and } from 'drizzle-orm';
import { TraceEvent, Event, ToolCall } from '@evalops/sdk';

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
      if (!tracesMap.has(span.traceId)) {
        tracesMap.set(span.traceId, []);
      }
      tracesMap.get(span.traceId)!.push(span);
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
    const attrs = rootSpan.attributes as Record<string, any>;
    const agentId = attrs.agent_id || '';
    const agentVersion = attrs.agent_version || '';
    const datasetId = attrs.dataset_id || '';
    const datasetVersion = attrs.dataset_version || '';

    // Collect events (llm.call spans)
    const events: Event[] = [];
    const llmSpans = spans.filter((s) => s.name === 'llm.call' && s.parentSpanId === rootSpan.spanId);
    for (const llmSpan of llmSpans) {
      const llmAttrs = llmSpan.attributes as Record<string, any>;
      const eventType = llmAttrs.event_type as string;
      if (eventType === 'user_message' || eventType === 'assistant_message') {
        events.push({
          type: eventType as 'user_message' | 'assistant_message',
          timestamp: llmSpan.startTime,
          content: llmAttrs.content || '',
          metadata: llmAttrs.metadata || {},
        });
      } else if (eventType === 'error') {
        events.push({
          type: 'error',
          timestamp: llmSpan.startTime,
          metadata: {
            error: llmAttrs.error || '',
            ...(llmAttrs.metadata || {}),
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
      const toolAttrs = toolCallSpan.attributes as Record<string, any>;
      
      // Find corresponding tool.result span
      const toolResultSpan = spans.find(
        (s) => s.name === 'tool.result' && s.parentSpanId === toolCallSpan.spanId,
      );

      const duration = toolCallSpan.endTime && toolCallSpan.startTime
        ? toolCallSpan.endTime.getTime() - toolCallSpan.startTime.getTime()
        : undefined;

      toolCalls.push({
        toolName: toolAttrs.tool_name || '',
        arguments: toolAttrs.arguments || {},
        timestamp: toolCallSpan.startTime,
        duration,
        result: toolResultSpan
          ? (toolResultSpan.attributes as Record<string, any>).result
          : undefined,
        error: toolResultSpan
          ? (toolResultSpan.attributes as Record<string, any>).error || undefined
          : undefined,
      });
    }

    // Calculate timings
    const startTime = rootSpan.startTime;
    const endTime = rootSpan.endTime || undefined;
    const totalDuration = endTime
      ? endTime.getTime() - startTime.getTime()
      : undefined;

    // Extract token usage and cost from root span attributes
    const promptTokens = attrs.prompt_tokens || 0;
    const completionTokens = attrs.completion_tokens || 0;
    const cost = attrs.cost || 0;

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
        toolCallDuration: attrs.tool_call_duration_ms || undefined,
        llmCallDuration: attrs.llm_call_duration_ms || undefined,
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
