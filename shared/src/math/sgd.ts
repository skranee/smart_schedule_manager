import { dotProduct, scaleVector, sigmoid } from './logistic.js';

export interface SgdHyperParams {
  learningRate: number;
  regularization: number;
}

export function ensureWeightsLength(weights: number[], features: number[]): number[] {
  if (weights.length === features.length) {
    return weights;
  }
  if (weights.length === 0) {
    return Array.from({ length: features.length }, () => 0);
  }
  if (weights.length < features.length) {
    const pad = Array.from({ length: features.length - weights.length }, () => 0);
    return [...weights, ...pad];
  }
  return weights.slice(0, features.length);
}

export interface SgdStepOptions {
  maskHardConstraints?: boolean;
}

/**
 * Шаг SGD с опциональным маскированием жёстких признаков (x7, x8, x9).
 * 
 * Если пользователь намеренно нарушил маску сна/питания/уроков,
 * обнуляем x7, x8, x9 ПЕРЕД шагом SGD (жёсткие правила сохраняем).
 * x11, x12 НЕ маскируем (мягкие предпочтения, обучаем).
 */
export function logisticSgdStep(
  weights: number[],
  features: number[],
  label: 0 | 1,
  params: SgdHyperParams,
  options?: SgdStepOptions
): number[] {
  const adjustedWeights = ensureWeightsLength(weights, features);
  let effectiveFeatures = [...features];
  
  // Маскирование жёстких признаков x7 (meal), x8 (school), x9 (sleep)
  // Индексы: x7 = features[6], x8 = features[7], x9 = features[8]
  if (options?.maskHardConstraints) {
    effectiveFeatures[6] = 0; // x7: meal_conflict
    effectiveFeatures[7] = 0; // x8: school_conflict
    effectiveFeatures[8] = 0; // x9: sleep_conflict
  }
  
  const prediction = sigmoid(dotProduct(adjustedWeights, effectiveFeatures));
  const error = prediction - label;
  const gradient = effectiveFeatures.map(
    (value, index) => error * value + params.regularization * adjustedWeights[index]
  );
  const update = scaleVector(gradient, params.learningRate);
  return adjustedWeights.map((value, index) => value - update[index]);
}

export function logisticScore(weights: number[], features: number[]): number {
  const adjustedWeights = ensureWeightsLength(weights, features);
  return dotProduct(adjustedWeights, features);
}

