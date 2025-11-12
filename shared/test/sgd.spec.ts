/**
 * Unit-тесты для SGD с маскированием жёстких признаков
 */

import { describe, it, expect } from 'vitest';
import { logisticSgdStep, logisticScore } from '../src/math/sgd.js';

describe('SGD с маскированием', () => {
  const params = {
    learningRate: 0.05,
    regularization: 0.001
  };

  it('SGD без маскирования обновляет все веса', () => {
    const weights = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    const features = [0.8, 0.6, 0.7, -0.3, -0.2, 0.4, -0.9, -1.0, -1.2, 0.4, -0.7, -0.8];
    const label: 0 | 1 = 1;

    const newWeights = logisticSgdStep(weights, features, label, params);

    expect(newWeights).toHaveLength(12);
    expect(newWeights).not.toEqual(weights);
  });

  it('SGD с маскированием обнуляет x7, x8, x9', () => {
    const weights = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    const features = [0.8, 0.6, 0.7, -0.3, -0.2, 0.4, -0.9, -1.0, -1.2, 0.4, -0.7, -0.8];
    const label: 0 | 1 = 1;

    const newWeights = logisticSgdStep(weights, features, label, params, {
      maskHardConstraints: true
    });

    expect(newWeights).toHaveLength(12);
    
    // Веса x7, x8, x9 (индексы 6, 7, 8) НЕ должны измениться значительно,
    // т.к. соответствующие признаки были обнулены
    // (регуляризация всё равно чуть изменит веса)
    const delta6 = Math.abs(newWeights[6] - weights[6]);
    const delta7 = Math.abs(newWeights[7] - weights[7]);
    const delta8 = Math.abs(newWeights[8] - weights[8]);
    
    // Изменения должны быть минимальными (только от регуляризации)
    expect(delta6).toBeLessThan(0.01);
    expect(delta7).toBeLessThan(0.01);
    expect(delta8).toBeLessThan(0.01);
  });

  it('SGD с маскированием НЕ влияет на x11, x12', () => {
    const weights = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.7, -0.8];
    const features = [0.8, 0.6, 0.7, -0.3, -0.2, 0.4, -0.9, -1.0, -1.2, 0.4, -1.0, -1.0];
    const label: 0 | 1 = 1;

    const newWeights = logisticSgdStep(weights, features, label, params, {
      maskHardConstraints: true
    });

    // x11 и x12 (индексы 10, 11) должны измениться (мягкие предпочтения)
    const delta10 = Math.abs(newWeights[10] - weights[10]);
    const delta11 = Math.abs(newWeights[11] - weights[11]);
    
    // Изменения должны быть заметными (> 0.001), но не обязательно > 0.01
    expect(delta10).toBeGreaterThan(0.001);
    expect(delta11).toBeGreaterThan(0.001);
  });

  it('logisticScore вычисляет скалярное произведение', () => {
    const weights = [0.55, 0.5, 0.55, -0.25, -0.2, 0.35, -0.9, 0, -1.2, 0.15, 0, 0];
    const features = [1, 0.5, 0.7, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    const score = logisticScore(weights, features);
    
    // 0.55*1 + 0.5*0.5 + 0.55*0.7 = 0.55 + 0.25 + 0.385 = 1.185
    expect(score).toBeCloseTo(1.185, 2);
  });
});

