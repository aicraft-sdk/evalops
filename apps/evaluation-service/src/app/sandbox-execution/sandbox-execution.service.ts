import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpClientService } from '@evalops/shared-common';
import { DatabaseStorageService } from '../storage/database-storage.service';
import { CoreClientService } from '../core-client/core-client.service';
import {
  CustomEvaluatorExecutionRequest,
  CodeExecutionRequest,
  EvaluationResult,
  ValidationResult,
  SandboxConfig,
  ExecutionResult,
} from './sandbox-execution.dto';

@Injectable()
export class SandboxExecutionService {
  private readonly logger = new Logger(SandboxExecutionService.name);
  private readonly integrationServiceUrl: string;

  constructor(
    private httpClient: HttpClientService,
    private configService: ConfigService,
    private storageService: DatabaseStorageService,
    private coreClient: CoreClientService,
  ) {
    this.integrationServiceUrl =
      this.configService.get<string>('INTEGRATION_SERVICE_URL') ||
      'http://localhost:3004';
  }

  async executeCustomEvaluator(
    evaluatorId: string,
    input: any,
    runId?: string,
  ): Promise<EvaluationResult> {
    const startTime = Date.now();
    this.logger.debug('Executing custom evaluator', { evaluatorId, runId });

    // Get evaluator metadata from database
    const evaluator = await this.storageService.getCustomEvaluator(evaluatorId);
    if (!evaluator) {
      throw new NotFoundException(`Evaluator not found: ${evaluatorId}`);
    }

    if (evaluator.status !== 'active') {
      throw new BadRequestException(
        `Evaluator ${evaluatorId} is not active (status: ${evaluator.status})`,
      );
    }

    // Check execution type
    const executionType = evaluator.executionType || 'sandbox';
    if (executionType === 'inline') {
      this.logger.warn(
        `Inline execution not yet implemented for evaluator ${evaluatorId}, falling back to sandbox`,
      );
    } else if (executionType !== 'sandbox' && executionType !== 'external') {
      this.logger.warn(
        `Unknown execution type '${executionType}' for evaluator ${evaluatorId}, using sandbox`,
      );
    }

    // Validate input against inputSchema if provided
    if (evaluator.inputSchema) {
      const inputValidation = this.validateAgainstSchema(
        input,
        evaluator.inputSchema as any,
      );
      if (!inputValidation.valid) {
        throw new BadRequestException(
          `Input validation failed: ${inputValidation.errors.join(', ')}`,
        );
      }
    }

    // Retrieve evaluator code from storage
    const code = await this.retrieveEvaluatorCode(evaluator.filePath);

    // Determine language from file extension or metadata
    const language = this.determineLanguage(
      evaluator.fileName,
      evaluator.evaluatorType,
    );

    // Build sandbox config from evaluator settings
    const sandboxConfig: SandboxConfig = evaluator.sandboxConfig
      ? (evaluator.sandboxConfig as SandboxConfig)
      : {};
    const executionTimeout =
      evaluator.executionTimeout || sandboxConfig.timeout || 300;

    // Execute code in sandbox via integration service
    const sandboxId = await this.createSandbox(sandboxConfig);
    try {
      const executionResult = await this.executeCodeInSandbox(
        sandboxId,
        code,
        language,
        input,
      );

      // Validate output against outputSchema if provided
      if (evaluator.outputSchema) {
        const outputValidation = this.validateAgainstSchema(
          executionResult.output,
          evaluator.outputSchema as any,
        );
        if (!outputValidation.valid) {
          this.logger.warn(
            `Output validation failed for evaluator ${evaluatorId}: ${outputValidation.errors.join(', ')}`,
          );
          // Don't throw, but log warning
        }
      }

      // Transform to evaluation result
      const result: EvaluationResult = {
        ...executionResult,
        evaluatorId,
        runId,
        score: this.extractScore(executionResult.output),
        metadata: {
          evaluatorName: evaluator.name,
          evaluatorVersion: evaluator.version,
          executionTime: executionResult.executionTime,
          executionType,
        },
      };

      const totalExecutionTime = Date.now() - startTime;
      this.logger.log(`Custom evaluator executed successfully`, {
        evaluatorId,
        runId,
        executionTime: executionResult.executionTime,
        totalExecutionTime,
        executionType,
      });

      // Track successful usage
      await this.trackEvaluatorUsage(
        evaluatorId,
        runId,
        evaluator.organizationId,
        {
          success: true,
          executionTime: executionResult.executionTime,
        },
      ).catch((trackError) => {
        this.logger.warn(
          `Failed to track evaluator usage for ${evaluatorId}:`,
          trackError,
        );
      });

      return result;
    } catch (error: any) {
      const totalExecutionTime = Date.now() - startTime;
      this.logger.error(`Custom evaluator execution failed`, {
        evaluatorId,
        runId,
        error: error.message,
        totalExecutionTime,
      });

      // Track failed usage
      await this.trackEvaluatorUsage(
        evaluatorId,
        runId,
        evaluator.organizationId,
        {
          success: false,
          executionTime: totalExecutionTime,
          errorMessage: error.message,
        },
      ).catch((trackError) => {
        this.logger.warn(
          `Failed to track evaluator usage for ${evaluatorId}:`,
          trackError,
        );
      });

      throw error;
    } finally {
      // Clean up sandbox
      await this.deleteSandbox(sandboxId).catch((error) => {
        this.logger.warn(`Failed to delete sandbox ${sandboxId}:`, error);
      });
    }
  }

  async executeCode(
    code: string,
    language: 'python' | 'javascript',
    input?: any,
    config?: SandboxConfig,
  ): Promise<ExecutionResult> {
    this.logger.debug('Executing code in sandbox', {
      language,
      codeLength: code.length,
    });

    // Validate code
    const validation = this.validateCode(code, language);
    if (!validation.valid) {
      throw new BadRequestException(
        `Code validation failed: ${validation.errors.join(', ')}`,
      );
    }

    // Create sandbox with optional config
    const sandboxId = await this.createSandbox(config);
    try {
      const result = await this.executeCodeInSandbox(
        sandboxId,
        code,
        language,
        input,
      );

      this.logger.log(`Code executed successfully`, {
        sandboxId,
        executionTime: result.executionTime,
      });

      return result;
    } finally {
      // Clean up sandbox
      await this.deleteSandbox(sandboxId).catch((error) => {
        this.logger.warn(`Failed to delete sandbox ${sandboxId}:`, error);
      });
    }
  }

  validateCode(code: string, language: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!code || code.trim().length === 0) {
      errors.push('Code cannot be empty');
      return { valid: false, errors, warnings };
    }

    if (code.length > 100000) {
      errors.push('Code exceeds maximum length of 100,000 characters');
      return { valid: false, errors, warnings };
    }

    // Basic syntax validation
    if (language === 'python') {
      // Check for basic Python syntax issues
      if (code.includes('```')) {
        warnings.push('Code appears to contain markdown code blocks');
      }
    } else if (language === 'javascript') {
      // Check for basic JavaScript syntax issues
      if (code.includes('```')) {
        warnings.push('Code appears to contain markdown code blocks');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private validateAgainstSchema(
    value: any,
    schema: {
      type?: string;
      required?: string[];
      properties?: Record<string, { type?: string }>;
    },
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic JSON schema validation
    if (schema.type === 'object') {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        errors.push('Value must be an object');
        return { valid: false, errors, warnings };
      }

      const obj = value as Record<string, any>;

      // Check required fields
      if (schema.required && Array.isArray(schema.required)) {
        for (const field of schema.required) {
          if (!(field in obj)) {
            errors.push(`Missing required field: ${field}`);
          }
        }
      }

      // Check property types
      if (schema.properties) {
        for (const [field, fieldSchema] of Object.entries(schema.properties)) {
          if (!(field in obj)) continue;
          const fieldType = fieldSchema?.type;
          const fieldValue = obj[field];

          if (fieldType === 'string' && typeof fieldValue !== 'string') {
            errors.push(`Field '${field}' must be a string`);
          } else if (fieldType === 'number' && typeof fieldValue !== 'number') {
            errors.push(`Field '${field}' must be a number`);
          } else if (
            fieldType === 'boolean' &&
            typeof fieldValue !== 'boolean'
          ) {
            errors.push(`Field '${field}' must be a boolean`);
          } else if (fieldType === 'array' && !Array.isArray(fieldValue)) {
            errors.push(`Field '${field}' must be an array`);
          }
        }
      }
    } else if (schema.type) {
      // Simple type check
      if (schema.type === 'string' && typeof value !== 'string') {
        errors.push(`Value must be a string`);
      } else if (schema.type === 'number' && typeof value !== 'number') {
        errors.push(`Value must be a number`);
      } else if (schema.type === 'boolean' && typeof value !== 'boolean') {
        errors.push(`Value must be a boolean`);
      } else if (schema.type === 'array' && !Array.isArray(value)) {
        errors.push(`Value must be an array`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private async createSandbox(config?: SandboxConfig): Promise<string> {
    this.logger.debug('Creating sandbox via integration service');

    const response = await this.httpClient.post<{ sandboxId: string }>(
      `${this.integrationServiceUrl}/api/sandboxes`,
      { config },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      },
    );

    return response.sandboxId;
  }

  private async executeCodeInSandbox(
    sandboxId: string,
    code: string,
    language: 'python' | 'javascript',
    input?: any,
  ): Promise<ExecutionResult> {
    this.logger.debug('Executing code in sandbox', {
      sandboxId,
      language,
    });

    const response = await this.httpClient.post<ExecutionResult>(
      `${this.integrationServiceUrl}/api/sandboxes/${sandboxId}/execute`,
      {
        code,
        language,
        input,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 60000, // 60s timeout
      },
    );

    return response;
  }

  private async deleteSandbox(sandboxId: string): Promise<void> {
    this.logger.debug(`Deleting sandbox: ${sandboxId}`);

    await this.httpClient.delete(
      `${this.integrationServiceUrl}/api/sandboxes/${sandboxId}`,
      {
        timeout: 10000,
      },
    );
  }

  private async retrieveEvaluatorCode(filePath: string): Promise<string> {
    this.logger.debug(`Retrieving evaluator code from: ${filePath}`);

    try {
      // Call integration-service to download blob content
      const response = await this.httpClient.get<{ content: string }>(
        `${this.integrationServiceUrl}/api/artifacts/blob/${encodeURIComponent(filePath)}`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30s timeout for file download
        },
      );

      if (!response.content) {
        throw new InternalServerErrorException(
          `Empty content retrieved for evaluator file: ${filePath}`,
        );
      }

      this.logger.debug(
        `Successfully retrieved evaluator code (${response.content.length} bytes)`,
      );
      return response.content;
    } catch (error: any) {
      this.logger.error(
        `Failed to retrieve evaluator code from ${filePath}:`,
        error,
      );
      if (error.response?.status === 404) {
        throw new NotFoundException(
          `Evaluator file not found: ${filePath}`,
        );
      }
      throw new InternalServerErrorException(
        `Failed to retrieve evaluator code: ${error.message}`,
      );
    }
  }

  private determineLanguage(
    fileName: string,
    evaluatorType?: string,
  ): 'python' | 'javascript' {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'py' || ext === 'python') {
      return 'python';
    }
    if (ext === 'js' || ext === 'javascript' || ext === 'ts') {
      return 'javascript';
    }

    // Fallback to Python for most evaluator types
    return 'python';
  }

  private extractScore(output: any): number | undefined {
    if (typeof output === 'number') {
      return output;
    }

    if (typeof output === 'object' && output !== null) {
      // Try common score fields
      if ('score' in output && typeof output.score === 'number') {
        return output.score;
      }
      if ('result' in output && typeof output.result === 'number') {
        return output.result;
      }
      if ('value' in output && typeof output.value === 'number') {
        return output.value;
      }
    }

    return undefined;
  }

  private async trackEvaluatorUsage(
    evaluatorId: string,
    runId: string | undefined,
    organizationId: string,
    metrics: {
      success: boolean;
      executionTime: number;
      errorMessage?: string;
    },
  ): Promise<void> {
    try {
      await this.storageService.createEvaluatorUsage({
        evaluatorId,
        runId: runId || null,
        organizationId,
        usedBy: 'system', // TODO: Get actual user ID from context if available
        success: metrics.success,
        executionTime: metrics.executionTime,
        errorMessage: metrics.errorMessage || null,
      });
    } catch (error: any) {
      this.logger.error(
        `Failed to create evaluator usage record: ${error.message}`,
      );
      throw error;
    }
  }
}
