import { test, expect, Page } from '@playwright/test';

/**
 * E2E coverage for the single-tab dock-pane header-collapse feature, exercised
 * alongside aggressive drag/drop, docking, undocking, and save/load cycles.
 *
 * The default demo layout exposes two single-tab groups out of the box:
 *   - tg_left           (panel: explorer)
 *   - tg_right_bottom   (panel: contentPane2)
 * Both render the `.dock-header-collapse-pill` toggle in their headers.
 *
 * Important: drops that miss every dock-target become *floating* panels —
 * that is the dock manager's fallback behaviour, not a bug. These tests assert
 * that a collapsed pane never *absorbs* a dropped tab, regardless of where the
 * panel ends up.
 */

const COLLAPSED_ATTR = 'data-header-collapsed';
const STORAGE_KEY = 'dock-manager-layout';

// ── Helpers ──────────────────────────────────────────────────────────────

async function gotoFresh(page: Page) {
  // Clear once on first nav so page.reload() preserves whatever the test
  // saved into localStorage. (addInitScript would re-fire on every reload.)
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.waitForSelector('.dock-manager-root');
  await page.waitForSelector('[data-dock-target="tg_left"]');
  await page.waitForSelector('[data-dock-target="tg_center"]');
  await page.waitForSelector('[data-dock-target="tg_right_bottom"]');
}

async function collapseViaPill(page: Page, tabGroupId: string) {
  const pill = page.locator(`[data-dock-target="${tabGroupId}"] .dock-header-collapse-pill`);
  await pill.first().click({ force: true });
  await expect(page.locator(`[data-dock-target="${tabGroupId}"]`)).toHaveAttribute(COLLAPSED_ATTR, '');
}

async function expandViaHoverZone(page: Page, tabGroupId: string) {
  const zone = page.locator(`[data-dock-target="${tabGroupId}"] .dock-header-hover-zone`);
  await zone.first().click({ force: true });
  await expect(page.locator(`[data-dock-target="${tabGroupId}"]`)).not.toHaveAttribute(COLLAPSED_ATTR, '');
}

async function dragTabTo(
  page: Page,
  sourceTabId: string,
  targetSelector: string,
  fx: number,
  fy: number,
) {
  const tab = page.locator(`[data-tab-id="${sourceTabId}"]`).first();
  const tabBox = await tab.boundingBox();
  const target = page.locator(targetSelector).first();
  const targetBox = await target.boundingBox();
  if (!tabBox || !targetBox) throw new Error(`Missing bounds for ${sourceTabId} → ${targetSelector}`);

  await page.mouse.move(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2);
  await page.mouse.down();
  // Move out of the tab strip first to enter full drag mode
  await page.mouse.move(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2 + 80, { steps: 6 });
  await page.mouse.move(
    targetBox.x + targetBox.width * fx,
    targetBox.y + targetBox.height * fy,
    { steps: 12 },
  );
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.waitForTimeout(180);
}

async function tabIdsIn(page: Page, tabGroupId: string): Promise<string[]> {
  return page
    .locator(`[data-dock-target="${tabGroupId}"] [data-tab-id]`)
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-tab-id') || ''));
}

async function saveLayout(page: Page) {
  await page.locator('button[title="Save layout"]').click();
}

async function loadLayout(page: Page) {
  await page.locator('button[title="Load layout"]').click();
}

async function resetLayout(page: Page) {
  await page.locator('button[title="Reset layout"]').click();
}

/** Wait until localStorage's saved layout JSON contains a substring. */
async function waitForStoredLayoutMatch(page: Page, needle: string) {
  await page.waitForFunction(
    ({ key, needle }) => {
      const v = window.localStorage.getItem(key);
      return !!v && v.includes(needle);
    },
    { key: STORAGE_KEY, needle },
    { timeout: 5000 },
  );
}

// ── 1. Basic toggle on a single pane ─────────────────────────────────────

test.describe('Header collapse — basic toggle', () => {
  test.beforeEach(async ({ page }) => { await gotoFresh(page); });

  test('pill collapses single-tab pane and hover zone restores it', async ({ page }) => {
    const left = page.locator('[data-dock-target="tg_left"]');

    await expect(left).not.toHaveAttribute(COLLAPSED_ATTR, '');
    await expect(left.locator('.dock-panel-header').first()).toBeVisible();

    await collapseViaPill(page, 'tg_left');
    const headerStyle = await left
      .locator('.dock-panel-header')
      .first()
      .evaluate((el) => (el as HTMLElement).style.display);
    expect(headerStyle).toBe('none');

    await expandViaHoverZone(page, 'tg_left');
    await expect(left.locator('.dock-panel-header').first()).toBeVisible();
  });

  test('collapsing two single-tab panes independently keeps both targets present', async ({ page }) => {
    await collapseViaPill(page, 'tg_left');
    await collapseViaPill(page, 'tg_right_bottom');

    await expect(page.locator('[data-dock-target="tg_left"]')).toHaveAttribute(COLLAPSED_ATTR, '');
    await expect(page.locator('[data-dock-target="tg_right_bottom"]')).toHaveAttribute(COLLAPSED_ATTR, '');

    // data-dock-target stays present so internal queries still work.
    await expect(page.locator('[data-dock-target="tg_left"]')).toHaveCount(1);
    await expect(page.locator('[data-dock-target="tg_right_bottom"]')).toHaveCount(1);
  });
});

// ── 2. Drop refusal: collapsed panes never absorb a dropped panel ────────

test.describe('Header collapse — drops onto collapsed panes are refused', () => {
  test.beforeEach(async ({ page }) => { await gotoFresh(page); });

  test('center-dropping a tab on a collapsed pane does not add it to that pane', async ({ page }) => {
    await collapseViaPill(page, 'tg_left');

    await dragTabTo(page, 'doc1', '[data-dock-target="tg_left"]', 0.5, 0.5);

    // The collapsed pane never absorbs the dropped tab
    expect(await tabIdsIn(page, 'tg_left')).not.toContain('doc1');
    await expect(page.locator('[data-dock-target="tg_left"]')).toHaveAttribute(COLLAPSED_ATTR, '');
  });

  test('edge-dropping against a collapsed pane does not add it to that pane', async ({ page }) => {
    await collapseViaPill(page, 'tg_right_bottom');

    await dragTabTo(page, 'doc2', '[data-dock-target="tg_right_bottom"]', 0.95, 0.5);

    expect(await tabIdsIn(page, 'tg_right_bottom')).not.toContain('doc2');
    await expect(page.locator('[data-dock-target="tg_right_bottom"]')).toHaveAttribute(COLLAPSED_ATTR, '');
  });

  test('no dock indicators are drawn over a collapsed pane while dragging', async ({ page }) => {
    await collapseViaPill(page, 'tg_left');

    const tab = page.locator('[data-tab-id="doc1"]').first();
    const box = await tab.boundingBox();
    if (!box) throw new Error('doc1 not found');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 80, { steps: 6 });
    await page.waitForTimeout(120);

    await expect(page.locator('[data-indicator-target="tg_left"]')).toHaveCount(0);

    await page.keyboard.press('Escape');
    await page.mouse.up();
  });
});

// ── 3. Neighbouring panes still drag/drop correctly ──────────────────────

test.describe('Header collapse — neighbours remain functional', () => {
  test.beforeEach(async ({ page }) => { await gotoFresh(page); });

  test('center-dropping doc2 into right_bottom while tg_left is collapsed succeeds', async ({ page }) => {
    await collapseViaPill(page, 'tg_left');

    await dragTabTo(page, 'doc2', '[data-dock-target="tg_right_bottom"]', 0.5, 0.5);

    // doc2 is now part of tg_right_bottom (or anywhere — verify it joined that group)
    expect(await tabIdsIn(page, 'tg_right_bottom')).toContain('doc2');
    // The collapsed neighbour is untouched
    await expect(page.locator('[data-dock-target="tg_left"]')).toHaveAttribute(COLLAPSED_ATTR, '');
  });
});

// ── 4. Multi-tab transition auto-uncollapses ─────────────────────────────

test.describe('Header collapse — multi-tab transitions force uncollapse', () => {
  test.beforeEach(async ({ page }) => { await gotoFresh(page); });

  test('a single-tab pane that gains a second tab loses its collapse pill', async ({ page }) => {
    // tg_right_bottom starts as a single-tab pane → has the pill
    await expect(
      page.locator('[data-dock-target="tg_right_bottom"] .dock-header-collapse-pill'),
    ).toHaveCount(1);

    // Drop doc2 into it → now multi-tab
    await dragTabTo(page, 'doc2', '[data-dock-target="tg_right_bottom"]', 0.5, 0.5);
    expect(await tabIdsIn(page, 'tg_right_bottom')).toContain('doc2');

    // Pill must be gone, header cannot be collapse-marked
    await expect(
      page.locator('[data-dock-target="tg_right_bottom"] .dock-header-collapse-pill'),
    ).toHaveCount(0);
    await expect(page.locator('[data-dock-target="tg_right_bottom"]')).not.toHaveAttribute(COLLAPSED_ATTR, '');
  });
});

// ── 5. Save / load round-trip with collapsed state ───────────────────────

test.describe('Header collapse — serialization round-trip', () => {
  test.beforeEach(async ({ page }) => { await gotoFresh(page); });

  test('collapsed state survives save → reload → load', async ({ page }) => {
    await collapseViaPill(page, 'tg_left');
    await collapseViaPill(page, 'tg_right_bottom');

    await saveLayout(page);
    // Wait for the persisted JSON to actually contain the flag
    await waitForStoredLayoutMatch(page, '"headerCollapsed": true');

    // Hard reload to drop in-memory state
    await page.reload();
    await page.waitForSelector('[data-dock-target="tg_left"]');
    await expect(page.locator('[data-dock-target="tg_left"]')).not.toHaveAttribute(COLLAPSED_ATTR, '');

    await loadLayout(page);

    await expect(page.locator('[data-dock-target="tg_left"]')).toHaveAttribute(COLLAPSED_ATTR, '');
    await expect(page.locator('[data-dock-target="tg_right_bottom"]')).toHaveAttribute(COLLAPSED_ATTR, '');
  });

  test('reset clears collapsed state in the live layout', async ({ page }) => {
    await collapseViaPill(page, 'tg_left');
    await resetLayout(page);
    await expect(page.locator('[data-dock-target="tg_left"]')).not.toHaveAttribute(COLLAPSED_ATTR, '');
  });
});

// ── 6. Erratic stress: many ops, then verify the layout is still sane ────

test.describe('Header collapse — erratic stress test', () => {
  test.beforeEach(async ({ page }) => { await gotoFresh(page); });

  test('aggressive collapse / drag / dock cycles leave the layout consistent', async ({ page }) => {
    // 1. Collapse both single-tab panes
    await collapseViaPill(page, 'tg_left');
    await collapseViaPill(page, 'tg_right_bottom');

    // 2. Several refused drops onto the collapsed panes
    await dragTabTo(page, 'doc1', '[data-dock-target="tg_left"]', 0.5, 0.5);
    await dragTabTo(page, 'doc2', '[data-dock-target="tg_right_bottom"]', 0.5, 0.5);

    // 3. The collapsed panes never absorbed the dropped tabs
    expect(await tabIdsIn(page, 'tg_left')).not.toContain('doc1');
    expect(await tabIdsIn(page, 'tg_right_bottom')).not.toContain('doc2');
    await expect(page.locator('[data-dock-target="tg_left"]')).toHaveAttribute(COLLAPSED_ATTR, '');
    await expect(page.locator('[data-dock-target="tg_right_bottom"]')).toHaveAttribute(COLLAPSED_ATTR, '');

    // 4. Expand tg_left, then dock any still-docked tab into it
    await expandViaHoverZone(page, 'tg_left');

    // Find any docked tab that lives in a *different* dock target than tg_left
    const candidate = await page
      .locator('[data-dock-target]:not([data-dock-target="tg_left"]) [data-tab-id]')
      .first()
      .getAttribute('data-tab-id')
      .catch(() => null);
    if (candidate) {
      await dragTabTo(page, candidate, '[data-dock-target="tg_left"]', 0.5, 0.5);
    }

    // 5. Toggle collapse on tg_right_bottom several times in a row
    for (let i = 0; i < 3; i++) {
      // Pill might not exist anymore if it became multi-tab via stray drop;
      // guard with count.
      const pillCount = await page.locator('[data-dock-target="tg_right_bottom"] .dock-header-collapse-pill').count();
      if (pillCount === 0) break;
      const isCollapsed = await page.locator('[data-dock-target="tg_right_bottom"]').evaluate((el) =>
        el.hasAttribute('data-header-collapsed'),
      );
      if (isCollapsed) await expandViaHoverZone(page, 'tg_right_bottom');
      else await collapseViaPill(page, 'tg_right_bottom');
    }

    // 6. Save → reload → load: persisted collapse state for any still-collapsed
    // pane round-trips.
    const collapsedBefore = await page.locator(`[${COLLAPSED_ATTR}]`).evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-dock-target')).filter(Boolean) as string[],
    );

    await saveLayout(page);
    if (collapsedBefore.length > 0) {
      await waitForStoredLayoutMatch(page, '"headerCollapsed": true');
    }

    await page.reload();
    await page.waitForSelector('[data-dock-target="tg_left"]');
    await loadLayout(page);

    for (const id of collapsedBefore) {
      await expect(page.locator(`[data-dock-target="${id}"]`)).toHaveAttribute(COLLAPSED_ATTR, '');
    }

    // 7. Sanity: every tab group still has non-zero size (no "empty space" bug)
    const sizes = await page.locator('[data-dock-target]').evaluateAll((els) =>
      els.map((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return { id: el.getAttribute('data-dock-target'), w: r.width, h: r.height };
      }),
    );
    for (const s of sizes) {
      expect(s.w, `width of ${s.id}`).toBeGreaterThan(0);
      expect(s.h, `height of ${s.id}`).toBeGreaterThan(0);
    }
  });
});
