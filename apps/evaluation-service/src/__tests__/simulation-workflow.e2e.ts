/**
 * Integration tests for simulation workflow.
 *
 * Tests the full path:
 *   Create suite → Create scenario → Run scenario → Verify run status + spans + judge verdict
 *
 * Uses NestJS testing module with mocked services (no real DB required).
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { SimulationsController } from '../app/simulations/simulations.controller';
import { SimulationsService } from '../app/simulations/simulations.service';
import { SimulationRunnerService } from '../app/simulations/simulation-runner.service';
import { TraceWriterService } from '../app/simulations/trace-writer.service';
import { RunsRepository } from '@evalops/shared-db';
import { CoreClientService } from '../app/core-client/core-client.service';
import { AIProviderService } from '../app/ai-provider/ai-provider.service';
import { EvaluatorsService } from '../app/evaluation/evaluators/evaluators.service';
import { PoliciesService } from '../app/policies/policies.service';
import { JwtAuthGuard } from '@evalops/shared-auth';

const mockRunsRepository = {
  create: jest.fn(),
  update: jest.fn(),
  findById: jest.fn(),
};

const mockSimulationsService = {
  createSuite: jest.fn(),
  getSuite: jest.fn(),
  createScenario: jest.fn(),
  getScenario: jest.fn(),
  getScenariosForSuite: jest.fn(),
  createSimulationRun: jest.fn(),
  getSimulationRunByRunId: jest.fn(),
};

const mockTraceWriterService = {
  createRootSpan: jest.fn(),
  createSpan: jest.fn(),
  endSpan: jest.fn(),
  getSpansForRun: jest.fn(),
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
};

const mockJwtAuthGuard = {
  canActivate: jest.fn(() => true),
};

describe('Simulation Workflow (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [SimulationsController],
      providers: [
        SimulationsService,
        SimulationRunnerService,
        TraceWriterService,
        { provide: RunsRepository, useValue: mockRunsRepository },
        { provide: CoreClientService, useValue: mockCoreClient },
        { provide: AIProviderService, useValue: mockAIProvider },
        { provide: EvaluatorsService, useValue: mockEvaluatorsService },
        { provide: PoliciesService, useValue: mockPoliciesService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/evaluation/simulations/suites', () => {
    it('should create a simulation suite', async () => {
      const suiteData = {
        name: 'Test Suite',
        version: '1.0.0',
        description: 'Test description',
        config: {},
      };

      const createdSuite = {
        id: 'suite-123',
        ...suiteData,
        organizationId: 'org-123',
        createdBy: 'user-123',
        createdAt: new Date(),
      };

      mockSimulationsService.createSuite.mockResolvedValue(createdSuite);

      const res = await request(app.getHttpServer())
        .post('/api/evaluation/simulations/suites')
        .send(suiteData)
        .expect(HttpStatus.CREATED);

      expect(res.body).toMatchObject({
        id: 'suite-123',
        name: 'Test Suite',
      });
      expect(mockSimulationsService.createSuite).toHaveBeenCalledWith(
        suiteData,
        'org-123',
        'user-123'
      );
    });
  });

  describe('POST /api/evaluation/simulations/suites/:suiteId/scenarios', () => {
    it('should create a scenario', async () => {
      const scenarioData = {
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
        },
      };

      const createdScenario = {
        id: 'scenario-123',
        suiteId: 'suite-123',
        ...scenarioData,
        organizationId: 'org-123',
        createdAt: new Date(),
      };

      mockSimulationsService.getSuite.mockResolvedValue({
        id: 'suite-123',
        organizationId: 'org-123',
      });
      mockSimulationsService.createScenario.mockResolvedValue(createdScenario);

      const res = await request(app.getHttpServer())
        .post('/api/evaluation/simulations/suites/suite-123/scenarios')
        .send(scenarioData)
        .expect(HttpStatus.CREATED);

      expect(res.body).toMatchObject({
        id: 'scenario-123',
        name: 'Test Scenario',
      });
      expect(mockSimulationsService.createScenario).toHaveBeenCalled();
    });
  });

  describe('POST /api/evaluation/simulations/scenarios/:scenarioId/run', () => {
    it('should execute a simulation scenario and return completed run', async () => {
      const scenario = {
        id: 'scenario-123',
        suiteId: 'suite-123',
        name: 'Test Scenario',
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
        },
      };

      const suite = {
        id: 'suite-123',
        name: 'Test Suite',
        organizationId: 'org-123',
      };

      const createdRun = {
        id: 'run-123',
        name: 'Sim: Test Suite/Test Scenario',
        status: 'completed',
        decision: 'pass',
        organizationId: 'org-123',
      };

      const rootSpan = {
        traceId: 'trace-123',
        spanId: 'span-root',
        name: 'simulation.run',
      };

      mockSimulationsService.getScenario.mockResolvedValue(scenario);
      mockSimulationsService.getSuite.mockResolvedValue(suite);
      mockRunsRepository.create.mockResolvedValue({
        ...createdRun,
        status: 'running',
      });
      mockSimulationsService.createSimulationRun.mockResolvedValue({});
      mockTraceWriterService.createRootSpan.mockResolvedValue(rootSpan);

      const mockAgent = {
        id: 'agent-123',
        content: 'system: You are helpful\nmodel:\n  provider: openai\n  model: gpt-4',
      };

      mockCoreClient.getAgent.mockResolvedValue(mockAgent as any);

      const turnSpan = {
        ...rootSpan,
        spanId: 'span-turn',
        name: 'simulation.turn',
      };

      const llmSpan = {
        ...rootSpan,
        spanId: 'span-llm',
        name: 'llm.call',
      };

      mockTraceWriterService.createSpan
        .mockResolvedValueOnce(turnSpan as any)
        .mockResolvedValueOnce(llmSpan as any);

      mockAIProvider.generateResponse.mockResolvedValue({
        response: 'Hello! How can I help?',
        cost: 0.001,
        tokenUsage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
      });

      mockPoliciesService.evaluatePolicies.mockResolvedValue({
        decision: 'pass',
        violations: [],
      });

      mockRunsRepository.update.mockResolvedValue(createdRun);

      const res = await request(app.getHttpServer())
        .post('/api/evaluation/simulations/scenarios/scenario-123/run')
        .expect(HttpStatus.CREATED);

      expect(res.body).toMatchObject({
        id: 'run-123',
        status: 'completed',
        decision: 'pass',
      });

      expect(mockRunsRepository.create).toHaveBeenCalled();
      expect(mockSimulationsService.createSimulationRun).toHaveBeenCalled();
      expect(mockTraceWriterService.createRootSpan).toHaveBeenCalled();
      expect(mockAIProvider.generateResponse).toHaveBeenCalled();
      expect(mockPoliciesService.evaluatePolicies).toHaveBeenCalled();
      expect(mockRunsRepository.update).toHaveBeenCalledWith(
        'run-123',
        expect.objectContaining({
          status: 'completed',
        })
      );
    });

    it('should handle scenario execution errors', async () => {
      mockSimulationsService.getScenario.mockRejectedValue(
        new Error('Scenario not found')
      );

      await request(app.getHttpServer())
        .post('/api/evaluation/simulations/scenarios/invalid-id/run')
        .expect(HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  describe('GET /api/evaluation/simulations/runs/:runId/spans', () => {
    it('should retrieve spans for a run', async () => {
      const mockSpans = [
        {
          traceId: 'trace-123',
          spanId: 'span-root',
          name: 'simulation.run',
          startTime: new Date(),
        },
        {
          traceId: 'trace-123',
          spanId: 'span-turn',
          name: 'simulation.turn',
          parentSpanId: 'span-root',
          startTime: new Date(),
        },
      ];

      mockSimulationsService.getSimulationRunByRunId.mockResolvedValue({
        runId: 'run-123',
        suiteId: 'suite-123',
        scenarioId: 'scenario-123',
      });
      mockTraceWriterService.getSpansForRun.mockResolvedValue(mockSpans);

      const res = await request(app.getHttpServer())
        .get('/api/evaluation/simulations/runs/run-123/spans')
        .expect(HttpStatus.OK);

      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toMatchObject({
        name: 'simulation.run',
      });
      expect(mockTraceWriterService.getSpansForRun).toHaveBeenCalledWith(
        'run-123'
      );
    });

    it('should return 404 if simulation run not found', async () => {
      mockSimulationsService.getSimulationRunByRunId.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/evaluation/simulations/runs/non-existent/spans')
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('POST /api/evaluation/simulations/suites/:suiteId/run', () => {
    it('should run all scenarios in a suite', async () => {
      const suite = {
        id: 'suite-123',
        name: 'Test Suite',
        organizationId: 'org-123',
      };

      const scenarios = [
        {
          id: 'scenario-1',
          suiteId: 'suite-123',
          name: 'Scenario 1',
          order: 1,
          definition: {
            agentId: 'agent-123',
            turns: [{ userMessage: 'Hello' }],
          },
        },
        {
          id: 'scenario-2',
          suiteId: 'suite-123',
          name: 'Scenario 2',
          order: 2,
          definition: {
            agentId: 'agent-123',
            turns: [{ userMessage: 'Hi' }],
          },
        },
      ];

      mockSimulationsService.getSuite.mockResolvedValue(suite);
      mockSimulationsService.getScenariosForSuite.mockResolvedValue(scenarios);

      const run1 = {
        id: 'run-1',
        status: 'completed',
        decision: 'pass',
      };

      const run2 = {
        id: 'run-2',
        status: 'completed',
        decision: 'pass',
      };

      mockRunsRepository.create
        .mockResolvedValueOnce({ ...run1, status: 'running' })
        .mockResolvedValueOnce({ ...run2, status: 'running' });

      mockSimulationsService.createSimulationRun.mockResolvedValue({});
      mockTraceWriterService.createRootSpan.mockResolvedValue({
        traceId: 'trace-123',
        spanId: 'span-root',
      });

      mockCoreClient.getAgent.mockResolvedValue({
        id: 'agent-123',
        content: 'system: You are helpful\nmodel:\n  provider: openai\n  model: gpt-4',
      } as any);

      mockTraceWriterService.createSpan.mockResolvedValue({
        spanId: 'span-turn',
        name: 'simulation.turn',
      } as any);

      mockAIProvider.generateResponse.mockResolvedValue({
        response: 'Response',
        cost: 0.001,
        tokenUsage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
      });

      mockPoliciesService.evaluatePolicies.mockResolvedValue({
        decision: 'pass',
        violations: [],
      });

      mockRunsRepository.update
        .mockResolvedValueOnce(run1)
        .mockResolvedValueOnce(run2);

      const res = await request(app.getHttpServer())
        .post('/api/evaluation/simulations/suites/suite-123/run')
        .expect(HttpStatus.CREATED);

      expect(res.body.runs).toHaveLength(2);
      expect(res.body.runs[0]).toMatchObject({
        id: 'run-1',
        status: 'completed',
      });
      expect(res.body.runs[1]).toMatchObject({
        id: 'run-2',
        status: 'completed',
      });
    });
  });
});
