import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { DatabaseStorageService } from '../storage/database-storage.service';
import { SimulationsService } from './simulations.service';
import { TraceWriterService } from './trace-writer.service';
import { CoreClientService } from '../core-client/core-client.service';
import { AIProviderService } from '../ai-provider/ai-provider.service';
import { EvaluatorsService } from '../evaluation/evaluators/evaluators.service';
import { PoliciesService } from '../policies/policies.service';
import { Run, InsertRun } from '@evalops/shared-db';
import { SimulationScenarioDefinition, SimulationTurn } from './types';
import { AgentMDParser } from '@evalops/agent-md';
import { getGitCommitShaSync } from './git-utils';

interface TurnResult {
  turnIndex: number;
  userMessage: string;
  agentResponse: string;
  toolCalls?: Array<{ name: string; arguments: any; result?: any }>;
  validationResults?: {
    schema?: boolean;
    regex?: boolean;
    judge?: { score: number; cost: number };
  };
  cost: number;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  duration: number;
}

/**
 * SimulationRunnerService
 *
 * Orchestrates multi-turn simulation execution:
 * 1. Create run and simulation run record
 * 2. Execute turns sequentially (user message → agent call → validation)
 * 3. Write spans for each operation
 * 4. Check termination conditions
 * 5. Complete run and evaluate policies
 */
@Injectable()
export class SimulationRunnerService {
  private readonly logger = new Logger(SimulationRunnerService.name);
  private readonly agentParser = new AgentMDParser();

  constructor(
    private storageService: DatabaseStorageService,
    private simulationsService: SimulationsService,
    private traceWriterService: TraceWriterService,
    private coreClient: CoreClientService,
    private aiProvider: AIProviderService,
    private evaluatorsService: EvaluatorsService,
    private policiesService: PoliciesService
  ) {}

  /**
   * Execute a simulation scenario
   */
  async executeScenario(
    scenarioId: string,
    organizationId: string,
    triggeredBy: string,
    authToken?: string,
    commitSha?: string
  ): Promise<Run> {
    const startTime = Date.now();

    // 1. Fetch scenario
    const scenario = await this.simulationsService.getScenario(
      scenarioId,
      organizationId
    );
    const suite = await this.simulationsService.getSuite(
      scenario.suiteId,
      organizationId
    );

    // 2. Fetch agent definition
    const definition = scenario.definition as SimulationScenarioDefinition;
    if (!definition.agentId) {
      throw new BadRequestException('Scenario definition must include agentId');
    }

    const agent = await this.coreClient.getAgent(definition.agentId, authToken);
    if (!agent) {
      throw new NotFoundException(`Agent ${definition.agentId} not found`);
    }

    // Parse AgentMD content
    const parseResult = this.agentParser.parse(agent.content);
    if (parseResult.parseErrors?.length) {
      this.logger.warn(
        `AgentMD parse warnings: ${parseResult.parseErrors.join('; ')}`
      );
    }
    const agentMD = parseResult.agentMD;

    // 3. Create run record
    const runName = `Sim: ${suite.name}/${scenario.name}`;
    const run: InsertRun = {
      name: runName,
      evalSpecId: 'simulation', // Placeholder - simulations don't use eval specs
      status: 'running',
      triggeredBy,
      organizationId,
      description: `Simulation run for scenario ${scenario.name}`,
      commitSha: commitSha || getGitCommitShaSync() || undefined, // Allow null/undefined if unable to determine
    };

    const createdRun = await this.storageService.createRun(run);

    // 4. Create simulation run linking record
    await this.simulationsService.createSimulationRun(
      createdRun.id,
      suite.id,
      scenario.id,
      organizationId
    );

    // 5. Create root span
    const rootSpan = await this.traceWriterService.createRootSpan(
      createdRun.id,
      organizationId
    );
    const traceId = rootSpan.traceId;

    let totalCost = 0;
    let totalTokens = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const turnResults: TurnResult[] = [];

    try {
      // 6. Execute turns
      for (
        let turnIndex = 0;
        turnIndex < definition.turns.length;
        turnIndex++
      ) {
        const turn = definition.turns[turnIndex];
        const turnResult = await this.executeTurn(
          turn,
          turnIndex,
          agentMD,
          createdRun.id,
          organizationId,
          traceId,
          rootSpan.spanId,
          authToken
        );

        turnResults.push(turnResult);
        totalCost += turnResult.cost;
        totalTokens.promptTokens += turnResult.tokenUsage.promptTokens;
        totalTokens.completionTokens += turnResult.tokenUsage.completionTokens;
        totalTokens.totalTokens += turnResult.tokenUsage.totalTokens;

        // Check termination conditions
        if (this.shouldTerminate(turnResult, definition, turnIndex)) {
          this.logger.log(
            `Simulation terminated at turn ${
              turnIndex + 1
            } due to termination condition`
          );
          break;
        }
      }

      // 7. End root span
      await this.traceWriterService.endSpan(rootSpan.spanId, {
        total_turns: turnResults.length,
        total_cost: totalCost,
        total_tokens: totalTokens.totalTokens,
      });

      // 8. Update run with metrics
      const duration = Math.floor((Date.now() - startTime) / 1000);
      await this.storageService.updateRun(createdRun.id, {
        status: 'completed',
        completedAt: new Date(),
        metrics: {
          turns: turnResults.length,
          totalCost,
          tokenUsage: totalTokens,
          turnResults: turnResults.map((tr) => ({
            turnIndex: tr.turnIndex,
            cost: tr.cost,
            duration: tr.duration,
            validationResults: tr.validationResults,
          })),
        },
        cost: totalCost,
        duration,
      });

      // 9. Evaluate policies
      const updatedRun = await this.storageService.getRun(createdRun.id);
      if (updatedRun) {
        await this.policiesService.evaluateRun(updatedRun.id);
      }

      return updatedRun || createdRun;
    } catch (error: any) {
      this.logger.error(
        `Simulation execution failed: ${error.message}`,
        error.stack
      );

      // End root span with error
      await this.traceWriterService.endSpan(rootSpan.spanId, {
        error: error.message,
        failed_at_turn: turnResults.length,
      });

      // Update run status
      await this.storageService.updateRun(createdRun.id, {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: error.message,
        duration: Math.floor((Date.now() - startTime) / 1000),
      });

      throw error;
    }
  }

  /**
   * Execute a single turn
   */
  private async executeTurn(
    turn: SimulationTurn,
    turnIndex: number,
    agentMD: any,
    runId: string,
    organizationId: string,
    traceId: string,
    rootSpanId: string,
    authToken?: string
  ): Promise<TurnResult> {
    const turnStartTime = Date.now();

    // Create turn span
    const turnSpan = await this.traceWriterService.createSpan(
      runId,
      organizationId,
      'simulation.turn',
      rootSpanId,
      traceId,
      {
        turn: turnIndex + 1,
      }
    );

    try {
      // 1. Resolve user message template
      let userMessage: string;
      if (typeof turn.userMessage === 'string') {
        userMessage = turn.userMessage;
      } else {
        // Template with variables
        userMessage = await this.coreClient.renderTemplate(
          turn.userMessage.template,
          turn.userMessage.variables || {},
          authToken
        );
      }

      // 2. Call agent
      const llmSpan = await this.traceWriterService.createSpan(
        runId,
        organizationId,
        'llm.call',
        turnSpan.spanId,
        traceId,
        {
          turn: turnIndex + 1,
          model_provider: agentMD.model?.provider,
          model_name: agentMD.model?.model,
        }
      );

      // Build messages for agent
      const messages: Array<{ role: string; content: string }> = [];

      // Add system prompt if present
      if (agentMD.systemPrompt) {
        messages.push({ role: 'system', content: agentMD.systemPrompt });
      }

      // Add user message
      messages.push({ role: 'user', content: userMessage });

      // Generate response (Phase 1: simple LLM call, no tool execution)
      const modelConfig = {
        model: agentMD.model?.model || 'gpt-4',
        temperature: agentMD.model?.temperature || 0.7,
        maxTokens: agentMD.model?.maxTokens || 1000,
      };

      const generationResponse = await this.aiProvider.generateResponse(
        messages.map((m) => `${m.role}: ${m.content}`).join('\n\n'),
        userMessage,
        modelConfig
      );

      const agentResponse = generationResponse.response;

      // End LLM span
      await this.traceWriterService.endSpan(llmSpan.spanId, {
        cost: generationResponse.cost,
        prompt_tokens: generationResponse.tokenUsage.promptTokens,
        completion_tokens: generationResponse.tokenUsage.completionTokens,
        total_tokens: generationResponse.tokenUsage.totalTokens,
      });

      // 3. Validate response (if assertions present)
      const validationResults: TurnResult['validationResults'] = {};

      if (turn.assertions) {
        // Schema validation
        if (turn.assertions.schema) {
          // Use RuleEvaluator for schema validation
          // For Phase 1, we'll do basic validation
          validationResults.schema = true; // Placeholder
        }

        // Regex validation
        if (turn.assertions.regex) {
          const regex = new RegExp(turn.assertions.regex);
          validationResults.regex = regex.test(agentResponse);
        }

        // Judge evaluation
        if (
          turn.assertions.rubricTags &&
          turn.assertions.rubricTags.length > 0
        ) {
          // Use judge evaluator
          const judgePrompt = `Evaluate the following response based on these criteria: ${turn.assertions.rubricTags.join(
            ', '
          )}\n\nResponse: ${agentResponse}`;
          const judgeResult = await this.evaluatorsService.evaluateLLMAsJudge(
            agentResponse,
            '', // No expected output for judge
            judgePrompt,
            Date.now() // Seed
          );

          validationResults.judge = {
            score: judgeResult.score,
            cost: judgeResult.cost,
          };
        }
      }

      // 4. End turn span
      await this.traceWriterService.endSpan(turnSpan.spanId, {
        user_message: userMessage,
        agent_response: agentResponse,
        validation_results: validationResults,
      });

      const duration = Date.now() - turnStartTime;

      return {
        turnIndex,
        userMessage,
        agentResponse,
        validationResults,
        cost: generationResponse.cost,
        tokenUsage: generationResponse.tokenUsage,
        duration,
      };
    } catch (error: any) {
      // End turn span with error
      await this.traceWriterService.endSpan(turnSpan.spanId, {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Check if simulation should terminate
   */
  private shouldTerminate(
    turnResult: TurnResult,
    definition: SimulationScenarioDefinition,
    turnIndex: number
  ): boolean {
    const terminationRules = definition.terminationRules;

    if (!terminationRules) {
      return false;
    }

    // Max turns check
    if (
      terminationRules.maxTurns &&
      turnIndex + 1 >= terminationRules.maxTurns
    ) {
      return true;
    }

    // Stop tokens check
    if (terminationRules.stopTokens) {
      for (const token of terminationRules.stopTokens) {
        if (turnResult.agentResponse.includes(token)) {
          return true;
        }
      }
    }

    // Judge verdict threshold check
    if (terminationRules.judgeVerdictThreshold !== undefined) {
      const judgeScore = turnResult.validationResults?.judge?.score || 0;
      if (judgeScore < terminationRules.judgeVerdictThreshold) {
        return true;
      }
    }

    return false;
  }
}
