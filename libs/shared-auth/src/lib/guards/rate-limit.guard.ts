import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RATE_LIMIT_KEY, RateLimitOptions } from '../decorators/rate-limit.decorator';

/**
 * Redis-backed per-user/IP rate limiting guard.
 *
 * Requires a Redis client to be injected via the token 'REDIS_CLIENT'.
 * Uses sliding-window counter (INCR + EXPIRE).
 *
 * Usage:
 *   @UseGuards(JwtAuthGuard, RateLimitGuard)
 *   @RateLimit({ ttl: 60, limit: 100 })
 *   myEndpoint() {}
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Optional() @Inject('REDIS_CLIENT')
    private readonly redis: { incr(key: string): Promise<number>; expire(key: string, seconds: number): Promise<number> } | null,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!options) return true;

    // Degrade gracefully when Redis is not available
    if (!this.redis) return true;

    const request = context.switchToHttp().getRequest<{
      user?: { id?: string };
      ip?: string;
      connection?: { remoteAddress?: string };
      path?: string;
    }>();

    const identifier =
      request.user?.id ??
      request.ip ??
      request.connection?.remoteAddress ??
      'anonymous';
    const path = request.path ?? 'unknown';
    const key = `rate-limit:${identifier}:${path}`;

    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, options.ttl);
    }

    if (count > options.limit) {
      throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
    }

    return true;
  }
}
