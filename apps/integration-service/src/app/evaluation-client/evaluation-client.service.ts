import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

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
  ): Promise<any> {
    const headers: any = {
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
      this.httpService.post(`${this.baseUrl}/api/runs`, body, {
        headers,
      }),
    );
    return response.data;
  }

  async getRunStatus(runId: string, token?: string): Promise<any> {
    const headers: any = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await firstValueFrom(
      this.httpService.get(`${this.baseUrl}/api/runs/${runId}`, {
        headers,
      }),
    );
    return response.data;
  }
}

