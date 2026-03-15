/**
 * Trace event schema for agent execution tracking.
 * Migrated from agent-evaluation/libs/sdk.
 */

export interface Event {
  type:
    | 'user_message'
    | 'assistant_message'
    | 'tool_call'
    | 'tool_result'
    | 'error';
  timestamp: Date;
  content?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolCall {
  toolName: string;
  arguments: Record<string, unknown>;
  timestamp: Date;
  duration?: number; // ms
  result?: unknown;
  error?: string;
}

export interface TimingMetrics {
  startTime: Date;
  endTime?: Date;
  totalDuration?: number; // ms
  toolCallDuration?: number; // ms
  llmCallDuration?: number; // ms
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface TraceEvent {
  runId: string;
  agentId: string;
  agentVersion: string;
  datasetId: string;
  datasetVersion: string;
  events: Event[];
  toolCalls: ToolCall[];
  timings: TimingMetrics;
  tokens: TokenUsage;
  cost: number; // USD
}
