import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { IdempotencyService } from './idempotency.service';
import { TraceEventAdapterService } from './trace-event-adapter.service';
import { StorageModule } from '../storage/storage.module';
import { RedisModule } from '@evalops/shared-common';
import { RateLimitGuard } from '@evalops/shared-auth';

/**
 * IngestionModule — accepts trace events from SDK-instrumented agents.
 *
 * The idempotency layer uses Redis when 'REDIS_CLIENT' is provided.
 * If not provided, idempotency degrades gracefully (fail-open).
 */
@Module({
  imports: [
    StorageModule,
    ConfigModule,
    RedisModule,
    HttpModule.register({ timeout: 10000 }),
  ],
  controllers: [IngestionController],
  providers: [
    IngestionService,
    IdempotencyService,
    TraceEventAdapterService,
    RateLimitGuard,
  ],
  exports: [IngestionService, TraceEventAdapterService],
})
export class IngestionModule {}
