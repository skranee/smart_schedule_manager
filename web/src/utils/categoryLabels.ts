import { TASK_CATEGORY_I18N_KEYS } from '@shared/constants';
import type { TaskCategory } from '@shared/types';

export const CATEGORY_I18N_KEYS = TASK_CATEGORY_I18N_KEYS;

export function getCategoryI18nKey(category: TaskCategory): string {
  return CATEGORY_I18N_KEYS[category] ?? CATEGORY_I18N_KEYS.Other;
}


