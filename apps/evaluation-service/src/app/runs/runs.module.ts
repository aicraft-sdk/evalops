import { Module, forwardRef } from '@nestjs/common';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';
import { TraceCompatibilityService } from './trace-compatibility.service';
import { EvaluationModule } from '../evaluation/evaluation.module';
import { PoliciesModule } from '../policies/policies.module';
import { PythonWorkerModule } from '../python-worker/python-worker.module';
import { CoreClientModule } from '../core-client/core-client.module';

@Module({
  imports: [
    forwardRef(() => EvaluationModule),
    PoliciesModule,
    PythonWorkerModule,
    CoreClientModule,
  ],
  controllers: [RunsController],
  providers: [RunsService, TraceCompatibilityService],
  exports: [RunsService],
})
export class RunsModule {}

