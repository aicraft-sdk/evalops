import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
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
    expect(call.disagreements.items).toHaveLength(1);
    expect(call.disagreements.items[0]).toEqual(
      expect.objectContaining({
        exampleId: 'e4',
        humanLabel: true,
        judgeLabel: false,
        judgeScore: 0.1,
        judgeReasoning: 'disagrees',
      }),
    );
    expect(call.disagreements.excludedCount).toBe(0);
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

  it('excludes an example whose judge result looks like a swallowed provider failure (score:0, no reasoning) from kappa and persists the excluded count', async () => {
    goldenSetsRepo.listExamples.mockResolvedValue(fiveExamplesIncludingOneBad());
    evaluators.evaluateFactuality
      .mockResolvedValueOnce({ score: 0.9, reasoning: 'good', cost: 0 }) // e1 human=true, judge=true -> agree
      .mockResolvedValueOnce({ score: 0.2, reasoning: 'bad match', cost: 0 }) // e2 human=false, judge=false -> agree
      .mockResolvedValueOnce({ score: 0, cost: 0 }) // e3 -- swallowed-failure signature, must be excluded
      .mockResolvedValueOnce({ score: 0.1, reasoning: 'disagrees', cost: 0 }) // e4 human=true, judge=false -> DISAGREE
      .mockResolvedValueOnce({ score: 0.4, reasoning: 'good', cost: 0 }); // e5 human=false, judge=false -> agree

    await service.runCalibration({
      goldenSetId: 'gs1',
      judgeEvaluator: 'factuality',
      organizationId: 'org-1',
      triggeredBy: 'user-1',
    });

    const call = goldenSetsRepo.createCalibrationRun.mock.calls[0][0];
    // e3 excluded -> only 4 usable pairs
    expect(call.sampleCount).toBe(4);
    expect(call.disagreements.excludedCount).toBe(1);
    expect(call.disagreements.excludedExamples).toEqual([
      expect.objectContaining({ exampleId: 'e3' }),
    ]);
    expect(call.disagreements.items).toHaveLength(1);
    expect(call.disagreements.items[0]).toEqual(
      expect.objectContaining({ exampleId: 'e4', humanLabel: true, judgeLabel: false }),
    );
  });

  it('throws instead of persisting a run when ALL examples look like swallowed failures (zero usable data points)', async () => {
    goldenSetsRepo.listExamples.mockResolvedValue(threeExamplesIncludingOneBad());
    evaluators.evaluateFactuality.mockResolvedValue({ score: 0, cost: 0 });

    await expect(
      service.runCalibration({
        goldenSetId: 'gs1',
        judgeEvaluator: 'factuality',
        organizationId: 'org-1',
        triggeredBy: 'user-1',
      }),
    ).rejects.toThrow(/all.*failed to score/i);
    expect(goldenSetsRepo.createCalibrationRun).not.toHaveBeenCalled();
  });

  it('excludes an example when scoreExample throws, without aborting the rest of the run', async () => {
    goldenSetsRepo.listExamples.mockResolvedValue(fiveExamplesIncludingOneBad());
    evaluators.evaluateFactuality
      .mockResolvedValueOnce({ score: 0.9, reasoning: 'good', cost: 0 }) // e1 agree
      .mockResolvedValueOnce({ score: 0.2, reasoning: 'bad match', cost: 0 }) // e2 agree
      .mockRejectedValueOnce(new Error('provider exploded')) // e3 -- thrown, must be excluded
      .mockResolvedValueOnce({ score: 0.9, reasoning: 'good', cost: 0 }) // e4 agree
      .mockResolvedValueOnce({ score: 0.4, reasoning: 'good', cost: 0 }); // e5 agree

    await service.runCalibration({
      goldenSetId: 'gs1',
      judgeEvaluator: 'factuality',
      organizationId: 'org-1',
      triggeredBy: 'user-1',
    });

    const call = goldenSetsRepo.createCalibrationRun.mock.calls[0][0];
    expect(call.sampleCount).toBe(4);
    expect(call.disagreements.excludedCount).toBe(1);
    expect(call.disagreements.excludedExamples[0].exampleId).toBe('e3');
  });

  it('stores a generic, non-leaking reason (not the raw error message) when scoreExample throws, and logs the real error server-side', async () => {
    goldenSetsRepo.listExamples.mockResolvedValue(fiveExamplesIncludingOneBad());
    const loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const rawError = new Error('secret internal detail: api key sk-XXXX rejected by provider.internal.example.com');
    evaluators.evaluateFactuality
      .mockResolvedValueOnce({ score: 0.9, reasoning: 'good', cost: 0 }) // e1 agree
      .mockResolvedValueOnce({ score: 0.2, reasoning: 'bad match', cost: 0 }) // e2 agree
      .mockRejectedValueOnce(rawError) // e3 -- thrown, must be excluded
      .mockResolvedValueOnce({ score: 0.9, reasoning: 'good', cost: 0 }) // e4 agree
      .mockResolvedValueOnce({ score: 0.4, reasoning: 'good', cost: 0 }); // e5 agree

    await service.runCalibration({
      goldenSetId: 'gs1',
      judgeEvaluator: 'factuality',
      organizationId: 'org-1',
      triggeredBy: 'user-1',
    });

    const call = goldenSetsRepo.createCalibrationRun.mock.calls[0][0];
    const excludedExample = call.disagreements.excludedExamples[0];
    expect(excludedExample.exampleId).toBe('e3');
    expect(excludedExample.reason).toBe('Judge call failed unexpectedly');
    expect(excludedExample.reason).not.toContain('secret internal detail');
    expect(excludedExample.reason).not.toContain('sk-XXXX');
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('e3'),
      rawError,
    );

    loggerErrorSpy.mockRestore();
  });

  it('rejects a judgeThreshold below 0', async () => {
    goldenSetsRepo.listExamples.mockResolvedValue(threeExamplesIncludingOneBad());

    await expect(
      service.runCalibration({
        goldenSetId: 'gs1',
        judgeEvaluator: 'factuality',
        judgeThreshold: -0.1,
        organizationId: 'org-1',
        triggeredBy: 'user-1',
      }),
    ).rejects.toThrow(/judgeThreshold/i);
    expect(goldenSetsRepo.createCalibrationRun).not.toHaveBeenCalled();
  });

  it('rejects a judgeThreshold above 1', async () => {
    goldenSetsRepo.listExamples.mockResolvedValue(threeExamplesIncludingOneBad());

    await expect(
      service.runCalibration({
        goldenSetId: 'gs1',
        judgeEvaluator: 'factuality',
        judgeThreshold: 1.1,
        organizationId: 'org-1',
        triggeredBy: 'user-1',
      }),
    ).rejects.toThrow(/judgeThreshold/i);
    expect(goldenSetsRepo.createCalibrationRun).not.toHaveBeenCalled();
  });

  it('throws instead of persisting a fabricated kappa when the ONLY bad-labeled example is excluded as a likely swallowed failure, leaving zero negative-class discernment evidence', async () => {
    // Only e1 is a bad/negative-class example (humanLabel:false). It comes
    // back with the swallowed-failure signature and is excluded. The 5
    // surviving examples are all humanLabel:true and all agree with the
    // judge (judge score >= threshold) -- pe would degenerate to 1, and
    // without a class-diversity guard computeCohensKappa's pe===1 branch
    // fabricates kappa:1 from pure single-class agreement, not real judge
    // discernment against any bad example.
    goldenSetsRepo.listExamples.mockResolvedValue([
      makeExample({ id: 'e1', humanLabel: false, isBadExample: true }),
      makeExample({ id: 'e2', humanLabel: true, isBadExample: false }),
      makeExample({ id: 'e3', humanLabel: true, isBadExample: false }),
      makeExample({ id: 'e4', humanLabel: true, isBadExample: false }),
      makeExample({ id: 'e5', humanLabel: true, isBadExample: false }),
      makeExample({ id: 'e6', humanLabel: true, isBadExample: false }),
    ]);
    evaluators.evaluateFactuality
      .mockResolvedValueOnce({ score: 0, cost: 0 }) // e1 -- swallowed-failure signature, excluded (the ONLY bad example)
      .mockResolvedValueOnce({ score: 0.9, reasoning: 'good', cost: 0 }) // e2 agree
      .mockResolvedValueOnce({ score: 0.9, reasoning: 'good', cost: 0 }) // e3 agree
      .mockResolvedValueOnce({ score: 0.9, reasoning: 'good', cost: 0 }) // e4 agree
      .mockResolvedValueOnce({ score: 0.9, reasoning: 'good', cost: 0 }) // e5 agree
      .mockResolvedValueOnce({ score: 0.9, reasoning: 'good', cost: 0 }); // e6 agree

    await expect(
      service.runCalibration({
        goldenSetId: 'gs1',
        judgeEvaluator: 'factuality',
        organizationId: 'org-1',
        triggeredBy: 'user-1',
      }),
    ).rejects.toThrow(/at least one good-labeled and one bad-labeled example with a valid judge score/i);
    expect(goldenSetsRepo.createCalibrationRun).not.toHaveBeenCalled();
  });

  it('throws instead of persisting a fabricated kappa when the ONLY good-labeled example is excluded as a likely swallowed failure, leaving zero positive-class discernment evidence', async () => {
    // Only e1 is a good/positive-class example (humanLabel:true). It comes
    // back with the swallowed-failure signature and is excluded. The 5
    // surviving examples are all humanLabel:false (bad examples) and all
    // agree with the judge (judge score < threshold) -- pe would degenerate
    // to 1, and without a class-diversity guard on BOTH classes,
    // computeCohensKappa's pe===1 branch fabricates kappa:1 from pure
    // single-class agreement, not real judge discernment against any good
    // example.
    goldenSetsRepo.listExamples.mockResolvedValue([
      makeExample({ id: 'e1', humanLabel: true, isBadExample: false }),
      makeExample({ id: 'e2', humanLabel: false, isBadExample: true }),
      makeExample({ id: 'e3', humanLabel: false, isBadExample: true }),
      makeExample({ id: 'e4', humanLabel: false, isBadExample: true }),
      makeExample({ id: 'e5', humanLabel: false, isBadExample: true }),
      makeExample({ id: 'e6', humanLabel: false, isBadExample: true }),
    ]);
    evaluators.evaluateFactuality
      .mockResolvedValueOnce({ score: 0, cost: 0 }) // e1 -- swallowed-failure signature, excluded (the ONLY good example)
      .mockResolvedValueOnce({ score: 0.1, reasoning: 'bad match', cost: 0 }) // e2 agree
      .mockResolvedValueOnce({ score: 0.1, reasoning: 'bad match', cost: 0 }) // e3 agree
      .mockResolvedValueOnce({ score: 0.1, reasoning: 'bad match', cost: 0 }) // e4 agree
      .mockResolvedValueOnce({ score: 0.1, reasoning: 'bad match', cost: 0 }) // e5 agree
      .mockResolvedValueOnce({ score: 0.1, reasoning: 'bad match', cost: 0 }); // e6 agree

    await expect(
      service.runCalibration({
        goldenSetId: 'gs1',
        judgeEvaluator: 'factuality',
        organizationId: 'org-1',
        triggeredBy: 'user-1',
      }),
    ).rejects.toThrow(/at least one good-labeled and one bad-labeled example with a valid judge score/i);
    expect(goldenSetsRepo.createCalibrationRun).not.toHaveBeenCalled();
  });

  it('excludes a faithfulness example missing context BEFORE calling the judge, keeping others scored', async () => {
    goldenSetsRepo.listExamples.mockResolvedValue([
      makeExample({ id: 'e1', humanLabel: true, isBadExample: false, context: ['ctx'] }),
      makeExample({ id: 'e2', humanLabel: false, isBadExample: true, context: ['ctx'] }),
      makeExample({ id: 'e3', humanLabel: true, isBadExample: false, context: null }), // missing context -> excluded pre-dispatch
      makeExample({ id: 'e4', humanLabel: true, isBadExample: false, context: [] }), // empty context -> excluded pre-dispatch
      makeExample({ id: 'e5', humanLabel: false, isBadExample: false, context: ['ctx'] }),
    ]);
    evaluators.evaluateFaithfulness.mockResolvedValue({ score: 0.9, reasoning: 'faithful', cost: 0 });

    await service.runCalibration({
      goldenSetId: 'gs1',
      judgeEvaluator: 'faithfulness',
      organizationId: 'org-1',
      triggeredBy: 'user-1',
    });

    // Only e1, e2, e5 (real context) ever reach the evaluator — e3/e4 are
    // excluded before dispatch, never fabricated as score:1.
    expect(evaluators.evaluateFaithfulness).toHaveBeenCalledTimes(3);
    const call = goldenSetsRepo.createCalibrationRun.mock.calls[0][0];
    expect(call.sampleCount).toBe(3);
    expect(call.disagreements.excludedCount).toBe(2);
    expect(call.disagreements.excludedExamples).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          exampleId: 'e3',
          reason: expect.stringMatching(/faithfulness.*context/i),
        }),
        expect.objectContaining({
          exampleId: 'e4',
          reason: expect.stringMatching(/faithfulness.*context/i),
        }),
      ]),
    );
  });

  it('excludes an answer_correctness example missing expected BEFORE calling the judge, keeping others scored', async () => {
    goldenSetsRepo.listExamples.mockResolvedValue([
      makeExample({ id: 'e1', humanLabel: true, isBadExample: false, expected: 'exp' }),
      makeExample({ id: 'e2', humanLabel: false, isBadExample: true, expected: 'exp' }),
      makeExample({ id: 'e3', humanLabel: true, isBadExample: false, expected: null }), // missing -> excluded pre-dispatch
      makeExample({ id: 'e4', humanLabel: true, isBadExample: false, expected: '' }), // empty string -> excluded pre-dispatch
      makeExample({ id: 'e5', humanLabel: false, isBadExample: false, expected: 'exp' }),
    ]);
    evaluators.evaluateAnswerCorrectness.mockResolvedValue({ score: 0.9, reasoning: 'correct', cost: 0 });

    await service.runCalibration({
      goldenSetId: 'gs1',
      judgeEvaluator: 'answer_correctness',
      organizationId: 'org-1',
      triggeredBy: 'user-1',
    });

    // Only e1, e2, e5 (real expected value) ever reach the evaluator — e3/e4
    // are excluded before dispatch, never fabricated as score:0.5.
    expect(evaluators.evaluateAnswerCorrectness).toHaveBeenCalledTimes(3);
    const call = goldenSetsRepo.createCalibrationRun.mock.calls[0][0];
    expect(call.sampleCount).toBe(3);
    expect(call.disagreements.excludedCount).toBe(2);
    expect(call.disagreements.excludedExamples).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          exampleId: 'e3',
          reason: expect.stringMatching(/answer_correctness.*expected/i),
        }),
        expect.objectContaining({
          exampleId: 'e4',
          reason: expect.stringMatching(/answer_correctness.*expected/i),
        }),
      ]),
    );
  });

  it('does NOT exclude a pii_detection example with a legitimate clean (score:0, no reasoning) result', async () => {
    goldenSetsRepo.listExamples.mockResolvedValue(fiveExamplesIncludingOneBad());
    evaluators.evaluatePIIDetection
      .mockResolvedValueOnce({ score: 0, cost: 0 }) // e1 -- legit clean fast-path, human=true
      .mockResolvedValueOnce({ score: 0.9, reasoning: 'pii found', cost: 0 }) // e2 human=false
      .mockResolvedValueOnce({ score: 0, cost: 0 }) // e3 -- legit clean fast-path, human=true
      .mockResolvedValueOnce({ score: 0, cost: 0 }) // e4 -- legit clean fast-path, human=true
      .mockResolvedValueOnce({ score: 0.9, reasoning: 'pii found', cost: 0 }); // e5 human=false

    await service.runCalibration({
      goldenSetId: 'gs1',
      judgeEvaluator: 'pii_detection',
      judgeThreshold: 0.5,
      organizationId: 'org-1',
      triggeredBy: 'user-1',
    });

    const call = goldenSetsRepo.createCalibrationRun.mock.calls[0][0];
    // All 5 examples count as real data points -- score:0/no-reasoning is
    // never treated as a swallowed failure for pii_detection.
    expect(call.sampleCount).toBe(5);
    expect(call.disagreements.excludedCount).toBe(0);
  });

  it('sets isCalibrated:false whenever isReliable:false, even if raw kappa would be >= 0.8', async () => {
    goldenSetsRepo.listExamples.mockResolvedValue(threeExamplesIncludingOneBad());
    // All 3 examples agree perfectly with human labels -> kappa would compute to 1.0,
    // but sampleCount (3) < MIN_RELIABLE_SAMPLES (5) -> isReliable:false.
    evaluators.evaluateFactuality
      .mockResolvedValueOnce({ score: 0.9, reasoning: 'good', cost: 0 }) // e1 human=true
      .mockResolvedValueOnce({ score: 0.1, reasoning: 'bad', cost: 0 }) // e2 human=false
      .mockResolvedValueOnce({ score: 0.9, reasoning: 'good', cost: 0 }); // e3 human=true

    await service.runCalibration({
      goldenSetId: 'gs1',
      judgeEvaluator: 'factuality',
      organizationId: 'org-1',
      triggeredBy: 'user-1',
    });

    const call = goldenSetsRepo.createCalibrationRun.mock.calls[0][0];
    expect(call.isReliable).toBe(false);
    expect(call.isCalibrated).toBe(false);
  });
});

describe('CalibrationService.runCalibration — scoreExample dispatch (Task 5.3 arms)', () => {
  let service: CalibrationService;
  let goldenSetsRepo: {
    listExamples: jest.Mock;
    createCalibrationRun: jest.Mock;
  };
  let evaluators: Record<string, jest.Mock>;
  const dispatchExample = makeExample({
    id: 'e1',
    input: 'the input question',
    output: 'the output text',
    expected: 'the expected answer',
    context: ['ctx-a', 'ctx-b'],
    // humanLabel:false matches this file's isBadExample:true convention
    // (see threeExamplesIncludingOneBad/fiveExamplesIncludingOneBad) so this
    // fixture satisfies the negative-class survival check in
    // CalibrationService — these tests only assert dispatch call args, not
    // calibration-outcome shape.
    humanLabel: false,
    isBadExample: true,
  });
  // The class-diversity guard now requires BOTH a good-labeled and a
  // bad-labeled example to survive — add a second, good-labeled example so
  // these dispatch-only tests keep exercising a single scoreExample() call
  // per assertion via toHaveBeenCalledWith while still satisfying the guard.
  const dispatchExampleGood = makeExample({
    id: 'e2',
    input: 'the input question',
    output: 'the output text',
    expected: 'the expected answer',
    context: ['ctx-a', 'ctx-b'],
    humanLabel: true,
    isBadExample: false,
  });

  beforeEach(async () => {
    goldenSetsRepo = {
      listExamples: jest.fn().mockResolvedValue([dispatchExample, dispatchExampleGood]),
      createCalibrationRun: jest.fn().mockImplementation((data) => Promise.resolve({ id: 'run-1', ...data })),
    };
    evaluators = {
      evaluateLLMAsJudge: jest.fn(),
      evaluateBattle: jest.fn().mockResolvedValue({ score: 0.9, reasoning: 'r', cost: 0 }),
      evaluateFactuality: jest.fn(),
      evaluateSecurity: jest.fn(),
      evaluateAnswerRelevancy: jest.fn(),
      evaluateContextPrecision: jest.fn().mockResolvedValue({ score: 0.9, reasoning: 'r', cost: 0 }),
      evaluateContextRecall: jest.fn().mockResolvedValue({ score: 0.9, reasoning: 'r', cost: 0 }),
      evaluateContextRelevancy: jest.fn().mockResolvedValue({ score: 0.9, reasoning: 'r', cost: 0 }),
      evaluateFaithfulness: jest.fn(),
      evaluateAnswerCorrectness: jest.fn(),
      evaluatePIIDetection: jest.fn().mockResolvedValue({ score: 0.9, reasoning: 'r', cost: 0 }),
      evaluateJailbreakDetection: jest.fn().mockResolvedValue({ score: 0.9, reasoning: 'r', cost: 0 }),
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

  it('dispatches "battle" to evaluateBattle(response, expected, config, seed, organizationId)', async () => {
    await service.runCalibration({
      goldenSetId: 'gs1', judgeEvaluator: 'battle', judgeConfig: { foo: 'bar' },
      organizationId: 'org-1', triggeredBy: 'user-1',
    });

    expect(evaluators.evaluateBattle).toHaveBeenCalledWith(
      'the output text', 'the expected answer', { foo: 'bar' }, 1, 'org-1',
    );
  });

  it('dispatches "context_precision" to evaluateContextPrecision(response, query, contexts, config, seed, organizationId)', async () => {
    await service.runCalibration({
      goldenSetId: 'gs1', judgeEvaluator: 'context_precision', judgeConfig: { foo: 'bar' },
      organizationId: 'org-1', triggeredBy: 'user-1',
    });

    expect(evaluators.evaluateContextPrecision).toHaveBeenCalledWith(
      'the output text', 'the input question', ['ctx-a', 'ctx-b'], { foo: 'bar' }, 1, 'org-1',
    );
  });

  it('dispatches "context_recall" to evaluateContextRecall(expectedAnswer, contexts, config, seed, organizationId)', async () => {
    await service.runCalibration({
      goldenSetId: 'gs1', judgeEvaluator: 'context_recall', judgeConfig: { foo: 'bar' },
      organizationId: 'org-1', triggeredBy: 'user-1',
    });

    expect(evaluators.evaluateContextRecall).toHaveBeenCalledWith(
      'the expected answer', ['ctx-a', 'ctx-b'], { foo: 'bar' }, 1, 'org-1',
    );
  });

  it('dispatches "context_relevancy" to evaluateContextRelevancy(query, contexts, config, seed, organizationId)', async () => {
    await service.runCalibration({
      goldenSetId: 'gs1', judgeEvaluator: 'context_relevancy', judgeConfig: { foo: 'bar' },
      organizationId: 'org-1', triggeredBy: 'user-1',
    });

    expect(evaluators.evaluateContextRelevancy).toHaveBeenCalledWith(
      'the input question', ['ctx-a', 'ctx-b'], { foo: 'bar' }, 1, 'org-1',
    );
  });

  it('dispatches "pii_detection" to evaluatePIIDetection(response, config, seed, organizationId)', async () => {
    await service.runCalibration({
      goldenSetId: 'gs1', judgeEvaluator: 'pii_detection', judgeConfig: { foo: 'bar' },
      organizationId: 'org-1', triggeredBy: 'user-1',
    });

    expect(evaluators.evaluatePIIDetection).toHaveBeenCalledWith(
      'the output text', { foo: 'bar' }, 1, 'org-1',
    );
  });

  it('dispatches "jailbreak_detection" to evaluateJailbreakDetection(input, response, config, seed, organizationId)', async () => {
    await service.runCalibration({
      goldenSetId: 'gs1', judgeEvaluator: 'jailbreak_detection', judgeConfig: { foo: 'bar' },
      organizationId: 'org-1', triggeredBy: 'user-1',
    });

    expect(evaluators.evaluateJailbreakDetection).toHaveBeenCalledWith(
      'the input question', 'the output text', { foo: 'bar' }, 1, 'org-1',
    );
  });
});
