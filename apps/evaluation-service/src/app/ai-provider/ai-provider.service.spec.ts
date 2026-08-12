import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AIProviderService } from './ai-provider.service';

// Mock the OpenAI SDK client so we control chat.completions.create() behavior.
const mockCreate = jest.fn();
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
    embeddings: { create: jest.fn() },
  }));
});

describe('AIProviderService — responseFormat', () => {
  let service: AIProviderService;

  beforeEach(async () => {
    mockCreate.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AIProviderService,
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();
    service = moduleRef.get(AIProviderService);
  });

  it('passes response_format: json_object through to the OpenAI call when requested', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: '{"score":80,"reason":"ok"}' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    await service.generateResponse('prompt', '', { responseFormat: 'json_object' }, 1);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ response_format: { type: 'json_object' } }),
    );
  });

  it('retries once WITHOUT response_format if the provider 400s on the parameter, then succeeds', async () => {
    const unsupportedError = Object.assign(new Error('Invalid parameter: response_format'), {
      status: 400,
    });
    mockCreate
      .mockRejectedValueOnce(unsupportedError)
      .mockResolvedValueOnce({
        choices: [{ message: { content: '80' } }],
        usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
      });

    const result = await service.generateResponse(
      'prompt',
      '',
      { responseFormat: 'json_object' },
      1,
    );

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate).toHaveBeenNthCalledWith(
      2,
      expect.not.objectContaining({ response_format: expect.anything() }),
    );
    expect(result.response).toBe('80');
  });

  it('exposes the resolved default model via getDefaultModel()', () => {
    // ConfigService mock returns undefined for every key, so this must match
    // ai-provider.service.ts's own hardcoded 'gpt-4' fallback exactly.
    expect(service.getDefaultModel()).toBe('gpt-4');
  });
});
