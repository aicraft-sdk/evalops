import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SimulationRunnerService } from './simulation-runner.service';
import { RunsRepository } from '@evalops/shared-db';
import { SimulationsService } from './simulations.service';
import { TraceWriterService } from './trace-writer.service';
import { CoreClientService } from '../core-client/core-client.service';
import { AIProviderService } from '../ai-provider/ai-provider.service';
import { EvaluatorsService } from '../evaluation/evaluators/evaluators.service';
import { PoliciesService } from '../policies/policies.service';
import { SimulationScenarioDefinition } from './types';
import type {
  Run,
  SimulationSuite,
  SimulationScenario,
} from '@evalops/shared-db';

describe('SimulationRunnerService', () => {
  let service: SimulationRunnerService;
  let runsRepository: jest.Mocked<RunsRepository>;
  let simulationsService: jest.Mocked<SimulationsService>;
  let traceWriterService: jest.Mocked<TraceWriterService>;
  let coreClient: jest.Mocked<CoreClientService>;
  let aiProvider: jest.Mocked<AIProviderService>;
  let evaluatorsService: jest.Mocked<EvaluatorsService>;
  let policiesService: jest.Mocked<PoliciesService>;

  const mockSuite: SimulationSuite = {
    id: 'suite-123',
    name: 'Test Suite',
    version: '1.0.0',
    description: 'Test suite',
    config: {},
    organizationId: 'org-123',
    createdBy: 'user-123',
    createdAt: new Date(),
  };

  const mockScenario: SimulationScenario = {
    id: 'scenario-123',
    suiteId: 'suite-123',
    name: 'Test Scenario',
    order: 1,
    definition: {
      agentId: 'agent-123',
      turns: [
        {
          userMessage: 'Hello',
          assertions: {
            regex: '.*',
          },
        },
      ],
    } as SimulationScenarioDefinition,
    organizationId: 'org-123',
    createdAt: new Date(),
  };

  const mockRun: Run = {
    id: 'run-123',
    name: 'Sim: Test Suite/Test Scenario',
    evalSpecId: 'simulation',
    policyId: null,
    agentId: null,
    agentVersion: null,
    status: 'running',
    decision: null,
    policyScore: null,
    startedAt: new Date(),
    completedAt: null,
    metrics: null,
    cost: null,
    duration: null,
    errorMessage: null,
    triggeredBy: 'user-123',
    commitSha: null,
    organizationId: 'org-123',
    description: 'Test run',
    traceEvents: null,
    traceMigratedAt: null,
    artifactHashes: null,
    createdAt: new Date(),
  };

  const mockRootSpan = {
    id: 'span-id-123',
    traceId: 'trace-123',
    spanId: 'span-root',
    parentSpanId: null,
    name: 'simulation.run',
    startTime: new Date(),
    endTime: null,
    attributes: { run_id: 'run-123' },
    events: [],
    runId: 'run-123',
    organizationId: 'org-123',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const mockRunsRepository = {
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
    };

    const mockSimulationsService = {
      getScenario: jest.fn(),
      getSuite: jest.fn(),
      createSimulationRun: jest.fn(),
    };

    const mockTraceWriterService = {
      createRootSpan: jest.fn(),
      createSpan: jest.fn(),
      endSpan: jest.fn(),
    };

    const mockCoreClient = {
      getAgent: jest.fn(),
      renderTemplate: jest.fn(),
    };

    const mockAIProvider = {
      generateResponse: jest.fn(),
    };

    const mockEvaluatorsService = {
      evaluateLLMAsJudge: jest.fn(),
    };

    const mockPoliciesService = {
      evaluatePolicies: jest.fn(),
      evaluateRun: jest.fn().mockResolvedValue({
        decision: 'pass',
        violations: [],
        evidence: {},
        score: 1.0,
        passedRules: 1,
        totalRules: 1,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SimulationRunnerService,
        {
          provide: RunsRepository,
          useValue: mockRunsRepository,
        },
        {
          provide: SimulationsService,
          useValue: mockSimulationsService,
        },
        {
          provide: TraceWriterService,
          useValue: mockTraceWriterService,
        },
        {
          provide: CoreClientService,
          useValue: mockCoreClient,
        },
        {
          provide: AIProviderService,
          useValue: mockAIProvider,
        },
        {
          provide: EvaluatorsService,
          useValue: mockEvaluatorsService,
        },
        {
          provide: PoliciesService,
          useValue: mockPoliciesService,
        },
      ],
    }).compile();

    service = module.get<SimulationRunnerService>(SimulationRunnerService);
    runsRepository = module.get(RunsRepository);
    simulationsService = module.get(SimulationsService);
    traceWriterService = module.get(TraceWriterService);
    coreClient = module.get(CoreClientService);
    aiProvider = module.get(AIProviderService);
    evaluatorsService = module.get(EvaluatorsService);
    policiesService = module.get(PoliciesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('executeScenario', () => {
    it('should execute a scenario successfully', async () => {
      simulationsService.getScenario.mockResolvedValue(mockScenario);
      simulationsService.getSuite.mockResolvedValue(mockSuite);
      runsRepository.create.mockResolvedValue(mockRun);
      simulationsService.createSimulationRun.mockResolvedValue(undefined);
      traceWriterService.createRootSpan.mockResolvedValue(mockRootSpan);

      const mockAgent = {
        id: 'agent-123',
        content:
          'system: You are a helpful assistant\nmodel:\n  provider: openai\n  model: gpt-4',
      };

      coreClient.getAgent.mockResolvedValue(mockAgent);

      const mockTurnSpan = {
        ...mockRootSpan,
        spanId: 'span-turn',
        name: 'simulation.turn',
      };

      const mockLLMSpan = {
        ...mockRootSpan,
        spanId: 'span-llm',
        name: 'llm.call',
      };

      traceWriterService.createSpan
        .mockResolvedValueOnce(mockTurnSpan)
        .mockResolvedValueOnce(mockLLMSpan);

      aiProvider.generateResponse.mockResolvedValue({
        response: 'Hello! How can I help you?',
        cost: 0.001,
        tokenUsage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
      });

      evaluatorsService.evaluateLLMAsJudge.mockResolvedValue({
        score: 0.9,
        cost: 0.002,
      });

      policiesService.evaluatePolicies.mockResolvedValue({
        decision: 'pass',
        violations: [],
        evidence: {},
        score: 1.0,
        passedRules: 1,
        totalRules: 1,
      });

      runsRepository.findById.mockResolvedValue({
        ...mockRun,
        status: 'completed',
      });

      const result = await service.executeScenario(
        'scenario-123',
        'org-123',
        'user-123'
      );

      expect(result).toBeDefined();
      expect(result.status).toBe('completed');
      expect(runsRepository.create).toHaveBeenCalled();
      expect(simulationsService.createSimulationRun).toHaveBeenCalled();
      expect(traceWriterService.createRootSpan).toHaveBeenCalled();
      expect(aiProvider.generateResponse).toHaveBeenCalled();
      expect(policiesService.evaluateRun).toHaveBeenCalled();
    });

    it('should throw NotFoundException if scenario not found', async () => {
      simulationsService.getScenario.mockRejectedValue(
        new NotFoundException('Scenario not found')
      );

      await expect(
        service.executeScenario('scenario-123', 'org-123', 'user-123')
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if agentId missing', async () => {
      const scenarioWithoutAgent = {
        ...mockScenario,
        definition: {
          turns: [{ userMessage: 'Hello' }],
        } as SimulationScenarioDefinition,
      };

      simulationsService.getScenario.mockResolvedValue(scenarioWithoutAgent);
      simulationsService.getSuite.mockResolvedValue(mockSuite);

      await expect(
        service.executeScenario('scenario-123', 'org-123', 'user-123')
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if agent not found', async () => {
      simulationsService.getScenario.mockResolvedValue(mockScenario);
      simulationsService.getSuite.mockResolvedValue(mockSuite);
      coreClient.getAgent.mockResolvedValue(null);

      await expect(
        service.executeScenario('scenario-123', 'org-123', 'user-123')
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle termination conditions', async () => {
      const scenarioWithTermination = {
        ...mockScenario,
        definition: {
          ...(mockScenario.definition as SimulationScenarioDefinition),
          terminationRules: {
            maxTurns: 1,
          },
        } as SimulationScenarioDefinition,
      };

      simulationsService.getScenario.mockResolvedValue(scenarioWithTermination);
      simulationsService.getSuite.mockResolvedValue(mockSuite);
      runsRepository.create.mockResolvedValue(mockRun);
      simulationsService.createSimulationRun.mockResolvedValue(undefined);
      traceWriterService.createRootSpan.mockResolvedValue(mockRootSpan);

      const mockAgent = {
        id: 'agent-123',
        content:
          'system: You are a helpful assistant\nmodel:\n  provider: openai\n  model: gpt-4',
      };

      coreClient.getAgent.mockResolvedValue(mockAgent);

      const mockTurnSpan = {
        ...mockRootSpan,
        spanId: 'span-turn',
        name: 'simulation.turn',
      };

      const mockLLMSpan = {
        ...mockRootSpan,
        spanId: 'span-llm',
        name: 'llm.call',
      };

      traceWriterService.createSpan
        .mockResolvedValueOnce(mockTurnSpan)
        .mockResolvedValueOnce(mockLLMSpan);

      aiProvider.generateResponse.mockResolvedValue({
        response: 'Hello!',
        cost: 0.001,
        tokenUsage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
      });

      policiesService.evaluatePolicies.mockResolvedValue({
        decision: 'pass',
        violations: [],
        evidence: {},
        score: 1.0,
        passedRules: 1,
        totalRules: 1,
      });

      runsRepository.findById.mockResolvedValue({
        ...mockRun,
        status: 'completed',
      });

      const result = await service.executeScenario(
        'scenario-123',
        'org-123',
        'user-123'
      );

      expect(result.status).toBe('completed');
      expect(traceWriterService.endSpan).toHaveBeenCalledWith(
        'span-root',
        expect.objectContaining({
          total_turns: 1,
        })
      );
    });

    it('should handle stop tokens termination', async () => {
      const scenarioWithStopTokens = {
        ...mockScenario,
        definition: {
          ...(mockScenario.definition as SimulationScenarioDefinition),
          terminationRules: {
            stopTokens: ['goodbye'],
          },
        } as SimulationScenarioDefinition,
      };

      simulationsService.getScenario.mockResolvedValue(scenarioWithStopTokens);
      simulationsService.getSuite.mockResolvedValue(mockSuite);
      runsRepository.create.mockResolvedValue(mockRun);
      simulationsService.createSimulationRun.mockResolvedValue(undefined);
      traceWriterService.createRootSpan.mockResolvedValue(mockRootSpan);

      const mockAgent = {
        id: 'agent-123',
        content:
          'system: You are a helpful assistant\nmodel:\n  provider: openai\n  model: gpt-4',
      };

      coreClient.getAgent.mockResolvedValue(mockAgent);

      const mockTurnSpan = {
        ...mockRootSpan,
        spanId: 'span-turn',
        name: 'simulation.turn',
      };

      const mockLLMSpan = {
        ...mockRootSpan,
        spanId: 'span-llm',
        name: 'llm.call',
      };

      traceWriterService.createSpan
        .mockResolvedValueOnce(mockTurnSpan)
        .mockResolvedValueOnce(mockLLMSpan);

      aiProvider.generateResponse.mockResolvedValue({
        response: 'Thank you, goodbye!',
        cost: 0.001,
        tokenUsage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
      });

      policiesService.evaluatePolicies.mockResolvedValue({
        decision: 'pass',
        violations: [],
        evidence: {},
        score: 1.0,
        passedRules: 1,
        totalRules: 1,
      });

      runsRepository.findById.mockResolvedValue({
        ...mockRun,
        status: 'completed',
      });

      const result = await service.executeScenario(
        'scenario-123',
        'org-123',
        'user-123'
      );

      expect(result.status).toBe('completed');
    });

    it('should handle errors during execution', async () => {
      simulationsService.getScenario.mockResolvedValue(mockScenario);
      simulationsService.getSuite.mockResolvedValue(mockSuite);
      runsRepository.create.mockResolvedValue(mockRun);
      simulationsService.createSimulationRun.mockResolvedValue(undefined);
      traceWriterService.createRootSpan.mockResolvedValue(mockRootSpan);

      const mockAgent = {
        id: 'agent-123',
        content:
          'system: You are a helpful assistant\nmodel:\n  provider: openai\n  model: gpt-4',
      };

      coreClient.getAgent.mockResolvedValue(mockAgent);

      const mockTurnSpan = {
        ...mockRootSpan,
        spanId: 'span-turn',
        name: 'simulation.turn',
      };

      traceWriterService.createSpan.mockResolvedValueOnce(mockTurnSpan);

      aiProvider.generateResponse.mockRejectedValue(new Error('LLM API error'));

      await expect(
        service.executeScenario('scenario-123', 'org-123', 'user-123')
      ).rejects.toThrow('LLM API error');

      expect(runsRepository.update).toHaveBeenCalledWith(
        'run-123',
        expect.objectContaining({
          status: 'failed',
        })
      );
    });

    it('should validate response with regex assertion', async () => {
      simulationsService.getScenario.mockResolvedValue(mockScenario);
      simulationsService.getSuite.mockResolvedValue(mockSuite);
      runsRepository.create.mockResolvedValue(mockRun);
      simulationsService.createSimulationRun.mockResolvedValue(undefined);
      traceWriterService.createRootSpan.mockResolvedValue(mockRootSpan);

      const mockAgent = {
        id: 'agent-123',
        content:
          'system: You are a helpful assistant\nmodel:\n  provider: openai\n  model: gpt-4',
      };

      coreClient.getAgent.mockResolvedValue(mockAgent);

      const mockTurnSpan = {
        ...mockRootSpan,
        spanId: 'span-turn',
        name: 'simulation.turn',
      };

      const mockLLMSpan = {
        ...mockRootSpan,
        spanId: 'span-llm',
        name: 'llm.call',
      };

      traceWriterService.createSpan
        .mockResolvedValueOnce(mockTurnSpan)
        .mockResolvedValueOnce(mockLLMSpan);

      aiProvider.generateResponse.mockResolvedValue({
        response: 'Hello, world!',
        cost: 0.001,
        tokenUsage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
      });

      policiesService.evaluatePolicies.mockResolvedValue({
        decision: 'pass',
        violations: [],
        evidence: {},
        score: 1.0,
        passedRules: 1,
        totalRules: 1,
      });

      await service.executeScenario('scenario-123', 'org-123', 'user-123');

      expect(traceWriterService.endSpan).toHaveBeenCalledWith(
        'span-turn',
        expect.objectContaining({
          validation_results: expect.objectContaining({
            regex: true,
          }),
        })
      );
    });

    it('should evaluate judge when rubricTags provided', async () => {
      const scenarioWithJudge = {
        ...mockScenario,
        definition: {
          ...(mockScenario.definition as SimulationScenarioDefinition),
          turns: [
            {
              userMessage: 'Hello',
              assertions: {
                rubricTags: ['helpful', 'polite'],
              },
            },
          ],
        } as SimulationScenarioDefinition,
      };

      simulationsService.getScenario.mockResolvedValue(scenarioWithJudge);
      simulationsService.getSuite.mockResolvedValue(mockSuite);
      runsRepository.create.mockResolvedValue(mockRun);
      simulationsService.createSimulationRun.mockResolvedValue(undefined);
      traceWriterService.createRootSpan.mockResolvedValue(mockRootSpan);

      const mockAgent = {
        id: 'agent-123',
        content:
          'system: You are a helpful assistant\nmodel:\n  provider: openai\n  model: gpt-4',
      };

      coreClient.getAgent.mockResolvedValue(mockAgent);

      const mockTurnSpan = {
        ...mockRootSpan,
        spanId: 'span-turn',
        name: 'simulation.turn',
      };

      const mockLLMSpan = {
        ...mockRootSpan,
        spanId: 'span-llm',
        name: 'llm.call',
      };

      traceWriterService.createSpan
        .mockResolvedValueOnce(mockTurnSpan)
        .mockResolvedValueOnce(mockLLMSpan);

      aiProvider.generateResponse.mockResolvedValue({
        response: 'Hello! How can I help you?',
        cost: 0.001,
        tokenUsage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
      });

      evaluatorsService.evaluateLLMAsJudge.mockResolvedValue({
        score: 0.85,
        cost: 0.002,
      });

      policiesService.evaluatePolicies.mockResolvedValue({
        decision: 'pass',
        violations: [],
        evidence: {},
        score: 1.0,
        passedRules: 1,
        totalRules: 1,
      });

      await service.executeScenario('scenario-123', 'org-123', 'user-123');

      expect(evaluatorsService.evaluateLLMAsJudge).toHaveBeenCalled();
      expect(traceWriterService.endSpan).toHaveBeenCalledWith(
        'span-turn',
        expect.objectContaining({
          validation_results: expect.objectContaining({
            judge: expect.objectContaining({
              score: 0.85,
              cost: 0.002,
            }),
          }),
        })
      );
    });

    it('should handle template-based user messages', async () => {
      const scenarioWithTemplate = {
        ...mockScenario,
        definition: {
          ...(mockScenario.definition as SimulationScenarioDefinition),
          turns: [
            {
              userMessage: {
                template: 'Hello, {{name}}!',
                variables: { name: 'Alice' },
              },
            },
          ],
        } as SimulationScenarioDefinition,
      };

      simulationsService.getScenario.mockResolvedValue(scenarioWithTemplate);
      simulationsService.getSuite.mockResolvedValue(mockSuite);
      runsRepository.create.mockResolvedValue(mockRun);
      simulationsService.createSimulationRun.mockResolvedValue(undefined);
      traceWriterService.createRootSpan.mockResolvedValue(mockRootSpan);

      const mockAgent = {
        id: 'agent-123',
        content:
          'system: You are a helpful assistant\nmodel:\n  provider: openai\n  model: gpt-4',
      };

      coreClient.getAgent.mockResolvedValue(mockAgent);
      coreClient.renderTemplate.mockResolvedValue('Hello, Alice!');

      const mockTurnSpan = {
        ...mockRootSpan,
        spanId: 'span-turn',
        name: 'simulation.turn',
      };

      const mockLLMSpan = {
        ...mockRootSpan,
        spanId: 'span-llm',
        name: 'llm.call',
      };

      traceWriterService.createSpan
        .mockResolvedValueOnce(mockTurnSpan)
        .mockResolvedValueOnce(mockLLMSpan);

      aiProvider.generateResponse.mockResolvedValue({
        response: 'Hello, Alice! How can I help?',
        cost: 0.001,
        tokenUsage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
      });

      policiesService.evaluatePolicies.mockResolvedValue({
        decision: 'pass',
        violations: [],
        evidence: {},
        score: 1.0,
        passedRules: 1,
        totalRules: 1,
      });

      await service.executeScenario('scenario-123', 'org-123', 'user-123');

      expect(coreClient.renderTemplate).toHaveBeenCalledWith(
        'Hello, {{name}}!',
        { name: 'Alice' },
        undefined
      );
    });
  });
});
