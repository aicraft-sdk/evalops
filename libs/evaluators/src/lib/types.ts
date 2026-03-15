/**
 * Shared types for the evalops evaluators library.
 * Migrated from agent-evaluation/libs/evaluators.
 */

export type EvaluatorType = 'exact' | 'rule' | 'llm-judge';

export interface EvaluationResult {
  caseId: string;
  evaluator: EvaluatorType;
  score: number; // 0–1
  passed: boolean;
  details: Record<string, unknown>;
}

export interface EvaluationContext {
  caseId: string;
  expected: unknown;
  actual: unknown;
  metadata?: Record<string, unknown>;
}

export interface ExactEvaluatorConfig {
  /** Dot-separated path to extract from the actual/expected value before comparing. */
  path?: string;
  /** Numeric tolerance for floating-point comparisons. */
  tolerance?: number;
  /** Default true. Set false for case-insensitive string comparison. */
  caseSensitive?: boolean;
}

export interface RuleEvaluatorConfig {
  /** JSON-Schema-lite object to validate the actual value against. */
  schema?: Record<string, unknown>;
  /** List of invariants that must hold. */
  invariants?: Array<{ condition: string; message: string }>;
}

export interface LLMJudgeEvaluatorConfig {
  provider: string;
  model: string;
  prompt?: string;
  temperature?: number;
}
