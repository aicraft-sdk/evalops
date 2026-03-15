import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EvaluationService } from './evaluation.service';
import { StorageModule } from '../storage/storage.module';
import { HttpModule } from '@nestjs/axios';
import { PythonWorkerModule } from '../python-worker/python-worker.module';
import { CoreClientModule } from '../core-client/core-client.module';
import { PoliciesModule } from '../policies/policies.module';
import { AIProviderModule } from '../ai-provider/ai-provider.module';
import { PromptFlowModule } from '../prompt-flow/prompt-flow.module';
import { EvaluatorsModule } from './evaluators/evaluators.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { SandboxExecutionModule } from '../sandbox-execution/sandbox-execution.module';

@Module({
  imports: [
    StorageModule,
    HttpModule,
    ConfigModule,
    PythonWorkerModule,
    CoreClientModule,
    PoliciesModule,
    AIProviderModule,
    PromptFlowModule,
    EvaluatorsModule,
    SandboxExecutionModule,
    ReviewsModule,
  ],
  providers: [EvaluationService],
  exports: [EvaluationService],
})
export class EvaluationModule {}
