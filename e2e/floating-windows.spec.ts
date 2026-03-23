import { test, expect } from '@playwright/test';

test.describe('Floating Windows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.dock-manager-root');
  });

  test('floating window renders with title and content', async ({ page }) => {
    const floating = page.locator('.dock-floating-window');
    await expect(floating).toBeVisible();

    // Has a title bar
    const titlebar = floating.locator('.dock-floating-titlebar, .dock-float-titlebar');
    await expect(titlebar).toBeVisible();

    // Has dock-back and close buttons
    const buttons = floating.locator('button');
    const btnCount = await buttons.count();
    expect(btnCount).toBeGreaterThanOrEqual(2);
  });

  test('floating window can be moved by dragging titlebar', async ({ page }) => {
    const floating = page.locator('.dock-floating-window');
    const titlebar = floating.locator('.dock-floating-titlebar, .dock-float-titlebar');

    const initialBox = await floating.boundingBox();
    const titleBox = await titlebar.boundingBox();
    if (!initialBox || !titleBox) throw new Error('Floating window not found');

    // Drag titlebar 100px right and 50px down
    await page.mouse.move(titleBox.x + titleBox.width / 2, titleBox.y + titleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      titleBox.x + titleBox.width / 2 + 100,
      titleBox.y + titleBox.height / 2 + 50,
      { steps: 10 }
    );
    await page.mouse.up();

    // Wait for rAF + React re-render to complete
    await page.waitForTimeout(200);

    // Position should have changed
    const newBox = await floating.boundingBox();
    if (!newBox) throw new Error('Floating window lost');
    expect(Math.abs(newBox.x - initialBox.x - 100)).toBeLessThan(15);
    expect(Math.abs(newBox.y - initialBox.y - 50)).toBeLessThan(15);
  });

  test('closing floating window removes it', async ({ page }) => {
    const floating = page.locator('.dock-floating-window');
    await expect(floating).toBeVisible();

    // Click the close button (last button in titlebar)
    const closeBtn = floating.locator('button[data-action="close"]');
    if (await closeBtn.count() > 0) {
      await closeBtn.click();
    } else {
      // Fallback: click last button
      const buttons = floating.locator('button');
      await buttons.last().click();
    }

    await page.waitForTimeout(200);
    await expect(floating).toHaveCount(0);
  });

  test('float button exists on docked panels', async ({ page }) => {
    // Verify float buttons are rendered on docked panels
    await page.locator('[data-tab-id="doc1"]').click();
    await page.waitForTimeout(100);

    const floatBtn = page.locator('button[data-action="float"]');
    const count = await floatBtn.count();
    expect(count).toBeGreaterThan(0);
  });
});
