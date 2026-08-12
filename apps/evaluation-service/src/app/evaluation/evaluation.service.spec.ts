// '@evalops/shared-db' is a barrel that loads '../db' at module-load time,
// which throws if DATABASE_URL isn't set (see libs/shared-db/src/lib/db.ts).
// evaluation.service.ts imports repositories from it purely for typing here
// (deriveFallbackSeed is a standalone pure function) - mock the barrel to
// avoid the load-time throw (matches the pattern in judge-cache.service.spec.ts).
jest.mock('@evalops/shared-db', () => ({
  RunsRepository: class RunsRepository {},
  SampleResultsRepository: class SampleResultsRepository {},
}));

import { deriveFallbackSeed } from './evaluation.service';

describe('deriveFallbackSeed (Task 3.3)', () => {
  it('derives the same fallback seed across two runs of the same eval spec + repetition when seeds are unset', () => {
    const seed1 = deriveFallbackSeed('eval-spec-1', 0);
    const seed2 = deriveFallbackSeed('eval-spec-1', 0);
    expect(seed1).toBe(seed2);
  });

  it('derives a different fallback seed for a different repetition index', () => {
    expect(deriveFallbackSeed('eval-spec-1', 0)).not.toBe(deriveFallbackSeed('eval-spec-1', 1));
  });
});
