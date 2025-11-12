import type { LocaleCode, TaskCategory } from '@shared/types.js';

export interface CategorizeResult {
  label: TaskCategory;
  confidence: number;
  provider: string;
}

export interface ExplainResult {
  text: string;
  provider: string;
}

export interface AIProvider {
  categorize(task: { title: string; description?: string }): Promise<CategorizeResult>;
  explain(input: {
    taskTitle: string;
    start: string;
    end: string;
    topFeatures: string[];
    locale: LocaleCode;
  }): Promise<ExplainResult>;
}

