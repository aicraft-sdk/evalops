import { Module } from '@nestjs/common';
import { EvaluatorsService } from './evaluators.service';
import { EvaluatorsDeterministicService } from './evaluators-deterministic.service';
import { EvaluatorsLLMService } from './evaluators-llm.service';
import { JudgeCacheService } from './judge-cache.service';
import { AIProviderModule } from '../../ai-provider/ai-provider.module';

@Module({
  imports: [AIProviderModule],
  providers: [
    EvaluatorsService,
    EvaluatorsDeterministicService,
    EvaluatorsLLMService,
    JudgeCacheService,
  ],
  exports: [EvaluatorsService],
})
export class EvaluatorsModule {}
