import { Test } from '@nestjs/testing';
import { CoreClientService } from '../core-client/core-client.service';
import { AIProviderService } from '../ai-provider/ai-provider.service';
import { PromptFlowService } from '../prompt-flow/prompt-flow.service';
import { EvaluatorsService } from './evaluators/evaluators.service';
import { SandboxExecutionService } from '../sandbox-execution/sandbox-execution.service';
import { PythonWorkerService } from '../python-worker/python-worker.service';
import { EvaluationRunnerService } from './evaluation-runner.service';

// '@evalops/shared-db' is a barrel that loads '../db' at module-load time,
// which throws if DATABASE_URL isn't set (see libs/shared-db/src/lib/db.ts).
// PromptFlowService transitively pulls it in via shared-common's
// org-context.interceptor.ts even though it's only used here as a mocked DI
// token - mock the barrel to avoid the load-time throw (matches the pattern
// in judge-cache.service.spec.ts).
jest.mock('@evalops/shared-db', () => ({
  withTenantContext: jest.fn((_orgId: string, fn: () => unknown) => fn()),
}));

describe('EvaluationRunnerService — organizationId threading (Task 3.2)', () => {
  let runner: EvaluationRunnerService;
  let evaluators: { evaluateFactuality: jest.Mock };

  beforeEach(async () => {
    evaluators = { evaluateFactuality: jest.fn().mockResolvedValue({ score: 0.5, cost: 0 }) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        EvaluationRunnerService,
        { provide: CoreClientService, useValue: {} },
        { provide: AIProviderService, useValue: {} },
        { provide: PromptFlowService, useValue: {} },
        { provide: EvaluatorsService, useValue: evaluators },
        { provide: SandboxExecutionService, useValue: {} },
        { provide: PythonWorkerService, useValue: {} },
      ],
    }).compile();
    runner = moduleRef.get(EvaluationRunnerService);
  });

  it('passes organizationId through to evaluateFactuality', async () => {
    await runner.evaluateSample(
      { input: 'q' },
      { evaluators: [{ type: 'factuality' }] },
      1,
      'run-1',
      undefined,
      'org-1',
    );

    expect(evaluators.evaluateFactuality).toHaveBeenCalledWith(
      undefined, // no promptId/flowId in evalSpec, so no response was generated
      'q',
      {},
      1,
      'org-1',
    );
  });
});
