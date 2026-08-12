# Calibration Methodology and Kappa-Fabrication Safeguards

## What Changed

`computeCohensKappa()` (`apps/evaluation-service/src/app/evaluation/calibration/cohens-kappa.ts`)
and `CalibrationService.runCalibration()`
(`apps/evaluation-service/src/app/evaluation/calibration/calibration.service.ts`) landed as
Phase 5 of the judge-caching-and-calibration plan. `runCalibration` validates preconditions
(`judgeThreshold` within `[0,1]`, golden set has examples, includes at least one bad-labeled
example), dispatches every one of the 12 judge types via `EvaluatorsService`'s cache-aware
methods (an explicit `scoreExample` switch, so an unsupported `judgeEvaluator` fails loudly
instead of silently calling `undefined`), binarizes each judge score at `judgeThreshold`,
computes Cohen's kappa between the binarized judge labels and `golden_set_examples.human_label`,
and persists a `calibration_runs` row (`agreementRate`, `kappa`, `isCalibrated`, `isReliable`,
`sampleCount`, `disagreements`). `isReliable` requires `sampleCount >= 5`
(`MIN_RELIABLE_SAMPLES`); `isCalibrated` requires both `isReliable` and
`kappa >= 0.8` (`KAPPA_CALIBRATED_THRESHOLD`) — a run can never be "calibrated" if it isn't
even statistically reliable.

Four follow-up remediation commits (`d06e1a6`, `cc16c98`, `dac6c08`, `1a96306`) hardened
`runCalibration` against several ways a persisted kappa could be silently fabricated rather
than reflecting real judge discernment:

- **Swallowed-failure exclusion:** every one of `evaluators-llm.service.ts`'s 12 judge methods
  has an outer catch-all that returns `{ score: 0, cost: 0 }` (no `reasoning`) on any thrown
  error. `isLikelySwallowedFailure` treats `score === 0 && reasoning === undefined` as this
  signature and excludes the example from kappa, with the exclusion reason recorded — a
  documented heuristic, not a proof, since a genuine JSON-parsed zero verdict also carries no
  `reasoning` in some legitimate cases (see below).
- **`pii_detection` carve-out:** `evaluatePIIDetection`'s pattern-only clean result (`score: 0`,
  no `reasoning`, no LLM call by design) shares the exact shape of a swallowed failure, so
  `isLikelySwallowedFailure` never checks `pii_detection` — otherwise every genuine "no PII
  found" data point would be wrongly excluded from kappa.
- **Class-diversity guard:** after per-example exclusion, `runCalibration` throws
  `BadRequestException` unless **both** a `humanLabel:false` and a `humanLabel:true` example
  survive. Without this, `computeCohensKappa`'s `pe === 1` degenerate branch fabricates
  `kappa: 1` (and potentially `isCalibrated: true`) from single-class agreement alone, with
  zero evidence the judge can discriminate between good and bad examples. The guard was
  widened in `dac6c08` after `cc16c98` only checked the negative-class case, missing the
  symmetric positive-class case.
- **Pre-dispatch exclusion of fabricated non-zero defaults:** `evaluateFaithfulness` returns
  `{ score: 1, cost: 0 }` when `contexts` is empty, and `evaluateAnswerCorrectness` returns
  `{ score: 0.5, cost: 0 }` when `expected` is missing — both fabricate a non-zero default with
  no LLM call, bypassing `isLikelySwallowedFailure`'s `score === 0` check entirely.
  `checkRequiredFieldForEvaluator` detects the missing required field and excludes the example
  before `scoreExample` is ever dispatched.
- **Zero-usable-data-points guard:** if every example is excluded, `runCalibration` throws
  rather than persisting a run computed from an empty pair set.
- **Fail-fast on invalid `judgeEvaluator`:** a thrown `BadRequestException` from `scoreExample`
  (an invalid `judgeEvaluator` value) aborts the whole run immediately, since it applies
  identically to every example; any other thrown exception excludes only that one example.

## Why

A calibration run's entire purpose is to tell a human operator whether an LLM judge can be
trusted to agree with human labels. Every one of the safeguards above closes a path by which
`runCalibration` could persist a high, "calibrated"-looking `kappa` that does not reflect real
judge discernment — either because the input pairs included fabricated/failure scores
mislabeled as genuine verdicts, or because exclusion collapsed the sample down to a single
human-label class, which makes `kappa` mathematically degenerate (`pe === 1`) rather than
meaningful. Silently trusting a fabricated `kappa: 1` would let an operator mark a judge
"calibrated" and route production traffic through it with no actual discernment evidence —
worse than having no calibration data at all, because it looks like real evidence.

## Alternatives Considered

- **Modify `evaluators-llm.service.ts`'s 12 catch blocks to return a distinguishable
  failure marker instead of `{ score: 0, cost: 0 }`:** Rejected for this phase. That would be
  the airtight fix, but it changes the return shape of every LLM-judge evaluator method
  (used well beyond calibration, in live eval runs) and was out of scope here; the heuristic
  detector is called out in-code as a known limitation rather than presented as a proof.
- **Trust every scored example as ground truth and skip exclusion entirely:** Rejected. This
  is what the original `348a787`/`926c62d` implementation did; the four remediation commits
  exist specifically because that approach let swallowed failures and fabricated defaults
  masquerade as genuine judge verdicts in the persisted statistic.
- **Only guard against the negative-class (`humanLabel:false`) exclusion case:** Rejected
  (this was `cc16c98`'s initial fix). `dac6c08` widened it after recognizing the symmetric
  positive-class case triggers the same `pe === 1` degenerate fabrication.
- **Exclude `pii_detection` results the same way as other evaluators:** Rejected. Doing so
  would discard every legitimate "no PII found" data point, since its clean result is
  shape-identical to a swallowed failure; the evaluator-specific carve-out is an explicit,
  documented exception rather than a broader heuristic weakening.

## Impact

- **Golden-set / calibration operators:** a persisted `calibration_runs` row can now be
  trusted to reflect real judge-vs-human agreement rather than including fabricated or
  failure-tainted scores; some golden sets that previously would have "succeeded" with a
  fabricated `kappa` will now throw `BadRequestException` instead (e.g. if exclusion leaves
  only one human-label class, or if the golden set lacks required fields for `faithfulness`/
  `answer_correctness` on enough examples). This is an intentional behavior change — see the
  `disagreements.excludedExamples` array on any successful run for per-example exclusion
  reasons.
- **`CalibrationService` is not yet wired into `evaluation.module.ts` or exposed via a REST
  controller** — this phase lands the service and its safeguards only; endpoint wiring is a
  later phase of the judge-caching-and-calibration plan.
- **Ongoing maintenance:** `isLikelySwallowedFailure` is explicitly documented in-code as a
  heuristic, not a proof — any new `EvaluatorsLLMService` judge method that can legitimately
  return `{ score: 0, reasoning: undefined }` (like `pii_detection`'s pattern-only path, or
  the context-based evaluators' empty-context early return) needs the same kind of
  evaluator-specific carve-out or pre-dispatch field check considered here, not a blanket
  heuristic change.
