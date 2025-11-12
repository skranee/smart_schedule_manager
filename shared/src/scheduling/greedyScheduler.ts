import { addMinutes, differenceInMinutes } from 'date-fns';
import { SLOT_MINUTES } from '../constants.js';
import type { MealType, TaskBase, TaskCategory, UserProfileKind, UserSettings } from '../types.js';
import { buildDaySlots, toIsoString } from '../utils/time.js';
import {
  analyzeTaskForFeatures,
  buildDefaultWeights,
  extractFeatureVector,
  normalizeMealWindows,
  normalizeSchoolWindows,
  normalizeSleepWindow,
  resolveActivityTarget,
  type MealWindow,
  type NormalizedWindow,
  type TaskFeatureMetadata
} from '../features/featureExtractor.js';
import { logisticScore } from '../math/sgd.js';

export type ScheduleTask = TaskBase & {
  id: string;
  minChunkMinutes?: number;
};

export interface SchedulerHistory {
  categoryMinutes?: Partial<Record<TaskCategory, number[]>>;
}

export interface SchedulerInput {
  date: string;
  tasks: ScheduleTask[];
  weights?: number[];
  settings: UserSettings;
  history?: SchedulerHistory;
  profile?: UserProfileKind;
}

export interface ScheduledSegment {
  taskId: string;
  title: string;
  start: string;
  end: string;
  score: number;
  featuresSnapshot: number[];
  category: TaskCategory;
}

interface SlotState {
  index: number;
  start: Date;
  end: Date;
  occupiedTaskId?: string;
  category?: TaskCategory;
}

interface DayEnvironment {
  profile: UserProfileKind;
  meals: MealWindow[];
  school: NormalizedWindow[];
  sleep: NormalizedWindow;
  dayOfWeek: number;
  activityTargetMinutes: number;
}

interface SlotEvaluation {
  index: number;
  features: number[];
  utility: number;
}

interface SegmentPlan {
  indexes: number[];
  averageUtility: number;
  featuresSnapshot: number[];
  penalty: number;
}

const DEFAULT_MIN_CHUNK_MINUTES = 30;
const SECOND_SEGMENT_PENALTY = -0.2;

/**
 * Фаза планирования задачи.
 * ФАЗА 0: обязательные дела (сон, школа, питание, секции с fixedTime)
 * ФАЗА 1: остальные задачи, размещаются только в слоты, не занятые фазой 0
 */
enum SchedulePhase {
  MANDATORY = 0, // Обязательные дела (питание, фиксированные секции)
  REGULAR = 1    // Остальные задачи
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
    overlapMinutes(aStart, aEnd, wrapStart, 24 * 60) +
    overlapMinutes(aStart, aEnd, 0, wrapEnd)
  );
}

function isWithinWindow(start: number, end: number, window: NormalizedWindow): boolean {
  return overlapMinutes(start, end, window.startMinutes, window.endMinutes) > 0;
}

/**
 * Определяет фазу планирования для задачи.
 * ФАЗА 0: питание и задачи с фиксированным временем (секции/кружки)
 * ФАЗА 1: все остальные задачи
 */
function determineTaskPhase(task: ScheduleTask, metadata: TaskFeatureMetadata): SchedulePhase {
  // Питание всегда в фазе 0
  if (metadata.isMealTask) {
    return SchedulePhase.MANDATORY;
  }
  
  // Задачи с фиксированным временем (секции/кружки) в фазе 0
  if (task.fixedTime?.start) {
    return SchedulePhase.MANDATORY;
  }
  
  // Все остальные задачи в фазе 1
  return SchedulePhase.REGULAR;
}

/**
 * Создает задачи питания для фазы 0, если их нет в списке пользовательских задач.
 */
function ensureMealTasks(
  existingTasks: ScheduleTask[],
  env: DayEnvironment,
  date: string
): ScheduleTask[] {
  const mealTasks: ScheduleTask[] = [];
  const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner'];
  
  const mealLabels: Record<MealType, string> = {
    breakfast: 'Завтрак',
    lunch: 'Обед',
    dinner: 'Ужин'
  };
  
  for (const mealType of mealTypes) {
    // Проверяем, есть ли уже задача с этим типом питания
    const hasMealTask = existingTasks.some((task) => {
      const metadata = analyzeTaskForFeatures(task);
      return metadata.mealType === mealType;
    });
    
    if (!hasMealTask) {
      // Находим окно для этого приёма пищи
      const mealWindow = env.meals.find((m) => m.type === mealType);
      if (!mealWindow) continue;
      
      // Создаем автоматическую задачу питания
      const mealTask: ScheduleTask = {
        id: `auto-meal-${mealType}`,
        title: mealLabels[mealType],
        category: 'Other', // Категория не имеет значения для питания
        estimatedMinutes: 30, // По умолчанию 30 минут
        priority: 1.0, // Максимальный приоритет
        mealType, // Явно указываем тип питания
        description: `Автоматически созданная задача для ${mealLabels[mealType].toLowerCase()}`
      };
      
      mealTasks.push(mealTask);
    }
  }
  
  return mealTasks;
}

function buildSlots(date: string): SlotState[] {
  return buildDaySlots(date, SLOT_MINUTES).map((slot, index) => ({
    index,
    start: slot.start,
    end: slot.end
  }));
}

function isSlotAdmissible(
  task: ScheduleTask,
  metadata: TaskFeatureMetadata,
  slot: SlotState,
  env: DayEnvironment,
  forcedByUser: boolean
): boolean {
  if (task.fixedTime?.start) {
    const fixedStart = new Date(task.fixedTime.start);
    if (Math.abs(differenceInMinutes(fixedStart, slot.start)) >= SLOT_MINUTES) {
      return false;
    }
  }

  if (task.deadline) {
    const deadline = new Date(task.deadline);
    if (slot.start >= deadline) {
      return false;
    }
  }

  const startMinutes = minutesFromDate(slot.start);
  const endMinutes = minutesFromDate(slot.end);

  // Если задача — питание, она ДОЛЖНА быть строго в своём окне
  if (metadata.isMealTask) {
    const mealWindow = env.meals.find((window) => window.type === metadata.mealType);
    if (!mealWindow || !isWithinWindow(startMinutes, endMinutes, mealWindow)) {
      return false;
    }
  }

  if (!forcedByUser) {
    // Блокируем слоты во время сна
    const sleepOverlap =
      wrappedOverlapMinutes(
        startMinutes,
        endMinutes,
        env.sleep.startMinutes,
        env.sleep.endMinutes
      ) > 0;
    if (sleepOverlap) {
      return false;
    }

    // Если задача НЕ питание, блокируем окна питания (модель x7)
    if (!metadata.isMealTask) {
      const mealOverlap = env.meals.some((meal) =>
        isWithinWindow(startMinutes, endMinutes, meal)
      );
      if (mealOverlap) {
        return false;
      }
    }

    if (env.profile === 'child-school-age' && env.dayOfWeek > 0 && env.dayOfWeek < 6) {
      const schoolOverlap = env.school.some((window) =>
        isWithinWindow(startMinutes, endMinutes, window)
      );
      if (schoolOverlap) {
        return false;
      }
    }
  }

  return true;
}

function collectAdmissibleIndexes(
  task: ScheduleTask,
  metadata: TaskFeatureMetadata,
  slots: SlotState[],
  env: DayEnvironment,
  forcedByUser: boolean
): number[] {
  return slots
    .filter((slot) => isSlotAdmissible(task, metadata, slot, env, forcedByUser))
    .map((slot) => slot.index);
}

function getNeighborCategory(slots: SlotState[], index: number): TaskCategory | undefined {
  if (index < 0 || index >= slots.length) return undefined;
  const slot = slots[index];
  return slot.occupiedTaskId ? slot.category : undefined;
}

function evaluateSlots(
  task: ScheduleTask,
  metadata: TaskFeatureMetadata,
  slots: SlotState[],
  availableIndexes: number[],
  env: DayEnvironment,
  weights: number[],
  settings: UserSettings,
  history: SchedulerHistory | undefined,
  minutesScheduledSoFar: number,
  minutesScheduledForCategory: number,
  activityScheduledMinutes: number,
  forcedByUser: boolean
): { evaluations: SlotEvaluation[]; map: Map<number, SlotEvaluation> } {
  const map = new Map<number, SlotEvaluation>();
  const evaluations: SlotEvaluation[] = [];

  for (const index of availableIndexes) {
    const slot = slots[index];
    if (slot.occupiedTaskId) continue;

    const neighborCategories = {
      before: getNeighborCategory(slots, index - 1),
      after: getNeighborCategory(slots, index + 1)
    };

    const features = extractFeatureVector({
      task,
      slotStart: slot.start,
      slotEnd: slot.end,
      settings,
      profile: env.profile,
      minutesScheduledSoFar,
      plannedMinutesForTask: task.estimatedMinutes,
      minutesScheduledForCategory,
      neighborCategories,
      historyByCategory: history?.categoryMinutes,
      meals: env.meals,
      school: env.school,
      sleep: env.sleep,
      forcedByUser,
      dayOfWeek: env.dayOfWeek,
      taskMetadata: metadata,
      activityProgress: {
        scheduledMinutes: activityScheduledMinutes,
        targetMinutes: env.activityTargetMinutes
      }
    });

    const utility = logisticScore(weights, features);
    const evaluation: SlotEvaluation = { index, features, utility };
    evaluations.push(evaluation);
    map.set(index, evaluation);
  }

  evaluations.sort((a, b) => {
    if (b.utility !== a.utility) return b.utility - a.utility;
    return a.index - b.index;
  });

  return { evaluations, map };
}

function buildRuns(indexes: Iterable<number>): number[][] {
  const sorted = Array.from(indexes).sort((a, b) => a - b);
  const runs: number[][] = [];
  let current: number[] = [];

  for (const index of sorted) {
    if (current.length === 0 || index === current[current.length - 1] + 1) {
      current.push(index);
    } else {
      runs.push(current);
      current = [index];
    }
  }

  if (current.length > 0) {
    runs.push(current);
  }

  return runs;
}

function bestWindowWithinRun(
  run: number[],
  length: number,
  evaluationMap: Map<number, SlotEvaluation>,
  requiredIndex?: number
): { indexes: number[]; averageUtility: number; featuresSnapshot: number[] } | null {
  if (run.length < length) return null;
  let best: { indexes: number[]; averageUtility: number; featuresSnapshot: number[] } | null =
    null;

  for (let start = 0; start <= run.length - length; start += 1) {
    const window = run.slice(start, start + length);
    if (requiredIndex !== undefined && !window.includes(requiredIndex)) {
      continue;
    }

    let sumUtility = 0;
    const featuresLength = evaluationMap.get(window[0])?.features.length ?? 0;
    const featureSums = new Array(featuresLength).fill(0);
    let valid = true;

    for (const index of window) {
      const evaluation = evaluationMap.get(index);
      if (!evaluation) {
        valid = false;
        break;
      }
      sumUtility += evaluation.utility;
      for (let i = 0; i < featuresLength; i += 1) {
        featureSums[i] += evaluation.features[i] ?? 0;
      }
    }

    if (!valid) continue;
    const averageUtility = sumUtility / window.length;
    const featuresSnapshot = featureSums.map((value) => value / window.length);

    if (
      !best ||
      averageUtility > best.averageUtility ||
      (averageUtility === best.averageUtility && window[0] < best.indexes[0])
    ) {
      best = { indexes: window, averageUtility, featuresSnapshot };
    }
  }

  return best;
}

function bestWindowAcrossRuns(
  runs: number[][],
  length: number,
  evaluationMap: Map<number, SlotEvaluation>
): { indexes: number[]; averageUtility: number; featuresSnapshot: number[] } | null {
  let best: { indexes: number[]; averageUtility: number; featuresSnapshot: number[] } | null =
    null;

  for (const run of runs) {
    const candidate = bestWindowWithinRun(run, length, evaluationMap);
    if (!candidate) continue;
    if (
      !best ||
      candidate.averageUtility > best.averageUtility ||
      (candidate.averageUtility === best.averageUtility && candidate.indexes[0] < best.indexes[0])
    ) {
      best = candidate;
    }
  }

  return best;
}

function markSlotsOccupied(
  slots: SlotState[],
  indexes: number[],
  taskId: string,
  category: TaskCategory
) {
  for (const index of indexes) {
    const slot = slots[index];
    slot.occupiedTaskId = taskId;
    slot.category = category;
  }
}

function computeMinutesScheduled(segments: ScheduledSegment[]): number {
  return segments.reduce(
    (total, segment) =>
      total + differenceInMinutes(new Date(segment.end), new Date(segment.start)),
    0
  );
}

function computeMinutesByCategory(
  segments: ScheduledSegment[],
  category: TaskCategory
): number {
  return segments
    .filter((segment) => segment.category === category)
    .reduce(
      (total, segment) =>
        total + differenceInMinutes(new Date(segment.end), new Date(segment.start)),
      0
    );
}

function computeActivityMinutes(
  segments: ScheduledSegment[],
  metadataMap: Map<string, TaskFeatureMetadata>
): number {
  return segments.reduce((total, segment) => {
    const metadata = metadataMap.get(segment.taskId);
    if (metadata?.qualifiesForActivity) {
      return total + differenceInMinutes(new Date(segment.end), new Date(segment.start));
    }
    return total;
  }, 0);
}

function computeMaxDeadlinePressure(
  task: ScheduleTask,
  admissibleIndexes: number[],
  slots: SlotState[]
): number {
  if (!task.deadline || admissibleIndexes.length === 0) return 0;
  const earliestIndex = Math.min(...admissibleIndexes);
  const earliestStart = slots[earliestIndex].start;
  const deadline = new Date(task.deadline);
  const diffHours = Math.max(0, differenceInMinutes(deadline, earliestStart) / 60);
  const tau = 6;
  return clamp(1 - Math.exp(-diffHours / tau), 0, 1);
}

function scheduleTask(params: {
  task: ScheduleTask;
  metadata: TaskFeatureMetadata;
  env: DayEnvironment;
  slots: SlotState[];
  weights: number[];
  settings: UserSettings;
  history?: SchedulerHistory;
  minutesScheduledSoFar: number;
  minutesScheduledForCategory: number;
  activityScheduledMinutes: number;
}): ScheduledSegment[] {
  const {
    task,
    metadata,
    env,
    slots,
    weights,
    settings,
    history,
    minutesScheduledSoFar,
    minutesScheduledForCategory,
    activityScheduledMinutes
  } = params;

  const forcedByUser = Boolean(task.fixedTime?.start);
  const admissibleIndexes = collectAdmissibleIndexes(task, metadata, slots, env, forcedByUser);
  const availableIndexes = admissibleIndexes.filter(
    (index) => !slots[index].occupiedTaskId
  );

  if (availableIndexes.length === 0) {
    return [];
  }

  const { evaluations, map } = evaluateSlots(
    task,
    metadata,
    slots,
    availableIndexes,
    env,
    weights,
    settings,
    history,
    minutesScheduledSoFar,
    minutesScheduledForCategory,
    activityScheduledMinutes,
    forcedByUser
  );

  if (evaluations.length === 0) {
    return [];
  }

  const requiredSlots = Math.max(1, Math.ceil(task.estimatedMinutes / SLOT_MINUTES));
  const minChunkMinutes = task.minChunkMinutes ?? DEFAULT_MIN_CHUNK_MINUTES;
  const minChunkSlots = Math.max(1, Math.ceil(minChunkMinutes / SLOT_MINUTES));

  const availableSet = new Set(availableIndexes);
  const runs = buildRuns(availableSet);

  for (const candidate of evaluations) {
    if (!availableSet.has(candidate.index)) continue;
    const run = runs.find((sequence) => sequence.includes(candidate.index));
    if (!run) continue;

    let firstSegmentLength = Math.min(run.length, requiredSlots);

    if (requiredSlots >= minChunkSlots) {
      if (firstSegmentLength < minChunkSlots) {
        continue;
      }
      while (
        requiredSlots - firstSegmentLength > 0 &&
        requiredSlots - firstSegmentLength < minChunkSlots
      ) {
        firstSegmentLength -= 1;
      }
      if (firstSegmentLength < minChunkSlots) {
        continue;
      }
    }

    const primarySegment = bestWindowWithinRun(
      run,
      firstSegmentLength,
      map,
      candidate.index
    );
    if (!primarySegment) continue;

    const usedIndexes = new Set(primarySegment.indexes);
    let remainingSlots = requiredSlots - primarySegment.indexes.length;
    const segmentPlans: SegmentPlan[] = [
      {
        indexes: primarySegment.indexes,
        averageUtility: primarySegment.averageUtility,
        featuresSnapshot: primarySegment.featuresSnapshot,
        penalty: 0
      }
    ];

    if (remainingSlots > 0) {
      if (requiredSlots < minChunkSlots) {
        continue;
      }

      if (remainingSlots < minChunkSlots) {
        continue;
      }

      const remainingIndexes = Array.from(availableSet).filter(
        (index) => !usedIndexes.has(index)
      );
      const remainingRuns = buildRuns(remainingIndexes);
      const secondarySegment = bestWindowAcrossRuns(remainingRuns, remainingSlots, map);
      if (!secondarySegment) {
        continue;
      }

      segmentPlans.push({
        indexes: secondarySegment.indexes,
        averageUtility: secondarySegment.averageUtility,
        featuresSnapshot: secondarySegment.featuresSnapshot,
        penalty: SECOND_SEGMENT_PENALTY
      });
    }

    const segments: ScheduledSegment[] = [];
    for (const plan of segmentPlans) {
      const sortedIndexes = [...plan.indexes].sort((a, b) => a - b);
      const startSlot = slots[sortedIndexes[0]];
      const segmentLengthMinutes = sortedIndexes.length * SLOT_MINUTES;
      const segmentStart = startSlot.start;
      const segmentEnd = addMinutes(segmentStart, segmentLengthMinutes);

      markSlotsOccupied(slots, sortedIndexes, task.id, task.category);

      segments.push({
        taskId: task.id,
        title: task.title,
        start: toIsoString(segmentStart),
        end: toIsoString(segmentEnd),
        score: plan.averageUtility + plan.penalty,
        featuresSnapshot: plan.featuresSnapshot,
        category: task.category
      });
    }

    return segments;
  }

  return [];
}

export function generateSchedule(input: SchedulerInput): ScheduledSegment[] {
  const profile: UserProfileKind = input.profile ?? (input.settings as any).profile ?? 'adult';
  const weights =
    input.weights && input.weights.length > 0 ? input.weights : buildDefaultWeights(profile);

  const slots = buildSlots(input.date);

  const env: DayEnvironment = {
    profile,
    meals: normalizeMealWindows(input.settings.mealOffsets),
    school: profile === 'child-school-age' ? normalizeSchoolWindows() : [],
    sleep: normalizeSleepWindow(input.settings),
    dayOfWeek: new Date(input.date).getDay(),
    activityTargetMinutes: resolveActivityTarget(profile, input.settings)
  };

  // Шаг 1: Создаем автоматические задачи питания, если пользователь их не добавил
  const mealTasks = ensureMealTasks(input.tasks, env, input.date);
  const allTasks = [...input.tasks, ...mealTasks];

  // Шаг 2: Анализируем все задачи и определяем их фазы
  const metadataMap = new Map<string, TaskFeatureMetadata>();
  for (const task of allTasks) {
    metadataMap.set(task.id, analyzeTaskForFeatures(task));
  }

  // Шаг 3: Разделяем задачи на фазу 0 (обязательные) и фазу 1 (остальные)
  const phase0Tasks: ScheduleTask[] = [];
  const phase1Tasks: ScheduleTask[] = [];

  for (const task of allTasks) {
    const metadata = metadataMap.get(task.id)!;
    const phase = determineTaskPhase(task, metadata);
    
    if (phase === SchedulePhase.MANDATORY) {
      phase0Tasks.push(task);
    } else {
      phase1Tasks.push(task);
    }
  }

  // Шаг 4: Планируем ФАЗУ 0 (обязательные дела) - они ВСЕГДА размещаются первыми
  const scheduled: ScheduledSegment[] = [];

  // Сортируем задачи фазы 0: сначала задачи с fixedTime, потом питание по времени окна
  phase0Tasks.sort((a, b) => {
    const aHasFixed = Boolean(a.fixedTime?.start);
    const bHasFixed = Boolean(b.fixedTime?.start);
    
    if (aHasFixed && !bHasFixed) return -1;
    if (!aHasFixed && bHasFixed) return 1;
    
    if (aHasFixed && bHasFixed) {
      return new Date(a.fixedTime!.start!).getTime() - new Date(b.fixedTime!.start!).getTime();
    }
    
    // Для питания сортируем по времени окна
    const aMetadata = metadataMap.get(a.id)!;
    const bMetadata = metadataMap.get(b.id)!;
    
    if (aMetadata.mealType && bMetadata.mealType) {
      const aWindow = env.meals.find((m) => m.type === aMetadata.mealType);
      const bWindow = env.meals.find((m) => m.type === bMetadata.mealType);
      if (aWindow && bWindow) {
        return aWindow.startMinutes - bWindow.startMinutes;
      }
    }
    
    return 0;
  });

  // Размещаем задачи фазы 0
  for (const task of phase0Tasks) {
    const metadata = metadataMap.get(task.id)!;
    const minutesScheduledSoFar = computeMinutesScheduled(scheduled);
    const minutesScheduledForCategory = computeMinutesByCategory(scheduled, task.category);
    const activityScheduledMinutes = computeActivityMinutes(scheduled, metadataMap);

    const segments = scheduleTask({
      task,
      metadata,
      env,
      slots,
      weights,
      settings: input.settings,
      history: input.history,
      minutesScheduledSoFar,
      minutesScheduledForCategory,
      activityScheduledMinutes
    });

    if (segments.length > 0) {
      scheduled.push(...segments);
    }
  }

  // Шаг 5: Планируем ФАЗУ 1 (остальные задачи) - только в слоты, НЕ занятые фазой 0
  const phase1TaskList = phase1Tasks
    .map((task) => {
      const metadata = metadataMap.get(task.id)!;
      const forcedByUser = Boolean(task.fixedTime?.start);
      const admissible = collectAdmissibleIndexes(task, metadata, slots, env, forcedByUser);
      const maxDeadlinePressure = computeMaxDeadlinePressure(task, admissible, slots);
      return {
        task,
        metadata,
        urgency: task.priority * maxDeadlinePressure,
        maxDeadlinePressure
      };
    })
    .sort((a, b) => {
      if (b.urgency !== a.urgency) return b.urgency - a.urgency;
      if (b.task.priority !== a.task.priority) return b.task.priority - a.task.priority;
      const deadlineA = a.task.deadline ? new Date(a.task.deadline).getTime() : Number.MAX_SAFE_INTEGER;
      const deadlineB = b.task.deadline ? new Date(b.task.deadline).getTime() : Number.MAX_SAFE_INTEGER;
      if (deadlineA !== deadlineB) return deadlineA - deadlineB;
      return a.task.title.localeCompare(b.task.title);
    });

  for (const entry of phase1TaskList) {
    const minutesScheduledSoFar = computeMinutesScheduled(scheduled);
    const minutesScheduledForCategory = computeMinutesByCategory(
      scheduled,
      entry.task.category
    );
    const activityScheduledMinutes = computeActivityMinutes(scheduled, metadataMap);

    const segments = scheduleTask({
      task: entry.task,
      metadata: entry.metadata,
      env,
      slots,
      weights,
      settings: input.settings,
      history: input.history,
      minutesScheduledSoFar,
      minutesScheduledForCategory,
      activityScheduledMinutes
    });

    if (segments.length > 0) {
      scheduled.push(...segments);
    }
  }

  return scheduled.sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );
}


