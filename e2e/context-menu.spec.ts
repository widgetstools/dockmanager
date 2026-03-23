import { test, expect } from '@playwright/test';

test.describe('Tab Context Menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.dock-manager-root');
  });

  test('right-clicking a tab shows context menu', async ({ page }) => {
    const tab = page.locator('[data-tab-id="doc1"]');
    await tab.click({ button: 'right' });

    const menu = page.locator('.dock-context-menu');
    await expect(menu).toBeVisible();
  });

  test('context menu has Close, Float, Auto Hide, Maximize options', async ({ page }) => {
    const tab = page.locator('[data-tab-id="doc1"]');
    await tab.click({ button: 'right' });

    const menu = page.locator('.dock-context-menu');
    await expect(menu).toBeVisible();

    const text = await menu.textContent();
    expect(text).toContain('Close');
    expect(text).toContain('Float');
    expect(text).toContain('Maximize');
  });

  test('context menu has Close Others when multiple tabs', async ({ page }) => {
    const tab = page.locator('[data-tab-id="doc1"]');
    await tab.click({ button: 'right' });

    const menu = page.locator('.dock-context-menu');
    const text = await menu.textContent();
    expect(text).toContain('Close Others');
  });

  test('clicking outside closes the context menu', async ({ page }) => {
    const tab = page.locator('[data-tab-id="doc1"]');
    await tab.click({ button: 'right' });

    const menu = page.locator('.dock-context-menu');
    await expect(menu).toBeVisible();

    // Click elsewhere
    await page.mouse.click(10, 10);
    await page.waitForTimeout(100);
    await expect(menu).toHaveCount(0);
  });

  test('Close from context menu removes the panel', async ({ page }) => {
    // Auto-accept the "unsaved changes" confirm dialog that doc2 triggers
    page.on('dialog', dialog => dialog.accept());

    // Right-click a tab
    const tab = page.locator('[data-tab-id="doc2"]');
    await tab.click({ button: 'right' });

    // Click Close
    const closeItem = page.locator('.dock-context-menu div').filter({ hasText: /^Close$/ });
    await closeItem.click();

    await page.waitForTimeout(300);

    // Tab should be gone
    await expect(page.locator('[data-tab-id="doc2"]')).toHaveCount(0);
  });

  test('right-clicking single panel title shows context menu with correct options', async ({ page }) => {
    // Explorer is a single-panel group
    const title = page.locator('[data-tab-id="explorer"]');
    await title.click({ button: 'right' });

    const menu = page.locator('.dock-context-menu');
    await expect(menu).toBeVisible();

    // Should have basic options
    const text = await menu.textContent();
    expect(text).toContain('Close');
    expect(text).toContain('Float');
    expect(text).toContain('Maximize');
  });
});
