import { storage } from "../storage";
import type { Policy, Run, Baseline, PolicyViolation as DBPolicyViolation } from "@shared/schema";

export interface PolicyResult {
  decision: 'pass' | 'warn' | 'fail';
  violations: PolicyViolation[];
  evidence: any;
  score: number; // 0-100 quality score
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
  evidence: any;
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

class PolicyEngine {
  async evaluateRun(runId: string): Promise<PolicyResult> {
    const run = await storage.getRun(runId);
    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    const evalSpec = await storage.getEvalSpec(run.evalSpecId);
    if (!evalSpec) {
      throw new Error(`Evaluation spec not found for run ${runId}`);
    }

    // Get applicable policies
    const policies = await storage.getPolicies(run.organizationId);
    const activePolicies = policies.filter(p => p.isActive);

    // Get baseline for comparison
    const baseline = await storage.getLatestBaseline(run.evalSpecId);

    return this.evaluatePolicies(activePolicies, run.metrics, baseline?.metrics, run);
  }

  async evaluatePolicies(
    policies: Policy[],
    metrics: any,
    baselineMetrics?: any,
    run?: Run
  ): Promise<PolicyResult> {
    const violations: PolicyViolation[] = [];
    let overallDecision: 'pass' | 'warn' | 'fail' = 'pass';
    let totalRules = 0;
    let passedRules = 0;

    for (const policy of policies) {
      // Handle policy rules - they might be an object or array
      const policyRules = policy.rules;
      let rules: PolicyRule[] = [];
      
      if (Array.isArray(policyRules)) {
        rules = policyRules;
      } else if (policyRules && typeof policyRules === 'object') {
        // Convert object-based rules to array format for evaluation
        rules = this.convertRulesToArray(policyRules);
      }
      
      totalRules += rules.filter(r => r.enabled).length;
      
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
          
          // Update overall decision based on severity hierarchy
          if (violation.severity === 'error' || violation.severity === 'fail') {
            overallDecision = 'fail';
          } else if (violation.severity === 'warn' && overallDecision === 'pass') {
            overallDecision = 'warn';
          }

          // Store violation in database if run provided
          if (run) {
            await storage.createPolicyViolation({
              runId: run.id,
              policyId: policy.id,
              ruleIndex,
              severity: violation.severity,
              message: violation.message,
              evidence: violation.evidence,
              organizationId: policy.organizationId,
            });
          }
        } else {
          passedRules++;
        }
      }
    }

    // Calculate quality score
    const score = totalRules > 0 ? Math.round((passedRules / totalRules) * 100) : 100;

    // Adjust decision based on score thresholds
    if (score < 50) {
      overallDecision = 'fail';
    } else if (score < 80 && overallDecision === 'pass') {
      overallDecision = 'warn';
    }

    return {
      decision: overallDecision,
      violations,
      evidence: { metrics, baselineMetrics },
      score,
      passedRules,
      totalRules,
    };
  }

  private convertRulesToArray(rulesObject: any): PolicyRule[] {
    const rules: PolicyRule[] = [];
    
    // Handle threshold rules
    if (rulesObject.passThreshold || rulesObject.warnThreshold) {
      if (rulesObject.passThreshold) {
        rules.push({
          type: 'threshold',
          metric: 'quality_score',
          operator: '>=',
          threshold: rulesObject.passThreshold,
          severity: 'fail',
          enabled: rulesObject.enabled !== false,
        });
      }
      if (rulesObject.warnThreshold) {
        rules.push({
          type: 'threshold',
          metric: 'quality_score',
          operator: '>=',
          threshold: rulesObject.warnThreshold,
          severity: 'warn',
          enabled: rulesObject.enabled !== false,
        });
      }
    }
    
    // Handle cost limits
    if (rulesObject.costLimits) {
      if (rulesObject.costLimits.maxCostPerRun) {
        rules.push({
          type: 'cost_limit',
          metric: 'total_cost',
          operator: '<=',
          threshold: rulesObject.costLimits.maxCostPerRun,
          severity: 'fail',
          enabled: rulesObject.enabled !== false,
        });
      }
      if (rulesObject.costLimits.maxCostPerSample) {
        rules.push({
          type: 'cost_limit',
          metric: 'cost_per_sample',
          operator: '<=',
          threshold: rulesObject.costLimits.maxCostPerSample,
          severity: 'fail',
          enabled: rulesObject.enabled !== false,
        });
      }
    }
    
    // Handle performance SLOs
    if (rulesObject.performanceSLOs) {
      if (rulesObject.performanceSLOs.maxLatency) {
        rules.push({
          type: 'latency_slo',
          threshold: rulesObject.performanceSLOs.maxLatency,
          severity: 'fail',
          name: 'Latency SLO',
          description: `P95 latency must be under ${rulesObject.performanceSLOs.maxLatency}ms`,
          enabled: rulesObject.enabled !== false,
        });
      }
      if (rulesObject.performanceSLOs.maxDuration) {
        rules.push({
          type: 'performance',
          metric: 'duration',
          operator: '<=',
          threshold: rulesObject.performanceSLOs.maxDuration,
          severity: 'fail',
          name: 'Duration SLO',
          description: `Total duration must be under ${rulesObject.performanceSLOs.maxDuration}s`,
          enabled: rulesObject.enabled !== false,
        });
      }
    }
    
    return rules;
  }

  private async evaluateRule(
    rule: PolicyRule,
    metrics: any,
    baselineMetrics: any,
    policyId: string,
    policyName: string,
    ruleIndex: number
  ): Promise<PolicyViolation | null> {
    try {
      switch (rule.type) {
        case 'threshold':
          return this.evaluateThresholdRule(rule, metrics, policyId, policyName, ruleIndex);
        
        case 'baseline_comparison':
          return this.evaluateBaselineRule(rule, metrics, baselineMetrics, policyId, policyName, ruleIndex);
        
        case 'cost_limit':
          return this.evaluateCostRule(rule, metrics, policyId, policyName, ruleIndex);
        
        case 'latency_slo':
          return this.evaluateLatencyRule(rule, metrics, policyId, policyName, ruleIndex);
        
        case 'performance':
          return this.evaluatePerformanceRule(rule, metrics, policyId, policyName, ruleIndex);
        
        case 'schema_validation':
          return this.evaluateSchemaRule(rule, metrics, policyId, policyName, ruleIndex);
        
        case 'quality_gate':
          return this.evaluateQualityGateRule(rule, metrics, baselineMetrics, policyId, policyName, ruleIndex);
        
        default:
          console.warn(`Unknown rule type: ${rule.type}`);
          return null;
      }
    } catch (error) {
      console.error(`Error evaluating rule ${rule.type}:`, error);
      return null;
    }
  }

  private evaluateThresholdRule(
    rule: PolicyRule,
    metrics: any,
    policyId: string,
    policyName: string,
    ruleIndex: number
  ): PolicyViolation | null {
    const { metric, operator, threshold, severity, name, description } = rule;
    const value = this.getMetricValue(metrics, metric);
    
    if (value === null || value === undefined) {
      return null;
    }

    let violated = false;
    
    switch (operator) {
      case 'greater_than':
        violated = value <= threshold;
        break;
      case 'less_than':
        violated = value >= threshold;
        break;
      case 'equals':
        violated = value !== threshold;
        break;
      default:
        return null;
    }

    if (violated) {
      return {
        policyId,
        policyName,
        ruleIndex,
        ruleName: name,
        severity,
        message: description || `${metric} ${operator} ${threshold} (actual: ${value})`,
        evidence: { metric, value, threshold, operator },
        actualValue: value,
        expectedThreshold: threshold
      };
    }

    return null;
  }

  private evaluateBaselineRule(
    rule: PolicyRule,
    metrics: any,
    baselineMetrics: any,
    policyId: string,
    policyName: string,
    ruleIndex: number
  ): PolicyViolation | null {
    if (!baselineMetrics) {
      return null; // No baseline to compare against
    }

    const { metric, threshold, severity, name, description } = rule;
    const comparison = 'relative'; // Default to relative comparison
    const currentValue = this.getMetricValue(metrics, metric);
    const baselineValue = this.getMetricValue(baselineMetrics, metric);
    
    if (currentValue === null || baselineValue === null) {
      return null;
    }

    let violated = false;
    let actualDelta: number;

    if (comparison === 'relative') {
      actualDelta = (currentValue - baselineValue) / baselineValue;
      violated = Math.abs(actualDelta) > threshold;
    } else {
      actualDelta = currentValue - baselineValue;
      violated = Math.abs(actualDelta) > threshold;
    }

    if (violated) {
      const baselineComparison: BaselineComparison = {
        hasRegression: violated,
        regressionThreshold: threshold as number,
        baselineValue,
        currentValue,
        percentageChange: actualDelta * 100,
        isSignificant: Math.abs(actualDelta) > (threshold as number),
        confidenceLevel: 0.95
      };

      return {
        policyId,
        policyName,
        ruleIndex,
        ruleName: name,
        severity,
        message: description || `${metric} drift from baseline: ${(actualDelta * 100).toFixed(1)}% (threshold: ${((threshold as number) * 100).toFixed(1)}%)`,
        evidence: { metric, currentValue, baselineValue, actualDelta, threshold },
        actualValue: currentValue,
        expectedThreshold: threshold,
        baselineComparison
      };
    }

    return null;
  }

  private evaluateCostRule(
    rule: PolicyRule,
    metrics: any,
    policyId: string,
    policyName: string,
    ruleIndex: number
  ): PolicyViolation | null {
    const { threshold: maxCost, severity, name, description } = rule;
    const cost = metrics.cost?.mean || metrics.cost;
    
    if (cost > maxCost) {
      return {
        policyId,
        policyName,
        ruleIndex,
        ruleName: name,
        severity,
        message: description || `Cost exceeds limit: $${cost.toFixed(4)} > $${maxCost}`,
        evidence: { cost, maxCost },
        actualValue: cost,
        expectedThreshold: maxCost
      };
    }

    return null;
  }

  private evaluateLatencyRule(
    rule: PolicyRule,
    metrics: any,
    policyId: string,
    policyName: string,
    ruleIndex: number
  ): PolicyViolation | null {
    const { threshold: maxLatency, severity, name, description } = rule;
    const percentile = 95; // Default percentile
    const latencyKey = `latencyP${percentile}`;
    const latency = metrics[latencyKey];
    
    if (latency > maxLatency) {
      return {
        policyId,
        policyName,
        ruleIndex,
        ruleName: name,
        severity,
        message: description || `P${percentile} latency exceeds SLO: ${latency}ms > ${maxLatency}ms`,
        evidence: { latency, maxLatency, percentile },
        actualValue: latency,
        expectedThreshold: maxLatency
      };
    }

    return null;
  }

  private evaluatePerformanceRule(
    rule: PolicyRule,
    metrics: any,
    policyId: string,
    policyName: string,
    ruleIndex: number
  ): PolicyViolation | null {
    const { metric, operator, threshold, severity, name, description } = rule;
    const value = this.getMetricValue(metrics, metric);
    
    if (value === null || value === undefined) {
      return null;
    }

    let violated = false;
    let operatorSymbol = operator || '<=';
    
    switch (operatorSymbol) {
      case '<=':
        violated = value > threshold;
        break;
      case '>=':
        violated = value < threshold;
        break;
      case '<':
        violated = value >= threshold;
        break;
      case '>':
        violated = value <= threshold;
        break;
      case 'less_than':
        violated = value >= threshold;
        break;
      case 'greater_than':
        violated = value <= threshold;
        break;
      default:
        return null;
    }

    if (violated) {
      const metricName = metric === 'avg_latency' ? 'Average latency' : 
                        metric === 'total_duration' ? 'Total duration' : metric;
      const unit = metric === 'avg_latency' ? 'ms' : 's';
      
      return {
        policyId,
        policyName,
        ruleIndex,
        ruleName: name || `Performance: ${metricName}`,
        severity,
        message: description || `${metricName} exceeds limit: ${value}${unit} ${operatorSymbol} ${threshold}${unit}`,
        evidence: { metric, value, threshold, operator: operatorSymbol },
        actualValue: value,
        expectedThreshold: threshold
      };
    }

    return null;
  }

  private evaluateSchemaRule(
    rule: PolicyRule,
    metrics: any,
    policyId: string,
    policyName: string,
    ruleIndex: number
  ): PolicyViolation | null {
    const { threshold: requiredValidity = 1.0, severity, name, description } = rule;
    const validity = this.getMetricValue(metrics, 'schemaValidity');
    
    if (validity !== null && validity < requiredValidity) {
      return {
        policyId,
        policyName,
        ruleIndex,
        ruleName: name,
        severity,
        message: description || `Schema validation below requirement: ${(validity * 100).toFixed(1)}% < ${(requiredValidity * 100).toFixed(1)}%`,
        evidence: { validity, requiredValidity },
        actualValue: validity,
        expectedThreshold: requiredValidity
      };
    }

    return null;
  }

  private getMetricValue(metrics: any, metricPath: string): number | null {
    const parts = metricPath.split('.');
    let value = metrics;
    
    for (const part of parts) {
      value = value?.[part];
    }
    
    // Handle both statistical metrics and direct values
    if (typeof value === 'object' && 'mean' in value) {
      return value.mean;
    }
    
    return typeof value === 'number' ? value : null;
  }

  private evaluateQualityGateRule(
    rule: PolicyRule,
    metrics: any,
    baselineMetrics: any,
    policyId: string,
    policyName: string,
    ruleIndex: number
  ): PolicyViolation | null {
    const { metric, operator, threshold, severity, name, description } = rule;
    const value = this.getMetricValue(metrics, metric);
    
    if (value === null || value === undefined) {
      return null;
    }

    let violated = false;
    
    switch (operator) {
      case 'greater_than':
        violated = value <= (threshold as number);
        break;
      case 'less_than':
        violated = value >= (threshold as number);
        break;
      case 'between':
        const [min, max] = threshold as [number, number];
        violated = value < min || value > max;
        break;
      default:
        return null;
    }

    if (violated) {
      return {
        policyId,
        policyName,
        ruleIndex,
        ruleName: name,
        severity,
        message: description || `Quality gate failed: ${metric} ${operator} ${threshold} (actual: ${value})`,
        evidence: { metric, value, threshold, operator },
        actualValue: value,
        expectedThreshold: threshold
      };
    }

    return null;
  }

  async createDefaultPolicies(organizationId: string, userId: string): Promise<Policy[]> {
    const defaultPolicies = [
      {
        name: 'Quality Standards',
        description: 'Basic quality requirements for AI responses',
        rules: [
          {
            id: 'exact_match_min',
            name: 'Minimum Exact Match Rate',
            type: 'quality_gate',
            metric: 'exactMatch',
            operator: 'greater_than',
            threshold: 0.7,
            severity: 'error',
            description: 'Exact match rate must be above 70%',
            enabled: true,
          },
          {
            id: 'llm_judge_min',
            name: 'Minimum LLM Judge Score',
            type: 'quality_gate',
            metric: 'llmAsJudgeWinRate',
            operator: 'greater_than',
            threshold: 0.8,
            severity: 'warn',
            description: 'LLM judge score should be above 80%',
            enabled: true,
          },
        ],
        organizationId,
        createdBy: userId,
        isActive: true,
      },
      {
        name: 'Performance Standards',
        description: 'Performance and cost requirements',
        rules: [
          {
            id: 'latency_max',
            name: 'Maximum Response Latency',
            type: 'latency_slo',
            metric: 'latencyP95',
            threshold: 5000, // 5 seconds
            severity: 'warn',
            description: 'P95 latency should be under 5 seconds',
            enabled: true,
          },
          {
            id: 'cost_max',
            name: 'Maximum Cost per Evaluation',
            type: 'cost_limit',
            metric: 'avgCost',
            threshold: 0.1, // $0.10
            severity: 'warn',
            description: 'Average cost per evaluation should be under $0.10',
            enabled: true,
          },
        ],
        organizationId,
        createdBy: userId,
        isActive: true,
      },
      {
        name: 'Regression Detection',
        description: 'Baseline comparison and regression detection',
        rules: [
          {
            id: 'quality_regression',
            name: 'Quality Regression Check',
            type: 'baseline_comparison',
            metric: 'llmAsJudgeWinRate',
            threshold: 0.05, // 5% regression threshold
            severity: 'fail',
            description: 'LLM judge score cannot regress more than 5% from baseline',
            enabled: true,
          },
          {
            id: 'cost_regression',
            name: 'Cost Regression Check',
            type: 'baseline_comparison',
            metric: 'avgCost',
            threshold: 0.2, // 20% cost increase threshold
            severity: 'warn',
            description: 'Average cost should not increase more than 20% from baseline',
            enabled: true,
          },
        ],
        organizationId,
        createdBy: userId,
        isActive: true,
      },
    ];

    const createdPolicies: Policy[] = [];
    for (const policyData of defaultPolicies) {
      const policy = await storage.createPolicy(policyData);
      createdPolicies.push(policy);
    }

    return createdPolicies;
  }

  async updateBaseline(runId: string): Promise<void> {
    const run = await storage.getRun(runId);
    if (!run || run.status !== 'completed') {
      throw new Error('Cannot create baseline from incomplete run');
    }

    const evalSpec = await storage.getEvalSpec(run.evalSpecId);
    if (!evalSpec) {
      throw new Error('Evaluation spec not found');
    }

    // Create new baseline
    const version = await this.generateBaselineVersion(run.evalSpecId);
    await storage.createBaseline({
      evalSpecId: run.evalSpecId,
      runId: run.id,
      name: `${evalSpec.name} ${version}`, // Add the required name field
      metrics: run.metrics!,
      description: `Baseline from run ${run.id}`,
      organizationId: run.organizationId,
      createdBy: run.triggeredBy,
    });
  }

  private async generateBaselineVersion(evalSpecId: string): Promise<string> {
    const baselines = await storage.getBaselines(evalSpecId);
    const latestVersion = baselines.length > 0 ? baselines[0].version : 'v0.0.0';
    
    const versionParts = latestVersion.replace('v', '').split('.');
    const major = parseInt(versionParts[0] || '0');
    const minor = parseInt(versionParts[1] || '0');
    const patch = parseInt(versionParts[2] || '0');
    
    return `v${major}.${minor}.${patch + 1}`;
  }
}

export const policyEngine = new PolicyEngine();
