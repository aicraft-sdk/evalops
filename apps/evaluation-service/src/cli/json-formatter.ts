import { Run } from '@evalops/shared-db';
import { PolicyViolation } from '../app/policies/policies.service';

export interface ScenarioRun {
  runId: string;
  scenarioId: string;
  scenarioName: string;
  run: Run;
  violations?: PolicyViolation[];
}

export interface SuiteRunResult {
  suiteId: string;
  suiteName: string;
  commitSha?: string;
  startedAt: Date;
  completedAt: Date;
  scenarios: ScenarioRun[];
}

export interface JsonSummary {
  suiteId: string;
  suiteName: string;
  commitSha?: string;
  startedAt: string;
  completedAt: string;
  totalScenarios: number;
  passed: number;
  warned: number;
  failed: number;
  runs: RunSummary[];
  overallDecision: 'pass' | 'warn' | 'fail';
}

export interface RunSummary {
  runId: string;
  scenarioId: string;
  scenarioName: string;
  status: string;
  decision: 'pass' | 'warn' | 'fail' | null;
  policyScore?: number | null;
  violations: ViolationSummary[];
  duration?: number | null;
  cost?: number | null;
}

export interface ViolationSummary {
  policyId: string;
  policyName: string;
  severity: 'warn' | 'fail' | 'error';
  message: string;
}

/**
 * Format suite run results as JSON summary
 */
export function formatJsonSummary(result: SuiteRunResult): JsonSummary {
  const passed = result.scenarios.filter(
    (s) => s.run.decision === 'pass'
  ).length;
  const warned = result.scenarios.filter(
    (s) => s.run.decision === 'warn'
  ).length;
  const failed = result.scenarios.filter(
    (s) => s.run.decision === 'fail'
  ).length;

  // Determine overall decision
  let overallDecision: 'pass' | 'warn' | 'fail' = 'pass';
  if (failed > 0) {
    overallDecision = 'fail';
  } else if (warned > 0) {
    overallDecision = 'warn';
  }

  const runs: RunSummary[] = result.scenarios.map((scenario) => ({
    runId: scenario.runId,
    scenarioId: scenario.scenarioId,
    scenarioName: scenario.scenarioName,
    status: scenario.run.status,
    decision: (scenario.run.decision as 'pass' | 'warn' | 'fail' | null) || null,
    policyScore: (scenario.run as any).policyScore || null,
    violations:
      scenario.violations?.map((v) => ({
        policyId: v.policyId,
        policyName: v.policyName,
        severity: v.severity,
        message: v.message,
      })) || [],
    duration: scenario.run.duration || null,
    cost: scenario.run.cost || null,
  }));

  return {
    suiteId: result.suiteId,
    suiteName: result.suiteName,
    commitSha: result.commitSha,
    startedAt: result.startedAt.toISOString(),
    completedAt: result.completedAt.toISOString(),
    totalScenarios: result.scenarios.length,
    passed,
    warned,
    failed,
    runs,
    overallDecision,
  };
}
