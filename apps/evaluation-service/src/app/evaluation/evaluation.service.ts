import { Injectable, Logger } from '@nestjs/common';
import { DatabaseStorageService } from '../storage/database-storage.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PythonWorkerService } from '../python-worker/python-worker.service';
import { CoreClientService } from '../core-client/core-client.service';
import { PoliciesService } from '../policies/policies.service';
import { AIProviderService } from '../ai-provider/ai-provider.service';
import { PromptFlowService } from '../prompt-flow/prompt-flow.service';
import { EvaluatorsService, EvaluatorConfig } from './evaluators/evaluators.service';
import { ReviewsService } from '../reviews/reviews.service';
import { SandboxExecutionService } from '../sandbox-execution/sandbox-execution.service';

/**
 * Typed shape for a single evaluator entry within an eval spec.
 * Fields beyond those listed are allowed (open-ended index signature).
 */
interface EvaluatorSpec {
  type: string;
  config?: EvaluatorConfig;
  schema?: Record<string, unknown>;
  invariants?: string[];
  expectedOutput?: Record<string, unknown>;
  criteria?: string;
  judgePromptId?: string;
  judgePrompt?: string;
  evaluatorId?: string;
  [key: string]: unknown;
}

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

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  private readonly integrationServiceUrl: string;

  constructor(
    private storageService: DatabaseStorageService,
    private httpService: HttpService,
    private configService: ConfigService,
    private pythonWorkerService: PythonWorkerService,
    private coreClient: CoreClientService,
    private policiesService: PoliciesService,
    private aiProvider: AIProviderService,
    private promptFlow: PromptFlowService,
    private evaluators: EvaluatorsService,
    private sandboxExecutionService: SandboxExecutionService,
    private reviewsService?: ReviewsService
  ) {
    this.integrationServiceUrl =
      this.configService.get('INTEGRATION_SERVICE_URL') ||
      'http://localhost:3004';
  }

  async executeRun(runId: string, authToken?: string): Promise<void> {
    const startTime = Date.now();

    try {
      await this.storageService.updateRun(runId, { status: 'running' });

      const run = await this.storageService.getRun(runId);
      if (!run) {
        throw new Error(`Run ${runId} not found`);
      }

      // Get eval spec from core service
      const evalSpec = await this.coreClient.getEvalSpec(
        run.evalSpecId,
        authToken
      );
      if (!evalSpec) {
        throw new Error(`Eval spec ${run.evalSpecId} not found`);
      }

      // Get dataset from core service
      const dataset = await this.coreClient.getDataset(
        evalSpec.datasetId,
        authToken
      );
      if (!dataset) {
        throw new Error(`Dataset ${evalSpec.datasetId} not found`);
      }

      // Load dataset samples
      const samples = await this.coreClient.getDatasetSamples(
        dataset.id,
        authToken
      );

      this.logger.log(
        `Starting evaluation for run ${runId}: ${samples.length} samples, ${evalSpec.repetitions} repetitions`
      );

      // Initialize metrics
      const metrics: { [key: string]: number[] } = {};
      let totalCost = 0;
      const totalSamples = samples.length * evalSpec.repetitions;
      let completedSamples = 0;

      // Execute evaluations for each repetition
      for (let rep = 0; rep < evalSpec.repetitions; rep++) {
        const seedsArray = evalSpec.seeds as number[];
        const seed =
          seedsArray && seedsArray.length > rep && seedsArray[rep] != null
            ? seedsArray[rep]
            : Math.random() * 1000000;

        for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex++) {
          const sample = samples[sampleIndex];

          try {
            const result = await this.evaluateSample(sample, evalSpec, seed, runId, authToken);

            // Store sample result
            await this.storageService.createSampleResult({
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

            // Accumulate metrics
            if (result.cost) totalCost += result.cost;

            // Accumulate all metric types
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

            // Update progress periodically
            if (completedSamples % 10 === 0) {
              await this.storageService.updateRun(runId, {
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
            // Continue with next sample
          }
        }
      }

      // Calculate aggregate metrics
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

      // Update run with final metrics
      const duration = Date.now() - startTime;
      await this.storageService.updateRun(runId, {
        status: 'completed',
        completedAt: new Date(),
        metrics: aggregateMetrics,
        cost: totalCost,
        duration,
      });

      // Evaluate policies
      try {
        const policyResult = await this.policiesService.evaluateRun(runId);
        const updatedRun = await this.storageService.updateRun(runId, {
          decision: policyResult.decision,
          policyScore: policyResult.score,
        });

        // Create review queue item for failed runs (if no policy violations created queue items)
        if (
          policyResult.decision === 'fail' &&
          this.reviewsService &&
          policyResult.violations.length === 0 // Only if no policy violations (they auto-create queue items)
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
          } catch (error) {
            // Log but don't fail run completion if queue creation fails
            this.logger.warn(
              `Failed to create review queue item for failed run ${runId}:`,
              error
            );
          }
        }
      } catch (error: unknown) {
        this.logger.warn(`Policy evaluation failed for run ${runId}:`, error);
      }

      // Trigger alert checking (fire and forget)
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
      await this.storageService.updateRun(runId, {
        status: 'failed',
        errorMessage: errMsg,
      });
      throw error;
    }
  }

  /**
   * Trigger alert checking in integration service
   */
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
            timeout: 5000, // 5 second timeout
          }
        )
      );
    } catch (error: unknown) {
      // Log but don't throw - alert checking failure shouldn't break run completion
      this.logger.warn(
        `Alert check request failed for run ${runId}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async evaluateSample(
    sample: Record<string, unknown>,
    evalSpec: Record<string, unknown>,
    seed: number,
    runId?: string,
    authToken?: string
  ): Promise<EvaluationResult> {
    const result: EvaluationResult = {};
    let response: unknown;
    let cost = 0;
    const startTime = Date.now();

    try {
      // Generate response using prompt or flow
      if (evalSpec.promptId) {
        const prompt = await this.coreClient.getPrompt(
          evalSpec.promptId as string,
          authToken
        );
        if (prompt) {
          // Create template context
          let datasetSample = sample.input;
          if (typeof sample.input === 'string') {
            datasetSample = {
              question: sample.input,
              text: sample.input,
              prompt: sample.input,
              input: sample.input,
            };
          }

          const templateContext: Record<string, unknown> = {
            item: datasetSample,
            custom: {
              seed,
            },
          };

          if (sample.expected) {
            templateContext.expected =
              typeof sample.expected === 'string'
                ? {
                    answer: sample.expected,
                    text: sample.expected,
                    output: sample.expected,
                  }
                : sample.expected;
          }

          // Render prompt template
          const renderedPrompt = await this.coreClient.renderTemplate(
            prompt.content,
            templateContext,
            authToken
          );

          result.renderedPrompt = renderedPrompt;

          // Generate response using AI provider
          const generationResponse = await this.aiProvider.generateResponse(
            renderedPrompt,
            typeof sample.input === 'string'
              ? sample.input
              : JSON.stringify(sample.input),
            (evalSpec.modelConfig as Record<string, unknown> | undefined) ?? {},
            seed
          );

          response = generationResponse.response;
          cost += generationResponse.cost;
        }
      } else if (evalSpec.flowId) {
        const flow = await this.coreClient.getFlow(evalSpec.flowId as string, authToken);
        if (flow) {
          const flowResponse = await this.promptFlow.executeFlow(
            flow.flowId,
            flow.workspaceId,
            sample.input,
            seed
          );
          response = flowResponse.response;
          cost += flowResponse.cost;
        }
      }

      const latency = Date.now() - startTime;
      result.latencyP50 = latency;
      result.latencyP95 = latency;
      result.actualOutput = response;

      // Detect and execute LLM-generated code blocks
      const codeExecutionResults = await this.detectAndExecuteCode(response);
      if (codeExecutionResults && codeExecutionResults.length > 0) {
        // Store code execution results in evaluation metadata
        if (!result.customEvaluatorMetadata) {
          result.customEvaluatorMetadata = {};
        }
        result.customEvaluatorMetadata.codeExecutionResults = codeExecutionResults;
        this.logger.debug(
          `Detected and executed ${codeExecutionResults.length} code block(s) in LLM response`
        );
      }

      // Run evaluators
      const evaluators = (evalSpec['evaluators'] as EvaluatorSpec[] | undefined) || [];

      for (const evaluator of evaluators) {
        switch (evaluator.type) {
          case 'exact_match': {
            let expectedOutput = sample.expected;
            if (typeof expectedOutput === 'object' && expectedOutput !== null) {
              const expObj = expectedOutput as Record<string, unknown>;
              expectedOutput =
                (expObj['answer'] as string | undefined) ||
                (expObj['output'] as string | undefined) ||
                (expObj['text'] as string | undefined) ||
                JSON.stringify(expectedOutput);
            }
            result.exactMatch = this.evaluators.evaluateExactMatch(
              typeof response === 'string' ? response : JSON.stringify(response),
              typeof expectedOutput === 'string' ? expectedOutput : String(expectedOutput ?? ''),
              evaluator.config
            );
            break;
          }

          case 'schema_validity':
            result.schemaValidity = this.evaluators.evaluateSchemaValidity(
              response,
              evaluator.schema
            );
            break;

          case 'json_validity':
            result.jsonValidity = this.evaluators.evaluateJsonValidity(
              typeof response === 'string'
                ? response
                : JSON.stringify(response),
              evaluator.config
            );
            break;

          case 'llm_as_judge':
          case 'llm_judge':
            if (
              !response ||
              (typeof response === 'string' && response.trim() === '')
            ) {
              throw new Error(
                'LLM-as-judge evaluation failed: No response to evaluate'
              );
            }

            let judgePrompt = 'Rate this response from 1-10.';
            if (evaluator.judgePromptId) {
              const judgePromptTemplate = await this.coreClient.getPrompt(
                evaluator.judgePromptId,
                undefined
              );
              if (judgePromptTemplate) {
                judgePrompt = judgePromptTemplate.content;
              }
            } else if (evaluator.judgePrompt) {
              judgePrompt = evaluator.judgePrompt;
            }

            const judgeResult = await this.evaluators.evaluateLLMAsJudge(
              typeof response === 'string'
                ? response
                : JSON.stringify(response),
              typeof sample.expected === 'string' ? sample.expected : (sample.expected != null ? JSON.stringify(sample.expected) : ''),
              judgePrompt,
              seed,
              sample
            );
            result.llmAsJudgeWinRate = judgeResult.score;
            cost += judgeResult.cost;
            break;

          case 'battle': {
            const battleResult = await this.evaluators.evaluateBattle(
              typeof response === 'string'
                ? response
                : JSON.stringify(response),
              typeof sample.expected === 'string' ? sample.expected : (sample.expected != null ? JSON.stringify(sample.expected) : ''),
              evaluator.config ?? {},
              seed
            );
            result.battle = battleResult.score;
            cost += battleResult.cost;
            break;
          }

          case 'factuality': {
            const factualityResult = await this.evaluators.evaluateFactuality(
              typeof response === 'string'
                ? response
                : JSON.stringify(response),
              sample.input,
              evaluator.config ?? {},
              seed
            );
            result.factuality = factualityResult.score;
            cost += factualityResult.cost;
            break;
          }

          case 'security': {
            const securityResult = await this.evaluators.evaluateSecurity(
              typeof response === 'string'
                ? response
                : JSON.stringify(response),
              evaluator.config ?? {},
              seed
            );
            result.security = securityResult.score;
            cost += securityResult.cost;
            break;
          }

          case 'answer_relevancy': {
            const answerRelevancyResult =
              await this.evaluators.evaluateAnswerRelevancy(
                typeof response === 'string'
                  ? response
                  : JSON.stringify(response),
                sample.input,
                evaluator.config ?? {},
                seed
              );
            result.answerRelevancy = answerRelevancyResult.score;
            cost += answerRelevancyResult.cost;
            break;
          }

          case 'context_precision': {
            const precisionResult =
              await this.evaluators.evaluateContextPrecision(
                typeof response === 'string'
                  ? response
                  : JSON.stringify(response),
                sample.input,
                (sample.context as string[] | undefined) ?? [],
                evaluator.config ?? {},
                seed
              );
            result.contextPrecision = precisionResult.score;
            cost += precisionResult.cost;
            break;
          }

          case 'context_recall': {
            const recallResult = await this.evaluators.evaluateContextRecall(
              typeof sample.expected === 'string' ? sample.expected : (sample.expected != null ? JSON.stringify(sample.expected) : ''),
              (sample.context as string[] | undefined) ?? [],
              evaluator.config ?? {},
              seed
            );
            result.contextRecall = recallResult.score;
            cost += recallResult.cost;
            break;
          }

          case 'context_relevancy': {
            const contextRelevancyResult =
              await this.evaluators.evaluateContextRelevancy(
                sample.input,
                (sample.context as string[] | undefined) ?? [],
                evaluator.config ?? {},
                seed
              );
            result.contextRelevancy = contextRelevancyResult.score;
            cost += contextRelevancyResult.cost;
            break;
          }

          case 'faithfulness': {
            const faithfulnessResult =
              await this.evaluators.evaluateFaithfulness(
                typeof response === 'string'
                  ? response
                  : JSON.stringify(response),
                (sample.context as string[] | undefined) ?? [],
                evaluator.config ?? {},
                seed
              );
            result.faithfulness = faithfulnessResult.score;
            cost += faithfulnessResult.cost;
            break;
          }

          case 'answer_correctness': {
            const correctnessResult =
              await this.evaluators.evaluateAnswerCorrectness(
                typeof response === 'string'
                  ? response
                  : JSON.stringify(response),
                typeof sample.expected === 'string' ? sample.expected : (sample.expected != null ? JSON.stringify(sample.expected) : ''),
                evaluator.config ?? {},
                seed
              );
            result.answerCorrectness = correctnessResult.score;
            cost += correctnessResult.cost;
            break;
          }

          case 'pii_detection': {
            const piiResult = await this.evaluators.evaluatePIIDetection(
              typeof response === 'string'
                ? response
                : JSON.stringify(response),
              evaluator.config ?? {},
              seed
            );
            result.piiDetection = piiResult.score;
            cost += piiResult.cost;
            break;
          }

          case 'jailbreak_detection': {
            const jailbreakResult =
              await this.evaluators.evaluateJailbreakDetection(
                typeof sample.input === 'string'
                  ? sample.input
                  : JSON.stringify(sample.input),
                typeof response === 'string'
                  ? response
                  : JSON.stringify(response),
                evaluator.config ?? {},
                seed
              );
            result.jailbreakDetection = jailbreakResult.score;
            cost += jailbreakResult.cost;
            break;
          }

          case 'custom': {
            // Get evaluator ID from config
            const evaluatorId = evaluator.evaluatorId as string | undefined;
            if (!evaluatorId) {
              this.logger.error(
                'Custom evaluator requires evaluatorId in config',
              );
              throw new Error('Custom evaluator requires evaluatorId');
            }

            // Execute custom evaluator via sandbox execution service
            const customResult =
              await this.sandboxExecutionService.executeCustomEvaluator(
                evaluatorId,
                {
                  input: sample.input,
                  expected: sample.expected,
                  actual: response,
                  context: sample.context,
                },
                runId,
              );

            // Map result to evaluation result format
            result.customEvaluator = customResult.score;
            result.customEvaluatorMetadata = customResult.metadata;
            break;
          }
        }
      }

      result.cost = cost;
      result.errorRate = 0;
    } catch (error: unknown) {
      this.logger.error('Error evaluating sample:', error);
      result.errorRate = 1;
      result.cost = cost;
      result.error = (error instanceof Error ? error.message : String(error)) || 'Unknown error';
    }

    return result;
  }

  /**
   * Detect and execute code blocks in LLM response
   */
  private async detectAndExecuteCode(
    response: unknown,
  ): Promise<Array<Record<string, unknown>> | null> {
    try {
      // Convert response to string if needed
      const responseText =
        typeof response === 'string' ? response : JSON.stringify(response);

      if (!responseText || responseText.trim().length === 0) {
        return null;
      }

      // Detect code blocks using regex (markdown code fences)
      // Pattern: ```language\ncode\n```
      const codeBlockPattern = /```(\w+)?\n([\s\S]*?)```/g;
      const codeBlocks: Array<{
        language: string;
        code: string;
      }> = [];

      let match;
      while ((match = codeBlockPattern.exec(responseText)) !== null) {
        const language = (match[1] || 'unknown').toLowerCase();
        const code = match[2].trim();

        // Only process Python and JavaScript code blocks
        if (
          language === 'python' ||
          language === 'py' ||
          language === 'javascript' ||
          language === 'js' ||
          language === 'typescript' ||
          language === 'ts' ||
          language === 'unknown'
        ) {
          codeBlocks.push({
            language: this.normalizeLanguage(language),
            code,
          });
        }
      }

      if (codeBlocks.length === 0) {
        return null;
      }

      this.logger.debug(
        `Detected ${codeBlocks.length} code block(s) in LLM response`,
      );

      // Execute each code block in sandbox
      const executionResults = [];
      for (const block of codeBlocks) {
        try {
          const result = await this.pythonWorkerService.executeCode(
            block.code,
            block.language as 'python' | 'javascript',
            undefined, // input_data
            undefined, // sandbox_config - use defaults
            300, // timeout_seconds
          );

          executionResults.push({
            language: block.language,
            code: block.code.substring(0, 200) + '...', // Truncate for storage
            executionResult: {
              task_id: result.task_id,
              status: result.status,
              output: result.result?.output,
              error: result.error,
              execution_time_ms: result.execution_time_ms,
              exit_code: result.exit_code,
            },
          });

          this.logger.debug(
            `Code execution completed: language=${block.language}, status=${result.status}`,
          );
        } catch (error: unknown) {
          const errMsg = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Failed to execute code block (${block.language}): ${errMsg}`,
          );
          executionResults.push({
            language: block.language,
            code: block.code.substring(0, 200) + '...',
            executionResult: {
              status: 'failed',
              error: errMsg,
            },
          });
        }
      }

      return executionResults.length > 0 ? executionResults : null;
    } catch (error: unknown) {
      // Don't fail evaluation if code detection/execution fails
      this.logger.warn(
        `Code detection/execution failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Normalize language identifier to 'python' or 'javascript'
   */
  private normalizeLanguage(language: string): 'python' | 'javascript' {
    const lang = language.toLowerCase();
    if (lang === 'python' || lang === 'py') {
      return 'python';
    }
    if (
      lang === 'javascript' ||
      lang === 'js' ||
      lang === 'typescript' ||
      lang === 'ts' ||
      lang === 'node'
    ) {
      return 'javascript';
    }
    // Default to python for unknown languages (heuristic)
    return 'python';
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
