import { Test } from '@nestjs/testing';
import { JudgeCacheRepository } from '@evalops/shared-db';
import { JudgeCacheService } from './judge-cache.service';

// '@evalops/shared-db' is a barrel that loads '../db' at module-load time,
// which throws if DATABASE_URL isn't set (see libs/shared-db/src/lib/db.ts).
// Mock it here since JudgeCacheRepository is only used as a DI token in this
// unit test (matches the pattern in simulations.service.spec.ts).
jest.mock('@evalops/shared-db', () => ({
  JudgeCacheRepository: class JudgeCacheRepository {},
}));

describe('JudgeCacheService.getOrCompute', () => {
  let service: JudgeCacheService;
  let repo: { findByCacheKey: jest.Mock; create: jest.Mock };

  beforeEach(async () => {
    repo = { findByCacheKey: jest.fn(), create: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        JudgeCacheService,
        { provide: JudgeCacheRepository, useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(JudgeCacheService);
  });

  it('returns the cached result with cost:0 on a hit, without invoking computeFn', async () => {
    repo.findByCacheKey.mockResolvedValue({
      score: 0.9, reasoning: 'cached reason', cost: '0.002',
    });
    const computeFn = jest.fn();

    const result = await service.getOrCompute(
      'evaluateFactuality', keyInput(), 'org-1', computeFn,
    );

    expect(result).toEqual({ score: 0.9, reasoning: 'cached reason', cost: 0 });
    expect(computeFn).not.toHaveBeenCalled();
  });

  it('calls computeFn and writes to cache on a miss', async () => {
    repo.findByCacheKey.mockResolvedValue(undefined);
    const computeFn = jest.fn().mockResolvedValue({
      score: 0.6, reasoning: 'fresh reason', cost: 0.003,
    });

    const result = await service.getOrCompute(
      'evaluateFactuality', keyInput(), 'org-1', computeFn,
    );

    expect(computeFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ score: 0.6, reasoning: 'fresh reason', cost: 0.003 });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ score: 0.6, reasoning: 'fresh reason', organizationId: 'org-1' }),
    );
  });

  it('fails open: a lookup DB error still calls computeFn and returns its result', async () => {
    repo.findByCacheKey.mockRejectedValue(new Error('connection reset'));
    const computeFn = jest.fn().mockResolvedValue({ score: 0.4, cost: 0.001 });

    const result = await service.getOrCompute(
      'evaluateFactuality', keyInput(), 'org-1', computeFn,
    );

    expect(computeFn).toHaveBeenCalledTimes(1);
    expect(result.score).toBe(0.4);
  });

  it('fails open: a write DB error does not throw and still returns the live result', async () => {
    repo.findByCacheKey.mockResolvedValue(undefined);
    repo.create.mockRejectedValue(new Error('write failed'));
    const computeFn = jest.fn().mockResolvedValue({ score: 0.7, cost: 0.001 });

    const result = await service.getOrCompute(
      'evaluateFactuality', keyInput(), 'org-1', computeFn,
    );

    expect(result.score).toBe(0.7);
  });
});

function keyInput() {
  return {
    sampleId: 's1', output: 'resp', expected: 'exp', contexts: undefined,
    promptFingerprint: 'v1-factuality', model: 'gpt-4', temperature: 0.1,
    maxTokens: 150, seed: 1,
  };
}
