import { test, expect } from '@playwright/test';
import { waitForScheduleLoad, createTask, changeDate, expectTaskInList, clickCalculate } from './utils/test-helpers';

test.describe('Dashboard Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Переходим на главную страницу
    await page.goto('/');
    
    // Ждем загрузки страницы
    await page.waitForLoadState('networkidle');
    
    // Если есть экран логина, пропускаем его (для тестов нужен мок авторизации)
    // В реальном сценарии здесь должна быть авторизация
    const loginButton = page.locator('text=Войти через Google, text=Sign in with Google');
    if (await loginButton.isVisible({ timeout: 2000 })) {
      // Пропускаем авторизацию для тестов - в реальности нужен мок
      test.skip();
    }
  });

  test('should add task for today and display it', async ({ page }) => {
    const taskTitle = `Test Task Today ${Date.now()}`;
    
    // Создаем задачу на сегодня
    await createTask(page, {
      title: taskTitle,
      estimatedMinutes: 60,
      category: 'Other',
    });

    // Проверяем, что задача появилась в списке
    await expectTaskInList(page, taskTitle);
  });

  test('should add task for tomorrow and display it only on tomorrow', async ({ page }) => {
    const taskTitle = `Test Task Tomorrow ${Date.now()}`;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // Создаем задачу на завтра
    await createTask(page, {
      title: taskTitle,
      estimatedMinutes: 60,
      category: 'Other',
      scheduledDate: tomorrowStr,
    });

    // Проверяем, что задача НЕ видна сегодня
    await expectTaskNotInList(page, taskTitle);

    // Переключаемся на завтра
    await changeDate(page, 1);
    await page.waitForTimeout(1000);

    // Проверяем, что задача видна на завтра
    await expectTaskInList(page, taskTitle);
  });

  test('should add task for yesterday and display it only on yesterday', async ({ page }) => {
    const taskTitle = `Test Task Yesterday ${Date.now()}`;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // Создаем задачу на вчера
    await createTask(page, {
      title: taskTitle,
      estimatedMinutes: 60,
      category: 'Other',
      scheduledDate: yesterdayStr,
    });

    // Проверяем, что задача НЕ видна сегодня
    await expectTaskNotInList(page, taskTitle);

    // Переключаемся на вчера
    await changeDate(page, -1);
    await page.waitForTimeout(1000);

    // Проверяем, что задача видна на вчера
    await expectTaskInList(page, taskTitle);
  });

  test('should calculate schedule and display segments', async ({ page }) => {
    const taskTitle = `Test Task for Schedule ${Date.now()}`;
    
    // Создаем задачу
    await createTask(page, {
      title: taskTitle,
      estimatedMinutes: 60,
      category: 'Other',
    });

    // Нажимаем "Рассчитать"
    await clickCalculate(page);

    // Ждем загрузки расписания
    await waitForScheduleLoad(page);

    // Проверяем, что расписание отображается
    // Ищем элементы календаря или сегменты расписания
    const calendarView = page.locator('.v-calendar, .v-timeline, [data-testid="calendar-view"]').first();
    await expect(calendarView).toBeVisible();
  });

  test('should display tasks correctly when switching between days', async ({ page }) => {
    const todayTask = `Today Task ${Date.now()}`;
    const tomorrowTask = `Tomorrow Task ${Date.now()}`;
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // Создаем задачу на сегодня
    await createTask(page, {
      title: todayTask,
      estimatedMinutes: 30,
      category: 'Other',
    });

    // Создаем задачу на завтра
    await createTask(page, {
      title: tomorrowTask,
      estimatedMinutes: 30,
      category: 'Other',
      scheduledDate: tomorrowStr,
    });

    // Проверяем, что сегодня видна только задача на сегодня
    await expectTaskInList(page, todayTask);
    await expectTaskNotInList(page, tomorrowTask);

    // Переключаемся на завтра
    await changeDate(page, 1);
    await page.waitForTimeout(1000);

    // Проверяем, что на завтра видна только задача на завтра
    await expectTaskInList(page, tomorrowTask);
    await expectTaskNotInList(page, todayTask);
  });
});

