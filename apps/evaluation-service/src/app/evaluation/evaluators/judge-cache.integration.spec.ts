import { Test } from '@nestjs/testing';
import { AIProviderService } from '../../ai-provider/ai-provider.service';
import { JudgeCacheRepository } from '@evalops/shared-db';
import { JudgeCacheService } from './judge-cache.service';
import { EvaluatorsLLMService } from './evaluators-llm.service';

// '@evalops/shared-db' is a barrel that loads '../db' at module-load time,
// which throws if DATABASE_URL isn't set (see libs/shared-db/src/lib/db.ts).
// JudgeCacheRepository is only used here as a DI token backed by an
// in-memory Map, so mock the barrel (matches judge-cache.service.spec.ts).
jest.mock('@evalops/shared-db', () => ({
  JudgeCacheRepository: class JudgeCacheRepository {},
}));

describe('Judge caching — rerun produces zero second-run AI calls (Task 3.4)', () => {
  it('calls the AI provider once on first run, zero times on an identical rerun', async () => {
    const store = new Map<string, Record<string, unknown>>();
    const repo = {
      findByCacheKey: jest.fn((key: string) => Promise.resolve(store.get(key))),
      create: jest.fn((row: Record<string, unknown>) => {
        store.set(row.cacheKey as string, row);
        return Promise.resolve(row);
      }),
    };
    const generateResponse = jest.fn().mockResolvedValue({
      response: '{"score": 90, "reason": "accurate"}',
      cost: 0.001,
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        EvaluatorsLLMService,
        JudgeCacheService,
        {
          provide: AIProviderService,
          useValue: { generateResponse, getDefaultModel: jest.fn().mockReturnValue('gpt-4') },
        },
        { provide: JudgeCacheRepository, useValue: repo },
      ],
    }).compile();
    const svc = moduleRef.get(EvaluatorsLLMService);

    const firstRun = await svc.evaluateFactuality('same response', 'same question', {}, 42, 'org-1');
    expect(generateResponse).toHaveBeenCalledTimes(1);
    expect(firstRun.score).toBeCloseTo(0.9);

    const secondRun = await svc.evaluateFactuality('same response', 'same question', {}, 42, 'org-1');
    expect(generateResponse).toHaveBeenCalledTimes(1); // still 1 — second call was a cache hit
    expect(secondRun.score).toBeCloseTo(0.9);
    expect(secondRun.reasoning).toBe('accurate');
  });
});
