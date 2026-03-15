import { Aggregator } from '../aggregator';
import { EvaluationResult } from '../types';

function makeResult(
  evaluator: 'exact' | 'rule' | 'llm-judge',
  score: number,
  passed: boolean,
  caseId = 'case-1',
): EvaluationResult {
  return { caseId, evaluator, score, passed, details: {} };
}

describe('Aggregator', () => {
  let aggregator: Aggregator;

  beforeEach(() => {
    aggregator = new Aggregator();
  });

  describe('aggregate', () => {
    it('returns zero metrics for an empty result set', () => {
      const metrics = aggregator.aggregate([]);
      expect(metrics.totalCases).toBe(0);
      expect(metrics.passedCases).toBe(0);
      expect(metrics.averageScore).toBe(0);
      expect(metrics.passRate).toBe(0);
      expect(metrics.byEvaluator).toEqual({});
    });

    it('calculates pass rate correctly', () => {
      const results = [
        makeResult('exact', 1, true, 'c1'),
        makeResult('exact', 0, false, 'c2'),
        makeResult('exact', 1, true, 'c3'),
        makeResult('exact', 1, true, 'c4'),
      ];
      const metrics = aggregator.aggregate(results);
      expect(metrics.totalCases).toBe(4);
      expect(metrics.passedCases).toBe(3);
      expect(metrics.failedCases).toBe(1);
      expect(metrics.passRate).toBeCloseTo(0.75);
    });

    it('calculates the average score', () => {
      const results = [
        makeResult('exact', 1, true),
        makeResult('exact', 0.5, false),
        makeResult('exact', 0, false),
      ];
      const metrics = aggregator.aggregate(results);
      expect(metrics.averageScore).toBeCloseTo(0.5);
    });

    it('groups results by evaluator', () => {
      const results = [
        makeResult('exact', 1, true, 'c1'),
        makeResult('exact', 0, false, 'c2'),
        makeResult('rule', 1, true, 'c3'),
      ];
      const metrics = aggregator.aggregate(results);
      expect(metrics.byEvaluator['exact'].total).toBe(2);
      expect(metrics.byEvaluator['exact'].passed).toBe(1);
      expect(metrics.byEvaluator['rule'].total).toBe(1);
      expect(metrics.byEvaluator['rule'].passed).toBe(1);
    });

    it('computes per-evaluator average score', () => {
      const results = [
        makeResult('exact', 0.8, true, 'c1'),
        makeResult('exact', 0.6, false, 'c2'),
      ];
      const metrics = aggregator.aggregate(results);
      expect(metrics.byEvaluator['exact'].averageScore).toBeCloseTo(0.7);
    });
  });

  describe('determinePassFail', () => {
    it('returns true when passRate >= threshold', () => {
      const metrics = aggregator.aggregate([
        makeResult('exact', 1, true, 'c1'),
        makeResult('exact', 1, true, 'c2'),
        makeResult('exact', 1, true, 'c3'),
        makeResult('exact', 1, true, 'c4'),
        makeResult('exact', 0, false, 'c5'),
      ]);
      // passRate = 0.8 → meets default threshold
      expect(aggregator.determinePassFail(metrics)).toBe(true);
    });

    it('returns false when passRate < threshold', () => {
      const metrics = aggregator.aggregate([
        makeResult('exact', 0, false, 'c1'),
        makeResult('exact', 0, false, 'c2'),
      ]);
      expect(aggregator.determinePassFail(metrics)).toBe(false);
    });

    it('accepts a custom threshold', () => {
      const metrics = aggregator.aggregate([
        makeResult('exact', 1, true),
      ]);
      expect(aggregator.determinePassFail(metrics, 1.0)).toBe(true);
      expect(aggregator.determinePassFail(metrics, 1.01)).toBe(false);
    });
  });
});
