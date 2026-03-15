import { EvaluationContext, EvaluationResult, RuleEvaluatorConfig } from './types';

/**
 * Schema validation + invariant checking evaluator.
 * Migrated from agent-evaluation/libs/evaluators.
 */
export class RuleEvaluator {
  constructor(private readonly config: RuleEvaluatorConfig = {}) {}

  evaluate(context: EvaluationContext): EvaluationResult {
    const { actual, caseId } = context;
    const errors: string[] = [];

    if (this.config.schema) {
      errors.push(...this.validateSchema(actual, this.config.schema));
    }
    if (this.config.invariants) {
      errors.push(...this.checkInvariants(actual, this.config.invariants));
    }

    // Deduct 0.1 per error, floor at 0
    const score = Math.max(0, 1 - errors.length * 0.1);

    return {
      caseId,
      evaluator: 'rule',
      score,
      passed: errors.length === 0,
      details: { errors },
    };
  }

  private validateSchema(value: unknown, schema: Record<string, unknown>): string[] {
    const errors: string[] = [];
    if (typeof value !== 'object' || value === null) {
      return ['Value must be an object'];
    }
    const obj = value as Record<string, unknown>;

    const required = schema['required'];
    if (Array.isArray(required)) {
      for (const field of required) {
        if (!(field in obj)) errors.push(`Missing required field: ${field}`);
      }
    }

    const properties = schema['properties'];
    if (properties && typeof properties === 'object') {
      for (const [field, fieldSchema] of Object.entries(
        properties as Record<string, { type?: string }>,
      )) {
        if (!(field in obj)) continue;
        const fieldType = fieldSchema?.type;
        const v = obj[field];
        if (fieldType === 'string' && typeof v !== 'string')
          errors.push(`Field '${field}' must be a string`);
        else if (fieldType === 'number' && typeof v !== 'number')
          errors.push(`Field '${field}' must be a number`);
        else if (fieldType === 'boolean' && typeof v !== 'boolean')
          errors.push(`Field '${field}' must be a boolean`);
        else if (fieldType === 'array' && !Array.isArray(v))
          errors.push(`Field '${field}' must be an array`);
        else if (
          fieldType === 'object' &&
          (typeof v !== 'object' || v === null || Array.isArray(v))
        )
          errors.push(`Field '${field}' must be an object`);
      }
    }

    return errors;
  }

  private checkInvariants(
    value: unknown,
    invariants: Array<{ condition: string; message: string }>,
  ): string[] {
    const errors: string[] = [];
    for (const { condition, message } of invariants) {
      if (!this.evalCondition(value, condition)) errors.push(message);
    }
    return errors;
  }

  private evalCondition(value: unknown, condition: string): boolean {
    try {
      const m = condition.match(
        /^([\w.]+)\s*(===|!==|>=|<=|>|<|includes)\s*(.+)$/,
      );
      if (!m) return false;
      const [, field, op, rawExpected] = m;
      const actual = this.extractField(value, field);
      const expected = this.parseValue(rawExpected.trim());

      switch (op) {
        case '===': return actual === expected;
        case '!==': return actual !== expected;
        case '>': return Number(actual) > Number(expected);
        case '<': return Number(actual) < Number(expected);
        case '>=': return Number(actual) >= Number(expected);
        case '<=': return Number(actual) <= Number(expected);
        case 'includes':
          return (
            (Array.isArray(actual) || typeof actual === 'string') &&
            (actual as string | unknown[]).includes(expected as never)
          );
        default: return false;
      }
    } catch {
      return false;
    }
  }

  private extractField(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    let v: unknown = obj;
    for (const part of parts) {
      if (v === null || v === undefined) return undefined;
      if (Array.isArray(v) && /^\d+$/.test(part)) {
        v = v[parseInt(part, 10)];
      } else if (typeof v === 'object' && part in (v as object)) {
        v = (v as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    return v;
  }

  private parseValue(raw: string): unknown {
    if (/^-?\d+\.?\d*$/.test(raw)) return parseFloat(raw);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))
    )
      return raw.slice(1, -1);
    return raw;
  }
}
