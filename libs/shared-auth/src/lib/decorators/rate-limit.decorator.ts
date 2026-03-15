import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitOptions {
  /** Window size in seconds. */
  ttl: number;
  /** Maximum number of requests within the window. */
  limit: number;
}

/**
 * Apply per-user (or per-IP) rate limiting to an endpoint.
 * Enforced by RateLimitGuard (Redis-backed).
 *
 * @example @RateLimit({ ttl: 60, limit: 100 })
 */
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);
