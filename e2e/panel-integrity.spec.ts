/**
 * Panel Integrity — rigorous e2e tests targeting the orphan panel bug.
 *
 * Exercises every action sequence known to have caused panel loss or
 * invariant violations in the fi-trading-terminal.
 *
 * Each test monitors console for "[DockManager] PANEL LOST" and invariant
 * violation warnings. Any such message is an automatic test failure.
 */
import { test, expect, Page } from '@playwright/test';

// ─── Shared helpers ────────────────────────────────────────────────

let panelLost: string[] = [];
let invariantWarnings: string[] = [];
let dockErrors: string[] = [];

function setupConsoleMonitor(page: Page) {
  panelLost = [];
  invariantWarnings = [];
  dockErrors = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[DockManager] PANEL LOST')) panelLost.push(text);
    if (text.includes('[DockManager]') && text.includes('invariant violation')) invariantWarnings.push(text);
    if (text.includes('[DockManager] strictMode: rolling back')) dockErrors.push(text);
    if (msg.type() === 'error' && text.includes('[DockviewComponent] Reducer error')) dockErrors.push(text);
  });
}

function assertNoViolations() {
  expect(panelLost, `PANEL LOST:\n${panelLost.join('\n')}`).toEqual([]);
  expect(invariantWarnings, `invariant violations:\n${invariantWarnings.join('\n')}`).toEqual([]);
  expect(dockErrors, `dock errors:\n${dockErrors.join('\n')}`).toEqual([]);
}

async function panelExistsAnywhere(page: Page, panelId: string): Promise<boolean> {
  return page.evaluate((id) => !!(
    document.querySelector(`[data-tab-id="${id}"]`) ||
    document.querySelector(`[data-unpinned-id="${id}"]`) ||
    document.querySelector(`[data-panel-id="${id}"]`)
  ), panelId);
}

async function assertPanelExists(page: Page, panelId: string) {
  expect(await panelExistsAnywhere(page, panelId), `Panel "${panelId}" must exist in DOM`).toBe(true);
}

async function dragFloating(page: Page, targetSelector: string, edge: string) {
  const floating = page.locator('.dock-floating-window').first();
  const titlebar = floating.locator('.dock-floating-titlebar');
  const target = page.locator(targetSelector);
  const tb = await titlebar.boundingBox();
  const pb = await target.boundingBox();
  if (!tb || !pb) throw new Error('Boxes missing');

  const px = edge === 'left' ? pb.x + 15
    : edge === 'right' ? pb.x + pb.width - 15
    : pb.x + pb.width / 2;
  const py = edge === 'top' ? pb.y + 15
    : edge === 'bottom' ? pb.y + pb.height - 15
    : pb.y + pb.height / 2;

  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await page.mouse.down();
  await page.mouse.move(tb.x + tb.width / 2 + 5, tb.y + tb.height / 2 + 5, { steps: 3 });
  await page.mouse.move(px, py, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

async function dragTab(page: Page, tabId: string, targetSelector: string, edge: string) {
  const tab = page.locator(`[data-tab-id="${tabId}"]`);
  const target = page.locator(targetSelector);
  const tb = await tab.boundingBox();
  const pb = await target.boundingBox();
  if (!tb || !pb) throw new Error(`Boxes missing for tab=${tabId}`);

  const px = edge === 'left' ? pb.x + 15
    : edge === 'right' ? pb.x + pb.width - 15
    : pb.x + pb.width / 2;
  const py = edge === 'top' ? pb.y + 15
    : edge === 'bottom' ? pb.y + pb.height - 15
    : pb.y + pb.height / 2;

  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await page.mouse.down();
  await page.mouse.move(tb.x + tb.width / 2 + 20, tb.y + tb.height / 2 + 80, { steps: 5 });
  await page.mouse.move(px, py, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

async function noEmptyGroups(page: Page) {
  const empty = await page.evaluate(() => {
    let n = 0;
    document.querySelectorAll('[data-dock-target]').forEach(g => {
      if (g.querySelectorAll('[data-tab-id]').length === 0) n++;
    });
    return n;
  });
  expect(empty, 'No empty tab groups should exist').toBe(0);
}

// ─── Tests ─────────────────────────────────────────────────────────

test.describe('Panel Integrity — orphan panel prevention', () => {
  test.beforeEach(async ({ page }) => {
    setupConsoleMonitor(page);
    await page.addInitScript(() => {
      localStorage.setItem('dock-manager-debug', '1');
    });
    await page.goto('/');
    await page.waitForSelector('.dock-manager-root');
  });

  test.afterEach(assertNoViolations);

  // ── 1. Float→Dock: every target × every edge (reload between) ──

  for (const target of ['tg_center', 'tg_left', 'tg_right_top', 'tg_right_bottom'] as const) {
    for (const edge of ['left', 'right', 'top', 'bottom', 'center'] as const) {
      test(`float→dock: ${target} ${edge}`, async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.dock-manager-root');
        await expect(page.locator('.dock-floating-window').first()).toBeVisible();

        await dragFloating(page, `[data-dock-target="${target}"]`, edge);

        const placed = await page.evaluate(() => !!(
          document.querySelector('[data-tab-id="floatingPane"]') ||
          document.querySelector('[data-panel-id="floatingPane"]') ||
          document.querySelector('.dock-floating-window')
        ));
        expect(placed, `floatingPane lost after ${target} ${edge}`).toBe(true);
      });
    }
  }

  // ── 2. Drag sole panel out of group ─────────────────────────────

  test('drag sole panel to center — source group removed', async ({ page }) => {
    await dragTab(page, 'explorer', '[data-dock-target="tg_center"]', 'center');
    await assertPanelExists(page, 'explorer');
    await noEmptyGroups(page);
  });

  test('drag sole panel to edge — panel preserved, no empties', async ({ page }) => {
    await dragTab(page, 'explorer', '[data-dock-target="tg_center"]', 'left');
    // Whether drag landed on target or not, explorer must still exist somewhere
    await assertPanelExists(page, 'explorer');
    // If drag succeeded, no empty groups should remain
    if (await page.locator('[data-dock-target="tg_left"]').count() === 0) {
      await noEmptyGroups(page);
    }
  });

  // ── 3. Multi-step drags ─────────────────────────────────────────

  test('chain: dock floating then move docked tab', async ({ page }) => {
    await dragFloating(page, '[data-dock-target="tg_center"]', 'left');
    expect(await panelExistsAnywhere(page, 'floatingPane')).toBe(true);
    assertNoViolations();

    // If it actually docked, move the tab
    if (await page.locator('[data-tab-id="floatingPane"]').count() > 0) {
      await dragTab(page, 'floatingPane', '[data-dock-target="tg_center"]', 'right');
      await assertPanelExists(page, 'floatingPane');
    }
  });

  test('chain: move doc1 then doc2 — both survive', async ({ page }) => {
    await dragTab(page, 'doc1', '[data-dock-target="tg_right_top"]', 'center');
    await assertPanelExists(page, 'doc1');
    assertNoViolations();

    await dragTab(page, 'doc2', '[data-dock-target="tg_left"]', 'center');
    await assertPanelExists(page, 'doc2');
    await assertPanelExists(page, 'doc1');
  });

  // ── 4. Context menu: Close Others ───────────────────────────────

  test('context menu: close others', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.locator('[data-tab-id="doc1"]').click({ button: 'right' });
    const menu = page.locator('.dock-context-menu');
    await expect(menu).toBeVisible({ timeout: 3000 });
    const closeOthers = menu.locator('div').filter({ hasText: /^Close Others$/ });
    await closeOthers.click();
    await page.waitForTimeout(500);

    await assertPanelExists(page, 'doc1');
    expect(await page.locator('[data-tab-id="doc2"]').count()).toBe(0);
  });

  // ── 5. Context menu: Close All ──────────────────────────────────

  test('context menu: close all in center', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.locator('[data-tab-id="doc1"]').click({ button: 'right' });
    const menu = page.locator('.dock-context-menu');
    await expect(menu).toBeVisible({ timeout: 3000 });
    await menu.locator('div').filter({ hasText: /^Close All$/ }).click();
    await page.waitForTimeout(500);

    expect(await page.locator('[data-tab-id="doc1"]').count()).toBe(0);
    expect(await page.locator('[data-tab-id="doc2"]').count()).toBe(0);
    await noEmptyGroups(page);
  });

  // ── 6. Context menu: Float then dock-back ───────────────────────

  test('context menu: float explorer then dock-back', async ({ page }) => {
    // Use explorer (no unsaved dialog) instead of doc1
    await page.locator('[data-tab-id="explorer"]').click({ button: 'right' });
    const menu = page.locator('.dock-context-menu');
    await expect(menu).toBeVisible({ timeout: 3000 });
    await menu.locator('div').filter({ hasText: /^Float$/ }).click();
    await page.waitForTimeout(400);

    // Explorer should now be floating
    const floats = await page.locator('.dock-floating-window').count();
    expect(floats).toBeGreaterThanOrEqual(2);

    await page.locator('button[data-action="dock-back"]').last().click();
    await page.waitForTimeout(300);
    await assertPanelExists(page, 'explorer');
    expect(await page.locator('[data-tab-id="explorer"]').count()).toBe(1);
  });

  // ── 7. Pin/unpin cycling ────────────────────────────────────────

  test('pin→unpin→pin cycle — panel never lost', async ({ page }) => {
    for (let i = 0; i < 3; i++) {
      // Pin
      const unpinned = page.locator('[data-unpinned-id="unpinnedPane1"]');
      if (await unpinned.count() > 0) {
        await unpinned.hover();
        await page.waitForTimeout(400);
        const pinBtn = page.locator('button[title*="Pin"]');
        if (await pinBtn.count() > 0) {
          await pinBtn.first().click();
          await page.waitForTimeout(300);
        }
      }
      await assertPanelExists(page, 'unpinnedPane1');
      assertNoViolations();

      // Unpin via context menu
      const docked = page.locator('[data-tab-id="unpinnedPane1"]');
      if (await docked.count() > 0) {
        await docked.click({ button: 'right' });
        const m = page.locator('.dock-context-menu');
        if (await m.isVisible()) {
          const unpinItem = m.locator('div').filter({ hasText: /^Unpin$/ });
          if (await unpinItem.count() > 0) {
            await unpinItem.click();
            await page.waitForTimeout(300);
          }
        }
      }
      await assertPanelExists(page, 'unpinnedPane1');
      assertNoViolations();
    }
  });

  // ── 8. Maximize/restore ─────────────────────────────────────────

  test('maximize and restore — no panel loss', async ({ page }) => {
    await page.locator('[data-tab-id="doc1"]').click();
    await page.waitForTimeout(100);

    // Maximize via evaluate to bypass pointer interception
    const maximized = await page.evaluate(() => {
      const btn = document.querySelector('button[data-action="maximize"]') as HTMLElement;
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!maximized) return;
    await page.waitForTimeout(300);
    await assertPanelExists(page, 'doc1');

    // Restore via evaluate
    await page.evaluate(() => {
      const btn = document.querySelector('button[data-action="restore"]') as HTMLElement;
      if (btn) btn.click();
    });
    await page.waitForTimeout(300);
    await assertPanelExists(page, 'doc1');
    await assertPanelExists(page, 'floatingPane');
  });

  // ── 9. Close floating — clean removal ───────────────────────────

  test('close floating window — no orphan', async ({ page }) => {
    await page.locator('.dock-floating-window button[data-action="close"]').first().click();
    await page.waitForTimeout(300);
    expect(await page.locator('.dock-floating-window').count()).toBe(0);
    expect(await panelExistsAnywhere(page, 'floatingPane')).toBe(false);
  });

  // ── 10. Stress: consolidate all panels into center ──────────────

  test('stress: move all docked panels to center', async ({ page }) => {
    for (const tabId of ['explorer', 'tab1', 'tab2', 'contentPane2']) {
      if (await page.locator(`[data-tab-id="${tabId}"]`).count() === 0) continue;
      await dragTab(page, tabId, '[data-dock-target="tg_center"]', 'center');
      await assertPanelExists(page, tabId);
      assertNoViolations();
    }
  });

  // ── 11. Dock-back button ────────────────────────────────────────

  test('dock-back button — clean state transition', async ({ page }) => {
    await page.locator('button[data-action="dock-back"]').first().click();
    await page.waitForTimeout(300);
    expect(await page.locator('.dock-floating-window').count()).toBe(0);
    expect(await page.locator('[data-tab-id="floatingPane"]').count()).toBe(1);
  });

  // ── 12. Context menu: Close to the Right ────────────────────────

  test('context menu: close to the right', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.locator('[data-tab-id="doc1"]').click({ button: 'right' });
    const menu = page.locator('.dock-context-menu');
    await expect(menu).toBeVisible({ timeout: 3000 });
    const item = menu.locator('div').filter({ hasText: /^Close to the Right$/ });
    if (await item.count() > 0) {
      await item.click();
      await page.waitForTimeout(500);
      await assertPanelExists(page, 'doc1');
      expect(await page.locator('[data-tab-id="doc2"]').count()).toBe(0);
    }
  });

  // ── 13. Rapid float + dock-back ─────────────────────────────────

  test('rapid float then dock-back — no race', async ({ page }) => {
    // Float via button
    await page.locator('[data-tab-id="doc1"]').click();
    await page.waitForTimeout(100);
    const floatBtn = page.locator('button[data-action="float"]').first();
    if (await floatBtn.count() === 0) return;

    await floatBtn.click({ force: true });
    await page.waitForTimeout(200);
    await assertPanelExists(page, 'doc1');

    // Immediately dock back
    await page.locator('button[data-action="dock-back"]').last().click();
    await page.waitForTimeout(200);
    await assertPanelExists(page, 'doc1');
    expect(await page.locator('[data-tab-id="doc1"]').count()).toBe(1);
  });

  // ── 14. Close panel then undo — panel reappears ─────────────────

  test('close panel then undo — panel restored', async ({ page }) => {
    page.on('dialog', d => d.accept());
    // Close doc2 via its close button
    await page.locator('[data-tab-id="doc2"] button').click();
    await page.waitForTimeout(500);
    expect(await page.locator('[data-tab-id="doc2"]').count()).toBe(0);

    // Undo
    await page.locator('button[title*="Undo"]').click();
    await page.waitForTimeout(300);
    await assertPanelExists(page, 'doc2');
  });

  // ── 15. Multiple consecutive closes — no cascading failure ──────

  test('close 3 panels in sequence — no invariant violations', async ({ page }) => {
    // Close doc2, then tab1, then contentPane2 via close buttons
    for (const tabId of ['doc2', 'tab1', 'contentPane2']) {
      const closeBtn = page.locator(`[data-tab-id="${tabId}"] button`);
      if (await closeBtn.count() > 0) {
        await closeBtn.click();
        await page.waitForTimeout(200);
      }
    }
    // Remaining panels should all still be valid
    await assertPanelExists(page, 'doc1');
    await assertPanelExists(page, 'explorer');
    await assertPanelExists(page, 'tab2');
    await noEmptyGroups(page);
  });
});
