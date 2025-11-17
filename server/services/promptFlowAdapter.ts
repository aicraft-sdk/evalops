interface FlowExecutionResponse {
  response: any;
  cost: number;
  duration: number;
  outputs: any;
}

class PromptFlowAdapter {
  private baseUrl: string;
  private subscriptionId: string;
  private resourceGroup: string;
  private workspaceName: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = process.env.AZURE_ML_ENDPOINT || "";
    this.subscriptionId = process.env.AZURE_SUBSCRIPTION_ID || "";
    this.resourceGroup = process.env.AZURE_RESOURCE_GROUP || "";
    this.workspaceName = process.env.AZURE_ML_WORKSPACE_NAME || "";
    this.apiKey = process.env.AZURE_ML_API_KEY || "";
  }

  async executeFlow(
    flowId: string,
    workspaceId: string,
    inputs: any,
    seed?: number
  ): Promise<FlowExecutionResponse> {
    try {
      const startTime = Date.now();
      
      // Construct the Azure ML endpoint URL
      const endpoint = `${this.baseUrl}/flow/api/v1.0/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.MachineLearningServices/workspaces/${workspaceId}/flows/${flowId}/submit`;
      
      const requestBody = {
        run_id: `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        data: inputs,
        config: seed ? { random_seed: seed } : {},
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'x-ms-client-request-id': `evalops_${Date.now()}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      const duration = Date.now() - startTime;

      // Extract outputs and calculate approximate cost
      const outputs = result.data || result.outputs || result;
      const cost = this.estimateFlowCost(duration, inputs);

      return {
        response: outputs,
        cost,
        duration,
        outputs,
      };
    } catch (error) {
      console.error('Error executing Prompt Flow:', error);
      throw new Error(`Prompt Flow execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async listFlows(workspaceId: string): Promise<any[]> {
    try {
      const endpoint = `${this.baseUrl}/flow/api/v1.0/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.MachineLearningServices/workspaces/${workspaceId}/flows`;
      
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      return result.value || result.flows || [];
    } catch (error) {
      console.error('Error listing Prompt Flows:', error);
      throw new Error(`Failed to list flows: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getFlowDetails(flowId: string, workspaceId: string): Promise<any> {
    try {
      const endpoint = `${this.baseUrl}/flow/api/v1.0/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.MachineLearningServices/workspaces/${workspaceId}/flows/${flowId}`;
      
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting flow details:', error);
      throw new Error(`Failed to get flow details: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async testFlowConnection(workspaceId: string): Promise<boolean> {
    try {
      await this.listFlows(workspaceId);
      return true;
    } catch (error) {
      console.error('Prompt Flow connection test failed:', error);
      return false;
    }
  }

  private estimateFlowCost(duration: number, inputs: any): number {
    // Rough cost estimation based on execution time and input complexity
    // This would need to be calibrated based on actual Azure ML pricing
    const baseCost = 0.001; // Base cost per execution
    const timeCost = (duration / 1000) * 0.0001; // Cost per second
    const inputComplexity = JSON.stringify(inputs).length / 1000; // Rough complexity measure
    
    return baseCost + timeCost + (inputComplexity * 0.0001);
  }

  async getRunStatus(runId: string, workspaceId: string): Promise<any> {
    try {
      const endpoint = `${this.baseUrl}/flow/api/v1.0/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.MachineLearningServices/workspaces/${workspaceId}/runs/${runId}`;
      
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting run status:', error);
      throw new Error(`Failed to get run status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export const promptFlowAdapter = new PromptFlowAdapter();
