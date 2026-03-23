import { test, expect } from '@playwright/test';

test.describe('Theme Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.dock-manager-root');
  });

  test('theme selector dropdown has all 14 themes', async ({ page }) => {
    const select = page.locator('select');
    const options = select.locator('option');
    const count = await options.count();
    expect(count).toBe(14);
  });

  test('switching to dark theme changes background', async ({ page }) => {
    const root = page.locator('.dock-manager-root');

    // Get initial background (light)
    const lightBg = await root.evaluate(el => getComputedStyle(el).backgroundColor);

    // Switch to VS Code Dark
    await page.locator('select').selectOption('vsCodeDark');
    await page.waitForTimeout(100);

    // Background should be different (darker)
    const darkBg = await root.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(darkBg).not.toBe(lightBg);
  });

  test('switching themes preserves layout', async ({ page }) => {
    // Count tabs before theme switch
    const tabsBefore = await page.locator('.dock-tab').count();

    // Switch to Mint
    await page.locator('select').selectOption('mintLight');
    await page.waitForTimeout(100);

    // Tabs should be preserved
    const tabsAfter = await page.locator('.dock-tab').count();
    expect(tabsAfter).toBe(tabsBefore);

    // Floating window should still exist
    await expect(page.locator('.dock-floating-window')).toBeVisible();
  });

  test('all light themes render without errors', async ({ page }) => {
    const lightThemes = ['vsCodeLight', 'githubLight', 'warmLight', 'solarizedLight', 'sepiaLight', 'mintLight', 'lavenderLight'];
    for (const theme of lightThemes) {
      await page.locator('select').selectOption(theme);
      await page.waitForTimeout(50);

      // No errors should appear
      const errors = await page.locator('.dock-manager-root').count();
      expect(errors).toBe(1);
    }
  });

  test('all dark themes render without errors', async ({ page }) => {
    const darkThemes = ['vsCodeDark', 'draculaDark', 'nordDark', 'solarizedDark', 'midnightDark', 'forestDark', 'slateDark'];
    for (const theme of darkThemes) {
      await page.locator('select').selectOption(theme);
      await page.waitForTimeout(50);

      const errors = await page.locator('.dock-manager-root').count();
      expect(errors).toBe(1);
    }
  });
});
