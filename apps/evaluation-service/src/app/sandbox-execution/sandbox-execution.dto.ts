/**
 * Sandbox execution DTOs for custom evaluator and code execution
 */

export interface SandboxConfig {
  cpu?: string; // e.g., "1.0"
  memory?: string; // e.g., "512Mi"
  timeout?: number; // seconds
  networkPolicy?: 'allow_all' | 'deny_all' | 'restricted';
  allowedDomains?: string[]; // For restricted network policy
}

export interface ExecutionResult {
  output: unknown;
  error?: string;
  executionTime: number; // milliseconds
  resourceUsage: {
    cpu: number;
    memory: number; // bytes
  };
  exitCode: number;
  logs?: {
    stdout: string[];
    stderr: string[];
  };
}

export interface CustomEvaluatorExecutionRequest {
  evaluatorId: string;
  input: unknown;
  runId?: string;
  config?: SandboxConfig;
}

export interface CodeExecutionRequest {
  code: string;
  language: 'python' | 'javascript';
  input?: unknown;
  config?: SandboxConfig;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface EvaluationResult extends ExecutionResult {
  evaluatorId?: string;
  runId?: string;
  score?: number;
  metadata?: Record<string, unknown>;
}
