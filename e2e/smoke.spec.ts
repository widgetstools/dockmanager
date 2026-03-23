import { test, expect } from '@playwright/test';

test.describe('Dock Manager smoke tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders the dock manager root', async ({ page }) => {
    const root = page.locator('.dock-manager-root');
    await expect(root).toBeVisible();
  });

  test('displays tabs', async ({ page }) => {
    const tabs = page.locator('.dock-tab');
    await expect(tabs.first()).toBeVisible();
    expect(await tabs.count()).toBeGreaterThan(0);
  });

  test('displays a floating window', async ({ page }) => {
    const floating = page.locator('.dock-floating-window');
    await expect(floating.first()).toBeVisible();
  });
});
