import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Global Redis module.
 * Provides the 'REDIS_CLIENT' token (ioredis instance) to any module that imports it.
 *
 * In dev mode (EVALOPS_DEV_MODE=1): returns an in-memory MemoryRedis facade.
 * In production: connects to a real Redis instance.
 *
 * Required env vars (production): REDIS_HOST, REDIS_PORT (optional: REDIS_PASSWORD)
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService): Redis | unknown => {
        if (process.env['EVALOPS_DEV_MODE'] === '1') {
          // In-memory Redis facade for evalops dev mode — no Docker required.
          // eval('require') prevents webpack from statically bundling better-sqlite3
          // (a native addon) into production service builds. Behavior is identical at runtime.
          const { MemoryRedis } = eval('require')('@evalops/dev-runtime') as typeof import('@evalops/dev-runtime');
          return new MemoryRedis();
        }

        // Production: real ioredis connection
        const host = configService.get<string>('REDIS_HOST', 'localhost');
        const port = configService.get<number>('REDIS_PORT', 6379);
        const password = configService.get<string>('REDIS_PASSWORD');

        return new Redis({
          host,
          port,
          password: password || undefined,
          lazyConnect: true,
          retryStrategy: (times) => Math.min(times * 100, 3000),
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: ['REDIS_CLIENT'],
})
export class RedisModule {}
