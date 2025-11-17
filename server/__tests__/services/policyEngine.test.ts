import { policyEngine } from '../../services/policyEngine';
import { storage } from '../../storage';
import type { PolicyRule } from '../../services/policyEngine';

// Mock the storage module
jest.mock('../../storage');
const mockStorage = storage as jest.Mocked<typeof storage>;

describe('PolicyEngine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('evaluateRun', () => {
    const mockRun = {
      id: 'run-123',
      evalSpecId: 'spec-123',
      organizationId: 'org-123',
      status: 'completed' as const,
      metrics: {
        exactMatch: 0.8,
        llmAsJudgeWinRate: 0.9,
        latencyP95: 3000,
        avgCost: 0.05,
      },
      triggeredBy: 'user-123',
      createdAt: new Date(),
    };

    const mockEvalSpec = {
      id: 'spec-123',
      name: 'Test Eval',
      organizationId: 'org-123',
      promptId: 'prompt-123',
      datasetId: 'dataset-123',
      evaluators: [],
      repetitions: 1,
      seeds: [42],
      modelConfig: {},
      createdBy: 'user-123',
      createdAt: new Date(),
    };

    const mockPolicies = [
      {
        id: 'policy-123',
        name: 'Quality Standards',
        description: 'Basic quality requirements',
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
          } as PolicyRule,
          {
            id: 'llm_judge_min',
            name: 'Minimum LLM Judge Score',
            type: 'quality_gate',
            metric: 'llmAsJudgeWinRate',
            operator: 'greater_than',
            threshold: 0.95, // High threshold to trigger violation
            severity: 'warn',
            description: 'LLM judge score should be above 95%',
            enabled: true,
          } as PolicyRule,
        ],
        isActive: true,
        organizationId: 'org-123',
        createdBy: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    it('should evaluate run and return pass decision', async () => {
      // Mock successful policies that pass
      const passingPolicies = [
        {
          ...mockPolicies[0],
          rules: [
            {
              id: 'exact_match_min',
              name: 'Minimum Exact Match Rate',
              type: 'quality_gate',
              metric: 'exactMatch',
              operator: 'greater_than',
              threshold: 0.7, // Run has 0.8, should pass
              severity: 'error',
              description: 'Exact match rate must be above 70%',
              enabled: true,
            } as PolicyRule,
          ],
        },
      ];

      mockStorage.getRun.mockResolvedValue(mockRun);
      mockStorage.getEvalSpec.mockResolvedValue(mockEvalSpec);
      mockStorage.getPolicies.mockResolvedValue(passingPolicies);
      mockStorage.getLatestBaseline.mockResolvedValue(null);
      mockStorage.createPolicyViolation.mockResolvedValue({
        id: 'violation-123',
        runId: 'run-123',
        policyId: 'policy-123',
        ruleIndex: 0,
        severity: 'warn',
        message: 'Test violation',
        evidence: {},
        organizationId: 'org-123',
        createdAt: new Date(),
      });

      const result = await policyEngine.evaluateRun('run-123');

      expect(result.decision).toBe('pass');
      expect(result.score).toBe(100);
      expect(result.violations).toHaveLength(0);
      expect(result.passedRules).toBe(1);
      expect(result.totalRules).toBe(1);
    });

    it('should evaluate run and return warn decision for policy violations', async () => {
      mockStorage.getRun.mockResolvedValue(mockRun);
      mockStorage.getEvalSpec.mockResolvedValue(mockEvalSpec);
      mockStorage.getPolicies.mockResolvedValue(mockPolicies);
      mockStorage.getLatestBaseline.mockResolvedValue(null);
      mockStorage.createPolicyViolation.mockResolvedValue({
        id: 'violation-123',
        runId: 'run-123',
        policyId: 'policy-123',
        ruleIndex: 1,
        severity: 'warn',
        message: 'LLM judge score below threshold',
        evidence: {},
        organizationId: 'org-123',
        createdAt: new Date(),
      });

      const result = await policyEngine.evaluateRun('run-123');

      expect(result.decision).toBe('warn');
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].severity).toBe('warn');
      expect(result.violations[0].ruleName).toBe('Minimum LLM Judge Score');
      expect(result.passedRules).toBe(1); // One rule passes (exact match)
      expect(result.totalRules).toBe(2);
      expect(result.score).toBe(50); // 1/2 rules passed = 50%
    });

    it('should evaluate run and return fail decision for critical violations', async () => {
      const failingRun = {
        ...mockRun,
        metrics: {
          exactMatch: 0.5, // Below threshold of 0.7
          llmAsJudgeWinRate: 0.6,
          latencyP95: 3000,
          avgCost: 0.05,
        },
      };

      mockStorage.getRun.mockResolvedValue(failingRun);
      mockStorage.getEvalSpec.mockResolvedValue(mockEvalSpec);
      mockStorage.getPolicies.mockResolvedValue(mockPolicies);
      mockStorage.getLatestBaseline.mockResolvedValue(null);
      mockStorage.createPolicyViolation.mockResolvedValue({
        id: 'violation-123',
        runId: 'run-123',
        policyId: 'policy-123',
        ruleIndex: 0,
        severity: 'error',
        message: 'Exact match rate below minimum',
        evidence: {},
        organizationId: 'org-123',
        createdAt: new Date(),
      });

      const result = await policyEngine.evaluateRun('run-123');

      expect(result.decision).toBe('fail');
      expect(result.violations).toHaveLength(2); // Both rules fail
      expect(result.violations.some(v => v.severity === 'error')).toBe(true);
      expect(result.score).toBe(0); // 0/2 rules passed = 0%
    });

    it('should handle baseline comparison and regression detection', async () => {
      const baselineMetrics = {
        exactMatch: 0.95,
        llmAsJudgeWinRate: 0.98,
        avgCost: 0.03,
      };

      const baseline = {
        id: 'baseline-123',
        evalSpecId: 'spec-123',
        runId: 'run-456',
        version: 'v1.0.0',
        metrics: baselineMetrics,
        description: 'Test baseline',
        organizationId: 'org-123',
        createdBy: 'user-123',
        createdAt: new Date(),
      };

      const regressionPolicies = [
        {
          id: 'policy-regression',
          name: 'Regression Detection',
          description: 'Baseline comparison policies',
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
            } as PolicyRule,
          ],
          isActive: true,
          organizationId: 'org-123',
          createdBy: 'user-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // Current run has llmAsJudgeWinRate of 0.9, baseline is 0.98
      // Regression = (0.9 - 0.98) / 0.98 = -8.16% > 5% threshold
      mockStorage.getRun.mockResolvedValue(mockRun);
      mockStorage.getEvalSpec.mockResolvedValue(mockEvalSpec);
      mockStorage.getPolicies.mockResolvedValue(regressionPolicies);
      mockStorage.getLatestBaseline.mockResolvedValue(baseline);
      mockStorage.createPolicyViolation.mockResolvedValue({
        id: 'violation-regression',
        runId: 'run-123',
        policyId: 'policy-regression',
        ruleIndex: 0,
        severity: 'fail',
        message: 'Quality regression detected',
        evidence: {},
        organizationId: 'org-123',
        createdAt: new Date(),
      });

      const result = await policyEngine.evaluateRun('run-123');

      expect(result.decision).toBe('fail');
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].baselineComparison).toBeDefined();
      expect(result.violations[0].baselineComparison?.hasRegression).toBe(true);
      expect(result.violations[0].baselineComparison?.percentageChange).toBeLessThan(-5);
    });

    it('should handle missing run gracefully', async () => {
      mockStorage.getRun.mockResolvedValue(undefined);

      await expect(policyEngine.evaluateRun('nonexistent-run')).rejects.toThrow('Run nonexistent-run not found');
    });
  });

  describe('createDefaultPolicies', () => {
    it('should create comprehensive default policies', async () => {
      const mockPolicy = {
        id: 'policy-123',
        name: 'Quality Standards',
        description: 'Basic quality requirements for AI responses',
        rules: [],
        isActive: true,
        organizationId: 'org-123',
        createdBy: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockStorage.createPolicy.mockResolvedValue(mockPolicy);

      const policies = await policyEngine.createDefaultPolicies('org-123', 'user-123');

      expect(policies).toHaveLength(3); // Quality, Performance, Regression policies
      expect(mockStorage.createPolicy).toHaveBeenCalledTimes(3);
      
      // Verify the policy creation calls
      const createCalls = mockStorage.createPolicy.mock.calls;
      const policyNames = createCalls.map(call => call[0].name);
      
      expect(policyNames).toContain('Quality Standards');
      expect(policyNames).toContain('Performance Standards');
      expect(policyNames).toContain('Regression Detection');
    });
  });

  describe('updateBaseline', () => {
    const mockCompletedRun = {
      id: 'run-123',
      evalSpecId: 'spec-123',
      organizationId: 'org-123',
      status: 'completed' as const,
      metrics: {
        exactMatch: 0.8,
        llmAsJudgeWinRate: 0.9,
      },
      triggeredBy: 'user-123',
      createdAt: new Date(),
    };

    const mockEvalSpec = {
      id: 'spec-123',
      name: 'Test Eval',
      organizationId: 'org-123',
      promptId: 'prompt-123',
      datasetId: 'dataset-123',
      evaluators: [],
      repetitions: 1,
      seeds: [42],
      modelConfig: {},
      createdBy: 'user-123',
      createdAt: new Date(),
    };

    it('should create baseline from completed run', async () => {
      mockStorage.getRun.mockResolvedValue(mockCompletedRun);
      mockStorage.getEvalSpec.mockResolvedValue(mockEvalSpec);
      mockStorage.getBaselines.mockResolvedValue([]);
      mockStorage.createBaseline.mockResolvedValue({
        id: 'baseline-123',
        evalSpecId: 'spec-123',
        runId: 'run-123',
        version: 'v0.0.1',
        metrics: mockCompletedRun.metrics,
        description: 'Baseline from run run-123',
        organizationId: 'org-123',
        createdBy: 'user-123',
        createdAt: new Date(),
      });

      await policyEngine.updateBaseline('run-123');

      expect(mockStorage.createBaseline).toHaveBeenCalledWith(
        expect.objectContaining({
          evalSpecId: 'spec-123',
          runId: 'run-123',
          version: 'v0.0.1',
          metrics: mockCompletedRun.metrics,
        })
      );
    });

    it('should throw error for incomplete run', async () => {
      const incompleteRun = { ...mockCompletedRun, status: 'running' as const };
      mockStorage.getRun.mockResolvedValue(incompleteRun);

      await expect(policyEngine.updateBaseline('run-123')).rejects.toThrow('Cannot create baseline from incomplete run');
    });

    it('should throw error for missing run', async () => {
      mockStorage.getRun.mockResolvedValue(undefined);

      await expect(policyEngine.updateBaseline('nonexistent-run')).rejects.toThrow('Cannot create baseline from incomplete run');
    });
  });
});