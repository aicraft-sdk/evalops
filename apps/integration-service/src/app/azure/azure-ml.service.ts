import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface AzureCredentials {
  accessToken: string;
  subscriptionId: string;
  tenantId: string;
}

@Injectable()
export class AzureMLService {
  private readonly logger = new Logger(AzureMLService.name);
  private readonly armBaseUrl = 'https://management.azure.com';
  private readonly apiVersion = '2024-10-01-preview';
  private credentials: AzureCredentials | null = null;

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {}

  setCredentials(credentials: AzureCredentials) {
    this.credentials = credentials;
  }

  private getAuthHeaders(): Record<string, string> {
    if (!this.credentials?.accessToken) {
      throw new Error('Azure credentials not configured');
    }

    return {
      Authorization: `Bearer ${this.credentials.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  async listSubscriptions(): Promise<any[]> {
    const url = `${this.armBaseUrl}/subscriptions?api-version=2020-01-01`;
    const response = await firstValueFrom(
      this.httpService.get(url, { headers: this.getAuthHeaders() }),
    );
    return response.data.value || [];
  }

  async listMLWorkspaces(subscriptionId: string): Promise<any[]> {
    const url = `${this.armBaseUrl}/subscriptions/${subscriptionId}/providers/Microsoft.MachineLearningServices/workspaces?api-version=${this.apiVersion}`;
    const response = await firstValueFrom(
      this.httpService.get(url, { headers: this.getAuthHeaders() }),
    );
    return response.data.value || [];
  }

  async getMLWorkspace(
    subscriptionId: string,
    resourceGroup: string,
    workspaceName: string,
  ): Promise<any> {
    const url = `${this.armBaseUrl}/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.MachineLearningServices/workspaces/${workspaceName}?api-version=${this.apiVersion}`;
    const response = await firstValueFrom(
      this.httpService.get(url, { headers: this.getAuthHeaders() }),
    );
    return response.data;
  }

  async listFlows(
    subscriptionId: string,
    resourceGroup: string,
    workspaceName: string,
  ): Promise<any[]> {
    try {
      const url = `${this.armBaseUrl}/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.MachineLearningServices/workspaces/${workspaceName}/flows?api-version=${this.apiVersion}`;
      const response = await firstValueFrom(
        this.httpService.get(url, { headers: this.getAuthHeaders() }),
      );
      return response.data.value || [];
    } catch (error: any) {
      this.logger.warn('Flow listing not available via ARM API:', error);
      return [];
    }
  }

  async listOpenAIAccounts(subscriptionId: string): Promise<any[]> {
    const url = `${this.armBaseUrl}/subscriptions/${subscriptionId}/providers/Microsoft.CognitiveServices/accounts?api-version=2024-10-01&$filter=kind eq 'OpenAI'`;
    const response = await firstValueFrom(
      this.httpService.get(url, { headers: this.getAuthHeaders() }),
    );
    return response.data.value || [];
  }

  async listOpenAIDeployments(
    subscriptionId: string,
    resourceGroup: string,
    accountName: string,
  ): Promise<any[]> {
    const url = `${this.armBaseUrl}/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.CognitiveServices/accounts/${accountName}/deployments?api-version=2024-10-01`;
    const response = await firstValueFrom(
      this.httpService.get(url, { headers: this.getAuthHeaders() }),
    );
    return response.data.value || [];
  }

  async checkWorkspaceHealth(
    subscriptionId: string,
    resourceGroup: string,
    workspaceName: string,
  ): Promise<boolean> {
    try {
      const workspace = await this.getMLWorkspace(
        subscriptionId,
        resourceGroup,
        workspaceName,
      );
      return workspace?.properties?.provisioningState === 'Succeeded';
    } catch (error: any) {
      this.logger.error('Workspace health check failed:', error);
      return false;
    }
  }
}

