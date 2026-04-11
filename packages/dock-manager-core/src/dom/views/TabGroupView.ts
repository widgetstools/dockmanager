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

// ─── Interfaces ──────────────────────────────────────────────────────

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
  onSetHeaderCollapsed: (tabGroupId: string, collapsed: boolean) => void;
  createHeaderActions?: (slot: 'left' | 'right' | 'prefix', tabGroupId: string, container: HTMLElement) => IDisposable;
  createWatermark?: (container: HTMLElement) => IDisposable;
}

// ─── TabGroupView ────────────────────────────────────────────────────

export class TabGroupView {
  readonly element: HTMLDivElement;

  private node: TabGroupNode;
  private panels: Record<string, PanelConfig>;
  private previousPanels: Record<string, PanelConfig> | null = null;
  private activePaneId: string;
  private maximizedPanelId: string | undefined;
  private callbacks: TabGroupViewCallbacks;

  // DOM references
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

  // Header action slots
  private prefixSlotEl: HTMLDivElement | null = null;
  private leftSlotEl: HTMLDivElement | null = null;
  private rightSlotEl: HTMLDivElement | null = null;
  private prefixSlotDisposable: IDisposable | null = null;
  private leftSlotDisposable: IDisposable | null = null;
  private rightSlotDisposable: IDisposable | null = null;

  // Content management
  private contentSlots = new Map<string, { container: HTMLDivElement; disposable: IDisposable }>();
  private tabDisposables = new Map<string, IDisposable>();
  private readonly watermarkSlot = new MutableDisposable();
  private watermarkEl: HTMLDivElement | null = null;

  // Tab overflow
  private tabOverflowObserver: TabOverflowObserver;
  private overflowState: TabOverflowState = { visibleTabs: [], overflowTabs: [], hasOverflow: false };

  // Header collapse for single-tab panes
  private headerCollapsed = false;
  private headerCollapsePill: HTMLButtonElement | null = null;
  private headerHoverZone: HTMLDivElement | null = null;

  // Resource strings for localization
  private resourceStrings: DockResourceStrings;

  constructor(
    node: TabGroupNode,
    panels: Record<string, PanelConfig>,
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

    // Create root element
    this.element = document.createElement('div');
    this.element.style.cssText = 'display:flex;flex-direction:column;height:100%;width:100%;position:relative;';
    this.element.className = this.getRootClassName();
    this.element.setAttribute('data-dock-target', node.id);
    if (node.locked) this.element.setAttribute('data-locked-group', 'true');
    this.element.setAttribute('role', 'region');
    this.element.setAttribute('aria-label', panels[node.activePanel]?.title || 'Panel');
    this.element.tabIndex = -1;

    this.applyHasTabsAttr();
    this.element.setAttribute('data-panel-id', node.activePanel);

    // Focus handler
    this.element.addEventListener('focus', () => {
      this.callbacks.onSetActivePane(this.node.activePanel);
    });

    const isBottomTabs = node.headerPosition === 'bottom' && node.panels.length > 1;

    // Create header (title bar — always at top)
    this.headerEl = document.createElement('div');
    this.headerEl.className = 'dock-panel-header';
    this.headerEl.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;min-height:32px;padding:0 12px;flex-shrink:0;';
    this.element.appendChild(this.headerEl);

    // Create content area
    this.contentAreaEl = document.createElement('div');
    this.contentAreaEl.setAttribute('role', 'tabpanel');
    this.contentAreaEl.id = `panel-${node.activePanel}`;
    this.contentAreaEl.setAttribute('aria-labelledby', `tab-${node.activePanel}`);
    this.contentAreaEl.style.cssText = 'flex:1;position:relative;overflow:hidden;border-top:1px solid hsl(var(--dock-border) / 0.7);box-sizing:border-box;';
    this.element.appendChild(this.contentAreaEl);

    // For bottom tabs: create a separate bottom tab strip element
    if (isBottomTabs) {
      this.bottomTabStripEl = document.createElement('div');
      this.bottomTabStripEl.className = 'dock-panel-header dock-bottom-tab-strip';
      this.bottomTabStripEl.style.cssText =
        'display:flex;align-items:center;min-height:28px;padding:0 8px;flex-shrink:0;border-top:1px solid hsl(var(--dock-border) / 0.7);border-bottom:none;';
      this.element.appendChild(this.bottomTabStripEl);
    }

    // Create action buttons container
    this.actionButtonsEl = document.createElement('div');
    this.actionButtonsEl.style.cssText = 'display:flex;align-items:center;gap:0;flex-shrink:0;margin-left:8px;';

    // Build header contents
    this.buildHeader();

    // Add collapse pill for single-tab panes
    this.updateHeaderCollapse();

    // Restore collapsed state from serialized layout
    if (node.headerCollapsed && this.node.panels.length === 1) {
      this.headerCollapsed = true;
      this.applyHeaderCollapsed();
    }

    // Build content for active panel
    this.buildContent();

    // Tab overflow observer
    this.tabOverflowObserver = new TabOverflowObserver((state) => {
      this.overflowState = state;
      this.updateOverflowButton();
    });
    if (this.tabContainerEl) {
      this.tabOverflowObserver.observe(this.tabContainerEl);
    }
  }

  // ── Public API ──────────────────────────────────────────────────

  update(
    node: TabGroupNode,
    panels: Record<string, PanelConfig>,
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

    // Update data attributes
    this.element.setAttribute('data-panel-id', node.activePanel);
    this.element.setAttribute('aria-label', panels[node.activePanel]?.title || 'Panel');
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

    // Detect panel config changes (title, icon, badge changed via PanelApi)
    const prevPanels = this.previousPanels;
    this.previousPanels = panels;
    const configChanged = !panelsChanged && node.panels.some(id => {
      const prev = prevPanels?.[id];
      const curr = panels[id];
      if (!prev || !curr) return false;
      return prev.title !== curr.title || prev.icon !== curr.icon || prev.badge !== curr.badge;
    });

    // Sync header collapsed state from serialized layout.
    // Force-clear when multi-tab — collapsed state is only valid for single-tab groups.
    const isSingleTab = node.panels.length === 1;
    const nodeCollapsed = !!node.headerCollapsed && isSingleTab;
    const wasCollapsed = this.headerCollapsed;
    if (nodeCollapsed !== wasCollapsed) {
      this.headerCollapsed = nodeCollapsed;
      this.applyHeaderCollapsed();
    }
    // If we forced an uncollapse because the group is no longer single-tab,
    // notify the reducer so any persisted collapsed state gets cleared.
    if (!isSingleTab && (wasCollapsed || node.headerCollapsed)) {
      this.callbacks.onSetHeaderCollapsed(node.id, false);
    }

    if (panelsChanged) {
      const needsBottomTabs = node.headerPosition === 'bottom' && node.panels.length > 1;

      // Create bottom tab strip if transitioning to multi-panel bottom-tabs
      if (needsBottomTabs && !this.bottomTabStripEl) {
        this.bottomTabStripEl = document.createElement('div');
        this.bottomTabStripEl.className = 'dock-panel-header dock-bottom-tab-strip';
        this.bottomTabStripEl.style.cssText =
          'display:flex;align-items:center;min-height:28px;padding:0 8px;flex-shrink:0;border-top:1px solid hsl(var(--dock-border) / 0.7);border-bottom:none;';
        this.element.appendChild(this.bottomTabStripEl);
      }
      // Remove bottom tab strip if transitioning to single-panel
      if (!needsBottomTabs && this.bottomTabStripEl) {
        this.bottomTabStripEl.parentNode?.removeChild(this.bottomTabStripEl);
        this.bottomTabStripEl = null;
      }

      this.clearHeader();
      this.buildHeader();
      this.updateHeaderCollapse();
      // Reattach overflow observer after layout
      if (this.tabContainerEl) {
        this.tabOverflowObserver.observe(this.tabContainerEl);
      }
    } else if (activePanelChanged || activePaneChanged || maximizedStateChanged) {
      // Just update tab styling
      this.updateTabStyles();
      this.updateActionButtons();
      this.updateTitleElement();
    }

    // Update tab labels/icons if panel config changed (without full rebuild)
    if (configChanged) {
      if (this.callbacks.createTab) {
        // Custom tabs: re-invoke createTab only for tabs whose config changed
        this.updateCustomTabs(prevPanels);
      } else {
        this.updateTabLabels();
      }
      this.updateTitleElement();
    }

    if (activePanelChanged || panelsChanged) {
      this.buildContent();
    }
  }

  /** Returns true if this tab group contains the given panel. */
  containsPanel(panelId: string): boolean {
    return this.node.panels.includes(panelId);
  }

  /**
   * Invalidate a content slot without disposing it, so the next buildContent()
   * call will re-request the content via createContent / getOrCreateContent.
   * Used after maximize-restore to reparent cached content back into the tab group.
   */
  invalidateContentSlot(panelId: string): void {
    const slot = this.contentSlots.get(panelId);
    if (slot) {
      slot.container.remove();
      this.contentSlots.delete(panelId);
    }
    // Reset previousActiveId so buildContent doesn't skip the active panel
    this.previousActiveId = null;
    this.buildContent();
  }

  dispose(): void {
    this.hideTabContextMenu();
    this.tabOverflowObserver.dispose();

    // Dispose content slots
    for (const [, slot] of this.contentSlots) {
      slot.disposable.dispose();
    }
    this.contentSlots.clear();

    // Dispose tab disposables
    for (const [, d] of this.tabDisposables) {
      d.dispose();
    }
    this.tabDisposables.clear();

    // Dispose header action slots
    this.prefixSlotDisposable?.dispose();
    this.leftSlotDisposable?.dispose();
    this.rightSlotDisposable?.dispose();

    // Dispose watermark
    this.watermarkSlot.dispose();
    this.watermarkEl = null;

    // Close overflow menu if open
    this.hideOverflowMenu();

    // Cleanup header collapse pill and hover zone
    this.headerCollapsePill?.remove();
    this.headerCollapsePill = null;
    this.headerHoverZone?.remove();
    this.headerHoverZone = null;

    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }

  // ── Private: Root class ─────────────────────────────────────────

  private getRootClassName(): string {
    const isActive = this.node.panels.includes(this.activePaneId);
    return `dock-tab-group${isActive ? ' dock-pane-active' : ''}`;
  }

  private applyHasTabsAttr(): void {
    if (this.node.panels.length > 1) {
      this.element.setAttribute('data-has-tabs', '');
    } else {
      this.element.removeAttribute('data-has-tabs');
    }
  }

  // ── Private: Header collapse (single-tab panes) ─────────────────

  private updateHeaderCollapse(): void {
    const isSingleTab = this.node.panels.length === 1;

    if (isSingleTab && !this.headerCollapsePill) {
      // Create the up-arrow button (hides the header)
      this.headerCollapsePill = document.createElement('button');
      this.headerCollapsePill.className = 'dock-header-collapse-pill';
      this.headerCollapsePill.setAttribute('aria-label', 'Hide header');
      this.headerCollapsePill.title = 'Hide header';
      this.headerCollapsePill.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>';
      this.headerCollapsePill.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleHeaderCollapsed();
      });
      this.headerEl.appendChild(this.headerCollapsePill);

      // Create the hover zone (overlays top of content area when header is collapsed).
      // It hosts a down-arrow affordance that reveals the header on click.
      this.headerHoverZone = document.createElement('div');
      this.headerHoverZone.className = 'dock-header-hover-zone';
      this.headerHoverZone.setAttribute('role', 'button');
      this.headerHoverZone.setAttribute('aria-label', 'Show header');
      this.headerHoverZone.title = 'Show header';
      this.headerHoverZone.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
      this.headerHoverZone.addEventListener('click', () => {
        this.toggleHeaderCollapsed();
      });
      this.element.appendChild(this.headerHoverZone);
    } else if (!isSingleTab) {
      // Remove pill and hover zone when multiple tabs
      this.headerCollapsePill?.remove();
      this.headerCollapsePill = null;
      this.headerHoverZone?.remove();
      this.headerHoverZone = null;
      if (this.headerCollapsed) {
        this.headerCollapsed = false;
        this.applyHeaderCollapsed();
        // Notify reducer to clear persisted collapsed state
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
    // Note: data-dock-target is always kept so drag/drop, indicator detection,
    // and tab lookup queries continue to work when the header is collapsed.
    if (this.headerCollapsed) {
      this.headerEl.style.display = 'none';
      this.element.setAttribute('data-header-collapsed', '');
    } else {
      this.headerEl.style.display = '';
      this.element.removeAttribute('data-header-collapsed');
    }
  }

  // ── Private: Header building ────────────────────────────────────

  private clearHeader(): void {
    // Close any open overflow menu before tearing down the tab strip that owns it
    this.hideOverflowMenu();
    this.overflowBtn = null;

    // Dispose tab disposables
    for (const [, d] of this.tabDisposables) {
      d.dispose();
    }
    this.tabDisposables.clear();

    // Dispose header action slots
    this.prefixSlotDisposable?.dispose();
    this.prefixSlotDisposable = null;
    this.leftSlotDisposable?.dispose();
    this.leftSlotDisposable = null;
    this.rightSlotDisposable?.dispose();
    this.rightSlotDisposable = null;

    this.headerEl.innerHTML = '';
    if (this.bottomTabStripEl) {
      this.bottomTabStripEl.innerHTML = '';
    }
    this.tabContainerEl = null;
    this.titleEl = null;
    this.prefixSlotEl = null;
    this.leftSlotEl = null;
    this.rightSlotEl = null;
  }

  private buildHeader(): void {
    const hasTabs = this.node.panels.length > 1;
    const isBottomTabs = this.node.headerPosition === 'bottom' && hasTabs;

    // Prefix header actions slot
    if (this.callbacks.createHeaderActions) {
      this.prefixSlotEl = document.createElement('div');
      this.prefixSlotEl.style.cssText = 'display:flex;align-items:center;margin-right:4px;flex-shrink:0;';
      this.headerEl.appendChild(this.prefixSlotEl);
      this.prefixSlotDisposable = this.callbacks.createHeaderActions('prefix', this.node.id, this.prefixSlotEl);
    }

    // Left header actions slot
    if (this.callbacks.createHeaderActions) {
      this.leftSlotEl = document.createElement('div');
      this.leftSlotEl.style.cssText = 'display:flex;align-items:center;margin-right:4px;flex-shrink:0;';
      this.headerEl.appendChild(this.leftSlotEl);
      this.leftSlotDisposable = this.callbacks.createHeaderActions('left', this.node.id, this.leftSlotEl);
    }

    if (isBottomTabs) {
      // Bottom-tabs layout: title + actions in top header, tabs in bottom strip
      this.buildSingleTitle(); // Title bar at top shows active panel title
      // Build tab strip inside the bottom element
      if (this.bottomTabStripEl) {
        this.buildTabStrip(this.bottomTabStripEl);
      }
    } else {
      // Default: tabs in the header (even for single panel, so the tab gets the top border highlight)
      this.buildTabStrip(this.headerEl);
    }

    // Right header actions slot
    if (this.callbacks.createHeaderActions) {
      this.rightSlotEl = document.createElement('div');
      this.rightSlotEl.style.cssText = 'display:flex;align-items:center;margin-left:4px;flex-shrink:0;';
      this.headerEl.appendChild(this.rightSlotEl);
      this.rightSlotDisposable = this.callbacks.createHeaderActions('right', this.node.id, this.rightSlotEl);
    }

    // Action buttons go in the top header always
    this.buildActionButtons();
    this.headerEl.appendChild(this.actionButtonsEl);
  }

  private buildTabStrip(parentEl?: HTMLElement): void {
    const outerWrap = document.createElement('div');
    outerWrap.style.cssText = 'display:flex;align-items:flex-end;align-self:stretch;gap:0;flex:1;overflow-x:hidden;overflow-y:visible;position:relative;';

    this.tabContainerEl = document.createElement('div');
    this.tabContainerEl.setAttribute('role', 'tablist');
    this.tabContainerEl.setAttribute('aria-label', 'Panel tabs');
    this.tabContainerEl.style.cssText = 'display:flex;align-items:flex-end;align-self:stretch;gap:0;overflow-x:hidden;overflow-y:visible;flex:1;';

    for (const panelId of this.node.panels) {
      const panel = this.panels[panelId];
      if (!panel) continue;

      const isSelected = panelId === this.node.activePanel;

      const tabEl = document.createElement('div');
      tabEl.setAttribute('data-tab-id', panelId);
      tabEl.id = `tab-${panelId}`;
      tabEl.setAttribute('role', 'tab');
      tabEl.setAttribute('aria-selected', String(isSelected));
      tabEl.setAttribute('aria-controls', `panel-${panelId}`);
      tabEl.tabIndex = isSelected ? 0 : -1;
      const isDisabled = panel.disabled === true;
      let tabClass = isSelected ? 'dock-tab dock-tab-selected' : 'dock-tab';
      if (isDisabled) tabClass += ' dock-tab-disabled';
      tabEl.className = tabClass;
      if (isDisabled) {
        tabEl.setAttribute('data-disabled', 'true');
      }
      if (this.callbacks.createTab) {
        const d = this.callbacks.createTab(panelId, tabEl, isSelected);
        this.tabDisposables.set(panelId, d);
      } else {
        this.buildDefaultTabContent(tabEl, panel, panelId, isSelected);
      }

      // Double-click tab → maximize/restore panel
      tabEl.addEventListener('dblclick', (e) => {
        e.preventDefault();
        if (panel.disabled) return;
        if (this.callbacks.onToggleMaximize) {
          this.callbacks.onToggleMaximize(panelId);
        } else {
          // Fallback: use maximize/restore directly
          if (this.maximizedPanelId === panelId) {
            this.callbacks.onRestorePanel(panelId);
          } else {
            this.callbacks.onMaximizePanel(panelId);
          }
        }
      });

      // Right-click context menu (skip for disabled panels)
      tabEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (panel.disabled) return;
        this.showTabContextMenu(panelId, panel, e.clientX, e.clientY);
      });

      this.tabContainerEl.appendChild(tabEl);
    }

    outerWrap.appendChild(this.tabContainerEl);

    // Overflow dropdown button — shown when tabs don't fit.
    this.overflowBtn = document.createElement('button');
    this.overflowBtn.className = 'dock-tab-overflow-btn';
    this.overflowBtn.style.cssText = 'flex-shrink:0;align-self:stretch;padding:2px 6px;color:hsl(var(--dock-text-muted));cursor:pointer;background:none;border:none;display:none;align-items:center;justify-content:center;';
    this.overflowBtn.setAttribute('aria-label', this.resourceStrings.tabOverflowMenu ?? 'Show all tabs');
    this.overflowBtn.setAttribute('aria-haspopup', 'menu');
    this.overflowBtn.setAttribute('aria-expanded', 'false');
    this.overflowBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    this.overflowBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
    });
    this.overflowBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.toggleOverflowMenu();
    });
    outerWrap.appendChild(this.overflowBtn);

    const target = parentEl || this.headerEl;
    target.appendChild(outerWrap);
  }

  private buildSingleTitle(): void {
    const panelId = this.node.activePanel;
    const activePanel = this.panels[panelId];
    this.titleEl = document.createElement('span');
    this.titleEl.className = 'dock-panel-title';
    this.titleEl.setAttribute('data-tab-id', panelId);
    this.titleEl.textContent = activePanel?.title || 'Panel';

    // Right-click context menu on single title (skip for disabled panels)
    this.titleEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (activePanel && !activePanel.disabled) {
        this.showTabContextMenu(panelId, activePanel, e.clientX, e.clientY);
      }
    });

    this.headerEl.appendChild(this.titleEl);
  }

  private buildDefaultTabContent(
    tabEl: HTMLDivElement,
    panel: PanelConfig,
    panelId: string,
    isSelected: boolean,
  ): void {
    // Icon
    if (panel.icon) {
      const iconSpan = document.createElement('span');
      iconSpan.style.marginRight = '4px';
      iconSpan.textContent = panel.icon;
      tabEl.appendChild(iconSpan);
    }

    // Title label
    const labelSpan = document.createElement('span');
    labelSpan.className = 'dock-tab-label';
    labelSpan.textContent = panel.title;
    tabEl.appendChild(labelSpan);
    tabEl.title = panel.title;

    // Close button — hover visibility is handled by CSS:
    //   .dock-tab:hover .dock-tab-close, .dock-tab.dock-tab-selected .dock-tab-close { opacity: 0.5 }
    //   .dock-tab-close:hover { opacity: 1 !important }
    // No JS mouseenter/mouseleave needed — avoids memory leaks when tabs are rebuilt.
    if (panel.closable !== false && !this.node.locked) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'dock-tab-close';
      closeBtn.setAttribute('data-action', 'close');
      closeBtn.setAttribute('data-panel-id', panelId);
      closeBtn.setAttribute('aria-label', `Close ${panel.title}`);
      closeBtn.innerHTML = iconClose(12);
      tabEl.appendChild(closeBtn);
    }
  }

  // ── Context Menu ──────────────────────────────────────────────────

  private contextMenuEl: HTMLDivElement | null = null;
  private contextMenuCleanup: (() => void) | null = null;

  private showTabContextMenu(panelId: string, panel: PanelConfig, x: number, y: number): void {
    this.hideTabContextMenu();

    const menu = document.createElement('div');
    menu.className = 'dock-context-menu';
    menu.style.cssText = `
      position:fixed; left:${x}px; top:${y}px; z-index:10010;
      background:hsl(var(--dock-surface)); border:1px solid hsl(var(--dock-border));
      border-radius:4px; box-shadow:0 4px 12px rgba(0,0,0,0.15);
      padding:4px 0; min-width:140px; font-size:12px;
      color:hsl(var(--dock-text));
    `;

    const addItem = (label: string, action: () => void, disabled = false) => {
      const item = document.createElement('div');
      // Use CSS classes for hover effects — no JS listeners needed.
      item.className = disabled ? 'dock-context-menu-item disabled' : 'dock-context-menu-item';
      item.textContent = label;
      if (!disabled) {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          this.hideTabContextMenu();
          action();
        });
      }
      menu.appendChild(item);
    };

    const addSeparator = () => {
      const sep = document.createElement('div');
      sep.className = 'dock-context-menu-separator';
      menu.appendChild(sep);
    };

    const locked = !!this.node.locked;

    // Close
    addItem(this.resourceStrings.close, () => this.callbacks.onClosePanel(panelId), panel.closable === false || locked);

    // Close Others (only if multiple tabs)
    if (this.node.panels.length > 1) {
      addItem(this.resourceStrings.closeOthers, () => {
        for (const pid of this.node.panels) {
          if (pid !== panelId && this.panels[pid]?.closable !== false) {
            this.callbacks.onClosePanel(pid);
          }
        }
      });

      // Close All
      addItem(this.resourceStrings.closeAll, () => {
        for (const pid of this.node.panels) {
          if (this.panels[pid]?.closable !== false) {
            this.callbacks.onClosePanel(pid);
          }
        }
      });

      // Close to the Right
      const panelIndex = this.node.panels.indexOf(panelId);
      if (panelIndex < this.node.panels.length - 1) {
        addItem('Close to the Right', () => {
          for (let i = panelIndex + 1; i < this.node.panels.length; i++) {
            const pid = this.node.panels[i];
            if (this.panels[pid]?.closable !== false) {
              this.callbacks.onClosePanel(pid);
            }
          }
        });
      }
    }

    addSeparator();

    // Float
    addItem(this.resourceStrings.float, () => this.callbacks.onFloatPanel(panelId), panel.floatable === false || locked);

    // Unpin
    if (panel.allowPinning !== false) {
      addItem(this.resourceStrings.unpin, () => this.callbacks.onUnpinPanel(panelId), locked);
    }

    addSeparator();

    // Maximize
    addItem(this.resourceStrings.maximize, () => this.callbacks.onMaximizePanel(panelId), locked);

    // Propagate dark-mode class so CSS vars resolve correctly when the menu is
    // portaled to document.body (outside the dock root's `.dark` ancestor).
    if (this.element.closest('.dark')) menu.classList.add('dark');
    document.body.appendChild(menu);
    this.contextMenuEl = menu;

    // Close on click outside — use capture phase to fire before any other handler.
    // No setTimeout needed; capture phase ensures the current right-click event
    // won't immediately close the menu we just opened.
    const onOutsideClick = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        this.hideTabContextMenu();
      }
    };
    document.addEventListener('mousedown', onOutsideClick, true);

    this.contextMenuCleanup = () => {
      document.removeEventListener('mousedown', onOutsideClick, true);
    };
  }

  private hideTabContextMenu(): void {
    if (this.contextMenuEl) {
      if (this.contextMenuEl.parentNode) {
        this.contextMenuEl.parentNode.removeChild(this.contextMenuEl);
      }
      this.contextMenuEl = null;
    }
    if (this.contextMenuCleanup) {
      this.contextMenuCleanup();
      this.contextMenuCleanup = null;
    }
  }

  // ── Tab styling ──────────────────────────────────────────────────

  private getTabStyle(isSelected: boolean, isSelectedAndActive: boolean): string {
    const base = 'display:flex;align-items:center;gap:4px;padding:6px 12px;cursor:pointer;user-select:none;font-size:12px;transition:color 0.15s,border-color 0.15s;border-bottom:2px solid transparent;margin-bottom:-1px;';
    if (isSelectedAndActive) {
      return base + 'color:hsl(var(--dock-tab-text-active));border-bottom-color:hsl(var(--dock-primary));font-weight:500;';
    }
    if (isSelected) {
      return base + 'color:hsl(var(--dock-tab-text));font-weight:500;';
    }
    return base + 'color:hsl(var(--dock-tab-text));';
  }

  // ── Private: Action buttons ─────────────────────────────────────

  private buildActionButtons(): void {
    this.actionButtonsEl.innerHTML = '';
    const activePanel = this.panels[this.node.activePanel];
    const isMaximized = this.maximizedPanelId === this.node.activePanel;
    const allowMaximize = activePanel?.allowMaximize !== false;
    const allowPinning = activePanel?.allowPinning !== false;

    // Hide all action buttons for disabled panels
    if (activePanel?.disabled) return;

    // Unpin button
    if (allowPinning) {
      const unpinBtn = this.createActionButton('unpin', this.node.activePanel, this.resourceStrings.unpin, iconUnpin());
      this.actionButtonsEl.appendChild(unpinBtn);
    }

    // Maximize/Restore button
    if (allowMaximize) {
      if (isMaximized) {
        const restoreBtn = this.createActionButton('restore', this.node.activePanel, this.resourceStrings.restore, iconRestore());
        this.actionButtonsEl.appendChild(restoreBtn);
      } else {
        const maxBtn = this.createActionButton('maximize', this.node.activePanel, this.resourceStrings.maximize, iconMaximize());
        this.actionButtonsEl.appendChild(maxBtn);
      }
    }

    // Float button (only when not maximized)
    if (!isMaximized) {
      const floatBtn = this.createActionButton('float', this.node.activePanel, this.resourceStrings.float, iconFloat());
      this.actionButtonsEl.appendChild(floatBtn);
    }

    // Close button is on each tab header — no need for a separate one in the action buttons area
  }

  private updateActionButtons(): void {
    this.buildActionButtons();
  }

  private createActionButton(action: string, panelId: string, title: string, iconHtml: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'dock-action-btn';
    btn.setAttribute('data-action', action);
    btn.setAttribute('data-panel-id', panelId);
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.innerHTML = iconHtml;
    // Hover is handled by CSS: .dock-action-btn:hover { color: hsl(var(--dock-text)); }
    // No JS mouseenter/mouseleave needed — avoids memory leaks when buttons are rebuilt.
    return btn;
  }

  // ── Private: Content ────────────────────────────────────────────

  private previousActiveId: string | null = null;

  private buildContent(): void {
    // Only hide the previously active slot (not ALL slots)
    if (this.previousActiveId && this.previousActiveId !== this.node.activePanel) {
      const prev = this.contentSlots.get(this.previousActiveId);
      if (prev) prev.container.style.display = 'none';
    }

    const activeId = this.node.activePanel;
    this.previousActiveId = activeId;
    if (!activeId || !this.panels[activeId]) {
      // Empty group: render host-provided watermark if any, else fallback
      // placeholder. The watermark slot is cleared on the next content build.
      if (this.callbacks.createWatermark) {
        if (!this.watermarkEl) {
          const wm = document.createElement('div');
          wm.className = 'dock-watermark';
          this.contentAreaEl.appendChild(wm);
          this.watermarkEl = wm;
          this.watermarkSlot.value = this.callbacks.createWatermark(wm);
        }
      } else if (!this.contentAreaEl.querySelector('.dock-empty-placeholder')) {
        const placeholder = document.createElement('div');
        placeholder.className = 'dock-empty-placeholder';
        placeholder.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;color:hsl(var(--dock-text-muted));font-size:14px;';
        placeholder.textContent = 'Empty';
        this.contentAreaEl.appendChild(placeholder);
      }
      return;
    }

    // Tear down watermark / fallback placeholder if present
    if (this.watermarkEl) {
      this.watermarkSlot.clear();
      this.watermarkEl.remove();
      this.watermarkEl = null;
    }
    const placeholder = this.contentAreaEl.querySelector('.dock-empty-placeholder');
    if (placeholder) placeholder.remove();

    // Show or create the content slot for the active panel
    const existing = this.contentSlots.get(activeId);
    if (existing) {
      existing.container.style.display = '';
      return;
    }

    // Create new content slot
    const container = document.createElement('div');
    container.style.cssText = 'width:100%;height:100%;overflow:hidden;';
    this.contentAreaEl.appendChild(container);

    const disposable = this.callbacks.createContent(activeId, container);
    this.contentSlots.set(activeId, { container, disposable });

    // Remove content slots for panels no longer in this group
    for (const [id, slot] of this.contentSlots) {
      if (!this.node.panels.includes(id)) {
        slot.disposable.dispose();
        slot.container.remove();
        this.contentSlots.delete(id);
      }
    }
  }

  // ── Private: Tab style updates ─────────────────────────────────

  private updateTabStyles(): void {
    if (!this.tabContainerEl) return;
    const isActivePane = this.node.panels.includes(this.activePaneId);

    const tabs = this.tabContainerEl.querySelectorAll<HTMLElement>('[data-tab-id]');
    tabs.forEach((tabEl) => {
      const panelId = tabEl.getAttribute('data-tab-id');
      const isSelected = panelId === this.node.activePanel;
      const isSelectedAndActive = isSelected && isActivePane;
      tabEl.className = isSelected ? 'dock-tab dock-tab-selected' : 'dock-tab';
      tabEl.setAttribute('aria-selected', String(isSelected));
      tabEl.tabIndex = isSelected ? 0 : -1;
      // Clear any inline styles — let CSS handle color/opacity/border via classes
      tabEl.style.color = '';
      tabEl.style.borderTopColor = '';
      tabEl.style.borderBottomColor = '';
    });
  }

  private updateTitleElement(): void {
    if (!this.titleEl) return;
    const activePanel = this.panels[this.node.activePanel];
    this.titleEl.textContent = activePanel?.title || 'Panel';
    this.titleEl.setAttribute('data-tab-id', this.node.activePanel);
  }

  /** Re-invoke createTab for tabs whose panel config changed (title/icon/badge) */
  private updateCustomTabs(prevPanels: Record<string, PanelConfig> | null): void {
    if (!this.tabContainerEl || !this.callbacks.createTab) return;
    for (const panelId of this.node.panels) {
      const prev = prevPanels?.[panelId];
      const curr = this.panels[panelId];
      if (!prev || !curr) continue;
      if (prev.title === curr.title && prev.icon === curr.icon && prev.badge === curr.badge) continue;
      // This tab's config changed — dispose old content and re-render
      const tabEl = this.tabContainerEl.querySelector<HTMLElement>(`[data-tab-id="${panelId}"]`);
      if (!tabEl) continue;
      const oldDisposable = this.tabDisposables.get(panelId);
      if (oldDisposable) {
        oldDisposable.dispose();
        this.tabDisposables.delete(panelId);
      }
      const isSelected = panelId === this.node.activePanel;
      const d = this.callbacks.createTab(panelId, tabEl, isSelected);
      this.tabDisposables.set(panelId, d);
    }
  }

  /** Update tab label text/icons without full header rebuild (for PanelApi.setTitle/setIcon/setBadge) */
  private updateTabLabels(): void {
    if (!this.tabContainerEl) return;
    const tabs = this.tabContainerEl.querySelectorAll<HTMLElement>('[data-tab-id]');
    tabs.forEach(tabEl => {
      const panelId = tabEl.getAttribute('data-tab-id');
      if (!panelId) return;
      const panel = this.panels[panelId];
      if (!panel) return;

      // Update label text
      const labelEl = tabEl.querySelector('.dock-tab-label');
      if (labelEl) labelEl.textContent = panel.title;

      // Update icon
      const iconEl = tabEl.querySelector('.dock-tab-icon');
      if (panel.icon) {
        if (iconEl) {
          iconEl.textContent = panel.icon;
        } else {
          const newIcon = document.createElement('span');
          newIcon.className = 'dock-tab-icon';
          newIcon.textContent = panel.icon;
          tabEl.insertBefore(newIcon, tabEl.firstChild);
        }
      } else if (iconEl) {
        iconEl.remove();
      }

      // Update badge
      const badgeEl = tabEl.querySelector('.dock-tab-badge');
      if (panel.badge) {
        if (badgeEl) {
          badgeEl.textContent = panel.badge;
        } else {
          const newBadge = document.createElement('span');
          newBadge.className = 'dock-tab-badge';
          newBadge.textContent = panel.badge;
          tabEl.appendChild(newBadge);
        }
      } else if (badgeEl) {
        badgeEl.remove();
      }
    });
  }

  // ── Private: Scroll arrows ─────────────────────────────────────

  private updateOverflowButton(): void {
    // Called by the TabOverflowObserver when overflow state changes.
    if (this.overflowBtn) {
      this.overflowBtn.style.display = this.overflowState.hasOverflow ? 'flex' : 'none';
    }
    if (!this.overflowState.hasOverflow) {
      this.hideOverflowMenu();
    }
  }

  private toggleOverflowMenu(): void {
    if (this.overflowMenuEl) {
      this.hideOverflowMenu();
    } else {
      this.showOverflowMenu();
    }
  }

  private showOverflowMenu(): void {
    if (!this.overflowBtn || !this.tabContainerEl) return;
    this.hideOverflowMenu();

    const menu = document.createElement('div');
    menu.className = 'dock-context-menu dock-tab-overflow-menu';
    menu.style.cssText = 'position:fixed;z-index:10010;max-height:60vh;overflow-y:auto;';
    menu.setAttribute('role', 'menu');

    for (const panelId of this.node.panels) {
      const panel = this.panels[panelId];
      if (!panel) continue;

      const item = document.createElement('div');
      item.className = 'dock-context-menu-item dock-tab-overflow-menu-item';
      item.style.cssText = 'display:flex;align-items:center;min-width:160px;max-width:320px;';
      item.setAttribute('role', 'menuitem');
      item.setAttribute('data-panel-id', panelId);
      if (panelId === this.node.activePanel) {
        item.setAttribute('aria-current', 'true');
      }

      // Label (tab caption only)
      const label = document.createElement('span');
      label.textContent = panel.title;
      label.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      item.appendChild(label);

      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hideOverflowMenu();
        this.callbacks.onSetActivePanel(this.node.id, panelId);
        this.callbacks.onSetActivePane(panelId);
        this.scrollTabIntoView(panelId);
      });
      menu.appendChild(item);
    }

    // Propagate dark theme class from the dock root so CSS vars resolve
    // correctly when the menu is portaled into document.body.
    if (this.element.closest('.dark')) {
      menu.classList.add('dark');
    }
    document.body.appendChild(menu);

    // Position below the button, clamped to the viewport.
    const btnRect = this.overflowBtn.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    let left = btnRect.right - menuRect.width;
    if (left < 4) left = 4;
    if (left + menuRect.width > window.innerWidth - 4) {
      left = window.innerWidth - menuRect.width - 4;
    }
    let top = btnRect.bottom + 2;
    if (top + menuRect.height > window.innerHeight - 4) {
      top = btnRect.top - menuRect.height - 2;
    }
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    this.overflowMenuEl = menu;
    this.overflowBtn.setAttribute('aria-expanded', 'true');

    // Close on outside click / Escape
    this.overflowMenuOutsideHandler = (ev: MouseEvent) => {
      const target = ev.target as Node;
      if (this.overflowMenuEl && !this.overflowMenuEl.contains(target) && target !== this.overflowBtn) {
        this.hideOverflowMenu();
      }
    };
    this.overflowMenuKeyHandler = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        this.hideOverflowMenu();
      }
    };
    // Use mousedown so outside close beats item click handlers consistently.
    document.addEventListener('mousedown', this.overflowMenuOutsideHandler, true);
    document.addEventListener('keydown', this.overflowMenuKeyHandler, true);
  }

  private hideOverflowMenu(): void {
    if (this.overflowMenuEl) {
      this.overflowMenuEl.remove();
      this.overflowMenuEl = null;
    }
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
    if (!tab) return;
    if (typeof tab.scrollIntoView === 'function') {
      tab.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
  }

}
