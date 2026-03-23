/**
 * FocusManager tracks which panel is currently focused and provides
 * keyboard navigation between panels and tab groups.
 */

export interface FocusManagerOptions {
  /** Called when the focused panel changes */
  onFocusChanged?: (panelId: string | null) => void;
  /** Called when keyboard navigation is triggered */
  onNavigate?: (direction: 'next' | 'previous') => void;
  /** Called when the active panel should be closed */
  onCloseActivePanel?: () => void;
  /** Called when focus should move to previous/next tab group */
  onNavigateTabGroup?: (direction: 'next' | 'previous') => void;
  /** Container element to attach keyboard listeners to */
  containerElement: HTMLElement;
}

export class FocusManager {
  private options: FocusManagerOptions;
  private currentFocusedPanelId: string | null = null;
  private container: HTMLElement;

  constructor(options: FocusManagerOptions) {
    this.options = options;
    this.container = options.containerElement;
    this.attachListeners();
  }

  /** Get the currently focused panel ID */
  getFocusedPanelId(): string | null {
    return this.currentFocusedPanelId;
  }

  /** Programmatically set focus on a panel */
  setFocus(panelId: string): void {
    if (this.currentFocusedPanelId === panelId) return;
    this.currentFocusedPanelId = panelId;
    this.options.onFocusChanged?.(panelId);

    // Focus the panel's DOM element
    const panelEl = this.container.querySelector(`[data-panel-id="${panelId}"]`) as HTMLElement;
    if (panelEl) {
      panelEl.focus({ preventScroll: true });
    }
  }

  /** Clear focus */
  clearFocus(): void {
    if (this.currentFocusedPanelId === null) return;
    this.currentFocusedPanelId = null;
    this.options.onFocusChanged?.(null);
  }

  /** Update options (e.g., when callbacks change) */
  updateOptions(options: Partial<FocusManagerOptions>): void {
    Object.assign(this.options, options);
  }

  /** Clean up listeners */
  dispose(): void {
    this.container.removeEventListener('keydown', this.onKeyDown);
    this.container.removeEventListener('focusin', this.onFocusIn);
  }

  private attachListeners(): void {
    this.container.addEventListener('keydown', this.onKeyDown);
    this.container.addEventListener('focusin', this.onFocusIn);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modKey = isMac ? e.metaKey : e.ctrlKey;

    // Ctrl+Tab or Ctrl+PageDown → next panel
    if (e.ctrlKey && (e.key === 'Tab' || e.key === 'PageDown')) {
      e.preventDefault();
      this.options.onNavigate?.(e.shiftKey ? 'previous' : 'next');
      return;
    }

    // Ctrl+Shift+Tab or Ctrl+PageUp → previous panel
    if (e.ctrlKey && e.key === 'PageUp') {
      e.preventDefault();
      this.options.onNavigate?.('previous');
      return;
    }

    // Ctrl+W / Cmd+W → close active panel
    if (modKey && e.key === 'w') {
      e.preventDefault();
      this.options.onCloseActivePanel?.();
      return;
    }

    // Ctrl+Shift+ArrowLeft/ArrowRight → move focus to previous/next tab group
    if (modKey && e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      this.options.onNavigateTabGroup?.(e.key === 'ArrowLeft' ? 'previous' : 'next');
      return;
    }

    // ArrowLeft/ArrowRight within a tablist → move between tabs in the same group
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      const target = e.target as HTMLElement;
      const tabEl = target.closest('[role="tab"]') as HTMLElement | null;
      if (tabEl) {
        const tabList = tabEl.closest('[role="tablist"]') as HTMLElement | null;
        if (tabList) {
          const tabs = Array.from(tabList.querySelectorAll<HTMLElement>('[role="tab"]'));
          const currentIndex = tabs.indexOf(tabEl);
          if (currentIndex >= 0) {
            e.preventDefault();
            let nextIndex: number;
            if (e.key === 'ArrowRight') {
              nextIndex = currentIndex + 1 >= tabs.length ? 0 : currentIndex + 1;
            } else {
              nextIndex = currentIndex - 1 < 0 ? tabs.length - 1 : currentIndex - 1;
            }
            const nextTab = tabs[nextIndex];
            nextTab.focus();
            // Activate the tab by dispatching a click
            nextTab.click();
          }
        }
      }
    }
  };

  private onFocusIn = (e: FocusEvent): void => {
    // Walk up from the focused element to find the nearest data-panel-id
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
