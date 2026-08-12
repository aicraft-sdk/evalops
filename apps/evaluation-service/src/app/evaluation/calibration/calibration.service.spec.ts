import { Test } from '@nestjs/testing';
import { GoldenSetsRepository, GoldenSetExample } from '@evalops/shared-db';
import { EvaluatorsService } from '../evaluators/evaluators.service';
import { CalibrationService } from './calibration.service';

jest.mock('@evalops/shared-db', () => ({
  GoldenSetsRepository: class GoldenSetsRepository {},
}));

function makeExample(overrides: Partial<GoldenSetExample> = {}): GoldenSetExample {
  return {
    id: 'e1',
    goldenSetId: 'gs1',
    input: null,
    output: 'the output text',
    expected: null,
    context: null,
    humanLabel: true,
    humanReasoning: null,
    isBadExample: false,
    createdBy: 'user-1',
    organizationId: 'org-1',
    createdAt: new Date(),
    ...overrides,
  } as GoldenSetExample;
}

function threeExamplesIncludingOneBad(): GoldenSetExample[] {
  return [
    makeExample({ id: 'e1', humanLabel: true, isBadExample: false }),
    makeExample({ id: 'e2', humanLabel: false, isBadExample: true }),
    makeExample({ id: 'e3', humanLabel: true, isBadExample: false }),
  ];
}

function fiveExamplesIncludingOneBad(): GoldenSetExample[] {
  return [
    makeExample({ id: 'e1', humanLabel: true, isBadExample: false }),
    makeExample({ id: 'e2', humanLabel: false, isBadExample: true }),
    makeExample({ id: 'e3', humanLabel: true, isBadExample: false }),
    makeExample({ id: 'e4', humanLabel: true, isBadExample: false }),
    makeExample({ id: 'e5', humanLabel: false, isBadExample: false }),
  ];
}

describe('CalibrationService.runCalibration', () => {
  let service: CalibrationService;
  let goldenSetsRepo: {
    listExamples: jest.Mock;
    createCalibrationRun: jest.Mock;
  };
  let evaluators: Record<string, jest.Mock>;

  beforeEach(async () => {
    goldenSetsRepo = {
      listExamples: jest.fn(),
      createCalibrationRun: jest.fn().mockImplementation((data) => Promise.resolve({ id: 'run-1', ...data })),
    };
    evaluators = {
      evaluateLLMAsJudge: jest.fn(),
      evaluateBattle: jest.fn(),
      evaluateFactuality: jest.fn(),
      evaluateSecurity: jest.fn(),
      evaluateAnswerRelevancy: jest.fn(),
      evaluateContextPrecision: jest.fn(),
      evaluateContextRecall: jest.fn(),
      evaluateContextRelevancy: jest.fn(),
      evaluateFaithfulness: jest.fn(),
      evaluateAnswerCorrectness: jest.fn(),
      evaluatePIIDetection: jest.fn(),
      evaluateJailbreakDetection: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CalibrationService,
        { provide: GoldenSetsRepository, useValue: goldenSetsRepo },
        { provide: EvaluatorsService, useValue: evaluators },
      ],
    }).compile();
    service = moduleRef.get(CalibrationService);
  });

  it('rejects a golden set with zero bad examples', async () => {
    goldenSetsRepo.listExamples.mockResolvedValue([
      makeExample({ id: 'e1', isBadExample: false, humanLabel: true }),
    ]);

    await expect(
      service.runCalibration({
        goldenSetId: 'gs1',
        judgeEvaluator: 'factuality',
        organizationId: 'org-1',
        triggeredBy: 'user-1',
      }),
    ).rejects.toThrow(/at least one.*bad example/i);
  });

  it('flags isReliable:false but still persists a report for <5 examples', async () => {
    goldenSetsRepo.listExamples.mockResolvedValue(threeExamplesIncludingOneBad());
    evaluators.evaluateFactuality.mockResolvedValue({ score: 0.9, reasoning: 'r', cost: 0.001 });

    await service.runCalibration({
      goldenSetId: 'gs1',
      judgeEvaluator: 'factuality',
      organizationId: 'org-1',
      triggeredBy: 'user-1',
    });

    expect(goldenSetsRepo.createCalibrationRun).toHaveBeenCalledWith(
      expect.objectContaining({ isReliable: false, sampleCount: 3 }),
    );
  });

  it('binarizes judge scores against judgeThreshold and records per-example disagreements', async () => {
    goldenSetsRepo.listExamples.mockResolvedValue(fiveExamplesIncludingOneBad());
    evaluators.evaluateFactuality
      .mockResolvedValueOnce({ score: 0.9, reasoning: 'good', cost: 0 }) // e1 human=true, judge=true -> agree
      .mockResolvedValueOnce({ score: 0.2, reasoning: 'bad match', cost: 0 }) // e2 human=false, judge=false -> agree
      .mockResolvedValueOnce({ score: 0.9, reasoning: 'good', cost: 0 }) // e3 human=true, judge=true -> agree
      .mockResolvedValueOnce({ score: 0.1, reasoning: 'disagrees', cost: 0 }) // e4 human=true, judge=false -> DISAGREE
      .mockResolvedValueOnce({ score: 0.4, reasoning: 'good', cost: 0 }); // e5 human=false, judge=false -> agree

    await service.runCalibration({
      goldenSetId: 'gs1',
      judgeEvaluator: 'factuality',
      organizationId: 'org-1',
      triggeredBy: 'user-1',
    });

    const call = goldenSetsRepo.createCalibrationRun.mock.calls[0][0];
    expect(call.disagreements).toHaveLength(1);
    expect(call.disagreements[0]).toEqual(
      expect.objectContaining({
        exampleId: 'e4',
        humanLabel: true,
        judgeLabel: false,
        judgeScore: 0.1,
        judgeReasoning: 'disagrees',
      }),
    );
    expect(evaluators.evaluateFactuality).toHaveBeenCalledTimes(5);
    expect(call.isReliable).toBe(true);
    expect(call.sampleCount).toBe(5);
  });

  it('rejects an unsupported judgeEvaluator value', async () => {
    goldenSetsRepo.listExamples.mockResolvedValue(threeExamplesIncludingOneBad());

    await expect(
      service.runCalibration({
        goldenSetId: 'gs1',
        judgeEvaluator: 'not_a_real_evaluator',
        organizationId: 'org-1',
        triggeredBy: 'user-1',
      }),
    ).rejects.toThrow(/unsupported judgeEvaluator/i);
  });
});
