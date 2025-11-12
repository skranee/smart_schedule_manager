import dayjs from 'dayjs';
import { Types } from 'mongoose';
import { connectMongo, disconnectMongo } from '../src/db/connection.js';
import {
  CatalogModel,
  FeedbackModel,
  PlanModel,
  TaskModel,
  UserModel,
  type TaskDocument
} from '../src/models/index.js';
import type { TaskAttributes } from '../src/models/Task.js';
import { calculateSchedule } from '../src/services/scheduleService.js';
import { applyFeedbackUpdates } from '../src/services/modelService.js';
import { MODEL_VERSION } from '@shared/constants.js';
import type { TaskCategory } from '@shared/types.js';

const TARGET_EMAIL = 'pashaabmetkolive.ru@gmail.com';
const TARGET_NAME = 'Belarus Kid Demo';
const TARGET_GOOGLE_ID = process.env.SEED_GOOGLE_ID?.trim();
const FALLBACK_GOOGLE_ID = TARGET_GOOGLE_ID ?? `seed-google-${TARGET_EMAIL}`;
const DAYS_TO_SEED = 30;

type TaskSeed = Omit<TaskAttributes, 'createdAt' | 'updatedAt'>;

interface SerializedPlanSlot {
  start: string;
  end: string;
  taskId: string;
  score: number;
  featuresSnapshot: number[];
  category: string;
}

interface FeedbackSeed {
  userId: Types.ObjectId;
  taskId: string;
  planId: string;
  slot: {
    start: string;
    end: string;
  };
  label: 0 | 1;
  source: 'kept' | 'moved' | 'thumbs';
  note?: string;
  features: number[];
}

function atTime(day: dayjs.Dayjs, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  return day.hour(hours).minute(minutes).second(0).millisecond(0).toDate();
}

function windowFor(day: dayjs.Dayjs, start: string, end: string) {
  return {
    start: atTime(day, start),
    end: atTime(day, end)
  };
}

function createMealTask(
  tasks: TaskSeed[],
  day: dayjs.Dayjs,
  userId: Types.ObjectId,
  title: string,
  time: string,
  minutes: number,
  mealType: 'breakfast' | 'lunch' | 'dinner'
) {
  tasks.push({
    userId,
    title,
    estimatedMinutes: minutes,
    priority: 0.9,
    category: 'Healthcare',
    fixedTime: { start: atTime(day, time) },
    mealType,
    archived: false
  });
}

function createFixedTask(
  tasks: TaskSeed[],
  day: dayjs.Dayjs,
  userId: Types.ObjectId,
  title: string,
  time: string,
  minutes: number,
  category: TaskCategory,
  priority: number,
  extras: Partial<TaskSeed> = {}
) {
  tasks.push({
    userId,
    title,
    estimatedMinutes: minutes,
    priority,
    category,
    fixedTime: { start: atTime(day, time) },
    archived: false,
    ...extras
  });
}

function createWindowTask(
  tasks: TaskSeed[],
  day: dayjs.Dayjs,
  userId: Types.ObjectId,
  title: string,
  minutes: number,
  category: TaskCategory,
  priority: number,
  start: string,
  end: string,
  deadline: string,
  extras: Partial<TaskSeed> = {}
) {
  tasks.push({
    userId,
    title,
    estimatedMinutes: minutes,
    priority,
    category,
    desiredWindow: windowFor(day, start, end),
    deadline: atTime(day, deadline),
    archived: false,
    ...extras
  });
}

function buildDailyTaskSeeds(day: dayjs.Dayjs, userId: Types.ObjectId): TaskSeed[] {
  const tasks: TaskSeed[] = [];
  const weekday = day.day(); // 0 Sunday, 6 Saturday
  const isWeekend = weekday === 0 || weekday === 6;

  createMealTask(tasks, day, userId, 'Завтрак', '07:30', 30, 'breakfast');
  createMealTask(tasks, day, userId, 'Обед', '13:15', 45, 'lunch');
  createMealTask(tasks, day, userId, 'Ужин', '19:00', 45, 'dinner');

  if (!isWeekend) {
    const lessonStarts = ['08:30', '09:25', '10:20', '11:15', '12:10'];
    lessonStarts.forEach((start, index) => {
      createFixedTask(
        tasks,
        day,
        userId,
        `Школьный урок ${index + 1}`,
        start,
        45,
        'Learning',
        0.85,
        { description: 'Фиксированное школьное занятие' }
      );
    });

    const breakStarts = ['09:15', '10:10', '11:05', '12:00'];
    breakStarts.forEach((start, index) => {
      createFixedTask(
        tasks,
        day,
        userId,
        `Перемена ${index + 1}`,
        start,
        10,
        'Relaxing',
        0.3,
        { description: 'Небольшой перерыв между уроками' }
      );
    });

    const homeworkMinutes = weekday === 1 || weekday === 3 ? 90 : 60;
    createWindowTask(
      tasks,
      day,
      userId,
      'Домашняя работа (математика)',
      homeworkMinutes,
      'Learning',
      0.7,
      '16:30',
      '19:15',
      '20:30',
      { description: 'Повторение школьного материала' }
    );

    createWindowTask(
      tasks,
      day,
      userId,
      'Прогулка на улице',
      60,
      'Outdoor Play',
      0.6,
      '16:00',
      '19:00',
      '19:45',
      {
        description: 'Целевая активность на свежем воздухе',
        ai: {
          label: 'Outdoor Play',
          confidence: 0.82,
          provider: 'seed-fixture'
        }
      }
    );

    if (weekday === 1 || weekday === 5) {
      createFixedTask(
        tasks,
        day,
        userId,
        'Кружок/секция (по выбору)',
        '17:30',
        60,
        'Sport activity',
        0.5,
        { description: 'Внеурочная секция/спорт' }
      );
    }

    if (weekday === 3) {
      createFixedTask(
        tasks,
        day,
        userId,
        'Музыка/рисование',
        '17:30',
        45,
        'Creative',
        0.45,
        { description: 'Творческое занятие' }
      );
    }

    if (weekday === 2) {
      createWindowTask(
        tasks,
        day,
        userId,
        'Иностранный язык (онлайн)',
        30,
        'Learning',
        0.55,
        '17:30',
        '18:45',
        '19:30',
        { description: 'Онлайн-урок английского языка' }
      );

      createWindowTask(
        tasks,
        day,
        userId,
        'растяжка и дыхание',
        20,
        'Relaxing',
        0.4,
        '18:30',
        '19:15',
        '19:30',
        {
          description: 'Короткая расслабляющая практика',
          ai: {
            label: 'Relaxing',
            confidence: 0.88,
            provider: 'seed-fixture'
          }
        }
      );
    }

    if (weekday === 4) {
      createWindowTask(
        tasks,
        day,
        userId,
        'Помощь по дому',
        20,
        'Household',
        0.35,
        '18:00',
        '19:15',
        '19:30',
        { description: 'Простая домашняя работа: уборка, полив цветов' }
      );
    }
  } else {
    createWindowTask(
      tasks,
      day,
      userId,
      'Прогулка на улице (90 минут)',
      90,
      'Outdoor Play',
      0.6,
      '10:00',
      '14:00',
      '18:00',
      {
        description: 'Длинная прогулка для активности на свежем воздухе',
        ai: {
          label: 'Outdoor Play',
          confidence: 0.8,
          provider: 'seed-fixture'
        }
      }
    );

    createWindowTask(
      tasks,
      day,
      userId,
      'Музыка/рисование',
      60,
      'Creative',
      0.45,
      '15:00',
      '18:00',
      '19:00',
      { description: 'Творческое занятие дома' }
    );

    if (weekday === 6) {
      createWindowTask(
        tasks,
        day,
        userId,
        'прогулка в парке',
        60,
        'Relaxing',
        0.5,
        '11:00',
        '16:00',
        '18:00',
        {
          description: 'Неспешная прогулка с родителями',
          ai: {
            label: 'Relaxing',
            confidence: 0.9,
            provider: 'seed-fixture'
          }
        }
      );

      createWindowTask(
        tasks,
        day,
        userId,
        'пойти в магазин',
        30,
        'Admin/Errands',
        0.45,
        '12:00',
        '17:00',
        '18:00',
        {
          description: 'Семейный поход за продуктами',
          ai: {
            label: 'Admin/Errands',
            confidence: 0.86,
            provider: 'seed-fixture'
          }
        }
      );
    }

    if (weekday === 0) {
      createWindowTask(
        tasks,
        day,
        userId,
        'растяжка и дыхание',
        20,
        'Relaxing',
        0.4,
        '09:30',
        '11:00',
        '12:00',
        {
          description: 'Легкая утренняя зарядка',
          ai: {
            label: 'Relaxing',
            confidence: 0.85,
            provider: 'seed-fixture'
          }
        }
      );
    }
  }

  createWindowTask(
    tasks,
    day,
    userId,
    'Чтение книги',
    30,
    'Relaxing',
    0.4,
    '19:30',
    '21:00',
    '21:15',
    { description: 'Чтение перед сном' }
  );

  return tasks;
}

async function seedCatalog(userId: Types.ObjectId) {
  const now = new Date();
  const templates: {
    title: string;
    defaultMinutes: number;
    defaultPriority: number;
    category: TaskCategory;
  }[] = [
    { title: 'Домашняя работа (математика)', defaultMinutes: 60, defaultPriority: 0.7, category: 'Learning' },
    { title: 'Чтение книги', defaultMinutes: 30, defaultPriority: 0.4, category: 'Relaxing' },
    { title: 'Прогулка на улице', defaultMinutes: 60, defaultPriority: 0.6, category: 'Outdoor Play' },
    { title: 'Кружок/секция (по выбору)', defaultMinutes: 60, defaultPriority: 0.5, category: 'Sport activity' },
    { title: 'Помощь по дому', defaultMinutes: 20, defaultPriority: 0.3, category: 'Household' },
    { title: 'Иностранный язык (онлайн)', defaultMinutes: 30, defaultPriority: 0.5, category: 'Learning' },
    { title: 'Музыка/рисование', defaultMinutes: 45, defaultPriority: 0.4, category: 'Creative' }
  ];

  await CatalogModel.insertMany(
    templates.map((template) => ({
      userId,
      taskTemplate: {
        title: template.title,
        defaultMinutes: template.defaultMinutes,
        defaultPriority: template.defaultPriority,
        category: template.category
      },
      lastUsedAt: now,
      uses: 0
    }))
  );
}

function selectFeedbackSeeds(
  day: dayjs.Dayjs,
  planId: string,
  slots: SerializedPlanSlot[],
  tasksById: Map<string, TaskDocument>,
  userId: Types.ObjectId
): FeedbackSeed[] {
  const seeds: FeedbackSeed[] = [];
  const weekday = day.day();

  const findByTitle = (title: string) => {
    for (const task of tasksById.values()) {
      if (task.title === title) {
        const slot = slots.find((candidate) => candidate.taskId === task._id.toString());
        if (slot) {
          return { task, slot };
        }
      }
    }
    return undefined;
  };

  const homework = findByTitle('Домашняя работа (математика)');
  if ((weekday === 1 || weekday === 3) && homework && homework.slot.featuresSnapshot.length > 0) {
    seeds.push({
      userId,
      taskId: homework.task._id.toString(),
      planId,
      slot: {
        start: homework.slot.start,
        end: homework.slot.end
      },
      label: 0,
      source: 'moved',
      note: 'Сдвинули домашнюю работу ближе к 18:00 из-за усталости.',
      features: homework.slot.featuresSnapshot.slice()
    });
  }

  if (weekday === 4 && homework && homework.slot.featuresSnapshot.length > 0) {
    seeds.push({
      userId,
      taskId: homework.task._id.toString(),
      planId,
      slot: {
        start: homework.slot.start,
        end: homework.slot.end
      },
      label: 1,
      source: 'kept',
      note: 'Расписание домашки устроило, оставили без изменений.',
      features: homework.slot.featuresSnapshot.slice()
    });
  }

  const outdoor = findByTitle('Прогулка на улице');
  if ((weekday === 2 || weekday === 5) && outdoor && outdoor.slot.featuresSnapshot.length > 0) {
    seeds.push({
      userId,
      taskId: outdoor.task._id.toString(),
      planId,
      slot: {
        start: outdoor.slot.start,
        end: outdoor.slot.end
      },
      label: 1,
      source: 'kept',
      note: 'Прогулку оставили — хорошее время и погода.',
      features: outdoor.slot.featuresSnapshot.slice()
    });
  }

  if (weekday === 6) {
    const parkWalk = findByTitle('прогулка в парке');
    if (parkWalk && parkWalk.slot.featuresSnapshot.length > 0) {
      seeds.push({
        userId,
        taskId: parkWalk.task._id.toString(),
        planId,
        slot: {
          start: parkWalk.slot.start,
          end: parkWalk.slot.end
        },
        label: 1,
        source: 'thumbs',
        note: 'Отличная семейная прогулка — так и оставим.',
        features: parkWalk.slot.featuresSnapshot.slice()
      });
    }

    const shopping = findByTitle('пойти в магазин');
    if (shopping && shopping.slot.featuresSnapshot.length > 0) {
      seeds.push({
        userId,
        taskId: shopping.task._id.toString(),
        planId,
        slot: {
          start: shopping.slot.start,
          end: shopping.slot.end
        },
        label: 0,
        source: 'moved',
        note: 'Перенесли поход в магазин на утро, чтобы освободить вечер.',
        features: shopping.slot.featuresSnapshot.slice()
      });
    }
  }

  if (weekday === 0) {
    const reading = findByTitle('Чтение книги');
    if (reading && reading.slot.featuresSnapshot.length > 0) {
      seeds.push({
        userId,
        taskId: reading.task._id.toString(),
        planId,
      slot: {
        start: reading.slot.start,
        end: reading.slot.end
      },
        label: 1,
        source: 'kept',
        note: 'Вечернее чтение закреплено как полезная привычка.',
        features: reading.slot.featuresSnapshot.slice()
      });
    }
  }

  return seeds;
}

async function ensureDemoUser() {
  const googleIdFromEnv = TARGET_GOOGLE_ID;
  const fallbackGoogleId = FALLBACK_GOOGLE_ID;
  let user = await UserModel.findOne({ email: TARGET_EMAIL }).exec();

  if (!user) {
    user = await UserModel.create({
      googleId: fallbackGoogleId,
      email: TARGET_EMAIL,
      name: TARGET_NAME,
      locale: 'ru',
      sleepStart: '21:30',
      sleepEnd: '07:30',
      workStart: '08:30',
      workEnd: '20:00',
      preferredDailyMinutes: 10 * 60,
      profile: 'child-school-age',
      activityTargetMinutes: 60,
      model: {
        weights: [0.45, 0.45, 0.5, -0.25, -0.15, 0.3, -0.95, -1.1, -1.3, 0.4],
        updatedAt: new Date(),
        version: MODEL_VERSION
      }
    });
    console.log(`Created demo user: ${user.id}`);
    if (!googleIdFromEnv) {
      console.warn(
        'SEED_GOOGLE_ID not provided; using fallback googleId. Set SEED_GOOGLE_ID to the actual Google profile id to reuse seeded data with real logins.',
      );
    }
    return user;
  }

  if (googleIdFromEnv && user.googleId !== googleIdFromEnv) {
    user.googleId = googleIdFromEnv;
  }

  user.name = TARGET_NAME;
  user.locale = 'ru';
  user.sleepStart = '21:30';
  user.sleepEnd = '07:30';
  user.workStart = '08:30';
  user.workEnd = '20:00';
  user.preferredDailyMinutes = 10 * 60;
  user.profile = 'child-school-age';
  user.activityTargetMinutes = 60;
  user.model = {
    weights: [0.45, 0.45, 0.5, -0.25, -0.15, 0.3, -0.95, -1.1, -1.3, 0.4],
    updatedAt: new Date(),
    version: MODEL_VERSION
  };

  await user.save();
  console.log(`Updated demo user: ${user.id}`);
  return user;
}

async function main() {
  await connectMongo();
  try {
    const user = await ensureDemoUser();

    await Promise.all([
      TaskModel.deleteMany({ userId: user._id }),
      PlanModel.deleteMany({ userId: user._id }),
      FeedbackModel.deleteMany({ userId: user._id }),
      CatalogModel.deleteMany({ userId: user._id })
    ]);
    console.log('Cleared existing demo artifacts.');

    await seedCatalog(user._id);

    const initialWeights = user.model.weights.slice();
    const today = dayjs().startOf('day');
    const startDate = today.subtract(DAYS_TO_SEED - 1, 'day');

    let tasksInserted = 0;
    let plansCreated = 0;
    const feedbackSeeds: FeedbackSeed[] = [];

    for (let offset = 0; offset < DAYS_TO_SEED; offset += 1) {
      const currentDay = startDate.add(offset, 'day');
      if (currentDay.isAfter(today, 'day')) {
        break;
      }

      const taskSeeds = buildDailyTaskSeeds(currentDay, user._id);
      if (taskSeeds.length === 0) {
        continue;
      }

      const insertedTasks = await TaskModel.insertMany(taskSeeds, { ordered: true });
      tasksInserted += insertedTasks.length;

      const scheduleDateIso = currentDay.startOf('day').toISOString();
      const result = await calculateSchedule(user, scheduleDateIso);
      if (result.plan) {
        plansCreated += 1;
        const planId = result.plan.id;
        if (planId) {
          const tasksById = new Map<string, TaskDocument>(
            insertedTasks.map((doc) => [doc._id.toString(), doc])
          );
          const seeds = selectFeedbackSeeds(
            currentDay,
            planId,
            result.plan.slots as SerializedPlanSlot[],
            tasksById,
            user._id
          );
          feedbackSeeds.push(...seeds);
        }
      }

      await TaskModel.updateMany(
        { _id: { $in: insertedTasks.map((task) => task._id) } },
        { $set: { archived: true } }
      );
    }

    let finalWeights = initialWeights.slice();
    if (feedbackSeeds.length > 0) {
      const seedsWithFeatures = feedbackSeeds.filter((seed) => seed.features.length > 0);
      if (seedsWithFeatures.length > 0) {
        await FeedbackModel.insertMany(
          seedsWithFeatures.map((seed) => ({
            userId: seed.userId,
            taskId: new Types.ObjectId(seed.taskId),
            planId: new Types.ObjectId(seed.planId),
            slot: {
              start: new Date(seed.slot.start),
              end: new Date(seed.slot.end)
            },
            label: seed.label,
            source: seed.source,
            note: seed.note
          }))
        );

        const freshUser = await UserModel.findById(user._id).exec();
        if (!freshUser) {
          throw new Error('Demo user missing after inserting feedback.');
        }

        const updatedUser = await applyFeedbackUpdates(
          freshUser,
          seedsWithFeatures.map((seed) => ({
            features: seed.features,
            label: seed.label
          }))
        );

        finalWeights = updatedUser.model.weights.slice();
      }
    }

    const delta = finalWeights.map((value, index) => Number((value - initialWeights[index]).toFixed(4)));

    console.log(
      [
        `Inserted tasks: ${tasksInserted}`,
        `Built plans: ${plansCreated}`,
        `Applied feedback entries: ${feedbackSeeds.length}`,
        `Initial weights: [${initialWeights.map((w) => w.toFixed(2)).join(', ')}]`,
        `Updated weights: [${finalWeights.map((w) => w.toFixed(2)).join(', ')}]`,
        `Δw: [${delta.map((w) => w.toFixed(4)).join(', ')}]`
      ].join('\n')
    );
  } catch (error) {
    console.error('Seed script failed:', error);
    process.exitCode = 1;
  } finally {
    await disconnectMongo();
  }
}

void main();

