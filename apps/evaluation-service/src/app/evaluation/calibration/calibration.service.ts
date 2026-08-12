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
    const examples = await this.goldenSets.listExamples(input.goldenSetId);
    if (examples.length === 0) {
      throw new BadRequestException('Golden set has no examples to calibrate against');
    }
    if (!examples.some((e) => e.isBadExample)) {
      throw new BadRequestException(
        'Golden set must include at least one bad example to measure judge discernment',
      );
    }

    const threshold = input.judgeThreshold ?? DEFAULT_JUDGE_THRESHOLD;
    const pairs: LabelPair[] = [];
    const disagreements: Array<{
      exampleId: string;
      humanLabel: boolean;
      judgeLabel: boolean;
      judgeScore: number;
      judgeReasoning?: string;
    }> = [];

    for (const example of examples) {
      const judgeResult = await this.scoreExample(example, input);
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

    const kappaResult = computeCohensKappa(pairs);

    return this.goldenSets.createCalibrationRun({
      goldenSetId: input.goldenSetId,
      judgeEvaluator: input.judgeEvaluator,
      judgeConfig: input.judgeConfig ?? {},
      judgeThreshold: threshold,
      agreementRate: kappaResult.agreementRate,
      kappa: kappaResult.kappa,
      isCalibrated: (kappaResult.kappa ?? 0) >= KAPPA_CALIBRATED_THRESHOLD,
      isReliable: kappaResult.isReliable,
      sampleCount: kappaResult.sampleCount,
      disagreements,
      organizationId: input.organizationId,
      triggeredBy: input.triggeredBy,
    });
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
      // battle, context_precision, context_recall, context_relevancy,
      // pii_detection, jailbreak_detection are added test-first in the next
      // TDD slice (Task 5.3) — see calibration.service.spec.ts.
      default:
        throw new BadRequestException(`Unsupported judgeEvaluator: ${input.judgeEvaluator}`);
    }
  }
}
