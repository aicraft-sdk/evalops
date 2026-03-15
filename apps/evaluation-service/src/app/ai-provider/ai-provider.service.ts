import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface ModelConfig {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  model?: string;
}

export interface GenerationResponse {
  response: string;
  cost: number;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

@Injectable()
export class AIProviderService {
  private readonly logger = new Logger(AIProviderService.name);
  private client: OpenAI;
  private readonly defaultModel: string;
  private readonly embeddingsModel: string;

  constructor(private configService: ConfigService) {
    const apiKey =
      this.configService.get('AZURE_OPENAI_API_KEY') ||
      this.configService.get('OPENAI_API_KEY');
    const baseURL =
      this.configService.get('AZURE_OPENAI_ENDPOINT') ||
      'https://api.openai.com/v1';
    const isAzure = !!this.configService.get('AZURE_OPENAI_ENDPOINT');

    this.client = new OpenAI({
      apiKey,
      baseURL,
      defaultHeaders: isAzure
        ? {
            'api-key': apiKey || '',
          }
        : {},
    });

    this.defaultModel =
      this.configService.get('AZURE_OPENAI_DEPLOYMENT_NAME') || 'gpt-4';
    this.embeddingsModel =
      this.configService.get('AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT') ||
      'text-embedding-ada-002';
  }

  async generateResponse(
    prompt: string,
    input: string,
    modelConfig: ModelConfig,
    seed?: number,
  ): Promise<GenerationResponse> {
    return await this.withResilience(async () => {
      const fullPrompt = this.constructPrompt(prompt, input);
      const model = modelConfig.model || this.defaultModel;

      const response = await this.client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: fullPrompt }],
        temperature: modelConfig.temperature ?? 1.0,
        max_completion_tokens: modelConfig.maxTokens ?? 1000,
        top_p: modelConfig.topP ?? 1.0,
        frequency_penalty: modelConfig.frequencyPenalty ?? 0,
        presence_penalty: modelConfig.presencePenalty ?? 0,
        seed: seed ? Math.floor(seed) : undefined,
      });

      const completion = response.choices[0]?.message?.content || '';
      const usage = response.usage;

      const cost = this.calculateCost(
        usage?.prompt_tokens || 0,
        usage?.completion_tokens || 0,
        model,
      );

      return {
        response: completion,
        cost,
        tokenUsage: {
          promptTokens: usage?.prompt_tokens || 0,
          completionTokens: usage?.completion_tokens || 0,
          totalTokens: usage?.total_tokens || 0,
        },
      };
    }, 'Azure OpenAI generation');
  }

  async generateEmbeddings(text: string): Promise<number[]> {
    return await this.withResilience(async () => {
      const response = await this.client.embeddings.create({
        model: this.embeddingsModel,
        input: text,
      });

      return response.data[0]?.embedding || [];
    }, 'Embedding generation');
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.withResilience(async () => {
        const response = await this.client.chat.completions.create({
          model: this.defaultModel,
          messages: [{ role: 'user', content: 'Hello, this is a connection test.' }],
          max_completion_tokens: 5,
        });

        if (!response.choices[0]?.message?.content) {
          throw new Error('No response content received');
        }

        return response.choices[0].message.content;
      }, 'Connection test');

      return true;
    } catch (error: any) {
      this.logger.error('AI Provider connection test failed:', error);
      return false;
    }
  }

  private constructPrompt(prompt: string, input: string): string {
    return prompt
      .replace(/\{input\}/g, input)
      .replace(/\{user_input\}/g, input)
      .replace(/\{query\}/g, input);
  }

  private calculateCost(
    promptTokens: number,
    completionTokens: number,
    model: string,
  ): number {
    // Cost per 1k tokens - adjust based on actual model pricing
    const modelPricing: Record<string, { prompt: number; completion: number }> =
      {
        'gpt-4': { prompt: 0.03, completion: 0.06 },
        'gpt-4-turbo': { prompt: 0.01, completion: 0.03 },
        'gpt-3.5-turbo': { prompt: 0.0015, completion: 0.002 },
        'gpt-5': { prompt: 0.03, completion: 0.06 }, // Default to GPT-4 pricing
      };

    const pricing =
      modelPricing[model] || modelPricing['gpt-4'] || { prompt: 0.03, completion: 0.06 };

    const promptCost = (promptTokens / 1000) * pricing.prompt;
    const completionCost = (completionTokens / 1000) * pricing.completion;

    return promptCost + completionCost;
  }

  private async withResilience<T>(
    operation: () => Promise<T>,
    context: string,
    timeoutMs = 30000,
  ): Promise<T> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(
            () =>
              reject(
                new Error(`${context} timed out after ${timeoutMs}ms`),
              ),
            timeoutMs,
          );
        });

        const result = await Promise.race([operation(), timeoutPromise]);
        return result;
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (
          lastError.message.includes('unauthorized') ||
          lastError.message.includes('forbidden') ||
          lastError.message.includes('invalid_api_key')
        ) {
          break;
        }

        if (attempt < maxRetries) {
          const delayMs = Math.min(
            1000 * Math.pow(2, attempt - 1),
            10000,
          );
          this.logger.warn(
            `${context} failed (attempt ${attempt}/${maxRetries}), retrying in ${delayMs}ms:`,
            lastError.message,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    throw new Error(
      `${context} failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`,
    );
  }
}
