import { TASK_CATEGORIES } from '@shared/constants.js';
import type { LocaleCode } from '@shared/types.js';
import type { AIProvider, CategorizeResult, ExplainResult } from './types.js';
import { categorizeWithHeuristics } from './categoryMapping.js';
import { translateFeatureSummary } from './featureTranslations.js';

const DEFAULT_PROVIDER = 'mock';
const DEFAULT_REASON: Record<LocaleCode, string> = {
  ru: 'сохранить сбалансированный день'
};

export class MockProvider implements AIProvider {
  async categorize(task: { title: string; description?: string }): Promise<CategorizeResult> {
    const heuristic = categorizeWithHeuristics(task);
    if (heuristic) {
      return {
        label: heuristic.label,
        confidence: heuristic.confidence,
        provider: 'heuristic-mock'
      };
    }

    const seed = (task.title + (task.description ?? '')).length;
    const index = seed % TASK_CATEGORIES.length;
    return {
      label: TASK_CATEGORIES[index],
      confidence: 0.3,
      provider: DEFAULT_PROVIDER
    };
  }

  async explain(input: {
    taskTitle: string;
    start: string;
    end: string;
    topFeatures: string[];
    locale: LocaleCode;
  }): Promise<ExplainResult> {
    const significantFeatures = input.topFeatures.filter(Boolean).slice(0, 2);
    const localizedFeatures = significantFeatures.map((feature) =>
      translateFeatureSummary(feature, input.locale),
    );

    const reason =
      localizedFeatures.length > 0
        ? localizedFeatures.join(input.locale === 'ru' ? ' и ' : ' and ')
        : DEFAULT_REASON[input.locale];

    if (input.locale === 'ru') {
      // reason уже должен быть грамматически корректен благодаря исправленным переводам
      return {
        text: `Мы запланировали «${input.taskTitle}» на ${input.start} — ${input.end}, чтобы ${reason}.`,
        provider: DEFAULT_PROVIDER
      };
    }

    return {
      text: `Placed ${input.taskTitle} between ${input.start} and ${input.end} to ${reason}.`,
      provider: DEFAULT_PROVIDER
    };
  }
}

