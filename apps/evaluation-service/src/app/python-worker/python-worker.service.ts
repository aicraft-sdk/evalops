import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { getErrorMessage } from '@evalops/shared-common';

export interface PythonEvaluationRequest {
  evalSpecId: string;
  datasetSamples: Array<{
    input: string;
    expected_output?: string;
    [key: string]: any;
  }>;
  modelConfig: {
    provider: string;
    model: string;
    temperature?: number;
    max_tokens?: number;
    [key: string]: any;
  };
  evaluationType: 'model_graded' | 'exact_match' | 'similarity';
  gradingCriteria?: Record<string, any>;
}

export interface PythonEvaluationResponse {
  task_id: string;
  status: string;
}

export interface PythonTaskStatus {
  task_id: string;
  status: string;
  result?: any;
  error?: string;
  updated_at: string;
}

export interface CodeExecutionRequest {
  code: string;
  language: 'python' | 'javascript';
  input_data?: any;
  sandbox_config?: {
    cpu?: string;
    memory?: string;
    timeout?: number;
    network_policy?: 'allow_all' | 'deny_all' | 'restricted';
    allowed_domains?: string[];
  };
  timeout_seconds?: number;
}

export interface CodeExecutionResult {
  task_id: string;
  status: string;
  result?: {
    output?: any;
    stdout?: string;
    stderr?: string;
    exit_code?: number;
  };
  error?: string;
  execution_time_ms?: number;
  stdout?: string;
  stderr?: string;
  exit_code?: number;
}

@Injectable()
export class PythonWorkerService {
  private readonly logger = new Logger(PythonWorkerService.name);
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.baseUrl =
      this.configService.get('PYTHON_WORKER_URL') || 'http://localhost:5055';
    this.timeout = 30000;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/health`, { timeout: 5000 }),
      );
      return response.data?.service === 'healthy';
    } catch (error) {
      this.logger.warn('Python worker health check failed');
      return false;
    }
  }

  async submitEvaluation(
    request: PythonEvaluationRequest,
  ): Promise<PythonEvaluationResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/evaluate`,
          {
            eval_spec_id: request.evalSpecId,
            dataset_samples: request.datasetSamples,
            model_config: request.modelConfig,
            evaluation_type: request.evaluationType,
            grading_criteria: request.gradingCriteria,
          },
          { timeout: this.timeout },
        ),
      );
      return response.data;
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.logger.error(`Failed to submit evaluation to Python worker: ${message}`, error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  async getTaskStatus(taskId: string): Promise<PythonTaskStatus> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/tasks/${taskId}`, {
          timeout: this.timeout,
        }),
      );
      return response.data;
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      if (error instanceof Error && (error as Error & { response?: { status?: number } }).response?.status === 404) {
        throw new Error('Task not found');
      }
      this.logger.error(`Failed to get task status: ${message}`, error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  async listTasks(
    status?: string,
    limit = 50,
  ): Promise<PythonTaskStatus[]> {
    try {
      const params: Record<string, unknown> = { limit };
      if (status) params.status = status;

      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/tasks`, {
          params,
          timeout: this.timeout,
        }),
      );
      return response.data;
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.logger.error(`Failed to list tasks: ${message}`, error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  async executeCode(
    code: string,
    language: 'python' | 'javascript',
    inputData?: any,
    sandboxConfig?: CodeExecutionRequest['sandbox_config'],
    timeoutSeconds?: number,
  ): Promise<CodeExecutionResult> {
    try {
      const request: CodeExecutionRequest = {
        code,
        language,
        input_data: inputData,
        sandbox_config: sandboxConfig,
        timeout_seconds: timeoutSeconds,
      };

      const response = await firstValueFrom(
        this.httpService.post<CodeExecutionResult>(
          `${this.baseUrl}/execute-code`,
          request,
          { timeout: (timeoutSeconds || 300) * 1000 + 10000 }, // Add 10s buffer
        ),
      );

      this.logger.debug(
        `Code execution completed: task_id=${response.data.task_id}, status=${response.data.status}`,
      );

      return response.data;
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.logger.error(`Failed to execute code: ${message}`, error instanceof Error ? error.stack : undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const httpError = error as any;
      if (httpError?.response?.status === 408) {
        throw new Error(
          `Code execution timed out: ${httpError.response?.data?.detail || message}`,
        );
      }
      if (httpError?.response?.status === 400) {
        throw new Error(
          `Invalid code execution request: ${httpError.response?.data?.detail || message}`,
        );
      }
      throw error;
    }
  }
}

