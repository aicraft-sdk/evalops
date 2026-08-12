export interface LabelPair {
  human: boolean;
  judge: boolean;
}

export interface CohensKappaResult {
  agreementRate: number;
  kappa: number | null;
  isReliable: boolean;
  sampleCount: number;
}

const MIN_RELIABLE_SAMPLES = 5;

export function computeCohensKappa(pairs: LabelPair[]): CohensKappaResult {
  if (pairs.length === 0) {
    throw new Error('computeCohensKappa requires at least one labeled pair');
  }

  const n = pairs.length;
  const agree = pairs.filter((p) => p.human === p.judge).length;
  const agreementRate = agree / n;

  const humanTrue = pairs.filter((p) => p.human).length;
  const humanFalse = n - humanTrue;
  const judgeTrue = pairs.filter((p) => p.judge).length;
  const judgeFalse = n - judgeTrue;

  const pe = (humanTrue * judgeTrue + humanFalse * judgeFalse) / (n * n);
  const denom = 1 - pe;
  // pe=1 only occurs when BOTH marginals are 100% one class in the same
  // direction — mathematically possible even with human-label variance
  // guarded against upstream (>=1 bad example), so this guard stays defensive.
  const kappa = denom === 0 ? (agreementRate === 1 ? 1 : null) : (agreementRate - pe) / denom;

  return {
    agreementRate,
    kappa,
    isReliable: n >= MIN_RELIABLE_SAMPLES,
    sampleCount: n,
  };
}
