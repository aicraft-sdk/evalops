import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AIProviderService } from './ai-provider.service';

@Module({
  imports: [ConfigModule],
  providers: [AIProviderService],
  exports: [AIProviderService],
})
export class AIProviderModule {}
