/**
 * TabOverflowObserver monitors a tab container element and determines
 * which tabs are visible and which have overflowed, enabling tab overflow
 * dropdown menus.
 */

export interface TabOverflowState {
  /** IDs of visible tabs */
  visibleTabs: string[];
  /** IDs of overflowed tabs (not visible) */
  overflowTabs: string[];
  /** Whether any tabs are overflowing */
  hasOverflow: boolean;
}

export type TabOverflowCallback = (state: TabOverflowState) => void;

export class TabOverflowObserver {
  private container: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private mutationObserver: MutationObserver | null = null;
  private callback: TabOverflowCallback;
  private lastState: TabOverflowState = { visibleTabs: [], overflowTabs: [], hasOverflow: false };

  // Timer/rAF IDs for cleanup
  private rafId: number | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  /** True only after a permanent dispose() call (not via re-observation). */
  private permanentlyDisposed = false;
  /** True while actively observing. */
  private observing = false;

  constructor(callback: TabOverflowCallback) {
    this.callback = callback;
  }

  /** Start observing a container element. Tab elements must have data-tab-id attributes. */
  observe(container: HTMLElement): void {
    this.teardownObservers();
    this.permanentlyDisposed = false;
    this.observing = true;
    this.container = container;

    this.resizeObserver = new ResizeObserver((entries) => {
      // Only compute when the container actually has width (is in the DOM with layout)
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          this.compute();
          return;
        }
      }
    });
    this.resizeObserver.observe(container);

    // Also watch for DOM changes (tabs added/removed)
    this.mutationObserver = new MutationObserver(() => {
      this.compute();
    });
    this.mutationObserver.observe(container, { childList: true, subtree: true });

    // Initial computation — retry a few times since the element may not
    // have layout yet when first observed (not yet in the DOM).
    this.compute();
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.compute();
    });
    // Second retry after layout settles
    this.timeoutId = setTimeout(() => {
      this.timeoutId = null;
      this.compute();
    }, 100);
  }

  /** Force a recomputation */
  recompute(): void {
    this.compute();
  }

  /** Tear down observers and timers without marking as permanently disposed. */
  private teardownObservers(): void {
    this.observing = false;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
    this.container = null;
  }

  /** Stop observing and permanently clean up. After this, observe() can still be called. */
  dispose(): void {
    this.teardownObservers();
    this.permanentlyDisposed = true;
  }

  /** Get the current state */
  getState(): TabOverflowState {
    return this.lastState;
  }

  private compute(): void {
    if (this.permanentlyDisposed || !this.observing || !this.container) return;

    const containerRect = this.container.getBoundingClientRect();
    const containerRight = containerRect.right;
    const tabs = this.container.querySelectorAll<HTMLElement>('[data-tab-id]');

    const visibleTabs: string[] = [];
    const overflowTabs: string[] = [];

    tabs.forEach((tab) => {
      const tabId = tab.getAttribute('data-tab-id');
      if (!tabId) return;

      const tabRect = tab.getBoundingClientRect();
      // A tab is considered visible if its right edge is within the container
      // (with a small tolerance of 2px)
      if (tabRect.right <= containerRight + 2) {
        visibleTabs.push(tabId);
      } else {
        overflowTabs.push(tabId);
      }
    });

    const newState: TabOverflowState = {
      visibleTabs,
      overflowTabs,
      hasOverflow: overflowTabs.length > 0,
    };

    // Only emit if state changed
    if (
      newState.hasOverflow !== this.lastState.hasOverflow ||
      newState.visibleTabs.length !== this.lastState.visibleTabs.length ||
      newState.overflowTabs.length !== this.lastState.overflowTabs.length
    ) {
      this.lastState = newState;
      this.callback(newState);
    }
  }
}
