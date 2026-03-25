import { test, expect } from '@playwright/test';

test.describe('Add Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.dock-manager-root');
  });

  test('adding a panel creates a visible tab with proper width', async ({ page }) => {
    // Click the add panel button
    const addBtn = page.locator('button[title*="Add"]').first();
    await addBtn.click();
    await page.waitForTimeout(300);

    // Find the newly added tab
    const newTab = page.locator('[data-tab-id="new_panel_1"]');
    await expect(newTab).toBeVisible();

    // Tab should have a reasonable width (not truncated to near-zero)
    const box = await newTab.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(30);
  });

  test('adding multiple panels creates visible tabs for all', async ({ page }) => {
    const addBtn = page.locator('button[title*="Add"]').first();

    // Add 3 panels
    await addBtn.click();
    await page.waitForTimeout(200);
    await addBtn.click();
    await page.waitForTimeout(200);
    await addBtn.click();
    await page.waitForTimeout(200);

    // All 3 should be visible with proper width
    for (let i = 1; i <= 3; i++) {
      const tab = page.locator(`[data-tab-id="new_panel_${i}"]`);
      await expect(tab).toBeVisible();
      const box = await tab.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThan(30);
    }
  });
});
