import { Page, expect } from '@playwright/test';

/**
 * Ожидает загрузки расписания на странице
 */
export async function waitForScheduleLoad(page: Page) {
  // Ожидаем, что календарь загрузился (появляется элемент с расписанием)
  await page.waitForSelector('[data-testid="calendar-view"], .v-calendar, .v-timeline', {
    timeout: 10000,
  });
}

/**
 * Переключает дату на календаре
 */
export async function changeDate(page: Page, dateOffset: number) {
  // Находим кнопку навигации по датам и кликаем нужное количество раз
  const todayButton = page.locator('text=СЕГОДНЯ, text=TODAY').first();
  if (await todayButton.isVisible()) {
    // Если нужно перейти на другую дату, используем стрелки навигации
    if (dateOffset > 0) {
      // Переход вперед
      for (let i = 0; i < dateOffset; i++) {
        await page.locator('button[aria-label*="Next"], button[aria-label*="Следующий"]').first().click();
        await page.waitForTimeout(500);
      }
    } else if (dateOffset < 0) {
      // Переход назад
      for (let i = 0; i < Math.abs(dateOffset); i++) {
        await page.locator('button[aria-label*="Previous"], button[aria-label*="Предыдущий"]').first().click();
        await page.waitForTimeout(500);
      }
    }
  }
}

/**
 * Создает задачу через UI
 */
export async function createTask(
  page: Page,
  taskData: {
    title: string;
    estimatedMinutes?: number;
    category?: string;
    scheduledDate?: string;
  }
) {
  // Открываем диалог создания задачи
  await page.locator('button:has-text("Добавить задачу"), button:has-text("Add task")').first().click();
  await page.waitForTimeout(500);

  // Заполняем форму
  await page.locator('input[placeholder*="Название"], input[placeholder*="Title"]').fill(taskData.title);

  if (taskData.estimatedMinutes) {
    await page
      .locator('input[type="number"][placeholder*="минут"], input[type="number"][placeholder*="minutes"]')
      .fill(taskData.estimatedMinutes.toString());
  }

  if (taskData.category) {
    await page.locator('select, [role="combobox"]').first().click();
    await page.locator(`text=${taskData.category}`).click();
  }

  if (taskData.scheduledDate) {
    // Находим поле для даты и заполняем его
    const dateInput = page.locator('input[type="date"]').first();
    if (await dateInput.isVisible()) {
      await dateInput.fill(taskData.scheduledDate);
    }
  }

  // Сохраняем задачу
  await page.locator('button:has-text("Сохранить"), button:has-text("Save")').first().click();
  await page.waitForTimeout(1000);
}

/**
 * Проверяет, что задача отображается в списке задач
 */
export async function expectTaskInList(page: Page, taskTitle: string) {
  await expect(page.locator(`text=${taskTitle}`).first()).toBeVisible();
}

/**
 * Проверяет, что задача НЕ отображается в списке задач
 */
export async function expectTaskNotInList(page: Page, taskTitle: string) {
  await expect(page.locator(`text=${taskTitle}`).first()).not.toBeVisible();
}

/**
 * Нажимает кнопку "Рассчитать" / "Calculate"
 */
export async function clickCalculate(page: Page) {
  await page.locator('button:has-text("Рассчитать"), button:has-text("Calculate")').first().click();
  await page.waitForTimeout(2000); // Ждем расчета расписания
}

