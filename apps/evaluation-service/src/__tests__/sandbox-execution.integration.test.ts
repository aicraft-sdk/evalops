/**
 * Integration tests for sandbox execution workflows.
 *
 * Tests the full path:
 *   Custom Evaluator Execution: evaluator → sandbox creation → code execution → cleanup
 *   Code Execution: code → sandbox creation → execution → cleanup
 *   Resource Limits: timeout, memory, CPU enforcement
 *   Network Isolation: egress policy enforcement
 *
 * Uses NestJS testing module with mocked external services (OpenSandbox server).
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import nock from 'nock';
import { SandboxExecutionService } from '../app/sandbox-execution/sandbox-execution.service';
import { CustomEvaluatorsRepository } from '@evalops/shared-db';
import { CoreClientService } from '../app/core-client/core-client.service';
import { HttpClientService } from '@evalops/shared-common';
import { ConfigService } from '@nestjs/config';
import { ExecutionResult } from '../app/sandbox-execution/sandbox-execution.dto';

const TEST_INTEGRATION_SERVICE_URL = 'http://localhost:3004';
const TEST_SANDBOX_ID = 'sandbox-123';
const TEST_EVALUATOR_ID = 'evaluator-123';
const TEST_ORG_ID = 'org-123';
const TEST_RUN_ID = 'run-123';

const mockEvaluator = {
  id: TEST_EVALUATOR_ID,
  name: 'Test Evaluator',
  version: '1.0.0',
  status: 'active' as const,
  executionType: 'sandbox' as const,
  fileName: 'evaluator.py',
  evaluatorType: 'custom',
  organizationId: TEST_ORG_ID,
  filePath: 'evaluators/evaluator-123.py',
  inputSchema: {
    type: 'object',
    required: ['prompt', 'response'],
    properties: {
      prompt: { type: 'string' },
      response: { type: 'string' },
    },
  },
  outputSchema: {
    type: 'object',
    required: ['score'],
    properties: {
      score: { type: 'number' },
    },
  },
  sandboxConfig: {},
  executionTimeout: 300,
};

const mockCustomEvaluatorsRepository = {
  findById: jest.fn().mockResolvedValue(mockEvaluator),
  createUsage: jest.fn().mockResolvedValue({}),
};

const mockCoreClient = {};

const mockHttpClient = {
  get: jest.fn(),
  post: jest.fn(),
  delete: jest.fn(),
};

const mockConfigService = {
  get: jest.fn().mockImplementation((key: string) => {
    const config: Record<string, string> = {
      INTEGRATION_SERVICE_URL: TEST_INTEGRATION_SERVICE_URL,
    };
    return config[key];
  }),
};

describe('Sandbox Execution Integration', () => {
  let app: INestApplication;
  let service: SandboxExecutionService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SandboxExecutionService,
        { provide: CustomEvaluatorsRepository, useValue: mockCustomEvaluatorsRepository },
        { provide: CoreClientService, useValue: mockCoreClient },
        { provide: HttpClientService, useValue: mockHttpClient },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    service = moduleRef.get<SandboxExecutionService>(SandboxExecutionService);
  });

  afterAll(async () => {
    await app.close();
    nock.cleanAll();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    nock.cleanAll();
    mockCustomEvaluatorsRepository.findById.mockResolvedValue(mockEvaluator);
  });

  describe('Custom Evaluator Workflow', () => {
    const TEST_INPUT = { prompt: 'Hello', response: 'Hi there' };
    const TEST_CODE = 'def evaluate(input): return {"score": 1.0}';

    it('should execute evaluator end-to-end', async () => {
      const executionResult: ExecutionResult = {
        output: { score: 1.0 },
        executionTime: 100,
        resourceUsage: {
          cpu: 0.5,
          memory: 256000,
        },
        exitCode: 0,
      };

      mockHttpClient.get.mockResolvedValue({ content: TEST_CODE });
      mockHttpClient.post
        .mockResolvedValueOnce({ sandboxId: TEST_SANDBOX_ID })
        .mockResolvedValueOnce(executionResult);
      mockHttpClient.delete.mockResolvedValue(undefined);

      const result = await service.executeCustomEvaluator(
        TEST_EVALUATOR_ID,
        TEST_INPUT,
        TEST_RUN_ID
      );

      expect(result).toMatchObject({
        evaluatorId: TEST_EVALUATOR_ID,
        runId: TEST_RUN_ID,
        score: 1.0,
      });
      expect(mockHttpClient.post).toHaveBeenCalledTimes(2);
      expect(mockHttpClient.delete).toHaveBeenCalled();
      expect(mockCustomEvaluatorsRepository.createUsage).toHaveBeenCalled();
    });

    it('should handle evaluator with input schema', async () => {
      const invalidInput = { prompt: 'Hello' };

      await expect(
        service.executeCustomEvaluator(TEST_EVALUATOR_ID, invalidInput)
      ).rejects.toThrow();

      expect(mockHttpClient.post).not.toHaveBeenCalled();
    });

    it('should handle evaluator with output schema', async () => {
      const executionResult: ExecutionResult = {
        output: { score: 0.9, metadata: { reason: 'Good response' } },
        executionTime: 150,
        resourceUsage: { cpu: 0.6, memory: 300000 },
        exitCode: 0,
      };

      mockHttpClient.get.mockResolvedValue({ content: TEST_CODE });
      mockHttpClient.post
        .mockResolvedValueOnce({ sandboxId: TEST_SANDBOX_ID })
        .mockResolvedValueOnce(executionResult);
      mockHttpClient.delete.mockResolvedValue(undefined);

      const result = await service.executeCustomEvaluator(
        TEST_EVALUATOR_ID,
        TEST_INPUT
      );

      expect(result.score).toBe(0.9);
    });

    it('should track evaluator usage', async () => {
      const executionResult: ExecutionResult = {
        output: { score: 1.0 },
        executionTime: 200,
        resourceUsage: { cpu: 0.5, memory: 256000 },
        exitCode: 0,
      };

      mockHttpClient.get.mockResolvedValue({ content: TEST_CODE });
      mockHttpClient.post
        .mockResolvedValueOnce({ sandboxId: TEST_SANDBOX_ID })
        .mockResolvedValueOnce(executionResult);
      mockHttpClient.delete.mockResolvedValue(undefined);

      await service.executeCustomEvaluator(TEST_EVALUATOR_ID, TEST_INPUT);

      expect(mockCustomEvaluatorsRepository.createUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          evaluatorId: TEST_EVALUATOR_ID,
          success: true,
          executionTime: 200,
        })
      );
    });

    it('should handle sandbox cleanup on error', async () => {
      mockHttpClient.get.mockResolvedValue({ content: TEST_CODE });
      mockHttpClient.post
        .mockResolvedValueOnce({ sandboxId: TEST_SANDBOX_ID })
        .mockRejectedValueOnce(new Error('Execution failed'));
      mockHttpClient.delete.mockResolvedValue(undefined);

      await expect(
        service.executeCustomEvaluator(TEST_EVALUATOR_ID, TEST_INPUT)
      ).rejects.toThrow();

      expect(mockHttpClient.delete).toHaveBeenCalled();
    });
  });

  describe('Code Execution Workflow', () => {
    const TEST_CODE = 'print("Hello, World!")';
    const TEST_LANGUAGE = 'python' as const;

    it('should execute Python code end-to-end', async () => {
      const executionResult: ExecutionResult = {
        output: 'Hello, World!',
        executionTime: 50,
        resourceUsage: {
          cpu: 0.3,
          memory: 128000,
        },
        exitCode: 0,
        logs: {
          stdout: ['Hello, World!'],
          stderr: [],
        },
      };

      mockHttpClient.post
        .mockResolvedValueOnce({ sandboxId: TEST_SANDBOX_ID })
        .mockResolvedValueOnce(executionResult);
      mockHttpClient.delete.mockResolvedValue(undefined);

      const result = await service.executeCode(
        TEST_CODE,
        TEST_LANGUAGE,
        undefined
      );

      expect(result).toEqual(executionResult);
      expect(mockHttpClient.post).toHaveBeenCalledTimes(2);
      expect(mockHttpClient.delete).toHaveBeenCalled();
    });

    it('should execute JavaScript code end-to-end', async () => {
      const jsCode = 'console.log("Hello");';
      const executionResult: ExecutionResult = {
        output: 'Hello',
        executionTime: 30,
        resourceUsage: { cpu: 0.2, memory: 64000 },
        exitCode: 0,
      };

      mockHttpClient.post
        .mockResolvedValueOnce({ sandboxId: TEST_SANDBOX_ID })
        .mockResolvedValueOnce(executionResult);
      mockHttpClient.delete.mockResolvedValue(undefined);

      const result = await service.executeCode(jsCode, 'javascript');

      expect(result).toEqual(executionResult);
    });

    it('should handle execution errors gracefully', async () => {
      mockHttpClient.post
        .mockResolvedValueOnce({ sandboxId: TEST_SANDBOX_ID })
        .mockRejectedValueOnce(new Error('Code execution failed'));
      mockHttpClient.delete.mockResolvedValue(undefined);

      await expect(
        service.executeCode(TEST_CODE, TEST_LANGUAGE)
      ).rejects.toThrow();

      expect(mockHttpClient.delete).toHaveBeenCalled();
    });

    it('should validate code before execution', async () => {
      const invalidCode = '';

      await expect(
        service.executeCode(invalidCode, TEST_LANGUAGE)
      ).rejects.toThrow();

      expect(mockHttpClient.post).not.toHaveBeenCalled();
    });
  });

  describe('Resource Limits', () => {
    const TEST_CODE = 'import time; time.sleep(1000)';
    const TEST_LANGUAGE = 'python' as const;

    it('should enforce timeout limits', async () => {
      const executionResult: ExecutionResult = {
        output: null,
        error: 'Execution timeout',
        executionTime: 300000,
        resourceUsage: { cpu: 1.0, memory: 512000 },
        exitCode: 124,
      };

      mockHttpClient.post
        .mockResolvedValueOnce({ sandboxId: TEST_SANDBOX_ID })
        .mockResolvedValueOnce(executionResult);
      mockHttpClient.delete.mockResolvedValue(undefined);

      const result = await service.executeCode(TEST_CODE, TEST_LANGUAGE);

      expect(result.exitCode).toBe(124);
      expect(result.error).toContain('timeout');
    });

    it('should enforce memory limits', async () => {
      const executionResult: ExecutionResult = {
        output: null,
        error: 'Memory limit exceeded',
        executionTime: 50,
        resourceUsage: { cpu: 0.5, memory: 2147483648 },
        exitCode: 137,
      };

      mockHttpClient.post
        .mockResolvedValueOnce({ sandboxId: TEST_SANDBOX_ID })
        .mockResolvedValueOnce(executionResult);
      mockHttpClient.delete.mockResolvedValue(undefined);

      const result = await service.executeCode(TEST_CODE, TEST_LANGUAGE);

      expect(result.exitCode).toBe(137);
      expect(result.error).toContain('Memory');
    });

    it('should enforce CPU limits', async () => {
      const executionResult: ExecutionResult = {
        output: null,
        error: 'CPU limit exceeded',
        executionTime: 100,
        resourceUsage: { cpu: 2.5, memory: 256000 },
        exitCode: 1,
      };

      mockHttpClient.post
        .mockResolvedValueOnce({ sandboxId: TEST_SANDBOX_ID })
        .mockResolvedValueOnce(executionResult);
      mockHttpClient.delete.mockResolvedValue(undefined);

      const result = await service.executeCode(TEST_CODE, TEST_LANGUAGE);

      expect(result.resourceUsage.cpu).toBeGreaterThan(2.0);
    });
  });

  describe('Sandbox Lifecycle', () => {
    const TEST_CODE = 'print("test")';
    const TEST_LANGUAGE = 'python' as const;

    it('should create sandbox before execution', async () => {
      const executionResult: ExecutionResult = {
        output: 'test',
        executionTime: 50,
        resourceUsage: { cpu: 0.3, memory: 128000 },
        exitCode: 0,
      };

      mockHttpClient.post
        .mockResolvedValueOnce({ sandboxId: TEST_SANDBOX_ID })
        .mockResolvedValueOnce(executionResult);
      mockHttpClient.delete.mockResolvedValue(undefined);

      await service.executeCode(TEST_CODE, TEST_LANGUAGE);

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/sandboxes'),
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should execute code in sandbox', async () => {
      const executionResult: ExecutionResult = {
        output: 'test',
        executionTime: 50,
        resourceUsage: { cpu: 0.3, memory: 128000 },
        exitCode: 0,
      };

      mockHttpClient.post
        .mockResolvedValueOnce({ sandboxId: TEST_SANDBOX_ID })
        .mockResolvedValueOnce(executionResult);
      mockHttpClient.delete.mockResolvedValue(undefined);

      await service.executeCode(TEST_CODE, TEST_LANGUAGE);

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        expect.stringContaining(`/api/sandboxes/${TEST_SANDBOX_ID}/execute`),
        expect.objectContaining({
          code: TEST_CODE,
          language: TEST_LANGUAGE,
        }),
        expect.any(Object)
      );
    });

    it('should delete sandbox after execution', async () => {
      const executionResult: ExecutionResult = {
        output: 'test',
        executionTime: 50,
        resourceUsage: { cpu: 0.3, memory: 128000 },
        exitCode: 0,
      };

      mockHttpClient.post
        .mockResolvedValueOnce({ sandboxId: TEST_SANDBOX_ID })
        .mockResolvedValueOnce(executionResult);
      mockHttpClient.delete.mockResolvedValue(undefined);

      await service.executeCode(TEST_CODE, TEST_LANGUAGE);

      expect(mockHttpClient.delete).toHaveBeenCalledWith(
        expect.stringContaining(`/api/sandboxes/${TEST_SANDBOX_ID}`),
        expect.any(Object)
      );
    });

    it('should delete sandbox even on execution error', async () => {
      mockHttpClient.post
        .mockResolvedValueOnce({ sandboxId: TEST_SANDBOX_ID })
        .mockRejectedValueOnce(new Error('Execution failed'));
      mockHttpClient.delete.mockResolvedValue(undefined);

      await expect(
        service.executeCode(TEST_CODE, TEST_LANGUAGE)
      ).rejects.toThrow();

      expect(mockHttpClient.delete).toHaveBeenCalled();
    });
  });

  describe('Network Isolation', () => {
    it('should enforce network egress policy', async () => {
      const codeWithNetworkCall = `
import requests
response = requests.get("http://malicious-site.com")
`;

      const executionResult: ExecutionResult = {
        output: null,
        error: 'Network egress denied: Domain not in allowlist',
        executionTime: 10,
        resourceUsage: { cpu: 0.1, memory: 64000 },
        exitCode: 1,
      };

      mockHttpClient.post
        .mockResolvedValueOnce({ sandboxId: TEST_SANDBOX_ID })
        .mockResolvedValueOnce(executionResult);
      mockHttpClient.delete.mockResolvedValue(undefined);

      const result = await service.executeCode(codeWithNetworkCall, 'python');

      expect(result.error).toContain('Network egress denied');
    });
  });
});
