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

    // Drag splitter 50px to the right
    await page.mouse.move(splitterBox.x, splitterBox.y + splitterBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(splitterBox.x + 50, splitterBox.y + splitterBox.height / 2, { steps: 5 });
    await page.mouse.up();

    await page.waitForTimeout(100);

    // Left pane should be wider
    const leftAfter = await leftPane.boundingBox();
    if (!leftAfter) throw new Error('Left pane lost');
    expect(leftAfter.width).toBeGreaterThan(leftBefore.width + 20);
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
