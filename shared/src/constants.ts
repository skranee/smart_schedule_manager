import type { LocaleCode, MealType, TaskCategory, UserProfileKind } from './types.js';

export const TASK_CATEGORIES: TaskCategory[] = [
  'Healthcare',
  'Sport activity',
  'Deep work',
  'Admin/Errands',
  'Learning',
  'Social',
  'Household',
  'Creative',
  'Relaxing',
  'Games',
  'Outdoor Play',
  'Commute',
  'Other'
];

export const TASK_CATEGORY_I18N_KEYS: Record<TaskCategory, string> = {
  'Healthcare': 'categories.healthcare',
  'Sport activity': 'categories.sportActivity',
  'Deep work': 'categories.deepWork',
  'Admin/Errands': 'categories.adminErrands',
  'Learning': 'categories.learning',
  'Social': 'categories.social',
  'Household': 'categories.household',
  'Creative': 'categories.creative',
  'Relaxing': 'categories.relaxing',
  'Games': 'categories.games',
  'Outdoor Play': 'categories.outdoorPlay',
  'Commute': 'categories.commute',
  'Other': 'categories.other'
};

// RU-only (окончательная модель)
const RU_CATEGORY_LABELS: Record<TaskCategory, string> = {
  'Healthcare': 'Здоровье и уход',
  'Sport activity': 'Спорт',
  'Deep work': 'Глубокая работа',
  'Admin/Errands': 'Дела и поручения',
  'Learning': 'Учёба',
  'Social': 'Общение',
  'Household': 'Домашние дела',
  'Creative': 'Творчество',
  'Relaxing': 'Отдых',
  'Games': 'Игры',
  'Outdoor Play': 'Прогулки на улице',
  'Commute': 'Дорога',
  'Other': 'Другое'
};

export const TASK_CATEGORY_LABELS: Record<LocaleCode, Record<TaskCategory, string>> = {
  ru: RU_CATEGORY_LABELS
};

export const MODEL_VERSION = 3;

// Веса согласно PRD.md "Final Math" параграф 7
// Порядок: [x1..x12] = [circadian_fit, deadline_pressure, priority, context_switch, 
//                        daily_load, habit_alignment, meal_conflict, school_conflict,
//                        sleep_conflict, activity_target_gap, homework_evening_penalty, games_morning_penalty]

const ADULT_DEFAULT_WEIGHTS: number[] = [
  0.55,  // x1: circadian_fit
  0.50,  // x2: deadline_pressure
  0.55,  // x3: priority
  -0.25, // x4: context_switch
  -0.20, // x5: daily_load
  0.35,  // x6: habit_alignment
  -0.90, // x7: meal_conflict
  0.00,  // x8: school_conflict (взрослым не нужен)
  -1.20, // x9: sleep_conflict
  0.15,  // x10: activity_target_gap
  0.00,  // x11: homework_evening_penalty (взрослым не нужен)
  0.00   // x12: games_morning_penalty (взрослым не нужен)
];

const CHILD_DEFAULT_WEIGHTS: number[] = [
  0.55,  // x1: circadian_fit
  0.45,  // x2: deadline_pressure
  0.50,  // x3: priority
  -0.25, // x4: context_switch
  -0.15, // x5: daily_load
  0.30,  // x6: habit_alignment
  -0.95, // x7: meal_conflict
  -1.10, // x8: school_conflict
  -1.30, // x9: sleep_conflict
  0.40,  // x10: activity_target_gap
  -0.70, // x11: homework_evening_penalty
  -0.80  // x12: games_morning_penalty
];

export const WEIGHT_PRESETS: Record<UserProfileKind, number[]> = {
  adult: ADULT_DEFAULT_WEIGHTS,
  'child-school-age': CHILD_DEFAULT_WEIGHTS
};

export const DEFAULT_WEIGHTS: number[] = [...WEIGHT_PRESETS.adult];

export function getDefaultWeights(profile: UserProfileKind = 'adult'): number[] {
  const preset = WEIGHT_PRESETS[profile] ?? WEIGHT_PRESETS.adult;
  return [...preset];
}

export const INITIAL_LEARNING_RATE = 0.05;
export const INITIAL_REGULARIZATION = 0.001;

export const SLOT_MINUTES = 15;
export const MIN_SEGMENT_MINUTES = 30;
export const MAX_TASKS_PER_DAY = 50;

export const MEAL_OFFSET_LIMIT_MINUTES = 30;

export interface MealWindowDefinition {
  type: MealType;
  baseStartMinutes: number;
  baseEndMinutes: number;
  suggestedDurationMinutes: number;
}

export const DEFAULT_MEAL_WINDOWS: MealWindowDefinition[] = [
  {
    type: 'breakfast',
    baseStartMinutes: 7 * 60, // 07:00
    baseEndMinutes: 8 * 60 + 30, // 08:30
    suggestedDurationMinutes: 30
  },
  {
    type: 'lunch',
    baseStartMinutes: 12 * 60, // 12:00
    baseEndMinutes: 14 * 60, // 14:00
    suggestedDurationMinutes: 40
  },
  {
    type: 'dinner',
    baseStartMinutes: 18 * 60, // 18:00
    baseEndMinutes: 20 * 60 + 30, // 20:30
    suggestedDurationMinutes: 40
  }
];

export const CHILD_SCHOOL_WINDOW = {
  startMinutes: 8 * 60 + 30,
  endMinutes: 13 * 60 + 15
};

export const CHILD_ACTIVITY_WINDOW = {
  startMinutes: 16 * 60,
  endMinutes: 19 * 60
};

export const CHILD_HOMEWORK_WINDOW = {
  startMinutes: 16 * 60 + 30,
  endMinutes: 18 * 60 + 30
};

export const ACTIVITY_TARGET_MINUTES: Record<UserProfileKind, number> = {
  adult: 0,
  'child-school-age': 60
};

