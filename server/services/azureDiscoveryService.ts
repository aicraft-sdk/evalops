import { AzureMLService, AzureCredentials } from './azureMLService';
import { storage } from '../storage';
import pLimit from 'p-limit';
import { 
  InsertAzureSubscription,
  InsertAzureMLWorkspace,
  InsertAzureDeployment,
  InsertAzurePromptFlow,
  InsertAzureOpenAIAccount,
  InsertAzureOpenAIDeployment
} from '@shared/schema';

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

export class AzureDiscoveryService {
  private azureMLService: AzureMLService;

  constructor() {
    this.azureMLService = new AzureMLService();
  }

  /**
   * Discover and sync all Azure resources for a user
   */
  async discoverUserResources(
    userId: string, 
    credentials: AzureCredentials,
    options: DiscoveryOptions = {}
  ): Promise<DiscoveryResult> {
    const {
      syncWorkspaces = true,
      syncDeployments = true,
      syncPromptFlows = true,
      syncOpenAI = true,
      maxConcurrency = 3
    } = options;

    this.azureMLService.setCredentials(credentials);

    const result: DiscoveryResult = {
      subscriptions: 0,
      workspaces: 0,
      deployments: 0,
      flows: 0,
      openAIAccounts: 0,
      openAIDeployments: 0,
      errors: []
    };

    try {
      // Step 1: Discover subscriptions
      const subscriptions = await this.discoverSubscriptions(userId);
      result.subscriptions = subscriptions.length;

      // Step 2: Controlled concurrency discovery per subscription
      const limit = pLimit(maxConcurrency);
      
      const subscriptionPromises = subscriptions.map(subscription => 
        limit(async () => {
          const subResult = {
            workspaces: 0,
            deployments: 0,
            flows: 0,
            openAIAccounts: 0,
            openAIDeployments: 0,
            errors: [] as string[]
          };

          try {
            // Parallel discovery within subscription
            const promises: Promise<any>[] = [];

            if (syncWorkspaces) {
              promises.push(this.discoverMLWorkspaces(subscription.id));
            }

            if (syncOpenAI) {
              promises.push(this.discoverOpenAIAccounts(subscription.id));
            }

            const results = await Promise.allSettled(promises);
            let workspaces: { id: string }[] = [];
            let openAIAccounts: { id: string }[] = [];

            // Process workspace results
            if (syncWorkspaces && results[0]) {
              if (results[0].status === 'fulfilled') {
                workspaces = results[0].value;
                subResult.workspaces = workspaces.length;
              } else {
                subResult.errors.push(`ML workspace discovery error: ${results[0].reason}`);
              }
            }

            // Process OpenAI results
            const openAIIndex = syncWorkspaces ? 1 : 0;
            if (syncOpenAI && results[openAIIndex]) {
              if (results[openAIIndex].status === 'fulfilled') {
                openAIAccounts = results[openAIIndex].value;
                subResult.openAIAccounts = openAIAccounts.length;
              } else {
                subResult.errors.push(`OpenAI account discovery error: ${results[openAIIndex].reason}`);
              }
            }

            // Step 3: Discover workspace-level resources with controlled concurrency
            if (workspaces.length > 0 && (syncDeployments || syncPromptFlows)) {
              const workspaceLimit = pLimit(Math.max(1, Math.floor(maxConcurrency / 2)));
              
              const workspacePromises: Promise<any>[] = [];
              for (const workspace of workspaces) {
                if (syncDeployments) {
                  workspacePromises.push(
                    workspaceLimit(() => this.discoverDeployments(workspace.id))
                  );
                }
                if (syncPromptFlows) {
                  workspacePromises.push(
                    workspaceLimit(() => this.discoverPromptFlows(workspace.id))
                  );
                }
              }

              const workspaceResults = await Promise.allSettled(workspacePromises);
              workspaceResults.forEach((promiseResult, idx) => {
                if (promiseResult.status === 'fulfilled' && promiseResult.value) {
                  if (idx % 2 === 0 && syncDeployments) {
                    subResult.deployments += promiseResult.value.length;
                  } else if (syncPromptFlows) {
                    subResult.flows += promiseResult.value.length;
                  }
                } else if (promiseResult.status === 'rejected') {
                  subResult.errors.push(`Workspace discovery error: ${promiseResult.reason}`);
                }
              });
            }

            // Step 4: Discover OpenAI deployments with controlled concurrency
            if (openAIAccounts.length > 0) {
              const openAILimit = pLimit(Math.max(1, Math.floor(maxConcurrency / 2)));
              const openAIPromises = openAIAccounts.map(account => 
                openAILimit(() => this.discoverOpenAIDeployments(account.id))
              );

              const openAIResults = await Promise.allSettled(openAIPromises);
              openAIResults.forEach(promiseResult => {
                if (promiseResult.status === 'fulfilled' && promiseResult.value) {
                  subResult.openAIDeployments += promiseResult.value.length;
                } else if (promiseResult.status === 'rejected') {
                  subResult.errors.push(`OpenAI deployment discovery error: ${promiseResult.reason}`);
                }
              });
            }

          } catch (error) {
            subResult.errors.push(`Subscription ${subscription.subscriptionId} discovery error: ${error}`);
          }

          return subResult;
        })
      );

      // Wait for all subscriptions to complete
      const subscriptionResults = await Promise.allSettled(subscriptionPromises);

      // Aggregate results from all subscriptions
      subscriptionResults.forEach(promiseResult => {
        if (promiseResult.status === 'fulfilled') {
          const subResult = promiseResult.value;
          result.workspaces += subResult.workspaces;
          result.deployments += subResult.deployments;
          result.flows += subResult.flows;
          result.openAIAccounts += subResult.openAIAccounts;
          result.openAIDeployments += subResult.openAIDeployments;
          result.errors.push(...subResult.errors);
        } else {
          result.errors.push(promiseResult.reason);
        }
      });

    } catch (error) {
      result.errors.push(`Top-level discovery error: ${error}`);
    }

    return result;
  }

  /**
   * Discover and store Azure subscriptions
   */
  private async discoverSubscriptions(userId: string): Promise<{ id: string; subscriptionId: string }[]> {
    const { subscriptions } = await this.azureMLService.listSubscriptions();
    const storedSubscriptions: { id: string; subscriptionId: string }[] = [];

    for (const sub of subscriptions) {
      try {
        // Check if subscription already exists (idempotent operation)
        const existing = await storage.findAzureSubscriptionBySubscriptionId(sub.subscriptionId, userId);
        
        if (!existing) {
          const subscriptionData: InsertAzureSubscription = {
            userId,
            subscriptionId: sub.subscriptionId,
            displayName: sub.displayName || sub.subscriptionId,
            tenantId: sub.tenantId || 'unknown',
            state: sub.state || 'enabled',
            isActive: true,
            lastSyncAt: new Date()
          };

          const created = await storage.createAzureSubscription(subscriptionData);
          storedSubscriptions.push({ id: created.id, subscriptionId: created.subscriptionId });
        } else {
          // Update last sync time (idempotent)
          await storage.updateAzureSubscription(existing.id, { lastSyncAt: new Date() });
          storedSubscriptions.push({ id: existing.id, subscriptionId: existing.subscriptionId });
        }
      } catch (error) {
        console.error(`Error storing subscription ${sub.subscriptionId}:`, error);
      }
    }

    return storedSubscriptions;
  }

  /**
   * Discover and store Azure ML workspaces
   */
  private async discoverMLWorkspaces(subscriptionDbId: string): Promise<{ id: string }[]> {
    const subscription = await storage.getAzureSubscription(subscriptionDbId);
    if (!subscription) return [];

    const { workspaces } = await this.azureMLService.listMLWorkspaces(subscription.subscriptionId);
    const storedWorkspaces: { id: string }[] = [];

    for (const workspace of workspaces) {
      try {
        const workspaceData: InsertAzureMLWorkspace = {
          azureSubscriptionId: subscriptionDbId,
          workspaceName: workspace.name,
          resourceGroup: this.extractResourceGroup(workspace.id),
          region: workspace.location,
          description: workspace.properties?.description,
          discoveryVersion: workspace.properties?.discoveryBuildInfo?.version,
          sku: workspace.sku?.name,
          isActive: true,
          lastSyncAt: new Date()
        };

        const created = await storage.createAzureMLWorkspace(workspaceData);
        storedWorkspaces.push({ id: created.id });
      } catch (error) {
        console.error(`Error storing workspace ${workspace.name}:`, error);
      }
    }

    return storedWorkspaces;
  }

  /**
   * Discover and store Azure deployments
   */
  private async discoverDeployments(workspaceDbId: string): Promise<{ id: string }[]> {
    const workspace = await storage.getAzureMLWorkspace(workspaceDbId);
    if (!workspace) return [];

    const subscription = await storage.getAzureSubscription(workspace.azureSubscriptionId);
    if (!subscription) return [];

    const { endpoints } = await this.azureMLService.listOnlineEndpoints(
      subscription.subscriptionId, 
      workspace.resourceGroup, 
      workspace.workspaceName
    );

    const storedDeployments: { id: string }[] = [];

    for (const endpoint of endpoints) {
      try {
        const { deployments } = await this.azureMLService.listDeployments(
          subscription.subscriptionId,
          workspace.resourceGroup,
          workspace.workspaceName,
          endpoint.name
        );

        for (const deployment of deployments) {
          const deploymentData: InsertAzureDeployment = {
            azureWorkspaceId: workspaceDbId,
            deploymentName: deployment.name,
            endpointName: endpoint.name,
            deploymentType: 'online',
            modelName: deployment.properties?.model?.name,
            modelVersion: deployment.properties?.model?.version,
            endpointUrl: endpoint.properties?.scoringUri,
            status: deployment.properties?.provisioningState || 'unknown',
            sku: deployment.sku || {},
            properties: deployment.properties || {},
            isActive: true,
            lastSyncAt: new Date()
          };

          const created = await storage.createAzureDeployment(deploymentData);
          storedDeployments.push({ id: created.id });
        }
      } catch (error) {
        console.error(`Error discovering deployments for endpoint ${endpoint.name}:`, error);
      }
    }

    return storedDeployments;
  }

  /**
   * Discover and store Prompt Flows
   */
  private async discoverPromptFlows(workspaceDbId: string): Promise<{ id: string }[]> {
    const workspace = await storage.getAzureMLWorkspace(workspaceDbId);
    if (!workspace) return [];

    const subscription = await storage.getAzureSubscription(workspace.azureSubscriptionId);
    if (!subscription) return [];

    try {
      const { flows } = await this.azureMLService.listFlows(
        subscription.subscriptionId,
        workspace.resourceGroup,
        workspace.workspaceName
      );

      const storedFlows: { id: string }[] = [];

      for (const flow of flows) {
        try {
          const flowData: InsertAzurePromptFlow = {
            azureWorkspaceId: workspaceDbId,
            flowName: flow.name,
            flowVersion: flow.properties?.version,
            azureFlowId: flow.id,
            description: flow.properties?.description,
            flowType: flow.properties?.flowType || 'standard',
            endpointUrl: flow.properties?.endpointUrl,
            endpointName: flow.properties?.endpointName,
            status: 'discovered',
            flowDefinition: flow.properties?.definition || {},
            inputSchema: flow.properties?.inputSchema || {},
            outputSchema: flow.properties?.outputSchema || {},
            isActive: true,
            lastSyncAt: new Date()
          };

          const created = await storage.createAzurePromptFlow(flowData);
          storedFlows.push({ id: created.id });
        } catch (error) {
          console.error(`Error storing flow ${flow.name}:`, error);
        }
      }

      return storedFlows;
    } catch (error) {
      console.warn('Prompt flow discovery not available:', error);
      return [];
    }
  }

  /**
   * Discover and store Azure OpenAI accounts
   */
  private async discoverOpenAIAccounts(subscriptionDbId: string): Promise<{ id: string }[]> {
    const subscription = await storage.getAzureSubscription(subscriptionDbId);
    if (!subscription) return [];

    const { accounts } = await this.azureMLService.listOpenAIAccounts(subscription.subscriptionId);
    const storedAccounts: { id: string }[] = [];

    for (const account of accounts) {
      try {
        const accountData: InsertAzureOpenAIAccount = {
          azureSubscriptionId: subscriptionDbId,
          accountName: account.name,
          resourceGroup: this.extractResourceGroup(account.id),
          region: account.location,
          endpoint: account.properties?.endpoint || `https://${account.name}.openai.azure.com/`,
          apiVersion: '2024-10-21',
          sku: account.sku?.name,
          isActive: true,
          lastSyncAt: new Date()
        };

        const created = await storage.createAzureOpenAIAccount(accountData);
        storedAccounts.push({ id: created.id });
      } catch (error) {
        console.error(`Error storing OpenAI account ${account.name}:`, error);
      }
    }

    return storedAccounts;
  }

  /**
   * Discover and store Azure OpenAI deployments
   */
  private async discoverOpenAIDeployments(accountDbId: string): Promise<{ id: string }[]> {
    const account = await storage.getAzureOpenAIAccount(accountDbId);
    if (!account) return [];

    const subscription = await storage.getAzureSubscription(account.azureSubscriptionId);
    if (!subscription) return [];

    const { deployments } = await this.azureMLService.listOpenAIDeployments(
      subscription.subscriptionId,
      account.resourceGroup,
      account.accountName
    );

    const storedDeployments: { id: string }[] = [];

    for (const deployment of deployments) {
      try {
        const deploymentData: InsertAzureOpenAIDeployment = {
          azureOpenAIAccountId: accountDbId,
          deploymentName: deployment.name,
          modelName: deployment.properties?.model?.name || 'unknown',
          modelVersion: deployment.properties?.model?.version,
          scaleType: deployment.properties?.scaleType,
          currentCapacity: deployment.properties?.currentCapacity,
          raiPolicyName: deployment.properties?.raiPolicyName,
          status: deployment.properties?.provisioningState || 'unknown',
          isActive: true,
          lastSyncAt: new Date()
        };

        const created = await storage.createAzureOpenAIDeployment(deploymentData);
        storedDeployments.push({ id: created.id });
      } catch (error) {
        console.error(`Error storing OpenAI deployment ${deployment.name}:`, error);
      }
    }

    return storedDeployments;
  }

  /**
   * Extract resource group from Azure resource ID
   */
  private extractResourceGroup(resourceId: string): string {
    const match = resourceId.match(/\/resourceGroups\/([^\/]+)\//);
    return match ? match[1] : 'unknown';
  }

  /**
   * Validate Azure credentials by testing subscription access
   */
  async validateCredentials(credentials: AzureCredentials): Promise<boolean> {
    try {
      this.azureMLService.setCredentials(credentials);
      const { subscriptions } = await this.azureMLService.listSubscriptions();
      return subscriptions.length > 0;
    } catch (error) {
      console.error('Azure credentials validation failed:', error);
      return false;
    }
  }
}

export const azureDiscoveryService = new AzureDiscoveryService();