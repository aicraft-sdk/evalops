import { describe, it, expect } from '@jest/globals';
import {
  formatJsonSummary,
  type SuiteRunResult,
  type ScenarioRun,
} from './json-formatter';
import type { Run } from '@evalops/shared-db';
import type { PolicyViolation } from '../app/policies/policies.service';

describe('json-formatter', () => {
  const createMockRun = (
    decision: 'pass' | 'warn' | 'fail' | null = 'pass',
    duration: number | null = 100
  ): Run => ({
    id: 'run-123',
    name: 'Test Run',
    evalSpecId: 'eval-spec-123',
    policyId: null,
    agentId: null,
    agentVersion: null,
    status: 'completed',
    decision,
    startedAt: new Date(),
    completedAt: new Date(),
    metrics: null,
    cost: 0.01,
    duration,
    errorMessage: null,
    triggeredBy: 'user-123',
    commitSha: null,
    organizationId: 'org-123',
    description: null,
    traceEvents: null,
    traceMigratedAt: null,
    artifactHashes: null,
    createdAt: new Date(),
  });

  const createMockViolation = (
    severity: 'warn' | 'fail' | 'error' = 'fail',
    message = 'Test violation'
  ): PolicyViolation => ({
    policyId: 'policy-123',
    policyName: 'Test Policy',
    ruleIndex: 0,
    ruleName: 'Test Rule',
    severity,
    message,
    evidence: { key: 'value' },
  } as PolicyViolation);

  describe('formatJsonSummary', () => {
    it('should format passing scenario correctly', () => {
      const result: SuiteRunResult = {
        suiteId: 'suite-123',
        suiteName: 'Test Suite',
        startedAt: new Date('2024-01-01T00:00:00Z'),
        completedAt: new Date('2024-01-01T00:01:00Z'),
        scenarios: [
          {
            runId: 'run-123',
            scenarioId: 'scenario-123',
            scenarioName: 'Test Scenario',
            run: createMockRun('pass'),
          },
        ],
      };

      const summary = formatJsonSummary(result);
      expect(summary.suiteId).toBe('suite-123');
      expect(summary.suiteName).toBe('Test Suite');
      expect(summary.totalScenarios).toBe(1);
      expect(summary.passed).toBe(1);
      expect(summary.warned).toBe(0);
      expect(summary.failed).toBe(0);
      expect(summary.overallDecision).toBe('pass');
      expect(summary.runs).toHaveLength(1);
      expect(summary.runs[0].decision).toBe('pass');
      expect(summary.runs[0].scenarioName).toBe('Test Scenario');
    });

    it('should format failing scenario correctly', () => {
      const result: SuiteRunResult = {
        suiteId: 'suite-123',
        suiteName: 'Test Suite',
        startedAt: new Date('2024-01-01T00:00:00Z'),
        completedAt: new Date('2024-01-01T00:01:00Z'),
        scenarios: [
          {
            runId: 'run-123',
            scenarioId: 'scenario-123',
            scenarioName: 'Test Scenario',
            run: createMockRun('fail'),
            violations: [createMockViolation('fail', 'Policy violation')],
          },
        ],
      };

      const summary = formatJsonSummary(result);
      expect(summary.failed).toBe(1);
      expect(summary.overallDecision).toBe('fail');
      expect(summary.runs[0].decision).toBe('fail');
      expect(summary.runs[0].violations).toHaveLength(1);
      expect(summary.runs[0].violations[0].message).toBe('Policy violation');
    });

    it('should format warning scenario correctly', () => {
      const result: SuiteRunResult = {
        suiteId: 'suite-123',
        suiteName: 'Test Suite',
        startedAt: new Date('2024-01-01T00:00:00Z'),
        completedAt: new Date('2024-01-01T00:01:00Z'),
        scenarios: [
          {
            runId: 'run-123',
            scenarioId: 'scenario-123',
            scenarioName: 'Test Scenario',
            run: createMockRun('warn'),
          },
        ],
      };

      const summary = formatJsonSummary(result);
      expect(summary.warned).toBe(1);
      expect(summary.overallDecision).toBe('warn');
      expect(summary.runs[0].decision).toBe('warn');
    });

    it('should determine overall decision as fail when any scenario fails', () => {
      const result: SuiteRunResult = {
        suiteId: 'suite-123',
        suiteName: 'Test Suite',
        startedAt: new Date('2024-01-01T00:00:00Z'),
        completedAt: new Date('2024-01-01T00:01:00Z'),
        scenarios: [
          {
            runId: 'run-1',
            scenarioId: 'scenario-1',
            scenarioName: 'Passing',
            run: createMockRun('pass'),
          },
          {
            runId: 'run-2',
            scenarioId: 'scenario-2',
            scenarioName: 'Failing',
            run: createMockRun('fail'),
          },
          {
            runId: 'run-3',
            scenarioId: 'scenario-3',
            scenarioName: 'Warning',
            run: createMockRun('warn'),
          },
        ],
      };

      const summary = formatJsonSummary(result);
      expect(summary.overallDecision).toBe('fail');
      expect(summary.passed).toBe(1);
      expect(summary.failed).toBe(1);
      expect(summary.warned).toBe(1);
    });

    it('should determine overall decision as warn when no failures but warnings exist', () => {
      const result: SuiteRunResult = {
        suiteId: 'suite-123',
        suiteName: 'Test Suite',
        startedAt: new Date('2024-01-01T00:00:00Z'),
        completedAt: new Date('2024-01-01T00:01:00Z'),
        scenarios: [
          {
            runId: 'run-1',
            scenarioId: 'scenario-1',
            scenarioName: 'Passing',
            run: createMockRun('pass'),
          },
          {
            runId: 'run-2',
            scenarioId: 'scenario-2',
            scenarioName: 'Warning',
            run: createMockRun('warn'),
          },
        ],
      };

      const summary = formatJsonSummary(result);
      expect(summary.overallDecision).toBe('warn');
      expect(summary.passed).toBe(1);
      expect(summary.warned).toBe(1);
      expect(summary.failed).toBe(0);
    });

    it('should include commit SHA when provided', () => {
      const result: SuiteRunResult = {
        suiteId: 'suite-123',
        suiteName: 'Test Suite',
        commitSha: 'abc123def456',
        startedAt: new Date('2024-01-01T00:00:00Z'),
        completedAt: new Date('2024-01-01T00:01:00Z'),
        scenarios: [
          {
            runId: 'run-123',
            scenarioId: 'scenario-123',
            scenarioName: 'Test Scenario',
            run: createMockRun('pass'),
          },
        ],
      };

      const summary = formatJsonSummary(result);
      expect(summary.commitSha).toBe('abc123def456');
    });

    it('should format timestamps as ISO strings', () => {
      const startedAt = new Date('2024-01-01T00:00:00Z');
      const completedAt = new Date('2024-01-01T00:01:00Z');
      const result: SuiteRunResult = {
        suiteId: 'suite-123',
        suiteName: 'Test Suite',
        startedAt,
        completedAt,
        scenarios: [
          {
            runId: 'run-123',
            scenarioId: 'scenario-123',
            scenarioName: 'Test Scenario',
            run: createMockRun('pass'),
          },
        ],
      };

      const summary = formatJsonSummary(result);
      expect(summary.startedAt).toBe(startedAt.toISOString());
      expect(summary.completedAt).toBe(completedAt.toISOString());
    });

    it('should include run details with violations', () => {
      const result: SuiteRunResult = {
        suiteId: 'suite-123',
        suiteName: 'Test Suite',
        startedAt: new Date('2024-01-01T00:00:00Z'),
        completedAt: new Date('2024-01-01T00:01:00Z'),
        scenarios: [
          {
            runId: 'run-123',
            scenarioId: 'scenario-123',
            scenarioName: 'Test Scenario',
            run: { ...createMockRun('fail', 200), policyScore: 50 } as Run & { policyScore?: number },
            violations: [
              createMockViolation('fail', 'First violation'),
              createMockViolation('error', 'Second violation'),
            ],
          },
        ],
      };

      const summary = formatJsonSummary(result);
      expect(summary.runs[0].runId).toBe('run-123');
      expect(summary.runs[0].scenarioId).toBe('scenario-123');
      expect(summary.runs[0].duration).toBe(200);
      expect(summary.runs[0].policyScore).toBe(50);
      expect(summary.runs[0].violations).toHaveLength(2);
      expect(summary.runs[0].violations[0].policyId).toBe('policy-123');
      expect(summary.runs[0].violations[0].severity).toBe('fail');
    });

    it('should handle null values in run properties', () => {
      const result: SuiteRunResult = {
        suiteId: 'suite-123',
        suiteName: 'Test Suite',
        startedAt: new Date('2024-01-01T00:00:00Z'),
        completedAt: new Date('2024-01-01T00:01:00Z'),
        scenarios: [
          {
            runId: 'run-123',
            scenarioId: 'scenario-123',
            scenarioName: 'Test Scenario',
            run: {
              ...createMockRun('pass'),
              duration: null,
              cost: null,
              policyScore: null,
            } as Run & { policyScore?: number | null },
          },
        ],
      };

      const summary = formatJsonSummary(result);
      expect(summary.runs[0].duration).toBeNull();
      expect(summary.runs[0].policyScore).toBeNull();
      expect(summary.runs[0].cost).toBeNull();
    });

    it('should handle empty scenarios list', () => {
      const result: SuiteRunResult = {
        suiteId: 'suite-123',
        suiteName: 'Test Suite',
        startedAt: new Date('2024-01-01T00:00:00Z'),
        completedAt: new Date('2024-01-01T00:00:00Z'),
        scenarios: [],
      };

      const summary = formatJsonSummary(result);
      expect(summary.totalScenarios).toBe(0);
      expect(summary.passed).toBe(0);
      expect(summary.warned).toBe(0);
      expect(summary.failed).toBe(0);
      expect(summary.overallDecision).toBe('pass');
      expect(summary.runs).toHaveLength(0);
    });
  });
});
