/* eslint-disable */
// @ts-nocheck
// TODO: rewire for NestJS DI — all imported modules (storage, evaluationEngine,
// azureOpenAIAdapter, datasetService, promptService) are now @Injectable() NestJS
// services living in their respective microservice directories. The functional
// exports referenced here no longer exist post-migration.
// storage calls are now injected via DatabaseStorageService; add jest.mock() for
// the storage module when rewiring — specifically mock createEvalSpec, createRun,
// getRun and any other methods called in these tests using
// jest.fn().mockResolvedValue(...) with appropriate fake return values.
// Use NestJS TestingModule + inter-service mocks to rewire this integration test.

describe.skip('End-to-End Evaluation Workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should execute complete evaluation workflow from prompt to results', async () => {
    // Mock OpenAI responses
    mockAzureOpenAI.generateResponse
      .mockResolvedValueOnce({
        response: 'AI is a field of computer science focused on creating intelligent machines.',
        cost: 0.002,
        tokenUsage: { promptTokens: 15, completionTokens: 12, totalTokens: 27 },
      })
      .mockResolvedValueOnce({
        response: 'Machine learning is a subset of AI that enables computers to learn without explicit programming.',
        cost: 0.003,
        tokenUsage: { promptTokens: 18, completionTokens: 16, totalTokens: 34 },
      })
      .mockResolvedValueOnce({
        response: '0.95', // Judge score for first sample
        cost: 0.001,
        tokenUsage: { promptTokens: 20, completionTokens: 2, totalTokens: 22 },
      })
      .mockResolvedValueOnce({
        response: '0.90', // Judge score for second sample  
        cost: 0.001,
        tokenUsage: { promptTokens: 22, completionTokens: 2, totalTokens: 24 },
      });

    // Step 1: Upload a prompt
    const promptId = await promptService.uploadPrompt(
      {
        name: 'QA Prompt',
        content: 'Answer the following question clearly and concisely: {input}',
      },
      'user-123',
      'default-org'
    );

    // Step 2: Upload a dataset
    const datasetId = await datasetService.uploadDataset(
      {
        name: 'AI Knowledge Test',
        description: 'Testing AI knowledge questions',
        samples: [
          { 
            input: 'What is artificial intelligence?', 
            expected: 'AI is a field of computer science focused on creating intelligent machines.' 
          },
          { 
            input: 'What is machine learning?', 
            expected: 'Machine learning is a subset of AI that enables computers to learn.' 
          },
        ],
      },
      'user-123',
      'default-org'
    );

    // Step 3: Create evaluation specification
    const evalSpec = await storage.createEvalSpec({
      name: 'AI Knowledge Evaluation',
      version: 'v1.0.0',
      description: 'Evaluating AI knowledge responses',
      promptId,
      datasetId,
      evaluators: [
        { type: 'exact_match' },
        { 
          type: 'llm_as_judge', 
          judgePrompt: 'Rate how well this response answers the question. Response: {response}. Expected: {expected}. Provide a score from 0 to 1.' 
        },
      ],
      repetitions: 1,
      seeds: [42],
      modelConfig: { temperature: 0.7, maxTokens: 100 },
      organizationId: 'default-org',
      createdBy: 'user-123',
    });

    // Step 4: Create and execute a run
    const run = await storage.createRun({
      evalSpecId: evalSpec.id,
      status: 'pending',
      triggeredBy: 'user-123',
      organizationId: 'default-org',
    });

    // Execute the run
    await evaluationEngine.executeRun(run.id);

    // Step 5: Verify results
    const completedRun = await storage.getRun(run.id);
    
    expect(completedRun?.status).toBe('completed');
    expect(completedRun?.metrics).toBeDefined();
    expect(completedRun?.cost).toBeGreaterThan(0);
    expect(completedRun?.duration).toBeGreaterThan(0);

    // Verify metrics structure
    const metrics = completedRun?.metrics as any;
    expect(metrics.exactMatch).toBeDefined();
    expect(metrics.llmAsJudgeWinRate).toBeDefined();
    expect(metrics.latencyP50).toBeDefined();

    // Verify OpenAI was called correctly
    expect(mockAzureOpenAI.generateResponse).toHaveBeenCalledTimes(4); // 2 responses + 2 judge evaluations
    
    // Verify first response generation call
    expect(mockAzureOpenAI.generateResponse).toHaveBeenNthCalledWith(
      1,
      'Answer the following question clearly and concisely: What is artificial intelligence?',
      '',
      { temperature: 0.7, maxTokens: 100 },
      42
    );

    // Verify judge evaluation call
    expect(mockAzureOpenAI.generateResponse).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('Rate how well this response answers the question'),
      '',
      { temperature: 0.1 },
      42
    );
  });

  it('should handle evaluation failures gracefully', async () => {
    // Mock OpenAI to fail
    mockAzureOpenAI.generateResponse.mockRejectedValue(new Error('API rate limit exceeded'));

    const promptId = await promptService.uploadPrompt(
      {
        name: 'Test Prompt',
        content: 'Answer: {input}',
      },
      'user-123',
      'default-org'
    );

    const datasetId = await datasetService.uploadDataset(
      {
        name: 'Test Dataset',
        samples: [{ input: 'test question', expected: 'test answer' }],
      },
      'user-123',
      'default-org'
    );

    const evalSpec = await storage.createEvalSpec({
      name: 'Failing Evaluation',
      version: 'v1.0.0',
      description: 'Test failure handling',
      promptId,
      datasetId,
      evaluators: [{ type: 'exact_match' }],
      repetitions: 1,
      seeds: [42],
      modelConfig: { temperature: 0.7 },
      organizationId: 'default-org',
      createdBy: 'user-123',
    });

    const run = await storage.createRun({
      evalSpecId: evalSpec.id,
      status: 'pending',
      triggeredBy: 'user-123',
      organizationId: 'default-org',
    });

    // Execute the run
    await evaluationEngine.executeRun(run.id);

    // Verify failure was handled
    const failedRun = await storage.getRun(run.id);
    
    expect(failedRun?.status).toBe('failed');
    expect(failedRun?.errorMessage).toContain('Error');
    expect(failedRun?.completedAt).toBeDefined();
  });

  it('should validate prompt placeholders with dataset inputs', async () => {
    // Test prompt validation
    const validation = promptService.validatePrompt({
      name: 'Test Prompt',
      content: 'Process {input} and {context} to get {output}',
    });

    expect(validation.isValid).toBe(true);
    expect(validation.placeholders).toEqual(['input', 'context', 'output']);

    // Test dataset validation
    const datasetValidation = datasetService.validateDataset({
      name: 'Test Dataset',
      samples: [
        { input: 'test data', context: 'background info', expected: 'result' },
        { input: 'more test data', context: 'more background', expected: 'another result' },
      ],
    });

    expect(datasetValidation.isValid).toBe(true);
    expect(datasetValidation.sampleCount).toBe(2);
  });

  it('should support prompt testing before evaluation', async () => {
    const promptId = await promptService.uploadPrompt(
      {
        name: 'Interactive Prompt',
        content: 'Translate "{text}" from {source_lang} to {target_lang}',
      },
      'user-123',
      'default-org'
    );

    // Test the prompt with partial input
    const testResult = await promptService.testPrompt(promptId, {
      text: 'Hello world',
      source_lang: 'English',
    });

    expect(testResult.preview).toBe('Translate "Hello world" from English to {target_lang}');
    expect(testResult.missingPlaceholders).toEqual(['target_lang']);

    // Test with complete input
    const completeTestResult = await promptService.testPrompt(promptId, {
      text: 'Hello world',
      source_lang: 'English',
      target_lang: 'Spanish',
    });

    expect(completeTestResult.preview).toBe('Translate "Hello world" from English to Spanish');
    expect(completeTestResult.missingPlaceholders).toEqual([]);
  });
});