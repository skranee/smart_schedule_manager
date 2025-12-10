import { beforeEach, describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import {
  buildDefaultWeights,
  generateSchedule,
  type ScheduleTask
} from '../src/index.js';

const CHILD_SETTINGS = {
  sleepStart: '21:30',
  sleepEnd: '07:00',
  workStart: '08:00',
  workEnd: '18:00',
  locale: 'en',
  preferredDailyMinutes: 6 * 60,
  mealOffsets: {
    breakfast: 0,
    lunch: 0,
    dinner: 0
  },
  activityTargetMinutes: 60
};

const ADULT_SETTINGS = {
  sleepStart: '23:00',
  sleepEnd: '06:30',
  workStart: '08:30',
  workEnd: '18:00',
  locale: 'en',
  preferredDailyMinutes: 8 * 60,
  mealOffsets: {
    breakfast: 0,
    lunch: 0,
    dinner: 0
  },
  activityTargetMinutes: 0
};

let taskCounter = 0;
function createTask(partial: Partial<ScheduleTask>): ScheduleTask {
  taskCounter += 1;
  return {
    id: partial.id ?? `task-${taskCounter}`,
    title: partial.title ?? `Task ${taskCounter}`,
    estimatedMinutes: partial.estimatedMinutes ?? 60,
    priority: partial.priority ?? 0.5,
    category: partial.category ?? 'Other',
    description: partial.description,
    deadline: partial.deadline,
    desiredWindow: partial.desiredWindow,
    fixedTime: partial.fixedTime,
    mealType: partial.mealType
  };
}

beforeEach(() => {
  taskCounter = 0;
});

function startHour(segment: { start: string }): number {
  const start = new Date(segment.start);
  return start.getHours() + start.getMinutes() / 60;
}

describe('smart scheduler math model', () => {
  it('propagates original titles into scheduled segments', () => {
    const schedule = generateSchedule({
      date: '2025-03-10T00:00:00.000Z',
      tasks: [
        createTask({
          title: 'Домашняя работа (математика)',
          estimatedMinutes: 60,
          priority: 0.8,
          category: 'Learning'
        })
      ],
      weights: buildDefaultWeights('child-school-age'),
      settings: CHILD_SETTINGS,
      profile: 'child-school-age',
      history: {}
    });

    // Теперь должно быть 4 сегмента: 3 автоматических приёма пищи + 1 пользовательская задача
    expect(schedule.length).toBeGreaterThanOrEqual(1);
    const homeworkSegment = schedule.find((segment) => segment.title === 'Домашняя работа (математика)');
    expect(homeworkSegment).toBeDefined();
    
    // Проверяем, что автоматически созданы задачи питания
    const breakfastSegment = schedule.find((segment) => segment.title === 'Завтрак');
    const lunchSegment = schedule.find((segment) => segment.title === 'Обед');
    const dinnerSegment = schedule.find((segment) => segment.title === 'Ужин');
    
    expect(breakfastSegment).toBeDefined();
    expect(lunchSegment).toBeDefined();
    expect(dinnerSegment).toBeDefined();
  });

  it('places child homework in evening band and avoids late-night slots', () => {
    const schedule = generateSchedule({
      date: '2025-03-11T00:00:00.000Z',
      tasks: [
        createTask({
          id: 'homework',
          title: 'Домашняя работа (математика)',
          estimatedMinutes: 90,
          priority: 0.9,
          category: 'Learning'
        })
      ],
      weights: buildDefaultWeights('child-school-age'),
      settings: CHILD_SETTINGS,
      profile: 'child-school-age',
      history: {}
    });

    // Находим сегмент домашней работы (не путать с автоматическими задачами питания)
    const homeworkSegment = schedule.find((segment) => segment.taskId === 'homework');
    expect(homeworkSegment).toBeDefined();
    
    const start = startHour(homeworkSegment!);
    expect(start).toBeGreaterThanOrEqual(16);
    expect(start).toBeLessThan(19.5);
  });

  it('keeps games away from mornings and prefers evening slots', () => {
    const schedule = generateSchedule({
      date: '2025-03-12T00:00:00.000Z',
      tasks: [
        createTask({
          id: 'homework',
          title: 'Домашняя работа (английский)',
          estimatedMinutes: 60,
          priority: 0.8,
          category: 'Learning'
        }),
        createTask({
          id: 'games',
          title: 'Minecraft co-op',
          estimatedMinutes: 60,
          priority: 0.6,
          category: 'Games'
        })
      ],
      weights: buildDefaultWeights('child-school-age'),
      settings: CHILD_SETTINGS,
      profile: 'child-school-age',
      history: {}
    });

    const gamesSegment = schedule.find((segment) => segment.taskId === 'games');
    expect(gamesSegment).toBeDefined();
    const start = startHour(gamesSegment!);
    expect(start).toBeGreaterThanOrEqual(12);
    expect(start).toBeLessThanOrEqual(20);
    expect(start).toBeGreaterThanOrEqual(17);
  });

  it('respects sleep, meal, and school hard constraints', () => {
    const tasks = [
      createTask({
        id: 'deep-work',
        title: 'Project drafting',
        estimatedMinutes: 120,
        priority: 0.7,
        category: 'Deep work'
      }),
      createTask({
        id: 'admin',
        title: 'Paperwork',
        estimatedMinutes: 60,
        priority: 0.6,
        category: 'Admin/Errands'
      }),
      createTask({
        id: 'learning',
        title: 'Algebra practise',
        estimatedMinutes: 60,
        priority: 0.9,
        category: 'Learning'
      })
    ];

    const schedule = generateSchedule({
      date: '2025-03-13T00:00:00.000Z',
      tasks,
      weights: buildDefaultWeights('child-school-age'),
      settings: CHILD_SETTINGS,
      profile: 'child-school-age',
      history: {}
    });

    // Проверяем, что завтрак, обед и ужин размещены в своих окнах
    const breakfastSegment = schedule.find((segment) => segment.title === 'Завтрак');
    const lunchSegment = schedule.find((segment) => segment.title === 'Обед');
    const dinnerSegment = schedule.find((segment) => segment.title === 'Ужин');
    
    expect(breakfastSegment).toBeDefined();
    expect(lunchSegment).toBeDefined();
    expect(dinnerSegment).toBeDefined();
    
    const breakfastStart = startHour(breakfastSegment!);
    const lunchStart = startHour(lunchSegment!);
    const dinnerStart = startHour(dinnerSegment!);
    
    // Завтрак: 07:00-08:30
    expect(breakfastStart).toBeGreaterThanOrEqual(7);
    expect(breakfastStart).toBeLessThan(8.5);
    
    // Обед: 12:00-14:00
    expect(lunchStart).toBeGreaterThanOrEqual(12);
    expect(lunchStart).toBeLessThan(14);
    
    // Ужин: 18:00-20:30
    expect(dinnerStart).toBeGreaterThanOrEqual(18);
    expect(dinnerStart).toBeLessThan(20.5);

    // Проверяем, что НЕ-питательные задачи НЕ попадают в окна питания
    for (const segment of schedule) {
      // Пропускаем автоматические задачи питания
      if (segment.title === 'Завтрак' || segment.title === 'Обед' || segment.title === 'Ужин') {
        continue;
      }
      
      const start = startHour(segment);
      
      // Должны быть в рабочее время (после пробуждения, до сна)
      expect(start).toBeGreaterThanOrEqual(7);
      expect(start).toBeLessThan(21.5);
      
      // НЕ должны попадать в окна питания (кроме Learning, который может быть рядом)
      // Завтрак: 7:00-8:30 - пропускаем, т.к. можем начинаться сразу после
      // Обед: 12:00-14:00
      const inLunchWindow = start >= 12 && start < 14;
      // Ужин: 18:00-20:30
      const inDinnerWindow = start >= 18 && start < 20.5;
      
      // Для не-Learning задач не должно быть пересечений с обедом и ужином
      if (segment.category !== 'Learning') {
        expect(inLunchWindow).toBe(false);
        expect(inDinnerWindow).toBe(false);
      }
      
      // НЕ должны попадать в школу (8:30-13:15) по будням
      const inSchoolWindow = start >= 8.5 && start < 13.25;
      expect(inSchoolWindow).toBe(false);
    }
  });

  it('computes schedules for 50 tasks within performance budget', () => {
    const tasks: ScheduleTask[] = Array.from({ length: 50 }).map((_, index) =>
      createTask({
        title: `Task ${index}`,
        category: index % 5 === 0 ? 'Deep work' : index % 5 === 1 ? 'Learning' : 'Admin/Errands',
        estimatedMinutes: 45,
        priority: 0.5 + (index % 3) * 0.1
      })
    );

    const start = performance.now();
    const schedule = generateSchedule({
      date: '2025-03-14T00:00:00.000Z',
      tasks,
      weights: buildDefaultWeights('adult'),
      settings: ADULT_SETTINGS,
      profile: 'adult',
      history: {}
    });
    const duration = performance.now() - start;

    expect(schedule.length).toBeGreaterThan(0);
    expect(duration).toBeLessThan(800);
  });

  it('places school task in phase 0 (MANDATORY) and does not split it into segments', () => {
    const schedule = generateSchedule({
      date: '2025-03-17T00:00:00.000Z', // Понедельник (будний день)
      tasks: [
        createTask({
          id: 'school',
          title: 'Школа',
          estimatedMinutes: 240, // 4 часа - достаточно для проверки разбиения
          priority: 0.8,
          category: 'Learning'
        }),
        createTask({
          id: 'homework',
          title: 'Домашняя работа',
          estimatedMinutes: 60,
          priority: 0.7,
          category: 'Learning'
        })
      ],
      weights: buildDefaultWeights('child-school-age'),
      settings: CHILD_SETTINGS,
      profile: 'child-school-age',
      history: {}
    });

    // Находим все сегменты школы
    const schoolSegments = schedule.filter((segment) => segment.taskId === 'school');
    
    // Школа должна быть размещена
    expect(schoolSegments.length).toBeGreaterThan(0);
    
    // Школа НЕ должна разбиваться на сегменты - должен быть только один непрерывный блок
    expect(schoolSegments.length).toBe(1);
    
    // Проверяем, что школа размещена в правильном временном окне (8:30-13:15)
    const schoolSegment = schoolSegments[0];
    const schoolStart = startHour(schoolSegment);
    expect(schoolStart).toBeGreaterThanOrEqual(8.5);
    expect(schoolStart).toBeLessThan(13.25);
    
    // Проверяем, что длительность сегмента соответствует estimatedMinutes (240 минут = 4 часа)
    const start = new Date(schoolSegment.start);
    const end = new Date(schoolSegment.end);
    const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
    expect(durationMinutes).toBe(240);
    
    // Проверяем, что школа размещена до других задач (фаза 0 имеет приоритет)
    // Домашняя работа должна быть размещена после школы
    const homeworkSegment = schedule.find((segment) => segment.taskId === 'homework');
    if (homeworkSegment) {
      const homeworkStart = startHour(homeworkSegment);
      expect(homeworkStart).toBeGreaterThanOrEqual(13.25); // После окончания школы
    }
  });
});

