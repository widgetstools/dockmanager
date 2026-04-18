import type { PanelConfig, DockManagerState } from '../types/dock';
import { iconRestore } from './icons';
import {
  CompositeDisposable,
  MutableDisposable,
  listenEvent,
  type IDisposable,
} from '../utils/lifecycle';
import { collectAllPanelsOrdered } from '../layout/LayoutTree';

export type { IDisposable };

function removeOverlay(el: HTMLElement | null): void {
  if (el?.parentNode) el.parentNode.removeChild(el);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  style?: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (style) e.style.cssText = style;
  if (className) e.className = className;
  return e;
}

// ── MaximizeOverlayView ─────────────────────────────────────────────

export interface MaximizeOverlayViewCallbacks {
  onRestorePanel: (panelId: string) => void;
  createContent: (panelId: string, container: HTMLElement) => IDisposable;
}

export class MaximizeOverlayView {
  readonly element: HTMLDivElement;
  private panelId: string;
  private panel: PanelConfig;
  private callbacks: MaximizeOverlayViewCallbacks;
  private readonly disposables = new CompositeDisposable();
  private readonly contentSlot = new MutableDisposable();

  constructor(panelId: string, panel: PanelConfig, callbacks: MaximizeOverlayViewCallbacks) {
    this.panelId = panelId;
    this.panel = panel;
    this.callbacks = callbacks;
    this.disposables.add(this.contentSlot);

    this.element = el('div', 'position:absolute;inset:0;z-index:9000;display:flex;flex-direction:column;background:hsl(var(--dock-surface));');

    const headerEl = el('div', 'display:flex;align-items:center;justify-content:space-between;min-height:36px;padding:0 12px;flex-shrink:0;border-bottom:1px solid hsl(var(--dock-border));background:hsl(var(--dock-panel-header));', 'dock-panel-header');

    const titleSpan = el('span', 'font-size:12px;font-weight:500;color:hsl(var(--dock-text));user-select:none;');
    if (panel.icon) {
      const iconSpan = el('span');
      iconSpan.style.marginRight = '4px';
      iconSpan.textContent = panel.icon;
      titleSpan.appendChild(iconSpan);
    }
    titleSpan.appendChild(document.createTextNode(panel.title));
    headerEl.appendChild(titleSpan);

    const restoreBtn = el('button', 'padding:4px;color:hsl(var(--dock-text-muted));cursor:pointer;background:none;border:none;display:flex;align-items:center;transition:color 0.15s;');
    restoreBtn.setAttribute('data-action', 'restore');
    restoreBtn.setAttribute('data-panel-id', panelId);
    restoreBtn.title = 'Restore';
    restoreBtn.innerHTML = iconRestore();
    this.disposables.add(
      listenEvent(restoreBtn, 'mouseenter', () => { restoreBtn.style.color = 'hsl(var(--dock-text))'; }),
      listenEvent(restoreBtn, 'mouseleave', () => { restoreBtn.style.color = 'hsl(var(--dock-text-muted))'; }),
    );
    headerEl.appendChild(restoreBtn);
    this.element.appendChild(headerEl);

    const contentEl = el('div', 'flex:1;position:relative;overflow:hidden;');
    this.element.appendChild(contentEl);
    this.contentSlot.value = this.callbacks.createContent(panelId, contentEl);
  }

  dispose(): void {
    this.disposables.dispose();
    removeOverlay(this.element);
  }
}

// ── PaneNavigator ───────────────────────────────────────────────────

export interface PaneNavigatorOptions {
  containerElement: HTMLElement;
  getState: () => DockManagerState;
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

  constructor(options: PaneNavigatorOptions) { this.options = options; }

  get visible(): boolean { return this.isVisible; }

  show(direction: 'next' | 'previous'): void {
    if (!this.isVisible) {
      this.buildItems();
      if (this.items.length === 0) return;
      this.createOverlay();
      this.isVisible = true;
      const state = this.options.getState();
      const currentIdx = this.items.findIndex(i => i.panelId === state.activePaneId);
      this.selectedIndex = currentIdx >= 0 ? currentIdx : 0;
      this.boundKeyDown = this.onKeyDown.bind(this);
      this.boundKeyUp = this.onKeyUp.bind(this);
      document.addEventListener('keydown', this.boundKeyDown, true);
      document.addEventListener('keyup', this.boundKeyUp, true);
    }
    this.moveSelection(direction);
    this.updateHighlight();
  }

  hide(): void {
    if (!this.isVisible) return;
    this.isVisible = false;
    const selectedItem = this.items[this.selectedIndex];
    removeOverlay(this.overlayEl);
    this.overlayEl = null;
    if (this.boundKeyDown) { document.removeEventListener('keydown', this.boundKeyDown, true); this.boundKeyDown = null; }
    if (this.boundKeyUp) { document.removeEventListener('keyup', this.boundKeyUp, true); this.boundKeyUp = null; }
    if (selectedItem) this.options.onActivate(selectedItem.panelId);
  }

  dispose(): void { this.hide(); }

  private buildItems(): void {
    const state = this.options.getState();
    const allPanelIds = collectAllPanelsOrdered(state.layout);
    const floatingIds: string[] = [];
    for (const [panelId, placement] of state.placements) {
      if (placement.type === 'floating') floatingIds.push(panelId);
    }
    this.items = [];
    for (const pid of [...allPanelIds, ...floatingIds]) {
      const panel = state.panels.get(pid);
      if (panel) this.items.push({ panelId: pid, title: panel.title, icon: panel.icon, isDocument: panel.documentOnly === true });
    }
  }

  private moveSelection(direction: 'next' | 'previous'): void {
    if (this.items.length === 0) return;
    const delta = direction === 'next' ? 1 : -1;
    this.selectedIndex = (this.selectedIndex + delta + this.items.length) % this.items.length;
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Tab' && e.ctrlKey) {
      e.preventDefault();
      e.stopPropagation();
      this.moveSelection(e.shiftKey ? 'previous' : 'next');
      this.updateHighlight();
    }
    if (e.key === 'Escape') { e.preventDefault(); this.hide(); }
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (e.key === 'Control') this.hide();
  }

  private createOverlay(): void {
    const overlay = el('div', 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:10100;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.3);', 'dock-pane-navigator');
    const card = el('div', 'background:hsl(var(--dock-surface, 0 0% 100%));border:1px solid hsl(var(--dock-border, 220 13% 87%));border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.2);padding:16px;min-width:400px;max-width:600px;display:flex;gap:24px;font-size:12px;color:hsl(var(--dock-text, 0 0% 15%));');

    const docItems = this.items.filter(i => i.isDocument);
    const toolItems = this.items.filter(i => !i.isDocument);

    const createColumn = (title: string, items: NavigatorItem[]): HTMLDivElement => {
      const col = el('div', 'flex:1;min-width:0;');
      const heading = el('div', 'font-weight:600;margin-bottom:8px;opacity:0.6;font-size:11px;text-transform:uppercase;');
      heading.textContent = title;
      col.appendChild(heading);
      for (const item of items) {
        const itemEl = el('div', 'padding:6px 8px;border-radius:4px;display:flex;align-items:center;gap:6px;cursor:pointer;', 'dock-pane-navigator-item');
        itemEl.setAttribute('data-panel-id', item.panelId);
        if (item.icon) { const ic = el('span'); ic.textContent = item.icon; itemEl.appendChild(ic); }
        const titleEl = el('span', 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;');
        titleEl.textContent = item.title;
        itemEl.appendChild(titleEl);
        col.appendChild(itemEl);
      }
      return col;
    };

    if (docItems.length > 0) card.appendChild(createColumn('Active Files', docItems));
    if (toolItems.length > 0) card.appendChild(createColumn('Tool Windows', toolItems));
    if (docItems.length === 0 && toolItems.length === 0) card.appendChild(createColumn('Panels', this.items));

    overlay.appendChild(card);
    this.options.containerElement.appendChild(overlay);
    this.overlayEl = overlay;
  }

  private updateHighlight(): void {
    if (!this.overlayEl) return;
    const selectedItem = this.items[this.selectedIndex];
    this.overlayEl.querySelectorAll('.dock-pane-navigator-item').forEach(node => {
      const e = node as HTMLElement;
      const isActive = e.getAttribute('data-panel-id') === selectedItem?.panelId;
      e.className = 'dock-pane-navigator-item' + (isActive ? ' active' : '');
      e.style.background = isActive ? 'hsl(var(--dock-primary, 217 91% 50%) / 0.15)' : '';
      e.style.color = isActive ? 'hsl(var(--dock-primary, 217 91% 50%))' : '';
    });
  }
}

// ── PanelFinder ─────────────────────────────────────────────────────

export interface PanelFinderOptions {
  containerElement: HTMLElement;
  getState: () => DockManagerState;
  onActivatePanel: (panelId: string) => void;
}

export class PanelFinder {
  private options: PanelFinderOptions;
  private overlayEl: HTMLDivElement | null = null;
  private isOpen = false;

  constructor(options: PanelFinderOptions) { this.options = options; }

  toggle(): void { this.isOpen ? this.close() : this.open(); }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;

    const overlay = el('div', 'position:absolute;inset:0;z-index:10020;display:flex;align-items:flex-start;justify-content:center;padding-top:60px;background:rgba(0,0,0,0.2);', 'dock-panel-finder-overlay');
    const modal = el('div', 'width:340px;max-height:400px;background:hsl(var(--dock-surface));border:1px solid hsl(var(--dock-border));border-radius:6px;box-shadow:0 8px 32px rgba(0,0,0,0.2);display:flex;flex-direction:column;overflow:hidden;', 'dock-panel-finder');

    const input = el('input', 'padding:10px 12px;border:none;border-bottom:1px solid hsl(var(--dock-border));background:transparent;color:hsl(var(--dock-text));font-size:13px;outline:none;');
    input.type = 'text';
    input.placeholder = 'Search panels...';
    modal.appendChild(input);

    const list = el('div', 'overflow-y:auto;max-height:320px;padding:4px 0;');
    modal.appendChild(list);
    overlay.appendChild(modal);
    this.options.containerElement.appendChild(overlay);
    this.overlayEl = overlay;

    const renderList = (filter: string) => {
      list.innerHTML = '';
      const state = this.options.getState();
      const lowerFilter = filter.toLowerCase();
      for (const [pid, panel] of state.panels) {
        if (!panel || (lowerFilter && !panel.title.toLowerCase().includes(lowerFilter))) continue;
        const item = el('div', 'padding:6px 12px;cursor:pointer;font-size:12px;color:hsl(var(--dock-text));transition:background 0.1s;', 'dock-panel-finder-item');
        item.textContent = panel.title;
        item.setAttribute('data-panel-id', pid);
        const placement = state.placements.get(pid);
        if (placement?.type === 'floating' || placement?.type === 'unpinned') {
          const badge = el('span', 'margin-left:8px;font-size:10px;opacity:0.6;');
          badge.textContent = placement.type === 'floating' ? '(floating)' : '(unpinned)';
          item.appendChild(badge);
        }
        item.addEventListener('mouseenter', () => { item.style.background = 'hsl(var(--dock-hover))'; });
        item.addEventListener('mouseleave', () => { item.style.background = ''; });
        item.addEventListener('click', () => { this.options.onActivatePanel(pid); this.close(); });
        list.appendChild(item);
      }
    };

    renderList('');
    input.addEventListener('input', () => renderList(input.value));
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) this.close(); });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
    requestAnimationFrame(() => input.focus());
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    if (this.overlayEl) { this.overlayEl.remove(); this.overlayEl = null; }
  }

  dispose(): void { this.close(); }
}
