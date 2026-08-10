import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface AzureCredentials {
  accessToken: string;
  subscriptionId: string;
  tenantId: string;
}

export interface AzureSubscription {
  subscriptionId: string;
  displayName?: string;
  state?: string;
}

export interface AzureMLWorkspace {
  id: string;
  name: string;
  properties?: {
    provisioningState?: string;
    [key: string]: unknown;
  };
}

export interface AzureMLFlow {
  id?: string;
  name?: string;
  [key: string]: unknown;
}

export interface AzureOpenAIAccount {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface AzureOpenAIDeployment {
  id?: string;
  name?: string;
  [key: string]: unknown;
}

interface AzureListResponse<T> {
  value?: T[];
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

  async listSubscriptions(): Promise<AzureSubscription[]> {
    const url = `${this.armBaseUrl}/subscriptions?api-version=2020-01-01`;
    const response = await firstValueFrom(
      this.httpService.get<AzureListResponse<AzureSubscription>>(url, {
        headers: this.getAuthHeaders(),
      }),
    );
    return response.data.value || [];
  }

  async listMLWorkspaces(subscriptionId: string): Promise<AzureMLWorkspace[]> {
    const url = `${this.armBaseUrl}/subscriptions/${subscriptionId}/providers/Microsoft.MachineLearningServices/workspaces?api-version=${this.apiVersion}`;
    const response = await firstValueFrom(
      this.httpService.get<AzureListResponse<AzureMLWorkspace>>(url, {
        headers: this.getAuthHeaders(),
      }),
    );
    return response.data.value || [];
  }

  async getMLWorkspace(
    subscriptionId: string,
    resourceGroup: string,
    workspaceName: string,
  ): Promise<AzureMLWorkspace> {
    const url = `${this.armBaseUrl}/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.MachineLearningServices/workspaces/${workspaceName}?api-version=${this.apiVersion}`;
    const response = await firstValueFrom(
      this.httpService.get<AzureMLWorkspace>(url, {
        headers: this.getAuthHeaders(),
      }),
    );
    return response.data;
  }

  async listFlows(
    subscriptionId: string,
    resourceGroup: string,
    workspaceName: string,
  ): Promise<AzureMLFlow[]> {
    try {
      const url = `${this.armBaseUrl}/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.MachineLearningServices/workspaces/${workspaceName}/flows?api-version=${this.apiVersion}`;
      const response = await firstValueFrom(
        this.httpService.get<AzureListResponse<AzureMLFlow>>(url, {
          headers: this.getAuthHeaders(),
        }),
      );
      return response.data.value || [];
    } catch (error: unknown) {
      this.logger.warn('Flow listing not available via ARM API:', error);
      return [];
    }
  }

  async listOpenAIAccounts(
    subscriptionId: string,
  ): Promise<AzureOpenAIAccount[]> {
    const url = `${this.armBaseUrl}/subscriptions/${subscriptionId}/providers/Microsoft.CognitiveServices/accounts?api-version=2024-10-01&$filter=kind eq 'OpenAI'`;
    const response = await firstValueFrom(
      this.httpService.get<AzureListResponse<AzureOpenAIAccount>>(url, {
        headers: this.getAuthHeaders(),
      }),
    );
    return response.data.value || [];
  }

  async listOpenAIDeployments(
    subscriptionId: string,
    resourceGroup: string,
    accountName: string,
  ): Promise<AzureOpenAIDeployment[]> {
    const url = `${this.armBaseUrl}/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.CognitiveServices/accounts/${accountName}/deployments?api-version=2024-10-01`;
    const response = await firstValueFrom(
      this.httpService.get<AzureListResponse<AzureOpenAIDeployment>>(url, {
        headers: this.getAuthHeaders(),
      }),
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
    } catch (error: unknown) {
      this.logger.error('Workspace health check failed:', error);
      return false;
    }
  }
}
