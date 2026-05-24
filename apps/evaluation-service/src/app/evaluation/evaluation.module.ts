import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EvaluationService } from './evaluation.service';
import { EvaluationRunnerService } from './evaluation-runner.service';
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
  providers: [EvaluationService, EvaluationRunnerService],
  exports: [EvaluationService, EvaluatorsModule],
})
export class EvaluationModule {}
