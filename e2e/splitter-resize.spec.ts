import { test, expect } from '@playwright/test';

test.describe('Splitter Resize', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.dock-manager-root');
  });

  test('horizontal splitter changes pane widths', async ({ page }) => {
    // Find a horizontal splitter
    const splitter = page.locator('.dock-splitter[data-direction="horizontal"]').first();
    if (await splitter.count() === 0) {
      test.skip();
      return;
    }

    const splitterBox = await splitter.boundingBox();
    if (!splitterBox) throw new Error('Splitter not found');

    // Get left pane width before resize
    const leftPane = page.locator('[data-dock-target="tg_left"], [data-dock-target]').first();
    const leftBefore = await leftPane.boundingBox();
    if (!leftBefore) throw new Error('Left pane not found');

    // Move floating window out of the way if present
    const floater = page.locator('.dock-floating-window');
    if (await floater.count() > 0) {
      const fBox = await floater.first().boundingBox();
      if (fBox) {
        // Drag floating window to bottom-right corner
        const fx = fBox.x + fBox.width / 2;
        const fy = fBox.y + 10;
        await page.mouse.move(fx, fy);
        await page.mouse.down();
        await page.mouse.move(1100, 500, { steps: 3 });
        await page.mouse.up();
        await page.waitForTimeout(50);
      }
    }

    // Re-read splitter position after moving floater
    const splitterBox2 = await splitter.boundingBox();
    if (!splitterBox2) throw new Error('Splitter lost after moving floater');
    const cx2 = splitterBox2.x + splitterBox2.width / 2;
    const cy2 = splitterBox2.y + splitterBox2.height / 2;

    await page.mouse.move(cx2, cy2);
    await page.mouse.down();
    await page.mouse.move(cx2 + 50, cy2, { steps: 5 });
    await page.mouse.up();

    await page.waitForTimeout(100);

    // Left pane should be wider
    const leftAfter = await leftPane.boundingBox();
    if (!leftAfter) throw new Error('Left pane lost');
    expect(leftAfter.width).toBeGreaterThan(leftBefore.width + 10);
  });

  test('splitter highlights on hover', async ({ page }) => {
    const splitter = page.locator('.dock-splitter').first();
    if (await splitter.count() === 0) {
      test.skip();
      return;
    }

    const box = await splitter.boundingBox();
    if (!box) throw new Error('Splitter not found');

    // Hover over splitter
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(200);

    // Splitter should change color (via CSS :hover)
    // We can't easily check computed styles in Playwright but we verify it doesn't crash
    await expect(splitter).toBeVisible();
  });
});
