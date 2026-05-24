import { Module } from '@nestjs/common';
import { SimulationsController } from './simulations.controller';
import { SimulationsService } from './simulations.service';
import { TraceWriterService } from './trace-writer.service';
import { SimulationRunnerService } from './simulation-runner.service';
import { CoreClientModule } from '../core-client/core-client.module';
import { EvaluationModule } from '../evaluation/evaluation.module';
import { PoliciesModule } from '../policies/policies.module';
import { AIProviderModule } from '../ai-provider/ai-provider.module';

/**
 * SimulationsModule
 *
 * Handles simulation suite and scenario management, as well as simulation execution.
 *
 * Architecture Decision:
 * Simulations live in evaluation-service because:
 * 1. They produce Run records (evaluation-service owns runs table)
 * 2. They use evaluator infrastructure for judge calls
 * 3. They leverage trace ingestion capabilities
 * 4. They integrate with policy evaluation
 * 5. Minimal cross-service calls needed (can call core-service for agent definitions)
 */
@Module({
  imports: [
    CoreClientModule,
    EvaluationModule,
    PoliciesModule,
    AIProviderModule,
  ],
  controllers: [SimulationsController],
  providers: [SimulationsService, TraceWriterService, SimulationRunnerService],
  exports: [SimulationsService, TraceWriterService, SimulationRunnerService],
})
export class SimulationsModule {}
