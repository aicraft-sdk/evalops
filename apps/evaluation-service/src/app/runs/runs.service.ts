import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { RunsRepository } from '@evalops/shared-db';
import { EvaluationService } from '../evaluation/evaluation.service';
import { Run, InsertRun } from '@evalops/shared-db';
import { CoreClientService } from '../core-client/core-client.service';
import { TraceCompatibilityService } from './trace-compatibility.service';
import { TraceEvent } from '@evalops/sdk';
import { getErrorMessage } from '@evalops/shared-common';

@Injectable()
export class RunsService {
  private readonly logger = new Logger(RunsService.name);

  constructor(
    private runsRepository: RunsRepository,
    private evaluationService: EvaluationService,
    private coreClient: CoreClientService,
    private traceCompatibility: TraceCompatibilityService,
  ) {}

  async createRun(runData: InsertRun, authToken?: string): Promise<Run> {
    // Validate required fields
    if (!runData.name || !runData.evalSpecId) {
      throw new BadRequestException(
        'Name and evalSpecId are required to create a run',
      );
    }

    // Verify eval spec exists
    try {
      const evalSpec = await this.coreClient.getEvalSpec(
        runData.evalSpecId,
        authToken,
      );
      if (!evalSpec) {
        throw new NotFoundException(
          `Eval spec ${runData.evalSpecId} not found`,
        );
      }
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.warn(
        `Could not verify eval spec ${runData.evalSpecId}:`,
        getErrorMessage(error),
      );
    }

    // Create run with default values
    const run = await this.runsRepository.create({
      ...runData,
      status: runData.status || 'pending',
      commitSha: runData.commitSha || `manual-${Date.now()}`,
    });

    // Start evaluation asynchronously
    this.evaluationService.executeRun(run.id, authToken).catch((error) => {
      this.logger.error(`Failed to execute run ${run.id}:`, error);
      // Update run status to failed
      this.runsRepository
        .update(run.id, {
          status: 'failed',
          errorMessage: error.message,
        })
        .catch((updateError) => {
          this.logger.error(
            `Failed to update run ${run.id} status:`,
            updateError,
          );
        });
    });

    return run;
  }

  async getRun(id: string): Promise<Run> {
    const run = await this.runsRepository.findById(id);
    if (!run) {
      throw new NotFoundException(`Run ${id} not found`);
    }
    return run;
  }

  async getRuns(organizationId: string, limit = 50): Promise<Run[]> {
    return this.runsRepository.findAllByOrg(organizationId, limit);
  }

  async cancelRun(id: string): Promise<Run> {
    const run = await this.getRun(id);
    if (run.status === 'completed' || run.status === 'failed') {
      throw new BadRequestException(
        `Cannot cancel run in ${run.status} status`,
      );
    }
    return this.runsRepository.update(id, {
      status: 'cancelled',
      completedAt: new Date(),
    });
  }

  /**
   * Get trace events for a run with backward compatibility
   * Reads from spans if migrated, otherwise from trace_events
   */
  async getTraceEventsForRun(runId: string): Promise<TraceEvent[]> {
    return this.traceCompatibility.getTraceEventsForRun(runId);
  }
}

