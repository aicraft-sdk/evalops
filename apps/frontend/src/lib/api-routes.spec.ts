import { describe, it, expect } from 'vitest';
import { mapApiRoute } from './api-routes';

describe('mapApiRoute', () => {
  it('maps /api/golden-sets/:id/examples to the evaluation-service route', () => {
    expect(mapApiRoute('/api/golden-sets/gs1/examples')).toBe(
      '/api/evaluation/golden-sets/gs1/examples',
    );
  });

  it('maps /api/golden-sets/:id/calibration-runs to the evaluation-service route', () => {
    expect(mapApiRoute('/api/golden-sets/gs1/calibration-runs')).toBe(
      '/api/evaluation/golden-sets/gs1/calibration-runs',
    );
  });

  it('maps the bare /api/golden-sets list route to the evaluation-service route', () => {
    expect(mapApiRoute('/api/golden-sets')).toBe('/api/evaluation/golden-sets');
  });
});
