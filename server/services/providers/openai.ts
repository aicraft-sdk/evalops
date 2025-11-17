import OpenAI from "openai";
import { BaseAIProvider, type AIProviderResponse, type ProviderConfig } from "../aiProviderService";
import type { AiProvider } from "@shared/schema";

export class OpenAIProvider extends BaseAIProvider {
  private client: OpenAI;

  constructor(provider: AiProvider, config: ProviderConfig) {
    super(provider, config);
    
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || 'https://api.openai.com/v1',
      timeout: config.timeout || 30000,
    });
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
        // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
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
      throw new Error(`OpenAI API error: ${error.message}`);
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
        model: options?.model || 'gpt-4-vision-preview',
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
      throw new Error(`OpenAI Vision API error: ${error.message}`);
    }
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'down'; responseTime: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      // Simple health check with a minimal request
      const response = await this.client.chat.completions.create({
        model: 'gpt-3.5-turbo',
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
    // OpenAI pricing as of 2024 (approximate)
    const pricing: Record<string, { input: number; output: number }> = {
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-4-turbo': { input: 0.01, output: 0.03 },
      'gpt-3.5-turbo': { input: 0.001, output: 0.002 },
      'gpt-4-vision-preview': { input: 0.01, output: 0.03 },
      // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      'gpt-5': { input: 0.005, output: 0.015 },
    };
    
    const model = modelName || this.config.model || 'gpt-4';
    const rates = pricing[model] || pricing['gpt-4'];
    
    const inputCost = (inputTokens / 1000) * rates.input;
    const outputCost = (outputTokens / 1000) * rates.output;
    
    return inputCost + outputCost;
  }
}