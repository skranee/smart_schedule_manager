import { describe, it, expect } from 'vitest';
import { logisticScore, logisticSgdStep } from '../src/math/sgd.js';

describe('logistic regression helpers', () => {
  it('computes logistic score as dot product', () => {
    const weights = [0.5, -0.25, 0.1];
    const features = [2, 1, -4];
    const score = logisticScore(weights, features);
    expect(score).toBeCloseTo(0.5 * 2 - 0.25 * 1 + 0.1 * -4);
  });

  it('performs SGD step moving prediction toward label', () => {
    const weights = [0.1, 0.1];
    const features = [1, 1];
    const updated = logisticSgdStep(weights, features, 1, {
      learningRate: 0.05,
      regularization: 0
    });
    expect(updated[0]).toBeGreaterThan(weights[0]);
    expect(updated[1]).toBeGreaterThan(weights[1]);
  });
});

