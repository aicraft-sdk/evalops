import { azureOpenAIAdapter } from '../../services/azureOpenAIAdapter';

// Mock OpenAI module
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
      embeddings: {
        create: jest.fn(),
      },
    })),
  };
});

describe('AzureOpenAIAdapter', () => {
  const mockCreate = jest.fn();
  const mockEmbeddingsCreate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Access the mocked OpenAI instance
    const OpenAI = require('openai').default;
    const mockInstance = new OpenAI();
    mockInstance.chat.completions.create = mockCreate;
    mockInstance.embeddings.create = mockEmbeddingsCreate;
    
    // Replace the instance in the adapter
    (azureOpenAIAdapter as any).client = mockInstance;
  });

  describe('generateResponse', () => {
    it('should generate a response successfully', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'This is a test response',
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await azureOpenAIAdapter.generateResponse(
        'Test prompt with {input}',
        'test input',
        { temperature: 0.7 },
        12345
      );

      expect(result).toEqual({
        response: 'This is a test response',
        cost: expect.any(Number),
        tokenUsage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
      });

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gpt-5',
        messages: [{ role: 'user', content: 'Test prompt with test input' }],
        temperature: 0.7,
        max_tokens: 1000,
        top_p: 1.0,
        frequency_penalty: 0,
        presence_penalty: 0,
        seed: 12345,
      });
    });

    it('should handle API errors gracefully', async () => {
      mockCreate.mockRejectedValue(new Error('API Error'));

      await expect(
        azureOpenAIAdapter.generateResponse(
          'Test prompt',
          'test input',
          { temperature: 0.7 }
        )
      ).rejects.toThrow('Azure OpenAI generation failed: API Error');
    });

    it('should replace multiple placeholder types in prompts', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Response' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      await azureOpenAIAdapter.generateResponse(
        'Prompt with {input}, {user_input}, and {query}',
        'test value',
        { temperature: 0.7 }
      );

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'user', content: 'Prompt with test value, test value, and test value' }],
        })
      );
    });
  });

  describe('generateEmbeddings', () => {
    it('should generate embeddings successfully', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3, 0.4];
      const mockResponse = {
        data: [{ embedding: mockEmbedding }],
      };

      mockEmbeddingsCreate.mockResolvedValue(mockResponse);

      const result = await azureOpenAIAdapter.generateEmbeddings('test text');

      expect(result).toEqual(mockEmbedding);
      expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
        model: 'text-embedding-ada-002',
        input: 'test text',
      });
    });

    it('should handle embedding errors gracefully', async () => {
      mockEmbeddingsCreate.mockRejectedValue(new Error('Embedding Error'));

      await expect(
        azureOpenAIAdapter.generateEmbeddings('test text')
      ).rejects.toThrow('Embedding generation failed: Embedding Error');
    });
  });

  describe('testConnection', () => {
    it('should return true for successful connection', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Hello!' } }],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await azureOpenAIAdapter.testConnection();

      expect(result).toBe(true);
    });

    it('should return false for failed connection', async () => {
      mockCreate.mockRejectedValue(new Error('Connection failed'));

      const result = await azureOpenAIAdapter.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('cost calculation', () => {
    it('should calculate costs correctly', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Response' } }],
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 500,
          total_tokens: 1500,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await azureOpenAIAdapter.generateResponse(
        'Test prompt',
        'test input',
        { temperature: 0.7 }
      );

      // Cost should be: (1000/1000 * 0.03) + (500/1000 * 0.06) = 0.03 + 0.03 = 0.06
      expect(result.cost).toBeCloseTo(0.06, 2);
    });
  });
});