import { EvaluationContext, EvaluationResult, ExactEvaluatorConfig } from './types';

/**
 * Strict equality evaluator with optional dot-path extraction and numeric tolerance.
 * Migrated from agent-evaluation/libs/evaluators.
 */
export class ExactEvaluator {
  constructor(private readonly config: ExactEvaluatorConfig = {}) {}

  evaluate(context: EvaluationContext): EvaluationResult {
    const { expected, actual, caseId } = context;
    let expectedValue = expected;
    let actualValue = actual;

    if (this.config.path) {
      expectedValue = this.extractPath(expected, this.config.path);
      actualValue = this.extractPath(actual, this.config.path);
      if (expectedValue === undefined && actualValue !== undefined) {
        return {
          caseId,
          evaluator: 'exact',
          score: 0,
          passed: false,
          details: {
            expected: expectedValue,
            actual: actualValue,
            path: this.config.path,
            error: 'Path not found in expected value',
          },
        };
      }
    }

    const passed = this.compare(expectedValue, actualValue);
    return {
      caseId,
      evaluator: 'exact',
      score: passed ? 1 : 0,
      passed,
      details: {
        expected: expectedValue,
        actual: actualValue,
        path: this.config.path,
        tolerance: this.config.tolerance,
      },
    };
  }

  private extractPath(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    let value: unknown = obj;
    for (const part of parts) {
      if (value === null || value === undefined) return undefined;
      if (Array.isArray(value) && /^\d+$/.test(part)) {
        const idx = parseInt(part, 10);
        value = idx < value.length ? value[idx] : undefined;
      } else if (typeof value === 'object' && part in (value as object)) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    return value;
  }

  private compare(expected: unknown, actual: unknown): boolean {
    if (expected === null) return actual === null;
    if (expected === undefined) return actual === undefined;
    if (actual === null || actual === undefined) return false;

    if (typeof expected === 'number' && typeof actual === 'number') {
      return this.config.tolerance !== undefined
        ? Math.abs(expected - actual) <= this.config.tolerance
        : expected === actual;
    }

    if (typeof expected === 'string' && typeof actual === 'string') {
      return this.config.caseSensitive === false
        ? expected.toLowerCase() === actual.toLowerCase()
        : expected === actual;
    }

    if (Array.isArray(expected) && Array.isArray(actual)) {
      if (expected.length !== actual.length) return false;
      return expected.every((item, i) => this.compare(item, actual[i]));
    }

    if (typeof expected === 'object' && typeof actual === 'object') {
      const expKeys = Object.keys(expected as object);
      const actKeys = Object.keys(actual as object);
      if (expKeys.length !== actKeys.length) return false;
      return expKeys.every((k) =>
        this.compare(
          (expected as Record<string, unknown>)[k],
          (actual as Record<string, unknown>)[k],
        ),
      );
    }

    return expected === actual;
  }
}
