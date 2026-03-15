import { Injectable, Logger } from '@nestjs/common';
import { TraceEvent } from '@evalops/sdk';
import { db } from '@evalops/shared-db';
import { traceSpans, type InsertTraceSpan } from '@evalops/shared-db';
import { randomUUID } from 'crypto';

/**
 * TraceEvent Adapter Service
 *
 * Converts SDK TraceEvent format to OTLP spans for unified storage.
 *
 * Conversion strategy:
 * - Root span: "agent.run" (entire agent execution)
 * - Child spans:
 *   - "llm.call" for each event with token usage
 *   - "tool.call" for each tool call
 *   - "tool.result" for tool results
 */
@Injectable()
export class TraceEventAdapterService {
  private readonly logger = new Logger(TraceEventAdapterService.name);

  /**
   * Convert TraceEvent to OTLP spans and store them
   */
  async convertAndStore(
    traceEvent: TraceEvent,
    organizationId: string
  ): Promise<{ rootSpanId: string; traceId: string; spansCreated: number }> {
    const traceId = randomUUID();
    const rootSpanId = randomUUID();
    let spansCreated = 0;

    // Create root span: "agent.run"
    const rootSpan: InsertTraceSpan = {
      traceId,
      spanId: rootSpanId,
      parentSpanId: null,
      name: 'agent.run',
      startTime: traceEvent.timings.startTime,
      endTime: traceEvent.timings.endTime || null,
      attributes: {
        agent_id: traceEvent.agentId,
        agent_version: traceEvent.agentVersion,
        dataset_id: traceEvent.datasetId,
        dataset_version: traceEvent.datasetVersion,
        total_duration_ms: traceEvent.timings.totalDuration || null,
        tool_call_duration_ms: traceEvent.timings.toolCallDuration || null,
        llm_call_duration_ms: traceEvent.timings.llmCallDuration || null,
        prompt_tokens: traceEvent.tokens.promptTokens,
        completion_tokens: traceEvent.tokens.completionTokens,
        total_tokens: traceEvent.tokens.totalTokens,
        cost_usd: traceEvent.cost,
      },
      events: [],
      runId: traceEvent.runId,
      organizationId,
    };

    await db.insert(traceSpans).values([rootSpan]);
    spansCreated++;

    // Create spans for events (LLM calls)
    for (const event of traceEvent.events) {
      const eventSpanId = randomUUID();
      const eventSpan: InsertTraceSpan = {
        traceId,
        spanId: eventSpanId,
        parentSpanId: rootSpanId,
        name: 'llm.call',
        startTime: event.timestamp,
        endTime: event.timestamp, // Events are instantaneous
        attributes: {
          event_type: event.type,
          content: event.content || null,
          ...(event.metadata || {}),
        },
        events: [],
        runId: traceEvent.runId,
        organizationId,
      };

      await db.insert(traceSpans).values([eventSpan]);
      spansCreated++;
    }

    // Create spans for tool calls
    for (const toolCall of traceEvent.toolCalls) {
      const toolCallSpanId = randomUUID();
      const toolCallStartTime = toolCall.timestamp;
      const toolCallEndTime = toolCall.duration
        ? new Date(toolCallStartTime.getTime() + toolCall.duration)
        : toolCallStartTime;

      const toolCallSpan: InsertTraceSpan = {
        traceId,
        spanId: toolCallSpanId,
        parentSpanId: rootSpanId,
        name: 'tool.call',
        startTime: toolCallStartTime,
        endTime: toolCallEndTime,
        attributes: {
          tool_name: toolCall.toolName,
          arguments: toolCall.arguments,
          duration_ms: toolCall.duration || null,
        },
        events: [],
        runId: traceEvent.runId,
        organizationId,
      };

      await db.insert(traceSpans).values([toolCallSpan]);
      spansCreated++;

      // Create tool result span if result exists
      if (toolCall.result !== undefined || toolCall.error) {
        const toolResultSpanId = randomUUID();
        const toolResultSpan: InsertTraceSpan = {
          traceId,
          spanId: toolResultSpanId,
          parentSpanId: toolCallSpanId,
          name: 'tool.result',
          startTime: toolCallEndTime,
          endTime: toolCallEndTime,
          attributes: {
            result: toolCall.result !== undefined ? toolCall.result : null,
            error: toolCall.error || null,
          },
          events: [],
          runId: traceEvent.runId,
          organizationId,
        };

        await db.insert(traceSpans).values([toolResultSpan]);
        spansCreated++;
      }
    }

    this.logger.debug(
      `Converted TraceEvent to ${spansCreated} spans for run ${traceEvent.runId}`
    );

    return {
      rootSpanId,
      traceId,
      spansCreated,
    };
  }

  /**
   * Convert multiple TraceEvents to spans
   */
  async convertAndStoreBatch(
    traceEvents: TraceEvent[],
    organizationId: string
  ): Promise<{ totalSpansCreated: number }> {
    let totalSpansCreated = 0;

    for (const traceEvent of traceEvents) {
      try {
        const result = await this.convertAndStore(traceEvent, organizationId);
        totalSpansCreated += result.spansCreated;
      } catch (error) {
        this.logger.error(
          `Failed to convert TraceEvent for run ${traceEvent.runId}: ${error?.message}`
        );
      }
    }

    return { totalSpansCreated };
  }
}
