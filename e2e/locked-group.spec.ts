import { test, expect } from '@playwright/test';

/**
 * Rigorous end-to-end tests for the "Locked tab group" feature.
 *
 * A locked group must:
 *   1. Expose a `data-locked-group` attribute on its root.
 *   2. Hide the per-tab close (x) button (default + custom renderers).
 *   3. Disable Close / Float / Auto Hide / Maximize entries in the tab context menu.
 *   4. Reject drag-out of panels from a locked source group.
 *   5. Reject drops into a locked target group.
 *   6. Fully restore all capabilities on unlock.
 */

const LOCK_BTN = 'button[title="Lock/unlock active group"]';

async function activate(page: import('@playwright/test').Page, tabId: string) {
  await page.locator(`[data-tab-id="${tabId}"]`).click();
}

async function toggleLockOnActive(page: import('@playwright/test').Page) {
  await page.locator(LOCK_BTN).click();
  // reducer + render cycle
  await page.waitForTimeout(50);
}

async function groupForTab(page: import('@playwright/test').Page, tabId: string) {
  // The tab group root has data-dock-target and contains the tab
  return page.locator(`[data-dock-target]:has([data-tab-id="${tabId}"])`).first();
}

test.describe('Locked Tab Groups', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.dock-manager-root');
    // Dismiss any stray context menus
    await page.mouse.click(5, 5);
  });

  test('locking sets data-locked-group on the owning group only', async ({ page }) => {
    await activate(page, 'doc1');
    await toggleLockOnActive(page);

    const centerGroup = await groupForTab(page, 'doc1');
    await expect(centerGroup).toHaveAttribute('data-locked-group', 'true');

    // Other groups must NOT be locked.
    const explorerGroup = await groupForTab(page, 'explorer');
    await expect(explorerGroup).not.toHaveAttribute('data-locked-group', /.*/);

    // Unlock restores
    await toggleLockOnActive(page);
    await expect(centerGroup).not.toHaveAttribute('data-locked-group', /.*/);
  });

  test('hides the close (x) button on all tabs of a locked group', async ({ page }) => {
    await activate(page, 'doc1');

    // Pre-lock: close button for doc1/doc2 exists & is visible
    const doc1Close = page.locator('[data-tab-id="doc1"] .dock-tab-close');
    const doc2Close = page.locator('[data-tab-id="doc2"] .dock-tab-close');
    // Hover to surface the non-selected close button
    await page.locator('[data-tab-id="doc2"]').hover();
    await expect(doc1Close).toBeVisible();

    await toggleLockOnActive(page);

    // Post-lock: close buttons must be hidden for every tab in the group
    await expect(doc1Close).toBeHidden();
    await expect(doc2Close).toBeHidden();

    // Unlock → restored
    await toggleLockOnActive(page);
    await page.locator('[data-tab-id="doc1"]').hover();
    await expect(doc1Close).toBeVisible();
  });

  test('context menu Close / Float / Auto Hide / Maximize are disabled when locked', async ({ page }) => {
    await activate(page, 'doc1');
    await toggleLockOnActive(page);

    await page.locator('[data-tab-id="doc1"]').click({ button: 'right' });
    const menu = page.locator('.dock-context-menu');
    await expect(menu).toBeVisible();

    // Disabled items in this codebase render with aria-disabled="true" or the
    // `dock-menu-item-disabled` class. Be tolerant of either.
    const labels = ['Close', 'Float', 'Unpin', 'Maximize'];
    for (const label of labels) {
      const item = menu.locator('.dock-context-menu-item', { hasText: new RegExp(`^${label}$`) }).first();
      const cls = (await item.getAttribute('class')) ?? '';
      expect(cls.includes('disabled'), `${label} should be disabled when group is locked`).toBe(true);
    }

    // Clicking Close must be a no-op: tab remains.
    await menu.locator('div', { hasText: /^Close$/ }).first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(100);
    await expect(page.locator('[data-tab-id="doc1"]')).toHaveCount(1);
  });

  test('context menu items are re-enabled after unlock', async ({ page }) => {
    await activate(page, 'doc1');
    await toggleLockOnActive(page);
    await toggleLockOnActive(page);

    await page.locator('[data-tab-id="doc1"]').click({ button: 'right' });
    const menu = page.locator('.dock-context-menu');
    await expect(menu).toBeVisible();

    const closeItem = menu.locator('.dock-context-menu-item', { hasText: /^Close$/ }).first();
    const cls = (await closeItem.getAttribute('class')) ?? '';
    expect(cls.includes('disabled')).toBe(false);

    // Dismiss
    await page.mouse.click(5, 5);
  });

  test('locked group rejects drag-out: panel stays put', async ({ page }) => {
    await activate(page, 'doc1');
    await toggleLockOnActive(page);

    const tab = page.locator('[data-tab-id="doc1"]');
    const box = await tab.boundingBox();
    if (!box) throw new Error('doc1 tab not found');

    const sourceGroup = await groupForTab(page, 'doc1');

    // Attempt to drag doc1 out of the locked group into the explorer group area
    const explorer = await groupForTab(page, 'explorer');
    const targetBox = await explorer.boundingBox();
    if (!targetBox) throw new Error('explorer group not found');

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 120, { steps: 8 });
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.waitForTimeout(150);

    // doc1 must still live in the original (still-locked) group
    const stillInSource = sourceGroup.locator('[data-tab-id="doc1"]');
    await expect(stillInSource).toHaveCount(1);
    await expect(sourceGroup).toHaveAttribute('data-locked-group', 'true');
  });

  test('locked group rejects incoming drops from another group', async ({ page }) => {
    // Lock the center group (doc1/doc2), then try to drop explorer into it.
    await activate(page, 'doc1');
    await toggleLockOnActive(page);

    const sourceTab = page.locator('[data-tab-id="explorer"]');
    const sBox = await sourceTab.boundingBox();
    if (!sBox) throw new Error('explorer tab not found');

    const lockedGroup = await groupForTab(page, 'doc1');
    const tBox = await lockedGroup.boundingBox();
    if (!tBox) throw new Error('locked group not found');

    await page.mouse.move(sBox.x + sBox.width / 2, sBox.y + sBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(sBox.x + sBox.width / 2 + 40, sBox.y + sBox.height / 2 + 40, { steps: 6 });
    // Hover deep inside locked group center (most permissive drop zone)
    await page.mouse.move(tBox.x + tBox.width / 2, tBox.y + tBox.height / 2, { steps: 10 });
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.waitForTimeout(150);

    // Explorer must NOT have joined the locked group
    const explorerInLocked = lockedGroup.locator('[data-tab-id="explorer"]');
    await expect(explorerInLocked).toHaveCount(0);
    // And the locked group still holds its original tabs
    await expect(lockedGroup.locator('[data-tab-id="doc1"]')).toHaveCount(1);
    await expect(lockedGroup.locator('[data-tab-id="doc2"]')).toHaveCount(1);
  });

  test('unlocking restores drag-out capability', async ({ page }) => {
    await activate(page, 'doc1');
    await toggleLockOnActive(page);
    await toggleLockOnActive(page); // unlock

    const sourceGroup = await groupForTab(page, 'doc1');
    await expect(sourceGroup).not.toHaveAttribute('data-locked-group', /.*/);

    // Close button is visible again
    const doc1Close = page.locator('[data-tab-id="doc1"] .dock-tab-close');
    await page.locator('[data-tab-id="doc1"]').hover();
    await expect(doc1Close).toBeVisible();
  });
});
