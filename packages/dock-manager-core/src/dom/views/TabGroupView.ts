import type { TabGroupNode, PanelConfig, DockManagerState } from '../../types/dock';
import type { DockResourceStrings } from '../../types/resourceStrings';
import { defaultResourceStrings } from '../../types/resourceStrings';
import { TabOverflowObserver, type TabOverflowState } from '../TabOverflowObserver';
import { iconClose, iconMaximize, iconRestore, iconFloat, iconUnpin } from '../icons';
import { MutableDisposable } from '../../utils/lifecycle';

export interface IDisposable { dispose(): void; }

export interface TabGroupViewCallbacks {
  onClosePanel: (panelId: string) => void;
  onFloatPanel: (panelId: string) => void;
  onMaximizePanel: (panelId: string) => void;
  onRestorePanel: (panelId: string) => void;
  onUnpinPanel: (panelId: string) => void;
  onSetActivePanel: (tabGroupId: string, panelId: string) => void;
  onSetActivePane: (panelId: string) => void;
  onToggleMaximize?: (panelId: string) => void;
  createContent: (panelId: string, container: HTMLElement) => IDisposable;
  createTab?: (panelId: string, container: HTMLElement, isActive: boolean) => IDisposable;
  onSaveLayout?: () => void;
  onSetHeaderCollapsed: (tabGroupId: string, collapsed: boolean) => void;
  createHeaderActions?: (slot: 'left' | 'right' | 'prefix', tabGroupId: string, container: HTMLElement) => IDisposable;
  createWatermark?: (container: HTMLElement) => IDisposable;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, style?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (style) e.style.cssText = style;
  return e;
}

function setAttrs(e: HTMLElement, a: Record<string, string>) {
  for (const k in a) e.setAttribute(k, a[k]);
}

const chevronUp = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>';
const chevronDown = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

export class TabGroupView {
  readonly element: HTMLDivElement;
  private node: TabGroupNode;
  private panels: Map<string, PanelConfig>;
  private previousPanels: Map<string, PanelConfig> | null = null;
  private activePaneId: string;
  private maximizedPanelId: string | undefined;
  private callbacks: TabGroupViewCallbacks;
  private headerEl: HTMLDivElement;
  private bottomTabStripEl: HTMLDivElement | null = null;
  private tabContainerEl: HTMLDivElement | null = null;
  private titleEl: HTMLSpanElement | null = null;
  private contentAreaEl: HTMLDivElement;
  private actionButtonsEl: HTMLDivElement;
  private overflowBtn: HTMLButtonElement | null = null;
  private overflowMenuEl: HTMLDivElement | null = null;
  private overflowMenuOutsideHandler: ((e: MouseEvent) => void) | null = null;
  private overflowMenuKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private prefixSlotEl: HTMLDivElement | null = null;
  private leftSlotEl: HTMLDivElement | null = null;
  private rightSlotEl: HTMLDivElement | null = null;
  private prefixSlotDisposable: IDisposable | null = null;
  private leftSlotDisposable: IDisposable | null = null;
  private rightSlotDisposable: IDisposable | null = null;
  private contentSlots = new Map<string, { container: HTMLDivElement; disposable: IDisposable }>();
  private tabDisposables = new Map<string, IDisposable>();
  private readonly watermarkSlot = new MutableDisposable();
  private watermarkEl: HTMLDivElement | null = null;
  private tabOverflowObserver: TabOverflowObserver;
  private overflowState: TabOverflowState = { visibleTabs: [], overflowTabs: [], hasOverflow: false };
  private headerCollapsed = false;
  private headerCollapsePill: HTMLButtonElement | null = null;
  private headerHoverZone: HTMLDivElement | null = null;
  private resourceStrings: DockResourceStrings;
  private contextMenuEl: HTMLDivElement | null = null;
  private contextMenuCleanup: (() => void) | null = null;
  private previousActiveId: string | null = null;

  constructor(
    node: TabGroupNode, panels: Map<string, PanelConfig>, activePaneId: string,
    maximizedPanelId: string | undefined, callbacks: TabGroupViewCallbacks,
    resourceStrings?: Partial<DockResourceStrings>,
  ) {
    this.node = node;
    this.panels = panels;
    this.activePaneId = activePaneId;
    this.maximizedPanelId = maximizedPanelId;
    this.callbacks = callbacks;
    this.resourceStrings = { ...defaultResourceStrings, ...resourceStrings };
    const { activePanel } = node;
    this.element = el('div', this.getRootClassName(), 'display:flex;flex-direction:column;height:100%;width:100%;position:relative;');
    setAttrs(this.element, { 'data-dock-target': node.id, role: 'region', 'aria-label': panels.get(activePanel)?.title || 'Panel', 'data-panel-id': activePanel });
    if (node.locked) this.element.setAttribute('data-locked-group', 'true');
    this.element.tabIndex = -1;
    this.applyHasTabsAttr();
    this.element.addEventListener('focus', () => this.callbacks.onSetActivePane(this.node.activePanel));

    this.headerEl = el('div', 'dock-panel-header', 'display:flex;align-items:center;justify-content:space-between;min-height:32px;padding:0 12px;flex-shrink:0;');
    this.element.appendChild(this.headerEl);
    this.contentAreaEl = el('div', undefined, 'flex:1;position:relative;overflow:hidden;border-top:1px solid hsl(var(--dock-border) / 0.7);box-sizing:border-box;');
    setAttrs(this.contentAreaEl, { role: 'tabpanel', id: `panel-${activePanel}`, 'aria-labelledby': `tab-${activePanel}` });
    this.element.appendChild(this.contentAreaEl);
    if (node.headerPosition === 'bottom' && node.panels.length > 1) {
      this.bottomTabStripEl = this.createBottomTabStrip();
      this.element.appendChild(this.bottomTabStripEl);
    }
    this.actionButtonsEl = el('div', undefined, 'display:flex;align-items:center;gap:0;flex-shrink:0;margin-left:8px;');
    this.buildHeader();
    this.updateHeaderCollapse();
    if (node.headerCollapsed && node.panels.length === 1) { this.headerCollapsed = true; this.applyHeaderCollapsed(); }
    this.buildContent();
    this.tabOverflowObserver = new TabOverflowObserver((state) => { this.overflowState = state; this.updateOverflowButton(); });
    if (this.tabContainerEl) this.tabOverflowObserver.observe(this.tabContainerEl);
  }

  update(node: TabGroupNode, panels: Map<string, PanelConfig>, activePaneId: string, maximizedPanelId: string | undefined): void {
    const prevNode = this.node, prevActivePaneId = this.activePaneId, prevMaximizedPanelId = this.maximizedPanelId;
    this.node = node; this.panels = panels; this.activePaneId = activePaneId; this.maximizedPanelId = maximizedPanelId;
    const { activePanel } = node;
    setAttrs(this.element, { 'data-panel-id': activePanel, 'aria-label': panels.get(activePanel)?.title || 'Panel' });
    this.applyHasTabsAttr();
    if (node.locked) this.element.setAttribute('data-locked-group', 'true');
    else this.element.removeAttribute('data-locked-group');
    this.element.className = this.getRootClassName();
    this.contentAreaEl.id = `panel-${activePanel}`;
    this.contentAreaEl.setAttribute('aria-labelledby', `tab-${activePanel}`);

    const panelsChanged = prevNode.panels.length !== node.panels.length ||
      prevNode.panels.some((p, i) => p !== node.panels[i]) || prevNode.locked !== node.locked;
    const activePanelChanged = prevNode.activePanel !== activePanel;
    const prevPanels = this.previousPanels;
    this.previousPanels = panels;
    const configChanged = !panelsChanged && node.panels.some(id => {
      const prev = prevPanels?.get(id), curr = panels.get(id);
      return !!prev && !!curr && (prev.title !== curr.title || prev.icon !== curr.icon || prev.badge !== curr.badge);
    });
    const isSingleTab = node.panels.length === 1;
    const nodeCollapsed = !!node.headerCollapsed && isSingleTab;
    const wasCollapsed = this.headerCollapsed;
    if (nodeCollapsed !== wasCollapsed) { this.headerCollapsed = nodeCollapsed; this.applyHeaderCollapsed(); }
    if (!isSingleTab && (wasCollapsed || node.headerCollapsed)) this.callbacks.onSetHeaderCollapsed(node.id, false);

    if (panelsChanged) {
      const needsBottom = node.headerPosition === 'bottom' && node.panels.length > 1;
      if (needsBottom && !this.bottomTabStripEl) { this.bottomTabStripEl = this.createBottomTabStrip(); this.element.appendChild(this.bottomTabStripEl); }
      if (!needsBottom && this.bottomTabStripEl) { this.bottomTabStripEl.remove(); this.bottomTabStripEl = null; }
      this.clearHeader(); this.buildHeader(); this.updateHeaderCollapse();
      if (this.tabContainerEl) this.tabOverflowObserver.observe(this.tabContainerEl);
    } else if (activePanelChanged || prevActivePaneId !== activePaneId || prevMaximizedPanelId !== maximizedPanelId) {
      this.updateTabStyles(); this.buildActionButtons(); this.updateTitleElement();
    }
    if (configChanged) {
      if (this.callbacks.createTab) this.updateCustomTabs(prevPanels); else this.updateTabLabels();
      this.updateTitleElement();
    }
    if (activePanelChanged || panelsChanged) this.buildContent();
  }

  containsPanel(panelId: string): boolean { return this.node.panels.includes(panelId); }

  invalidateContentSlot(panelId: string): void {
    const slot = this.contentSlots.get(panelId);
    if (slot) { slot.container.remove(); this.contentSlots.delete(panelId); }
    this.previousActiveId = null;
    this.buildContent();
  }

  dispose(): void {
    this.hideTabContextMenu();
    this.tabOverflowObserver.dispose();
    for (const [, s] of this.contentSlots) s.disposable.dispose();
    this.contentSlots.clear();
    for (const [, d] of this.tabDisposables) d.dispose();
    this.tabDisposables.clear();
    this.prefixSlotDisposable?.dispose();
    this.leftSlotDisposable?.dispose();
    this.rightSlotDisposable?.dispose();
    this.watermarkSlot.dispose();
    this.watermarkEl = null;
    this.hideOverflowMenu();
    this.headerCollapsePill?.remove(); this.headerCollapsePill = null;
    this.headerHoverZone?.remove(); this.headerHoverZone = null;
    this.element.parentNode?.removeChild(this.element);
  }

  private createBottomTabStrip(): HTMLDivElement {
    return el('div', 'dock-panel-header dock-bottom-tab-strip',
      'display:flex;align-items:center;min-height:28px;padding:0 8px;flex-shrink:0;border-top:1px solid hsl(var(--dock-border) / 0.7);border-bottom:none;');
  }

  private getRootClassName(): string {
    return `dock-tab-group${this.node.panels.includes(this.activePaneId) ? ' dock-pane-active' : ''}`;
  }

  private applyHasTabsAttr(): void {
    if (this.node.panels.length > 1) this.element.setAttribute('data-has-tabs', '');
    else this.element.removeAttribute('data-has-tabs');
  }

  private updateHeaderCollapse(): void {
    const single = this.node.panels.length === 1;
    if (single && !this.headerCollapsePill) {
      const pill = this.headerCollapsePill = el('button', 'dock-header-collapse-pill');
      pill.setAttribute('aria-label', 'Hide header'); pill.title = 'Hide header';
      pill.innerHTML = chevronUp;
      pill.addEventListener('click', (e) => { e.stopPropagation(); this.toggleHeaderCollapsed(); });
      this.headerEl.appendChild(pill);
      const zone = this.headerHoverZone = el('div', 'dock-header-hover-zone');
      setAttrs(zone, { role: 'button', 'aria-label': 'Show header' }); zone.title = 'Show header';
      zone.innerHTML = chevronDown;
      zone.addEventListener('click', () => this.toggleHeaderCollapsed());
      this.element.appendChild(zone);
    } else if (!single) {
      this.headerCollapsePill?.remove(); this.headerCollapsePill = null;
      this.headerHoverZone?.remove(); this.headerHoverZone = null;
      if (this.headerCollapsed) {
        this.headerCollapsed = false; this.applyHeaderCollapsed();
        this.callbacks.onSetHeaderCollapsed(this.node.id, false);
      }
    }
  }

  private toggleHeaderCollapsed(): void {
    this.headerCollapsed = !this.headerCollapsed;
    this.applyHeaderCollapsed();
    this.callbacks.onSetHeaderCollapsed(this.node.id, this.headerCollapsed);
  }

  private applyHeaderCollapsed(): void {
    this.headerEl.style.display = this.headerCollapsed ? 'none' : '';
    if (this.headerCollapsed) this.element.setAttribute('data-header-collapsed', '');
    else this.element.removeAttribute('data-header-collapsed');
  }

  private clearHeader(): void {
    this.hideOverflowMenu(); this.overflowBtn = null;
    for (const [, d] of this.tabDisposables) d.dispose();
    this.tabDisposables.clear();
    this.disposeSlot('prefix'); this.disposeSlot('left'); this.disposeSlot('right');
    this.headerEl.innerHTML = '';
    if (this.bottomTabStripEl) this.bottomTabStripEl.innerHTML = '';
    this.tabContainerEl = this.titleEl = this.prefixSlotEl = this.leftSlotEl = this.rightSlotEl = null;
  }

  private disposeSlot(slot: 'prefix' | 'left' | 'right'): void {
    const k = `${slot}SlotDisposable` as 'prefixSlotDisposable' | 'leftSlotDisposable' | 'rightSlotDisposable';
    this[k]?.dispose(); this[k] = null;
  }

  private createHeaderActionSlot(slot: 'prefix' | 'left' | 'right', margin: 'right' | 'left'): HTMLDivElement | null {
    if (!this.callbacks.createHeaderActions) return null;
    const s = el('div', undefined, `display:flex;align-items:center;margin-${margin}:4px;flex-shrink:0;`);
    (this as any)[`${slot}SlotEl`] = s;
    (this as any)[`${slot}SlotDisposable`] = this.callbacks.createHeaderActions(slot, this.node.id, s);
    return s;
  }

  private appendIfPresent(parent: HTMLElement, child: HTMLElement | null): void {
    if (child) parent.appendChild(child);
  }

  private buildHeader(): void {
    const hasTabs = this.node.panels.length > 1;
    const isBottom = this.node.headerPosition === 'bottom' && hasTabs;
    this.appendIfPresent(this.headerEl, this.createHeaderActionSlot('prefix', 'right'));
    this.appendIfPresent(this.headerEl, this.createHeaderActionSlot('left', 'right'));
    if (isBottom) {
      this.buildSingleTitle();
      if (this.bottomTabStripEl) this.buildTabStrip(this.bottomTabStripEl);
    } else this.buildTabStrip(this.headerEl);
    this.appendIfPresent(this.headerEl, this.createHeaderActionSlot('right', 'left'));
    this.buildActionButtons();
    this.headerEl.appendChild(this.actionButtonsEl);
  }

  private buildTabStrip(parentEl?: HTMLElement): void {
    const wrap = el('div', undefined, 'display:flex;align-items:flex-end;align-self:stretch;gap:0;flex:1;overflow-x:hidden;overflow-y:visible;position:relative;');
    const tc = this.tabContainerEl = el('div', undefined, 'display:flex;align-items:flex-end;align-self:stretch;gap:0;overflow-x:hidden;overflow-y:visible;flex:1;');
    setAttrs(tc, { role: 'tablist', 'aria-label': 'Panel tabs' });

    for (const pid of this.node.panels) {
      const panel = this.panels.get(pid);
      if (!panel) continue;
      const sel = pid === this.node.activePanel, dis = panel.disabled === true;
      const tab = el('div', `dock-tab${sel ? ' dock-tab-selected' : ''}${dis ? ' dock-tab-disabled' : ''}`);
      setAttrs(tab, { 'data-tab-id': pid, role: 'tab', 'aria-selected': String(sel), 'aria-controls': `panel-${pid}` });
      tab.id = `tab-${pid}`;
      tab.tabIndex = sel ? 0 : -1;
      if (dis) tab.setAttribute('data-disabled', 'true');
      if (this.callbacks.createTab) this.tabDisposables.set(pid, this.callbacks.createTab(pid, tab, sel));
      else this.buildDefaultTabContent(tab, panel, pid);
      tab.addEventListener('dblclick', (e) => {
        e.preventDefault(); if (panel.disabled) return;
        if (this.callbacks.onToggleMaximize) this.callbacks.onToggleMaximize(pid);
        else if (this.maximizedPanelId === pid) this.callbacks.onRestorePanel(pid);
        else this.callbacks.onMaximizePanel(pid);
      });
      tab.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (!panel.disabled) this.showTabContextMenu(pid, panel, e.clientX, e.clientY);
      });
      tc.appendChild(tab);
    }
    wrap.appendChild(tc);
    const btn = this.overflowBtn = el('button', 'dock-tab-overflow-btn',
      'flex-shrink:0;align-self:stretch;padding:2px 6px;color:hsl(var(--dock-text-muted));cursor:pointer;background:none;border:none;display:none;align-items:center;justify-content:center;');
    setAttrs(btn, { 'aria-label': this.resourceStrings.tabOverflowMenu ?? 'Show all tabs', 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
    btn.innerHTML = chevronDown;
    btn.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); });
    btn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); this.toggleOverflowMenu(); });
    wrap.appendChild(btn);
    (parentEl || this.headerEl).appendChild(wrap);
  }

  private buildSingleTitle(): void {
    const pid = this.node.activePanel, panel = this.panels.get(pid);
    const t = this.titleEl = el('span', 'dock-panel-title');
    t.setAttribute('data-tab-id', pid); t.textContent = panel?.title || 'Panel';
    t.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (panel && !panel.disabled) this.showTabContextMenu(pid, panel, e.clientX, e.clientY);
    });
    this.headerEl.appendChild(t);
  }

  private buildDefaultTabContent(tabEl: HTMLDivElement, panel: PanelConfig, panelId: string): void {
    if (panel.icon) { const ic = el('span'); ic.style.marginRight = '4px'; ic.textContent = panel.icon; tabEl.appendChild(ic); }
    const lbl = el('span', 'dock-tab-label'); lbl.textContent = panel.title; tabEl.appendChild(lbl);
    tabEl.title = panel.title;
    if (panel.closable !== false && !this.node.locked) {
      const cb = el('button', 'dock-tab-close');
      setAttrs(cb, { 'data-action': 'close', 'data-panel-id': panelId, 'aria-label': `Close ${panel.title}` });
      cb.innerHTML = iconClose(12); tabEl.appendChild(cb);
    }
  }

  private showTabContextMenu(panelId: string, panel: PanelConfig, x: number, y: number): void {
    this.hideTabContextMenu();
    const menu = el('div', 'dock-context-menu',
      `position:fixed;left:${x}px;top:${y}px;z-index:10010;background:hsl(var(--dock-surface));border:1px solid hsl(var(--dock-border));border-radius:4px;box-shadow:0 4px 12px rgba(0,0,0,0.15);padding:4px 0;min-width:140px;font-size:12px;color:hsl(var(--dock-text));`);
    const add = (label: string, action: () => void, disabled = false) => {
      const it = el('div', disabled ? 'dock-context-menu-item disabled' : 'dock-context-menu-item');
      it.textContent = label;
      if (!disabled) it.addEventListener('click', (e) => { e.stopPropagation(); this.hideTabContextMenu(); action(); });
      menu.appendChild(it);
    };
    const sep = () => menu.appendChild(el('div', 'dock-context-menu-separator'));
    const locked = !!this.node.locked, { panels: pids } = this.node, rs = this.resourceStrings;
    add(rs.close, () => this.callbacks.onClosePanel(panelId), panel.closable === false || locked);
    if (pids.length > 1) {
      add(rs.closeOthers, () => { for (const p of pids) if (p !== panelId && this.panels.get(p)?.closable !== false) this.callbacks.onClosePanel(p); });
      add(rs.closeAll, () => { for (const p of pids) if (this.panels.get(p)?.closable !== false) this.callbacks.onClosePanel(p); });
      const idx = pids.indexOf(panelId);
      if (idx < pids.length - 1) add('Close to the Right', () => { for (let i = idx + 1; i < pids.length; i++) if (this.panels.get(pids[i])?.closable !== false) this.callbacks.onClosePanel(pids[i]); });
    }
    sep();
    add(rs.float, () => this.callbacks.onFloatPanel(panelId), panel.floatable === false || locked);
    if (panel.allowPinning !== false) add(rs.unpin, () => this.callbacks.onUnpinPanel(panelId), locked);
    sep();
    add(rs.maximize, () => this.callbacks.onMaximizePanel(panelId), locked);
    if (this.callbacks.onSaveLayout) { sep(); add(rs.saveLayout, () => this.callbacks.onSaveLayout!()); }
    if (this.element.closest('.dark')) menu.classList.add('dark');
    document.body.appendChild(menu);
    this.contextMenuEl = menu;
    const handler = (e: MouseEvent) => { if (!menu.contains(e.target as Node)) this.hideTabContextMenu(); };
    document.addEventListener('mousedown', handler, true);
    this.contextMenuCleanup = () => document.removeEventListener('mousedown', handler, true);
  }

  private hideTabContextMenu(): void {
    this.contextMenuEl?.parentNode?.removeChild(this.contextMenuEl); this.contextMenuEl = null;
    this.contextMenuCleanup?.(); this.contextMenuCleanup = null;
  }

  private buildActionButtons(): void {
    this.actionButtonsEl.innerHTML = '';
    const ap = this.panels.get(this.node.activePanel), pid = this.node.activePanel;
    const isMax = this.maximizedPanelId === pid;
    if (ap?.disabled) return;
    const rs = this.resourceStrings, mk = (a: string, t: string, ic: string) => this.createActionButton(a, pid, t, ic);
    if (ap?.allowPinning !== false) this.actionButtonsEl.appendChild(mk('unpin', rs.unpin, iconUnpin()));
    if (ap?.allowMaximize !== false) this.actionButtonsEl.appendChild(isMax ? mk('restore', rs.restore, iconRestore()) : mk('maximize', rs.maximize, iconMaximize()));
    if (!isMax) this.actionButtonsEl.appendChild(mk('float', rs.float, iconFloat()));
  }

  private createActionButton(action: string, panelId: string, title: string, iconHtml: string): HTMLButtonElement {
    const btn = el('button', 'dock-action-btn');
    setAttrs(btn, { 'data-action': action, 'data-panel-id': panelId, 'aria-label': title });
    btn.title = title; btn.innerHTML = iconHtml;
    return btn;
  }

  private buildContent(): void {
    for (const [id, slot] of this.contentSlots) {
      if (!this.node.panels.includes(id)) { slot.disposable.dispose(); slot.container.remove(); this.contentSlots.delete(id); }
    }
    if (this.previousActiveId && this.previousActiveId !== this.node.activePanel) {
      const prev = this.contentSlots.get(this.previousActiveId);
      if (prev) prev.container.style.display = 'none';
    }
    const activeId = this.node.activePanel;
    this.previousActiveId = activeId;
    if (!activeId || !this.panels.get(activeId)) {
      if (this.callbacks.createWatermark) {
        if (!this.watermarkEl) {
          const wm = el('div', 'dock-watermark');
          this.contentAreaEl.appendChild(wm); this.watermarkEl = wm;
          this.watermarkSlot.value = this.callbacks.createWatermark(wm);
        }
      } else if (!this.contentAreaEl.querySelector('.dock-empty-placeholder')) {
        const ph = el('div', 'dock-empty-placeholder', 'display:flex;align-items:center;justify-content:center;height:100%;color:hsl(var(--dock-text-muted));font-size:14px;');
        ph.textContent = 'Empty'; this.contentAreaEl.appendChild(ph);
      }
      return;
    }
    if (this.watermarkEl) { this.watermarkSlot.clear(); this.watermarkEl.remove(); this.watermarkEl = null; }
    this.contentAreaEl.querySelector('.dock-empty-placeholder')?.remove();
    const existing = this.contentSlots.get(activeId);
    if (existing) { existing.container.style.display = ''; return; }
    const c = el('div', undefined, 'width:100%;height:100%;overflow:hidden;');
    this.contentAreaEl.appendChild(c);
    this.contentSlots.set(activeId, { container: c, disposable: this.callbacks.createContent(activeId, c) });
  }

  private updateTabStyles(): void {
    this.tabContainerEl?.querySelectorAll<HTMLElement>('[data-tab-id]').forEach((t) => {
      const sel = t.getAttribute('data-tab-id') === this.node.activePanel;
      t.className = sel ? 'dock-tab dock-tab-selected' : 'dock-tab';
      t.setAttribute('aria-selected', String(sel)); t.tabIndex = sel ? 0 : -1;
      t.style.color = ''; t.style.borderTopColor = ''; t.style.borderBottomColor = '';
    });
  }

  private updateTitleElement(): void {
    if (!this.titleEl) return;
    this.titleEl.textContent = this.panels.get(this.node.activePanel)?.title || 'Panel';
    this.titleEl.setAttribute('data-tab-id', this.node.activePanel);
  }

  private updateCustomTabs(prevPanels: Map<string, PanelConfig> | null): void {
    if (!this.tabContainerEl || !this.callbacks.createTab) return;
    for (const pid of this.node.panels) {
      const prev = prevPanels?.get(pid), curr = this.panels.get(pid);
      if (!prev || !curr || (prev.title === curr.title && prev.icon === curr.icon && prev.badge === curr.badge)) continue;
      const tab = this.tabContainerEl.querySelector<HTMLElement>(`[data-tab-id="${pid}"]`);
      if (!tab) continue;
      this.tabDisposables.get(pid)?.dispose(); this.tabDisposables.delete(pid);
      this.tabDisposables.set(pid, this.callbacks.createTab(pid, tab, pid === this.node.activePanel));
    }
  }

  private updateTabLabels(): void {
    this.tabContainerEl?.querySelectorAll<HTMLElement>('[data-tab-id]').forEach(t => {
      const pid = t.getAttribute('data-tab-id');
      const panel = pid ? this.panels.get(pid) : undefined;
      if (!panel) return;
      const lbl = t.querySelector('.dock-tab-label');
      if (lbl) lbl.textContent = panel.title;
      const ico = t.querySelector('.dock-tab-icon');
      if (panel.icon) { if (ico) ico.textContent = panel.icon; else { const i = el('span', 'dock-tab-icon'); i.textContent = panel.icon; t.insertBefore(i, t.firstChild); } }
      else ico?.remove();
      const badge = t.querySelector('.dock-tab-badge');
      if (panel.badge) { if (badge) badge.textContent = panel.badge; else { const b = el('span', 'dock-tab-badge'); b.textContent = panel.badge; t.appendChild(b); } }
      else badge?.remove();
    });
  }

  private updateOverflowButton(): void {
    if (this.overflowBtn) this.overflowBtn.style.display = this.overflowState.hasOverflow ? 'flex' : 'none';
    if (!this.overflowState.hasOverflow) this.hideOverflowMenu();
  }

  private toggleOverflowMenu(): void { this.overflowMenuEl ? this.hideOverflowMenu() : this.showOverflowMenu(); }

  private showOverflowMenu(): void {
    if (!this.overflowBtn || !this.tabContainerEl) return;
    this.hideOverflowMenu();
    const menu = el('div', 'dock-context-menu dock-tab-overflow-menu', 'position:fixed;z-index:10010;max-height:60vh;overflow-y:auto;');
    menu.setAttribute('role', 'menu');
    for (const pid of this.node.panels) {
      const panel = this.panels.get(pid);
      if (!panel) continue;
      const it = el('div', 'dock-context-menu-item dock-tab-overflow-menu-item', 'display:flex;align-items:center;min-width:160px;max-width:320px;');
      setAttrs(it, { role: 'menuitem', 'data-panel-id': pid });
      if (pid === this.node.activePanel) it.setAttribute('aria-current', 'true');
      const lbl = el('span', undefined, 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;');
      lbl.textContent = panel.title; it.appendChild(lbl);
      it.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
      it.addEventListener('click', (e) => {
        e.stopPropagation(); this.hideOverflowMenu();
        this.callbacks.onSetActivePanel(this.node.id, pid);
        this.callbacks.onSetActivePane(pid); this.scrollTabIntoView(pid);
      });
      menu.appendChild(it);
    }
    if (this.element.closest('.dark')) menu.classList.add('dark');
    document.body.appendChild(menu);
    const br = this.overflowBtn.getBoundingClientRect(), mr = menu.getBoundingClientRect();
    let left = br.right - mr.width, top = br.bottom + 2;
    if (left < 4) left = 4;
    if (left + mr.width > window.innerWidth - 4) left = window.innerWidth - mr.width - 4;
    if (top + mr.height > window.innerHeight - 4) top = br.top - mr.height - 2;
    menu.style.left = `${left}px`; menu.style.top = `${top}px`;
    this.overflowMenuEl = menu;
    this.overflowBtn.setAttribute('aria-expanded', 'true');
    this.overflowMenuOutsideHandler = (ev: MouseEvent) => {
      const t = ev.target as Node;
      if (this.overflowMenuEl && !this.overflowMenuEl.contains(t) && t !== this.overflowBtn) this.hideOverflowMenu();
    };
    this.overflowMenuKeyHandler = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.stopPropagation(); this.hideOverflowMenu(); } };
    document.addEventListener('mousedown', this.overflowMenuOutsideHandler, true);
    document.addEventListener('keydown', this.overflowMenuKeyHandler, true);
  }

  private hideOverflowMenu(): void {
    this.overflowMenuEl?.remove(); this.overflowMenuEl = null;
    if (this.overflowMenuOutsideHandler) { document.removeEventListener('mousedown', this.overflowMenuOutsideHandler, true); this.overflowMenuOutsideHandler = null; }
    if (this.overflowMenuKeyHandler) { document.removeEventListener('keydown', this.overflowMenuKeyHandler, true); this.overflowMenuKeyHandler = null; }
    this.overflowBtn?.setAttribute('aria-expanded', 'false');
  }

  private scrollTabIntoView(panelId: string): void {
    const tab = this.tabContainerEl?.querySelector<HTMLElement>(`[data-tab-id="${panelId}"]`);
    if (tab?.scrollIntoView) tab.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }
}
