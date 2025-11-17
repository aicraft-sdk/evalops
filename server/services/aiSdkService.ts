import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createXai } from "@ai-sdk/xai";
import { storage } from "../storage";
import type { AiProvider, Model } from "@shared/schema";

// Provider response interface compatible with AI SDK
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
  maxOutputTokens?: number;
  timeout?: number;
}

// AI SDK Service - unified provider management using Vercel AI SDK
export class AISdkService {
  private providers: Map<string, any> = new Map();

  constructor() {
    // Don't initialize in constructor - expose async init method
  }

  async initialize() {
    await this.initializeProviders();
  }

  private async initializeProviders() {
    const activeProviders = await storage.getActiveAIProviders();
    
    for (const provider of activeProviders) {
      try {
        const config = await this.getProviderConfig(provider.id);
        
        // Check if we have a valid API key before trying to create provider
        if (!config.apiKey) {
          continue;
        }
        
        const providerInstance = await this.createAISdkProvider(provider);
        if (providerInstance) {
          this.providers.set(provider.id, providerInstance);
        }
      } catch (error) {
        console.error(`Failed to initialize AI SDK provider ${provider.name}:`, error);
      }
    }
  }

  private async createAISdkProvider(provider: AiProvider): Promise<any | null> {
    const config = await this.getProviderConfig(provider.id);
    
    // Create AI SDK provider instances based on type
    switch (provider.type) {
      case 'openai':
        return createOpenAI({
          apiKey: config.apiKey,
          ...(config.baseUrl && { baseURL: config.baseUrl }),
        });
        
      case 'anthropic':
        return createAnthropic({
          apiKey: config.apiKey,
          ...(config.baseUrl && { baseURL: config.baseUrl }),
        });
        
      case 'google':
      case 'google_gemini':
        return createGoogleGenerativeAI({
          apiKey: config.apiKey,
        });
        
      case 'xai':
        return createXai({
          apiKey: config.apiKey,
        });
        
      default:
        console.warn(`Unknown AI SDK provider type: ${provider.type}`);
        return null;
    }
  }

  private async getProviderConfig(providerId: string): Promise<ProviderConfig> {
    const config = await storage.getProviderConfig(providerId);
    const provider = await storage.getAIProvider(providerId);
    
    // Environment variable fallbacks based on provider type
    const getEnvApiKey = (providerType: string) => {
      switch (providerType) {
        case 'openai': return process.env.OPENAI_API_KEY;
        case 'anthropic': return process.env.ANTHROPIC_API_KEY;
        case 'google':
        case 'google_gemini': return process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY;
        case 'xai': return process.env.XAI_API_KEY;
        default: return '';
      }
    };

    const getDefaultModel = (providerType: string) => {
      switch (providerType) {
        case 'openai': return 'gpt-4o-mini';
        case 'anthropic': return 'claude-3-5-sonnet-20241022';
        case 'google':
        case 'google_gemini': return 'gemini-1.5-pro';
        case 'xai': return 'grok-2-1212';
        default: return 'gpt-4o-mini';
      }
    };
    
    return {
      apiKey: (config as any)?.credentials?.apiKey || getEnvApiKey(provider?.type || '') || '',
      baseUrl: (config as any)?.config?.baseUrl,
      model: (config as any)?.config?.model || getDefaultModel(provider?.type || ''),
      temperature: (config as any)?.config?.temperature || 0.7,
      maxOutputTokens: (config as any)?.config?.maxTokens || 1024,
      timeout: (config as any)?.config?.timeout || 30000,
    };
  }

  async getBestProvider(
    organizationId: string, 
    capability?: string,
    excludeProviders?: string[]
  ): Promise<{ provider: any; providerData: AiProvider } | null> {
    const orgConfigs = await storage.getOrganizationProviderConfigs(organizationId);
    
    const availableConfigs = orgConfigs
      .filter(config => 
        config.isEnabled && 
        !excludeProviders?.includes(config.providerId)
      )
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    for (const config of availableConfigs) {
      const provider = this.providers.get(config.providerId);
      const providerData = await storage.getAIProvider(config.providerId);
      
      if (provider && providerData) {
        const capabilities = Array.isArray(providerData.supportedCapabilities) ? providerData.supportedCapabilities : [];
        if (!capability || capabilities.includes(capability)) {
          return { provider, providerData };
        }
      }
    }

    return null;
  }

  async generateText(
    organizationId: string,
    prompt: string,
    systemPrompt?: string,
    options?: {
      model?: string;
      capability?: string;
      maxRetries?: number;
      runId?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<AIProviderResponse> {
    const maxRetries = options?.maxRetries || 2;
    const excludeProviders: string[] = [];
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let bestProvider: { provider: any; providerData: AiProvider } | null = null;
      
      try {
        bestProvider = await this.getBestProvider(
          organizationId, 
          options?.capability || 'text_generation',
          excludeProviders
        );

        if (!bestProvider) {
          throw new Error('No available AI providers for this organization');
        }

        const { provider, providerData } = bestProvider;
        const config = await this.getProviderConfig(providerData.id);

        // Use AI SDK generateText function with prompt string (not messages)
        const startTime = Date.now();
        const modelId = options?.model || config.model;
        const model = provider(modelId);
        
        // Build single prompt string from system prompt and user prompt
        const fullPrompt = systemPrompt 
          ? `${systemPrompt}\n\nUser: ${prompt}`
          : prompt;
        
        const result = await generateText({
          model,
          prompt: fullPrompt,
          temperature: options?.temperature || config.temperature || 0.7,
          maxOutputTokens: options?.maxTokens || config.maxOutputTokens || 1024,
        });

        const latency = Date.now() - startTime;
        const { inputTokens = 0, outputTokens = 0 } = result.usage || {};
        const totalTokens = inputTokens + outputTokens;
        
        // Calculate cost based on model pricing
        const modelData = await storage.getModelByProviderAndName(
          providerData.id, 
          result.responseMetadata?.modelId || modelId
        );
        
        const cost = modelData ? this.calculateCost(inputTokens, outputTokens, modelData) : 0;

        const response: AIProviderResponse = {
          content: result.text,
          usage: {
            inputTokens,
            outputTokens,
            totalTokens,
          },
          cost,
          latency,
          modelUsed: result.responseMetadata?.modelId || modelId,
          providerId: providerData.id,
        };

        // Track successful usage with the database model ID
        if (modelData) {
          await this.trackUsage(
            organizationId,
            modelData.id,
            options?.runId,
            response.usage,
            response.cost,
            response.latency,
            0,
            providerData.id
          );
        }

        return response;

      } catch (error) {
        console.error(`AI SDK attempt ${attempt + 1} failed:`, error);
        
        if (attempt < maxRetries) {
          // Add current provider to exclusion list for next attempt
          if (bestProvider) {
            excludeProviders.push(bestProvider.providerData.id);
          }
        } else {
          throw new Error(`All AI providers failed after ${maxRetries + 1} attempts: ${(error as Error).message}`);
        }
      }
    }

    throw new Error('Failed to generate text with any available provider');
  }

  async analyzeImage(
    organizationId: string,
    imageBase64: string,
    prompt: string,
    options?: {
      model?: string;
      capability?: string;
      maxRetries?: number;
      runId?: string;
    }
  ): Promise<AIProviderResponse> {
    // Similar implementation to generateText but for image analysis
    // Using AI SDK's vision capabilities
    const maxRetries = options?.maxRetries || 2;
    const excludeProviders: string[] = [];
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let bestProvider: { provider: any; providerData: AiProvider } | null = null;
      
      try {
        bestProvider = await this.getBestProvider(
          organizationId, 
          options?.capability || 'image_analysis',
          excludeProviders
        );

        if (!bestProvider) {
          throw new Error('No available AI providers for image analysis');
        }

        const { provider, providerData } = bestProvider;
        const config = await this.getProviderConfig(providerData.id);

        // Use vision-capable model defaults per provider
        const getVisionModel = (providerType: string, defaultModel: string) => {
          switch (providerType) {
            case 'openai': return 'gpt-4o-mini';
            case 'anthropic': return 'claude-3-5-sonnet-20241022';
            case 'google':
            case 'google_gemini': return 'gemini-1.5-pro';
            case 'xai': return 'grok-2-1212';
            default: return defaultModel;
          }
        };

        const startTime = Date.now();
        const modelId = options?.model || getVisionModel(providerData.type, config.model);
        const model = provider(modelId);
        
        const result = await generateText({
          model,
          messages: [
            {
              role: 'user' as const,
              content: [
                { type: 'text', text: prompt },
                { type: 'image', image: `data:image/jpeg;base64,${imageBase64}` }
              ]
            }
          ],
          maxTokens: 100,
        });

        const latency = Date.now() - startTime;
        const { inputTokens = 0, outputTokens = 0 } = result.usage || {};
        const totalTokens = inputTokens + outputTokens;
        
        const modelData = await storage.getModelByProviderAndName(
          providerData.id, 
          result.responseMetadata?.modelId || modelId
        );
        
        const cost = modelData ? this.calculateCost(inputTokens, outputTokens, modelData) : 0;

        const response: AIProviderResponse = {
          content: result.text,
          usage: {
            inputTokens,
            outputTokens,
            totalTokens,
          },
          cost,
          latency,
          modelUsed: result.responseMetadata?.modelId || modelId,
          providerId: providerData.id,
        };

        // Track successful usage with the database model ID
        if (modelData) {
          await this.trackUsage(
            organizationId,
            modelData.id,
            options?.runId,
            response.usage,
            response.cost,
            response.latency,
            0,
            providerData.id
          );
        }

        return response;

      } catch (error) {
        console.error(`AI SDK image analysis attempt ${attempt + 1} failed:`, error);
        
        if (attempt < maxRetries) {
          if (bestProvider) {
            excludeProviders.push(bestProvider.providerData.id);
          }
        } else {
          throw new Error(`Image analysis failed after ${maxRetries + 1} attempts: ${(error as Error).message}`);
        }
      }
    }

    throw new Error('Failed to analyze image with any available provider');
  }

  async testProvider(providerId: string): Promise<{
    success: boolean;
    latency: number;
    cost: number;
    error?: string;
  }> {
    try {
      const provider = this.providers.get(providerId);
      const providerData = await storage.getAIProvider(providerId);
      
      if (!provider || !providerData) {
        throw new Error(`Provider not found: provider=${!!provider}, data=${!!providerData}`);
      }

      const config = await this.getProviderConfig(providerId);
      
      if (!config.model) {
        throw new Error('No model configured for provider');
      }

      const startTime = Date.now();
      const modelId = config.model;
      const model = provider(modelId);
      
      const result = await generateText({
        model,
        prompt: 'Say "Hello" to test the connection.',
        maxTokens: 50,
      });

      const latency = Date.now() - startTime;
      const { inputTokens = 0, outputTokens = 0 } = result.usage || {};
      
      const modelData = await storage.getModelByProviderAndName(
        providerId, 
        result.responseMetadata?.modelId || modelId
      );
      
      const cost = modelData ? this.calculateCost(inputTokens, outputTokens, modelData) : 0;

      return {
        success: true,
        latency,
        cost,
      };

    } catch (error) {
      return {
        success: false,
        latency: 0,
        cost: 0,
        error: (error as Error).message,
      };
    }
  }

  private calculateCost(inputTokens: number, outputTokens: number, model: Model): number {
    const inputCost = (inputTokens / 1000) * (model.inputCostPer1k || 0);
    const outputCost = (outputTokens / 1000) * (model.outputCostPer1k || 0);
    return inputCost + outputCost;
  }

  private async trackUsage(
    organizationId: string,
    modelId: string,
    runId: string | undefined,
    usage: AIProviderResponse['usage'],
    cost: number,
    latency: number,
    errorCount: number = 0,
    providerId?: string
  ): Promise<void> {
    await storage.createModelUsage({
      organizationId,
      providerId: providerId || 'ai-sdk',
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

  async checkAllProvidersHealth(): Promise<void> {
    const healthChecks = Array.from(this.providers.entries()).map(
      async ([providerId, provider]) => {
        try {
          const testResult = await this.testProvider(providerId);
          
          const status = testResult.success ? 'healthy' : 'down';
          
          await storage.createProviderHealthCheck({
            providerId,
            status,
            responseTime: testResult.latency,
            errorMessage: testResult.error,
          });
          
          await storage.updateAIProviderHealth(providerId, status);
          
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
}

// Create singleton instance
export const aiSdkService = new AISdkService();