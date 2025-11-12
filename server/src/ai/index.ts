import { env } from '../config/env.js';
import { HuggingFaceProvider } from './huggingFace.js';
import { MockProvider } from './mock.js';
import type { AIProvider } from './types.js';

let cachedProvider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (cachedProvider) return cachedProvider;

  if (env.huggingFaceApiKey) {
    cachedProvider = new HuggingFaceProvider();
  } else {
    cachedProvider = new MockProvider();
  }
  return cachedProvider;
}

export type { AIProvider } from './types.js';

