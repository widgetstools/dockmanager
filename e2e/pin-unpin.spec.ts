import { test, expect } from '@playwright/test';

test.describe('Pin / Unpin (Auto-Hide)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.dock-manager-root');
  });

  test('unpinned panels render in edge strips on load', async ({ page }) => {
    // Default layout has Terminal on left edge, Output on bottom edge
    const leftStrip = page.locator('[data-unpinned-id="unpinnedPane1"]');
    const bottomStrip = page.locator('[data-unpinned-id="unpinnedPane2"]');

    await expect(leftStrip).toBeVisible();
    await expect(bottomStrip).toBeVisible();

    // They should NOT be in the docked layout
    await expect(page.locator('[data-dock-target] [data-tab-id="unpinnedPane1"]')).toHaveCount(0);
    await expect(page.locator('[data-dock-target] [data-tab-id="unpinnedPane2"]')).toHaveCount(0);
  });

  test('hovering unpinned tab opens flyout', async ({ page }) => {
    const terminalTab = page.locator('[data-unpinned-id="unpinnedPane1"]');
    await terminalTab.hover();
    await page.waitForTimeout(500);

    // Flyout should appear with a pin button and content
    const pinBtn = page.locator('button[title*="Pin"]');
    await expect(pinBtn.first()).toBeVisible();
  });

  test('pinning a panel removes it from the unpinned strip', async ({ page }) => {
    // Hover Terminal to open flyout
    const terminalTab = page.locator('[data-unpinned-id="unpinnedPane1"]');
    await terminalTab.hover();
    await page.waitForTimeout(500);

    // Click pin button
    const pinBtn = page.locator('button[title*="Pin"]');
    await pinBtn.first().click();
    await page.waitForTimeout(300);

    // Terminal should be in the docked layout
    await expect(page.locator('[data-tab-id="unpinnedPane1"]')).toHaveCount(1);

    // Terminal should NOT be in the unpinned strip
    await expect(page.locator('[data-unpinned-id="unpinnedPane1"]')).toHaveCount(0);
  });

  test('pinned panel does not reappear in strip when another panel is unpinned', async ({ page }) => {
    // Step 1: Pin Terminal from unpinned strip
    const terminalTab = page.locator('[data-unpinned-id="unpinnedPane1"]');
    await terminalTab.hover();
    await page.waitForTimeout(500);
    await page.locator('button[title*="Pin"]').first().click();
    await page.waitForTimeout(300);

    // Verify Terminal is docked only
    await expect(page.locator('[data-tab-id="unpinnedPane1"]')).toHaveCount(1);
    await expect(page.locator('[data-unpinned-id="unpinnedPane1"]')).toHaveCount(0);

    // Step 2: Unpin Explorer via context menu
    await page.locator('[data-tab-id="explorer"]').click({ button: 'right' });
    const menu = page.locator('.dock-context-menu');
    await expect(menu).toBeVisible();
    await menu.locator('div').filter({ hasText: /^Unpin$/ }).click();
    await page.waitForTimeout(300);

    // Explorer should be in unpinned strip, not in layout
    await expect(page.locator('[data-unpinned-id="explorer"]')).toHaveCount(1);
    await expect(page.locator('[data-dock-target] [data-tab-id="explorer"]')).toHaveCount(0);

    // Terminal should STILL be docked only — not back in the strip
    await expect(page.locator('[data-tab-id="unpinnedPane1"]')).toHaveCount(1);
    await expect(page.locator('[data-unpinned-id="unpinnedPane1"]')).toHaveCount(0);
  });

  test('unpin via context menu moves panel to edge strip', async ({ page }) => {
    // Right-click Explorer → Unpin
    await page.locator('[data-tab-id="explorer"]').click({ button: 'right' });
    const menu = page.locator('.dock-context-menu');
    await menu.locator('div').filter({ hasText: /^Unpin$/ }).click();
    await page.waitForTimeout(300);

    // Explorer should be in the unpinned strip
    await expect(page.locator('[data-unpinned-id="explorer"]')).toHaveCount(1);

    // Explorer should NOT be in the docked layout
    await expect(page.locator('[data-dock-target] [data-tab-id="explorer"]')).toHaveCount(0);
  });

  test('pin then unpin the same panel round-trips correctly', async ({ page }) => {
    // Pin Terminal
    await page.locator('[data-unpinned-id="unpinnedPane1"]').hover();
    await page.waitForTimeout(500);
    await page.locator('button[title*="Pin"]').first().click();
    await page.waitForTimeout(300);

    await expect(page.locator('[data-tab-id="unpinnedPane1"]')).toHaveCount(1);
    await expect(page.locator('[data-unpinned-id="unpinnedPane1"]')).toHaveCount(0);

    // Unpin Terminal via context menu
    await page.locator('[data-tab-id="unpinnedPane1"]').click({ button: 'right' });
    const menu = page.locator('.dock-context-menu');
    await menu.locator('div').filter({ hasText: /^Unpin$/ }).click();
    await page.waitForTimeout(300);

    // Terminal should be back in the unpinned strip
    await expect(page.locator('[data-unpinned-id="unpinnedPane1"]')).toHaveCount(1);
    await expect(page.locator('[data-dock-target] [data-tab-id="unpinnedPane1"]')).toHaveCount(0);
  });
});
