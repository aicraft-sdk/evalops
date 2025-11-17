import OpenAI from "openai";

interface ModelConfig {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

interface GenerationResponse {
  response: string;
  cost: number;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

class AzureOpenAIAdapter {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
      baseURL: process.env.AZURE_OPENAI_ENDPOINT || "https://api.openai.com/v1",
      defaultHeaders: process.env.AZURE_OPENAI_ENDPOINT ? {
        'api-key': process.env.AZURE_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
      } : {},
    });
  }

  async generateResponse(
    prompt: string,
    input: string,
    modelConfig: ModelConfig,
    seed?: number
  ): Promise<GenerationResponse> {
    // Use resilient execution with timeout and retries
    return await this.withResilience(async () => {
      const fullPrompt = this.constructPrompt(prompt, input);
      
      const response = await this.client.chat.completions.create({
        model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
        messages: [
          { role: "user", content: fullPrompt }
        ],
        temperature: modelConfig.temperature ?? 1.0,
        max_completion_tokens: modelConfig.maxTokens ?? 1000,
        top_p: modelConfig.topP ?? 1.0,
        frequency_penalty: modelConfig.frequencyPenalty ?? 0,
        presence_penalty: modelConfig.presencePenalty ?? 0,
        seed: seed ? Math.floor(seed) : undefined,
      });

      const completion = response.choices[0]?.message?.content || "";
      const usage = response.usage;
      
      // Calculate cost (rough approximation - actual costs vary by model)
      const cost = this.calculateCost(
        usage?.prompt_tokens || 0,
        usage?.completion_tokens || 0
      );

      return {
        response: completion,
        cost,
        tokenUsage: {
          promptTokens: usage?.prompt_tokens || 0,
          completionTokens: usage?.completion_tokens || 0,
          totalTokens: usage?.total_tokens || 0,
        }
      };
    }, `Azure OpenAI generation`);
  }

  async generateEmbeddings(text: string): Promise<number[]> {
    // Use resilient execution with timeout and retries
    return await this.withResilience(async () => {
      const response = await this.client.embeddings.create({
        model: process.env.AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT || "text-embedding-ada-002",
        input: text,
      });

      return response.data[0]?.embedding || [];
    }, `Embedding generation`);
  }

  private constructPrompt(prompt: string, input: string): string {
    // Replace placeholders in the prompt with actual input
    return prompt
      .replace(/\{input\}/g, input)
      .replace(/\{user_input\}/g, input)
      .replace(/\{query\}/g, input);
  }

  private calculateCost(promptTokens: number, completionTokens: number): number {
    // Rough cost calculation for GPT-4 (adjust based on actual model pricing)
    const promptCostPer1k = 0.03;  // $0.03 per 1k prompt tokens
    const completionCostPer1k = 0.06;  // $0.06 per 1k completion tokens
    
    const promptCost = (promptTokens / 1000) * promptCostPer1k;
    const completionCost = (completionTokens / 1000) * completionCostPer1k;
    
    return promptCost + completionCost;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.withResilience(async () => {
        const response = await this.client.chat.completions.create({
          model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
          messages: [
            { role: "user", content: "Hello, this is a connection test." }
          ],
          max_completion_tokens: 5,
        });
        
        if (!response.choices[0]?.message?.content) {
          throw new Error('No response content received');
        }
        
        return response.choices[0].message.content;
      }, 'Connection test');
      
      return true;
    } catch (error) {
      console.error('Azure OpenAI connection test failed:', error);
      return false;
    }
  }

  private async withResilience<T>(
    operation: () => Promise<T>,
    context: string,
    timeoutMs: number = 30000
  ): Promise<T> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`${context} timed out after ${timeoutMs}ms`)), timeoutMs);
        });

        // Race between operation and timeout
        const result = await Promise.race([operation(), timeoutPromise]);
        return result;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry on certain errors
        if (lastError.message.includes('unauthorized') || 
            lastError.message.includes('forbidden') || 
            lastError.message.includes('invalid_api_key')) {
          break;
        }
        
        // Exponential backoff for retries
        if (attempt < maxRetries) {
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          console.warn(`${context} failed (attempt ${attempt}/${maxRetries}), retrying in ${delayMs}ms:`, lastError.message);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    throw new Error(`${context} failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
  }
}

export const azureOpenAIAdapter = new AzureOpenAIAdapter();
