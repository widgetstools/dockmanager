// ─── TabReorderManager ──────────────────────────────────────────────

/**
 * Manages tab reordering within a tab strip by dragging.
 * Uses FLIP (First, Last, Invert, Play) animation for smooth tab sliding.
 *
 * Extracted from DockDragManager for separation of concerns.
 */
export class TabReorderManager {
  // Tab reorder state
  sourceTabEl: HTMLElement | null = null;
  tabStripEl: HTMLElement | null = null;
  tabGroupId: string | null = null;

  // Cached tabs array for reorder (avoid re-querying DOM on every mousemove)
  private cachedTabs: HTMLElement[] | null = null;

  /**
   * Cache the tabs array from the tab strip and add reorder CSS classes.
   * Call when reorder starts.
   */
  cacheTabsArray(): void {
    if (this.tabStripEl) {
      this.cachedTabs = Array.from(this.tabStripEl.querySelectorAll<HTMLElement>('[data-tab-id]'));
    }
  }

  /**
   * Add reorder CSS classes to all tabs in the strip.
   * Call once when reorder starts.
   */
  addReorderClasses(): void {
    if (!this.tabStripEl || !this.sourceTabEl) return;
    const tabs = this.tabStripEl.querySelectorAll<HTMLElement>('[data-tab-id]');
    for (const tab of tabs) {
      if (tab !== this.sourceTabEl) {
        tab.classList.add('dock-tab-reordering');
      }
    }
    this.sourceTabEl.classList.add('dock-tab-drag-source');
  }

  /**
   * Remove reorder CSS classes and clear transforms from all tabs.
   * Call when reorder ends.
   */
  removeReorderClasses(): void {
    if (!this.tabStripEl) return;
    const tabs = this.tabStripEl.querySelectorAll<HTMLElement>('[data-tab-id]');
    for (const tab of tabs) {
      tab.classList.remove('dock-tab-reordering', 'dock-tab-drag-source');
      tab.style.transform = '';
    }
  }

  /**
   * Clear the cached tabs array. Call when reorder ends.
   */
  clearCache(): void {
    this.cachedTabs = null;
  }

  /**
   * Handle horizontal tab reordering during drag within the tab strip.
   * Swaps tabs visually in the DOM when the cursor crosses a sibling tab's midpoint.
   * Uses FLIP animation for smooth position transitions.
   */
  handleReorderMove(cursorX: number): void {
    if (!this.sourceTabEl || !this.tabStripEl) return;

    const tabs = this.cachedTabs || Array.from(this.tabStripEl.querySelectorAll<HTMLElement>('[data-tab-id]'));
    const sourceIdx = tabs.indexOf(this.sourceTabEl);
    if (sourceIdx === -1) return;

    for (let i = 0; i < tabs.length; i++) {
      if (i === sourceIdx) continue;
      const tab = tabs[i];
      const rect = tab.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;

      let shouldSwap = false;
      if (i > sourceIdx && cursorX > midX) shouldSwap = true;
      if (i < sourceIdx && cursorX < midX) shouldSwap = true;

      if (shouldSwap) {
        const parent = tab.parentNode;
        if (!parent) return;

        // ── FLIP: First ──
        // Record positions of all tabs BEFORE the DOM swap
        const firstRects = new Map<HTMLElement, number>();
        for (const t of tabs) {
          firstRects.set(t, t.getBoundingClientRect().left);
        }

        // ── FLIP: Last ──
        // Perform the DOM swap
        if (i > sourceIdx) {
          parent.insertBefore(this.sourceTabEl, tab.nextSibling);
        } else {
          parent.insertBefore(this.sourceTabEl, tab);
        }

        // ── FLIP: Invert ──
        // Calculate deltas and apply inverse transforms so tabs appear unmoved
        for (const t of tabs) {
          if (t === this.sourceTabEl) continue; // source follows cursor, no animation needed
          const firstLeft = firstRects.get(t);
          if (firstLeft === undefined) continue;
          const lastLeft = t.getBoundingClientRect().left;
          const delta = firstLeft - lastLeft;
          if (Math.abs(delta) > 0.5) {
            // Disable transition temporarily, apply inverse transform
            t.style.transition = 'none';
            t.style.transform = `translateX(${delta}px)`;
          }
        }

        // ── FLIP: Play ──
        // Force reflow, then enable transition and clear transform to animate
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        this.tabStripEl.offsetHeight; // force reflow
        for (const t of tabs) {
          if (t === this.sourceTabEl) continue;
          if (t.style.transform) {
            t.style.transition = '';
            t.style.transform = '';
          }
        }

        // Re-cache after DOM swap
        this.cacheTabsArray();
        return;
      }
    }
  }

  /**
   * End the tab reorder operation.
   * @param commit - If true, returns the new index for dispatch. If false, DOM swaps are reverted by next render.
   * @param sourceId - The panel ID being reordered.
   * @param onReorderTab - Callback to dispatch the reorder action.
   */
  endReorder(
    commit: boolean,
    sourceId: string,
    onReorderTab?: (tabGroupId: string, panelId: string, newIndex: number) => void,
  ): void {
    // Remove visual classes and inline styles
    this.removeReorderClasses();
    if (this.sourceTabEl) {
      this.sourceTabEl.style.opacity = '';
    }

    if (commit && this.sourceTabEl && this.tabStripEl && this.tabGroupId) {
      const tabs = Array.from(this.tabStripEl.querySelectorAll<HTMLElement>('[data-tab-id]'));
      const newIndex = tabs.indexOf(this.sourceTabEl);
      if (newIndex !== -1 && onReorderTab) {
        onReorderTab(this.tabGroupId, sourceId, newIndex);
      }
    }

    this.clearCache();
  }

  /**
   * Reset all state. Call on cleanup.
   */
  reset(): void {
    this.sourceTabEl = null;
    this.tabStripEl = null;
    this.tabGroupId = null;
    this.clearCache();
  }
}
