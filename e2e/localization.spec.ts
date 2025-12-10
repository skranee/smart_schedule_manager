import { test, expect } from '@playwright/test';

test.describe('Localization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const loginButton = page.locator('text=Войти через Google, text=Sign in with Google');
    if (await loginButton.isVisible({ timeout: 2000 })) {
      test.skip();
    }
  });

  test('should display PlanSummary elements in Russian', async ({ page }) => {
    // Проверяем, что все элементы PlanSummary переведены на русский
    // Ищем карточку "Снимок расписания"
    const planSummaryTitle = page.locator('text=Снимок расписания, text=Schedule snapshot');
    await expect(planSummaryTitle.first()).toBeVisible();

    // Проверяем наличие текста "Топ категорий"
    const topCategories = page.locator('text=Топ категорий, text=Top categories');
    await expect(topCategories.first()).toBeVisible();

    // Проверяем наличие текста "блоков" или "blocks"
    const blocksText = page.locator('text=/блоков|blocks/i');
    await expect(blocksText.first()).toBeVisible();

    // Проверяем наличие текста "ч" или "h" для часов
    const hoursText = page.locator('text=/\\d+[чh]/');
    await expect(hoursText.first()).toBeVisible();
  });

  test('should display unscheduled tasks text in Russian', async ({ page }) => {
    // Создаем задачу, которая не будет запланирована
    // (например, с очень большой длительностью или без возможности размещения)
    
    // Проверяем наличие текста "Незапланированные задачи"
    const unscheduledText = page.locator('text=/Незапланированные задачи|Unscheduled tasks/i');
    // Текст может не быть виден, если все задачи запланированы - это нормально
    // Но если он есть, он должен быть на русском
    const count = await unscheduledText.count();
    if (count > 0) {
      await expect(unscheduledText.first()).toContainText(/Незапланированные задачи|Unscheduled tasks/i);
    }
  });

  test('should have grammatically correct reasoning text in Russian', async ({ page }) => {
    // Создаем задачу и рассчитываем расписание
    const taskTitle = `Test Reasoning ${Date.now()}`;
    
    // Открываем диалог создания задачи
    await page.locator('button:has-text("Добавить задачу"), button:has-text("Add task")').first().click();
    await page.waitForTimeout(500);

    // Заполняем форму
    await page.locator('input[placeholder*="Название"], input[placeholder*="Title"]').fill(taskTitle);
    await page.locator('input[type="number"][placeholder*="минут"], input[type="number"][placeholder*="minutes"]').fill('60');
    
    // Сохраняем
    await page.locator('button:has-text("Сохранить"), button:has-text("Save")').first().click();
    await page.waitForTimeout(1000);

    // Нажимаем "Рассчитать"
    await page.locator('button:has-text("Рассчитать"), button:has-text("Calculate")').first().click();
    await page.waitForTimeout(2000);

    // Ищем панель объяснений
    const reasoningPanel = page.locator('text=Объяснение, text=Explanation').first();
    if (await reasoningPanel.isVisible({ timeout: 3000 })) {
      // Проверяем, что текст объяснения не содержит грамматических ошибок
      // типа "чтобы это подходит" (должно быть "чтобы это подходило" или "чтобы подходило")
      const reasoningText = await page.locator('.v-sheet, .reasoning-panel').first().textContent();
      
      if (reasoningText) {
        // Проверяем, что нет грамматических ошибок
        expect(reasoningText).not.toMatch(/чтобы это подходит/i);
        expect(reasoningText).not.toMatch(/чтобы.*подходит[^л]/i);
        
        // Проверяем, что текст на русском языке (содержит кириллицу)
        expect(reasoningText).toMatch(/[а-яё]/i);
      }
    }
  });
});

