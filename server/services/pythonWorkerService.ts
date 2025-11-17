/**
 * Python Worker Service
 * Handles communication with the OpenAI Evals Python worker
 */

import fetch from 'node-fetch';

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
  message: string;
}

export interface PythonTaskStatus {
  task_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  results?: Record<string, any>;
  error?: string;
  created_at: string;
  updated_at: string;
}

export class PythonWorkerService {
  private baseUrl: string;
  private timeout: number;

  constructor(
    baseUrl = process.env.PYTHON_WORKER_URL || 'http://localhost:5055', 
    timeout = 30000
  ) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  /**
   * Check if Python worker is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        timeout: 5000,
      });
      
      if (!response.ok) {
        return false;
      }

      const health = await response.json();
      return health.service === 'healthy';
    } catch (error) {
      console.error('Python worker health check failed:', error);
      return false;
    }
  }

  /**
   * Submit evaluation request to Python worker
   */
  async submitEvaluation(request: PythonEvaluationRequest): Promise<PythonEvaluationResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eval_spec_id: request.evalSpecId,
          dataset_samples: request.datasetSamples,
          model_config: request.modelConfig,
          evaluation_type: request.evaluationType,
          grading_criteria: request.gradingCriteria,
        }),
        timeout: this.timeout,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Python worker request failed: ${response.status} ${errorText}`);
      }

      return await response.json() as PythonEvaluationResponse;
    } catch (error) {
      console.error('Failed to submit evaluation to Python worker:', error);
      throw error;
    }
  }

  /**
   * Get evaluation task status
   */
  async getTaskStatus(taskId: string): Promise<PythonTaskStatus> {
    try {
      const response = await fetch(`${this.baseUrl}/tasks/${taskId}`, {
        method: 'GET',
        timeout: this.timeout,
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Task not found');
        }
        const errorText = await response.text();
        throw new Error(`Failed to get task status: ${response.status} ${errorText}`);
      }

      return await response.json() as PythonTaskStatus;
    } catch (error) {
      console.error('Failed to get task status from Python worker:', error);
      throw error;
    }
  }

  /**
   * Wait for evaluation to complete
   */
  async waitForCompletion(
    taskId: string, 
    pollIntervalMs = 2000, 
    maxWaitMs = 300000 // 5 minutes
  ): Promise<PythonTaskStatus> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitMs) {
      const status = await this.getTaskStatus(taskId);
      
      if (status.status === 'completed') {
        return status;
      }
      
      if (status.status === 'failed') {
        throw new Error(`Evaluation failed: ${status.error || 'Unknown error'}`);
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
    
    throw new Error('Evaluation timed out');
  }

  /**
   * Run evaluation and wait for results
   */
  async runEvaluation(request: PythonEvaluationRequest): Promise<PythonTaskStatus> {
    const submission = await this.submitEvaluation(request);
    return await this.waitForCompletion(submission.task_id);
  }

  /**
   * List recent evaluation tasks
   */
  async listTasks(status?: string, limit = 50): Promise<PythonTaskStatus[]> {
    try {
      const params = new URLSearchParams();
      if (status) params.append('status', status);
      if (limit) params.append('limit', limit.toString());

      const response = await fetch(`${this.baseUrl}/tasks?${params}`, {
        method: 'GET',
        timeout: this.timeout,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to list tasks: ${response.status} ${errorText}`);
      }

      return await response.json() as PythonTaskStatus[];
    } catch (error) {
      console.error('Failed to list tasks from Python worker:', error);
      throw error;
    }
  }

  /**
   * Get worker information
   */
  async getWorkerInfo(): Promise<Record<string, any>> {
    try {
      const response = await fetch(`${this.baseUrl}/`, {
        method: 'GET',
        timeout: 5000,
      });

      if (!response.ok) {
        throw new Error(`Worker info request failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get worker info:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const pythonWorker = new PythonWorkerService();