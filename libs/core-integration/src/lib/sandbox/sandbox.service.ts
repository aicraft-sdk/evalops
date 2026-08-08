import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClientService } from '@evalops/shared-common';
import {
  SandboxConfig,
  ExecutionRequest,
  ExecutionResult,
  SandboxStatus,
  SandboxInfo,
  CreateSandboxRequest,
  CreateSandboxResponse,
  ExecuteCodeRequest,
  SandboxStatusResponse,
} from './sandbox.dto';
import { SandboxSecurityService } from './sandbox-security.service';
import { SandboxAuditService } from './sandbox-audit.service';
import { SandboxMonitoringService } from './sandbox-monitoring.service';
import { SandboxPolicies } from './sandbox-policies';

@Injectable()
export class SandboxService {
  private readonly logger = new Logger(SandboxService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultCpu: string;
  private readonly defaultMemory: string;
  private readonly defaultTimeout: number;

  constructor(
    private httpClient: HttpClientService,
    private configService: ConfigService,
    private securityService: SandboxSecurityService,
    private auditService: SandboxAuditService,
    private monitoringService: SandboxMonitoringService,
    private policies: SandboxPolicies,
  ) {
    this.baseUrl =
      this.configService.get<string>('OPENSANDBOX_SERVER_URL') ||
      'http://localhost:8080';
    this.apiKey = this.configService.get<string>('OPENSANDBOX_API_KEY') || '';
    this.defaultCpu =
      this.configService.get<string>('OPENSANDBOX_DEFAULT_CPU') || '1.0';
    this.defaultMemory =
      this.configService.get<string>('OPENSANDBOX_DEFAULT_MEMORY') || '512Mi';
    this.defaultTimeout =
      this.configService.get<number>('OPENSANDBOX_DEFAULT_TIMEOUT') || 300;

    if (!this.apiKey) {
      this.logger.warn(
        'OPENSANDBOX_API_KEY not configured. Sandbox operations will fail.',
      );
    }
  }

  async createSandbox(
    config?: SandboxConfig,
    userId?: string,
    organizationId?: string,
    requestId?: string,
  ): Promise<string> {
    const sandboxConfig: SandboxConfig = {
      cpu: config?.cpu || this.defaultCpu,
      memory: config?.memory || this.defaultMemory,
      timeout: config?.timeout || this.defaultTimeout,
      networkPolicy: config?.networkPolicy || 'deny_all',
      allowedDomains: config?.allowedDomains || [],
    };

    // Validate network policy
    const networkPolicy = this.policies.getNetworkPolicy();
    if (sandboxConfig.networkPolicy === 'restricted') {
      // Validate allowed domains against policy
      if (sandboxConfig.allowedDomains) {
        for (const domain of sandboxConfig.allowedDomains) {
          const validation = this.policies.validateDomain(domain);
          if (!validation.allowed) {
            throw new BadRequestException(
              `Network policy validation failed: ${validation.reason}`,
            );
          }
        }
      }
    }

    // Validate resource limits
    const validation = this.securityService.checkResourceLimits(sandboxConfig);
    if (!validation.valid) {
      const errorMessage = `Invalid sandbox configuration: ${validation.errors.join(', ')}`;
      
      // Log security violation
      if (userId && organizationId) {
        await this.auditService.logSecurityViolation(
          'pending',
          userId,
          organizationId,
          validation.errors,
          undefined,
          requestId,
        );
      }

      throw new BadRequestException(errorMessage);
    }

    return await this.withResilience(async () => {
      this.logger.debug('Creating sandbox', { config: sandboxConfig });

      // OpenSandbox HTTP API: POST /sandboxes
      const response = await this.httpClient.post<CreateSandboxResponse>(
        `${this.baseUrl}/sandboxes`,
        {
          config: {
            cpu: sandboxConfig.cpu,
            memory: sandboxConfig.memory,
            timeout: sandboxConfig.timeout,
            network_policy: sandboxConfig.networkPolicy,
            allowed_domains: sandboxConfig.allowedDomains || [],
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      );

      const sandboxId = response.sandboxId;
      this.logger.log(`Sandbox created: ${sandboxId}`);

      // Record metrics
      if (organizationId) {
        this.monitoringService.recordCreation(organizationId);
      }

      // Log audit event
      if (userId && organizationId) {
        await this.auditService.logCreation(
          sandboxId,
          userId,
          organizationId,
          requestId,
        );
      }

      return sandboxId;
    }, 'Create sandbox');
  }

  async executeCode(
    sandboxId: string,
    code: string,
    language: 'python' | 'javascript',
    input?: any,
    userId?: string,
    organizationId?: string,
    requestId?: string,
  ): Promise<ExecutionResult> {
    // Validate code (use AST validation if enabled)
    let validation = this.securityService.validateCode(code, language);
    
    // Try AST validation if enabled
    try {
      const astValidation = await this.securityService.validateCodeWithAST(
        code,
        language,
      );
      if (!astValidation.valid) {
        validation = astValidation;
      }
    } catch (error: any) {
      // AST validation failed, use pattern-based validation
      this.logger.debug('AST validation not available, using pattern matching');
    }

    // Scan for security issues
    const securityIssues = this.securityService.scanForSecurityIssues(
      code,
      language,
    );
    const securityViolations: string[] = [];
    for (const issue of securityIssues) {
      if (issue.severity === 'error') {
        validation.errors.push(issue.message);
        securityViolations.push(issue.message);
      } else {
        validation.warnings.push(issue.message);
      }
    }

    if (!validation.valid) {
      const errorMessage = `Code validation failed: ${validation.errors.join(', ')}`;
      
      // Log security violation
      if (userId && organizationId) {
        await this.auditService.logSecurityViolation(
          sandboxId,
          userId,
          organizationId,
          validation.errors,
          code,
          requestId,
        );
        this.monitoringService.recordSecurityViolation(organizationId);
      }

      throw new BadRequestException(errorMessage);
    }

    // Sanitize input
    const sanitizedInput = this.securityService.sanitizeInput(input);

    return await this.withResilience(async () => {
      this.logger.debug('Executing code in sandbox', {
        sandboxId,
        language,
        codeLength: code.length,
      });

      // OpenSandbox HTTP API: POST /sandboxes/:id/execute
      const response = await this.httpClient.post<ExecutionResult>(
        `${this.baseUrl}/sandboxes/${sandboxId}/execute`,
        {
          code,
          language,
          input: sanitizedInput,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000, // 60s timeout for execution
        },
      );

      const success = response.exitCode === 0 && !response.error;
      this.logger.log(`Code executed in sandbox ${sandboxId}`, {
        executionTime: response.executionTime,
        exitCode: response.exitCode,
        success,
      });

      // Track resource usage
      const resourceUsage = {
        cpu: response.resourceUsage?.cpu || 0,
        memory: response.resourceUsage?.memory || 0,
        executionTime: response.executionTime,
      };
      this.securityService.updateResourceUsage(sandboxId, resourceUsage);

      // Record metrics
      if (organizationId) {
        this.monitoringService.recordExecution(
          organizationId,
          resourceUsage,
          success,
        );
      }

      // Log audit event
      if (userId && organizationId) {
        await this.auditService.logExecution(
          sandboxId,
          userId,
          organizationId,
          code,
          resourceUsage,
          securityViolations.length > 0 ? securityViolations : undefined,
          requestId,
        );
      }

      // Check for anomalies
      if (organizationId) {
        const anomalies = await this.monitoringService.detectAnomalies(
          organizationId,
          sandboxId,
        );
        if (anomalies.hasAnomalies) {
          this.logger.warn('Anomalies detected', {
            sandboxId,
            anomalies: anomalies.anomalies,
          });
        }
      }

      return response;
    }, 'Execute code');
  }

  async deleteSandbox(
    sandboxId: string,
    userId?: string,
    organizationId?: string,
    requestId?: string,
  ): Promise<void> {
    return await this.withResilience(async () => {
      this.logger.debug(`Deleting sandbox: ${sandboxId}`);

      // OpenSandbox HTTP API: DELETE /sandboxes/:id
      await this.httpClient.delete(
        `${this.baseUrl}/sandboxes/${sandboxId}`,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: 10000,
        },
      );

      this.logger.log(`Sandbox deleted: ${sandboxId}`);

      // Log audit event
      if (userId && organizationId) {
        await this.auditService.logDeletion(
          sandboxId,
          userId,
          organizationId,
          requestId,
        );
      }
    }, 'Delete sandbox');
  }

  async getSandboxStatus(sandboxId: string): Promise<SandboxStatusResponse> {
    return await this.withResilience(async () => {
      this.logger.debug(`Getting sandbox status: ${sandboxId}`);

      // OpenSandbox HTTP API: GET /sandboxes/:id/status
      const response = await this.httpClient.get<SandboxStatusResponse>(
        `${this.baseUrl}/sandboxes/${sandboxId}/status`,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: 10000,
        },
      );

      return response;
    }, 'Get sandbox status');
  }

  private async withResilience<T>(
    operation: () => Promise<T>,
    context: string,
    timeoutMs = 30000,
  ): Promise<T> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(
            () =>
              reject(
                new Error(`${context} timed out after ${timeoutMs}ms`),
              ),
            timeoutMs,
          );
        });

        const result = await Promise.race([operation(), timeoutPromise]);
        return result;
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on auth errors
        if (
          lastError.message.includes('unauthorized') ||
          lastError.message.includes('forbidden') ||
          lastError.message.includes('401') ||
          lastError.message.includes('403')
        ) {
          this.logger.error(`${context} failed: unauthorized`, lastError);
          throw new UnauthorizedException(
            `OpenSandbox authentication failed: ${lastError.message}`,
          );
        }

        // Don't retry on not found
        if (
          lastError.message.includes('not found') ||
          lastError.message.includes('404')
        ) {
          this.logger.error(`${context} failed: not found`, lastError);
          throw new NotFoundException(
            `Sandbox not found: ${lastError.message}`,
          );
        }

        // Don't retry on bad request
        if (
          lastError.message.includes('bad request') ||
          lastError.message.includes('400')
        ) {
          this.logger.error(`${context} failed: bad request`, lastError);
          throw new BadRequestException(
            `Invalid request: ${lastError.message}`,
          );
        }

        if (attempt < maxRetries) {
          const delayMs = Math.min(
            1000 * Math.pow(2, attempt - 1),
            10000,
          );
          this.logger.warn(
            `${context} failed (attempt ${attempt}/${maxRetries}), retrying in ${delayMs}ms:`,
            lastError.message,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    this.logger.error(
      `${context} failed after ${maxRetries} attempts:`,
      lastError,
    );
    throw new InternalServerErrorException(
      `${context} failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`,
    );
  }
}
