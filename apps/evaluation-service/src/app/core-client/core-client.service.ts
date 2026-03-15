import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

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

  async getEvalSpec(evalSpecId: string, token?: string): Promise<any> {
    const headers: any = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await firstValueFrom(
      this.httpService.get(`${this.baseUrl}/api/eval-specs/${evalSpecId}`, {
        headers,
      })
    );
    return response.data;
  }

  async getDataset(datasetId: string, token?: string): Promise<any> {
    const headers: any = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await firstValueFrom(
      this.httpService.get(`${this.baseUrl}/api/datasets/${datasetId}`, {
        headers,
      })
    );
    return response.data;
  }

  async getDatasetSamples(datasetId: string, token?: string): Promise<any[]> {
    const headers: any = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await firstValueFrom(
      this.httpService.get(
        `${this.baseUrl}/api/datasets/${datasetId}/samples`,
        { headers }
      )
    );
    return response.data;
  }

  async renderTemplate(
    template: string,
    context: any,
    token?: string
  ): Promise<string> {
    const headers: any = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await firstValueFrom(
      this.httpService.post(
        `${this.baseUrl}/api/templates/render`,
        { template, context },
        { headers }
      )
    );
    return response.data.rendered;
  }

  async getPrompt(promptId: string, token?: string): Promise<any> {
    const headers: any = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await firstValueFrom(
      this.httpService.get(`${this.baseUrl}/api/prompts/${promptId}`, {
        headers,
      })
    );
    return response.data;
  }

  async getFlow(flowId: string, token?: string): Promise<any> {
    const headers: any = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await firstValueFrom(
      this.httpService.get(`${this.baseUrl}/api/flows/${flowId}`, {
        headers,
      })
    );
    return response.data;
  }

  async getAgent(agentId: string, token?: string): Promise<any> {
    const headers: any = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await firstValueFrom(
      this.httpService.get(`${this.baseUrl}/api/agents/${agentId}`, {
        headers,
      })
    );
    return response.data;
  }
}
