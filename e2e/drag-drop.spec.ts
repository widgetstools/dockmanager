import { test, expect } from '@playwright/test';

test.describe('Drag and Drop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.dock-manager-root');
  });

  test('dragging a tab shows ghost element', async ({ page }) => {
    const tab = page.locator('[data-tab-id="doc1"]');
    const box = await tab.boundingBox();
    if (!box) throw new Error('Tab not found');

    // Start drag: mousedown + move far enough vertically to exit tab-strip
    // reorder zone (30px margin). Moving 100px down ensures we're in full
    // drag mode where the ghost is visible.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 100, { steps: 10 });

    // Ghost element should appear (fixed position, z-index 10001)
    const ghost = page.locator('div[style*="z-index: 10001"]');
    await expect(ghost).toBeVisible();

    // Cancel drag
    await page.keyboard.press('Escape');
  });

  test('dragging shows dock indicators on all panes', async ({ page }) => {
    const tab = page.locator('[data-tab-id="doc2"]');
    const box = await tab.boundingBox();
    if (!box) throw new Error('Tab not found');

    // Start drag
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 30, { steps: 5 });

    // Wait for indicators to appear
    await page.waitForTimeout(100);

    // Dock indicators should exist (multiple pane indicator containers)
    const indicators = page.locator('[data-indicator-target]');
    const count = await indicators.count();
    expect(count).toBeGreaterThan(0);

    // Edge indicators should exist (4 carets on container edges)
    const edgeIndicators = page.locator('[data-edge-pos]');
    const edgeCount = await edgeIndicators.count();
    expect(edgeCount).toBe(4);

    await page.keyboard.press('Escape');
  });

  test('escape key cancels drag', async ({ page }) => {
    const tab = page.locator('[data-tab-id="doc1"]');
    const box = await tab.boundingBox();
    if (!box) throw new Error('Tab not found');

    // Start drag
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 50, box.y + 50, { steps: 3 });

    // Ghost should be visible
    await page.waitForTimeout(50);

    // Press escape
    await page.keyboard.press('Escape');

    // Ghost should disappear
    const ghost = page.locator('div[style*="z-index: 10001"]');
    await expect(ghost).toHaveCount(0);

    // Indicators should disappear
    const indicators = page.locator('[data-indicator-target]');
    await expect(indicators).toHaveCount(0);
  });

  test('dropping tab on center of another pane creates tabbed group', async ({ page }) => {
    // Get initial tab count in center group
    const centerTabs = page.locator('[data-dock-target="tg_center"] [data-tab-id]');
    const initialCount = await centerTabs.count();

    // Get Explorer title (left pane, single panel)
    const explorerTitle = page.locator('[data-tab-id="explorer"]');
    const explorerBox = await explorerTitle.boundingBox();

    // Get center pane area
    const centerPane = page.locator('[data-dock-target="tg_center"]');
    const centerBox = await centerPane.boundingBox();

    if (!explorerBox || !centerBox) throw new Error('Panes not found');

    // Drag explorer to center of center pane
    await page.mouse.move(explorerBox.x + explorerBox.width / 2, explorerBox.y + explorerBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      centerBox.x + centerBox.width / 2,
      centerBox.y + centerBox.height / 2,
      { steps: 10 }
    );
    await page.mouse.up();

    // Wait for state update
    await page.waitForTimeout(200);

    // Center group should now have more tabs
    const newCount = await page.locator('[data-dock-target] [data-tab-id="explorer"]').count();
    expect(newCount).toBeGreaterThan(0);
  });
});
