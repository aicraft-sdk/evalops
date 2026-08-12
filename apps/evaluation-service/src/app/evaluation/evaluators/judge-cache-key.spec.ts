import { computeJudgeCacheKey } from './judge-cache-key';

describe('computeJudgeCacheKey', () => {
  const base = {
    evaluatorName: 'evaluateFactuality',
    organizationId: 'org-1',
    sampleId: 'sample-1',
    output: 'the response text',
    expected: 'question text',
    contexts: undefined as string[] | undefined,
    promptFingerprint: 'v1-factuality',
    model: 'gpt-4',
    temperature: 0.1,
    maxTokens: 150,
    seed: 42,
  };

  it('is deterministic: identical inputs produce an identical key', () => {
    expect(computeJudgeCacheKey(base)).toBe(computeJudgeCacheKey({ ...base }));
  });

  it.each([
    ['organizationId', { organizationId: 'org-2' }],
    ['output', { output: 'a different response' }],
    ['expected', { expected: 'a different question' }],
    ['model', { model: 'gpt-3.5-turbo' }],
    ['temperature', { temperature: 0.5 }],
    ['seed', { seed: 43 }],
    ['promptFingerprint', { promptFingerprint: 'v2-factuality' }],
    ['evaluatorName', { evaluatorName: 'evaluateSecurity' }],
  ])('changes when %s changes', (_label, override) => {
    expect(computeJudgeCacheKey({ ...base, ...override })).not.toBe(
      computeJudgeCacheKey(base),
    );
  });

  it('falls back to a content hash of the sample when sampleId is absent, varying only sampleId presence with output held fixed', () => {
    // `output` is identical in both calls (base.output, unchanged) — the only
    // difference is whether `sampleId` is present. This proves the two
    // sample-identity code paths ('sample-1' literal vs 'content:<hash>')
    // produce different key material purely from sampleId's presence/absence,
    // not from any other input change.
    const withId = computeJudgeCacheKey({ ...base, sampleId: 'sample-1' });
    const withoutId = computeJudgeCacheKey({ ...base, sampleId: undefined });
    expect(withoutId).not.toBe(withId);
    // and is still deterministic on its own
    expect(computeJudgeCacheKey({ ...base, sampleId: undefined })).toBe(withoutId);
  });

  it('produces a 64-character lowercase hex sha256 digest', () => {
    expect(computeJudgeCacheKey(base)).toMatch(/^[a-f0-9]{64}$/);
  });
});
