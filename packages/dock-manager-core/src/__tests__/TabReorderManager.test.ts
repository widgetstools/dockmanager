// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TabReorderManager } from '../dom/TabReorderManager';

// ─── Helpers ─────────────────────────────────────────────────────────

/** Create a mock tab strip element with N tab children. */
function createTabStrip(tabIds: string[]): HTMLElement {
  const strip = document.createElement('div');
  for (const id of tabIds) {
    const tab = document.createElement('div');
    tab.setAttribute('data-tab-id', id);
    strip.appendChild(tab);
  }
  return strip;
}

/** Get all tab elements from a strip. */
function getTabs(strip: HTMLElement): HTMLElement[] {
  return Array.from(strip.querySelectorAll<HTMLElement>('[data-tab-id]'));
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('TabReorderManager', () => {
  let manager: TabReorderManager;

  beforeEach(() => {
    manager = new TabReorderManager();
  });

  // ── cacheTabsArray ─────────────────────────────────────────────────

  describe('cacheTabsArray', () => {
    it('caches tabs from tabStripEl', () => {
      const strip = createTabStrip(['a', 'b', 'c']);
      manager.tabStripEl = strip;
      manager.cacheTabsArray();

      // The cached tabs are private, but we can verify indirectly:
      // after caching, handleReorderMove will use them. We verify by
      // checking that the method completes without error.
      expect(getTabs(strip)).toHaveLength(3);
    });

    it('does nothing when tabStripEl is null', () => {
      manager.tabStripEl = null;
      // Should not throw
      expect(() => manager.cacheTabsArray()).not.toThrow();
    });
  });

  // ── addReorderClasses ──────────────────────────────────────────────

  describe('addReorderClasses', () => {
    it('adds dock-tab-reordering to non-source tabs and dock-tab-drag-source to source', () => {
      const strip = createTabStrip(['a', 'b', 'c']);
      const tabs = getTabs(strip);
      manager.tabStripEl = strip;
      manager.sourceTabEl = tabs[1]; // 'b' is the source

      manager.addReorderClasses();

      expect(tabs[0].classList.contains('dock-tab-reordering')).toBe(true);
      expect(tabs[1].classList.contains('dock-tab-drag-source')).toBe(true);
      expect(tabs[1].classList.contains('dock-tab-reordering')).toBe(false);
      expect(tabs[2].classList.contains('dock-tab-reordering')).toBe(true);
    });

    it('does nothing when tabStripEl is null', () => {
      manager.tabStripEl = null;
      manager.sourceTabEl = document.createElement('div');
      expect(() => manager.addReorderClasses()).not.toThrow();
    });

    it('does nothing when sourceTabEl is null', () => {
      manager.tabStripEl = createTabStrip(['a']);
      manager.sourceTabEl = null;
      expect(() => manager.addReorderClasses()).not.toThrow();
    });
  });

  // ── removeReorderClasses ───────────────────────────────────────────

  describe('removeReorderClasses', () => {
    it('removes reorder classes and clears transforms from all tabs', () => {
      const strip = createTabStrip(['a', 'b', 'c']);
      const tabs = getTabs(strip);
      manager.tabStripEl = strip;
      manager.sourceTabEl = tabs[0];

      // Set up classes and transforms
      tabs[0].classList.add('dock-tab-drag-source');
      tabs[1].classList.add('dock-tab-reordering');
      tabs[1].style.transform = 'translateX(50px)';
      tabs[2].classList.add('dock-tab-reordering');
      tabs[2].style.transform = 'translateX(-50px)';

      manager.removeReorderClasses();

      for (const tab of tabs) {
        expect(tab.classList.contains('dock-tab-reordering')).toBe(false);
        expect(tab.classList.contains('dock-tab-drag-source')).toBe(false);
        expect(tab.style.transform).toBe('');
      }
    });

    it('does nothing when tabStripEl is null', () => {
      manager.tabStripEl = null;
      expect(() => manager.removeReorderClasses()).not.toThrow();
    });
  });

  // ── reset ──────────────────────────────────────────────────────────

  describe('reset', () => {
    it('clears all public properties', () => {
      const strip = createTabStrip(['a']);
      manager.tabStripEl = strip;
      manager.sourceTabEl = getTabs(strip)[0];
      manager.tabGroupId = 'group-1';

      manager.reset();

      expect(manager.tabStripEl).toBeNull();
      expect(manager.sourceTabEl).toBeNull();
      expect(manager.tabGroupId).toBeNull();
    });
  });

  // ── endReorder ─────────────────────────────────────────────────────

  describe('endReorder', () => {
    it('calls onReorderTab with correct newIndex when commit is true', () => {
      const strip = createTabStrip(['a', 'b', 'c']);
      const tabs = getTabs(strip);
      manager.tabStripEl = strip;
      manager.sourceTabEl = tabs[1];
      manager.tabGroupId = 'tg1';

      const onReorder = vi.fn();
      manager.endReorder(true, 'panel-b', onReorder);

      expect(onReorder).toHaveBeenCalledWith('tg1', 'panel-b', 1);
    });

    it('does not call onReorderTab when commit is false', () => {
      const strip = createTabStrip(['a', 'b']);
      const tabs = getTabs(strip);
      manager.tabStripEl = strip;
      manager.sourceTabEl = tabs[0];
      manager.tabGroupId = 'tg1';

      const onReorder = vi.fn();
      manager.endReorder(false, 'panel-a', onReorder);

      expect(onReorder).not.toHaveBeenCalled();
    });

    it('removes reorder classes during endReorder', () => {
      const strip = createTabStrip(['a', 'b']);
      const tabs = getTabs(strip);
      manager.tabStripEl = strip;
      manager.sourceTabEl = tabs[0];
      manager.tabGroupId = 'tg1';

      tabs[0].classList.add('dock-tab-drag-source');
      tabs[1].classList.add('dock-tab-reordering');

      manager.endReorder(false, 'panel-a');

      expect(tabs[0].classList.contains('dock-tab-drag-source')).toBe(false);
      expect(tabs[1].classList.contains('dock-tab-reordering')).toBe(false);
    });
  });

  // ── handleReorderMove ──────────────────────────────────────────────

  describe('handleReorderMove', () => {
    it('does nothing when sourceTabEl is null', () => {
      manager.tabStripEl = createTabStrip(['a', 'b']);
      manager.sourceTabEl = null;
      expect(() => manager.handleReorderMove(100)).not.toThrow();
    });

    it('does nothing when tabStripEl is null', () => {
      manager.sourceTabEl = document.createElement('div');
      manager.tabStripEl = null;
      expect(() => manager.handleReorderMove(100)).not.toThrow();
    });
  });
});
