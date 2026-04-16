/**
 * Float → Dock invariants (e2e).
 *
 * Exercises the actual DOM drag-drop path that fi-trading-terminal hits:
 * float a panel out, then drag it onto the edge of another pane. Regardless
 * of where the drop lands, the dock must end up in a state where no panel
 * is lost, no empty tab groups are nested under splits, and every panel
 * stays visible somewhere.
 *
 * The app under test is apps/demo. Its default layout has a floating
 * panel ('floatingPane') already on-screen, so we can dock it without
 * first synthesizing a float drag (which is flaky under Playwright's
 * mouse events).
 */
import { test, expect, Page } from '@playwright/test';

/** Read reducer-side invariant state from the dock-manager debug channel. */
async function collectViolations(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const w = window as unknown as {
      __dockmanagerTestState?: () => unknown;
    };
    // Walk the DOM to find the exported DockviewComponent if present; the
    // demo app doesn't expose it, so we instead snapshot via DOM shape.
    const root = document.querySelector('.dock-manager-root');
    if (!root) return ['no dock root'];
    const violations: string[] = [];

    // EMPTY_NESTED: tab group with zero tabs that is a child of a split
    const panes = root.querySelectorAll('[data-dock-target]');
    panes.forEach(pane => {
      const tabStrip = pane.querySelector('.dock-tab-strip, [data-tab-strip]');
      // only flag if tabStrip exists but is empty
      if (tabStrip && tabStrip.children.length === 0) {
        // and the pane's parent is a split (has a sibling splitter)
        const parent = pane.parentElement;
        if (parent && parent.querySelector('.dock-splitter')) {
          violations.push(`empty pane ${pane.getAttribute('data-dock-target')} nested in split`);
        }
      }
    });

    // Void/hit-testing happens in the dock-manager console logs. The test
    // attaches a console collector separately.
    void w;
    return violations;
  });
}

test.describe('Float → Dock invariants', () => {
  let consoleErrors: string[] = [];
  let invariantWarnings: string[] = [];
  let panelLost: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    invariantWarnings = [];
    panelLost = [];

    page.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error' && text.includes('[DockManager] PANEL LOST')) {
        panelLost.push(text);
      }
      if (msg.type() === 'warn' && text.includes('[DockManager]') && text.includes('invariant violation')) {
        invariantWarnings.push(text);
      }
      if (msg.type() === 'error' && text.includes('[DockManager]')) {
        consoleErrors.push(text);
      }
    });

    // Enable the dock-manager debug channel so invariant checks run.
    await page.addInitScript(() => {
      localStorage.setItem('dock-manager-debug', '1');
    });

    await page.goto('/');
    await page.waitForSelector('.dock-manager-root');
  });

  test.afterEach(async () => {
    expect(panelLost, `panel loss during action:\n${panelLost.join('\n')}`).toEqual([]);
    expect(invariantWarnings, `invariant violations:\n${invariantWarnings.join('\n')}`).toEqual([]);
    expect(consoleErrors, `dock-manager console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });

  test('drag floating window onto each of left/right/top/bottom/center — no invariants violated', async ({ page }) => {
    for (const edge of ['left', 'right', 'top', 'bottom', 'center'] as const) {
      // Reload fresh so every variant starts from identical state.
      await page.goto('/');
      await page.waitForSelector('.dock-manager-root');

      const floating = page.locator('.dock-floating-window').first();
      await expect(floating).toBeVisible();
      const titlebar = floating.locator('.dock-floating-titlebar');
      const target = page.locator('[data-dock-target="tg_center"]');
      const pb = await target.boundingBox();
      const tb = await titlebar.boundingBox();
      if (!pb || !tb) throw new Error('boxes missing');

      // Pick a drop point inside the target pane based on which edge zone we want
      const px =
        edge === 'left' ? pb.x + 15
        : edge === 'right' ? pb.x + pb.width - 15
        : pb.x + pb.width / 2;
      const py =
        edge === 'top' ? pb.y + 15
        : edge === 'bottom' ? pb.y + pb.height - 15
        : pb.y + pb.height / 2;

      await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
      await page.mouse.down();
      await page.mouse.move(tb.x + tb.width / 2 + 5, tb.y + tb.height / 2 + 5, { steps: 3 });
      await page.mouse.move(px, py, { steps: 15 });
      await page.mouse.up();
      await page.waitForTimeout(250);

      // Panel must be placed somewhere
      const placed = await page.evaluate(() => {
        return !!document.querySelector('[data-tab-id="floatingPane"]') ||
               !!document.querySelector('[data-panel-render-id="floatingPane"]') ||
               !!document.querySelector('.dock-floating-window');
      });
      expect(placed, `floatingPane must be placed after ${edge} drop`).toBe(true);

      const violations = await collectViolations(page);
      expect(violations, `${edge} drop DOM violations:\n${violations.join('\n')}`).toEqual([]);
    }
  });

  test('dock-back button round-trips cleanly', async ({ page }) => {
    // Round-trip: dock the floating window back with the dock-back button,
    // then float it again by dragging a tab out. Exercises the sourceTabGroupId
    // memory path plus the drag-to-float path.
    const dockBack = page.locator('button[data-action="dock-back"]').first();
    await expect(dockBack).toBeVisible();
    await dockBack.click();
    await page.waitForTimeout(200);

    // Floating window gone
    await expect(page.locator('.dock-floating-window')).toHaveCount(0);
    // Panel is still present as a tab
    await expect(page.locator('[data-tab-id="floatingPane"]')).toHaveCount(1);

    const domViolations = await collectViolations(page);
    expect(domViolations).toEqual([]);
  });
});
