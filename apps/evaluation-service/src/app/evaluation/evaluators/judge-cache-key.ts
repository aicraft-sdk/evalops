import { createHash } from 'crypto';

/** Bump when the key derivation logic itself changes, to force a clean cache generation. */
const CACHE_KEY_VERSION = 1;

export interface JudgeCacheKeyInput {
  evaluatorName: string;
  organizationId: string;
  sampleId?: string;
  output: string;
  expected?: string;
  contexts?: string[];
  /**
   * Stable fingerprint of the prompt/rubric identity used for this call.
   * For hardcoded-template methods: a literal version string bumped whenever
   * the template text changes (e.g. 'v1-factuality'). For evaluateLLMAsJudge
   * (user-supplied judgePrompt): sha256 of the rendered prompt text itself.
   */
  promptFingerprint: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  seed: number;
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function computeJudgeCacheKey(input: JudgeCacheKeyInput): string {
  const sampleIdentity =
    input.sampleId ?? `content:${sha256(JSON.stringify(input.output ?? null))}`;

  const canonical = JSON.stringify({
    v: CACHE_KEY_VERSION,
    evaluator: input.evaluatorName,
    org: input.organizationId,
    sample: sampleIdentity,
    outputHash: sha256(input.output ?? ''),
    expectedHash: sha256(input.expected ?? ''),
    contextsHash: sha256(JSON.stringify(input.contexts ?? [])),
    promptFingerprint: input.promptFingerprint,
    model: input.model,
    temperature: input.temperature ?? null,
    maxTokens: input.maxTokens ?? null,
    seed: input.seed,
  });

  return sha256(canonical);
}
