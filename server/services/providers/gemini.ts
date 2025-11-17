import { GoogleGenAI } from "@google/genai";
import { BaseAIProvider, type AIProviderResponse, type ProviderConfig } from "../aiProviderService";
import type { AiProvider } from "@shared/schema";

// DON'T DELETE THIS COMMENT
// Follow these instructions when using this blueprint:
// - Note that the newest Gemini model series is "gemini-2.5-flash" or gemini-2.5-pro"
//   - do not change this unless explicitly requested by the user

export class GeminiProvider extends BaseAIProvider {
  private client: GoogleGenAI;

  constructor(provider: AiProvider, config: ProviderConfig) {
    super(provider, config);
    
    this.client = new GoogleGenAI({ 
      apiKey: config.apiKey,
    });
  }

  async generateText(
    prompt: string,
    systemPrompt?: string,
    options?: Record<string, any>
  ): Promise<AIProviderResponse> {
    const startTime = Date.now();
    
    try {
      const model = this.client.models.generateContent({
        model: options?.model || this.config.model || 'gemini-2.5-pro',
        contents: prompt,
        systemInstruction: systemPrompt,
        config: {
          temperature: options?.temperature || this.config.temperature || 0.7,
          maxOutputTokens: options?.maxTokens || this.config.maxTokens || 4000,
        },
      });

      const response = await model;
      const latency = Date.now() - startTime;
      
      // Google Gemini doesn't provide detailed token usage in the same way
      // We'll estimate based on response length for now
      const content = response.text || '';
      const estimatedInputTokens = Math.ceil(prompt.length / 4); // Rough estimation
      const estimatedOutputTokens = Math.ceil(content.length / 4);
      
      return {
        content,
        usage: {
          inputTokens: estimatedInputTokens,
          outputTokens: estimatedOutputTokens,
          totalTokens: estimatedInputTokens + estimatedOutputTokens,
        },
        cost: this.calculateCostFromTokens(estimatedInputTokens, estimatedOutputTokens, options?.model || this.config.model),
        latency,
        modelUsed: options?.model || this.config.model || 'gemini-2.5-pro',
        providerId: this.provider.id,
      };
    } catch (error: any) {
      throw new Error(`Google Gemini API error: ${error.message}`);
    }
  }

  async analyzeImage(
    imageBase64: string,
    prompt: string,
    options?: Record<string, any>
  ): Promise<AIProviderResponse> {
    const startTime = Date.now();
    
    const contents = [
      {
        inlineData: {
          data: imageBase64,
          mimeType: "image/jpeg",
        },
      },
      prompt,
    ];

    try {
      const response = await this.client.models.generateContent({
        model: options?.model || this.config.model || "gemini-2.5-pro",
        contents: contents,
        config: {
          temperature: options?.temperature || this.config.temperature || 0.7,
          maxOutputTokens: options?.maxTokens || this.config.maxTokens || 4000,
        },
      });

      const latency = Date.now() - startTime;
      const content = response.text || '';
      
      // Estimate token usage for vision tasks
      const estimatedInputTokens = Math.ceil(prompt.length / 4) + 1000; // Add tokens for image
      const estimatedOutputTokens = Math.ceil(content.length / 4);
      
      return {
        content,
        usage: {
          inputTokens: estimatedInputTokens,
          outputTokens: estimatedOutputTokens,
          totalTokens: estimatedInputTokens + estimatedOutputTokens,
        },
        cost: this.calculateCostFromTokens(estimatedInputTokens, estimatedOutputTokens, options?.model || this.config.model),
        latency,
        modelUsed: options?.model || this.config.model || 'gemini-2.5-pro',
        providerId: this.provider.id,
      };
    } catch (error: any) {
      throw new Error(`Google Gemini Vision API error: ${error.message}`);
    }
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'down'; responseTime: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      const response = await this.client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: "Hello",
        config: {
          maxOutputTokens: 1,
          temperature: 0,
        },
      });
      
      const responseTime = Date.now() - startTime;
      
      return {
        status: response.text ? 'healthy' : 'degraded',
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
    // Google Gemini pricing as of 2024 (approximate)
    const pricing: Record<string, { input: number; output: number }> = {
      'gemini-1.5-flash': { input: 0.00075, output: 0.003 },
      'gemini-1.5-pro': { input: 0.0035, output: 0.0105 },
      'gemini-2.5-flash': { input: 0.00075, output: 0.003 },
      'gemini-2.5-pro': { input: 0.0035, output: 0.0105 },
    };
    
    const model = modelName || this.config.model || 'gemini-2.5-pro';
    const rates = pricing[model] || pricing['gemini-2.5-pro'];
    
    const inputCost = (inputTokens / 1000) * rates.input;
    const outputCost = (outputTokens / 1000) * rates.output;
    
    return inputCost + outputCost;
  }
}