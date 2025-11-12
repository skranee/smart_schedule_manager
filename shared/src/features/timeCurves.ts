/**
 * Циркадные предпочтения по категориям (окончательная математическая модель).
 * Все категории на русском. Строго соответствует спецификации.
 */

import type { TaskCategory } from '../types.js';

export interface CircadianContext {
  category: TaskCategory;
  hour: number;
  isHomework?: boolean;
  isMealTask?: boolean;
  inOwnMealWindow?: boolean;
  isGamesTask?: boolean;
}

/**
 * Вычисляет циркадное предпочтение (x1) для категории в заданный час.
 * Возвращает значение в диапазоне [-1, 1].
 */
export function circadianPreference(context: CircadianContext): number {
  const { category, hour, isHomework, isMealTask, inOwnMealWindow, isGamesTask } = context;

  // Питание
  if (isMealTask) {
    return inOwnMealWindow ? 1 : -1;
  }

  // Учёба/Домашнее задание
  if (category === 'Learning' && isHomework) {
    if (hour >= 16 && hour < 19.5) return 1;
    if (hour >= 19.5 && hour < 21) return 0.2;
    return -0.5;
  }

  // Отдых
  if (category === 'Relaxing') {
    if (hour >= 18 && hour < 21) return 1;
    if (hour >= 16 && hour < 18) return 0.5;
    if (hour < 10) return -0.5;
    return 0;
  }

  // Игры
  if (category === 'Games' || isGamesTask) {
    if (hour >= 17 && hour <= 20) return 1;
    if (hour >= 12 && hour < 17) return 0;
    if (hour < 12) return -1;
    return 0;
  }

  // Дела/Поручения
  if (category === 'Admin/Errands') {
    if (hour >= 12 && hour < 17) return 0.6;
    if (hour < 9) return -0.3;
    return 0;
  }

  // Спорт
  if (category === 'Sport activity') {
    if (hour >= 17 && hour < 20) return 1;
    if (hour >= 10 && hour < 17) return 0;
    return -0.5;
  }

  // Творчество
  if (category === 'Creative') {
    if (hour >= 18 && hour < 21) return 0.7;
    if (hour >= 14 && hour < 18) return 0.3;
    if (hour < 10) return -0.2;
    return 0;
  }

  // Прогулки на улице (Outdoor Play)
  if (category === 'Outdoor Play') {
    if (hour >= 16 && hour < 20) return 1;
    if (hour >= 10 && hour < 16) return 0.5;
    if (hour < 9) return -0.3;
    return 0;
  }

  // Общение (Social)
  if (category === 'Social') {
    if (hour >= 18 && hour < 22) return 0.8;
    if (hour >= 12 && hour < 18) return 0.4;
    if (hour < 10) return -0.2;
    return 0;
  }

  // Глубокая работа (Deep work)
  if (category === 'Deep work') {
    if (hour >= 9 && hour < 12) return 1;
    if (hour >= 14 && hour < 17) return 0.7;
    if (hour < 9) return 0.3;
    if (hour >= 19) return -0.5;
    return 0;
  }

  // Домашние дела (Household)
  if (category === 'Household') {
    if (hour >= 9 && hour < 12) return 0.6;
    if (hour >= 17 && hour < 20) return 0.5;
    if (hour < 8) return -0.4;
    return 0;
  }

  // Дорога (Commute)
  if (category === 'Commute') {
    if (hour >= 7 && hour < 9) return 0.8;
    if (hour >= 17 && hour < 19) return 0.7;
    return 0;
  }

  // Здоровье и уход (Healthcare)
  if (category === 'Healthcare') {
    if (hour >= 9 && hour < 12) return 0.7;
    if (hour >= 14 && hour < 17) return 0.6;
    return 0;
  }

  // По умолчанию (Other и прочие)
  return 0;
}

