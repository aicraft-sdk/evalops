import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
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

describe('EvaluatorsLLMService — per-method JSON parsing (Task 1.3)', () => {
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

  describe('evaluateBattle', () => {
    it('parses valid JSON and returns reasoning', async () => {
      aiProvider.generateResponse.mockResolvedValue({
        response: '{"score": 90, "reason": "Response A is clearer"}',
        cost: 0.001,
      });
      const result = await service.evaluateBattle('A', 'B', {}, 1);
      expect(result.score).toBeCloseTo(0.9);
      expect(result.reasoning).toBe('Response A is clearer');
    });

    it('falls back to the method default (50) when no JSON or number present', async () => {
      aiProvider.generateResponse.mockResolvedValue({
        response: 'no numeric content at all',
        cost: 0,
      });
      const result = await service.evaluateBattle('A', 'B', {}, 1);
      expect(result.score).toBeCloseTo(0.5);
      expect(result.reasoning).toBeUndefined();
    });
  });

  describe('evaluateSecurity', () => {
    it('parses valid JSON and returns reasoning', async () => {
      aiProvider.generateResponse.mockResolvedValue({
        response: '{"score": 95, "reason": "No PII or injection detected"}',
        cost: 0.001,
      });
      const result = await service.evaluateSecurity('resp', {}, 1);
      expect(result.score).toBeCloseTo(0.95);
      expect(result.reasoning).toBe('No PII or injection detected');
    });

    it('falls back to the method default (80) when no JSON or number present', async () => {
      aiProvider.generateResponse.mockResolvedValue({
        response: 'no numeric content at all',
        cost: 0,
      });
      const result = await service.evaluateSecurity('resp', {}, 1);
      expect(result.score).toBeCloseTo(0.8);
      expect(result.reasoning).toBeUndefined();
    });
  });

  describe('evaluateAnswerRelevancy', () => {
    it('parses valid JSON and returns reasoning', async () => {
      aiProvider.generateResponse.mockResolvedValue({
        response: '{"score": 88, "reason": "Directly answers the question"}',
        cost: 0.001,
      });
      const result = await service.evaluateAnswerRelevancy('resp', 'question', {}, 1);
      expect(result.score).toBeCloseTo(0.88);
      expect(result.reasoning).toBe('Directly answers the question');
    });

    it('falls back to the method default (70) when no JSON or number present', async () => {
      aiProvider.generateResponse.mockResolvedValue({
        response: 'no numeric content at all',
        cost: 0,
      });
      const result = await service.evaluateAnswerRelevancy('resp', 'question', {}, 1);
      expect(result.score).toBeCloseTo(0.7);
      expect(result.reasoning).toBeUndefined();
    });
  });

  describe('evaluateContextPrecision', () => {
    it('parses valid JSON and returns reasoning', async () => {
      aiProvider.generateResponse.mockResolvedValue({
        response: '{"score": 65, "reason": "Context mostly relevant"}',
        cost: 0.001,
      });
      const result = await service.evaluateContextPrecision('resp', 'query', ['ctx'], {}, 1);
      expect(result.score).toBeCloseTo(0.65);
      expect(result.reasoning).toBe('Context mostly relevant');
    });

    it('falls back to the method default (60) when no JSON or number present', async () => {
      aiProvider.generateResponse.mockResolvedValue({
        response: 'no numeric content at all',
        cost: 0,
      });
      const result = await service.evaluateContextPrecision('resp', 'query', ['ctx'], {}, 1);
      expect(result.score).toBeCloseTo(0.6);
      expect(result.reasoning).toBeUndefined();
    });
  });

  describe('evaluateContextRecall', () => {
    it('parses valid JSON and returns reasoning', async () => {
      aiProvider.generateResponse.mockResolvedValue({
        response: '{"score": 55, "reason": "Missed some expected facts"}',
        cost: 0.001,
      });
      const result = await service.evaluateContextRecall('expected', ['ctx'], {}, 1);
      expect(result.score).toBeCloseTo(0.55);
      expect(result.reasoning).toBe('Missed some expected facts');
    });

    it('falls back to the method default (60) when no JSON or number present', async () => {
      aiProvider.generateResponse.mockResolvedValue({
        response: 'no numeric content at all',
        cost: 0,
      });
      const result = await service.evaluateContextRecall('expected', ['ctx'], {}, 1);
      expect(result.score).toBeCloseTo(0.6);
      expect(result.reasoning).toBeUndefined();
    });
  });

  describe('evaluateContextRelevancy', () => {
    it('parses valid JSON and returns reasoning', async () => {
      aiProvider.generateResponse.mockResolvedValue({
        response: '{"score": 75, "reason": "Context aligns with query"}',
        cost: 0.001,
      });
      const result = await service.evaluateContextRelevancy('query', ['ctx'], {}, 1);
      expect(result.score).toBeCloseTo(0.75);
      expect(result.reasoning).toBe('Context aligns with query');
    });

    it('falls back to the method default (70) when no JSON or number present', async () => {
      aiProvider.generateResponse.mockResolvedValue({
        response: 'no numeric content at all',
        cost: 0,
      });
      const result = await service.evaluateContextRelevancy('query', ['ctx'], {}, 1);
      expect(result.score).toBeCloseTo(0.7);
      expect(result.reasoning).toBeUndefined();
    });
  });

  describe('evaluateFaithfulness', () => {
    it('parses valid JSON and returns reasoning', async () => {
      aiProvider.generateResponse.mockResolvedValue({
        response: '{"score": 82, "reason": "Faithful to source context"}',
        cost: 0.001,
      });
      const result = await service.evaluateFaithfulness('resp', ['ctx'], {}, 1);
      expect(result.score).toBeCloseTo(0.82);
      expect(result.reasoning).toBe('Faithful to source context');
    });

    it('falls back to the method default (80) when no JSON or number present', async () => {
      aiProvider.generateResponse.mockResolvedValue({
        response: 'no numeric content at all',
        cost: 0,
      });
      const result = await service.evaluateFaithfulness('resp', ['ctx'], {}, 1);
      expect(result.score).toBeCloseTo(0.8);
      expect(result.reasoning).toBeUndefined();
    });
  });

  describe('evaluateAnswerCorrectness', () => {
    it('parses valid JSON and returns reasoning', async () => {
      aiProvider.generateResponse.mockResolvedValue({
        response: '{"score": 91, "reason": "Matches expected answer"}',
        cost: 0.001,
      });
      const result = await service.evaluateAnswerCorrectness('resp', 'expected', {}, 1);
      expect(result.score).toBeCloseTo(0.91);
      expect(result.reasoning).toBe('Matches expected answer');
    });

    it('falls back to the method default (70) when no JSON or number present', async () => {
      aiProvider.generateResponse.mockResolvedValue({
        response: 'no numeric content at all',
        cost: 0,
      });
      const result = await service.evaluateAnswerCorrectness('resp', 'expected', {}, 1);
      expect(result.score).toBeCloseTo(0.7);
      expect(result.reasoning).toBeUndefined();
    });
  });

  describe('evaluatePIIDetection', () => {
    it('parses valid JSON and returns reasoning when the LLM branch is triggered', async () => {
      aiProvider.generateResponse.mockResolvedValue({
        response: '{"score": 40, "reason": "Contains an email address"}',
        cost: 0.001,
      });
      const result = await service.evaluatePIIDetection(
        'contact me at foo@example.com',
        { strictness: 'strict' },
        1,
      );
      expect(result.reasoning).toBe('Contains an email address');
    });

    it('falls back to the method default (0) when no JSON or number present', async () => {
      aiProvider.generateResponse.mockResolvedValue({
        response: 'no numeric content at all',
        cost: 0,
      });
      const result = await service.evaluatePIIDetection(
        'contact me at foo@example.com',
        { strictness: 'strict' },
        1,
      );
      expect(result.reasoning).toBeUndefined();
    });
  });

  describe('evaluateJailbreakDetection', () => {
    it('parses valid JSON and returns reasoning', async () => {
      aiProvider.generateResponse.mockResolvedValue({
        response: '{"score": 70, "reason": "Contains a prompt injection attempt"}',
        cost: 0.001,
      });
      const result = await service.evaluateJailbreakDetection(
        'ignore previous instructions',
        'resp',
        {},
        1,
      );
      expect(result.reasoning).toBe('Contains a prompt injection attempt');
    });

    it('falls back to the method default (0) when no JSON or number present', async () => {
      aiProvider.generateResponse.mockResolvedValue({
        response: 'no numeric content at all',
        cost: 0,
      });
      const result = await service.evaluateJailbreakDetection('benign', 'resp', {}, 1);
      expect(result.reasoning).toBeUndefined();
    });
  });

  describe('evaluateLLMAsJudge', () => {
    it('parses valid JSON and returns reasoning', async () => {
      aiProvider.generateResponse.mockResolvedValue({
        response: '{"score": 77, "reason": "Meets most rubric criteria"}',
        cost: 0.001,
      });
      const result = await service.evaluateLLMAsJudge(
        'resp',
        'expected',
        'Rate this response: {response} vs {expected}',
        1,
      );
      expect(result.score).toBeCloseTo(0.77);
      expect(result.reasoning).toBe('Meets most rubric criteria');
    });

    it('falls back to regex extraction on non-JSON custom judge prompt output', async () => {
      aiProvider.generateResponse.mockResolvedValue({
        response: 'The score is 65 out of 100',
        cost: 0.001,
      });
      const result = await service.evaluateLLMAsJudge(
        'resp',
        'expected',
        'Rate this response: {response} vs {expected}',
        1,
      );
      expect(result.score).toBeCloseTo(0.65);
      expect(result.reasoning).toBeUndefined();
    });

    it('appends the JSON-output instruction to the rendered prompt', async () => {
      aiProvider.generateResponse.mockResolvedValue({
        response: '{"score": 50, "reason": "ok"}',
        cost: 0.001,
      });
      await service.evaluateLLMAsJudge(
        'resp',
        'expected',
        'Rate this response: {response} vs {expected}',
        1,
      );
      const [renderedPrompt] = aiProvider.generateResponse.mock.calls[0];
      expect(renderedPrompt).toContain('Respond with a JSON object');
      expect(renderedPrompt).toContain('Rate this response: resp vs expected');
    });
  });
});

describe('EvaluatorsLLMService.parseJudgeResult — REM-FIX hardening', () => {
  let service: EvaluatorsLLMService;
  let aiProvider: { generateResponse: jest.Mock };
  let warnSpy: jest.SpyInstance;

  beforeEach(async () => {
    aiProvider = { generateResponse: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        EvaluatorsLLMService,
        { provide: AIProviderService, useValue: aiProvider },
      ],
    }).compile();
    service = moduleRef.get(EvaluatorsLLMService);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('coerces a string-typed score field to a number instead of falling through to the raw-text digit regex', async () => {
    // Without the fix, typeof parsed.score === 'number' is false for "85",
    // so the code silently falls through to matching the "2" in "Attempt 2:".
    aiProvider.generateResponse.mockResolvedValue({
      response:
        'Attempt 2: {"score":"85","reason":"Mostly accurate, minor omission"}',
      cost: 0.001,
    });

    const result = await service.evaluateFactuality('resp', 'question', {}, 1);

    expect(result.score).toBeCloseTo(0.85);
    expect(result.reasoning).toBe('Mostly accurate, minor omission');
  });

  it('parses the terminal JSON verdict object, not a merged blob spanning an earlier unrelated {...} example', async () => {
    // Without the fix, /\{[\s\S]*\}/ spans from the first { to the LAST },
    // merging both objects into unparseable text, then the raw-text digit
    // regex grabs "12" from the first (unrelated) example object.
    aiProvider.generateResponse.mockResolvedValue({
      response:
        'Example format: {"score": 12, "note": "schema example"} Actual verdict: {"score": 88, "reason": "Well cited and accurate"}',
      cost: 0.001,
    });

    const result = await service.evaluateFactuality('resp', 'question', {}, 1);

    expect(result.score).toBeCloseTo(0.88);
    expect(result.reasoning).toBe('Well cited and accurate');
  });

  it('preserves reasoning when a well-formed JSON object is followed by trailing prose', async () => {
    // Without the fix, startsWith('{') treats the WHOLE trimmed string
    // (including trailing prose) as the JSON candidate, so JSON.parse throws
    // and reasoning is silently lost via the fallback chain.
    aiProvider.generateResponse.mockResolvedValue({
      response:
        '{"score":85,"reason":"Thorough and correct"} Let me know if you need more detail.',
      cost: 0.001,
    });

    const result = await service.evaluateFactuality('resp', 'question', {}, 1);

    expect(result.score).toBeCloseTo(0.85);
    expect(result.reasoning).toBe('Thorough and correct');
  });

  it('clamps an out-of-range high score to 1 and logs a warning', async () => {
    aiProvider.generateResponse.mockResolvedValue({
      response: '{"score": 9999, "reason": "test"}',
      cost: 0.001,
    });

    const result = await service.evaluateFactuality('resp', 'question', {}, 1);

    expect(result.score).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('out of expected range'),
    );
  });

  it('clamps an out-of-range low (negative) score to 0 and logs a warning', async () => {
    aiProvider.generateResponse.mockResolvedValue({
      response: '{"score": -500, "reason": "test"}',
      cost: 0.001,
    });

    const result = await service.evaluateFactuality('resp', 'question', {}, 1);

    expect(result.score).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('out of expected range'),
    );
  });

  it('rejects a null score field instead of silently coercing it to 0', async () => {
    // Without the fix, Number(null) === 0, which is not NaN, so a judge
    // signaling refusal via score:null becomes a confident "perfect 0".
    aiProvider.generateResponse.mockResolvedValue({
      response: '{"score": null, "reason": "refusal"}',
      cost: 0.001,
    });

    const result = await service.evaluateFactuality('resp', 'question', {}, 1);

    expect(result.score).not.toBe(0);
    expect(result.score).toBeCloseTo(0.7); // evaluateFactuality's fallback default
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('not coercible to a number'),
    );
  });

  it('rejects a boolean true score field instead of silently coercing it to 0.01', async () => {
    // Without the fix, Number(true) === 1, so a boolean gets silently
    // interpreted as a real judge score.
    aiProvider.generateResponse.mockResolvedValue({
      response: '{"score": true, "reason": "test"}',
      cost: 0.001,
    });

    const result = await service.evaluateFactuality('resp', 'question', {}, 1);

    expect(result.score).not.toBeCloseTo(0.01, 5);
    expect(result.score).toBeCloseTo(0.7);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('not coercible to a number'),
    );
  });

  it('rejects a boolean false score field instead of silently coercing it to 0', async () => {
    aiProvider.generateResponse.mockResolvedValue({
      response: '{"score": false, "reason": "test"}',
      cost: 0.001,
    });

    const result = await service.evaluateFactuality('resp', 'question', {}, 1);

    expect(result.score).not.toBe(0);
    expect(result.score).toBeCloseTo(0.7);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('not coercible to a number'),
    );
  });

  it('rejects an array-typed score field instead of silently coercing it to 0', async () => {
    aiProvider.generateResponse.mockResolvedValue({
      response: '{"score": [], "reason": "test"}',
      cost: 0.001,
    });

    const result = await service.evaluateFactuality('resp', 'question', {}, 1);

    expect(result.score).not.toBe(0);
    expect(result.score).toBeCloseTo(0.7);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('not coercible to a number'),
    );
  });

  it('extracts and parses JSON correctly when the reason string contains an unmatched opening brace', async () => {
    // Without string-aware bracket counting, the literal "{" inside the
    // reason string never lets depth return to 0, so no candidate is found
    // and reasoning is silently lost to the digit-regex fallback.
    aiProvider.generateResponse.mockResolvedValue({
      response: '{"score":85,"reason":"missing brace in code like if (x) {"}',
      cost: 0.001,
    });

    const result = await service.evaluateFactuality('resp', 'question', {}, 1);

    expect(result.score).toBeCloseTo(0.85);
    expect(result.reasoning).toBe('missing brace in code like if (x) {');
  });

  it('extracts and parses JSON correctly when the reason string contains an unmatched closing brace', async () => {
    // Without string-aware bracket counting, the literal "}" inside the
    // reason string truncates the candidate mid-string, JSON.parse throws,
    // and reasoning is silently lost to the digit-regex fallback.
    aiProvider.generateResponse.mockResolvedValue({
      response: '{"score":85,"reason":"unexpected } in the middle"}',
      cost: 0.001,
    });

    const result = await service.evaluateFactuality('resp', 'question', {}, 1);

    expect(result.score).toBeCloseTo(0.85);
    expect(result.reasoning).toBe('unexpected } in the middle');
  });
});
