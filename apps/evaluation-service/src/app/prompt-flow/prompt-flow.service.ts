import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { getErrorMessage } from '@evalops/shared-common';

export interface FlowExecutionResponse {
  response: unknown;
  cost: number;
  duration: number;
  outputs: unknown;
}

@Injectable()
export class PromptFlowService {
  private readonly logger = new Logger(PromptFlowService.name);
  private readonly baseUrl: string;
  private readonly subscriptionId: string;
  private readonly resourceGroup: string;
  private readonly apiKey: string;

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get('AZURE_ML_ENDPOINT') || '';
    this.subscriptionId = this.configService.get('AZURE_SUBSCRIPTION_ID') || '';
    this.resourceGroup = this.configService.get('AZURE_RESOURCE_GROUP') || '';
    this.apiKey = this.configService.get('AZURE_ML_API_KEY') || '';
  }

  async executeFlow(
    flowId: string,
    workspaceId: string,
    inputs: unknown,
    seed?: number,
  ): Promise<FlowExecutionResponse> {
    try {
      const startTime = Date.now();

      const endpoint = `${this.baseUrl}/flow/api/v1.0/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.MachineLearningServices/workspaces/${workspaceId}/flows/${flowId}/submit`;

      const requestBody = {
        run_id: `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        data: inputs,
        config: seed ? { random_seed: seed } : {},
      };

      const response = await firstValueFrom(
        this.httpService.post(
          endpoint,
          requestBody,
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`,
              'x-ms-client-request-id': `evalops_${Date.now()}`,
            },
          },
        ),
      );

      const duration = Date.now() - startTime;
      const outputs = response.data.data || response.data.outputs || response.data;
      const cost = this.estimateFlowCost(duration, inputs);

      return {
        response: outputs,
        cost,
        duration,
        outputs,
      };
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.logger.error(`Error executing Prompt Flow: ${message}`, error instanceof Error ? error.stack : undefined);
      throw new Error(
        `Prompt Flow execution failed: ${message}`,
      );
    }
  }

  async listFlows(workspaceId: string): Promise<unknown[]> {
    try {
      const endpoint = `${this.baseUrl}/flow/api/v1.0/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.MachineLearningServices/workspaces/${workspaceId}/flows`;

      const response = await firstValueFrom(
        this.httpService.get(endpoint, {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
        }),
      );

      return response.data.value || response.data.flows || [];
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.logger.error(`Error listing Prompt Flows: ${message}`, error instanceof Error ? error.stack : undefined);
      throw new Error(
        `Failed to list flows: ${message}`,
      );
    }
  }

  async getFlowDetails(flowId: string, workspaceId: string): Promise<unknown> {
    try {
      const endpoint = `${this.baseUrl}/flow/api/v1.0/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.MachineLearningServices/workspaces/${workspaceId}/flows/${flowId}`;

      const response = await firstValueFrom(
        this.httpService.get(endpoint, {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
        }),
      );

      return response.data;
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.logger.error(`Error getting flow details: ${message}`, error instanceof Error ? error.stack : undefined);
      throw new Error(
        `Failed to get flow details: ${message}`,
      );
    }
  }

  async testConnection(workspaceId: string): Promise<boolean> {
    try {
      await this.listFlows(workspaceId);
      return true;
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.logger.error(`Prompt Flow connection test failed: ${message}`, error instanceof Error ? error.stack : undefined);
      return false;
    }
  }

  private estimateFlowCost(duration: number, inputs: unknown): number {
    const baseCost = 0.001;
    const timeCost = (duration / 1000) * 0.0001;
    const inputComplexity = JSON.stringify(inputs).length / 1000;

    return baseCost + timeCost + inputComplexity * 0.0001;
  }
}

