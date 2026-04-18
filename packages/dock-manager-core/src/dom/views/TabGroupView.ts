import type { TabGroupNode, PanelConfig, DockManagerState } from '../../types/dock';
import type { DockResourceStrings } from '../../types/resourceStrings';
import { defaultResourceStrings } from '../../types/resourceStrings';
import { TabOverflowObserver, type TabOverflowState } from '../TabOverflowObserver';
import {
  iconClose,
  iconMaximize,
  iconRestore,
  iconFloat,
  iconUnpin,
} from '../icons';
import { MutableDisposable } from '../../utils/lifecycle';

export interface IDisposable {
  dispose(): void;
}

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

// Helper: create an element with className and optional inline style
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className?: string, style?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (style) e.style.cssText = style;
  return e;
}

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

  constructor(
    node: TabGroupNode,
    panels: Map<string, PanelConfig>,
    activePaneId: string,
    maximizedPanelId: string | undefined,
    callbacks: TabGroupViewCallbacks,
    resourceStrings?: Partial<DockResourceStrings>,
  ) {
    this.node = node;
    this.panels = panels;
    this.activePaneId = activePaneId;
    this.maximizedPanelId = maximizedPanelId;
    this.callbacks = callbacks;
    this.resourceStrings = { ...defaultResourceStrings, ...resourceStrings };

    this.element = el('div', this.getRootClassName(),
      'display:flex;flex-direction:column;height:100%;width:100%;position:relative;');
    this.element.setAttribute('data-dock-target', node.id);
    if (node.locked) this.element.setAttribute('data-locked-group', 'true');
    this.element.setAttribute('role', 'region');
    this.element.setAttribute('aria-label', panels.get(node.activePanel)?.title || 'Panel');
    this.element.tabIndex = -1;
    this.applyHasTabsAttr();
    this.element.setAttribute('data-panel-id', node.activePanel);

    this.element.addEventListener('focus', () => {
      this.callbacks.onSetActivePane(this.node.activePanel);
    });

    const isBottomTabs = node.headerPosition === 'bottom' && node.panels.length > 1;

    this.headerEl = el('div', 'dock-panel-header',
      'display:flex;align-items:center;justify-content:space-between;min-height:32px;padding:0 12px;flex-shrink:0;');
    this.element.appendChild(this.headerEl);

    this.contentAreaEl = el('div', undefined,
      'flex:1;position:relative;overflow:hidden;border-top:1px solid hsl(var(--dock-border) / 0.7);box-sizing:border-box;');
    this.contentAreaEl.setAttribute('role', 'tabpanel');
    this.contentAreaEl.id = `panel-${node.activePanel}`;
    this.contentAreaEl.setAttribute('aria-labelledby', `tab-${node.activePanel}`);
    this.element.appendChild(this.contentAreaEl);

    if (isBottomTabs) {
      this.bottomTabStripEl = this.createBottomTabStrip();
      this.element.appendChild(this.bottomTabStripEl);
    }

    this.actionButtonsEl = el('div', undefined, 'display:flex;align-items:center;gap:0;flex-shrink:0;margin-left:8px;');

    this.buildHeader();
    this.updateHeaderCollapse();

    if (node.headerCollapsed && this.node.panels.length === 1) {
      this.headerCollapsed = true;
      this.applyHeaderCollapsed();
    }

    this.buildContent();

    this.tabOverflowObserver = new TabOverflowObserver((state) => {
      this.overflowState = state;
      this.updateOverflowButton();
    });
    if (this.tabContainerEl) this.tabOverflowObserver.observe(this.tabContainerEl);
  }

  update(
    node: TabGroupNode,
    panels: Map<string, PanelConfig>,
    activePaneId: string,
    maximizedPanelId: string | undefined,
  ): void {
    const prevNode = this.node;
    const prevActivePaneId = this.activePaneId;
    const prevMaximizedPanelId = this.maximizedPanelId;

    this.node = node;
    this.panels = panels;
    this.activePaneId = activePaneId;
    this.maximizedPanelId = maximizedPanelId;

    this.element.setAttribute('data-panel-id', node.activePanel);
    this.element.setAttribute('aria-label', panels.get(node.activePanel)?.title || 'Panel');
    this.applyHasTabsAttr();
    if (node.locked) this.element.setAttribute('data-locked-group', 'true');
    else this.element.removeAttribute('data-locked-group');
    this.element.className = this.getRootClassName();
    this.contentAreaEl.id = `panel-${node.activePanel}`;
    this.contentAreaEl.setAttribute('aria-labelledby', `tab-${node.activePanel}`);

    const panelsChanged =
      prevNode.panels.length !== node.panels.length ||
      prevNode.panels.some((p, i) => p !== node.panels[i]) ||
      prevNode.locked !== node.locked;
    const activePanelChanged = prevNode.activePanel !== node.activePanel;
    const activePaneChanged = prevActivePaneId !== activePaneId;
    const maximizedStateChanged = prevMaximizedPanelId !== maximizedPanelId;

    const prevPanels = this.previousPanels;
    this.previousPanels = panels;
    const configChanged = !panelsChanged && node.panels.some(id => {
      const prev = prevPanels?.get(id);
      const curr = panels.get(id);
      if (!prev || !curr) return false;
      return prev.title !== curr.title || prev.icon !== curr.icon || prev.badge !== curr.badge;
    });

    // Sync header collapsed state
    const isSingleTab = node.panels.length === 1;
    const nodeCollapsed = !!node.headerCollapsed && isSingleTab;
    const wasCollapsed = this.headerCollapsed;
    if (nodeCollapsed !== wasCollapsed) {
      this.headerCollapsed = nodeCollapsed;
      this.applyHeaderCollapsed();
    }
    if (!isSingleTab && (wasCollapsed || node.headerCollapsed)) {
      this.callbacks.onSetHeaderCollapsed(node.id, false);
    }

    if (panelsChanged) {
      const needsBottomTabs = node.headerPosition === 'bottom' && node.panels.length > 1;
      if (needsBottomTabs && !this.bottomTabStripEl) {
        this.bottomTabStripEl = this.createBottomTabStrip();
        this.element.appendChild(this.bottomTabStripEl);
      }
      if (!needsBottomTabs && this.bottomTabStripEl) {
        this.bottomTabStripEl.remove();
        this.bottomTabStripEl = null;
      }
      this.clearHeader();
      this.buildHeader();
      this.updateHeaderCollapse();
      if (this.tabContainerEl) this.tabOverflowObserver.observe(this.tabContainerEl);
    } else if (activePanelChanged || activePaneChanged || maximizedStateChanged) {
      this.updateTabStyles();
      this.buildActionButtons();
      this.updateTitleElement();
    }

    if (configChanged) {
      if (this.callbacks.createTab) {
        this.updateCustomTabs(prevPanels);
      } else {
        this.updateTabLabels();
      }
      this.updateTitleElement();
    }

    if (activePanelChanged || panelsChanged) this.buildContent();
  }

  containsPanel(panelId: string): boolean {
    return this.node.panels.includes(panelId);
  }

  invalidateContentSlot(panelId: string): void {
    const slot = this.contentSlots.get(panelId);
    if (slot) {
      slot.container.remove();
      this.contentSlots.delete(panelId);
    }
    this.previousActiveId = null;
    this.buildContent();
  }

  dispose(): void {
    this.hideTabContextMenu();
    this.tabOverflowObserver.dispose();

    for (const [, slot] of this.contentSlots) slot.disposable.dispose();
    this.contentSlots.clear();
    for (const [, d] of this.tabDisposables) d.dispose();
    this.tabDisposables.clear();

    this.prefixSlotDisposable?.dispose();
    this.leftSlotDisposable?.dispose();
    this.rightSlotDisposable?.dispose();

    this.watermarkSlot.dispose();
    this.watermarkEl = null;
    this.hideOverflowMenu();

    this.headerCollapsePill?.remove();
    this.headerCollapsePill = null;
    this.headerHoverZone?.remove();
    this.headerHoverZone = null;

    this.element.parentNode?.removeChild(this.element);
  }

  // ── Private helpers ────────────────────────────────────────────

  private createBottomTabStrip(): HTMLDivElement {
    const strip = el('div', 'dock-panel-header dock-bottom-tab-strip',
      'display:flex;align-items:center;min-height:28px;padding:0 8px;flex-shrink:0;border-top:1px solid hsl(var(--dock-border) / 0.7);border-bottom:none;');
    return strip;
  }

  private getRootClassName(): string {
    return `dock-tab-group${this.node.panels.includes(this.activePaneId) ? ' dock-pane-active' : ''}`;
  }

  private applyHasTabsAttr(): void {
    if (this.node.panels.length > 1) this.element.setAttribute('data-has-tabs', '');
    else this.element.removeAttribute('data-has-tabs');
  }

  // ── Header collapse ────────────────────────────────────────────

  private updateHeaderCollapse(): void {
    const isSingleTab = this.node.panels.length === 1;

    if (isSingleTab && !this.headerCollapsePill) {
      this.headerCollapsePill = el('button', 'dock-header-collapse-pill');
      this.headerCollapsePill.setAttribute('aria-label', 'Hide header');
      this.headerCollapsePill.title = 'Hide header';
      this.headerCollapsePill.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>';
      this.headerCollapsePill.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleHeaderCollapsed();
      });
      this.headerEl.appendChild(this.headerCollapsePill);

      this.headerHoverZone = el('div', 'dock-header-hover-zone');
      this.headerHoverZone.setAttribute('role', 'button');
      this.headerHoverZone.setAttribute('aria-label', 'Show header');
      this.headerHoverZone.title = 'Show header';
      this.headerHoverZone.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
      this.headerHoverZone.addEventListener('click', () => this.toggleHeaderCollapsed());
      this.element.appendChild(this.headerHoverZone);
    } else if (!isSingleTab) {
      this.headerCollapsePill?.remove();
      this.headerCollapsePill = null;
      this.headerHoverZone?.remove();
      this.headerHoverZone = null;
      if (this.headerCollapsed) {
        this.headerCollapsed = false;
        this.applyHeaderCollapsed();
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
    if (this.headerCollapsed) {
      this.headerEl.style.display = 'none';
      this.element.setAttribute('data-header-collapsed', '');
    } else {
      this.headerEl.style.display = '';
      this.element.removeAttribute('data-header-collapsed');
    }
  }

  // ── Header building ────────────────────────────────────────────

  private clearHeader(): void {
    this.hideOverflowMenu();
    this.overflowBtn = null;
    for (const [, d] of this.tabDisposables) d.dispose();
    this.tabDisposables.clear();

    this.disposeSlot('prefix');
    this.disposeSlot('left');
    this.disposeSlot('right');

    this.headerEl.innerHTML = '';
    if (this.bottomTabStripEl) this.bottomTabStripEl.innerHTML = '';
    this.tabContainerEl = null;
    this.titleEl = null;
    this.prefixSlotEl = null;
    this.leftSlotEl = null;
    this.rightSlotEl = null;
  }

  private disposeSlot(slot: 'prefix' | 'left' | 'right'): void {
    const key = `${slot}SlotDisposable` as 'prefixSlotDisposable' | 'leftSlotDisposable' | 'rightSlotDisposable';
    this[key]?.dispose();
    this[key] = null;
  }

  private createHeaderActionSlot(slot: 'prefix' | 'left' | 'right', marginSide: 'right' | 'left'): HTMLDivElement | null {
    if (!this.callbacks.createHeaderActions) return null;
    const slotEl = el('div', undefined, `display:flex;align-items:center;margin-${marginSide}:4px;flex-shrink:0;`);
    const key = `${slot}SlotEl` as 'prefixSlotEl' | 'leftSlotEl' | 'rightSlotEl';
    const dKey = `${slot}SlotDisposable` as 'prefixSlotDisposable' | 'leftSlotDisposable' | 'rightSlotDisposable';
    this[key] = slotEl;
    this[dKey] = this.callbacks.createHeaderActions(slot, this.node.id, slotEl);
    return slotEl;
  }

  private buildHeader(): void {
    const hasTabs = this.node.panels.length > 1;
    const isBottomTabs = this.node.headerPosition === 'bottom' && hasTabs;

    const prefixSlot = this.createHeaderActionSlot('prefix', 'right');
    if (prefixSlot) this.headerEl.appendChild(prefixSlot);

    const leftSlot = this.createHeaderActionSlot('left', 'right');
    if (leftSlot) this.headerEl.appendChild(leftSlot);

    if (isBottomTabs) {
      this.buildSingleTitle();
      if (this.bottomTabStripEl) this.buildTabStrip(this.bottomTabStripEl);
    } else {
      this.buildTabStrip(this.headerEl);
    }

    const rightSlot = this.createHeaderActionSlot('right', 'left');
    if (rightSlot) this.headerEl.appendChild(rightSlot);

    this.buildActionButtons();
    this.headerEl.appendChild(this.actionButtonsEl);
  }

  private buildTabStrip(parentEl?: HTMLElement): void {
    const outerWrap = el('div', undefined,
      'display:flex;align-items:flex-end;align-self:stretch;gap:0;flex:1;overflow-x:hidden;overflow-y:visible;position:relative;');

    this.tabContainerEl = el('div', undefined,
      'display:flex;align-items:flex-end;align-self:stretch;gap:0;overflow-x:hidden;overflow-y:visible;flex:1;');
    this.tabContainerEl.setAttribute('role', 'tablist');
    this.tabContainerEl.setAttribute('aria-label', 'Panel tabs');

    for (const panelId of this.node.panels) {
      const panel = this.panels.get(panelId);
      if (!panel) continue;
      const isSelected = panelId === this.node.activePanel;
      const isDisabled = panel.disabled === true;

      const tabEl = el('div',
        `dock-tab${isSelected ? ' dock-tab-selected' : ''}${isDisabled ? ' dock-tab-disabled' : ''}`);
      tabEl.setAttribute('data-tab-id', panelId);
      tabEl.id = `tab-${panelId}`;
      tabEl.setAttribute('role', 'tab');
      tabEl.setAttribute('aria-selected', String(isSelected));
      tabEl.setAttribute('aria-controls', `panel-${panelId}`);
      tabEl.tabIndex = isSelected ? 0 : -1;
      if (isDisabled) tabEl.setAttribute('data-disabled', 'true');

      if (this.callbacks.createTab) {
        this.tabDisposables.set(panelId, this.callbacks.createTab(panelId, tabEl, isSelected));
      } else {
        this.buildDefaultTabContent(tabEl, panel, panelId);
      }

      tabEl.addEventListener('dblclick', (e) => {
        e.preventDefault();
        if (panel.disabled) return;
        if (this.callbacks.onToggleMaximize) {
          this.callbacks.onToggleMaximize(panelId);
        } else if (this.maximizedPanelId === panelId) {
          this.callbacks.onRestorePanel(panelId);
        } else {
          this.callbacks.onMaximizePanel(panelId);
        }
      });

      tabEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!panel.disabled) this.showTabContextMenu(panelId, panel, e.clientX, e.clientY);
      });

      this.tabContainerEl.appendChild(tabEl);
    }

    outerWrap.appendChild(this.tabContainerEl);

    this.overflowBtn = el('button', 'dock-tab-overflow-btn',
      'flex-shrink:0;align-self:stretch;padding:2px 6px;color:hsl(var(--dock-text-muted));cursor:pointer;background:none;border:none;display:none;align-items:center;justify-content:center;');
    this.overflowBtn.setAttribute('aria-label', this.resourceStrings.tabOverflowMenu ?? 'Show all tabs');
    this.overflowBtn.setAttribute('aria-haspopup', 'menu');
    this.overflowBtn.setAttribute('aria-expanded', 'false');
    this.overflowBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    this.overflowBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); });
    this.overflowBtn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); this.toggleOverflowMenu(); });
    outerWrap.appendChild(this.overflowBtn);

    (parentEl || this.headerEl).appendChild(outerWrap);
  }

  private buildSingleTitle(): void {
    const panelId = this.node.activePanel;
    const activePanel = this.panels.get(panelId);
    this.titleEl = el('span', 'dock-panel-title');
    this.titleEl.setAttribute('data-tab-id', panelId);
    this.titleEl.textContent = activePanel?.title || 'Panel';

    this.titleEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (activePanel && !activePanel.disabled) {
        this.showTabContextMenu(panelId, activePanel, e.clientX, e.clientY);
      }
    });

    this.headerEl.appendChild(this.titleEl);
  }

  private buildDefaultTabContent(tabEl: HTMLDivElement, panel: PanelConfig, panelId: string): void {
    if (panel.icon) {
      const iconSpan = el('span');
      iconSpan.style.marginRight = '4px';
      iconSpan.textContent = panel.icon;
      tabEl.appendChild(iconSpan);
    }

    const labelSpan = el('span', 'dock-tab-label');
    labelSpan.textContent = panel.title;
    tabEl.appendChild(labelSpan);
    tabEl.title = panel.title;

    if (panel.closable !== false && !this.node.locked) {
      const closeBtn = el('button', 'dock-tab-close');
      closeBtn.setAttribute('data-action', 'close');
      closeBtn.setAttribute('data-panel-id', panelId);
      closeBtn.setAttribute('aria-label', `Close ${panel.title}`);
      closeBtn.innerHTML = iconClose(12);
      tabEl.appendChild(closeBtn);
    }
  }

  // ── Context menu ───────────────────────────────────────────────

  private contextMenuEl: HTMLDivElement | null = null;
  private contextMenuCleanup: (() => void) | null = null;

  private showTabContextMenu(panelId: string, panel: PanelConfig, x: number, y: number): void {
    this.hideTabContextMenu();

    const menu = el('div', 'dock-context-menu', `
      position:fixed; left:${x}px; top:${y}px; z-index:10010;
      background:hsl(var(--dock-surface)); border:1px solid hsl(var(--dock-border));
      border-radius:4px; box-shadow:0 4px 12px rgba(0,0,0,0.15);
      padding:4px 0; min-width:140px; font-size:12px;
      color:hsl(var(--dock-text));
    `);

    const addItem = (label: string, action: () => void, disabled = false) => {
      const item = el('div', disabled ? 'dock-context-menu-item disabled' : 'dock-context-menu-item');
      item.textContent = label;
      if (!disabled) {
        item.addEventListener('click', (e) => { e.stopPropagation(); this.hideTabContextMenu(); action(); });
      }
      menu.appendChild(item);
    };
    const addSep = () => menu.appendChild(el('div', 'dock-context-menu-separator'));

    const locked = !!this.node.locked;

    addItem(this.resourceStrings.close, () => this.callbacks.onClosePanel(panelId), panel.closable === false || locked);

    if (this.node.panels.length > 1) {
      addItem(this.resourceStrings.closeOthers, () => {
        for (const pid of this.node.panels) {
          if (pid !== panelId && this.panels.get(pid)?.closable !== false) this.callbacks.onClosePanel(pid);
        }
      });
      addItem(this.resourceStrings.closeAll, () => {
        for (const pid of this.node.panels) {
          if (this.panels.get(pid)?.closable !== false) this.callbacks.onClosePanel(pid);
        }
      });
      const panelIndex = this.node.panels.indexOf(panelId);
      if (panelIndex < this.node.panels.length - 1) {
        addItem('Close to the Right', () => {
          for (let i = panelIndex + 1; i < this.node.panels.length; i++) {
            const pid = this.node.panels[i];
            if (this.panels.get(pid)?.closable !== false) this.callbacks.onClosePanel(pid);
          }
        });
      }
    }

    addSep();
    addItem(this.resourceStrings.float, () => this.callbacks.onFloatPanel(panelId), panel.floatable === false || locked);
    if (panel.allowPinning !== false) {
      addItem(this.resourceStrings.unpin, () => this.callbacks.onUnpinPanel(panelId), locked);
    }
    addSep();
    addItem(this.resourceStrings.maximize, () => this.callbacks.onMaximizePanel(panelId), locked);

    if (this.callbacks.onSaveLayout) {
      addSep();
      addItem(this.resourceStrings.saveLayout, () => this.callbacks.onSaveLayout!());
    }

    if (this.element.closest('.dark')) menu.classList.add('dark');
    document.body.appendChild(menu);
    this.contextMenuEl = menu;

    const onOutsideClick = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) this.hideTabContextMenu();
    };
    document.addEventListener('mousedown', onOutsideClick, true);
    this.contextMenuCleanup = () => document.removeEventListener('mousedown', onOutsideClick, true);
  }

  private hideTabContextMenu(): void {
    this.contextMenuEl?.parentNode?.removeChild(this.contextMenuEl);
    this.contextMenuEl = null;
    this.contextMenuCleanup?.();
    this.contextMenuCleanup = null;
  }

  // ── Action buttons ─────────────────────────────────────────────

  private buildActionButtons(): void {
    this.actionButtonsEl.innerHTML = '';
    const activePanel = this.panels.get(this.node.activePanel);
    const isMaximized = this.maximizedPanelId === this.node.activePanel;
    if (activePanel?.disabled) return;

    const allowMaximize = activePanel?.allowMaximize !== false;
    const allowPinning = activePanel?.allowPinning !== false;

    if (allowPinning) {
      this.actionButtonsEl.appendChild(this.createActionButton('unpin', this.node.activePanel, this.resourceStrings.unpin, iconUnpin()));
    }
    if (allowMaximize) {
      this.actionButtonsEl.appendChild(isMaximized
        ? this.createActionButton('restore', this.node.activePanel, this.resourceStrings.restore, iconRestore())
        : this.createActionButton('maximize', this.node.activePanel, this.resourceStrings.maximize, iconMaximize()));
    }
    if (!isMaximized) {
      this.actionButtonsEl.appendChild(this.createActionButton('float', this.node.activePanel, this.resourceStrings.float, iconFloat()));
    }
  }

  private createActionButton(action: string, panelId: string, title: string, iconHtml: string): HTMLButtonElement {
    const btn = el('button', 'dock-action-btn');
    btn.setAttribute('data-action', action);
    btn.setAttribute('data-panel-id', panelId);
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.innerHTML = iconHtml;
    return btn;
  }

  // ── Content ────────────────────────────────────────────────────

  private previousActiveId: string | null = null;

  private buildContent(): void {
    // Remove stale content slots
    for (const [id, slot] of this.contentSlots) {
      if (!this.node.panels.includes(id)) {
        slot.disposable.dispose();
        slot.container.remove();
        this.contentSlots.delete(id);
      }
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
          this.contentAreaEl.appendChild(wm);
          this.watermarkEl = wm;
          this.watermarkSlot.value = this.callbacks.createWatermark(wm);
        }
      } else if (!this.contentAreaEl.querySelector('.dock-empty-placeholder')) {
        const placeholder = el('div', 'dock-empty-placeholder',
          'display:flex;align-items:center;justify-content:center;height:100%;color:hsl(var(--dock-text-muted));font-size:14px;');
        placeholder.textContent = 'Empty';
        this.contentAreaEl.appendChild(placeholder);
      }
      return;
    }

    if (this.watermarkEl) {
      this.watermarkSlot.clear();
      this.watermarkEl.remove();
      this.watermarkEl = null;
    }
    this.contentAreaEl.querySelector('.dock-empty-placeholder')?.remove();

    const existing = this.contentSlots.get(activeId);
    if (existing) { existing.container.style.display = ''; return; }

    const container = el('div', undefined, 'width:100%;height:100%;overflow:hidden;');
    this.contentAreaEl.appendChild(container);
    this.contentSlots.set(activeId, { container, disposable: this.callbacks.createContent(activeId, container) });
  }

  // ── Tab updates ────────────────────────────────────────────────

  private updateTabStyles(): void {
    if (!this.tabContainerEl) return;
    this.tabContainerEl.querySelectorAll<HTMLElement>('[data-tab-id]').forEach((tabEl) => {
      const panelId = tabEl.getAttribute('data-tab-id');
      const isSelected = panelId === this.node.activePanel;
      tabEl.className = isSelected ? 'dock-tab dock-tab-selected' : 'dock-tab';
      tabEl.setAttribute('aria-selected', String(isSelected));
      tabEl.tabIndex = isSelected ? 0 : -1;
      tabEl.style.color = '';
      tabEl.style.borderTopColor = '';
      tabEl.style.borderBottomColor = '';
    });
  }

  private updateTitleElement(): void {
    if (!this.titleEl) return;
    this.titleEl.textContent = this.panels.get(this.node.activePanel)?.title || 'Panel';
    this.titleEl.setAttribute('data-tab-id', this.node.activePanel);
  }

  private updateCustomTabs(prevPanels: Map<string, PanelConfig> | null): void {
    if (!this.tabContainerEl || !this.callbacks.createTab) return;
    for (const panelId of this.node.panels) {
      const prev = prevPanels?.get(panelId);
      const curr = this.panels.get(panelId);
      if (!prev || !curr) continue;
      if (prev.title === curr.title && prev.icon === curr.icon && prev.badge === curr.badge) continue;
      const tabEl = this.tabContainerEl.querySelector<HTMLElement>(`[data-tab-id="${panelId}"]`);
      if (!tabEl) continue;
      this.tabDisposables.get(panelId)?.dispose();
      this.tabDisposables.delete(panelId);
      this.tabDisposables.set(panelId, this.callbacks.createTab(panelId, tabEl, panelId === this.node.activePanel));
    }
  }

  private updateTabLabels(): void {
    if (!this.tabContainerEl) return;
    this.tabContainerEl.querySelectorAll<HTMLElement>('[data-tab-id]').forEach(tabEl => {
      const panelId = tabEl.getAttribute('data-tab-id');
      if (!panelId) return;
      const panel = this.panels.get(panelId);
      if (!panel) return;

      const labelEl = tabEl.querySelector('.dock-tab-label');
      if (labelEl) labelEl.textContent = panel.title;

      const iconEl = tabEl.querySelector('.dock-tab-icon');
      if (panel.icon) {
        if (iconEl) { iconEl.textContent = panel.icon; }
        else { const ic = el('span', 'dock-tab-icon'); ic.textContent = panel.icon; tabEl.insertBefore(ic, tabEl.firstChild); }
      } else { iconEl?.remove(); }

      const badgeEl = tabEl.querySelector('.dock-tab-badge');
      if (panel.badge) {
        if (badgeEl) { badgeEl.textContent = panel.badge; }
        else { const b = el('span', 'dock-tab-badge'); b.textContent = panel.badge; tabEl.appendChild(b); }
      } else { badgeEl?.remove(); }
    });
  }

  // ── Overflow menu ──────────────────────────────────────────────

  private updateOverflowButton(): void {
    if (this.overflowBtn) this.overflowBtn.style.display = this.overflowState.hasOverflow ? 'flex' : 'none';
    if (!this.overflowState.hasOverflow) this.hideOverflowMenu();
  }

  private toggleOverflowMenu(): void {
    if (this.overflowMenuEl) this.hideOverflowMenu();
    else this.showOverflowMenu();
  }

  private showOverflowMenu(): void {
    if (!this.overflowBtn || !this.tabContainerEl) return;
    this.hideOverflowMenu();

    const menu = el('div', 'dock-context-menu dock-tab-overflow-menu', 'position:fixed;z-index:10010;max-height:60vh;overflow-y:auto;');
    menu.setAttribute('role', 'menu');

    for (const panelId of this.node.panels) {
      const panel = this.panels.get(panelId);
      if (!panel) continue;

      const item = el('div', 'dock-context-menu-item dock-tab-overflow-menu-item',
        'display:flex;align-items:center;min-width:160px;max-width:320px;');
      item.setAttribute('role', 'menuitem');
      item.setAttribute('data-panel-id', panelId);
      if (panelId === this.node.activePanel) item.setAttribute('aria-current', 'true');

      const label = el('span', undefined, 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;');
      label.textContent = panel.title;
      item.appendChild(label);

      item.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hideOverflowMenu();
        this.callbacks.onSetActivePanel(this.node.id, panelId);
        this.callbacks.onSetActivePane(panelId);
        this.scrollTabIntoView(panelId);
      });
      menu.appendChild(item);
    }

    if (this.element.closest('.dark')) menu.classList.add('dark');
    document.body.appendChild(menu);

    // Position below the button, clamped to viewport
    const btnRect = this.overflowBtn.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    let left = btnRect.right - menuRect.width;
    if (left < 4) left = 4;
    if (left + menuRect.width > window.innerWidth - 4) left = window.innerWidth - menuRect.width - 4;
    let top = btnRect.bottom + 2;
    if (top + menuRect.height > window.innerHeight - 4) top = btnRect.top - menuRect.height - 2;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    this.overflowMenuEl = menu;
    this.overflowBtn.setAttribute('aria-expanded', 'true');

    this.overflowMenuOutsideHandler = (ev: MouseEvent) => {
      const target = ev.target as Node;
      if (this.overflowMenuEl && !this.overflowMenuEl.contains(target) && target !== this.overflowBtn) {
        this.hideOverflowMenu();
      }
    };
    this.overflowMenuKeyHandler = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') { ev.stopPropagation(); this.hideOverflowMenu(); }
    };
    document.addEventListener('mousedown', this.overflowMenuOutsideHandler, true);
    document.addEventListener('keydown', this.overflowMenuKeyHandler, true);
  }

  private hideOverflowMenu(): void {
    this.overflowMenuEl?.remove();
    this.overflowMenuEl = null;
    if (this.overflowMenuOutsideHandler) {
      document.removeEventListener('mousedown', this.overflowMenuOutsideHandler, true);
      this.overflowMenuOutsideHandler = null;
    }
    if (this.overflowMenuKeyHandler) {
      document.removeEventListener('keydown', this.overflowMenuKeyHandler, true);
      this.overflowMenuKeyHandler = null;
    }
    this.overflowBtn?.setAttribute('aria-expanded', 'false');
  }

  private scrollTabIntoView(panelId: string): void {
    if (!this.tabContainerEl) return;
    const tab = this.tabContainerEl.querySelector<HTMLElement>(`[data-tab-id="${panelId}"]`);
    if (tab && typeof tab.scrollIntoView === 'function') {
      tab.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
  }
}
