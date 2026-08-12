import { Injectable, Logger } from '@nestjs/common';
import { JudgeCacheRepository } from '@evalops/shared-db';
import { computeJudgeCacheKey, JudgeCacheKeyInput } from './judge-cache-key';

export interface JudgeComputeResult {
  score: number;
  reasoning?: string;
  cost: number;
}

@Injectable()
export class JudgeCacheService {
  private readonly logger = new Logger(JudgeCacheService.name);

  constructor(private readonly repository: JudgeCacheRepository) {}

  async getOrCompute(
    evaluatorName: string,
    keyInput: Omit<JudgeCacheKeyInput, 'evaluatorName' | 'organizationId'>,
    organizationId: string,
    computeFn: () => Promise<JudgeComputeResult>,
  ): Promise<JudgeComputeResult> {
    const cacheKey = computeJudgeCacheKey({
      ...keyInput,
      evaluatorName,
      organizationId,
    });

    try {
      const cached = await this.repository.findByCacheKey(cacheKey);
      if (cached) {
        return {
          score: cached.score,
          reasoning: cached.reasoning ?? undefined,
          cost: 0,
        };
      }
    } catch (error: unknown) {
      this.logger.warn(
        `Judge cache lookup failed for ${evaluatorName}, failing open to a live call:`,
        error,
      );
    }

    const result = await computeFn();

    try {
      await this.repository.create({
        cacheKey,
        evaluatorName,
        sampleId: keyInput.sampleId,
        score: result.score,
        reasoning: result.reasoning,
        cost: String(result.cost),
        model: keyInput.model,
        temperature: keyInput.temperature,
        seed: keyInput.seed,
        organizationId,
      });
    } catch (error: unknown) {
      this.logger.warn(
        `Judge cache write failed for ${evaluatorName} (result still returned):`,
        error,
      );
    }

    return result;
  }
}
