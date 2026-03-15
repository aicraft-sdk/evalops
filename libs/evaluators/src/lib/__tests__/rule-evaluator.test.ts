import { RuleEvaluator } from '../rule-evaluator';
import { EvaluationContext } from '../types';

function ctx(actual: unknown): EvaluationContext {
  return { caseId: 'test-1', expected: null, actual };
}

describe('RuleEvaluator', () => {
  describe('schema validation', () => {
    it('passes when required fields are present', () => {
      const ev = new RuleEvaluator({
        schema: { required: ['name', 'score'] },
      });
      const result = ev.evaluate(ctx({ name: 'Alice', score: 95 }));
      expect(result.passed).toBe(true);
      expect(result.score).toBe(1);
    });

    it('fails when a required field is missing', () => {
      const ev = new RuleEvaluator({
        schema: { required: ['name', 'score'] },
      });
      const result = ev.evaluate(ctx({ name: 'Alice' }));
      expect(result.passed).toBe(false);
      expect(result.details.errors).toContain('Missing required field: score');
    });

    it('fails when field type is wrong', () => {
      const ev = new RuleEvaluator({
        schema: {
          properties: { score: { type: 'number' } },
        },
      });
      const result = ev.evaluate(ctx({ score: 'not-a-number' }));
      expect(result.passed).toBe(false);
    });

    it('fails when value is not an object', () => {
      const ev = new RuleEvaluator({ schema: { required: ['a'] } });
      const result = ev.evaluate(ctx('just a string'));
      expect(result.passed).toBe(false);
    });
  });

  describe('invariant conditions', () => {
    it('passes when all invariants hold', () => {
      const ev = new RuleEvaluator({
        invariants: [
          { condition: 'score >= 0', message: 'Score must be non-negative' },
          { condition: 'score <= 100', message: 'Score must be at most 100' },
        ],
      });
      const result = ev.evaluate(ctx({ score: 85 }));
      expect(result.passed).toBe(true);
    });

    it('fails when an invariant is violated', () => {
      const ev = new RuleEvaluator({
        invariants: [
          { condition: 'score >= 0', message: 'Score must be non-negative' },
        ],
      });
      const result = ev.evaluate(ctx({ score: -1 }));
      expect(result.passed).toBe(false);
      expect(result.details.errors).toContain('Score must be non-negative');
    });

    it('checks includes operator', () => {
      const ev = new RuleEvaluator({
        invariants: [
          { condition: 'tags includes "ai"', message: 'Must include ai tag' },
        ],
      });
      expect(ev.evaluate(ctx({ tags: ['ai', 'ml'] })).passed).toBe(true);
      expect(ev.evaluate(ctx({ tags: ['ml'] })).passed).toBe(false);
    });
  });

  describe('partial scoring', () => {
    it('deducts 0.1 per error, floor at 0', () => {
      const ev = new RuleEvaluator({
        schema: { required: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'] },
      });
      const result = ev.evaluate(ctx({}));
      // 11 errors → 1 - 1.1 = clamp to 0
      expect(result.score).toBe(0);
      expect(result.passed).toBe(false);
    });

    it('returns partial score for a few errors', () => {
      const ev = new RuleEvaluator({
        schema: { required: ['a', 'b'] },
      });
      // Provide only 'a', missing 'b' (1 error)
      const result = ev.evaluate(ctx({ a: 1 }));
      expect(result.score).toBeCloseTo(0.9, 5);
    });
  });

  describe('metadata', () => {
    it('returns evaluator type as "rule"', () => {
      const ev = new RuleEvaluator();
      expect(ev.evaluate(ctx({})).evaluator).toBe('rule');
    });
  });
});
