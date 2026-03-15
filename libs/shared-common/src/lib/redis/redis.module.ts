import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Global Redis module.
 * Provides the 'REDIS_CLIENT' token (ioredis instance) to any module that imports it.
 *
 * Required env vars: REDIS_HOST, REDIS_PORT (optional: REDIS_PASSWORD)
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService): Redis => {
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
