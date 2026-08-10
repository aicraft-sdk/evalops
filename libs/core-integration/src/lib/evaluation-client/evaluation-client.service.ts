import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

/**
 * Shape of the evaluation run returned by the Evaluation Service's
 * `/api/runs` endpoints, as consumed by callers of this client.
 */
export interface EvaluationRunResponse {
  id: string;
  status: string;
  [key: string]: unknown;
}

@Injectable()
export class EvaluationClientService {
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl =
      this.configService.get('EVALUATION_SERVICE_URL') ||
      'http://localhost:3003';
  }

  async createRun(
    evalSpecId: string,
    name: string,
    commitSha: string,
    organizationId: string,
    triggeredBy?: string,
    token?: string,
  ): Promise<EvaluationRunResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const body = {
      evalSpecId,
      name,
      commitSha,
      organizationId,
      triggeredBy: triggeredBy || 'system',
      status: 'pending',
    };

    const response = await firstValueFrom(
      this.httpService.post<EvaluationRunResponse>(
        `${this.baseUrl}/api/runs`,
        body,
        { headers },
      ),
    );
    return response.data;
  }

  async getRunStatus(
    runId: string,
    token?: string,
  ): Promise<EvaluationRunResponse> {
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await firstValueFrom(
      this.httpService.get<EvaluationRunResponse>(
        `${this.baseUrl}/api/runs/${runId}`,
        { headers },
      ),
    );
    return response.data;
  }
}

