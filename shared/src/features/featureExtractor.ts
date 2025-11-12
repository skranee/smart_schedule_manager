import { differenceInMinutes } from 'date-fns';
import {
  ACTIVITY_TARGET_MINUTES,
  CHILD_SCHOOL_WINDOW,
  DEFAULT_MEAL_WINDOWS,
  MEAL_OFFSET_LIMIT_MINUTES,
  SLOT_MINUTES,
  getDefaultWeights
} from '../constants.js';
import type {
  MealType,
  TaskBase,
  TaskCategory,
  UserProfileKind,
  UserSettings
} from '../types.js';
import { MINUTES_IN_DAY, minutesSinceMidnight } from '../utils/time.js';
import { circadianPreference } from './timeCurves.js';

export const FEATURE_KEYS = [
  'circadian_fit',
  'deadline_pressure',
  'priority',
  'context_switch',
  'daily_load',
  'habit_alignment',
  'meal_conflict',
  'school_conflict',
  'sleep_conflict',
  'activity_target_gap',
  'homework_evening_penalty',
  'games_morning_penalty'
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];
export const FEATURE_COUNT = FEATURE_KEYS.length;

export interface NormalizedWindow {
  startMinutes: number;
  endMinutes: number;
}

export interface MealWindow extends NormalizedWindow {
  type: MealType;
}

export interface TaskFeatureMetadata {
  mealType: MealType | null;
  isMealTask: boolean;
  isHomework: boolean;
  isGamesTask: boolean;
  isSchoolActivity: boolean;
  qualifiesForActivity: boolean;
}

export interface FeatureComputationContext {
  task: TaskBase;
  slotStart: Date;
  slotEnd: Date;
  settings: UserSettings;
  profile: UserProfileKind;
  minutesScheduledSoFar: number;
  plannedMinutesForTask: number;
  minutesScheduledForCategory: number;
  neighborCategories?: {
    before?: TaskCategory;
    after?: TaskCategory;
  };
  historyByCategory?: Partial<Record<TaskCategory, number[]>>;
  meals: MealWindow[];
  school: NormalizedWindow[];
  sleep: NormalizedWindow;
  forcedByUser: boolean;
  dayOfWeek: number;
  taskMetadata: TaskFeatureMetadata;
  activityProgress: {
    scheduledMinutes: number;
    targetMinutes: number;
  };
}

// RU-only паттерны (окончательная модель)
const HOMEWORK_PATTERN = /домашн(яя|ее|ие)\s*(работа|задани)|дз\b|учить|задани/i;
const GAMES_PATTERN = /игра?(ть)?|майнкрафт|дота|кс\b|шутер|консоль/i;
const SCHOOL_PATTERN = /урок|школ|занят|репетиц/i;

const MEAL_MATCHERS: Record<MealType, RegExp> = {
  breakfast: /завтрак/i,
  lunch: /обед/i,
  dinner: /ужин/i
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function decimalHour(date: Date): number {
  return date.getHours() + date.getMinutes() / 60;
}

function minutesFromDate(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function overlapMinutes(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const start = Math.max(aStart, bStart);
  const end = Math.min(aEnd, bEnd);
  return Math.max(0, end - start);
}

function wrappedOverlapMinutes(
  aStart: number,
  aEnd: number,
  wrapStart: number,
  wrapEnd: number
): number {
  if (wrapStart <= wrapEnd) {
    return overlapMinutes(aStart, aEnd, wrapStart, wrapEnd);
  }
  return (
    overlapMinutes(aStart, aEnd, wrapStart, MINUTES_IN_DAY) +
    overlapMinutes(aStart, aEnd, 0, wrapEnd)
  );
}

function isInsideWindow(start: number, end: number, window: NormalizedWindow): boolean {
  return overlapMinutes(start, end, window.startMinutes, window.endMinutes) > 0;
}

export function analyzeTaskForFeatures(task: TaskBase): TaskFeatureMetadata {
  const rawText = `${task.title} ${task.description ?? ''}`.replace(/[ёЁ]/g, 'е').toLowerCase();

  const mealType =
    task.mealType ??
    (Object.entries(MEAL_MATCHERS).find(([, matcher]) => matcher.test(task.title))?.[0] as
      | MealType
      | undefined) ??
    null;

  const isMealTask = Boolean(mealType);
  const isHomework = task.category === 'Learning' && HOMEWORK_PATTERN.test(rawText);
  const isGamesTask = task.category === 'Games' || GAMES_PATTERN.test(rawText);
  const isSchoolActivity = task.category === 'Learning' && SCHOOL_PATTERN.test(rawText);
  const qualifiesForActivity = task.category === 'Relaxing' || task.category === 'Outdoor Play';

  return {
    mealType,
    isMealTask,
    isHomework,
    isGamesTask,
    isSchoolActivity,
    qualifiesForActivity
  };
}

function computeCircadianFit(context: FeatureComputationContext): number {
  const slotStartMinutes = minutesFromDate(context.slotStart);
  const slotEndMinutes = minutesFromDate(context.slotEnd);
  const hour = decimalHour(context.slotStart);

  const ownMealWindow = context.taskMetadata.mealType
    ? context.meals.find((window) => window.type === context.taskMetadata.mealType)
    : undefined;

  const inOwnMealWindow = ownMealWindow
    ? isInsideWindow(slotStartMinutes, slotEndMinutes, ownMealWindow)
    : false;

  return clamp(
    circadianPreference({
      category: context.task.category,
      hour,
      isHomework: context.taskMetadata.isHomework,
      isMealTask: context.taskMetadata.isMealTask,
      inOwnMealWindow,
      isGamesTask: context.taskMetadata.isGamesTask
    }),
    -1,
    1
  );
}

function computeDeadlinePressure(context: FeatureComputationContext): number {
  if (!context.task.deadline) return 0;
  const deadline = new Date(context.task.deadline);
  const deltaDeadlineHours = Math.max(
    0,
    differenceInMinutes(deadline, context.slotStart) / 60
  );
  if (deltaDeadlineHours <= 0) return 0;
  
  // tau = 6 часов (окончательная модель)
  const tau = 6;
  const x2 = 1 - Math.exp(-deltaDeadlineHours / tau);
  return clamp(x2, 0, 1);
}

function computeContextSwitch(context: FeatureComputationContext): number {
  const { neighborCategories, task } = context;
  if (!neighborCategories) return 0;
  const before = neighborCategories.before;
  const after = neighborCategories.after;
  const hasBefore = Boolean(before);
  const hasAfter = Boolean(after);

  if (!hasBefore && !hasAfter) return 0;

  const mismatchBefore = before && before !== task.category;
  const mismatchAfter = after && after !== task.category;

  if (mismatchBefore || mismatchAfter) {
    return -1;
  }
  if ((hasBefore && !mismatchBefore) || (hasAfter && !mismatchAfter)) {
    return 1;
  }
  return 0;
}

function computeDailyLoad(context: FeatureComputationContext): number {
  // L = 360 минут (6 часов)
  const L = 360;
  const used = context.minutesScheduledSoFar;
  
  if (used <= L) return 0;
  
  // x5 = -min(1, (used - L) / 120)
  const x5 = -Math.min(1, (used - L) / 120);
  return x5;
}

function computeHabitAlignment(context: FeatureComputationContext): number {
  const history = context.historyByCategory?.[context.task.category];
  if (!history || history.length === 0) return 0;
  const startMinutes = minutesFromDate(context.slotStart);
  const average =
    history.reduce((sum, value) => sum + value, 0) / Math.max(history.length, 1);
  const deviation = Math.abs(average - startMinutes);
  if (deviation <= SLOT_MINUTES) return 1;
  if (deviation >= 240) return -1;
  return clamp(1 - deviation / 240, -1, 1);
}

function computeMealConflict(context: FeatureComputationContext): number {
  // x7: Конфликт с приёмами пищи (окончательная модель)
  if (context.meals.length === 0) return 0;
  
  const start = minutesFromDate(context.slotStart);
  const end = minutesFromDate(context.slotEnd);
  const overlapsWithMeal = context.meals.some((meal) => isInsideWindow(start, end, meal));
  
  if (context.taskMetadata.isMealTask) {
    // Если задача — питание и слот внутри своего окна -> +1
    const ownWindow = context.meals.find((meal) => meal.type === context.taskMetadata.mealType);
    if (ownWindow && isInsideWindow(start, end, ownWindow)) {
      return 1;
    }
    // Если задача — питание, но вне своего окна -> -1
    return -1;
  }
  
  // Если задача НЕ питание и слот внутри любого окна питания -> -1
  if (overlapsWithMeal) {
    return -1;
  }
  
  // Иначе 0
  return 0;
}

function computeSchoolConflict(context: FeatureComputationContext): number {
  // x8: Конфликт с уроками (детский профиль)
  if (context.profile !== 'child-school-age') return 0;
  if (context.dayOfWeek === 0 || context.dayOfWeek === 6) return 0;
  
  const start = minutesFromDate(context.slotStart);
  const end = minutesFromDate(context.slotEnd);
  const overlaps = context.school.some((window) => isInsideWindow(start, end, window));
  
  // Внутри урока -> -1, иначе 0
  return overlaps ? -1 : 0;
}

function computeSleepConflict(context: FeatureComputationContext): number {
  // x9: Конфликт со сном
  const start = minutesFromDate(context.slotStart);
  const end = minutesFromDate(context.slotEnd);
  const overlap = wrappedOverlapMinutes(
    start,
    end,
    context.sleep.startMinutes,
    context.sleep.endMinutes
  );
  
  // Внутри сна -> -1, иначе 0
  return overlap > 0 ? -1 : 0;
}

function computeActivityTargetGap(context: FeatureComputationContext): number {
  // x10: Дневная цель отдыха (дети)
  if (!context.taskMetadata.qualifiesForActivity) return 0;
  if (context.profile !== 'child-school-age') return 0;
  
  const remaining = Math.max(
    context.activityProgress.targetMinutes - context.activityProgress.scheduledMinutes,
    0
  );
  
  // Если категория в {"Отдых","Прогулка"} и суммарно < 60 мин -> +1, иначе 0
  return remaining > 0 ? 1 : 0;
}

function computeHomeworkPenalty(context: FeatureComputationContext): number {
  // x11: Штраф за вечернюю домашку (дети)
  if (!context.taskMetadata.isHomework) return 0;
  if (context.profile !== 'child-school-age') return 0;
  
  const hour = decimalHour(context.slotStart);
  
  // Если категория "Учёба/Домашнее задание" и h>=20 -> -1
  if (hour >= 20) return -1;
  // Если 19<=h<20 -> -0.5
  if (hour >= 19) return -0.5;
  // Иначе 0
  return 0;
}

function computeGamesPenalty(context: FeatureComputationContext): number {
  // x12: Штраф за игры утром
  if (!context.taskMetadata.isGamesTask && context.task.category !== 'Games') return 0;
  
  const hour = decimalHour(context.slotStart);
  
  // Если категория "Игры" и h<12 -> -1
  if (hour < 12) return -1;
  // Если 12<=h<15 -> -0.5
  if (hour >= 12 && hour < 15) return -0.5;
  // Если 17<=h<=20 -> +0.5
  if (hour >= 17 && hour <= 20) return 0.5;
  // Иначе 0
  return 0;
}

function computePriority(task: TaskBase): number {
  return clamp(task.priority, 0, 1);
}

export function extractFeatureVector(context: FeatureComputationContext): number[] {
  return [
    computeCircadianFit(context),
    computeDeadlinePressure(context),
    computePriority(context.task),
    computeContextSwitch(context),
    computeDailyLoad(context),
    computeHabitAlignment(context),
    computeMealConflict(context),
    computeSchoolConflict(context),
    computeSleepConflict(context),
    computeActivityTargetGap(context),
    computeHomeworkPenalty(context),
    computeGamesPenalty(context)
  ];
}

export function buildDefaultWeights(profile: UserProfileKind = 'adult'): number[] {
  return getDefaultWeights(profile);
}

export function describeFeatureVector(vector: number[]): Record<FeatureKey, number> {
  return FEATURE_KEYS.reduce((acc, key, index) => {
    acc[key] = vector[index] ?? 0;
    return acc;
  }, {} as Record<FeatureKey, number>);
}

export function normalizeMealWindows(
  offsets: Partial<Record<MealType, number>> | undefined
): MealWindow[] {
  return DEFAULT_MEAL_WINDOWS.map((window) => {
    const offset = clamp(
      offsets?.[window.type] ?? 0,
      -MEAL_OFFSET_LIMIT_MINUTES,
      MEAL_OFFSET_LIMIT_MINUTES
    );
    return {
      type: window.type,
      startMinutes: clamp(window.baseStartMinutes + offset, 0, MINUTES_IN_DAY),
      endMinutes: clamp(window.baseEndMinutes + offset, 0, MINUTES_IN_DAY)
    };
  });
}

export function normalizeSleepWindow(settings: UserSettings): NormalizedWindow {
  return {
    startMinutes: minutesSinceMidnight(settings.sleepStart),
    endMinutes: minutesSinceMidnight(settings.sleepEnd)
  };
}

export function normalizeSchoolWindows(): NormalizedWindow[] {
  return [
    {
      startMinutes: CHILD_SCHOOL_WINDOW.startMinutes,
      endMinutes: CHILD_SCHOOL_WINDOW.endMinutes
    }
  ];
}

export function resolveActivityTarget(
  profile: UserProfileKind,
  settings: UserSettings
): number {
  if (typeof settings.activityTargetMinutes === 'number') {
    return settings.activityTargetMinutes;
  }
  return ACTIVITY_TARGET_MINUTES[profile] ?? 0;
}

