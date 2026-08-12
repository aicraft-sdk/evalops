import { computeCohensKappa } from './cohens-kappa';

describe('computeCohensKappa', () => {
  it('computes kappa for a known 10-example case (po=0.8, pe=0.52, kappa≈0.583)', () => {
    // human: 6 pass, 4 fail. judge: 6 pass, 4 fail (5 true-agree + the [false,true] pair = 6 judge-true). 8/10 agree.
    // pe = (humanTrue*judgeTrue + humanFalse*judgeFalse) / n^2 = (6*6 + 4*4) / 100 = 0.52
    // kappa = (po - pe) / (1 - pe) = (0.8 - 0.52) / (1 - 0.52) = 0.28 / 0.48 ≈ 0.5833
    const pairs = [
      [true, true], [true, true], [true, true], [true, true],
      [true, true], [true, false],           // human=pass(6): 5 agree, 1 disagree
      [false, false], [false, false], [false, false], // human=fail(4): agree x3
      [false, true],                          // 1 disagree
    ].map(([human, judge]) => ({ human, judge }));

    const result = computeCohensKappa(pairs);
    expect(result.agreementRate).toBeCloseTo(0.8, 5);
    expect(result.kappa).toBeCloseTo(0.583, 2);
  });

  it('returns kappa=1 for perfect agreement', () => {
    const pairs = [
      { human: true, judge: true }, { human: true, judge: true },
      { human: false, judge: false }, { human: false, judge: false },
    ];
    expect(computeCohensKappa(pairs).kappa).toBeCloseTo(1, 5);
    expect(computeCohensKappa(pairs).agreementRate).toBe(1);
  });

  it('returns a low/negative kappa for worse-than-chance agreement', () => {
    const pairs = [
      { human: true, judge: false }, { human: true, judge: false },
      { human: false, judge: true }, { human: false, judge: true },
    ];
    const result = computeCohensKappa(pairs);
    expect(result.agreementRate).toBe(0);
    expect(result.kappa).toBeLessThanOrEqual(0);
  });

  it('marks the result as statistically unreliable below 5 examples, but still returns raw agreement', () => {
    const pairs = [
      { human: true, judge: true }, { human: false, judge: true },
      { human: true, judge: false },
    ];
    const result = computeCohensKappa(pairs);
    expect(result.isReliable).toBe(false);
    expect(result.agreementRate).toBeCloseTo(1 / 3, 5);
  });

  it('throws on an empty input (no examples to score)', () => {
    expect(() => computeCohensKappa([])).toThrow();
  });
});
