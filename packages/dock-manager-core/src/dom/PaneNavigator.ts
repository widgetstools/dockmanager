/**
 * PaneNavigator — Ctrl+Tab overlay for switching between panels.
 *
 * Shows a visual overlay with two columns: "Active Files" (documentOnly panels)
 * and "Tool Windows" (non-documentOnly panels). The user can cycle through
 * items while holding Ctrl, and releasing Ctrl activates the selected panel.
 */

import type { DockManagerState, PanelConfig } from '../types/dock';
import { collectAllPanelsOrdered } from '../layout/LayoutTree';

// ─── Types ────────────────────────────────────────────────────────────

export interface PaneNavigatorOptions {
  /** The container element to append the overlay to. */
  containerElement: HTMLElement;
  /** Returns the current dock manager state. */
  getState: () => DockManagerState;
  /** Called when a panel is selected for activation. */
  onActivate: (panelId: string) => void;
}

interface NavigatorItem {
  panelId: string;
  title: string;
  icon?: string;
  isDocument: boolean;
}

// ─── PaneNavigator ───────────────────────────────────────────────────

export class PaneNavigator {
  private options: PaneNavigatorOptions;
  private overlayEl: HTMLDivElement | null = null;
  private items: NavigatorItem[] = [];
  private selectedIndex = 0;
  private isVisible = false;

  // Bound handlers
  private boundKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private boundKeyUp: ((e: KeyboardEvent) => void) | null = null;

  constructor(options: PaneNavigatorOptions) {
    this.options = options;
  }

  /** Show the navigator and highlight the next/previous panel. */
  show(direction: 'next' | 'previous'): void {
    if (!this.isVisible) {
      this.buildItems();
      if (this.items.length === 0) return;
      this.createOverlay();
      this.isVisible = true;

      // Set initial selection to current active panel
      const state = this.options.getState();
      const currentIdx = this.items.findIndex(item => item.panelId === state.activePaneId);
      this.selectedIndex = currentIdx >= 0 ? currentIdx : 0;

      // Attach global key listeners
      this.boundKeyDown = this.onKeyDown.bind(this);
      this.boundKeyUp = this.onKeyUp.bind(this);
      document.addEventListener('keydown', this.boundKeyDown, true);
      document.addEventListener('keyup', this.boundKeyUp, true);
    }

    // Move selection
    this.moveSelection(direction);
    this.updateHighlight();
  }

  /** Hide the navigator and activate the selected panel. */
  hide(): void {
    if (!this.isVisible) return;
    this.isVisible = false;

    const selectedItem = this.items[this.selectedIndex];

    // Remove overlay
    if (this.overlayEl && this.overlayEl.parentNode) {
      this.overlayEl.parentNode.removeChild(this.overlayEl);
      this.overlayEl = null;
    }

    // Remove key listeners
    if (this.boundKeyDown) {
      document.removeEventListener('keydown', this.boundKeyDown, true);
      this.boundKeyDown = null;
    }
    if (this.boundKeyUp) {
      document.removeEventListener('keyup', this.boundKeyUp, true);
      this.boundKeyUp = null;
    }

    // Activate panel
    if (selectedItem) {
      this.options.onActivate(selectedItem.panelId);
    }
  }

  /** Whether the navigator is currently visible. */
  get visible(): boolean {
    return this.isVisible;
  }

  /** Clean up all listeners and DOM elements. */
  dispose(): void {
    this.hide();
  }

  // ── Private ───────────────────────────────────────────────────────

  private buildItems(): void {
    const state = this.options.getState();
    const allPanelIds = collectAllPanelsOrdered(state.layout);
    // Also include floating panels
    const floatingIds = state.floatingPanels.map(fp => fp.panelId);
    const allIds = [...allPanelIds, ...floatingIds];

    this.items = [];
    for (const pid of allIds) {
      const panel = state.panels[pid];
      if (!panel) continue;
      this.items.push({
        panelId: pid,
        title: panel.title,
        icon: panel.icon,
        isDocument: panel.documentOnly === true,
      });
    }
  }

  private moveSelection(direction: 'next' | 'previous'): void {
    if (this.items.length === 0) return;
    if (direction === 'next') {
      this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
    } else {
      this.selectedIndex = (this.selectedIndex - 1 + this.items.length) % this.items.length;
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Tab' && e.ctrlKey) {
      e.preventDefault();
      e.stopPropagation();
      this.moveSelection(e.shiftKey ? 'previous' : 'next');
      this.updateHighlight();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.hide();
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    // When Ctrl is released, activate the selected panel
    if (e.key === 'Control') {
      this.hide();
    }
  }

  private createOverlay(): void {
    const overlay = document.createElement('div');
    overlay.className = 'dock-pane-navigator';
    overlay.style.cssText =
      'position:fixed;top:0;left:0;right:0;bottom:0;z-index:10100;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.3);';

    const card = document.createElement('div');
    card.style.cssText =
      'background:hsl(var(--dock-surface, 0 0% 100%));border:1px solid hsl(var(--dock-border, 220 13% 87%));border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.2);padding:16px;min-width:400px;max-width:600px;display:flex;gap:24px;font-size:12px;color:hsl(var(--dock-text, 0 0% 15%));';

    // Split into document and tool panels
    const docItems = this.items.filter(i => i.isDocument);
    const toolItems = this.items.filter(i => !i.isDocument);

    const createColumn = (title: string, items: NavigatorItem[]): HTMLDivElement => {
      const col = document.createElement('div');
      col.style.cssText = 'flex:1;min-width:0;';

      const heading = document.createElement('div');
      heading.style.cssText = 'font-weight:600;margin-bottom:8px;opacity:0.6;font-size:11px;text-transform:uppercase;';
      heading.textContent = title;
      col.appendChild(heading);

      for (const item of items) {
        const itemEl = document.createElement('div');
        itemEl.className = 'dock-pane-navigator-item';
        itemEl.setAttribute('data-panel-id', item.panelId);
        itemEl.style.cssText =
          'padding:6px 8px;border-radius:4px;display:flex;align-items:center;gap:6px;cursor:pointer;';

        if (item.icon) {
          const iconEl = document.createElement('span');
          iconEl.textContent = item.icon;
          itemEl.appendChild(iconEl);
        }

        const titleEl = document.createElement('span');
        titleEl.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        titleEl.textContent = item.title;
        itemEl.appendChild(titleEl);

        col.appendChild(itemEl);
      }

      return col;
    };

    if (docItems.length > 0) {
      card.appendChild(createColumn('Active Files', docItems));
    }
    if (toolItems.length > 0) {
      card.appendChild(createColumn('Tool Windows', toolItems));
    }
    // If no document items, still show all as tool windows
    if (docItems.length === 0 && toolItems.length === 0) {
      card.appendChild(createColumn('Panels', this.items));
    }

    overlay.appendChild(card);
    this.options.containerElement.appendChild(overlay);
    this.overlayEl = overlay;
  }

  private updateHighlight(): void {
    if (!this.overlayEl) return;
    const items = this.overlayEl.querySelectorAll('.dock-pane-navigator-item');
    const selectedItem = this.items[this.selectedIndex];

    items.forEach(el => {
      const panelId = el.getAttribute('data-panel-id');
      const isActive = panelId === selectedItem?.panelId;
      (el as HTMLElement).className = 'dock-pane-navigator-item' + (isActive ? ' active' : '');
      (el as HTMLElement).style.background = isActive ? 'hsl(var(--dock-primary, 217 91% 50%) / 0.15)' : '';
      (el as HTMLElement).style.color = isActive ? 'hsl(var(--dock-primary, 217 91% 50%))' : '';
    });
  }
}
