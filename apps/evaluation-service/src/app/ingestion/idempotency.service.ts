import { Injectable, Logger, Inject, Optional } from '@nestjs/common';

/**
 * Redis-backed idempotency service for ingestion endpoints.
 *
 * A key is stored in Redis with a TTL of 24 hours.
 * If an event batch with the same idempotency key has been seen before,
 * the caller should short-circuit and return a cached success response.
 *
 * The Redis client is expected to be injected by the consuming module
 * under the token 'REDIS_CLIENT'.
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly ttlSeconds = 86_400; // 24 h

  constructor(
    @Optional()
    @Inject('REDIS_CLIENT')
    private readonly redis: {
      get(key: string): Promise<string | null>;
      set(key: string, value: string, mode: string, ttl: number): Promise<unknown>;
    } | null,
  ) {}

  async isDuplicate(key: string): Promise<boolean> {
    if (!this.redis) return false;
    try {
      const existing = await this.redis.get(`idempotency:${key}`);
      return existing !== null;
    } catch (err) {
      this.logger.warn(`Idempotency check failed for key=${key}: ${err}`);
      return false;
    }
  }

  async markSeen(key: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.set(`idempotency:${key}`, '1', 'EX', this.ttlSeconds);
    } catch (err) {
      this.logger.warn(`Idempotency mark failed for key=${key}: ${err}`);
    }
  }
}
