import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SandboxService } from './sandbox.service';
import { HttpClientService } from '@evalops/shared-common';
import { SandboxSecurityService } from './sandbox-security.service';
import { SandboxAuditService } from './sandbox-audit.service';
import { SandboxMonitoringService } from './sandbox-monitoring.service';
import { SandboxPolicies } from './sandbox-policies';
import {
  SandboxConfig,
  ExecutionResult,
  SandboxStatusResponse,
  CreateSandboxResponse,
} from './sandbox.dto';

describe('SandboxService', () => {
  let service: SandboxService;
  let httpClient: jest.Mocked<HttpClientService>;
  let configService: jest.Mocked<ConfigService>;
  let securityService: jest.Mocked<SandboxSecurityService>;
  let auditService: jest.Mocked<SandboxAuditService>;
  let monitoringService: jest.Mocked<SandboxMonitoringService>;
  let policies: jest.Mocked<SandboxPolicies>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SandboxService,
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
          provide: SandboxSecurityService,
          useValue: {
            checkResourceLimits: jest.fn(),
            validateCode: jest.fn(),
            validateCodeWithAST: jest.fn(),
            scanForSecurityIssues: jest.fn(),
            sanitizeInput: jest.fn(),
            updateResourceUsage: jest.fn(),
          },
        },
        {
          provide: SandboxAuditService,
          useValue: {
            logCreation: jest.fn(),
            logExecution: jest.fn(),
            logDeletion: jest.fn(),
            logSecurityViolation: jest.fn(),
          },
        },
        {
          provide: SandboxMonitoringService,
          useValue: {
            recordCreation: jest.fn(),
            recordExecution: jest.fn(),
            recordSecurityViolation: jest.fn(),
            detectAnomalies: jest.fn(),
          },
        },
        {
          provide: SandboxPolicies,
          useValue: {
            getNetworkPolicy: jest.fn(),
            validateDomain: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SandboxService>(SandboxService);
    httpClient = module.get(HttpClientService);
    configService = module.get(ConfigService);
    securityService = module.get(SandboxSecurityService);
    auditService = module.get(SandboxAuditService);
    monitoringService = module.get(SandboxMonitoringService);
    policies = module.get(SandboxPolicies);

    // Setup default config values
    configService.get.mockImplementation((key: string) => {
      const defaults: Record<string, any> = {
        OPENSANDBOX_SERVER_URL: 'http://localhost:8080',
        OPENSANDBOX_API_KEY: 'test-api-key',
        OPENSANDBOX_DEFAULT_CPU: '1.0',
        OPENSANDBOX_DEFAULT_MEMORY: '512Mi',
        OPENSANDBOX_DEFAULT_TIMEOUT: 300,
      };
      return defaults[key];
    });

    // Setup default policy mocks
    policies.getNetworkPolicy.mockReturnValue({
      egressPolicy: 'restricted',
      allowedDomains: ['api.openai.com'],
      blockedDomains: ['localhost'],
      blockedIPRanges: ['10.0.0.0/8'],
    });

    policies.validateDomain.mockReturnValue({ allowed: true });

    securityService.checkResourceLimits.mockReturnValue({
      valid: true,
      errors: [],
      warnings: [],
    });

    securityService.validateCode.mockReturnValue({
      valid: true,
      errors: [],
      warnings: [],
    });

    securityService.scanForSecurityIssues.mockReturnValue([]);
    securityService.sanitizeInput.mockImplementation((input) => input);
    securityService.updateResourceUsage.mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createSandbox', () => {
    const TEST_SANDBOX_ID = 'sandbox-123';
    const TEST_USER_ID = 'user-123';
    const TEST_ORG_ID = 'org-123';
    const TEST_REQUEST_ID = 'req-123';

    it('should create sandbox with default config', async () => {
      const response: CreateSandboxResponse = {
        sandboxId: TEST_SANDBOX_ID,
        status: 'creating' as any,
      };

      httpClient.post.mockResolvedValue(response);
      auditService.logCreation.mockResolvedValue('audit-log-id');
      monitoringService.recordCreation.mockImplementation(() => {});

      const result = await service.createSandbox(
        undefined,
        TEST_USER_ID,
        TEST_ORG_ID,
        TEST_REQUEST_ID
      );

      expect(result).toBe(TEST_SANDBOX_ID);
      expect(httpClient.post).toHaveBeenCalledWith(
        'http://localhost:8080/sandboxes',
        expect.objectContaining({
          config: expect.objectContaining({
            cpu: '1.0',
            memory: '512Mi',
            timeout: 300,
            network_policy: 'deny_all',
            allowed_domains: [],
          }),
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        })
      );
      expect(auditService.logCreation).toHaveBeenCalledWith(
        TEST_SANDBOX_ID,
        TEST_USER_ID,
        TEST_ORG_ID,
        TEST_REQUEST_ID
      );
      expect(monitoringService.recordCreation).toHaveBeenCalledWith(
        TEST_ORG_ID
      );
    });

    it('should create sandbox with custom config', async () => {
      const customConfig: SandboxConfig = {
        cpu: '2.0',
        memory: '1Gi',
        timeout: 600,
        networkPolicy: 'restricted',
        allowedDomains: ['api.openai.com'],
      };

      const response: CreateSandboxResponse = {
        sandboxId: TEST_SANDBOX_ID,
        status: 'creating' as any,
      };

      httpClient.post.mockResolvedValue(response);

      const result = await service.createSandbox(
        customConfig,
        TEST_USER_ID,
        TEST_ORG_ID
      );

      expect(result).toBe(TEST_SANDBOX_ID);
      expect(httpClient.post).toHaveBeenCalledWith(
        'http://localhost:8080/sandboxes',
        expect.objectContaining({
          config: expect.objectContaining({
            cpu: '2.0',
            memory: '1Gi',
            timeout: 600,
            network_policy: 'restricted',
            allowed_domains: ['api.openai.com'],
          }),
        }),
        expect.any(Object)
      );
    });

    it('should validate resource limits', async () => {
      const invalidConfig: SandboxConfig = {
        cpu: '5.0',
        memory: '10Gi',
        timeout: 1200,
      };

      securityService.checkResourceLimits.mockReturnValue({
        valid: false,
        errors: ['CPU limit exceeds maximum', 'Memory limit exceeds maximum'],
        warnings: [],
      });

      await expect(
        service.createSandbox(invalidConfig, TEST_USER_ID, TEST_ORG_ID)
      ).rejects.toThrow(BadRequestException);

      expect(auditService.logSecurityViolation).toHaveBeenCalled();
    });

    it('should validate network policy domains', async () => {
      const config: SandboxConfig = {
        networkPolicy: 'restricted',
        allowedDomains: ['malicious-site.com'],
      };

      policies.validateDomain.mockReturnValue({
        allowed: false,
        reason: 'Domain malicious-site.com is not in allowlist',
      });

      await expect(
        service.createSandbox(config, TEST_USER_ID, TEST_ORG_ID)
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException on invalid config', async () => {
      const invalidConfig: SandboxConfig = {
        cpu: 'invalid',
      };

      securityService.checkResourceLimits.mockReturnValue({
        valid: false,
        errors: ['Invalid CPU value: invalid'],
        warnings: [],
      });

      await expect(
        service.createSandbox(invalidConfig, TEST_USER_ID, TEST_ORG_ID)
      ).rejects.toThrow(BadRequestException);
    });

    it('should retry on transient errors', async () => {
      const response: CreateSandboxResponse = {
        sandboxId: TEST_SANDBOX_ID,
        status: 'creating' as any,
      };

      httpClient.post
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(response);

      const result = await service.createSandbox(
        undefined,
        TEST_USER_ID,
        TEST_ORG_ID
      );

      expect(result).toBe(TEST_SANDBOX_ID);
      expect(httpClient.post).toHaveBeenCalledTimes(3);
    });

    it('should throw UnauthorizedException on 401', async () => {
      const error = new Error('401 Unauthorized');
      httpClient.post.mockRejectedValue(error);

      await expect(
        service.createSandbox(undefined, TEST_USER_ID, TEST_ORG_ID)
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw NotFoundException on 404', async () => {
      const error = new Error('404 not found');
      httpClient.post.mockRejectedValue(error);

      await expect(
        service.createSandbox(undefined, TEST_USER_ID, TEST_ORG_ID)
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException on 400', async () => {
      const error = new Error('400 bad request');
      httpClient.post.mockRejectedValue(error);

      await expect(
        service.createSandbox(undefined, TEST_USER_ID, TEST_ORG_ID)
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw InternalServerErrorException after max retries', async () => {
      const error = new Error('Server error');
      httpClient.post.mockRejectedValue(error);

      await expect(
        service.createSandbox(undefined, TEST_USER_ID, TEST_ORG_ID)
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('executeCode', () => {
    const TEST_SANDBOX_ID = 'sandbox-123';
    const TEST_CODE = 'print("Hello, World!")';
    const TEST_LANGUAGE = 'python' as const;
    const TEST_INPUT = { value: 42 };
    const TEST_USER_ID = 'user-123';
    const TEST_ORG_ID = 'org-123';
    const TEST_REQUEST_ID = 'req-123';

    it('should execute valid Python code', async () => {
      const response: ExecutionResult = {
        output: 'Hello, World!',
        executionTime: 100,
        resourceUsage: {
          cpu: 0.5,
          memory: 256000,
        },
        exitCode: 0,
        logs: {
          stdout: ['Hello, World!'],
          stderr: [],
        },
      };

      httpClient.post.mockResolvedValue(response);
      auditService.logExecution.mockResolvedValue('audit-log-id');
      monitoringService.recordExecution.mockImplementation(() => {});
      monitoringService.detectAnomalies.mockResolvedValue({
        hasAnomalies: false,
        anomalies: [],
      });

      const result = await service.executeCode(
        TEST_SANDBOX_ID,
        TEST_CODE,
        TEST_LANGUAGE,
        TEST_INPUT,
        TEST_USER_ID,
        TEST_ORG_ID,
        TEST_REQUEST_ID
      );

      expect(result).toEqual(response);
      expect(httpClient.post).toHaveBeenCalledWith(
        `http://localhost:8080/sandboxes/${TEST_SANDBOX_ID}/execute`,
        expect.objectContaining({
          code: TEST_CODE,
          language: TEST_LANGUAGE,
          input: TEST_INPUT,
        }),
        expect.any(Object)
      );
      expect(securityService.validateCode).toHaveBeenCalledWith(
        TEST_CODE,
        TEST_LANGUAGE
      );
      expect(auditService.logExecution).toHaveBeenCalled();
      expect(monitoringService.recordExecution).toHaveBeenCalled();
    });

    it('should execute valid JavaScript code', async () => {
      const jsCode = 'console.log("Hello");';
      const response: ExecutionResult = {
        output: 'Hello',
        executionTime: 50,
        resourceUsage: {
          cpu: 0.3,
          memory: 128000,
        },
        exitCode: 0,
      };

      httpClient.post.mockResolvedValue(response);
      monitoringService.detectAnomalies.mockResolvedValue({
        hasAnomalies: false,
        anomalies: [],
      });

      const result = await service.executeCode(
        TEST_SANDBOX_ID,
        jsCode,
        'javascript',
        undefined,
        TEST_USER_ID,
        TEST_ORG_ID
      );

      expect(result).toEqual(response);
      expect(securityService.validateCode).toHaveBeenCalledWith(
        jsCode,
        'javascript'
      );
    });

    it('should validate code before execution', async () => {
      const dangerousCode = 'import os; os.system("rm -rf /")';

      securityService.validateCode.mockReturnValue({
        valid: false,
        errors: ['Blocked Python import/operation detected: os.system'],
        warnings: [],
      });

      await expect(
        service.executeCode(
          TEST_SANDBOX_ID,
          dangerousCode,
          TEST_LANGUAGE,
          undefined,
          TEST_USER_ID,
          TEST_ORG_ID
        )
      ).rejects.toThrow(BadRequestException);

      expect(auditService.logSecurityViolation).toHaveBeenCalled();
      expect(httpClient.post).not.toHaveBeenCalled();
    });

    it('should reject dangerous code patterns', async () => {
      const dangerousCode = 'eval("malicious code")';

      securityService.validateCode.mockReturnValue({
        valid: true,
        errors: [],
        warnings: [],
      });

      securityService.scanForSecurityIssues.mockReturnValue([
        {
          severity: 'error',
          type: 'code_injection',
          message: 'eval() can execute arbitrary code',
          line: 1,
        },
      ]);

      await expect(
        service.executeCode(
          TEST_SANDBOX_ID,
          dangerousCode,
          TEST_LANGUAGE,
          undefined,
          TEST_USER_ID,
          TEST_ORG_ID
        )
      ).rejects.toThrow(BadRequestException);
    });

    it('should track resource usage', async () => {
      const response: ExecutionResult = {
        output: 'result',
        executionTime: 200,
        resourceUsage: {
          cpu: 1.0,
          memory: 512000,
        },
        exitCode: 0,
      };

      httpClient.post.mockResolvedValue(response);
      monitoringService.detectAnomalies.mockResolvedValue({
        hasAnomalies: false,
        anomalies: [],
      });

      await service.executeCode(
        TEST_SANDBOX_ID,
        TEST_CODE,
        TEST_LANGUAGE,
        undefined,
        TEST_USER_ID,
        TEST_ORG_ID
      );

      expect(securityService.updateResourceUsage).toHaveBeenCalledWith(
        TEST_SANDBOX_ID,
        {
          cpu: 1.0,
          memory: 512000,
          executionTime: 200,
        }
      );
    });

    it('should log audit events', async () => {
      const response: ExecutionResult = {
        output: 'result',
        executionTime: 150,
        resourceUsage: {
          cpu: 0.8,
          memory: 256000,
        },
        exitCode: 0,
      };

      httpClient.post.mockResolvedValue(response);
      monitoringService.detectAnomalies.mockResolvedValue({
        hasAnomalies: false,
        anomalies: [],
      });

      await service.executeCode(
        TEST_SANDBOX_ID,
        TEST_CODE,
        TEST_LANGUAGE,
        undefined,
        TEST_USER_ID,
        TEST_ORG_ID,
        TEST_REQUEST_ID
      );

      expect(auditService.logExecution).toHaveBeenCalledWith(
        TEST_SANDBOX_ID,
        TEST_USER_ID,
        TEST_ORG_ID,
        TEST_CODE,
        expect.objectContaining({
          executionTime: 150,
        }),
        undefined,
        TEST_REQUEST_ID
      );
    });

    it('should use AST validation when enabled', async () => {
      const response: ExecutionResult = {
        output: 'result',
        executionTime: 100,
        resourceUsage: { cpu: 0.5, memory: 128000 },
        exitCode: 0,
      };

      securityService.validateCodeWithAST.mockResolvedValue({
        valid: true,
        errors: [],
        warnings: [],
      });

      httpClient.post.mockResolvedValue(response);
      monitoringService.detectAnomalies.mockResolvedValue({
        hasAnomalies: false,
        anomalies: [],
      });

      await service.executeCode(
        TEST_SANDBOX_ID,
        TEST_CODE,
        TEST_LANGUAGE,
        undefined,
        TEST_USER_ID,
        TEST_ORG_ID
      );

      expect(securityService.validateCodeWithAST).toHaveBeenCalledWith(
        TEST_CODE,
        TEST_LANGUAGE
      );
    });

    it('should fallback to pattern validation if AST fails', async () => {
      const response: ExecutionResult = {
        output: 'result',
        executionTime: 100,
        resourceUsage: { cpu: 0.5, memory: 128000 },
        exitCode: 0,
      };

      securityService.validateCodeWithAST.mockRejectedValue(
        new Error('AST parser not available')
      );

      httpClient.post.mockResolvedValue(response);
      monitoringService.detectAnomalies.mockResolvedValue({
        hasAnomalies: false,
        anomalies: [],
      });

      await service.executeCode(
        TEST_SANDBOX_ID,
        TEST_CODE,
        TEST_LANGUAGE,
        undefined,
        TEST_USER_ID,
        TEST_ORG_ID
      );

      expect(securityService.validateCode).toHaveBeenCalled();
    });
  });

  describe('deleteSandbox', () => {
    const TEST_SANDBOX_ID = 'sandbox-123';
    const TEST_USER_ID = 'user-123';
    const TEST_ORG_ID = 'org-123';
    const TEST_REQUEST_ID = 'req-123';

    it('should delete sandbox successfully', async () => {
      httpClient.delete.mockResolvedValue(undefined);
      auditService.logDeletion.mockResolvedValue('audit-log-id');

      await service.deleteSandbox(
        TEST_SANDBOX_ID,
        TEST_USER_ID,
        TEST_ORG_ID,
        TEST_REQUEST_ID
      );

      expect(httpClient.delete).toHaveBeenCalledWith(
        `http://localhost:8080/sandboxes/${TEST_SANDBOX_ID}`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        })
      );
      expect(auditService.logDeletion).toHaveBeenCalledWith(
        TEST_SANDBOX_ID,
        TEST_USER_ID,
        TEST_ORG_ID,
        TEST_REQUEST_ID
      );
    });

    it('should throw NotFoundException on 404', async () => {
      const error = new Error('404 not found');
      httpClient.delete.mockRejectedValue(error);

      await expect(
        service.deleteSandbox(TEST_SANDBOX_ID, TEST_USER_ID, TEST_ORG_ID)
      ).rejects.toThrow(NotFoundException);
    });

    it('should retry on transient errors', async () => {
      httpClient.delete
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(undefined);

      await service.deleteSandbox(TEST_SANDBOX_ID, TEST_USER_ID, TEST_ORG_ID);

      expect(httpClient.delete).toHaveBeenCalledTimes(2);
    });
  });

  describe('getSandboxStatus', () => {
    const TEST_SANDBOX_ID = 'sandbox-123';

    it('should get sandbox status successfully', async () => {
      const response: SandboxStatusResponse = {
        sandboxId: TEST_SANDBOX_ID,
        status: 'running' as any,
        createdAt: new Date(),
        resourceUsage: {
          cpu: 0.5,
          memory: 256000,
        },
      };

      httpClient.get.mockResolvedValue(response);

      const result = await service.getSandboxStatus(TEST_SANDBOX_ID);

      expect(result).toEqual(response);
      expect(httpClient.get).toHaveBeenCalledWith(
        `http://localhost:8080/sandboxes/${TEST_SANDBOX_ID}/status`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        })
      );
    });

    it('should throw NotFoundException on 404', async () => {
      const error = new Error('404 not found');
      httpClient.get.mockRejectedValue(error);

      await expect(service.getSandboxStatus(TEST_SANDBOX_ID)).rejects.toThrow(
        NotFoundException
      );
    });

    it('should retry on transient errors', async () => {
      const response: SandboxStatusResponse = {
        sandboxId: TEST_SANDBOX_ID,
        status: 'running' as any,
        createdAt: new Date(),
      };

      httpClient.get
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(response);

      const result = await service.getSandboxStatus(TEST_SANDBOX_ID);

      expect(result).toEqual(response);
      expect(httpClient.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('withResilience', () => {
    it('should handle timeout', async () => {
      const slowOperation = () =>
        new Promise((resolve) => setTimeout(resolve, 50000));

      await expect(
        service['withResilience'](slowOperation, 'Test operation', 100)
      ).rejects.toThrow();
    });

    it('should not retry on auth errors', async () => {
      const operation = jest
        .fn()
        .mockRejectedValue(new Error('401 unauthorized'));

      await expect(
        service['withResilience'](operation, 'Test operation')
      ).rejects.toThrow(UnauthorizedException);

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should not retry on not found errors', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('404 not found'));

      await expect(
        service['withResilience'](operation, 'Test operation')
      ).rejects.toThrow(NotFoundException);

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should not retry on bad request errors', async () => {
      const operation = jest
        .fn()
        .mockRejectedValue(new Error('400 bad request'));

      await expect(
        service['withResilience'](operation, 'Test operation')
      ).rejects.toThrow(BadRequestException);

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry with exponential backoff', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('Server error'))
        .mockRejectedValueOnce(new Error('Server error'))
        .mockResolvedValueOnce('success');

      const startTime = Date.now();
      const result = await service['withResilience'](
        operation,
        'Test operation'
      );
      const duration = Date.now() - startTime;

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
      expect(duration).toBeGreaterThan(1000);
    });
  });
});
