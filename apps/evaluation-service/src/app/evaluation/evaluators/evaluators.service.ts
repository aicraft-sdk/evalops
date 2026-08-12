import { Injectable } from '@nestjs/common';
import {
  type EvaluationContext,
  type EvaluationResult,
  type ExactEvaluatorConfig,
  type RuleEvaluatorConfig,
} from '@evalops/evaluators';
import { EvaluatorsDeterministicService } from './evaluators-deterministic.service';
import { EvaluatorsLLMService } from './evaluators-llm.service';

export interface EvaluatorResult {
  score: number;
  cost: number;
  reasoning?: string;
}

/** Loose config bag passed by callers for legacy evaluator methods. */
export interface EvaluatorConfig {
  strictness?: 'strict' | 'moderate' | 'lenient' | 'semantic';
  schema?: Record<string, unknown>;
  categories?: {
    email?: boolean;
    phone?: boolean;
    ssn?: boolean;
  };
  [key: string]: unknown;
}

/**
 * Public facade for all evaluators.
 * Deterministic (no AI) → EvaluatorsDeterministicService
 * LLM-based → EvaluatorsLLMService
 */
@Injectable()
export class EvaluatorsService {
  constructor(
    private deterministic: EvaluatorsDeterministicService,
    private llm: EvaluatorsLLMService,
  ) {}

  evaluateExactMatchTyped(
    context: EvaluationContext,
    config?: ExactEvaluatorConfig,
  ): EvaluationResult {
    return this.deterministic.evaluateExactMatchTyped(context, config);
  }

  evaluateRuleTyped(
    context: EvaluationContext,
    config?: RuleEvaluatorConfig,
  ): EvaluationResult {
    return this.deterministic.evaluateRuleTyped(context, config);
  }

  evaluateExactMatch(
    response: string,
    expected: string,
    config?: EvaluatorConfig,
  ): number {
    return this.deterministic.evaluateExactMatch(response, expected, config);
  }

  evaluateSchemaValidity(
    response: unknown,
    schema: Record<string, unknown>,
  ): number {
    return this.deterministic.evaluateSchemaValidity(response, schema);
  }

  evaluateJsonValidity(response: string, config?: EvaluatorConfig): number {
    return this.deterministic.evaluateJsonValidity(response, config);
  }

  async evaluateLLMAsJudge(
    response: string,
    expected: string,
    judgePrompt: string,
    seed: number,
    // Default value (not `?`) so a required `organizationId` can follow it —
    // see the matching comment in EvaluatorsLLMService.evaluateLLMAsJudge.
    datasetSample: Record<string, unknown> | string | undefined = undefined,
    organizationId: string,
  ): Promise<EvaluatorResult> {
    return this.llm.evaluateLLMAsJudge(response, expected, judgePrompt, seed, datasetSample, organizationId);
  }

  async evaluateBattle(
    response: string,
    expected: string,
    config: EvaluatorConfig,
    seed: number,
    organizationId: string,
  ): Promise<EvaluatorResult> {
    return this.llm.evaluateBattle(response, expected, config, seed, organizationId);
  }

  async evaluateFactuality(
    response: string,
    input: unknown,
    config: EvaluatorConfig,
    seed: number,
    organizationId: string,
  ): Promise<EvaluatorResult> {
    return this.llm.evaluateFactuality(response, input, config, seed, organizationId);
  }

  async evaluateSecurity(
    response: string,
    config: EvaluatorConfig,
    seed: number,
    organizationId: string,
  ): Promise<EvaluatorResult> {
    return this.llm.evaluateSecurity(response, config, seed, organizationId);
  }

  async evaluateAnswerRelevancy(
    response: string,
    input: unknown,
    config: EvaluatorConfig,
    seed: number,
    organizationId: string,
  ): Promise<EvaluatorResult> {
    return this.llm.evaluateAnswerRelevancy(response, input, config, seed, organizationId);
  }

  async evaluateContextPrecision(
    response: string,
    query: unknown,
    contexts: string[],
    config: EvaluatorConfig,
    seed: number,
    organizationId: string,
  ): Promise<EvaluatorResult> {
    return this.llm.evaluateContextPrecision(response, query, contexts, config, seed, organizationId);
  }

  async evaluateContextRecall(
    expectedAnswer: string,
    contexts: string[],
    config: EvaluatorConfig,
    seed: number,
    organizationId: string,
  ): Promise<EvaluatorResult> {
    return this.llm.evaluateContextRecall(expectedAnswer, contexts, config, seed, organizationId);
  }

  async evaluateContextRelevancy(
    query: unknown,
    contexts: string[],
    config: EvaluatorConfig,
    seed: number,
    organizationId: string,
  ): Promise<EvaluatorResult> {
    return this.llm.evaluateContextRelevancy(query, contexts, config, seed, organizationId);
  }

  async evaluateFaithfulness(
    response: string,
    contexts: string[],
    config: EvaluatorConfig,
    seed: number,
    organizationId: string,
  ): Promise<EvaluatorResult> {
    return this.llm.evaluateFaithfulness(response, contexts, config, seed, organizationId);
  }

  async evaluateAnswerCorrectness(
    response: string,
    expectedAnswer: string,
    config: EvaluatorConfig,
    seed: number,
    organizationId: string,
  ): Promise<EvaluatorResult> {
    return this.llm.evaluateAnswerCorrectness(response, expectedAnswer, config, seed, organizationId);
  }

  async evaluatePIIDetection(
    response: string,
    config: EvaluatorConfig,
    seed: number,
    organizationId: string,
  ): Promise<EvaluatorResult> {
    return this.llm.evaluatePIIDetection(response, config, seed, organizationId);
  }

  async evaluateJailbreakDetection(
    input: string,
    response: string,
    config: EvaluatorConfig,
    seed: number,
    organizationId: string,
  ): Promise<EvaluatorResult> {
    return this.llm.evaluateJailbreakDetection(input, response, config, seed, organizationId);
  }
}
