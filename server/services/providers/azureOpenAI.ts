import OpenAI from "openai";
import { BaseAIProvider, type AIProviderResponse, type ProviderConfig } from "../aiProviderService";
import type { AiProvider } from "@shared/schema";

export class AzureOpenAIProvider extends BaseAIProvider {
  private client: OpenAI;

  constructor(provider: AiProvider, config: ProviderConfig) {
    super(provider, config);
    
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || `https://${this.getResourceName()}.openai.azure.com/openai/deployments`,
      defaultQuery: { 'api-version': '2024-02-01' },
      defaultHeaders: {
        'api-key': config.apiKey,
      },
      timeout: config.timeout || 30000,
    });
  }

  private getResourceName(): string {
    // Extract resource name from base URL or use default
    if (this.config.baseUrl) {
      const match = this.config.baseUrl.match(/https:\/\/([^.]+)\.openai\.azure\.com/);
      return match ? match[1] : 'your-resource';
    }
    return 'your-resource';
  }

  async generateText(
    prompt: string,
    systemPrompt?: string,
    options?: Record<string, any>
  ): Promise<AIProviderResponse> {
    const startTime = Date.now();
    
    const messages: Array<{ role: string; content: string }> = [];
    
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    
    messages.push({ role: "user", content: prompt });

    try {
      const response = await this.client.chat.completions.create({
        model: options?.model || this.config.model || 'gpt-4',
        messages,
        temperature: options?.temperature || this.config.temperature || 0.7,
        max_tokens: options?.maxTokens || this.config.maxTokens || 4000,
        stream: false,
      });

      const latency = Date.now() - startTime;
      const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      
      return {
        content: response.choices[0]?.message?.content || '',
        usage: {
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        },
        cost: this.calculateCostFromTokens(usage.prompt_tokens, usage.completion_tokens, options?.model || this.config.model),
        latency,
        modelUsed: response.model,
        providerId: this.provider.id,
      };
    } catch (error: any) {
      throw new Error(`Azure OpenAI API error: ${error.message}`);
    }
  }

  async analyzeImage(
    imageBase64: string,
    prompt: string,
    options?: Record<string, any>
  ): Promise<AIProviderResponse> {
    const startTime = Date.now();
    
    const messages = [
      {
        role: "user" as const,
        content: [
          {
            type: "text" as const,
            text: prompt,
          },
          {
            type: "image_url" as const,
            image_url: {
              url: `data:image/jpeg;base64,${imageBase64}`,
            },
          },
        ],
      },
    ];

    try {
      const response = await this.client.chat.completions.create({
        model: options?.model || 'gpt-4-vision',
        messages,
        temperature: options?.temperature || this.config.temperature || 0.7,
        max_tokens: options?.maxTokens || this.config.maxTokens || 4000,
        stream: false,
      });

      const latency = Date.now() - startTime;
      const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      
      return {
        content: response.choices[0]?.message?.content || '',
        usage: {
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        },
        cost: this.calculateCostFromTokens(usage.prompt_tokens, usage.completion_tokens, response.model),
        latency,
        modelUsed: response.model,
        providerId: this.provider.id,
      };
    } catch (error: any) {
      throw new Error(`Azure OpenAI Vision API error: ${error.message}`);
    }
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'down'; responseTime: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      // Simple health check with a minimal request
      const response = await this.client.chat.completions.create({
        model: 'gpt-35-turbo', // Azure uses different naming convention
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 1,
        temperature: 0,
      });
      
      const responseTime = Date.now() - startTime;
      
      return {
        status: response.choices[0]?.message ? 'healthy' : 'degraded',
        responseTime,
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'down',
        responseTime,
        error: error.message,
      };
    }
  }

  private calculateCostFromTokens(inputTokens: number, outputTokens: number, modelName?: string): number {
    // Azure OpenAI pricing (similar to OpenAI but may vary)
    const pricing: Record<string, { input: number; output: number }> = {
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-4-32k': { input: 0.06, output: 0.12 },
      'gpt-35-turbo': { input: 0.001, output: 0.002 },
      'gpt-4-vision': { input: 0.01, output: 0.03 },
    };
    
    const model = modelName || this.config.model || 'gpt-4';
    const rates = pricing[model] || pricing['gpt-4'];
    
    const inputCost = (inputTokens / 1000) * rates.input;
    const outputCost = (outputTokens / 1000) * rates.output;
    
    return inputCost + outputCost;
  }
}