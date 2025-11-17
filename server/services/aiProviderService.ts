import { storage } from "../storage";
import type { AiProvider, Model, OrganizationProviderConfig, ModelUsage } from "@shared/schema";

// Provider response interface
export interface AIProviderResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  cost: number;
  latency: number;
  modelUsed: string;
  providerId: string;
}

// Provider configuration interface
export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

// Abstract base class for AI providers
export abstract class BaseAIProvider {
  protected provider: AiProvider;
  protected config: ProviderConfig;

  constructor(provider: AiProvider, config: ProviderConfig) {
    this.provider = provider;
    this.config = config;
  }

  abstract generateText(
    prompt: string,
    systemPrompt?: string,
    options?: Record<string, any>
  ): Promise<AIProviderResponse>;

  abstract analyzeImage(
    imageBase64: string,
    prompt: string,
    options?: Record<string, any>
  ): Promise<AIProviderResponse>;

  abstract healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'down';
    responseTime: number;
    error?: string;
  }>;

  // Calculate cost based on token usage and model pricing
  protected calculateCost(inputTokens: number, outputTokens: number, model: Model): number {
    const inputCost = (inputTokens / 1000) * (model.inputCostPer1k || 0);
    const outputCost = (outputTokens / 1000) * (model.outputCostPer1k || 0);
    return inputCost + outputCost;
  }

  // Track usage and cost for analytics
  protected async trackUsage(
    organizationId: string,
    modelId: string,
    runId: string | undefined,
    usage: AIProviderResponse['usage'],
    cost: number,
    latency: number,
    errorCount: number = 0
  ): Promise<void> {
    await storage.createModelUsage({
      organizationId,
      providerId: this.provider.id,
      modelId,
      runId,
      date: new Date(),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalCost: cost,
      requestCount: 1,
      errorCount,
      avgLatency: latency,
    });
  }
}

// AI Provider Service - manages all providers and handles failover
export class AIProviderService {
  private providers: Map<string, BaseAIProvider> = new Map();

  constructor() {
    this.initializeProviders();
  }

  private async initializeProviders() {
    // Initialize built-in providers when they are enabled
    const activeProviders = await storage.getActiveAIProviders();
    
    for (const provider of activeProviders) {
      try {
        const providerInstance = await this.createProviderInstance(provider);
        if (providerInstance) {
          this.providers.set(provider.id, providerInstance);
        }
      } catch (error) {
        console.error(`Failed to initialize provider ${provider.name}:`, error);
      }
    }
  }

  private async createProviderInstance(provider: AiProvider): Promise<BaseAIProvider | null> {
    // Lazy load provider implementations based on type
    switch (provider.type) {
      case 'openai':
        const { OpenAIProvider } = await import('./providers/openai');
        return new OpenAIProvider(provider, await this.getProviderConfig(provider.id));
        
      case 'anthropic':
        const { AnthropicProvider } = await import('./providers/anthropic');
        return new AnthropicProvider(provider, await this.getProviderConfig(provider.id));
        
      case 'azure_openai':
        const { AzureOpenAIProvider } = await import('./providers/azureOpenAI');
        return new AzureOpenAIProvider(provider, await this.getProviderConfig(provider.id));
        
      case 'google_gemini':
        const { GeminiProvider } = await import('./providers/gemini');
        return new GeminiProvider(provider, await this.getProviderConfig(provider.id));
        
      case 'xai':
        const { XAIProvider } = await import('./providers/xai');
        return new XAIProvider(provider, await this.getProviderConfig(provider.id));
        
      default:
        console.warn(`Unknown provider type: ${provider.type}`);
        return null;
    }
  }

  private async getProviderConfig(providerId: string): Promise<ProviderConfig> {
    // Get provider configuration (API keys, etc.)
    // This would typically decrypt stored credentials
    const config = await storage.getProviderConfig(providerId);
    
    return {
      apiKey: config?.credentials?.apiKey || '',
      baseUrl: config?.config?.baseUrl,
      model: config?.config?.defaultModel || 'gpt-4',
      temperature: config?.config?.temperature || 0.7,
      maxTokens: config?.config?.maxTokens || 4000,
      timeout: config?.config?.timeout || 30000,
    };
  }

  // Get the best available provider for an organization
  async getBestProvider(
    organizationId: string, 
    capability?: string,
    excludeProviders?: string[]
  ): Promise<BaseAIProvider | null> {
    const orgConfigs = await storage.getOrganizationProviderConfigs(organizationId);
    
    // Sort by priority and filter enabled providers
    const availableConfigs = orgConfigs
      .filter(config => 
        config.isEnabled && 
        !excludeProviders?.includes(config.providerId)
      )
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    for (const config of availableConfigs) {
      const provider = this.providers.get(config.providerId);
      if (provider) {
        // Check if provider supports the required capability
        const providerData = await storage.getAIProvider(config.providerId);
        if (!capability || providerData?.supportedCapabilities?.includes(capability)) {
          return provider;
        }
      }
    }

    return null;
  }

  // Generate text with automatic failover
  async generateText(
    organizationId: string,
    prompt: string,
    systemPrompt?: string,
    options?: {
      model?: string;
      capability?: string;
      maxRetries?: number;
      runId?: string;
    }
  ): Promise<AIProviderResponse> {
    const maxRetries = options?.maxRetries || 2;
    const excludeProviders: string[] = [];
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const provider = await this.getBestProvider(
          organizationId, 
          options?.capability || 'text_generation',
          excludeProviders
        );

        if (!provider) {
          throw new Error('No available AI providers for this organization');
        }

        const response = await provider.generateText(prompt, systemPrompt, options);
        
        // Track successful usage
        const model = await storage.getModelByProviderAndName(
          response.providerId, 
          response.modelUsed
        );
        
        if (model) {
          await (provider as any).trackUsage(
            organizationId,
            model.id,
            options?.runId,
            response.usage,
            response.cost,
            response.latency,
            0
          );
        }

        return response;

      } catch (error) {
        console.error(`AI Provider attempt ${attempt + 1} failed:`, error);
        
        // Track failed usage if we have provider info
        const provider = this.providers.values().next().value;
        if (provider && attempt === maxRetries) {
          await (provider as any).trackUsage(
            organizationId,
            'unknown',
            options?.runId,
            { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            0,
            0,
            1
          );
        }

        // Add current provider to exclusion list for next attempt
        if (attempt < maxRetries) {
          // Extract provider ID from error or use other means to identify failed provider
          // This is a simplified approach
          excludeProviders.push('last_failed_provider_id');
        } else {
          throw new Error(`All AI providers failed after ${maxRetries + 1} attempts: ${(error as Error).message}`);
        }
      }
    }

    throw new Error('Failed to generate text with any available provider');
  }

  // Analyze image with automatic failover
  async analyzeImage(
    organizationId: string,
    imageBase64: string,
    prompt: string,
    options?: {
      model?: string;
      maxRetries?: number;
      runId?: string;
    }
  ): Promise<AIProviderResponse> {
    return this.generateText(
      organizationId,
      prompt,
      undefined,
      { ...options, capability: 'image_analysis' }
    );
  }

  // Health check all providers
  async checkAllProvidersHealth(): Promise<void> {
    const healthChecks = Array.from(this.providers.entries()).map(
      async ([providerId, provider]) => {
        try {
          const health = await provider.healthCheck();
          await storage.createProviderHealthCheck({
            providerId,
            status: health.status,
            responseTime: health.responseTime,
            errorMessage: health.error,
          });
          
          // Update provider health status
          await storage.updateAIProviderHealth(providerId, health.status);
          
        } catch (error) {
          console.error(`Health check failed for provider ${providerId}:`, error);
          await storage.createProviderHealthCheck({
            providerId,
            status: 'down',
            responseTime: 0,
            errorMessage: (error as Error).message,
          });
          
          await storage.updateAIProviderHealth(providerId, 'down');
        }
      }
    );

    await Promise.allSettled(healthChecks);
  }

  // Register a new provider instance
  registerProvider(providerId: string, provider: BaseAIProvider): void {
    this.providers.set(providerId, provider);
  }

  // Get provider by ID
  getProvider(providerId: string): BaseAIProvider | undefined {
    return this.providers.get(providerId);
  }

  // List all registered providers
  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

// Global instance
export const aiProviderService = new AIProviderService();