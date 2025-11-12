import {
  FEATURE_KEYS,
  INITIAL_LEARNING_RATE,
  INITIAL_REGULARIZATION,
  MODEL_VERSION,
  buildDefaultWeights,
  logisticSgdStep
} from '@shared/index.js';
import type { UserDocument } from '../models/index.js';
import { FeedbackModel } from '../models/index.js';

interface EnsureWeightsResult {
  weights: number[];
  updated: boolean;
}

export function ensureUserWeights(user: UserDocument): EnsureWeightsResult {
  const profile = (user as any).profile ?? 'adult';
  const defaults = buildDefaultWeights(profile);
  const state = (user as any).model as
    | { weights?: number[]; updatedAt?: Date; version?: number }
    | undefined;

  if (!state || !Array.isArray(state.weights) || state.weights.length === 0) {
    const weights = defaults.slice();
    (user as any).model = {
      weights,
      updatedAt: new Date(),
      version: MODEL_VERSION
    };
    return { weights, updated: true };
  }

  const needsMigration =
    state.version !== MODEL_VERSION || state.weights.length !== defaults.length;

  if (needsMigration) {
    const merged = defaults.slice();
    const limit = Math.min(state.weights.length, merged.length);
    for (let i = 0; i < limit; i += 1) {
      merged[i] = state.weights[i];
    }
    (user as any).model = {
      weights: merged,
      updatedAt: new Date(),
      version: MODEL_VERSION
    };
    return { weights: merged, updated: true };
  }

  return { weights: state.weights.slice(0, defaults.length), updated: false };
}

export async function applyFeedbackUpdates(
  user: UserDocument,
  feedbacks: { features: number[]; label: 0 | 1 }[],
  options?: { learningRate?: number; regularization?: number },
): Promise<UserDocument> {
  const learningRate = options?.learningRate ?? INITIAL_LEARNING_RATE;
  const regularization = options?.regularization ?? INITIAL_REGULARIZATION;

  const { weights: initialWeights } = ensureUserWeights(user);
  const totalFeedbacks = await FeedbackModel.countDocuments({ userId: user._id });

  if (totalFeedbacks < 20) {
    return user;
  }

  let weights = initialWeights.slice();
  const hardRuleIndexes = [
    FEATURE_KEYS.indexOf('meal_conflict'),
    FEATURE_KEYS.indexOf('school_conflict'),
    FEATURE_KEYS.indexOf('sleep_conflict')
  ].filter((index) => index >= 0);

  for (const entry of feedbacks) {
    const vector = entry.features.slice(0, weights.length);
    if (entry.label === 1) {
      for (const index of hardRuleIndexes) {
        if (vector[index] < 0) {
          vector[index] = 0;
        }
      }
    }
    weights = logisticSgdStep(weights, vector, entry.label, {
      learningRate,
      regularization
    });
  }

  (user as any).model = {
    weights,
    updatedAt: new Date(),
    version: MODEL_VERSION
  };
  await user.save();
  return user;
}

