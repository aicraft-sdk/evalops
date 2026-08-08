import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SandboxExecutionService } from './sandbox-execution.service';
import { HttpClientService } from '@evalops/shared-common';
import { CustomEvaluatorsRepository } from '@evalops/shared-db';
import { CoreClientService } from '../core-client/core-client.service';
import {
  ExecutionResult,
  SandboxConfig,
  EvaluationResult,
} from './sandbox-execution.dto';

describe('SandboxExecutionService', () => {
  let service: SandboxExecutionService;
  let httpClient: jest.Mocked<HttpClientService>;
  let configService: jest.Mocked<ConfigService>;
  let customEvaluatorsRepository: jest.Mocked<CustomEvaluatorsRepository>;
  let coreClient: jest.Mocked<CoreClientService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SandboxExecutionService,
        {
          provide: HttpClientService,
          useValue: {
            post: jest.fn(),
            get: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: CustomEvaluatorsRepository,
          useValue: {
            findById: jest.fn(),
            createUsage: jest.fn(),
          },
        },
        {
          provide: CoreClientService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<SandboxExecutionService>(SandboxExecutionService);
    httpClient = module.get(HttpClientService);
    configService = module.get(ConfigService);
    customEvaluatorsRepository = module.get(CustomEvaluatorsRepository);
    coreClient = module.get(CoreClientService);

    configService.get.mockImplementation((key: string) => {
      const defaults: Record<string, any> = {
        CORE_SERVICE_URL: 'http://localhost:3002',
      };
      return defaults[key];
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('executeCustomEvaluator', () => {
    const TEST_EVALUATOR_ID = 'evaluator-123';
    const TEST_RUN_ID = 'run-123';
    const TEST_INPUT = { prompt: 'Hello', response: 'Hi there' };
    const TEST_ORG_ID = 'org-123';
    const TEST_SANDBOX_ID = 'sandbox-123';
    const TEST_CODE = 'def evaluate(input): return {"score": 1.0}';
    const TEST_FILE_PATH = 'evaluators/evaluator-123.py';

    const mockEvaluator = {
      id: TEST_EVALUATOR_ID,
      name: 'Test Evaluator',
      version: '1.0.0',
      status: 'active' as const,
      executionType: 'sandbox' as const,
      fileName: 'evaluator.py',
      evaluatorType: 'custom',
      organizationId: TEST_ORG_ID,
      filePath: TEST_FILE_PATH,
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

    it('should execute active evaluator successfully', async () => {
      const executionResult: ExecutionResult = {
        output: { score: 1.0 },
        executionTime: 100,
        resourceUsage: {
          cpu: 0.5,
          memory: 256000,
        },
        exitCode: 0,
      };

      customEvaluatorsRepository.findById.mockResolvedValue(mockEvaluator as any);
      httpClient.get.mockResolvedValue({ content: TEST_CODE });
      httpClient.post
        .mockResolvedValueOnce({ sandboxId: TEST_SANDBOX_ID })
        .mockResolvedValueOnce(executionResult);
      httpClient.delete.mockResolvedValue(undefined);
      customEvaluatorsRepository.createUsage.mockResolvedValue({} as any);

      const result = await service.executeCustomEvaluator(
        TEST_EVALUATOR_ID,
        TEST_INPUT,
        TEST_RUN_ID
      );

      expect(result).toMatchObject({
        evaluatorId: TEST_EVALUATOR_ID,
        runId: TEST_RUN_ID,
        score: 1.0,
        output: { score: 1.0 },
      });
      expect(result.metadata).toMatchObject({
        evaluatorName: 'Test Evaluator',
        evaluatorVersion: '1.0.0',
        executionType: 'sandbox',
      });
      expect(customEvaluatorsRepository.createUsage).toHaveBeenCalled();
    });

    it('should throw NotFoundException for missing evaluator', async () => {
      customEvaluatorsRepository.findById.mockResolvedValue(undefined);

      await expect(
        service.executeCustomEvaluator(TEST_EVALUATOR_ID, TEST_INPUT)
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for inactive evaluator', async () => {
      const inactiveEvaluator = {
        ...mockEvaluator,
        status: 'pending_validation' as const,
      };

      customEvaluatorsRepository.findById.mockResolvedValue(
        inactiveEvaluator as any
      );

      await expect(
        service.executeCustomEvaluator(TEST_EVALUATOR_ID, TEST_INPUT)
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate input against schema', async () => {
      const invalidInput = { prompt: 'Hello' };

      customEvaluatorsRepository.findById.mockResolvedValue(mockEvaluator as any);

      await expect(
        service.executeCustomEvaluator(TEST_EVALUATOR_ID, invalidInput)
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate output against schema', async () => {
      const executionResult: ExecutionResult = {
        output: { invalid: 'output' },
        executionTime: 100,
        resourceUsage: { cpu: 0.5, memory: 256000 },
        exitCode: 0,
      };

      customEvaluatorsRepository.findById.mockResolvedValue(mockEvaluator as any);
      httpClient.get.mockResolvedValue({ content: TEST_CODE });
      httpClient.post
        .mockResolvedValueOnce({ sandboxId: TEST_SANDBOX_ID })
        .mockResolvedValueOnce(executionResult);
      httpClient.delete.mockResolvedValue(undefined);
      customEvaluatorsRepository.createUsage.mockResolvedValue({} as any);

      const result = await service.executeCustomEvaluator(
        TEST_EVALUATOR_ID,
        TEST_INPUT
      );

      expect(result).toBeDefined();
    });

    it('should handle sandbox cleanup on error', async () => {
      customEvaluatorsRepository.findById.mockResolvedValue(mockEvaluator as any);
      httpClient.get.mockResolvedValue({ content: TEST_CODE });
      httpClient.post
        .mockResolvedValueOnce({ sandboxId: TEST_SANDBOX_ID })
        .mockRejectedValueOnce(new Error('Execution failed'));
      httpClient.delete.mockResolvedValue(undefined);

      await expect(
        service.executeCustomEvaluator(TEST_EVALUATOR_ID, TEST_INPUT)
      ).rejects.toThrow();

      expect(httpClient.delete).toHaveBeenCalledWith(
        expect.stringContaining(TEST_SANDBOX_ID),
        expect.any(Object)
      );
    });

    it('should track evaluator usage on success', async () => {
      const executionResult: ExecutionResult = {
        output: { score: 1.0 },
        executionTime: 150,
        resourceUsage: { cpu: 0.5, memory: 256000 },
        exitCode: 0,
      };

      customEvaluatorsRepository.findById.mockResolvedValue(mockEvaluator as any);
      httpClient.get.mockResolvedValue({ content: TEST_CODE });
      httpClient.post
        .mockResolvedValueOnce({ sandboxId: TEST_SANDBOX_ID })
        .mockResolvedValueOnce(executionResult);
      httpClient.delete.mockResolvedValue(undefined);
      customEvaluatorsRepository.createUsage.mockResolvedValue({} as any);

      await service.executeCustomEvaluator(TEST_EVALUATOR_ID, TEST_INPUT);

      expect(customEvaluatorsRepository.createUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          evaluatorId: TEST_EVALUATOR_ID,
          success: true,
          executionTime: 150,
        })
      );
    });

    it('should track evaluator usage on failure', async () => {
      customEvaluatorsRepository.findById.mockResolvedValue(mockEvaluator as any);
      httpClient.get.mockResolvedValue({ content: TEST_CODE });
      httpClient.post
        .mockResolvedValueOnce({ sandboxId: TEST_SANDBOX_ID })
        .mockRejectedValueOnce(new Error('Execution failed'));
      httpClient.delete.mockResolvedValue(undefined);
      customEvaluatorsRepository.createUsage.mockResolvedValue({} as any);

      await expect(
        service.executeCustomEvaluator(TEST_EVALUATOR_ID, TEST_INPUT)
      ).rejects.toThrow();

      expect(customEvaluatorsRepository.createUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          evaluatorId: TEST_EVALUATOR_ID,
          success: false,
          errorMessage: expect.any(String),
        })
      );
    });
  });

  describe('executeCode', () => {
    const TEST_CODE = 'print("Hello")';
    const TEST_LANGUAGE = 'python' as const;
    const TEST_INPUT = { value: 42 };
    const TEST_SANDBOX_ID = 'sandbox-123';

    it('should execute Python code', async () => {
      const executionResult: ExecutionResult = {
        output: 'Hello',
        executionTime: 50,
        resourceUsage: {
          cpu: 0.3,
          memory: 128000,
        },
        exitCode: 0,
      };

      httpClient.post
        .mockResolvedValueOnce({ sandboxId: TEST_SANDBOX_ID })
        .mockResolvedValueOnce(executionResult);
      httpClient.delete.mockResolvedValue(undefined);

      const result = await service.executeCode(
        TEST_CODE,
        TEST_LANGUAGE,
        TEST_INPUT
      );

      expect(result).toEqual(executionResult);
      expect(httpClient.post).toHaveBeenCalledTimes(2);
      expect(httpClient.delete).toHaveBeenCalled();
    });

    it('should execute JavaScript code', async () => {
      const jsCode = 'console.log("Hello");';
      const executionResult: ExecutionResult = {
        output: 'Hello',
        executionTime: 30,
        resourceUsage: { cpu: 0.2, memory: 64000 },
        exitCode: 0,
      };

      httpClient.post
        .mockResolvedValueOnce({ sandboxId: TEST_SANDBOX_ID })
        .mockResolvedValueOnce(executionResult);
      httpClient.delete.mockResolvedValue(undefined);

      const result = await service.executeCode(jsCode, 'javascript');

      expect(result).toEqual(executionResult);
    });

    it('should clean up sandbox after execution', async () => {
      const executionResult: ExecutionResult = {
        output: 'result',
        executionTime: 100,
        resourceUsage: { cpu: 0.5, memory: 256000 },
        exitCode: 0,
      };

      httpClient.post
        .mockResolvedValueOnce({ sandboxId: TEST_SANDBOX_ID })
        .mockResolvedValueOnce(executionResult);
      httpClient.delete.mockResolvedValue(undefined);

      await service.executeCode(TEST_CODE, TEST_LANGUAGE);

      expect(httpClient.delete).toHaveBeenCalledWith(
        expect.stringContaining(TEST_SANDBOX_ID),
        expect.any(Object)
      );
    });

    it('should clean up sandbox even on error', async () => {
      httpClient.post
        .mockResolvedValueOnce({ sandboxId: TEST_SANDBOX_ID })
        .mockRejectedValueOnce(new Error('Execution failed'));
      httpClient.delete.mockResolvedValue(undefined);

      await expect(
        service.executeCode(TEST_CODE, TEST_LANGUAGE)
      ).rejects.toThrow();

      expect(httpClient.delete).toHaveBeenCalled();
    });

    it('should use custom sandbox config', async () => {
      const config: SandboxConfig = {
        cpu: '2.0',
        memory: '1Gi',
        timeout: 600,
      };

      const executionResult: ExecutionResult = {
        output: 'result',
        executionTime: 100,
        resourceUsage: { cpu: 1.0, memory: 512000 },
        exitCode: 0,
      };

      httpClient.post
        .mockResolvedValueOnce({ sandboxId: TEST_SANDBOX_ID })
        .mockResolvedValueOnce(executionResult);
      httpClient.delete.mockResolvedValue(undefined);

      await service.executeCode(TEST_CODE, TEST_LANGUAGE, undefined, config);

      expect(httpClient.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/sandboxes'),
        expect.objectContaining({ config }),
        expect.any(Object)
      );
    });
  });

  describe('validateCode', () => {
    it('should reject empty code', () => {
      const result = service.validateCode('', 'python');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Code cannot be empty');
    });

    it('should reject oversized code', () => {
      const largeCode = 'x'.repeat(100001);
      const result = service.validateCode(largeCode, 'python');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Code exceeds maximum length of 100,000 characters'
      );
    });

    it('should accept valid Python code', () => {
      const code = 'def hello(): return "world"';
      const result = service.validateCode(code, 'python');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept valid JavaScript code', () => {
      const code = 'function hello() { return "world"; }';
      const result = service.validateCode(code, 'javascript');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should warn about markdown code blocks in Python', () => {
      const code = '```python\ndef hello(): return "world"\n```';
      const result = service.validateCode(code, 'python');

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain(
        'Code appears to contain markdown code blocks'
      );
    });

    it('should warn about markdown code blocks in JavaScript', () => {
      const code = '```javascript\nconsole.log("hello");\n```';
      const result = service.validateCode(code, 'javascript');

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain(
        'Code appears to contain markdown code blocks'
      );
    });
  });

  describe('validateAgainstSchema', () => {
    it('should validate object with required fields', () => {
      const schema = {
        type: 'object',
        required: ['name', 'age'],
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      };

      const validValue = { name: 'John', age: 30 };
      const result = service['validateAgainstSchema'](validValue, schema);

      expect(result.valid).toBe(true);
    });

    it('should reject object missing required fields', () => {
      const schema = {
        type: 'object',
        required: ['name', 'age'],
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      };

      const invalidValue = { name: 'John' };
      const result = service['validateAgainstSchema'](invalidValue, schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: age');
    });

    it('should validate property types', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
          active: { type: 'boolean' },
          tags: { type: 'array' },
        },
      };

      const validValue = {
        name: 'John',
        age: 30,
        active: true,
        tags: ['tag1', 'tag2'],
      };
      const result = service['validateAgainstSchema'](validValue, schema);

      expect(result.valid).toBe(true);
    });

    it('should reject invalid property types', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      };

      const invalidValue = { name: 123, age: 'thirty' };
      const result = service['validateAgainstSchema'](invalidValue, schema);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate simple string type', () => {
      const schema = { type: 'string' };
      const result = service['validateAgainstSchema']('hello', schema);

      expect(result.valid).toBe(true);
    });

    it('should reject non-string for string type', () => {
      const schema = { type: 'string' };
      const result = service['validateAgainstSchema'](123, schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Value must be a string');
    });
  });

  describe('retrieveEvaluatorCode', () => {
    const TEST_FILE_PATH = 'evaluators/evaluator-123.py';
    const TEST_CODE = 'def evaluate(input): return {"score": 1.0}';

    it('should retrieve evaluator code successfully', async () => {
      httpClient.get.mockResolvedValue({ content: TEST_CODE });

      const result = await service['retrieveEvaluatorCode'](TEST_FILE_PATH);

      expect(result).toBe(TEST_CODE);
      expect(httpClient.get).toHaveBeenCalledWith(
        expect.stringContaining(encodeURIComponent(TEST_FILE_PATH)),
        expect.any(Object)
      );
    });

    it('should throw NotFoundException for missing file', async () => {
      const error: any = new Error('Not found');
      error.response = { status: 404 };
      httpClient.get.mockRejectedValue(error);

      await expect(
        service['retrieveEvaluatorCode'](TEST_FILE_PATH)
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw InternalServerErrorException for empty content', async () => {
      httpClient.get.mockResolvedValue({ content: '' });

      await expect(
        service['retrieveEvaluatorCode'](TEST_FILE_PATH)
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw InternalServerErrorException on download error', async () => {
      const error = new Error('Download failed');
      httpClient.get.mockRejectedValue(error);

      await expect(
        service['retrieveEvaluatorCode'](TEST_FILE_PATH)
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('determineLanguage', () => {
    it('should detect Python from .py extension', () => {
      const result = service['determineLanguage']('evaluator.py', undefined);

      expect(result).toBe('python');
    });

    it('should detect JavaScript from .js extension', () => {
      const result = service['determineLanguage']('evaluator.js', undefined);

      expect(result).toBe('javascript');
    });

    it('should detect JavaScript from .ts extension', () => {
      const result = service['determineLanguage']('evaluator.ts', undefined);

      expect(result).toBe('javascript');
    });

    it('should fallback to Python for unknown extensions', () => {
      const result = service['determineLanguage']('evaluator.txt', undefined);

      expect(result).toBe('python');
    });

    it('should fallback to Python when no extension', () => {
      const result = service['determineLanguage']('evaluator', undefined);

      expect(result).toBe('python');
    });
  });

  describe('extractScore', () => {
    it('should extract score from number output', () => {
      const result = service['extractScore'](0.85);

      expect(result).toBe(0.85);
    });

    it('should extract score from object with score field', () => {
      const result = service['extractScore']({ score: 0.9 });

      expect(result).toBe(0.9);
    });

    it('should extract score from object with result field', () => {
      const result = service['extractScore']({ result: 0.8 });

      expect(result).toBe(0.8);
    });

    it('should extract score from object with value field', () => {
      const result = service['extractScore']({ value: 0.75 });

      expect(result).toBe(0.75);
    });

    it('should return undefined for object without score fields', () => {
      const result = service['extractScore']({ data: 'test' });

      expect(result).toBeUndefined();
    });

    it('should return undefined for string output', () => {
      const result = service['extractScore']('test');

      expect(result).toBeUndefined();
    });
  });
});
