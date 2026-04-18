export interface TabOverflowState {
  visibleTabs: string[];
  overflowTabs: string[];
  hasOverflow: boolean;
}

export type TabOverflowCallback = (state: TabOverflowState) => void;

export class TabOverflowObserver {
  private container: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private mutationObserver: MutationObserver | null = null;
  private callback: TabOverflowCallback;
  private lastState: TabOverflowState = { visibleTabs: [], overflowTabs: [], hasOverflow: false };
  private rafId: number | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private permanentlyDisposed = false;
  private observing = false;

  constructor(callback: TabOverflowCallback) { this.callback = callback; }

  observe(container: HTMLElement): void {
    this.teardownObservers();
    this.permanentlyDisposed = false;
    this.observing = true;
    this.container = container;

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) { this.compute(); return; }
      }
    });
    this.resizeObserver.observe(container);

    this.mutationObserver = new MutationObserver(() => this.compute());
    this.mutationObserver.observe(container, { childList: true, subtree: true });

    this.compute();
    this.rafId = requestAnimationFrame(() => { this.rafId = null; this.compute(); });
    this.timeoutId = setTimeout(() => { this.timeoutId = null; this.compute(); }, 100);
  }

  recompute(): void { this.compute(); }

  private teardownObservers(): void {
    this.observing = false;
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    if (this.timeoutId !== null) { clearTimeout(this.timeoutId); this.timeoutId = null; }
    if (this.resizeObserver) { this.resizeObserver.disconnect(); this.resizeObserver = null; }
    if (this.mutationObserver) { this.mutationObserver.disconnect(); this.mutationObserver = null; }
    this.container = null;
  }

  dispose(): void { this.teardownObservers(); this.permanentlyDisposed = true; }
  getState(): TabOverflowState { return this.lastState; }

  private compute(): void {
    if (this.permanentlyDisposed || !this.observing || !this.container) return;
    const containerRight = this.container.getBoundingClientRect().right;
    const tabs = this.container.querySelectorAll<HTMLElement>('[data-tab-id]');
    const visibleTabs: string[] = [];
    const overflowTabs: string[] = [];

    tabs.forEach((tab) => {
      const tabId = tab.getAttribute('data-tab-id');
      if (!tabId) return;
      if (tab.getBoundingClientRect().right <= containerRight + 2) visibleTabs.push(tabId);
      else overflowTabs.push(tabId);
    });

    const newState: TabOverflowState = { visibleTabs, overflowTabs, hasOverflow: overflowTabs.length > 0 };
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
