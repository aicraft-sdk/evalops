import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OtlpController } from './otlp.controller';
import { OtlpService } from './otlp.service';
import { OtlpAuthGuard } from './otlp-auth.guard';

/**
 * OTLP Module
 *
 * Handles OTLP-compliant trace ingestion via HTTP/JSON.
 */
@Module({
  imports: [ConfigModule],
  controllers: [OtlpController],
  providers: [OtlpService, OtlpAuthGuard],
  exports: [OtlpService],
})
export class OtlpModule {}
