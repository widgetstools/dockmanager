import { test, expect } from '@playwright/test';

test.describe('Tab Selection & Active Pane', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.dock-manager-root');
  });

  test('clicking a tab selects it and shows blue underline', async ({ page }) => {
    // Find App.tsx tab and click it
    const appTab = page.locator('[data-tab-id="doc2"]');
    await appTab.click();

    // Should have selected+active styles (blue underline)
    await expect(appTab).toHaveClass(/dock-tab-selected/);

    // The tab group should be the active pane
    const group = appTab.locator('xpath=ancestor::*[contains(@class,"dock-tab-group")]');
    await expect(group).toHaveClass(/dock-pane-active/);
  });

  test('only one pane is active at a time', async ({ page }) => {
    // Click a tab in center pane
    await page.locator('[data-tab-id="doc1"]').click();
    let activeGroups = await page.locator('.dock-pane-active').count();
    expect(activeGroups).toBe(1);

    // Click Explorer (left pane title)
    await page.locator('[data-tab-id="explorer"]').click();
    activeGroups = await page.locator('.dock-pane-active').count();
    expect(activeGroups).toBe(1);

    // The center pane should no longer be active
    const centerGroup = page.locator('[data-dock-target="tg_center"]');
    await expect(centerGroup).not.toHaveClass(/dock-pane-active/);
  });

  test('selected tab in inactive group has no blue underline', async ({ page }) => {
    // Click index.tsx (center) to make it active
    await page.locator('[data-tab-id="doc1"]').click();

    // Now click Explorer (left) to make center inactive
    await page.locator('[data-tab-id="explorer"]').click();

    // index.tsx should still be selected but NOT have blue underline
    const doc1Tab = page.locator('[data-tab-id="doc1"]');
    await expect(doc1Tab).toHaveClass(/dock-tab-selected/);

    // Its parent group should NOT be active
    const centerGroup = page.locator('[data-dock-target="tg_center"]');
    await expect(centerGroup).not.toHaveClass(/dock-pane-active/);
  });

  test('clicking floating window makes it the active pane', async ({ page }) => {
    const floatingWindow = page.locator('.dock-floating-window');
    await expect(floatingWindow).toBeVisible();

    // Click on floating window title
    await floatingWindow.locator('.dock-floating-titlebar, .dock-float-titlebar').click();

    // Floating window should become active
    await expect(floatingWindow).toHaveClass(/dock-pane-active/);

    // No docked group should be active
    const activeDockedGroups = await page.locator('.dock-tab-group.dock-pane-active').count();
    expect(activeDockedGroups).toBe(0);
  });
});
