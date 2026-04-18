export interface FocusManagerOptions {
  onFocusChanged?: (panelId: string | null) => void;
  onNavigate?: (direction: 'next' | 'previous') => void;
  onCloseActivePanel?: () => void;
  onNavigateTabGroup?: (direction: 'next' | 'previous') => void;
  containerElement: HTMLElement;
}

export class FocusManager {
  private options: FocusManagerOptions;
  private currentFocusedPanelId: string | null = null;
  private container: HTMLElement;

  constructor(options: FocusManagerOptions) {
    this.options = options;
    this.container = options.containerElement;
    this.container.addEventListener('keydown', this.onKeyDown);
    this.container.addEventListener('focusin', this.onFocusIn);
  }

  getFocusedPanelId(): string | null { return this.currentFocusedPanelId; }

  setFocus(panelId: string): void {
    if (this.currentFocusedPanelId === panelId) return;
    this.currentFocusedPanelId = panelId;
    this.options.onFocusChanged?.(panelId);
    const panelEl = this.container.querySelector(`[data-panel-id="${panelId}"]`) as HTMLElement;
    panelEl?.focus({ preventScroll: true });
  }

  clearFocus(): void {
    if (this.currentFocusedPanelId === null) return;
    this.currentFocusedPanelId = null;
    this.options.onFocusChanged?.(null);
  }

  updateOptions(options: Partial<FocusManagerOptions>): void { Object.assign(this.options, options); }

  dispose(): void {
    this.container.removeEventListener('keydown', this.onKeyDown);
    this.container.removeEventListener('focusin', this.onFocusIn);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modKey = isMac ? e.metaKey : e.ctrlKey;

    if (e.ctrlKey && (e.key === 'Tab' || e.key === 'PageDown')) {
      e.preventDefault();
      this.options.onNavigate?.(e.shiftKey ? 'previous' : 'next');
      return;
    }
    if (e.ctrlKey && e.key === 'PageUp') {
      e.preventDefault();
      this.options.onNavigate?.('previous');
      return;
    }
    if (modKey && e.key === 'w') {
      e.preventDefault();
      this.options.onCloseActivePanel?.();
      return;
    }
    if (modKey && e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      this.options.onNavigateTabGroup?.(e.key === 'ArrowLeft' ? 'previous' : 'next');
      return;
    }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      const tabEl = (e.target as HTMLElement).closest('[role="tab"]') as HTMLElement | null;
      if (!tabEl) return;
      const tabList = tabEl.closest('[role="tablist"]') as HTMLElement | null;
      if (!tabList) return;
      const tabs = Array.from(tabList.querySelectorAll<HTMLElement>('[role="tab"]'));
      const idx = tabs.indexOf(tabEl);
      if (idx < 0) return;
      e.preventDefault();
      const nextIdx = e.key === 'ArrowRight'
        ? (idx + 1 >= tabs.length ? 0 : idx + 1)
        : (idx - 1 < 0 ? tabs.length - 1 : idx - 1);
      tabs[nextIdx].focus();
      tabs[nextIdx].click();
    }
  };

  private onFocusIn = (e: FocusEvent): void => {
    let el = e.target as HTMLElement | null;
    while (el && el !== this.container) {
      const panelId = el.getAttribute('data-panel-id');
      if (panelId) {
        if (this.currentFocusedPanelId !== panelId) {
          this.currentFocusedPanelId = panelId;
          this.options.onFocusChanged?.(panelId);
        }
        return;
      }
      el = el.parentElement;
    }
  };
}
