/**
 * Context menu "Save Layout" e2e test.
 *
 * Verifies the "Save Layout" menu item appears in the tab header
 * context menu and is clickable (not disabled). The demo app wires
 * onSaveLayout to a console.log, so we verify it fires.
 */
import { test, expect } from '@playwright/test';

test.describe('Context menu — Save Layout', () => {
  test('right-click on tab shows Save Layout and it fires onSaveLayout', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      if (msg.text().includes('[Demo] Layout saved by user')) {
        consoleLogs.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForSelector('.dock-manager-root');

    // Right-click on a tab to open the context menu
    const tab = page.locator('[data-tab-id="doc1"]');
    await expect(tab).toBeVisible();
    await tab.click({ button: 'right' });

    // Context menu should appear
    const menu = page.locator('.dock-context-menu');
    await expect(menu).toBeVisible();

    // "Save Layout" item should be present and not disabled
    const saveItem = menu.locator('.dock-context-menu-item', { hasText: 'Save Layout' });
    await expect(saveItem).toBeVisible();
    await expect(saveItem).not.toHaveClass(/disabled/);

    // Click it
    await saveItem.click();

    // Menu should close
    await expect(menu).toHaveCount(0);

    // onSaveLayout callback should have fired
    expect(consoleLogs.length).toBeGreaterThan(0);
  });
});
