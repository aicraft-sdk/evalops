import { describe, it, expect } from '@jest/globals';
import { formatJUnitXML, type SuiteRunResult } from './junit-formatter';
import type { Run } from '@evalops/shared-db';
import type { PolicyViolation } from '../app/policies/policies.service';

describe('junit-formatter', () => {
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
    policyScore: null,
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

  describe('formatJUnitXML', () => {
    it('should format passing scenario as testcase', () => {
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

      const xml = formatJUnitXML(result);
      expect(xml).toContain('<testcase name="Test Scenario"');
      expect(xml).toContain('classname="Test Suite"');
      expect(xml).toContain('time="100"');
      expect(xml).not.toContain('<failure');
      expect(xml).not.toContain('<skipped');
    });

    it('should format failing scenario with failure element', () => {
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

      const xml = formatJUnitXML(result);
      expect(xml).toContain('<testcase name="Test Scenario"');
      expect(xml).toContain('<failure');
      expect(xml).toContain('Policy violation');
    });

    it('should format warning scenario as skipped', () => {
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

      const xml = formatJUnitXML(result);
      expect(xml).toContain('<testcase name="Test Scenario"');
      expect(xml).toContain('<skipped');
      expect(xml).toContain('Policy warning');
    });

    it('should escape XML special characters in scenario names', () => {
      const result: SuiteRunResult = {
        suiteId: 'suite-123',
        suiteName: 'Test Suite & More',
        startedAt: new Date('2024-01-01T00:00:00Z'),
        completedAt: new Date('2024-01-01T00:01:00Z'),
        scenarios: [
          {
            runId: 'run-123',
            scenarioId: 'scenario-123',
            scenarioName: 'Test <Scenario> & "More"',
            run: createMockRun('pass'),
          },
        ],
      };

      const xml = formatJUnitXML(result);
      expect(xml).toContain('&lt;');
      expect(xml).toContain('&gt;');
      expect(xml).toContain('&amp;');
      expect(xml).toContain('&quot;');
      expect(xml).not.toContain('<Scenario>');
    });

    it('should include violation details in failure message', () => {
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
            violations: [
              createMockViolation('fail', 'First violation'),
              createMockViolation('error', 'Second violation'),
            ],
          },
        ],
      };

      const xml = formatJUnitXML(result);
      expect(xml).toContain('First violation');
      expect(xml).toContain('Second violation');
      expect(xml).toContain('Test Policy');
    });

    it('should calculate correct test counts', () => {
      const result: SuiteRunResult = {
        suiteId: 'suite-123',
        suiteName: 'Test Suite',
        startedAt: new Date('2024-01-01T00:00:00Z'),
        completedAt: new Date('2024-01-01T00:03:00Z'),
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
          {
            runId: 'run-3',
            scenarioId: 'scenario-3',
            scenarioName: 'Failing',
            run: createMockRun('fail'),
          },
        ],
      };

      const xml = formatJUnitXML(result);
      expect(xml).toContain('tests="3"');
      expect(xml).toContain('failures="1"');
      expect(xml).toContain('skipped="1"');
      expect(xml).toContain('time="180"');
    });

    it('should handle empty scenarios list', () => {
      const result: SuiteRunResult = {
        suiteId: 'suite-123',
        suiteName: 'Test Suite',
        startedAt: new Date('2024-01-01T00:00:00Z'),
        completedAt: new Date('2024-01-01T00:00:00Z'),
        scenarios: [],
      };

      const xml = formatJUnitXML(result);
      expect(xml).toContain('tests="0"');
      expect(xml).toContain('failures="0"');
      expect(xml).toContain('skipped="0"');
    });
  });
});
