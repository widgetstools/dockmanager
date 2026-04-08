import { test, expect } from '@playwright/test';

/**
 * Regression tests for unpinned flyout bugs fixed in v0.1.16:
 *   1. Rich (size-dependent) content renders immediately on first hover,
 *      without needing a manual resize (the ResizeObserver / rAF nudge fix).
 *   2. Switching between multiple flyouts on the same edge does not leave
 *      the later flyout blank (stale-rAF-leak fix).
 *   3. Top/bottom edge flyouts expose a working resize handle.
 */

test.describe('Unpinned flyout — size-dependent content', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.dock-manager-root');
  });

  test('chart flyout renders canvas on first hover without resize', async ({ page }) => {
    // chartPane is unpinned on the left edge in the default layout
    await page.locator('[data-unpinned-id="chartPane"]').hover();
    await page.waitForTimeout(300);

    // Flyout contains the ChartWidget — wait for its canvas to have nonzero size
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(50);
    expect(box!.height).toBeGreaterThan(50);

    // "Waiting for container size…" placeholder must NOT be visible
    await expect(page.locator('text=Waiting for container size')).toHaveCount(0);
  });

  test('switching between sibling unpinned flyouts keeps content visible', async ({ page }) => {
    // Hover the first chart flyout
    await page.locator('[data-unpinned-id="chartPane"]').hover();
    await page.waitForTimeout(200);
    let canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    let box = await canvas.boundingBox();
    expect(box!.width).toBeGreaterThan(50);

    // Switch to the second sibling chart on the same edge
    await page.locator('[data-unpinned-id="chartPane2"]').hover();
    await page.waitForTimeout(400);

    // The new flyout's canvas must also render with non-zero size,
    // and not be corrupted to the previous flyout's dimensions.
    canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(50);
    expect(box!.height).toBeGreaterThan(50);
    await expect(page.locator('text=Waiting for container size')).toHaveCount(0);
  });

  test('ag-grid data grid renders rows on first hover without resize', async ({ page }) => {
    // dataGridPane is unpinned on the right edge
    await page.locator('[data-unpinned-id="dataGridPane"]').hover();
    await page.waitForTimeout(500);

    // AG Grid renders rows with class 'ag-row' once it has resolved layout
    const rows = page.locator('.ag-row');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThan(0);
  });
});

test.describe('Unpinned flyout — resize handles', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.dock-manager-root');
  });

  test('bottom-edge flyout has a working resize handle at its top', async ({ page }) => {
    // Output is unpinned on the bottom edge in the default layout
    await page.locator('[data-unpinned-id="unpinnedPane2"]').hover();
    await page.waitForTimeout(300);

    const handle = page.locator('.dock-flyout-resize');
    await expect(handle).toBeVisible();

    const handleBox = await handle.boundingBox();
    const flyoutBefore = await page.evaluate(() => {
      const fl = document.querySelector('.dock-manager-root')!.querySelector<HTMLElement>(
        'div[style*="position: absolute"][style*="bottom"]',
      );
      return fl ? fl.getBoundingClientRect().height : 0;
    });
    expect(handleBox).not.toBeNull();

    // Drag the handle upward by 40px to grow the flyout
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      handleBox!.x + handleBox!.width / 2,
      handleBox!.y + handleBox!.height / 2 - 40,
      { steps: 8 },
    );
    await page.mouse.up();
    await page.waitForTimeout(150);

    const flyoutAfter = await page.evaluate(() => {
      const fl = document.querySelector('.dock-manager-root')!.querySelector<HTMLElement>(
        'div[style*="position: absolute"][style*="bottom"]',
      );
      return fl ? fl.getBoundingClientRect().height : 0;
    });
    expect(flyoutAfter).toBeGreaterThan(flyoutBefore);
  });
});
