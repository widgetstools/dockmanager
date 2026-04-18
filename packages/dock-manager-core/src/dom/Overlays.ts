/**
 * Overlays — Overlay / popup components for the dock manager.
 *
 * Combines MaximizeOverlayView, PaneNavigator, and PanelFinder into a
 * single module. All three follow the same pattern: create overlay DOM,
 * show/hide, and handle keyboard events.
 */

import type { PanelConfig, DockManagerState } from '../types/dock';
import { iconRestore } from './icons';
import {
  CompositeDisposable,
  MutableDisposable,
  listenEvent,
  type IDisposable,
} from '../utils/lifecycle';
import { collectAllPanelsOrdered } from '../layout/LayoutTree';

// ─── Shared ──────────────────────────────────────────────────────────

export type { IDisposable };

/** Remove an overlay element from the DOM if it has a parent. */
function removeOverlay(el: HTMLElement | null): void {
  if (el?.parentNode) el.parentNode.removeChild(el);
}

// =====================================================================
// MaximizeOverlayView
// =====================================================================

export interface MaximizeOverlayViewCallbacks {
  onRestorePanel: (panelId: string) => void;
  createContent: (panelId: string, container: HTMLElement) => IDisposable;
}

/**
 * Full-screen overlay shown when a panel is maximized.
 * Contains a title bar with restore button and a content area.
 */
export class MaximizeOverlayView {
  readonly element: HTMLDivElement;

  private panelId: string;
  private panel: PanelConfig;
  private callbacks: MaximizeOverlayViewCallbacks;

  private readonly disposables = new CompositeDisposable();
  private readonly contentSlot = new MutableDisposable();

  constructor(
    panelId: string,
    panel: PanelConfig,
    callbacks: MaximizeOverlayViewCallbacks,
  ) {
    this.panelId = panelId;
    this.panel = panel;
    this.callbacks = callbacks;
    this.disposables.add(this.contentSlot);

    // Root overlay
    this.element = document.createElement('div');
    this.element.style.cssText =
      'position:absolute;inset:0;z-index:9000;display:flex;flex-direction:column;background:hsl(var(--dock-surface));';

    // Title bar
    const headerEl = document.createElement('div');
    headerEl.className = 'dock-panel-header';
    headerEl.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;min-height:36px;padding:0 12px;flex-shrink:0;border-bottom:1px solid hsl(var(--dock-border));background:hsl(var(--dock-panel-header));';

    const titleSpan = document.createElement('span');
    titleSpan.style.cssText = 'font-size:12px;font-weight:500;color:hsl(var(--dock-text));user-select:none;';
    if (panel.icon) {
      const iconSpan = document.createElement('span');
      iconSpan.style.marginRight = '4px';
      iconSpan.textContent = panel.icon;
      titleSpan.appendChild(iconSpan);
    }
    const textNode = document.createTextNode(panel.title);
    titleSpan.appendChild(textNode);
    headerEl.appendChild(titleSpan);

    // Restore button
    const restoreBtn = document.createElement('button');
    restoreBtn.setAttribute('data-action', 'restore');
    restoreBtn.setAttribute('data-panel-id', panelId);
    restoreBtn.style.cssText =
      'padding:4px;color:hsl(var(--dock-text-muted));cursor:pointer;background:none;border:none;display:flex;align-items:center;transition:color 0.15s;';
    restoreBtn.title = 'Restore';
    restoreBtn.innerHTML = iconRestore();
    this.disposables.add(
      listenEvent(restoreBtn, 'mouseenter', () => {
        restoreBtn.style.color = 'hsl(var(--dock-text))';
      }),
      listenEvent(restoreBtn, 'mouseleave', () => {
        restoreBtn.style.color = 'hsl(var(--dock-text-muted))';
      }),
    );
    headerEl.appendChild(restoreBtn);

    this.element.appendChild(headerEl);

    // Content area
    const contentEl = document.createElement('div');
    contentEl.style.cssText = 'flex:1;position:relative;overflow:hidden;';
    this.element.appendChild(contentEl);

    // Mount content
    this.contentSlot.value = this.callbacks.createContent(panelId, contentEl);
  }

  dispose(): void {
    this.disposables.dispose();
    removeOverlay(this.element);
  }
}

// =====================================================================
// PaneNavigator
// =====================================================================

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

export class PaneNavigator {
  private options: PaneNavigatorOptions;
  private overlayEl: HTMLDivElement | null = null;
  private items: NavigatorItem[] = [];
  private selectedIndex = 0;
  private isVisible = false;

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

      const state = this.options.getState();
      const currentIdx = this.items.findIndex(item => item.panelId === state.activePaneId);
      this.selectedIndex = currentIdx >= 0 ? currentIdx : 0;

      this.boundKeyDown = this.onKeyDown.bind(this);
      this.boundKeyUp = this.onKeyUp.bind(this);
      document.addEventListener('keydown', this.boundKeyDown, true);
      document.addEventListener('keyup', this.boundKeyUp, true);
    }

    this.moveSelection(direction);
    this.updateHighlight();
  }

  /** Hide the navigator and activate the selected panel. */
  hide(): void {
    if (!this.isVisible) return;
    this.isVisible = false;

    const selectedItem = this.items[this.selectedIndex];

    removeOverlay(this.overlayEl);
    this.overlayEl = null;

    if (this.boundKeyDown) {
      document.removeEventListener('keydown', this.boundKeyDown, true);
      this.boundKeyDown = null;
    }
    if (this.boundKeyUp) {
      document.removeEventListener('keyup', this.boundKeyUp, true);
      this.boundKeyUp = null;
    }

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
    const floatingIds: string[] = [];
    for (const [panelId, placement] of state.placements) {
      if (placement.type === 'floating') floatingIds.push(panelId);
    }
    const allIds = [...allPanelIds, ...floatingIds];

    this.items = [];
    for (const pid of allIds) {
      const panel = state.panels.get(pid);
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

// =====================================================================
// PanelFinder
// =====================================================================

export interface PanelFinderOptions {
  /** The container element to append the overlay to. */
  containerElement: HTMLElement;
  /** Returns the current dock manager state. */
  getState: () => DockManagerState;
  /** Called when a panel is selected. */
  onActivatePanel: (panelId: string) => void;
}

export class PanelFinder {
  private options: PanelFinderOptions;
  private overlayEl: HTMLDivElement | null = null;
  private isOpen = false;

  constructor(options: PanelFinderOptions) {
    this.options = options;
  }

  /** Toggle the panel finder modal. */
  toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /** Open the panel finder modal. */
  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;

    const overlay = document.createElement('div');
    overlay.className = 'dock-panel-finder-overlay';
    overlay.style.cssText = 'position:absolute;inset:0;z-index:10020;display:flex;align-items:flex-start;justify-content:center;padding-top:60px;background:rgba(0,0,0,0.2);';

    const modal = document.createElement('div');
    modal.className = 'dock-panel-finder';
    modal.style.cssText = 'width:340px;max-height:400px;background:hsl(var(--dock-surface));border:1px solid hsl(var(--dock-border));border-radius:6px;box-shadow:0 8px 32px rgba(0,0,0,0.2);display:flex;flex-direction:column;overflow:hidden;';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Search panels...';
    input.style.cssText = 'padding:10px 12px;border:none;border-bottom:1px solid hsl(var(--dock-border));background:transparent;color:hsl(var(--dock-text));font-size:13px;outline:none;';
    modal.appendChild(input);

    const list = document.createElement('div');
    list.style.cssText = 'overflow-y:auto;max-height:320px;padding:4px 0;';
    modal.appendChild(list);

    overlay.appendChild(modal);
    this.options.containerElement.appendChild(overlay);
    this.overlayEl = overlay;

    const renderList = (filter: string) => {
      list.innerHTML = '';
      const state = this.options.getState();
      const panelIds = Array.from(state.panels.keys());
      const lowerFilter = filter.toLowerCase();

      for (const pid of panelIds) {
        const panel = state.panels.get(pid);
        if (!panel) continue;
        if (lowerFilter && !panel.title.toLowerCase().includes(lowerFilter)) continue;

        const item = document.createElement('div');
        item.className = 'dock-panel-finder-item';
        item.style.cssText = 'padding:6px 12px;cursor:pointer;font-size:12px;color:hsl(var(--dock-text));transition:background 0.1s;';
        item.textContent = panel.title;
        item.setAttribute('data-panel-id', pid);

        const placement = state.placements.get(pid);
        const isFloating = placement?.type === 'floating';
        const isUnpinned = placement?.type === 'unpinned';
        if (isFloating || isUnpinned) {
          const badge = document.createElement('span');
          badge.style.cssText = 'margin-left:8px;font-size:10px;opacity:0.6;';
          badge.textContent = isFloating ? '(floating)' : '(unpinned)';
          item.appendChild(badge);
        }

        item.addEventListener('mouseenter', () => {
          item.style.background = 'hsl(var(--dock-hover))';
        });
        item.addEventListener('mouseleave', () => {
          item.style.background = '';
        });
        item.addEventListener('click', () => {
          this.options.onActivatePanel(pid);
          this.close();
        });

        list.appendChild(item);
      }
    };

    renderList('');
    input.addEventListener('input', () => renderList(input.value));

    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) this.close();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.close();
      }
    };
    overlay.addEventListener('keydown', onKeyDown);

    requestAnimationFrame(() => input.focus());
  }

  /** Close the panel finder modal. */
  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    if (this.overlayEl) {
      this.overlayEl.remove();
      this.overlayEl = null;
    }
  }

  dispose(): void {
    this.close();
  }
}
