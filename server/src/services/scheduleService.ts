import {
  describeFeatureVector,
  generateSchedule,
  type ScheduledSegment,
  type SchedulerHistory,
  type ScheduleTask,
  type TaskCategory,
  type UserSettings
} from '@shared/index.js';
import {
  PlanModel,
  TaskModel,
  type PlanDocument,
  type TaskDocument,
  type UserDocument
} from '../models/index.js';
import { getAIProvider } from '../ai/index.js';
import { translateFeatureSummary } from '../ai/featureTranslations.js';
import { serializePlan } from '../utils/serializers.js';
import { format } from 'date-fns';
import type { Locale } from 'date-fns';
import { enUS, ru } from 'date-fns/locale';
import { ensureUserWeights } from './modelService.js';

const DATE_LOCALES: Record<string, Locale> = {
  ru: ru
};

function buildHistory(previousPlans: PlanDocument[]): SchedulerHistory {
  const categoryMinutes: Partial<Record<TaskCategory, number[]>> = {};

  for (const plan of previousPlans) {
    for (const slot of plan.slots) {
      if (!slot.start) {
        console.warn('[buildHistory] Slot start is missing, skipping');
        continue;
      }
      const slotStart = slot.start instanceof Date ? slot.start : new Date(slot.start);
      if (isNaN(slotStart.getTime())) {
        console.warn('[buildHistory] Invalid slot start date, skipping:', slot.start);
        continue;
      }
      // Используем UTC-компоненты, чтобы избежать смещений из-за таймзоны
      const startMinutes = slotStart.getUTCHours() * 60 + slotStart.getUTCMinutes();
      const category = slot.category as TaskCategory;
      if (!categoryMinutes[category]) {
        categoryMinutes[category] = [];
      }
      categoryMinutes[category]?.push(startMinutes);
    }
  }

  return { categoryMinutes };
}

function extractMealOffsets(user: UserDocument) {
  return {
    breakfast: user.mealPreferences?.breakfastOffset ?? 0,
    lunch: user.mealPreferences?.lunchOffset ?? 0,
    dinner: user.mealPreferences?.dinnerOffset ?? 0
  };
}

function mapTaskDocument(task: TaskDocument): ScheduleTask {
  const category = (task.category ?? 'Other') as TaskCategory;
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    estimatedMinutes: task.estimatedMinutes,
    priority: task.priority,
    deadline: task.deadline ? task.deadline.toISOString() : undefined,
    fixedTime:
      task.fixedTime && task.fixedTime.start
        ? {
            start: task.fixedTime.start.toISOString()
          }
        : undefined,
    category
  };
}

function buildReasoningFallback(segment: ScheduledSegment, task: TaskDocument) {
  return `Placed ${task.title} from ${segment.start} to ${segment.end} due to balanced availability and constraints.`;
}

function summarizeFeature(key: string, value: number): string {
  const positive = value >= 0;
  switch (key) {
    case 'priority':
      return positive ? 'the task is important today' : 'the task can be more relaxed today';
    case 'habit_alignment':
      return positive ? 'it matches your usual routine' : 'it changes the usual routine';
    case 'circadian_fit':
      return positive ? 'it fits your energy level at that time' : 'you might feel sleepy at that time';
    case 'deadline_pressure':
      return positive ? 'a deadline is getting closer' : 'there is no rush from deadlines';
    case 'context_switch':
      return positive ? 'it follows a similar activity' : 'switching from another activity may be harder';
    case 'daily_load':
      return positive ? 'it keeps the rest of the day lighter' : 'other parts of the day are already busy';
    case 'meal_conflict':
      return positive ? 'it lines up with meal time' : 'it keeps time free for meals';
    case 'school_conflict':
      return positive ? 'it fits around the school day' : 'it avoids school lesson time';
    case 'sleep_conflict':
      return positive ? 'it respects your sleep schedule' : 'it would interrupt your sleep time';
    case 'activity_target_gap':
      return positive ? 'it helps hit your activity goal' : 'you already met the activity goal';
    default:
      return 'it keeps the plan balanced';
  }
}

function extractFeatureSummaries(segment: ScheduledSegment): string[] {
  const featureMap = describeFeatureVector(segment.featuresSnapshot);
  return Object.entries(featureMap)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 3)
    .map(([key, value]) => summarizeFeature(key, value));
}

export async function getPlanForDate(
  user: UserDocument,
  date: string,
) {
  const dayStart = new Date(date);
  dayStart.setUTCHours(0, 0, 0, 0);
  
  const plan = await PlanModel.findOne({
    userId: user._id,
    date: dayStart
  }).exec();
  
  if (!plan) {
    return null;
  }
  
  // Загружаем reasoning из слотов
  const reasoning: Record<string, string> = {};
  for (const slot of plan.slots) {
    if (slot.reasoningText) {
      reasoning[slot.taskId] = slot.reasoningText;
    }
  }
  
  return {
    plan: serializePlan(plan),
    slots: plan.slots.map((slot: any) => ({
      taskId: typeof slot.taskId === 'string' ? slot.taskId : slot.taskId.toString(),
      title: slot.title,
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      score: slot.score,
      featuresSnapshot: slot.featuresSnapshot ?? [],
      category: slot.category as any
    })),
    reasoning,
    warnings: []
  };
}

export async function calculateSchedule(
  user: UserDocument,
  date: string,
  taskIds?: string[],
) {
  // Нормализуем дату: используем только дату без времени
  const dayStart = new Date(date);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  // Получаем сегодняшнюю дату для фильтрации задач без scheduledDate
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  // Сравниваем даты по UTC для избежания проблем с часовыми поясами
  const isToday = dayStart.getTime() === today.getTime();

  // Фильтр дат: включаем задачи для выбранного дня
  // Задачи без scheduledDate показываются только на сегодня
  // Задачи с scheduledDate показываются на указанный день
  // Задачи с fixedTime.start показываются ТОЛЬКО на день, когда fixedTime.start попадает в выбранный день
  // Если у задачи есть fixedTime.start на другой день, она не должна попадать в расписание, даже если есть scheduledDate
  const dateFilter = {
    $or: [
      // Tasks with fixedTime.start in the selected day (приоритет: fixedTime определяет день)
      { 'fixedTime.start': { $gte: dayStart, $lt: dayEnd } },
      // Tasks scheduled for this specific day (только если нет fixedTime или fixedTime на этот же день)
      {
        $and: [
      { scheduledDate: { $gte: dayStart, $lt: dayEnd } },
          {
            $or: [
              { 'fixedTime.start': { $exists: false } },
              { 'fixedTime.start': null },
              { 'fixedTime.start': { $gte: dayStart, $lt: dayEnd } }
            ]
          }
        ]
      },
      // Tasks without scheduledDate show only on today (только если нет fixedTime)
      ...(isToday ? [
        {
          $and: [
            { $or: [{ scheduledDate: { $exists: false } }, { scheduledDate: null }] },
            {
              $or: [
                { 'fixedTime.start': { $exists: false } },
                { 'fixedTime.start': null }
              ]
            }
          ]
        }
      ] : [])
    ]
  };
  
  console.log(`[CALCULATE] Date: ${date}, isToday: ${isToday}, dayStart: ${dayStart.toISOString()}, dayEnd: ${dayEnd.toISOString()}`);

  const tasksQuery = TaskModel.find({
    userId: user._id,
    $and: [
      {
        $or: [
          { archived: false },
          {
            archived: true,
            'fixedTime.start': { $gte: dayStart, $lt: dayEnd }
          }
        ]
      },
      dateFilter
    ]
  });
  if (taskIds && taskIds.length > 0) {
    tasksQuery.where('_id').in(taskIds);
  }

  const tasks = await tasksQuery.exec();
  
  console.log(`[CALCULATE] Found ${tasks.length} tasks for date ${date}`);
  if (tasks.length > 0) {
    console.log(`[CALCULATE] Task titles:`, tasks.map((t: any) => t.title).join(', '));
    console.log(`[CALCULATE] Task scheduledDates:`, tasks.map((t: any) => t.scheduledDate ? new Date(t.scheduledDate).toISOString().split('T')[0] : 'null').join(', '));
  }

  if (tasks.length === 0) {
    console.log(`[CALCULATE] No tasks found - returning empty schedule`);
    return {
      plan: null,
      slots: [],
      reasoning: {},
      warnings: ['No tasks available for scheduling']
    };
  }

  const { weights, updated: weightsUpdated } = ensureUserWeights(user);
  if (weightsUpdated) {
    await user.save();
  }

  const previousPlans = await PlanModel.find({ userId: user._id })
    .sort({ date: -1 })
    .limit(5)
    .exec();

  const history = buildHistory(previousPlans);

  const schedule = generateSchedule({
    date,
    tasks: tasks.map(mapTaskDocument),
    weights,
    settings: {
      sleepStart: user.sleepStart,
      sleepEnd: user.sleepEnd,
      workStart: user.workStart,
      workEnd: user.workEnd,
      locale: user.locale,
      preferredDailyMinutes: user.preferredDailyMinutes,
      mealOffsets: extractMealOffsets(user),
      activityTargetMinutes: user.activityTargetMinutes ?? undefined
    } as UserSettings,
    history,
    profile: user.profile ?? 'child-school-age'
  });

  const aiProvider = getAIProvider();
  const reasoning: Record<string, string> = {};
  const localeCode = user.locale;
  const dateLocale = DATE_LOCALES[localeCode] ?? ru;

  for (const segment of schedule) {
    const task = tasks.find((taskDoc: TaskDocument) => taskDoc.id === segment.taskId);
    if (!task) {
      reasoning[segment.taskId] =
        localeCode === 'ru'
          ? `«${segment.title}» зарезервирован автоматически, чтобы соблюдать базовый распорядок дня.`
          : `"${segment.title}" is an automatic block that keeps the daily routine consistent.`;
      continue;
    }

    const startDate = new Date(segment.start);
    const endDate = new Date(segment.end);

    const formattedStart = format(startDate, 'PPPP p', { locale: dateLocale });
    const formattedEnd = format(endDate, 'PPPP p', { locale: dateLocale });

    const featureSummaries = extractFeatureSummaries(segment);
    const localizedFeatures = featureSummaries.map((summary) =>
      translateFeatureSummary(summary, localeCode),
    );

    try {
      const result = await aiProvider.explain({
        taskTitle: task.title,
        start: formattedStart,
        end: formattedEnd,
        topFeatures: localizedFeatures,
        locale: localeCode
      });
      reasoning[segment.taskId] = result.text;
    } catch (error) {
      const mainSummary =
        localizedFeatures[0] ?? translateFeatureSummary('it keeps the plan balanced', localeCode);
      // Убеждаемся, что mainSummary грамматически корректен для использования после "чтобы"
      const finalSummary = mainSummary ?? (localeCode === 'ru' ? 'сохранить удобный баланс дня' : 'keep your day balanced');
      const fallback =
        localeCode === 'ru'
          ? `Мы запланировали «${task.title}» на ${formattedStart} — ${formattedEnd}, чтобы ${finalSummary}.`
          : `We planned "${task.title}" for ${formattedStart} to ${formattedEnd} to ${finalSummary}.`;
      reasoning[segment.taskId] = fallback;
    }
  }

  const scheduledTaskIds = new Set(schedule.map((segment: ScheduledSegment) => segment.taskId));
  const missingTasks = tasks
    .filter((taskDoc: TaskDocument) => !scheduledTaskIds.has(taskDoc.id))
    .map((taskDoc) => taskDoc.title);

  const plan = await PlanModel.findOneAndUpdate(
    { userId: user._id, date },
    {
      userId: user._id,
      date,
      slots: schedule.map((segment: ScheduledSegment) => ({
        start: segment.start,
        end: segment.end,
        taskId: segment.taskId,
        title: segment.title,
        score: segment.score,
        featuresSnapshot: segment.featuresSnapshot,
        category: segment.category,
        reasoningText: reasoning[segment.taskId]
      }))
    },
    { new: true, upsert: true },
  ).exec();

  return {
    plan: serializePlan(plan),
    slots: schedule,
    reasoning,
    warnings: missingTasks.length
      ? [`Couldn't schedule: ${missingTasks.join(', ')}`]
      : []
  };
}

