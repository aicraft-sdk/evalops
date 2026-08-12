import { Injectable, Logger } from '@nestjs/common';
import { JudgeCacheRepository } from '@evalops/shared-db';
import { computeJudgeCacheKey, JudgeCacheKeyInput } from './judge-cache-key';

export interface JudgeComputeResult {
  score: number;
  reasoning?: string;
  cost: number;
}

/** Postgres SQLSTATE for a unique-constraint violation. */
const POSTGRES_UNIQUE_VIOLATION = '23505';

/**
 * True when `error` is a Postgres/Drizzle error carrying the given SQLSTATE
 * code (exposed as `.code` by both the `pg` driver and Drizzle's pass-through
 * error objects).
 */
function hasPostgresErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
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
      // Unlike the write path below, there is no "expected benign" failure
      // mode for a cache lookup (no concurrent-race equivalent) - RLS
      // misconfiguration on SELECT silently filters rows rather than
      // throwing, so any thrown error here is a genuine infra/config
      // problem worth surfacing loudly, not routine contention.
      this.logger.error(
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
      if (hasPostgresErrorCode(error, POSTGRES_UNIQUE_VIOLATION)) {
        // Expected, benign: another concurrent request already wrote this
        // exact cache key first. Not worth warn/error-level noise.
        this.logger.debug(
          `Judge cache write skipped for ${evaluatorName}: cache key already written by a concurrent request`,
        );
      } else {
        // Any other failure (DB outage, RLS denial, schema mismatch, etc.)
        // indicates a genuinely broken cache/RLS configuration - log loudly
        // so it's distinguishable from normal cache contention, even though
        // we still fail open and return the live result below.
        this.logger.error(
          `Judge cache write failed for ${evaluatorName} (result still returned):`,
          error,
        );
      }
    }

    return result;
  }
}
