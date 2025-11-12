/**
 * Unit-тесты для окончательной математической модели
 * 
 * Проверяем:
 * 1. Правильность вычисления x1-x12
 * 2. Окна приёмов пищи (07:00-08:30, 12:00-14:00, 18:00-20:30)
 * 3. Циркадные предпочтения
 * 4. Детские правила (homework, games)
 */

import { describe, it, expect } from 'vitest';
import { set } from 'date-fns';
import {
  extractFeatureVector,
  analyzeTaskForFeatures,
  normalizeMealWindows,
  normalizeSleepWindow,
  normalizeSchoolWindows,
  type FeatureComputationContext
} from '../src/features/featureExtractor.js';
import { circadianPreference } from '../src/features/timeCurves.js';
import type { TaskBase, UserSettings } from '../src/types.js';

describe('Окончательная математическая модель', () => {
  const defaultSettings: UserSettings = {
    sleepStart: '23:00',
    sleepEnd: '07:00',
    workStart: '09:00',
    workEnd: '18:00',
    locale: 'ru'
  };

  describe('Окна приёмов пищи', () => {
    it('Завтрак: 07:00–08:30', () => {
      const meals = normalizeMealWindows({});
      const breakfast = meals.find((m) => m.type === 'breakfast');
      expect(breakfast?.startMinutes).toBe(7 * 60);
      expect(breakfast?.endMinutes).toBe(8 * 60 + 30);
    });

    it('Обед: 12:00–14:00', () => {
      const meals = normalizeMealWindows({});
      const lunch = meals.find((m) => m.type === 'lunch');
      expect(lunch?.startMinutes).toBe(12 * 60);
      expect(lunch?.endMinutes).toBe(14 * 60);
    });

    it('Ужин: 18:00–20:30', () => {
      const meals = normalizeMealWindows({});
      const dinner = meals.find((m) => m.type === 'dinner');
      expect(dinner?.startMinutes).toBe(18 * 60);
      expect(dinner?.endMinutes).toBe(20 * 60 + 30);
    });
  });

  describe('x1: Циркадное предпочтение', () => {
    it('Домашнее задание: +1 в [16:00, 19:30)', () => {
      const fit = circadianPreference({
        category: 'Learning',
        hour: 17,
        isHomework: true
      });
      expect(fit).toBe(1);
    });

    it('Домашнее задание: +0.2 в [19:30, 21:00)', () => {
      const fit = circadianPreference({
        category: 'Learning',
        hour: 19.5,
        isHomework: true
      });
      expect(fit).toBe(0.2);
    });

    it('Игры: +1 в [17:00, 20:00]', () => {
      const fit = circadianPreference({
        category: 'Games',
        hour: 18,
        isGamesTask: true
      });
      expect(fit).toBe(1);
    });

    it('Игры: -1 при h<12', () => {
      const fit = circadianPreference({
        category: 'Games',
        hour: 10,
        isGamesTask: true
      });
      expect(fit).toBe(-1);
    });

    it('Питание: +1 в своём окне', () => {
      const fit = circadianPreference({
        category: 'Healthcare',
        hour: 13,
        isMealTask: true,
        inOwnMealWindow: true
      });
      expect(fit).toBe(1);
    });

    it('Питание: -1 вне своего окна', () => {
      const fit = circadianPreference({
        category: 'Healthcare',
        hour: 10,
        isMealTask: true,
        inOwnMealWindow: false
      });
      expect(fit).toBe(-1);
    });
  });

  describe('x2: Давление дедлайна', () => {
    it('tau=6 часов', () => {
      const task: TaskBase = {
        title: 'Тестовая задача',
        estimatedMinutes: 60,
        priority: 0.5,
        deadline: new Date('2025-11-09T18:00:00Z').toISOString(),
        category: 'Other'
      };

      const slotStart = new Date('2025-11-09T12:00:00Z');
      const slotEnd = new Date('2025-11-09T12:15:00Z');

      const context: FeatureComputationContext = {
        task,
        slotStart,
        slotEnd,
        settings: defaultSettings,
        profile: 'adult',
        minutesScheduledSoFar: 0,
        plannedMinutesForTask: 60,
        minutesScheduledForCategory: 0,
        meals: normalizeMealWindows({}),
        school: [],
        sleep: normalizeSleepWindow(defaultSettings),
        forcedByUser: false,
        dayOfWeek: 6,
        taskMetadata: analyzeTaskForFeatures(task),
        activityProgress: { scheduledMinutes: 0, targetMinutes: 0 }
      };

      const features = extractFeatureVector(context);
      const x2 = features[1]; // deadline_pressure

      // delta = 6 часов, tau=6 => x2 = 1 - exp(-1) ≈ 0.632
      expect(x2).toBeCloseTo(0.632, 2);
    });
  });

  describe('x7: Конфликт с приёмами пищи', () => {
    it('Питание в своём окне: +1', () => {
      const task: TaskBase = {
        title: 'Обед',
        estimatedMinutes: 40,
        priority: 0.5,
        category: 'Healthcare',
        mealType: 'lunch'
      };

      // 12:30 UTC = 12:30 local (в пределах 12:00-14:00)
      const slotStart = new Date('2025-11-09T12:30:00');
      const slotEnd = new Date('2025-11-09T12:45:00');

      const context: FeatureComputationContext = {
        task,
        slotStart,
        slotEnd,
        settings: defaultSettings,
        profile: 'adult',
        minutesScheduledSoFar: 0,
        plannedMinutesForTask: 40,
        minutesScheduledForCategory: 0,
        meals: normalizeMealWindows({}),
        school: [],
        sleep: normalizeSleepWindow(defaultSettings),
        forcedByUser: false,
        dayOfWeek: 3,
        taskMetadata: analyzeTaskForFeatures(task),
        activityProgress: { scheduledMinutes: 0, targetMinutes: 0 }
      };

      const features = extractFeatureVector(context);
      const x7 = features[6]; // meal_conflict
      expect(x7).toBe(1);
    });

    it('НЕ питание в окне питания: -1', () => {
      const task: TaskBase = {
        title: 'Работа',
        estimatedMinutes: 60,
        priority: 0.5,
        category: 'Deep work'
      };

      // 12:30 local (в пределах 12:00-14:00, окно обеда)
      const slotStart = new Date('2025-11-09T12:30:00');
      const slotEnd = new Date('2025-11-09T12:45:00');

      const context: FeatureComputationContext = {
        task,
        slotStart,
        slotEnd,
        settings: defaultSettings,
        profile: 'adult',
        minutesScheduledSoFar: 0,
        plannedMinutesForTask: 60,
        minutesScheduledForCategory: 0,
        meals: normalizeMealWindows({}),
        school: [],
        sleep: normalizeSleepWindow(defaultSettings),
        forcedByUser: false,
        dayOfWeek: 3,
        taskMetadata: analyzeTaskForFeatures(task),
        activityProgress: { scheduledMinutes: 0, targetMinutes: 0 }
      };

      const features = extractFeatureVector(context);
      const x7 = features[6]; // meal_conflict
      expect(x7).toBe(-1);
    });
  });

  describe('x11: Штраф за вечернюю домашку', () => {
    it('h>=20: -1', () => {
      const task: TaskBase = {
        title: 'Домашнее задание',
        estimatedMinutes: 60,
        priority: 0.5,
        category: 'Learning'
      };

      const slotStart = new Date('2025-11-09T20:00:00Z');
      const slotEnd = new Date('2025-11-09T20:15:00Z');

      const context: FeatureComputationContext = {
        task,
        slotStart,
        slotEnd,
        settings: defaultSettings,
        profile: 'child-school-age',
        minutesScheduledSoFar: 0,
        plannedMinutesForTask: 60,
        minutesScheduledForCategory: 0,
        meals: normalizeMealWindows({}),
        school: normalizeSchoolWindows(),
        sleep: normalizeSleepWindow(defaultSettings),
        forcedByUser: false,
        dayOfWeek: 3,
        taskMetadata: analyzeTaskForFeatures(task),
        activityProgress: { scheduledMinutes: 0, targetMinutes: 0 }
      };

      const features = extractFeatureVector(context);
      const x11 = features[10]; // homework_evening_penalty
      expect(x11).toBe(-1);
    });

    it('19<=h<20: -0.5', () => {
      const task: TaskBase = {
        title: 'Домашнее задание',
        estimatedMinutes: 60,
        priority: 0.5,
        category: 'Learning'
      };

      // 19:00 local (в пределах 19:00-20:00)
      const slotStart = new Date('2025-11-09T19:00:00');
      const slotEnd = new Date('2025-11-09T19:15:00');

      const context: FeatureComputationContext = {
        task,
        slotStart,
        slotEnd,
        settings: defaultSettings,
        profile: 'child-school-age',
        minutesScheduledSoFar: 0,
        plannedMinutesForTask: 60,
        minutesScheduledForCategory: 0,
        meals: normalizeMealWindows({}),
        school: normalizeSchoolWindows(),
        sleep: normalizeSleepWindow(defaultSettings),
        forcedByUser: false,
        dayOfWeek: 3,
        taskMetadata: analyzeTaskForFeatures(task),
        activityProgress: { scheduledMinutes: 0, targetMinutes: 0 }
      };

      const features = extractFeatureVector(context);
      const x11 = features[10]; // homework_evening_penalty
      expect(x11).toBe(-0.5);
    });
  });

  describe('x12: Штраф за игры утром', () => {
    it('h<12: -1', () => {
      const task: TaskBase = {
        title: 'Игра',
        estimatedMinutes: 60,
        priority: 0.5,
        category: 'Games'
      };

      const baseDate = new Date('2025-11-09');
      const slotStart = set(baseDate, { hours: 10, minutes: 0, seconds: 0, milliseconds: 0 });
      const slotEnd = set(baseDate, { hours: 10, minutes: 15, seconds: 0, milliseconds: 0 });

      const context: FeatureComputationContext = {
        task,
        slotStart,
        slotEnd,
        settings: defaultSettings,
        profile: 'child-school-age',
        minutesScheduledSoFar: 0,
        plannedMinutesForTask: 60,
        minutesScheduledForCategory: 0,
        meals: normalizeMealWindows({}),
        school: normalizeSchoolWindows(),
        sleep: normalizeSleepWindow(defaultSettings),
        forcedByUser: false,
        dayOfWeek: 6,
        taskMetadata: analyzeTaskForFeatures(task),
        activityProgress: { scheduledMinutes: 0, targetMinutes: 0 }
      };

      const features = extractFeatureVector(context);
      const x12 = features[11]; // games_morning_penalty
      expect(x12).toBe(-1);
    });

    it('17<=h<=20: +0.5', () => {
      const task: TaskBase = {
        title: 'Игра',
        estimatedMinutes: 60,
        priority: 0.5,
        category: 'Games'
      };

      const baseDate = new Date('2025-11-09');
      const slotStart = set(baseDate, { hours: 18, minutes: 0, seconds: 0, milliseconds: 0 });
      const slotEnd = set(baseDate, { hours: 18, minutes: 15, seconds: 0, milliseconds: 0 });

      const context: FeatureComputationContext = {
        task,
        slotStart,
        slotEnd,
        settings: defaultSettings,
        profile: 'child-school-age',
        minutesScheduledSoFar: 0,
        plannedMinutesForTask: 60,
        minutesScheduledForCategory: 0,
        meals: normalizeMealWindows({}),
        school: normalizeSchoolWindows(),
        sleep: normalizeSleepWindow(defaultSettings),
        forcedByUser: false,
        dayOfWeek: 6,
        taskMetadata: analyzeTaskForFeatures(task),
        activityProgress: { scheduledMinutes: 0, targetMinutes: 0 }
      };

      const features = extractFeatureVector(context);
      const x12 = features[11]; // games_morning_penalty
      expect(x12).toBe(0.5);
    });
  });

  describe('RU-only паттерны', () => {
    it('Распознаёт "Домашнее задание" как homework', () => {
      const task: TaskBase = {
        title: 'Домашнее задание по математике',
        estimatedMinutes: 60,
        priority: 0.5,
        category: 'Learning'
      };

      const metadata = analyzeTaskForFeatures(task);
      expect(metadata.isHomework).toBe(true);
    });

    it('Распознаёт "Игра" как games', () => {
      const task: TaskBase = {
        title: 'Игра в Майнкрафт',
        estimatedMinutes: 60,
        priority: 0.5,
        category: 'Games'
      };

      const metadata = analyzeTaskForFeatures(task);
      expect(metadata.isGamesTask).toBe(true);
    });

    it('Распознаёт "Обед" как meal', () => {
      const task: TaskBase = {
        title: 'Обед',
        estimatedMinutes: 40,
        priority: 0.5,
        category: 'Healthcare'
      };

      const metadata = analyzeTaskForFeatures(task);
      expect(metadata.isMealTask).toBe(true);
      expect(metadata.mealType).toBe('lunch');
    });
  });
});

