import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

/**
 * Loosely-typed shapes for entities fetched over HTTP from core-service.
 * These are cross-service boundaries (no shared compile-time contract), so
 * only the fields evaluation-service actually reads are declared; the index
 * signature allows the remaining, unvalidated JSON payload through.
 */
export interface CoreEvalSpec {
  id: string;
  datasetId: string;
  promptId?: string;
  flowId?: string;
  repetitions: number;
  seeds?: number[];
  modelConfig?: Record<string, unknown>;
  evaluators?: unknown[];
  [key: string]: unknown;
}

export interface CoreDataset {
  id: string;
  organizationId?: string;
  [key: string]: unknown;
}

export interface CoreDatasetSample {
  input?: unknown;
  expected?: unknown;
  context?: unknown;
  [key: string]: unknown;
}

export interface CorePrompt {
  id: string;
  content: string;
  [key: string]: unknown;
}

export interface CoreFlow {
  flowId: string;
  workspaceId: string;
  [key: string]: unknown;
}

export interface CoreAgent {
  id: string;
  content: string;
  [key: string]: unknown;
}

@Injectable()
export class CoreClientService {
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService
  ) {
    this.baseUrl =
      this.configService.get('CORE_SERVICE_URL') || 'http://localhost:3002';
  }

  private buildHeaders(token?: string): Record<string, string> {
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  async getEvalSpec(
    evalSpecId: string,
    token?: string
  ): Promise<CoreEvalSpec> {
    const headers = this.buildHeaders(token);

    const response = await firstValueFrom(
      this.httpService.get<CoreEvalSpec>(
        `${this.baseUrl}/api/eval-specs/${evalSpecId}`,
        { headers }
      )
    );
    return response.data;
  }

  async getDataset(datasetId: string, token?: string): Promise<CoreDataset> {
    const headers = this.buildHeaders(token);

    const response = await firstValueFrom(
      this.httpService.get<CoreDataset>(
        `${this.baseUrl}/api/datasets/${datasetId}`,
        { headers }
      )
    );
    return response.data;
  }

  async getDatasetSamples(
    datasetId: string,
    token?: string
  ): Promise<CoreDatasetSample[]> {
    const headers = this.buildHeaders(token);

    const response = await firstValueFrom(
      this.httpService.get<CoreDatasetSample[]>(
        `${this.baseUrl}/api/datasets/${datasetId}/samples`,
        { headers }
      )
    );
    return response.data;
  }

  async renderTemplate(
    template: string,
    context: Record<string, unknown>,
    token?: string
  ): Promise<string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.buildHeaders(token),
    };

    const response = await firstValueFrom(
      this.httpService.post<{ rendered: string }>(
        `${this.baseUrl}/api/templates/render`,
        { template, context },
        { headers }
      )
    );
    return response.data.rendered;
  }

  async getPrompt(promptId: string, token?: string): Promise<CorePrompt> {
    const headers = this.buildHeaders(token);

    const response = await firstValueFrom(
      this.httpService.get<CorePrompt>(
        `${this.baseUrl}/api/prompts/${promptId}`,
        { headers }
      )
    );
    return response.data;
  }

  async getFlow(flowId: string, token?: string): Promise<CoreFlow> {
    const headers = this.buildHeaders(token);

    const response = await firstValueFrom(
      this.httpService.get<CoreFlow>(`${this.baseUrl}/api/flows/${flowId}`, {
        headers,
      })
    );
    return response.data;
  }

  async getAgent(agentId: string, token?: string): Promise<CoreAgent> {
    const headers = this.buildHeaders(token);

    const response = await firstValueFrom(
      this.httpService.get<CoreAgent>(
        `${this.baseUrl}/api/agents/${agentId}`,
        { headers }
      )
    );
    return response.data;
  }
}
