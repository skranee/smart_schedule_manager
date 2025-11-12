import axios from 'axios';
import { TASK_CATEGORIES } from '@shared/constants.js';
import type { LocaleCode, TaskCategory } from '@shared/types.js';
import type { AIProvider, CategorizeResult, ExplainResult } from './types.js';
import { categorizeWithHeuristics, refineCategoryPrediction } from './categoryMapping.js';
import { env } from '../config/env.js';

const CLASSIFIER_MODEL = 'facebook/bart-large-mnli';
const REASONING_MODEL = 'Qwen/Qwen2-7B-Instruct';

function getAuthHeaders() {
  if (!env.huggingFaceApiKey) return {};
  return {
    Authorization: `Bearer ${env.huggingFaceApiKey}`
  };
}

export class HuggingFaceProvider implements AIProvider {
  private readonly http = axios.create({
    baseURL: env.huggingFaceEndpoint,
    timeout: 8_000,
    headers: {
      ...getAuthHeaders()
    }
  });

  async categorize(task: { title: string; description?: string }): Promise<CategorizeResult> {
    const heuristic = categorizeWithHeuristics(task, { strongOnly: true });
    if (heuristic) {
      return {
        label: heuristic.label,
        confidence: heuristic.confidence,
        provider: 'heuristic-rule'
      };
    }

    const payload = {
      inputs: `${task.title}\n${task.description ?? ''}`,
      parameters: {
        candidate_labels: TASK_CATEGORIES,
        multi_label: false
      }
    };

    try {
      const response = await this.http.post(`/models/${CLASSIFIER_MODEL}`, payload);
      const data = Array.isArray(response.data) ? response.data[0] : response.data;
      const labels = (data?.labels ?? []) as string[];
      const scores = (data?.scores ?? []) as number[];

      let label = (labels[0] as TaskCategory) ?? 'Other';
      let confidence = scores[0] ?? 0;

      const refined = refineCategoryPrediction(task, label, confidence);
      label = refined.label;
      confidence = refined.confidence;

      const supplementalHeuristic = categorizeWithHeuristics(task);
      if (supplementalHeuristic) {
        if (supplementalHeuristic.label === label) {
          confidence = Math.max(confidence, supplementalHeuristic.confidence);
        } else if (supplementalHeuristic.confidence >= confidence + 0.1) {
          return {
            label: supplementalHeuristic.label,
            confidence: supplementalHeuristic.confidence,
            provider: `heuristic+${CLASSIFIER_MODEL}`
          };
        }
      }

      return {
        label,
        confidence,
        provider: CLASSIFIER_MODEL
      };
    } catch (error) {
      const fallback = categorizeWithHeuristics(task);
      if (fallback) {
        return {
          label: fallback.label,
          confidence: fallback.confidence,
          provider: 'heuristic-fallback'
        };
      }

      return {
        label: 'Other',
        confidence: 0,
        provider: CLASSIFIER_MODEL
      };
    }
  }

  async explain(input: {
    taskTitle: string;
    start: string;
    end: string;
    topFeatures: string[];
    locale: LocaleCode;
  }): Promise<ExplainResult> {
    const languageInstruction =
      input.locale === 'ru'
        ? 'Отвечай на русском языке дружелюбным и ободряющим тоном.'
        : 'Respond in English with a friendly, encouraging tone.';

    const featuresLine =
      input.topFeatures.length > 0
        ? `Important factors: ${input.topFeatures.join(', ')}.`
        : 'Important factors: keep the plan balanced.';

    const prompt = [
      'You are an assistant that explains a smart personal timetable to a young student.',
      languageInstruction,
      `Task: ${input.taskTitle}.`,
      `Scheduled between ${input.start} and ${input.end}.`,
      featuresLine,
      'Explain in two or three short sentences why this slot works.',
      'Avoid mentioning raw numbers or model weights.'
    ].join('\n');

    const response = await this.http.post(`/models/${REASONING_MODEL}`, {
      inputs: prompt,
      parameters: {
        max_new_tokens: 80,
        temperature: 0.4
      }
    });

    const text = Array.isArray(response.data)
      ? response.data[0]?.generated_text ?? ''
      : response.data.generated_text ?? '';

    return {
      text: text.trim(),
      provider: REASONING_MODEL
    };
  }
}

