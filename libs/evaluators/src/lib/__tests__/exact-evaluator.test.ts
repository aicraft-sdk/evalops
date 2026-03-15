import { ExactEvaluator } from '../exact-evaluator';
import { EvaluationContext } from '../types';

function ctx(expected: unknown, actual: unknown): EvaluationContext {
  return { caseId: 'test-1', expected, actual };
}

describe('ExactEvaluator', () => {
  describe('basic equality', () => {
    it('passes when strings are exactly equal', () => {
      const ev = new ExactEvaluator();
      const result = ev.evaluate(ctx('hello', 'hello'));
      expect(result.passed).toBe(true);
      expect(result.score).toBe(1);
    });

    it('fails when strings differ', () => {
      const ev = new ExactEvaluator();
      const result = ev.evaluate(ctx('hello', 'world'));
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
    });

    it('case-sensitive by default', () => {
      const ev = new ExactEvaluator();
      expect(ev.evaluate(ctx('Hello', 'hello')).passed).toBe(false);
    });

    it('case-insensitive when configured', () => {
      const ev = new ExactEvaluator({ caseSensitive: false });
      expect(ev.evaluate(ctx('Hello', 'hello')).passed).toBe(true);
    });
  });

  describe('numeric tolerance', () => {
    it('passes when numbers are within tolerance', () => {
      const ev = new ExactEvaluator({ tolerance: 0.01 });
      expect(ev.evaluate(ctx(3.14, 3.145)).passed).toBe(true);
    });

    it('fails when numbers exceed tolerance', () => {
      const ev = new ExactEvaluator({ tolerance: 0.01 });
      expect(ev.evaluate(ctx(3.14, 3.2)).passed).toBe(false);
    });
  });

  describe('dot-path extraction', () => {
    it('extracts nested field from actual and expected', () => {
      const ev = new ExactEvaluator({ path: 'result.score' });
      const result = ev.evaluate(ctx(
        { result: { score: 42 } },
        { result: { score: 42 } },
      ));
      expect(result.passed).toBe(true);
    });

    it('fails when path not found in expected', () => {
      const ev = new ExactEvaluator({ path: 'missing.field' });
      const result = ev.evaluate(ctx(
        { other: 1 },
        { missing: { field: 'x' } },
      ));
      expect(result.passed).toBe(false);
    });

    it('extracts array index', () => {
      const ev = new ExactEvaluator({ path: 'items.0' });
      const result = ev.evaluate(ctx(
        { items: ['first'] },
        { items: ['first'] },
      ));
      expect(result.passed).toBe(true);
    });
  });

  describe('array and object comparison', () => {
    it('passes for deeply equal arrays', () => {
      const ev = new ExactEvaluator();
      expect(ev.evaluate(ctx([1, 2, 3], [1, 2, 3])).passed).toBe(true);
    });

    it('fails for arrays with different lengths', () => {
      const ev = new ExactEvaluator();
      expect(ev.evaluate(ctx([1, 2], [1])).passed).toBe(false);
    });

    it('passes for deeply equal objects', () => {
      const ev = new ExactEvaluator();
      expect(ev.evaluate(ctx({ a: 1, b: 2 }, { a: 1, b: 2 })).passed).toBe(true);
    });

    it('fails for objects with different keys', () => {
      const ev = new ExactEvaluator();
      expect(ev.evaluate(ctx({ a: 1 }, { a: 1, b: 2 })).passed).toBe(false);
    });
  });

  describe('result metadata', () => {
    it('returns the correct evaluator type', () => {
      const ev = new ExactEvaluator();
      expect(ev.evaluate(ctx('a', 'a')).evaluator).toBe('exact');
    });

    it('includes the caseId in the result', () => {
      const ev = new ExactEvaluator();
      const result = ev.evaluate({ caseId: 'my-case', expected: 1, actual: 1 });
      expect(result.caseId).toBe('my-case');
    });
  });
});
