import { Injectable, Logger } from '@nestjs/common';
import { RunsRepository, SampleResultsRepository } from '@evalops/shared-db';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { CoreClientService } from '../core-client/core-client.service';
import { PoliciesService } from '../policies/policies.service';
import { ReviewsService } from '../reviews/reviews.service';
import { EvaluationRunnerService } from './evaluation-runner.service';

export interface EvaluationResult {
  exactMatch?: number;
  schemaValidity?: number;
  llmAsJudgeWinRate?: number;
  battle?: number;
  factuality?: number;
  security?: number;
  answerRelevancy?: number;
  jsonValidity?: number;
  contextPrecision?: number;
  contextRecall?: number;
  contextRelevancy?: number;
  faithfulness?: number;
  answerCorrectness?: number;
  piiDetection?: number;
  jailbreakDetection?: number;
  customEvaluator?: number;
  customEvaluatorMetadata?: Record<string, unknown>;
  latencyP50?: number;
  latencyP95?: number;
  cost?: number;
  errorRate?: number;
  error?: string;
  actualOutput?: unknown;
  renderedPrompt?: string;
}

/**
 * Thin orchestrator: owns run lifecycle, persistence, policy evaluation, and alert dispatch.
 * Per-sample evaluation logic lives in EvaluationRunnerService.
 */
@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  private readonly integrationServiceUrl: string;

  constructor(
    private runsRepository: RunsRepository,
    private sampleResultsRepository: SampleResultsRepository,
    private httpService: HttpService,
    private configService: ConfigService,
    private coreClient: CoreClientService,
    private policiesService: PoliciesService,
    private runner: EvaluationRunnerService,
    private reviewsService?: ReviewsService,
  ) {
    this.integrationServiceUrl =
      this.configService.get('INTEGRATION_SERVICE_URL') ||
      'http://localhost:3004';
  }

  async executeRun(runId: string, authToken?: string): Promise<void> {
    const startTime = Date.now();

    try {
      await this.runsRepository.update(runId, { status: 'running' });

      const run = await this.runsRepository.findById(runId);
      if (!run) {
        throw new Error(`Run ${runId} not found`);
      }

      const evalSpec = await this.coreClient.getEvalSpec(
        run.evalSpecId,
        authToken
      );
      if (!evalSpec) {
        throw new Error(`Eval spec ${run.evalSpecId} not found`);
      }

      const dataset = await this.coreClient.getDataset(
        evalSpec.datasetId,
        authToken
      );
      if (!dataset) {
        throw new Error(`Dataset ${evalSpec.datasetId} not found`);
      }

      const samples = await this.coreClient.getDatasetSamples(
        dataset.id,
        authToken
      );

      this.logger.log(
        `Starting evaluation for run ${runId}: ${samples.length} samples, ${evalSpec.repetitions} repetitions`
      );

      const metrics: { [key: string]: number[] } = {};
      let totalCost = 0;
      const totalSamples = samples.length * evalSpec.repetitions;
      let completedSamples = 0;

      for (let rep = 0; rep < evalSpec.repetitions; rep++) {
        const seedsArray = evalSpec.seeds as number[];
        const seed =
          seedsArray && seedsArray.length > rep && seedsArray[rep] != null
            ? seedsArray[rep]
            : Math.random() * 1000000;

        for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
          const sample = samples[sampleIndex];

          try {
            const result = await this.runner.evaluateSample(
              sample as Record<string, unknown>,
              evalSpec as Record<string, unknown>,
              seed,
              runId,
              authToken,
            );

            await this.sampleResultsRepository.create({
              runId,
              sampleIndex,
              repetition: rep,
              input: sample.input || {},
              expectedOutput: sample.expected || null,
              actualOutput: result.actualOutput || null,
              evaluationResults: {
                exactMatch: result.exactMatch,
                schemaValidity: result.schemaValidity,
                llmAsJudgeWinRate: result.llmAsJudgeWinRate,
                battle: result.battle,
                factuality: result.factuality,
                security: result.security,
                answerRelevancy: result.answerRelevancy,
                jsonValidity: result.jsonValidity,
                contextPrecision: result.contextPrecision,
                contextRecall: result.contextRecall,
                contextRelevancy: result.contextRelevancy,
                faithfulness: result.faithfulness,
                answerCorrectness: result.answerCorrectness,
                piiDetection: result.piiDetection,
                jailbreakDetection: result.jailbreakDetection,
                latencyP50: result.latencyP50,
                latencyP95: result.latencyP95,
                cost: result.cost,
                errorRate: result.errorRate,
                renderedPrompt: result.renderedPrompt,
              },
              organizationId: run.organizationId,
            });

            if (result.cost) totalCost += result.cost;

            Object.entries(result).forEach(([key, value]) => {
              if (
                typeof value === 'number' &&
                key !== 'cost' &&
                key !== 'errorRate' &&
                key !== 'latencyP50' &&
                key !== 'latencyP95'
              ) {
                if (!metrics[key]) metrics[key] = [];
                metrics[key].push(value);
              }
            });

            completedSamples++;

            if (completedSamples % 10 === 0) {
              await this.runsRepository.update(runId, {
                description: `Progress: ${completedSamples}/${totalSamples} samples (${Math.round(
                  (completedSamples / totalSamples) * 100
                )}%)`,
              });
            }
          } catch (error: unknown) {
            this.logger.error(
              `Error evaluating sample ${sampleIndex} (rep ${rep}):`,
              error
            );
          }
        }
      }

      const aggregateMetrics: Record<string, { mean: number; min: number; max: number; std: number }> = {};
      for (const [key, values] of Object.entries(metrics)) {
        if (values.length > 0) {
          aggregateMetrics[key] = {
            mean: values.reduce((a, b) => a + b, 0) / values.length,
            min: Math.min(...values),
            max: Math.max(...values),
            std: this.calculateStdDev(values),
          };
        }
      }

      const duration = Date.now() - startTime;
      await this.runsRepository.update(runId, {
        status: 'completed',
        completedAt: new Date(),
        metrics: aggregateMetrics,
        cost: totalCost,
        duration,
      });

      try {
        const policyResult = await this.policiesService.evaluateRun(runId);
        await this.runsRepository.update(runId, {
          decision: policyResult.decision,
          policyScore: policyResult.score,
        });

        if (
          policyResult.decision === 'fail' &&
          this.reviewsService &&
          policyResult.violations.length === 0
        ) {
          try {
            await this.reviewsService.createQueueItem(
              {
                runId,
                sourceType: 'evaluator_failure',
                priority: 'high',
              },
              run.organizationId,
              run.triggeredBy
            );
          } catch (error: unknown) {
            this.logger.warn(
              `Failed to create review queue item for failed run ${runId}:`,
              error
            );
          }
        }
      } catch (error: unknown) {
        this.logger.warn(`Policy evaluation failed for run ${runId}:`, error);
      }

      this.triggerAlertCheck(runId).catch((error: unknown) => {
        this.logger.warn(
          `Failed to trigger alert check for run ${runId}:`,
          error
        );
      });

      this.logger.log(`Completed evaluation for run ${runId} in ${duration}ms`);
    } catch (error: unknown) {
      this.logger.error(`Error executing run ${runId}:`, error);
      const errMsg = error instanceof Error ? error.message : String(error);
      await this.runsRepository.update(runId, {
        status: 'failed',
        errorMessage: errMsg,
      });
      throw error;
    }
  }

  private async triggerAlertCheck(runId: string): Promise<void> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.integrationServiceUrl}/api/alerts/check/${runId}`,
          {},
          {
            headers: {
              'Content-Type': 'application/json',
            },
            timeout: 5000,
          }
        )
      );
    } catch (error: unknown) {
      this.logger.warn(
        `Alert check request failed for run ${runId}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private calculateStdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      values.length;
    return Math.sqrt(variance);
  }
}
