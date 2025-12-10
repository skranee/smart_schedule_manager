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

// Грубое размещение задач с фиксированным временем: ставим ровно в указанное время
// и помечаем занятые слоты до дальнейшего планирования остальных задач.
function placeFixedTask(
  task: ScheduleTask,
  metadata: TaskFeatureMetadata,
  slots: SlotState[],
  env: DayEnvironment
): ScheduledSegment | null {
  // Используем время как есть (UTC-компоненты = введённое локальное время без сдвига).
  const fixedStart = new Date(task.fixedTime!.start!);
  const targetMinutes = minutesFromDate(fixedStart);

  // Сначала ищем слот, который содержит фиксированное время.
  let startSlotIndex = slots.findIndex(
    (slot) => fixedStart >= slot.start && fixedStart < slot.end
  );
  let minDiff = startSlotIndex >= 0
    ? Math.abs(differenceInMinutes(fixedStart, slots[startSlotIndex].start))
    : Infinity;

  // Если не нашли, ищем ближайший по началу.
  if (startSlotIndex === -1) {
    let bestSlotIndex = -1;
    for (let i = 0; i < slots.length; i++) {
      const slotMinutes = minutesFromDate(slots[i].start);
      const diff = Math.abs(slotMinutes - targetMinutes);
      if (diff < minDiff) {
        minDiff = diff;
        bestSlotIndex = i;
      }
    }
    startSlotIndex = bestSlotIndex;
  }

  if (startSlotIndex === -1) {
    console.log(`[FIXED_SIMPLE] No slot found for "${task.title}"`);
    return null;
  }

  // Слишком далеко от нужного времени — не ставим.
  if (minDiff > SLOT_MINUTES) {
    console.log(`[FIXED_SIMPLE] Slot too far for "${task.title}", diff=${minDiff}`);
    return null;
  }

  // Критичные ограничения (сон/дедлайн) проверяем без fixedTime.
  const taskWithoutFixedTime = { ...task, fixedTime: undefined };
  if (!isSlotAdmissible(taskWithoutFixedTime, metadata, slots[startSlotIndex], env, true)) {
    console.log(`[FIXED_SIMPLE] Start slot not admissible for "${task.title}"`);
    return null;
  }

  if (slots[startSlotIndex].occupiedTaskId) {
    console.log(`[FIXED_SIMPLE] Start slot occupied for "${task.title}"`);
    return null;
  }

  const requiredSlots = Math.max(1, Math.ceil(task.estimatedMinutes / SLOT_MINUTES));
  const consecutive: number[] = [];
  for (let i = startSlotIndex; i < slots.length && consecutive.length < requiredSlots; i++) {
    if (slots[i].occupiedTaskId) break;

    const taskWithoutFixedTime = { ...task, fixedTime: undefined };
    if (!isSlotAdmissible(taskWithoutFixedTime, metadata, slots[i], env, true)) break;

    consecutive.push(i);
  }

  if (consecutive.length < requiredSlots) {
    console.log(`[FIXED_SIMPLE] Not enough slots for "${task.title}"`);
    return null;
  }

  const sorted = consecutive.slice(0, requiredSlots).sort((a, b) => a - b);
  const segmentStart = fixedStart;
  const segmentEnd = addMinutes(segmentStart, sorted.length * SLOT_MINUTES);

  markSlotsOccupied(slots, sorted, task.id, task.category);

  return {
    taskId: task.id,
    title: task.title,
    start: toIsoString(segmentStart),
    end: toIsoString(segmentEnd),
    score: 0,
    featuresSnapshot: [],
    category: task.category
  };
}

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

function minutesFromDate(date: Date | string | undefined): number {
  if (!date) {
    console.error('[minutesFromDate] Date is undefined or null');
    return 0;
  }
  const dateObj = date instanceof Date ? date : new Date(date);
  if (isNaN(dateObj.getTime())) {
    console.error('[minutesFromDate] Invalid date:', date);
    return 0;
  }
  // Используем UTC-компоненты, чтобы фиксированные времена не смещались
  // из-за локального часового пояса.
  return dateObj.getUTCHours() * 60 + dateObj.getUTCMinutes();
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
 * ФАЗА 0: питание, школа и задачи с фиксированным временем (секции/кружки)
 * ФАЗА 1: все остальные задачи
 */
function determineTaskPhase(task: ScheduleTask, metadata: TaskFeatureMetadata): SchedulePhase {
  // Питание всегда в фазе 0
  if (metadata.isMealTask) {
    return SchedulePhase.MANDATORY;
  }
  
  // Школа всегда в фазе 0 (максимальный приоритет)
  if (metadata.isSchoolActivity) {
    console.log(`[PHASE] Task "${task.title}" is school activity, phase: MANDATORY`);
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
  // Для задач с фиксированным временем проверяем, что слот начинается максимально близко к fixedTime.start
  // Разрешаем слот, который начинается в пределах одного слота (15 минут) от fixedTime.start
  // Это максимальное смещение для задач с фиксированным временем
  if (task.fixedTime?.start) {
    const fixedStart = new Date(task.fixedTime.start);
    const diffMinutes = Math.abs(differenceInMinutes(fixedStart, slot.start));
    // Разрешаем слот, который начинается максимум на 1 слот (15 минут) от fixedTime.start
    if (diffMinutes > SLOT_MINUTES) {
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

  // Если задача — питание, она должна быть в своём окне или рядом с ним
  // Питание подстраивается под школу - если школа занимает часть окна питания,
  // питание размещается в оставшейся части окна или смещается
  if (metadata.isMealTask) {
    const mealWindow = env.meals.find((window) => window.type === metadata.mealType);
    if (!mealWindow) {
      return false;
    }
    
    // Питание может быть в окне или немного за его пределами (до 30 минут до/после)
    // чтобы подстроиться под школу
    const MEAL_FLEXIBILITY_MINUTES = 30;
    const windowStart = mealWindow.startMinutes - MEAL_FLEXIBILITY_MINUTES;
    const windowEnd = mealWindow.endMinutes + MEAL_FLEXIBILITY_MINUTES;
    
    // Проверяем, что слот находится в расширенном окне питания
    if (!isWithinWindow(startMinutes, endMinutes, { startMinutes: windowStart, endMinutes: windowEnd })) {
      return false;
    }
    
    // Питание не может занимать слоты, уже занятые школой
    // (школа размещается первой и имеет приоритет)
    // Это проверяется через availableIndexes в scheduleTask
  }

  // Школа должна размещаться в школьном окне. Мы не блокируем выходные,
  // чтобы при наличии задачи школа всегда была запланирована.
  if (metadata.isSchoolActivity) {
    // Даем небольшой запас по началу/концу, чтобы вместить расписания,
    // которые немного выходят за базовое окно.
    const SCHOOL_FLEX_MINUTES = 30;
    const inSchoolWindow = env.school.some((window) =>
      isWithinWindow(
        startMinutes,
        endMinutes,
        {
          startMinutes: window.startMinutes - SCHOOL_FLEX_MINUTES,
          endMinutes: window.endMinutes + SCHOOL_FLEX_MINUTES
        }
      )
    );
    if (!inSchoolWindow) {
      console.log(`[SCHOOL_ADMISSIBLE] Slot not in school window: ${startMinutes}-${endMinutes}, windows:`, env.school);
      return false; // Школа должна быть в (расширенном) школьном окне
    }
    // Школа может пересекаться со сном и питанием - это нормально, т.к. она имеет приоритет
    return true;
  }

  // Всегда блокируем слоты во время сна (критичное ограничение)
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

  if (!forcedByUser) {
    // Если задача НЕ питание, блокируем окна питания (модель x7)
    // Для задач с fixedTime (forcedByUser = true) разрешаем конфликты с питанием
    if (!metadata.isMealTask) {
      const mealOverlap = env.meals.some((meal) =>
        isWithinWindow(startMinutes, endMinutes, meal)
      );
      if (mealOverlap) {
        return false;
      }
    }

    // Блокируем школьное окно для НЕ-школьных задач в будние дни
    // НО: питание может быть размещено в школьном окне, если оно не конфликтует со школой
    // (школа размещается первой, поэтому если слот занят школой, питание не может его использовать)
    // Для задач с fixedTime (forcedByUser = true) разрешаем конфликты со школой
    if (env.dayOfWeek > 0 && env.dayOfWeek < 6) {
      const schoolOverlap = env.school.some((window) =>
        isWithinWindow(startMinutes, endMinutes, window)
      );
      if (schoolOverlap && !metadata.isMealTask) {
        // Для не-питания блокируем школьное окно
        // Питание может быть в школьном окне, но только если слот не занят школой
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

  // Если задан fixedTime — считаем, что пользователь ожидает точное время.
  const forcedByUser = Boolean(task.fixedTime?.start);
  
  // Для задач с фиксированным временем размещаем их строго в указанное время.
  // Это задачи наивысшего приоритета.
  if (task.fixedTime?.start) {
    const fixedStart = new Date(task.fixedTime.start);
    const targetMinutes = minutesFromDate(fixedStart); // UTC-компоненты, чтобы не было сдвига часового пояса
    console.log(
      `[FIXED_TIME] Scheduling task "${task.title}" with fixedTime (UTC components): ${fixedStart.toISOString()} -> minutes=${targetMinutes}`
    );
    console.log(
      `[FIXED_TIME] Task estimatedMinutes: ${task.estimatedMinutes}, requiredSlots: ${Math.ceil(
        task.estimatedMinutes / SLOT_MINUTES
      )}`
    );
    
    // 1) Ищем слот, который включает фиксированное время.
    let startSlotIndex = slots.findIndex(
      (slot) => fixedStart >= slot.start && fixedStart < slot.end
    );
    let minDiff = startSlotIndex >= 0
      ? Math.abs(differenceInMinutes(fixedStart, slots[startSlotIndex].start))
      : Infinity;

    // 2) Если не нашли, ищем ближайший по началу.
    if (startSlotIndex === -1) {
      let bestSlotIndex = -1;
      for (let i = 0; i < slots.length; i++) {
        const slotMinutes = minutesFromDate(slots[i].start);
        const diff = Math.abs(slotMinutes - targetMinutes);
        if (diff < minDiff) {
          minDiff = diff;
          bestSlotIndex = i;
        }
      }

      startSlotIndex = bestSlotIndex;
    }

    if (startSlotIndex === -1) {
      console.log(`[FIXED_TIME] Failed to find slot for task "${task.title}"`);
      return [];
    }

    console.log(`[FIXED_TIME] Found start slot index: ${startSlotIndex}, diff: ${minDiff} minutes`);
    console.log(`[FIXED_TIME] Start slot: ${slots[startSlotIndex].start.toISOString()}, fixedTime: ${fixedStart.toISOString()}`);

    // Допускаем отклонение не больше одного слота, иначе считаем, что время неприменимо.
    if (minDiff > SLOT_MINUTES) {
      console.log(`[FIXED_TIME] No acceptable slot near fixedTime: diff=${minDiff} minutes`);
      return [];
    }
    
    // Проверяем, что слот допустим (базовые ограничения: deadline, sleep и т.д.)
    // Для fixedTime задачи мы принудительно размещаем её, поэтому проверяем только критичные ограничения
    // Используем forcedByUser = true, чтобы пропустить некритичные ограничения (питание, школа)
    // но все равно проверяем критичные (deadline, сон)
    const taskWithoutFixedTime = { ...task, fixedTime: undefined };
    if (!isSlotAdmissible(taskWithoutFixedTime, metadata, slots[startSlotIndex], env, true)) {
      console.log(`[FIXED_TIME] Slot ${startSlotIndex} is not admissible for task "${task.title}" (critical constraints failed - deadline or sleep)`);
      return [];
    }
    
    // Проверяем, что слот не занят
    if (slots[startSlotIndex].occupiedTaskId) {
      console.log(`[FIXED_TIME] Slot ${startSlotIndex} is already occupied for task "${task.title}"`);
      return [];
    }
    
    // Вычисляем, сколько слотов нужно для задачи
    const requiredSlots = Math.max(1, Math.ceil(task.estimatedMinutes / SLOT_MINUTES));
    
    // Проверяем, что есть достаточно свободных слотов начиная с найденного слота
    // Для задач с fixedTime проверяем допустимость только для первого слота (ближайшего к fixedTime)
    // Для остальных слотов проверяем только занятость и базовые ограничения (deadline, sleep и т.д.)
    const consecutiveSlots: number[] = [];
    for (let i = startSlotIndex; i < slots.length && consecutiveSlots.length < requiredSlots; i++) {
      if (slots[i].occupiedTaskId) {
        break;
      }
      
      // Для первого слота проверяем полную допустимость (включая близость к fixedTime)
      // Для последующих слотов проверяем только базовые ограничения (без проверки fixedTime)
      if (i === startSlotIndex) {
        // Первый слот - проверяем полную допустимость
        if (!isSlotAdmissible(task, metadata, slots[i], env, forcedByUser)) {
          console.log(`[FIXED_TIME] First slot ${i} is not admissible for task "${task.title}"`);
          break;
        }
      } else {
        // Последующие слоты - проверяем только критичные ограничения (deadline, sleep)
        // Используем forcedByUser = true, чтобы пропустить некритичные ограничения
        // Создаем временную задачу без fixedTime для проверки
        const taskWithoutFixedTime = { ...task, fixedTime: undefined };
        if (!isSlotAdmissible(taskWithoutFixedTime, metadata, slots[i], env, true)) {
          console.log(`[FIXED_TIME] Subsequent slot ${i} is not admissible for task "${task.title}" (critical constraints failed)`);
          break;
        }
      }
      
      consecutiveSlots.push(i);
    }
    
    if (consecutiveSlots.length < requiredSlots) {
      console.log(`[FIXED_TIME] Not enough consecutive slots for task "${task.title}": need ${requiredSlots}, found ${consecutiveSlots.length}`);
      return [];
    }
    
    // Размещаем задачу начиная с найденного слота.
    const sortedIndexes = consecutiveSlots.slice(0, requiredSlots).sort((a, b) => a - b);
    const startSlot = slots[sortedIndexes[0]];
    const segmentLengthMinutes = sortedIndexes.length * SLOT_MINUTES;
    
    // Начало сегмента — точное фиксированное время.
    const segmentStart = fixedStart;
    const segmentEnd = addMinutes(segmentStart, segmentLengthMinutes);

    console.log(`[FIXED_TIME] Successfully scheduled "${task.title}"`);
    console.log(`[FIXED_TIME] Fixed time: ${fixedStart.toISOString()}, Actual start: ${segmentStart.toISOString()}, Slot start diff: ${minDiff} minutes`);
    console.log(`[FIXED_TIME] Segment: ${segmentStart.toISOString()} to ${segmentEnd.toISOString()}`);
    
    markSlotsOccupied(slots, sortedIndexes, task.id, task.category);
    
    // Вычисляем score для сегмента (используем среднее значение для всех слотов)
    const slotEvaluations = sortedIndexes.map(index => {
      const slot = slots[index];
      if (!slot || !slot.start || !slot.end) {
        console.error(`[FIXED_TIME] Invalid slot at index ${index}`);
        return 0;
      }
      
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
      return features.reduce((sum, val, idx) => sum + val * weights[idx], 0);
    });
    const averageScore = slotEvaluations.reduce((sum, score) => sum + score, 0) / slotEvaluations.length;
    
    // Вычисляем featuresSnapshot для первого слота
    const neighborCategories = {
      before: getNeighborCategory(slots, sortedIndexes[0] - 1),
      after: getNeighborCategory(slots, sortedIndexes[0] + 1)
    };
    
    const featuresSnapshot = extractFeatureVector({
      task,
      slotStart: startSlot.start,
      slotEnd: startSlot.end,
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
    
    return [{
      taskId: task.id,
      title: task.title,
      start: toIsoString(segmentStart),
      end: toIsoString(segmentEnd),
      score: averageScore,
      featuresSnapshot,
      category: task.category
    }];
  }
  
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
  // Определяем минимальный размер сегмента:
  // - Неделимые задачи (школа, спорт, питание, домашние дела) - всегда одним блоком
  // - Остальные задачи - по умолчанию 30 минут, но можно делить
  const minChunkMinutes = metadata.isIndivisible
    ? task.estimatedMinutes // Неделимая задача - всегда одним непрерывным блоком
    : (task.minChunkMinutes ?? DEFAULT_MIN_CHUNK_MINUTES);
  const minChunkSlots = Math.max(1, Math.ceil(minChunkMinutes / SLOT_MINUTES));

  const availableSet = new Set(availableIndexes);
  const runs = buildRuns(availableSet);

  // Для неделимых задач (школа, спорт, питание, домашние дела) ищем непрерывный блок
  if (metadata.isIndivisible) {
    console.log(`[INDIVISIBLE] Attempting to schedule: ${task.title}`);
    console.log(`[INDIVISIBLE] estimatedMinutes: ${task.estimatedMinutes}, requiredSlots: ${requiredSlots}`);
    console.log(`[INDIVISIBLE] admissibleIndexes: ${admissibleIndexes.length}, availableIndexes: ${availableIndexes.length}`);
    console.log(`[INDIVISIBLE] runs count: ${runs.length}, run lengths: ${runs.map(r => r.length).join(', ')}`);
    
    // Ищем все непрерывные блоки достаточной длины в доступных слотах
    for (const run of runs) {
      if (run.length < requiredSlots) {
        console.log(`[INDIVISIBLE] Run too short: ${run.length} < ${requiredSlots}`);
        continue;
      }
      
      // Ищем лучший сегмент в этом run без привязки к конкретному кандидату
      const primarySegment = bestWindowWithinRun(
        run,
        requiredSlots,
        map
      );
      
      if (!primarySegment || primarySegment.indexes.length !== requiredSlots) {
        console.log(`[INDIVISIBLE] No valid segment found in run of length ${run.length}`);
        continue;
      }

      // Неделимая задача размещается одним непрерывным блоком
      const sortedIndexes = [...primarySegment.indexes].sort((a, b) => a - b);
      const startSlot = slots[sortedIndexes[0]];
      const segmentLengthMinutes = sortedIndexes.length * SLOT_MINUTES;
      const segmentStart = startSlot.start;
      const segmentEnd = addMinutes(segmentStart, segmentLengthMinutes);

      console.log(`[INDIVISIBLE] Successfully scheduled: ${task.title} from ${segmentStart.toISOString()} to ${segmentEnd.toISOString()}`);

      markSlotsOccupied(slots, sortedIndexes, task.id, task.category);

      return [{
        taskId: task.id,
        title: task.title,
        start: toIsoString(segmentStart),
        end: toIsoString(segmentEnd),
        score: primarySegment.averageUtility,
        featuresSnapshot: primarySegment.featuresSnapshot,
        category: task.category
      }];
    }
    
    // Если не нашли подходящий блок, возвращаем пустой массив
    console.log(`[INDIVISIBLE] FAILED to schedule ${task.title}: requiredSlots=${requiredSlots}, availableRuns: ${runs.map(r => r.length).join(',')}`);
    console.log(`[INDIVISIBLE] admissibleIndexes sample:`, admissibleIndexes.slice(0, 10));
    console.log(`[INDIVISIBLE] availableIndexes sample:`, availableIndexes.slice(0, 10));
    return [];
  }

  // Для обычных задач - стандартная логика
  for (const candidate of evaluations) {
    if (!availableSet.has(candidate.index)) continue;
    const run = runs.find((sequence) => sequence.includes(candidate.index));
    if (!run) continue;

    // Для обычных задач - стандартная логика
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
  // Всегда используем детский профиль
  const profile: UserProfileKind = 'child-school-age';
  console.log(`[SCHEDULER] Starting schedule generation. Profile: ${profile}, date: ${input.date}`);
  const weights =
    input.weights && input.weights.length > 0 ? input.weights : buildDefaultWeights(profile);

  const slots = buildSlots(input.date);

  const env: DayEnvironment = {
    profile,
    meals: normalizeMealWindows(input.settings.mealOffsets),
    school: normalizeSchoolWindows(), // Всегда есть школьное окно
    sleep: normalizeSleepWindow(input.settings),
    dayOfWeek: new Date(input.date).getDay(),
    activityTargetMinutes: resolveActivityTarget(profile, input.settings)
  };
  
  console.log(`[SCHEDULER] Environment: profile=${env.profile}, dayOfWeek=${env.dayOfWeek}, schoolWindows=${env.school.length}`);

  // Шаг 1: Используем только задачи пользователя (не добавляем автоматические задачи питания)
  const allTasks = [...input.tasks];
  
  console.log(`[SCHEDULER] Input tasks count: ${allTasks.length}`);
  if (allTasks.length > 0) {
    console.log(`[SCHEDULER] Task titles:`, allTasks.map(t => t.title).join(', '));
  }

  // Шаг 2: Анализируем все задачи и определяем их фазы
  const metadataMap = new Map<string, TaskFeatureMetadata>();
  for (const task of allTasks) {
    metadataMap.set(task.id, analyzeTaskForFeatures(task));
  }

  // Шаг 3: Сначала грубо размещаем задачи с фиксированным временем,
  // сразу занимая слоты без весов и сложной логики.
  const scheduled: ScheduledSegment[] = [];
  const fixedPlaced = new Set<string>();
  for (const task of allTasks) {
    const metadata = metadataMap.get(task.id)!;
    if (task.fixedTime?.start) {
      const segment = placeFixedTask(task, metadata, slots, env);
      if (segment) {
        scheduled.push(segment);
        fixedPlaced.add(task.id);
        console.log(`[SCHEDULER] Fixed task placed: "${task.title}"`);
      } else {
        console.log(`[SCHEDULER] Failed to place fixed task: "${task.title}"`);
      }
    }
  }

  // Шаг 4: Разделяем оставшиеся задачи на фазы
  const phase0Tasks: ScheduleTask[] = [];
  const phase1Tasks: ScheduleTask[] = [];

  for (const task of allTasks) {
    if (fixedPlaced.has(task.id)) continue;
    const metadata = metadataMap.get(task.id)!;
    const phase = determineTaskPhase(task, metadata);
    
    if (phase === SchedulePhase.MANDATORY) {
      phase0Tasks.push(task);
    } else {
      phase1Tasks.push(task);
    }
  }

  // Шаг 5: Планируем ФАЗУ 0 (обязательные дела) - они ВСЕГДА размещаются первыми

  // Сортируем задачи фазы 0: fixedTime (наивысший приоритет) → школа → питание
  phase0Tasks.sort((a, b) => {
    const aMetadata = metadataMap.get(a.id)!;
    const bMetadata = metadataMap.get(b.id)!;
    
    const aHasFixed = Boolean(a.fixedTime?.start);
    const bHasFixed = Boolean(b.fixedTime?.start);
    const aIsSchool = aMetadata.isSchoolActivity;
    const bIsSchool = bMetadata.isSchoolActivity;
    const aIsMeal = aMetadata.isMealTask;
    const bIsMeal = bMetadata.isMealTask;
    
    // Приоритет 1 (наивысший): fixedTime задачи - размещаются первыми, сортируются по времени
    if (aHasFixed && !bHasFixed) return -1;
    if (!aHasFixed && bHasFixed) return 1;
    if (aHasFixed && bHasFixed) {
      return new Date(a.fixedTime!.start!).getTime() - new Date(b.fixedTime!.start!).getTime();
    }
    
    // Приоритет 2: школа
    if (aIsSchool && !bIsSchool) return -1;
    if (!aIsSchool && bIsSchool) return 1;
    
    // Приоритет 3: питание (сортировка по времени окна)
    if (aIsMeal && bIsMeal) {
      const aWindow = env.meals.find((m) => m.type === aMetadata.mealType);
      const bWindow = env.meals.find((m) => m.type === bMetadata.mealType);
      if (aWindow && bWindow) {
        return aWindow.startMinutes - bWindow.startMinutes;
      }
    }
    
    return 0;
  });

  // Размещаем задачи фазы 0
  console.log(`[SCHEDULER] Phase 0 tasks: ${phase0Tasks.length}, Phase 1 tasks: ${phase1Tasks.length}`);
  for (const task of phase0Tasks) {
    const metadata = metadataMap.get(task.id)!;
    console.log(`[SCHEDULER] Processing phase 0 task: "${task.title}", isSchool: ${metadata.isSchoolActivity}, isMeal: ${metadata.isMealTask}`);
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
      console.log(`[SCHEDULER] Successfully scheduled "${task.title}": ${segments.length} segment(s)`);
      scheduled.push(...segments);
    } else {
      console.log(`[SCHEDULER] Failed to schedule "${task.title}"`);
    }
  }

  // Шаг 5: Планируем ФАЗУ 1 (остальные задачи) - только в слоты, НЕ занятые фазой 0
  // Сортируем по приоритету: чем выше приоритет, тем раньше задача получает слот
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
      // Сначала по urgency (priority * deadline pressure) - чем выше, тем раньше
      if (b.urgency !== a.urgency) return b.urgency - a.urgency;
      // Затем по priority - чем выше, тем раньше
      if (b.task.priority !== a.task.priority) return b.task.priority - a.task.priority;
      // Затем по deadline - чем раньше дедлайн, тем раньше размещается
      const deadlineA = a.task.deadline ? new Date(a.task.deadline).getTime() : Number.MAX_SAFE_INTEGER;
      const deadlineB = b.task.deadline ? new Date(b.task.deadline).getTime() : Number.MAX_SAFE_INTEGER;
      if (deadlineA !== deadlineB) return deadlineA - deadlineB;
      // В конце по названию для стабильности сортировки
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


