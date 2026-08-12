# Judge Cache Wiring and Model-Resolution Fix

## What Changed

All 12 `EvaluatorsLLMService` judge methods
(`apps/evaluation-service/src/app/evaluation/evaluators/evaluators-llm.service.ts`) —
`evaluateLLMAsJudge`, `evaluateBattle`, `evaluateFactuality`, `evaluateSecurity`,
`evaluateAnswerRelevancy`, `evaluateContextPrecision`, `evaluateContextRecall`,
`evaluateContextRelevancy`, `evaluateFaithfulness`, `evaluateAnswerCorrectness`,
`evaluatePIIDetection`, `evaluateJailbreakDetection` — now route their `AIProviderService`
call through `JudgeCacheService.getOrCompute()` (the Phase 2 infrastructure from
`docs/2026-08-12-judge-result-caching-decision.md`) instead of calling
`aiProvider.generateResponse` directly: a cache hit returns the stored score/reasoning and
skips the model call entirely; a miss invokes the compute function and best-effort writes
the result. `organizationId` was added as a new, purely additive final parameter on all 12
`EvaluatorsLLMService` methods and their `EvaluatorsService` facade passthroughs, and is
threaded from `EvaluationRunnerService.evaluateSample`'s new 6th parameter (also additive)
through to every `this.evaluators.evaluateXxx(...)` call site; `evaluation.service.ts`
passes `run.organizationId` in. Separately, `evaluation.service.ts`'s per-repetition seed
fallback (used when `evalSpec.seeds` is unset) was changed from `Math.random() * 1000000`
to `deriveFallbackSeed(evalSpecId, repetitionIndex)`, a stable sha256-based hash, so unseeded
suite reruns derive the same seed each time.

**Behavior change — `EvaluatorConfig.model` is now honored:** 11 of the 12 methods above
(all except the base `evaluateLLMAsJudge` path, which has no `config` parameter) previously
built their `AIProviderService.generateResponse` call's `ModelConfig` as
`{ temperature: 0.1, maxTokens: 150, responseFormat: 'json_object' }` — no `model` field —
so any `model` set on the evaluator's `EvaluatorConfig` was silently dropped and every judge
call used `AIProviderService`'s internal default model, regardless of config. Each of those
11 methods now resolves `const model = (config?.model as string) || this.aiProvider.getDefaultModel()`
and passes `{ model, temperature, maxTokens, responseFormat: 'json_object' }` explicitly.
This was required so the cache key (which includes `model`) reflects the model the API call
actually used — deriving it from `config?.model` rather than assuming the default in the
compute path is the only way to keep the two in sync. Fixing that also means `config.model`
now actually takes effect for scoring, which it never did before.

## Why

Caching needs a cache key that matches the model actually used to produce the cached
score — otherwise a cache hit could return a score for the wrong model, or two different
models could collide on the same key. Deriving `model` explicitly (instead of leaving it
implicit inside `generateResponse`'s own default-resolution) surfaced that `config?.model`
was never being read at all in the pre-existing code, i.e. the field existed on
`EvaluatorConfig` but was dead for every LLM-judge call. This was raised during review; the
user was informed and explicitly chose to keep the fix (rather than deferring it or
preserving the old silent-ignore behavior) and have it documented here.

## Alternatives Considered

- **Keep computing the cache-key `model` field via `getDefaultModel()` only, without changing
  the `generateResponse` call:** Rejected. This would make the cache key claim a model
  (`config.model`, if set) that the API call did not actually use, defeating the purpose of
  keying the cache on model — a config'd-model judge run and a default-model judge run would
  either collide on the same cache key or the key would misrepresent reality either way.
- **Preserve the old silent-ignore behavior for `config.model` and pass a hardcoded/default
  model into both the cache key and the API call:** Rejected. This keeps the cache key
  internally consistent but means `EvaluatorConfig.model` remains permanently dead for every
  judge method, which is a worse state than fixing it now that the mismatch is already known.
- **Defer the model-resolution fix to a separate, later phase and land only the cache wiring
  in this phase:** Considered, but the cache key change and the model-passthrough fix are the
  same line of code (`const model = ...`) — splitting them would mean shipping a cache key
  that is known to be wrong for one release. The user chose to land and document the fix now.

## Impact

- **Eval spec authors who set a custom `model` on a judge evaluator's config:** their samples
  will, for the first time, actually be scored by that configured model instead of always the
  default model — a real scoring-outcome change on the next run for those eval specs. No eval
  spec syntax change is required; this is a runtime behavior fix, not a new field.
- **Eval spec authors who never set `model` on a judge evaluator config:** no change —
  `config?.model || getDefaultModel()` resolves to the same default model as before.
- **Cache correctness:** cache keys now always reflect the model actually used, so a
  configured-model run and a default-model run for the same otherwise-identical inputs will
  no longer collide on the same `judge_cache` row.
- **Callers of `EvaluationRunnerService.evaluateSample` / `EvaluatorsService.evaluateXxx`:**
  no breaking change — `organizationId` was added as a new final parameter on each affected
  signature, purely additive.
- **Ongoing maintenance:** any new `EvaluatorsLLMService` judge method should read
  `config?.model || this.aiProvider.getDefaultModel()` (not hardcode a model or omit it)
  before calling `generateResponse`, so its cache key stays accurate; see
  `CACHE_KEY_VERSION` guidance in `docs/2026-08-12-judge-result-caching-decision.md` if the
  key-derivation shape itself ever changes.
