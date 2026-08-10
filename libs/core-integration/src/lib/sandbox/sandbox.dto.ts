/**
 * Sandbox DTOs and interfaces for OpenSandbox integration
 */

export interface SandboxConfig {
  cpu?: string; // e.g., "1.0"
  memory?: string; // e.g., "512Mi"
  timeout?: number; // seconds
  networkPolicy?: 'allow_all' | 'deny_all' | 'restricted';
  allowedDomains?: string[]; // For restricted network policy
}

export interface ExecutionRequest {
  code: string;
  language: 'python' | 'javascript';
  input?: unknown;
  timeout?: number; // Override default timeout
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

export enum SandboxStatus {
  CREATING = 'creating',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DELETED = 'deleted',
  TIMEOUT = 'timeout',
}

export interface SandboxInfo {
  id: string;
  status: SandboxStatus;
  createdAt: Date;
  config: SandboxConfig;
}

export interface CreateSandboxRequest {
  config?: SandboxConfig;
}

export interface CreateSandboxResponse {
  sandboxId: string;
  status: SandboxStatus;
}

export interface ExecuteCodeRequest {
  sandboxId: string;
  code: string;
  language: 'python' | 'javascript';
  input?: unknown;
}

export interface SandboxStatusResponse {
  sandboxId: string;
  status: SandboxStatus;
  createdAt: Date;
  resourceUsage?: {
    cpu: number;
    memory: number;
  };
}
