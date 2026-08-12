# LLM-Judge Structured JSON Output

## What Changed

`AIProviderService.generateResponse` (`apps/evaluation-service/src/app/ai-provider/ai-provider.service.ts`)
gained an optional `responseFormat: 'json_object'` field on `ModelConfig`. When set, the
service requests `response_format: { type: 'json_object' }` from the chat-completions call;
if the model/provider rejects that parameter with a `400` mentioning `response_format`, it
logs a warning and retries the same request without it rather than failing the call. A new
`getDefaultModel()` getter was also added.

All 12 LLM-judge methods in `EvaluatorsLLMService`
(`apps/evaluation-service/src/app/evaluation/evaluators/evaluators-llm.service.ts`) —
battle, factuality, security, answer relevancy, context precision/recall/relevancy,
faithfulness, answer correctness, PII, jailbreak, and the base judge path — now append a
`Respond with a JSON object: {"score": <0-100 integer>, "reason": "<one sentence>"}`
instruction to their prompts, call `generateResponse` with `responseFormat: 'json_object'`
and `maxTokens: 150` (up from `10`-`50`), and parse the result through a new
`parseJudgeResult`/`extractJsonCandidates` pair instead of the previous
`parseInt(response.match(/\d+/)?.[0] || fallback)` regex. `extractJsonCandidates` does
string-aware, non-greedy, non-overlapping `{...}` bracket counting to find candidate JSON
objects (rather than a greedy first-`{`-to-last-`}` regex that would merge unrelated brace
groups); `parseJudgeResult` walks candidates from last to first, requires a `score` field,
explicitly type-checks it (rejecting `null`/boolean/array coercion, accepting numeric
strings including scientific notation), and falls back to the original digit-regex, then to
the method's hardcoded default score, if no candidate parses. `EvaluatorResult`
(`evaluators.service.ts`) gained an optional `reasoning?: string` field populated from the
judge's `reason`. This was landed as Phase 1 of the judge-caching-and-calibration plan
(commits `7a12783`, `b9e1c62`, `def95f3`, `37d3eb0`, `51536fe`, `02bc29e`).

## Why

The prior prompts asked judges to "respond with only a number" and extracted the first
digit sequence with a regex. That gave no signal for *why* a judge picked a score, and a
digit-only regex is fragile against any preamble/postamble text the model adds. Structured
`{score, reason}` JSON output makes the judge's rationale available (needed by later phases
of this plan for calibration/audit against a golden set) and makes score extraction more
robust — parsing a declared `score` field instead of pattern-matching arbitrary digits in the
response.

## Alternatives Considered

- **Require `response_format: json_object` unconditionally, with no fallback:** Rejected.
  Not every configured model/deployment accepts `response_format`; a hard requirement would
  turn an unsupported-parameter `400` into a full evaluation failure for those models.
  The catch-and-retry-without-it path keeps existing model configs working.
- **Keep the single first-`{`-to-last-`}` extraction instead of bracket counting:** Rejected.
  A greedy regex spanning the first `{` to the last `}` would merge multiple unrelated JSON
  objects (or brace characters inside a `reason` string) into one blob that fails to parse,
  silently falling through to the old fallback score on responses that actually contained a
  valid JSON answer.
- **Use `Number()` to coerce `parsed.score`:** Rejected. `Number()` accepts `null` (→ 0),
  booleans (→ 1/0), and arrays (→ 0 or the element), none of which are `NaN` — this would
  reproduce the exact class of silent mis-scoring the structured-output parser exists to
  prevent. An explicit `typeof`/numeric-string check is used instead.
- **Drop the digit-regex fallback entirely once JSON parsing exists:** Rejected. Kept as a
  second-tier fallback (before the method's hardcoded default) so a judge response that
  isn't valid JSON but still contains a lone number doesn't regress to the least-informative
  fallback score.

## Impact

- **Callers of `EvaluatorsLLMService` judge methods:** No breaking change — return shape is
  additive (`reasoning` is optional on `EvaluatorResult`); score is still a `0`-`1` float.
  `reasoning` is not yet read or persisted anywhere downstream in this diff; it is
  groundwork for a later phase of the judge-caching-and-calibration plan.
- **Config/env:** None. No new environment variables or config surface.
- **Ongoing maintenance:** Any new LLM-judge method added to `EvaluatorsLLMService` should
  follow the same pattern (JSON-object prompt instruction + `responseFormat: 'json_object'`
  + `parseJudgeResult`) to stay consistent; a judge method that skips this would silently
  lose the reasoning capture and the more robust score parsing.
- **No docs previously described these internals** (no existing technical/business doc
  referenced `parseJudgeScore`, `generateResponse`'s `ModelConfig`, or `EvaluatorResult`);
  this decision doc is the only doc-layer update for this change.
