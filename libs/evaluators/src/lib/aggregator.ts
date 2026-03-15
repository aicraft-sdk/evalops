import { EvaluationResult } from './types';

export interface AggregatedMetrics {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  averageScore: number;
  passRate: number;
  byEvaluator: Record<string, { total: number; passed: number; averageScore: number }>;
}

/**
 * Aggregate evaluation results across cases.
 * Migrated from agent-evaluation/libs/evaluators.
 */
export class Aggregator {
  aggregate(results: EvaluationResult[]): AggregatedMetrics {
    if (results.length === 0) {
      return {
        totalCases: 0,
        passedCases: 0,
        failedCases: 0,
        averageScore: 0,
        passRate: 0,
        byEvaluator: {},
      };
    }

    const passedCases = results.filter((r) => r.passed).length;
    const averageScore = results.reduce((s, r) => s + r.score, 0) / results.length;
    const byEvaluator: AggregatedMetrics['byEvaluator'] = {};

    for (const r of results) {
      if (!byEvaluator[r.evaluator]) {
        byEvaluator[r.evaluator] = { total: 0, passed: 0, averageScore: 0 };
      }
      byEvaluator[r.evaluator].total++;
      if (r.passed) byEvaluator[r.evaluator].passed++;
    }

    for (const key of Object.keys(byEvaluator)) {
      const subset = results.filter((r) => r.evaluator === key);
      byEvaluator[key].averageScore =
        subset.reduce((s, r) => s + r.score, 0) / subset.length;
    }

    return {
      totalCases: results.length,
      passedCases,
      failedCases: results.length - passedCases,
      averageScore,
      passRate: passedCases / results.length,
      byEvaluator,
    };
  }

  /**
   * Returns true if passRate >= threshold (default 0.8).
   */
  determinePassFail(metrics: AggregatedMetrics, threshold = 0.8): boolean {
    return metrics.passRate >= threshold;
  }
}
