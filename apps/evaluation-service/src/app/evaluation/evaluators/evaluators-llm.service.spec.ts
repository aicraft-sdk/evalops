import { Test } from '@nestjs/testing';
import { AIProviderService } from '../../ai-provider/ai-provider.service';
import { EvaluatorsLLMService } from './evaluators-llm.service';

describe('EvaluatorsLLMService.parseJudgeResult (via evaluateFactuality)', () => {
  let service: EvaluatorsLLMService;
  let aiProvider: { generateResponse: jest.Mock };

  beforeEach(async () => {
    aiProvider = { generateResponse: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        EvaluatorsLLMService,
        { provide: AIProviderService, useValue: aiProvider },
      ],
    }).compile();
    service = moduleRef.get(EvaluatorsLLMService);
  });

  it('parses valid JSON {"score":N,"reason":"..."} and returns both fields', async () => {
    aiProvider.generateResponse.mockResolvedValue({
      response: '{"score": 85, "reason": "Mostly accurate, minor omission"}',
      cost: 0.001,
    });

    const result = await service.evaluateFactuality('resp', 'question', {}, 1);

    expect(result.score).toBeCloseTo(0.85);
    expect(result.reasoning).toBe('Mostly accurate, minor omission');
  });

  it('falls back to regex number extraction on malformed JSON, with reasoning undefined', async () => {
    aiProvider.generateResponse.mockResolvedValue({
      response: 'Score: 72 out of 100 (not JSON)',
      cost: 0.001,
    });

    const result = await service.evaluateFactuality('resp', 'question', {}, 1);

    expect(result.score).toBeCloseTo(0.72);
    expect(result.reasoning).toBeUndefined();
  });

  it('defaults to the existing method-specific fallback score when neither JSON nor a number is found', async () => {
    aiProvider.generateResponse.mockResolvedValue({
      response: 'no numeric content at all',
      cost: 0,
    });

    const result = await service.evaluateFactuality('resp', 'question', {}, 1);

    expect(result.score).toBeCloseTo(0.7); // evaluateFactuality's existing '70' default
    expect(result.reasoning).toBeUndefined();
  });
});
