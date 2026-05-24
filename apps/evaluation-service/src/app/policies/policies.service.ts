import {
  Injectable,
  Logger,
  Inject,
  forwardRef,
  Optional,
} from '@nestjs/common';
import { RunsRepository } from '@evalops/shared-db';
import {
  Policy,
  Run,
  PolicyViolation as DBPolicyViolation,
} from '@evalops/shared-db';
import { ReviewsService } from '../reviews/reviews.service';

export interface PolicyResult {
  decision: 'pass' | 'warn' | 'fail';
  violations: PolicyViolation[];
  evidence: Record<string, unknown>;
  score: number;
  passedRules: number;
  totalRules: number;
}

export interface PolicyViolation {
  policyId: string;
  policyName: string;
  ruleIndex: number;
  ruleName: string;
  severity: 'warn' | 'fail' | 'error';
  message: string;
  evidence: Record<string, unknown>;
  actualValue?: number;
  expectedThreshold?: number | [number, number];
  baselineComparison?: BaselineComparison;
}

export interface BaselineComparison {
  hasRegression: boolean;
  regressionThreshold: number;
  baselineValue: number;
  currentValue: number;
  percentageChange: number;
  isSignificant: boolean;
  confidenceLevel: number;
}

export interface PolicyRule {
  id: string;
  name: string;
  type: string;
  metric: string;
  operator?: 'greater_than' | 'less_than' | 'equals' | 'not_equals' | 'between';
  threshold?: number | [number, number];
  severity: 'warn' | 'fail' | 'error';
  description: string;
  enabled: boolean;
}

@Injectable()
export class PoliciesService {
  private readonly logger = new Logger(PoliciesService.name);

  constructor(
    private runsRepository: RunsRepository,
    @Optional()
    @Inject(forwardRef(() => ReviewsService))
    private reviewsService?: ReviewsService
  ) {}

  async evaluateRun(runId: string): Promise<PolicyResult> {
    const run = await this.runsRepository.findById(runId);
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    const activePolicies = await this.runsRepository.findActivePolicies(
      run.organizationId
    );

    // Get baseline for comparison
    const baseline = await this.runsRepository.findActiveBaseline(
      run.evalSpecId
    );

    return this.evaluatePolicies(
      activePolicies,
      (run.metrics as Record<string, unknown>) || {},
      (baseline?.metrics as Record<string, unknown>) || {},
      run
    );
  }

  async evaluatePolicies(
    policies: Policy[],
    metrics: Record<string, unknown>,
    baselineMetrics?: Record<string, unknown>,
    run?: Run
  ): Promise<PolicyResult> {
    const violations: PolicyViolation[] = [];
    let overallDecision: 'pass' | 'warn' | 'fail' = 'pass';
    let totalRules = 0;
    let passedRules = 0;

    for (const policy of policies) {
      const policyRules = policy.rules;
      let rules: PolicyRule[] = [];

      if (Array.isArray(policyRules)) {
        rules = policyRules as PolicyRule[];
      } else if (policyRules && typeof policyRules === 'object') {
        rules = this.convertRulesToArray(policyRules as Record<string, unknown>);
      }

      totalRules += rules.filter((r) => r.enabled).length;

      for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex++) {
        const rule = rules[ruleIndex];
        if (!rule.enabled) continue;

        const violation = await this.evaluateRule(
          rule,
          metrics,
          baselineMetrics,
          policy.id,
          policy.name,
          ruleIndex
        );

        if (violation) {
          violations.push(violation);

          if (violation.severity === 'error' || violation.severity === 'fail') {
            overallDecision = 'fail';
          } else if (
            violation.severity === 'warn' &&
            overallDecision === 'pass'
          ) {
            overallDecision = 'warn';
          }

          if (run) {
            const createdViolation =
              await this.runsRepository.createPolicyViolation({
                runId: run.id,
                policyId: policy.id,
                ruleIndex,
                severity: violation.severity,
                message: violation.message,
                evidence: violation.evidence,
                organizationId: policy.organizationId,
              });

            // Auto-create review queue item for fail/error violations
            if (
              (violation.severity === 'fail' ||
                violation.severity === 'error') &&
              this.reviewsService
            ) {
              try {
                await this.reviewsService.createQueueItemFromPolicyViolation(
                  run.id,
                  createdViolation.id,
                  policy.organizationId,
                  run.triggeredBy // Use run's triggeredBy as creator
                );
              } catch (error) {
                // Log but don't fail policy evaluation if queue creation fails
                this.logger.warn(
                  `Failed to create review queue item for violation ${createdViolation.id}:`,
                  error
                );
              }
            }
          }
        } else {
          passedRules++;
        }
      }
    }

    const score =
      totalRules > 0 ? Math.round((passedRules / totalRules) * 100) : 100;

    if (score < 50) {
      overallDecision = 'fail';
    } else if (score < 80 && overallDecision === 'pass') {
      overallDecision = 'warn';
    }

    return {
      decision: overallDecision,
      violations,
      evidence: { metrics, baselineMetrics } as Record<string, unknown>,
      score,
      passedRules,
      totalRules,
    };
  }

  private convertRulesToArray(rulesObject: Record<string, unknown>): PolicyRule[] {
    const rules: PolicyRule[] = [];

    if (!rulesObject || typeof rulesObject !== 'object') {
      return rules;
    }

    for (const [key, value] of Object.entries(rulesObject)) {
      if (value && typeof value === 'object' && 'type' in value) {
        const v = value as Record<string, unknown>;
        rules.push({
          id: key,
          name: (v['name'] as string) || key,
          type: (v['type'] as string) || 'threshold',
          metric: (v['metric'] as string) || key,
          operator: v['operator'] as PolicyRule['operator'],
          threshold: v['threshold'] as PolicyRule['threshold'],
          severity: (v['severity'] as PolicyRule['severity']) || 'warn',
          description: (v['description'] as string) || '',
          enabled: v['enabled'] !== false,
        });
      }
    }

    return rules;
  }

  private async evaluateRule(
    rule: PolicyRule,
    metrics: Record<string, unknown>,
    baselineMetrics?: Record<string, unknown>,
    policyId?: string,
    policyName?: string,
    ruleIndex?: number
  ): Promise<PolicyViolation | null> {
    const metricValue = this.getMetricValue(metrics, rule.metric);

    if (metricValue === undefined || metricValue === null) {
      if (rule.severity === 'error') {
        return {
          policyId: policyId || '',
          policyName: policyName || '',
          ruleIndex: ruleIndex || 0,
          ruleName: rule.name,
          severity: 'error',
          message: `Metric ${rule.metric} not found in run results`,
          evidence: { metric: rule.metric, metrics },
          actualValue: undefined,
        };
      }
      return null;
    }

    const violation = this.checkThreshold(rule, metricValue);

    if (violation) {
      violation.policyId = policyId || '';
      violation.policyName = policyName || '';
      violation.ruleIndex = ruleIndex || 0;
      violation.ruleName = rule.name;
      violation.actualValue = metricValue;
      violation.expectedThreshold = rule.threshold;

      if (baselineMetrics) {
        const baselineValue = this.getMetricValue(baselineMetrics, rule.metric);
        if (baselineValue !== undefined && baselineValue !== null) {
          violation.baselineComparison = this.compareWithBaseline(
            metricValue,
            baselineValue,
            rule
          );
        }
      }
    }

    return violation;
  }

  private getMetricValue(metrics: Record<string, unknown>, metricPath: string): number | undefined {
    const parts = metricPath.split('.');
    let value: unknown = metrics;

    for (const part of parts) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = (value as Record<string, unknown>)[part];
    }

    if (typeof value === 'number') {
      return value;
    }

    return undefined;
  }

  private checkThreshold(
    rule: PolicyRule,
    value: number
  ): PolicyViolation | null {
    if (!rule.threshold) {
      return null;
    }

    const threshold = rule.threshold;
    const operator = rule.operator || 'greater_than';

    let isViolation = false;
    let message = '';

    switch (operator) {
      case 'greater_than':
        if (Array.isArray(threshold)) {
          isViolation = value > threshold[1];
          message = `Value ${value} exceeds maximum threshold ${threshold[1]}`;
        } else {
          isViolation = value > threshold;
          message = `Value ${value} exceeds threshold ${threshold}`;
        }
        break;

      case 'less_than':
        if (Array.isArray(threshold)) {
          isViolation = value < threshold[0];
          message = `Value ${value} below minimum threshold ${threshold[0]}`;
        } else {
          isViolation = value < threshold;
          message = `Value ${value} below threshold ${threshold}`;
        }
        break;

      case 'between':
        if (Array.isArray(threshold) && threshold.length === 2) {
          isViolation = value < threshold[0] || value > threshold[1];
          message = `Value ${value} is outside range [${threshold[0]}, ${threshold[1]}]`;
        }
        break;

      case 'equals':
        isViolation = value !== threshold;
        message = `Value ${value} does not equal ${threshold}`;
        break;

      case 'not_equals':
        isViolation = value === threshold;
        message = `Value ${value} equals ${threshold}`;
        break;
    }

    if (isViolation) {
      return {
        policyId: '',
        policyName: '',
        ruleIndex: 0,
        ruleName: rule.name,
        severity: rule.severity,
        message,
        evidence: { value, threshold, operator },
        actualValue: value,
        expectedThreshold: threshold,
      };
    }

    return null;
  }

  private compareWithBaseline(
    currentValue: number,
    baselineValue: number,
    rule: PolicyRule
  ): BaselineComparison {
    const percentageChange =
      ((currentValue - baselineValue) / baselineValue) * 100;
    const regressionThreshold = 10; // Default 10% regression threshold
    const hasRegression = Math.abs(percentageChange) > regressionThreshold;
    const isSignificant = Math.abs(percentageChange) > 20; // 20% is significant

    return {
      hasRegression,
      regressionThreshold,
      baselineValue,
      currentValue,
      percentageChange,
      isSignificant,
      confidenceLevel: isSignificant ? 0.95 : 0.8,
    };
  }

  async getActivePolicies(organizationId: string): Promise<Policy[]> {
    return this.runsRepository.findActivePolicies(organizationId);
  }
}
