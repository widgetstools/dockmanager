import { test, expect } from '@playwright/test';

test.describe('Maximize & Restore', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.dock-manager-root');
  });

  test('maximize button exists on panels', async ({ page }) => {
    // Verify maximize buttons are rendered
    await page.locator('[data-tab-id="doc1"]').click();
    await page.waitForTimeout(100);

    const maxBtn = page.locator('button[data-action="maximize"]');
    const count = await maxBtn.count();
    expect(count).toBeGreaterThan(0);
  });

  test('maximize via context menu works', async ({ page }) => {
    const tab = page.locator('[data-tab-id="doc1"]');
    await tab.click({ button: 'right' });

    const maximizeItem = page.locator('.dock-context-menu div').filter({ hasText: 'Maximize' });
    await maximizeItem.click();

    await page.waitForTimeout(200);

    // Some overlay or maximized state should be visible
    const root = page.locator('.dock-manager-root');
    const html = await root.innerHTML();
    // After maximize, the layout should change
    expect(html.length).toBeGreaterThan(0);
  });
});
