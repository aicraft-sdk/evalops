import { Injectable, BadRequestException } from '@nestjs/common';
import { GoldenSetsRepository, GoldenSetExample } from '@evalops/shared-db';
import { EvaluatorsService } from '../evaluators/evaluators.service';
import { computeCohensKappa, LabelPair } from './cohens-kappa';

export interface RunCalibrationInput {
  goldenSetId: string;
  judgeEvaluator: string; // one of the 12 evaluator method keys, see scoreExample's switch
  judgeConfig?: Record<string, unknown>;
  judgeThreshold?: number;
  organizationId: string;
  triggeredBy: string;
}

const DEFAULT_JUDGE_THRESHOLD = 0.5;
const KAPPA_CALIBRATED_THRESHOLD = 0.8;

@Injectable()
export class CalibrationService {
  constructor(
    private readonly goldenSets: GoldenSetsRepository,
    private readonly evaluators: EvaluatorsService,
  ) {}

  async runCalibration(input: RunCalibrationInput) {
    const threshold = input.judgeThreshold ?? DEFAULT_JUDGE_THRESHOLD;
    if (threshold < 0 || threshold > 1) {
      throw new BadRequestException('judgeThreshold must be between 0 and 1');
    }

    const examples = await this.goldenSets.listExamples(input.goldenSetId);
    if (examples.length === 0) {
      throw new BadRequestException('Golden set has no examples to calibrate against');
    }
    if (!examples.some((e) => e.isBadExample)) {
      throw new BadRequestException(
        'Golden set must include at least one bad example to measure judge discernment',
      );
    }

    const pairs: LabelPair[] = [];
    const disagreements: Array<{
      exampleId: string;
      humanLabel: boolean;
      judgeLabel: boolean;
      judgeScore: number;
      judgeReasoning?: string;
    }> = [];
    const excludedExamples: Array<{ exampleId: string; reason: string }> = [];

    for (const example of examples) {
      let judgeResult: { score: number; reasoning?: string };
      try {
        judgeResult = await this.scoreExample(example, input);
      } catch (error: unknown) {
        // An invalid judgeEvaluator is a caller/config error that applies
        // identically to every example in this run (not a transient
        // per-example judge failure) — fail the whole run fast instead of
        // silently excluding every example one at a time.
        if (error instanceof BadRequestException) {
          throw error;
        }
        // Any other genuine thrown exception from a single example's judge
        // call must not abort the whole calibration run — exclude just this
        // example.
        excludedExamples.push({
          exampleId: example.id,
          reason: `Judge call threw: ${error instanceof Error ? error.message : String(error)}`,
        });
        continue;
      }

      if (this.isLikelySwallowedFailure(judgeResult)) {
        excludedExamples.push({
          exampleId: example.id,
          reason:
            'Judge returned score:0 with no reasoning — likely a swallowed AI-provider failure (evaluators-llm.service.ts catch-all default), excluded from kappa rather than trusted as a genuine judge verdict',
        });
        continue;
      }

      const judgeLabel = judgeResult.score >= threshold;
      pairs.push({ human: example.humanLabel, judge: judgeLabel });
      if (judgeLabel !== example.humanLabel) {
        disagreements.push({
          exampleId: example.id,
          humanLabel: example.humanLabel,
          judgeLabel,
          judgeScore: judgeResult.score,
          judgeReasoning: judgeResult.reasoning,
        });
      }
    }

    if (pairs.length === 0) {
      throw new BadRequestException(
        `All ${examples.length} example(s) failed to score (likely swallowed AI-provider failures) — cannot compute calibration from zero usable data points`,
      );
    }

    // The per-example exclusion loop above can drop the golden set's ONLY
    // bad-labeled (humanLabel:false) example if its judge call looks like a
    // swallowed failure. `pairs.length === 0` only catches "everything
    // excluded" — it does not catch "some survived, but all one class now".
    // Without this check, computeCohensKappa's pe===1 degenerate case
    // fabricates kappa:1 (and, if sampleCount also clears
    // MIN_RELIABLE_SAMPLES, isCalibrated:true) from single-class agreement
    // alone, with zero real discernment evidence against a bad example.
    if (!pairs.some((pair) => pair.human === false)) {
      throw new BadRequestException(
        'Calibration requires at least one bad-labeled example with a valid judge score; all bad-labeled examples were excluded as likely scoring failures',
      );
    }

    const kappaResult = computeCohensKappa(pairs);

    return this.goldenSets.createCalibrationRun({
      goldenSetId: input.goldenSetId,
      judgeEvaluator: input.judgeEvaluator,
      judgeConfig: input.judgeConfig ?? {},
      judgeThreshold: threshold,
      agreementRate: kappaResult.agreementRate,
      kappa: kappaResult.kappa,
      // A run can't be "calibrated" if it isn't even statistically reliable.
      isCalibrated:
        kappaResult.isReliable && (kappaResult.kappa ?? 0) >= KAPPA_CALIBRATED_THRESHOLD,
      isReliable: kappaResult.isReliable,
      sampleCount: kappaResult.sampleCount,
      // Stored as an object (not a bare array) so the excluded-examples count
      // is visible on the persisted run without a new migration/column —
      // `disagreements` is jsonb with no shape constraint at the DB level.
      disagreements: {
        items: disagreements,
        excludedCount: excludedExamples.length,
        excludedExamples,
      },
      organizationId: input.organizationId,
      triggeredBy: input.triggeredBy,
    });
  }

  /**
   * Heuristic detector for a swallowed AI-provider failure, NOT a proof.
   *
   * Every one of evaluators-llm.service.ts's 12 judge methods has an outer
   * catch-all that, on any thrown error (provider timeout, malformed
   * response, etc.), returns exactly `{ score: 0, cost: 0 }` — no
   * `reasoning` field at all. A genuine JSON-parsed judge verdict of 0
   * normally still carries a `reason` string (per the structured-output
   * prompt instruction), so `score === 0 && reasoning === undefined` is the
   * best available signal without modifying evaluators-llm.service.ts's 12
   * catch blocks (out of scope for this fix).
   *
   * Known false positive: `evaluateContextPrecision`/`ContextRecall`/
   * `ContextRelevancy` legitimately early-return `{ score: 0, cost: 0 }`
   * (no `reasoning`) when `contexts` is empty — a real "no context supplied"
   * result, not a failure. Those examples will also be excluded here. This
   * is an accepted limitation of a per-example heuristic that cannot see
   * *why* a zero came back; it trades a rare false exclusion for closing the
   * far larger risk of a swallowed failure silently corrupting kappa.
   */
  private isLikelySwallowedFailure(result: { score: number; reasoning?: string }): boolean {
    return result.score === 0 && result.reasoning === undefined;
  }

  private async scoreExample(
    example: GoldenSetExample,
    input: RunCalibrationInput,
  ): Promise<{ score: number; reasoning?: string }> {
    // Dispatch to the corresponding cache-aware EvaluatorsService method.
    // Kept as an explicit switch (not a dynamic property lookup) so an
    // unsupported judgeEvaluator value fails loudly instead of silently
    // calling `undefined`.
    const config = input.judgeConfig ?? {};
    const outputText =
      typeof example.output === 'string' ? example.output : JSON.stringify(example.output);
    const expectedText =
      typeof example.expected === 'string'
        ? example.expected
        : example.expected != null
          ? JSON.stringify(example.expected)
          : '';
    const contexts = (example.context as string[] | null) ?? [];
    const seed = 1; // calibration runs are inherently single-shot and deterministic per example; a fixed seed keeps repeated calibration runs cache-friendly

    switch (input.judgeEvaluator) {
      case 'llm_as_judge':
        return this.evaluators.evaluateLLMAsJudge(
          outputText,
          expectedText,
          (config.judgePrompt as string) ?? 'Rate this response from 1-10.',
          seed,
          example.input as Record<string, unknown> | string | undefined,
          input.organizationId,
        );
      case 'factuality':
        return this.evaluators.evaluateFactuality(outputText, example.input, config, seed, input.organizationId);
      case 'security':
        return this.evaluators.evaluateSecurity(outputText, config, seed, input.organizationId);
      case 'answer_relevancy':
        return this.evaluators.evaluateAnswerRelevancy(outputText, example.input, config, seed, input.organizationId);
      case 'faithfulness':
        return this.evaluators.evaluateFaithfulness(outputText, contexts, config, seed, input.organizationId);
      case 'answer_correctness':
        return this.evaluators.evaluateAnswerCorrectness(outputText, expectedText, config, seed, input.organizationId);
      case 'battle':
        return this.evaluators.evaluateBattle(outputText, expectedText, config, seed, input.organizationId);
      case 'context_precision':
        return this.evaluators.evaluateContextPrecision(outputText, example.input, contexts, config, seed, input.organizationId);
      case 'context_recall':
        return this.evaluators.evaluateContextRecall(expectedText, contexts, config, seed, input.organizationId);
      case 'context_relevancy':
        return this.evaluators.evaluateContextRelevancy(example.input, contexts, config, seed, input.organizationId);
      case 'pii_detection':
        return this.evaluators.evaluatePIIDetection(outputText, config, seed, input.organizationId);
      case 'jailbreak_detection':
        return this.evaluators.evaluateJailbreakDetection(
          (example.input as string) ?? '',
          outputText,
          config,
          seed,
          input.organizationId,
        );
      default:
        throw new BadRequestException(`Unsupported judgeEvaluator: ${input.judgeEvaluator}`);
    }
  }
}
