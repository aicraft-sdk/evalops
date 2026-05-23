/* eslint-disable */
// @ts-nocheck
// TODO: rewire for NestJS DI — EvaluationService is now an @Injectable() class in
// apps/evaluation-service/src/app/evaluation/evaluation.service.ts; storage calls
// are now injected via DatabaseStorageService. The functional evaluationEngine,
// storage, azureOpenAIAdapter, and policyEngine exports no longer exist post-migration.
// Use NestJS TestingModule to rewire all injected dependencies.

describe.skip('EvaluationEngine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('executeRun', () => {
    const mockRun = {
      id: 'run-123',
      evalSpecId: 'spec-123',
      status: 'pending' as const,
      decision: null as any,
      startedAt: null as any,
      completedAt: null as any,
      metrics: null as any,
      cost: null as any,
      duration: null as any,
      errorMessage: null as any,
      triggeredBy: 'user-123',
      commitSha: null as any,
      organizationId: 'org-123',
      createdAt: new Date(),
    };

    const mockEvalSpec = {
      id: 'spec-123',
      name: 'Test Eval Spec',
      version: 'v1.0.0',
      description: 'Test evaluation specification',
      promptId: 'prompt-123',
      flowId: null as any,
      datasetId: 'dataset-123',
      evaluators: [
        { type: 'exact_match' },
        { type: 'llm_as_judge', judgePrompt: 'Rate the response: {response} vs {expected}' },
      ],
      repetitions: 2,
      seeds: [12345, 67890],
      modelConfig: { temperature: 0.7 },
      organizationId: 'org-123',
      createdBy: 'user-123',
      createdAt: new Date(),
    };

    const mockDataset = {
      id: 'dataset-123',
      name: 'Test Dataset',
      version: 'v1.0.0',
      description: 'Test dataset',
      schema: {},
      sampleCount: 2,
      contentHash: 'test-hash',
      storageUrl: 'dataset://samples/test-hash.json',
      organizationId: 'org-123',
      createdBy: 'user-123',
      createdAt: new Date(),
    };

    const mockPrompt = {
      id: 'prompt-123',
      name: 'Test Prompt',
      version: 'v1.0.0',
      content: 'Answer the question: {input}',
      contentHash: 'prompt-hash',
      metadata: {},
      organizationId: 'org-123',
      createdBy: 'user-123',
      createdAt: new Date(),
    };

    it('should execute evaluation run successfully', async () => {
      // Setup mocks
      mockStorage.getRun.mockResolvedValue(mockRun);
      mockStorage.getEvalSpec.mockResolvedValue(mockEvalSpec);
      mockStorage.getDataset.mockResolvedValue(mockDataset);
      mockStorage.getPrompt.mockResolvedValue(mockPrompt);
      mockStorage.getActiveBaseline.mockResolvedValue(null);
      mockStorage.getActivePolicies.mockResolvedValue([]);
      mockStorage.updateRun.mockResolvedValue({} as any);

      mockAzureOpenAI.generateResponse
        .mockResolvedValueOnce({
          response: 'AI is artificial intelligence',
          cost: 0.001,
          tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        })
        .mockResolvedValueOnce({
          response: 'ML works by learning patterns',
          cost: 0.002,
          tokenUsage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 },
        })
        .mockResolvedValueOnce({
          response: '0.9', // LLM judge score for first sample
          cost: 0.001,
          tokenUsage: { promptTokens: 15, completionTokens: 3, totalTokens: 18 },
        })
        .mockResolvedValueOnce({
          response: '0.8', // LLM judge score for second sample
          cost: 0.001,
          tokenUsage: { promptTokens: 16, completionTokens: 3, totalTokens: 19 },
        });

      mockPolicyEngine.evaluatePolicies.mockResolvedValue({
        decision: 'pass' as const,
        violations: [],
      });

      // Execute run
      await evaluationEngine.executeRun('run-123');

      // Verify run was updated to running status
      expect(mockStorage.updateRun).toHaveBeenCalledWith('run-123', {
        status: 'running',
      });

      // Verify final run update with results
      expect(mockStorage.updateRun).toHaveBeenCalledWith('run-123', {
        status: 'completed',
        decision: 'pass',
        completedAt: expect.any(Date),
        metrics: expect.any(Object),
        cost: expect.any(Number),
        duration: expect.any(Number),
      });

      // Verify AI adapter was called correctly
      expect(mockAzureOpenAI.generateResponse).toHaveBeenCalledTimes(4); // 2 responses + 2 judge evaluations
    });

    it('should handle evaluation errors gracefully', async () => {
      mockStorage.getRun.mockResolvedValue(mockRun);
      mockStorage.getEvalSpec.mockResolvedValue(mockEvalSpec);
      mockStorage.getDataset.mockResolvedValue(mockDataset);
      mockStorage.getPrompt.mockResolvedValue(mockPrompt);

      // Simulate AI adapter error
      mockAzureOpenAI.generateResponse.mockRejectedValue(new Error('API Error'));

      await evaluationEngine.executeRun('run-123');

      // Verify run was marked as failed
      expect(mockStorage.updateRun).toHaveBeenCalledWith('run-123', {
        status: 'failed',
        completedAt: expect.any(Date),
        errorMessage: expect.stringContaining('Error'),
      });
    });

    it('should handle missing run gracefully', async () => {
      mockStorage.getRun.mockResolvedValue(undefined);

      await evaluationEngine.executeRun('nonexistent-run');

      expect(mockStorage.updateRun).toHaveBeenCalledWith('nonexistent-run', {
        status: 'failed',
        completedAt: expect.any(Date),
        errorMessage: 'Run nonexistent-run not found',
      });
    });

    it('should calculate statistics correctly', async () => {
      mockStorage.getRun.mockResolvedValue(mockRun);
      mockStorage.getEvalSpec.mockResolvedValue({
        ...mockEvalSpec,
        repetitions: 3,
        seeds: [1, 2, 3],
      });
      mockStorage.getDataset.mockResolvedValue(mockDataset);
      mockStorage.getPrompt.mockResolvedValue(mockPrompt);
      mockStorage.getActiveBaseline.mockResolvedValue(null);
      mockStorage.getActivePolicies.mockResolvedValue([]);
      mockStorage.updateRun.mockResolvedValue({} as any);

      // Mock consistent responses for statistical analysis
      mockAzureOpenAI.generateResponse
        .mockResolvedValue({
          response: 'Consistent response',
          cost: 0.001,
          tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        });

      mockPolicyEngine.evaluatePolicies.mockResolvedValue({
        decision: 'pass' as const,
        violations: [],
      });

      await evaluationEngine.executeRun('run-123');

      const updateCall = mockStorage.updateRun.mock.calls.find(
        call => call[1].status === 'completed'
      );
      expect(updateCall).toBeDefined();
      
      const metrics = updateCall![1].metrics;
      expect(metrics).toBeDefined();
      expect(typeof metrics.exactMatch?.mean).toBe('number');
      expect(Array.isArray(metrics.exactMatch?.confidenceInterval)).toBe(true);
    });
  });
});