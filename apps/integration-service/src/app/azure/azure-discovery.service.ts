import { Injectable, Logger } from '@nestjs/common';
import { AzureMLService, AzureCredentials } from './azure-ml.service';
import { DatabaseStorageService } from '../storage/database-storage.service';

export interface DiscoveryResult {
  subscriptions: number;
  workspaces: number;
  deployments: number;
  flows: number;
  openAIAccounts: number;
  openAIDeployments: number;
  errors: string[];
}

export interface DiscoveryOptions {
  syncWorkspaces?: boolean;
  syncDeployments?: boolean;
  syncPromptFlows?: boolean;
  syncOpenAI?: boolean;
  maxConcurrency?: number;
}

@Injectable()
export class AzureDiscoveryService {
  private readonly logger = new Logger(AzureDiscoveryService.name);

  constructor(
    private azureMLService: AzureMLService,
    private storageService: DatabaseStorageService,
  ) {}

  async validateCredentials(credentials: AzureCredentials): Promise<boolean> {
    try {
      this.azureMLService.setCredentials(credentials);
      const subscriptions = await this.azureMLService.listSubscriptions();
      return subscriptions.length > 0;
    } catch (error: any) {
      this.logger.error('Azure credentials validation failed:', error);
      return false;
    }
  }

  async discoverUserResources(
    userId: string,
    credentials: AzureCredentials,
    options: DiscoveryOptions = {},
  ): Promise<DiscoveryResult> {
    const {
      syncWorkspaces = true,
      syncDeployments = true,
      syncPromptFlows = true,
      syncOpenAI = true,
    } = options;

    this.azureMLService.setCredentials(credentials);

    const result: DiscoveryResult = {
      subscriptions: 0,
      workspaces: 0,
      deployments: 0,
      flows: 0,
      openAIAccounts: 0,
      openAIDeployments: 0,
      errors: [],
    };

    try {
      // Discover subscriptions
      const subscriptions = await this.azureMLService.listSubscriptions();
      result.subscriptions = subscriptions.length;

      // For each subscription, discover resources
      for (const subscription of subscriptions) {
        try {
          if (syncWorkspaces) {
            const workspaces = await this.azureMLService.listMLWorkspaces(
              subscription.subscriptionId,
            );
            result.workspaces += workspaces.length;

            // Discover flows for each workspace
            if (syncPromptFlows) {
              for (const workspace of workspaces) {
                try {
                  const resourceGroup = this.extractResourceGroup(workspace.id);
                  const flows = await this.azureMLService.listFlows(
                    subscription.subscriptionId,
                    resourceGroup,
                    workspace.name,
                  );
                  result.flows += flows.length;
                } catch (error: any) {
                  result.errors.push(
                    `Error discovering flows for workspace ${workspace.name}: ${error.message}`,
                  );
                }
              }
            }
          }

          if (syncOpenAI) {
            const openAIAccounts = await this.azureMLService.listOpenAIAccounts(
              subscription.subscriptionId,
            );
            result.openAIAccounts += openAIAccounts.length;

            // Discover deployments for each OpenAI account
            for (const account of openAIAccounts) {
              try {
                const resourceGroup = this.extractResourceGroup(account.id);
                const deployments =
                  await this.azureMLService.listOpenAIDeployments(
                    subscription.subscriptionId,
                    resourceGroup,
                    account.name,
                  );
                result.openAIDeployments += deployments.length;
              } catch (error: any) {
                result.errors.push(
                  `Error discovering deployments for OpenAI account ${account.name}: ${error.message}`,
                );
              }
            }
          }
        } catch (error: any) {
          result.errors.push(
            `Error discovering resources for subscription ${subscription.subscriptionId}: ${error.message}`,
          );
        }
      }
    } catch (error: any) {
      result.errors.push(`Top-level discovery error: ${error.message}`);
    }

    return result;
  }

  private extractResourceGroup(resourceId: string): string {
    const match = resourceId.match(/\/resourceGroups\/([^\/]+)\//);
    return match ? match[1] : 'unknown';
  }
}

