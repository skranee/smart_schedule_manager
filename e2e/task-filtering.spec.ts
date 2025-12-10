import { test, expect } from '@playwright/test';
import { createTask, changeDate, expectTaskInList, expectTaskNotInList } from './utils/test-helpers';

test.describe('Task Filtering by Date', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const loginButton = page.locator('text=Войти через Google, text=Sign in with Google');
    if (await loginButton.isVisible({ timeout: 2000 })) {
      test.skip();
    }
  });

  test('should show tasks without scheduledDate only on today', async ({ page }) => {
    const taskWithoutDate = `Task No Date ${Date.now()}`;
    
    // Создаем задачу без scheduledDate
    await createTask(page, {
      title: taskWithoutDate,
      estimatedMinutes: 30,
      category: 'Other',
      // Не указываем scheduledDate
    });

    // Проверяем, что задача видна сегодня
    await expectTaskInList(page, taskWithoutDate);

    // Переключаемся на завтра
    await changeDate(page, 1);
    await page.waitForTimeout(1000);

    // Проверяем, что задача НЕ видна на завтра
    await expectTaskNotInList(page, taskWithoutDate);

    // Переключаемся на вчера
    await changeDate(page, -2); // -1 от завтра = сегодня, еще -1 = вчера
    await page.waitForTimeout(1000);

    // Проверяем, что задача НЕ видна на вчера
    await expectTaskNotInList(page, taskWithoutDate);
  });

  test('should show tasks with scheduledDate only on that date', async ({ page }) => {
    const todayTask = `Today Task ${Date.now()}`;
    const tomorrowTask = `Tomorrow Task ${Date.now()}`;
    const yesterdayTask = `Yesterday Task ${Date.now()}`;
    
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Создаем задачи на разные дни
    await createTask(page, {
      title: todayTask,
      estimatedMinutes: 30,
      category: 'Other',
      scheduledDate: today.toISOString().split('T')[0],
    });

    await createTask(page, {
      title: tomorrowTask,
      estimatedMinutes: 30,
      category: 'Other',
      scheduledDate: tomorrow.toISOString().split('T')[0],
    });

    await createTask(page, {
      title: yesterdayTask,
      estimatedMinutes: 30,
      category: 'Other',
      scheduledDate: yesterday.toISOString().split('T')[0],
    });

    // Проверяем сегодня: должна быть видна только задача на сегодня
    await expectTaskInList(page, todayTask);
    await expectTaskNotInList(page, tomorrowTask);
    await expectTaskNotInList(page, yesterdayTask);

    // Переключаемся на завтра
    await changeDate(page, 1);
    await page.waitForTimeout(1000);

    // Проверяем завтра: должна быть видна только задача на завтра
    await expectTaskInList(page, tomorrowTask);
    await expectTaskNotInList(page, todayTask);
    await expectTaskNotInList(page, yesterdayTask);

    // Переключаемся на вчера
    await changeDate(page, -2);
    await page.waitForTimeout(1000);

    // Проверяем вчера: должна быть видна только задача на вчера
    await expectTaskInList(page, yesterdayTask);
    await expectTaskNotInList(page, todayTask);
    await expectTaskNotInList(page, tomorrowTask);
  });

  test('should correctly filter tasks when switching between multiple days', async ({ page }) => {
    const tasks: Array<{ title: string; date: Date }> = [];
    
    // Создаем задачи на 5 дней вперед и назад
    for (let i = -5; i <= 5; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      const title = `Task Day ${i} ${Date.now()}`;
      
      await createTask(page, {
        title,
        estimatedMinutes: 30,
        category: 'Other',
        scheduledDate: date.toISOString().split('T')[0],
      });
      
      tasks.push({ title, date });
    }

    // Проверяем каждый день
    for (let i = -5; i <= 5; i++) {
      // Переключаемся на нужный день
      const currentDate = new Date();
      currentDate.setDate(currentDate.getDate() + i);
      const targetDateStr = currentDate.toISOString().split('T')[0];
      
      // Находим задачу для этого дня
      const taskForDay = tasks.find(
        (t) => t.date.toISOString().split('T')[0] === targetDateStr
      );
      
      if (taskForDay) {
        // Переключаемся на нужный день (относительно сегодня)
        const offset = i;
        if (offset !== 0) {
          await changeDate(page, offset);
          await page.waitForTimeout(1000);
        }

        // Проверяем, что задача видна
        await expectTaskInList(page, taskForDay.title);

        // Проверяем, что задачи других дней не видны
        for (const otherTask of tasks) {
          if (otherTask.title !== taskForDay.title) {
            await expectTaskNotInList(page, otherTask.title);
          }
        }
      }
    }
  });
});

