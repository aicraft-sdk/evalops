import { Module } from '@nestjs/common';
import { EvaluatorsService } from './evaluators.service';
import { AIProviderModule } from '../../ai-provider/ai-provider.module';

@Module({
  imports: [AIProviderModule],
  providers: [EvaluatorsService],
  exports: [EvaluatorsService],
})
export class EvaluatorsModule {}

