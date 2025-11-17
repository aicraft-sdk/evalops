import { 
  AzureSubscription, 
  AzureMLWorkspace, 
  AzureDeployment, 
  AzurePromptFlow,
  AzureOpenAIAccount,
  AzureOpenAIDeployment 
} from "@shared/schema";

export interface AzureCredentials {
  accessToken: string;
  subscriptionId: string;
  tenantId: string;
}

export interface AzureMLAPIResponse<T> {
  value?: T[];
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

// Azure Resource Manager API endpoints
const ARM_BASE_URL = 'https://management.azure.com';
const API_VERSION = '2024-10-01-preview';
const OPENAI_API_VERSION = '2024-10-01';

export class AzureMLService {
  private credentials: AzureCredentials | null = null;

  constructor(credentials?: AzureCredentials) {
    if (credentials) {
      this.credentials = credentials;
    }
  }

  setCredentials(credentials: AzureCredentials) {
    this.credentials = credentials;
  }

  private getAuthHeaders(): Record<string, string> {
    if (!this.credentials?.accessToken) {
      throw new Error('Azure credentials not configured');
    }
    
    return {
      'Authorization': `Bearer ${this.credentials.accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  private async makeRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.getAuthHeaders(),
        ...options.headers
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Azure API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Handle paginated Azure ARM API responses
   */
  private async makeRequestWithPagination<T>(url: string, options: RequestInit = {}): Promise<T[]> {
    const allResults: T[] = [];
    let nextUrl: string | null = url;

    while (nextUrl) {
      const response = await this.makeRequest<{ value?: T[]; nextLink?: string }>(nextUrl, options);
      
      if (response.value) {
        allResults.push(...response.value);
      }
      
      nextUrl = response.nextLink || null;
    }

    return allResults;
  }

  // ============= SUBSCRIPTION DISCOVERY =============

  async listSubscriptions(): Promise<{ subscriptions: any[] }> {
    const url = `${ARM_BASE_URL}/subscriptions?api-version=2020-01-01`;
    const subscriptions = await this.makeRequestWithPagination(url);
    return { subscriptions };
  }

  // ============= ML WORKSPACE DISCOVERY =============

  async listMLWorkspaces(subscriptionId: string): Promise<{ workspaces: any[] }> {
    const url = `${ARM_BASE_URL}/subscriptions/${subscriptionId}/providers/Microsoft.MachineLearningServices/workspaces?api-version=${API_VERSION}`;
    const workspaces = await this.makeRequestWithPagination(url);
    return { workspaces };
  }

  async getMLWorkspace(subscriptionId: string, resourceGroup: string, workspaceName: string): Promise<any> {
    const url = `${ARM_BASE_URL}/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.MachineLearningServices/workspaces/${workspaceName}?api-version=${API_VERSION}`;
    return this.makeRequest(url);
  }

  // ============= DEPLOYMENT DISCOVERY =============

  async listOnlineEndpoints(subscriptionId: string, resourceGroup: string, workspaceName: string): Promise<{ endpoints: any[] }> {
    const url = `${ARM_BASE_URL}/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.MachineLearningServices/workspaces/${workspaceName}/onlineEndpoints?api-version=${API_VERSION}`;
    const endpoints = await this.makeRequestWithPagination(url);
    return { endpoints };
  }

  async listDeployments(subscriptionId: string, resourceGroup: string, workspaceName: string, endpointName: string): Promise<{ deployments: any[] }> {
    const url = `${ARM_BASE_URL}/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.MachineLearningServices/workspaces/${workspaceName}/onlineEndpoints/${endpointName}/deployments?api-version=${API_VERSION}`;
    const deployments = await this.makeRequestWithPagination(url);
    return { deployments };
  }

  async listBatchEndpoints(subscriptionId: string, resourceGroup: string, workspaceName: string): Promise<{ endpoints: any[] }> {
    const url = `${ARM_BASE_URL}/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.MachineLearningServices/workspaces/${workspaceName}/batchEndpoints?api-version=${API_VERSION}`;
    const endpoints = await this.makeRequestWithPagination(url);
    return { endpoints };
  }

  // ============= PROMPT FLOW DISCOVERY =============

  async listFlows(subscriptionId: string, resourceGroup: string, workspaceName: string): Promise<{ flows: any[] }> {
    // Note: This endpoint might not be publicly available yet
    const url = `${ARM_BASE_URL}/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.MachineLearningServices/workspaces/${workspaceName}/flows?api-version=${API_VERSION}`;
    try {
      return this.makeRequest<{ value: any[] }>(url).then(response => ({
        flows: response.value || []
      }));
    } catch (error) {
      console.warn('Flow listing not available via ARM API:', error);
      return { flows: [] };
    }
  }

  // ============= AZURE OPENAI DISCOVERY =============

  async listOpenAIAccounts(subscriptionId: string): Promise<{ accounts: any[] }> {
    const url = `${ARM_BASE_URL}/subscriptions/${subscriptionId}/providers/Microsoft.CognitiveServices/accounts?api-version=${OPENAI_API_VERSION}&$filter=kind eq 'OpenAI'`;
    const accounts = await this.makeRequestWithPagination(url);
    return { accounts };
  }

  async listOpenAIDeployments(subscriptionId: string, resourceGroup: string, accountName: string): Promise<{ deployments: any[] }> {
    const url = `${ARM_BASE_URL}/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.CognitiveServices/accounts/${accountName}/deployments?api-version=${OPENAI_API_VERSION}`;
    const deployments = await this.makeRequestWithPagination(url);
    return { deployments };
  }

  async getOpenAIAccountKeys(subscriptionId: string, resourceGroup: string, accountName: string): Promise<{ key1: string; key2: string }> {
    const url = `${ARM_BASE_URL}/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.CognitiveServices/accounts/${accountName}/listKeys?api-version=${OPENAI_API_VERSION}`;
    return this.makeRequest(url, { method: 'POST' });
  }

  // ============= DEPLOYMENT EXECUTION =============

  async executeDeployment(endpointUrl: string, apiKey: string, payload: any): Promise<any> {
    const response = await fetch(`${endpointUrl}/score`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Deployment execution error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  async executePromptFlow(endpointUrl: string, apiKey: string, inputs: Record<string, any>): Promise<any> {
    const payload = { inputs };
    return this.executeDeployment(endpointUrl, apiKey, payload);
  }

  // ============= HEALTH CHECK =============

  async checkWorkspaceHealth(subscriptionId: string, resourceGroup: string, workspaceName: string): Promise<boolean> {
    try {
      const workspace = await this.getMLWorkspace(subscriptionId, resourceGroup, workspaceName);
      return workspace && workspace.properties?.provisioningState === 'Succeeded';
    } catch (error) {
      console.error('Workspace health check failed:', error);
      return false;
    }
  }

  async checkDeploymentHealth(endpointUrl: string, apiKey: string): Promise<boolean> {
    try {
      // Simple health check with minimal payload
      const response = await fetch(`${endpointUrl}/score`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inputs: {} })
      });
      return response.status < 500; // Accept client errors but not server errors
    } catch (error) {
      console.error('Deployment health check failed:', error);
      return false;
    }
  }
}

export const azureMLService = new AzureMLService();