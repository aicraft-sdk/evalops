/**
 * TypeScript interfaces for the AgentMD domain-specific language.
 * Migrated from agent-evaluation/libs/agent-md.
 *
 * AgentMD is a YAML-based markdown format for defining AI agent
 * configuration, tools, model settings, and operational policies.
 */

export interface AgentMetadata {
  name: string;
  version: string;
  description?: string;
  author?: string;
  tags?: string[];
}

export interface ToolPolicy {
  allowed?: boolean;
  requireConfirmation?: boolean;
  rateLimit?: number; // calls per minute
  conditions?: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters?: Record<string, unknown>; // JSON Schema fragment
  policy?: ToolPolicy;
}

export interface ModelConfiguration {
  provider: string; // e.g. 'openai', 'anthropic', 'azure'
  model: string; // e.g. 'gpt-4o', 'claude-opus-4-6'
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
}

export interface AgentMD {
  metadata: AgentMetadata;
  model: ModelConfiguration;
  systemPrompt?: string;
  tools?: ToolDefinition[];
  policies?: Record<string, unknown>;
}

export interface ParseResult {
  agentMD: AgentMD;
  rawContent: string;
  parseErrors?: string[];
}
