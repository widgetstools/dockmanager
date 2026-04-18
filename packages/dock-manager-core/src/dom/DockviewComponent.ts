import type {
  DockManagerState,
  LayoutNode,
  TabGroupNode,
  SplitNode,
  FloatingPanel,
  DockPosition,
  PreventableDockEvent,
  DockEdge,
  Placement,
} from '../types/dock';
import { createPreventableEvent } from '../types/dock';
import { dockReducer, type DockAction } from '../reducer/dockReducer';
import { findFirstTabGroup, findTabGroupForPanel, findTabGroupById, syncIdCounter } from '../layout/LayoutTree';
import { checkLayoutInvariants, findLostPanels } from '../layout/layoutInvariants';
import { PanelApi } from '../api/PanelApi';
import { DockviewApi } from '../api/DockviewApi';
import { DragManager as DockDragManager } from './DragManager';
import { FocusManager } from './FocusManager';
import { KeyboardManager } from './KeyboardManager';
import { StateHistoryManager } from './StateHistoryManager';
import { PanelFinder } from './Overlays';
import { MaximizeOverlayView } from './Overlays';
import { TabGroupView, type TabGroupViewCallbacks } from './views/TabGroupView';
import { SplitView } from './views/SplitView';
import { FloatingWindowView, type FloatingWindowViewCallbacks } from './views/FloatingWindowView';
import { UnpinnedStripView } from './views/UnpinnedStripView';
import { RenderContainerManager } from './RenderContainerManager';
import type { DockTheme } from '../theme/DockTheme';
import { applyTheme, vsCodeLight, vsCodeDark } from '../theme/DockTheme';
import { ensureStyles, releaseStyles } from './styleInjector';
import { debugLog, isDockManagerDebugEnabled } from '../utils/debug';

/** A resource that can release its DOM and event listener references. */
export interface IDisposable {
  /** Release all resources held by this object. */
  dispose(): void;
}

/**
 * Configuration options for {@link DockviewComponent}.
 */
export interface DockviewComponentOptions {
  /** The initial layout and panel state to render. */
  initialState: DockManagerState;
  /** Factory to render a panel's content into a container. Returns a disposable for cleanup. */
  createContent: (panelId: string, container: HTMLElement, api: PanelApi) => IDisposable;
  /** Optional factory to render a custom tab for a panel. */
  createTab?: (panelId: string, container: HTMLElement, isActive: boolean) => IDisposable;
  /** Optional factory to render custom header action buttons in a tab group. */
  createHeaderActions?: (slot: 'left' | 'right' | 'prefix', tabGroupId: string, container: HTMLElement) => IDisposable;
  /** Optional factory to render a watermark into an empty tab group. */
  createWatermark?: (container: HTMLElement) => IDisposable;
  /** Called after every state change with the new state. */
  onStateChange?: (state: DockManagerState) => void;
  /** Called before a panel is closed. Call `event.preventDefault()` to cancel. */
  onWillClose?: (event: PreventableDockEvent, panelId: string) => void;
  /** Called before a drag-and-drop completes. Call `event.preventDefault()` to cancel. */
  onWillDrop?: (event: PreventableDockEvent, sourceId: string, targetId: string, position: DockPosition) => void;
  /** Called when the user explicitly requests a layout save via context menu. */
  onSaveLayout?: (state: DockManagerState) => void;
  /** Color theme: `'light'` | `'dark'` or a custom `DockTheme` object. Defaults to `'light'`. */
  theme?: 'light' | 'dark' | DockTheme;
  /** Whether to show edge dock indicators. Defaults to true. */
  allowRootDock?: boolean;
  /** Whether to allow dropping on splitters. Defaults to true. */
  allowSplitterDock?: boolean;
  /** Custom strings for UI elements (tooltips, context menu, etc.) */
  resourceStrings?: Partial<import('../types/resourceStrings').DockResourceStrings>;
}

/**
 * Framework-agnostic dock layout manager.
 *
 * Owns the entire DOM tree for the dock layout: tab groups, split panes,
 * floating windows, unpinned strips, drag-and-drop, and keyboard navigation.
 * Framework wrappers (React, Vue, Angular) instantiate this class and supply
 * framework-specific content renderers.
 */
export class DockviewComponent {
  private container: HTMLElement;
  private options: DockviewComponentOptions;
  private state: DockManagerState;

  // Sub-managers
  private dragManager: DockDragManager;
  private focusManager: FocusManager;
  private keyboardManager: KeyboardManager;
  private historyManager: StateHistoryManager;

  // View maps for incremental rendering
  private tabGroupViews = new Map<string, TabGroupView>();
  private splitViews = new Map<string, SplitView>();
  private floatingViews = new Map<string, FloatingWindowView>();
  private unpinnedStripViews = new Map<DockEdge, UnpinnedStripView>();
  private panelApis = new Map<string, PanelApi>();
  /** Stable render container manager — one persistent content container per panel, no reparenting. */
  private renderManager!: RenderContainerManager;
  private _api: DockviewApi | null = null;
  private maximizeOverlay: MaximizeOverlayView | null = null;
  private maximizeOverlayPanelId: string | undefined;
  private panelFinder: PanelFinder | null = null;
  private debugOverlayEl: HTMLDivElement | null = null;

  // DOM layout containers
  private rootEl: HTMLDivElement;
  private layoutRowEl: HTMLDivElement;
  private topStripContainer: HTMLDivElement;
  private leftStripContainer: HTMLDivElement;
  private centerEl: HTMLDivElement;
  private rightStripContainer: HTMLDivElement;
  private bottomStripContainer: HTMLDivElement;
  private layoutContentEl: HTMLDivElement;

  /** Create a new dock layout manager inside the given host element. */
  constructor(element: HTMLElement, options: DockviewComponentOptions) {
    ensureStyles();
    this.container = element;
    this.options = options;
    this.state = options.initialState;
    syncIdCounter(this.state.layout);
    this.historyManager = new StateHistoryManager();

    // Build root DOM structure matching DockManager.tsx
    this.rootEl = document.createElement('div');
    this.rootEl.className = 'dock-manager-root';
    this.rootEl.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;display:flex;flex-direction:column;background:hsl(var(--dock-bg));';
    this.rootEl.tabIndex = -1;

    // Apply theme
    this.applyThemeOption(options.theme);

    const mkDiv = (css: string) => { const d = document.createElement('div'); d.style.cssText = css; return d; };
    const stripCss = 'position:relative;display:none;';

    // Main row: [left-strip] [center-layout] [right-strip]
    this.layoutRowEl = mkDiv('flex:1;display:flex;flex-direction:row;overflow:hidden;position:relative;');
    this.leftStripContainer = mkDiv(stripCss);
    this.centerEl = mkDiv('flex:1;overflow:hidden;position:relative;');
    this.rightStripContainer = mkDiv(stripCss);
    this.layoutRowEl.append(this.leftStripContainer, this.centerEl, this.rightStripContainer);

    this.topStripContainer = mkDiv(stripCss);
    this.bottomStripContainer = mkDiv(stripCss);
    this.rootEl.append(this.topStripContainer, this.layoutRowEl, this.bottomStripContainer);

    // Layout content area (inside center)
    this.layoutContentEl = mkDiv('width:100%;height:100%;');
    this.centerEl.appendChild(this.layoutContentEl);

    this.container.appendChild(this.rootEl);

    // Render container manager — created after rootEl is attached, before views.
    this.renderManager = new RenderContainerManager(this.rootEl, (panelId, container) => {
      const api = this.getPanelApi(panelId);
      // Observe container resizes and forward to the PanelApi as dimension events.
      let ro: ResizeObserver | null = null;
      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(entries => {
          const rect = entries[0]?.contentRect;
          if (rect) api._setDimensions({ width: rect.width, height: rect.height });
        });
        ro.observe(container);
      }
      const inner = this.options.createContent(panelId, container, api);
      return {
        dispose: () => {
          if (ro) ro.disconnect();
          inner.dispose();
        },
      };
    });

    // Event delegation for action buttons (mousedown fires before re-render on mouseup)
    this.rootEl.addEventListener('mousedown', this.onActionClick);

    this.dragManager = new DockDragManager({
      containerElement: this.rootEl,
      onDrop: (sourceId, targetId, position) => {
        const isFloating = this.state.placements.get(sourceId)?.type === 'floating';
        debugLog('DOCK_DROP', { sourceId, targetId, position, isFloating });
        if (targetId === '__root__') {
          if (isFloating) this.dispatch({ type: 'DOCK_FLOATING', panelId: sourceId, targetGroupId: findFirstTabGroup(this.state.layout) || '', position: 'center' });
          this.dispatch({ type: 'DOCK_TO_EDGE', panelId: sourceId, edge: position as DockEdge });
        } else if (isFloating) {
          this.dispatch({ type: 'DOCK_FLOATING', panelId: sourceId, targetGroupId: targetId, position });
        } else {
          this.dispatch({ type: 'MOVE_PANEL', panelId: sourceId, targetGroupId: targetId, position });
        }
      },
      onFloat: (sourceId, x, y) => {
        debugLog('DOCK_DROP_FLOAT', { sourceId, x, y });
        this.dispatch({ type: 'FLOAT_PANEL', panelId: sourceId, x, y, width: 400, height: 300 });
      },
      onSelect: (sourceId) => {
        const tabGroupId = findTabGroupForPanel(this.state.layout, sourceId);
        if (tabGroupId) this.dispatch({ type: 'SET_ACTIVE_PANEL', groupId: tabGroupId, panelId: sourceId });
        this.dispatch({ type: 'SET_ACTIVE_PANE', panelId: sourceId });
      },
      onReorderTab: (tabGroupId, panelId, newIndex) => {
        const group = findTabGroupById(this.state.layout, tabGroupId);
        if (group) {
          const panels = group.panels.filter(p => p !== panelId);
          panels.splice(newIndex, 0, panelId);
          this.dispatch({ type: 'REORDER_TABS', groupId: tabGroupId, panels });
        }
      },
      onWillDrop: this.options.onWillDrop
        ? (event, sourceId, targetId, position) => { this.options.onWillDrop?.(event, sourceId, targetId, position); }
        : undefined,
      theme: this.resolveThemeMode(options.theme),
    });

    this.focusManager = new FocusManager({
      containerElement: this.rootEl,
      onFocusChanged: (panelId) => { if (panelId) this.dispatch({ type: 'SET_ACTIVE_PANE', panelId }); },
      onNavigate: (direction) => { this.dispatch({ type: 'NAVIGATE', direction }); },
      onCloseActivePanel: () => {
        const id = this.state.activePaneId;
        if (id && this.state.panels.get(id)?.closable !== false) this.closePanel(id);
      },
      onNavigateTabGroup: (direction) => { this.dispatch({ type: 'NAVIGATE', direction }); },
    });
    this.keyboardManager = new KeyboardManager({
      containerElement: this.rootEl,
      dispatch: (action) => this.dispatch(action),
      getState: () => this.state,
      onUndo: () => this.undo(),
      onRedo: () => this.redo(),
      onPanelFinder: () => this.panelFinder?.toggle(),
    });
    this.panelFinder = new PanelFinder({
      containerElement: this.rootEl,
      getState: () => this.state,
      onActivatePanel: (panelId) => {
        const tabGroupId = findTabGroupForPanel(this.state.layout, panelId);
        if (tabGroupId) this.dispatch({ type: 'SET_ACTIVE_PANEL', groupId: tabGroupId, panelId });
        this.dispatch({ type: 'SET_ACTIVE_PANE', panelId });
      },
    });

    // Initial render
    this.render();
  }

  /** Dispatch a {@link DockAction} to update state and re-render. */
  /** Actions that are purely visual / navigational — don't push undo state for these */
  private static readonly NON_UNDOABLE_ACTIONS = new Set([
    'SET_ACTIVE_PANEL', 'SET_ACTIVE_PANE', 'NAVIGATE', 'BRING_TO_FRONT',
    'UPDATE_FLOATING', 'ACTIVATE_OVERFLOW_TAB', 'RESIZE_SPLIT',
  ]);

  dispatch(action: DockAction): void {
    const prevState = this.state;

    if (isDockManagerDebugEnabled()) {
      debugLog('DOCK_ACTION', action.type, action);
    }

    // Push state to history before mutation (for undo support)
    if (!DockviewComponent.NON_UNDOABLE_ACTIONS.has(action.type)) {
      this.historyManager.push(prevState);
    }

    try { this.state = dockReducer(this.state, action); }
    catch (err) { console.error('[DockviewComponent] Reducer error for', action.type, err); return; }

    if (this.state !== prevState) {
      // Detect reducer bugs that silently drop panels
      const lost = findLostPanels(prevState, this.state);
      if (lost.length > 0) {
        console.error('[DockManager] PANEL LOST after', action.type, 'panels=', lost,
          { action, prevLayout: prevState.layout, nextLayout: this.state.layout });
      }

      // Invariant checks (debug-gated)
      if (isDockManagerDebugEnabled()) {
        const violations = checkLayoutInvariants(this.state);
        if (violations.length > 0) {
          const summary = violations.map(v => `[${v.kind}] ${v.detail}`).join('\n  ');
          console.warn(`[DockManager] ${violations.length} invariant violation(s) after ${action.type}:\n  ${summary}`);
          const byType = (s: DockManagerState, t: string) => [...s.placements.entries()].filter(([, p]) => p.type === t).map(([id]) => id);
          console.warn('[DockManager] violation context', {
            action, violations,
            prevLayout: prevState.layout, nextLayout: this.state.layout,
            floating: [byType(prevState, 'floating'), byType(this.state, 'floating')],
            unpinned: [byType(prevState, 'unpinned'), byType(this.state, 'unpinned')],
            popout: [byType(prevState, 'popout'), byType(this.state, 'popout')],
          });
        }
      }

      try { this.render(); } catch (e) { console.error('[DockviewComponent] Render error after', action.type, e); }
      try { this.options.onStateChange?.(this.state); } catch (e) { console.error('[DockviewComponent] onStateChange error:', e); }
    }
  }

  /** Undo the last state change. */
  undo(): void {
    const prevState = this.historyManager.undo(this.state);
    if (prevState) {
      this.state = prevState;
      this.render();
      this.options.onStateChange?.(this.state);
    }
  }

  /** Redo a previously undone state change. */
  redo(): void {
    const nextState = this.historyManager.redo(this.state);
    if (nextState) {
      this.state = nextState;
      this.render();
      this.options.onStateChange?.(this.state);
    }
  }

  /**
   * Get the current dock manager state.
   *
   * @returns The current {@link DockManagerState}.
   */
  getState(): DockManagerState {
    return this.state;
  }

  /** Get a high-level API for programmatic control (lazy-initialized). */
  get api(): DockviewApi {
    if (!this._api) {
      this._api = new DockviewApi(
        () => this.state,
        (action: DockAction) => this.dispatch(action),
        () => this.undo(),
        () => this.redo(),
      );
      this._api._setDebugOverlayHandler((enabled) => this.setDebugOverlay(enabled));
    }
    return this._api;
  }

  /** Resolve a theme option to a 'light' | 'dark' mode string */
  private resolveThemeMode(theme?: 'light' | 'dark' | DockTheme): 'light' | 'dark' {
    if (!theme) return 'light';
    if (typeof theme === 'string') return theme;
    return theme.mode;
  }

  /** Apply theme option — handles string ('light'/'dark') or DockTheme object */
  private applyThemeOption(theme?: 'light' | 'dark' | DockTheme): void {
    const mode = this.resolveThemeMode(theme);
    this.rootEl.classList.toggle('dark', mode === 'dark');
    applyTheme(this.rootEl, typeof theme === 'object' && theme !== null ? theme : mode === 'dark' ? vsCodeDark : vsCodeLight);
    if (this.dragManager) this.dragManager.setTheme(mode);
  }

  /** Update component options at runtime (e.g., switch theme or change callbacks). */
  updateOptions(options: Partial<DockviewComponentOptions>): void {
    Object.assign(this.options, options);

    if (options.theme !== undefined) {
      this.applyThemeOption(options.theme);
    }

    if (options.onWillDrop !== undefined) {
      this.dragManager.setOnWillDrop(options.onWillDrop
        ? (event, sourceId, targetId, position) => { options.onWillDrop?.(event, sourceId, targetId, position); }
        : undefined);
    }
  }

  /** Get or create a cached {@link PanelApi} wired to dispatch back into this component. */
  getPanelApi(panelId: string): PanelApi {
    let api = this.panelApis.get(panelId);
    if (!api) {
      api = new PanelApi(panelId);
      api._setConfigAccessor(() => this.state.panels.get(panelId));
      api._setUpdateHandler((id, updates) => { this.dispatch({ type: 'UPDATE_PANEL_CONFIG', panelId: id, config: updates }); });
      api._setAttentionHandler((id, attention) => {
        this.rootEl.querySelector(`[data-tab-id="${id}"]`)?.classList.toggle('dock-tab-attention', attention);
      });
      this.panelApis.set(panelId, api);
    }
    return api;
  }

  /** Compute the minimum size (px) a layout node can occupy along an axis. */
  private computeNodeMinSize(node: LayoutNode, axis: 'horizontal' | 'vertical'): number {
    if (node.type === 'tabgroup') {
      let maxMin = 0;
      for (const pid of node.panels) {
        const p = this.state.panels.get(pid);
        if (!p) continue;
        const m = axis === 'horizontal'
          ? (p.minimumWidth ?? p.minimumSize ?? 0)
          : (p.minimumHeight ?? p.minimumSize ?? 0);
        if (m > maxMin) maxMin = m;
      }
      return maxMin;
    }
    // split
    if (node.direction === axis) {
      return node.children.reduce((sum, c) => sum + this.computeNodeMinSize(c, axis), 0);
    }
    return node.children.reduce((m, c) => Math.max(m, this.computeNodeMinSize(c, axis)), 0);
  }

  /** Compute the maximum size (px) a layout node can occupy along an axis. */
  private computeNodeMaxSize(node: LayoutNode, axis: 'horizontal' | 'vertical'): number {
    if (node.type === 'tabgroup') {
      let minMax = Infinity;
      for (const pid of node.panels) {
        const p = this.state.panels.get(pid);
        if (!p) continue;
        const m = axis === 'horizontal' ? p.maximumWidth : p.maximumHeight;
        if (m !== undefined && m < minMax) minMax = m;
      }
      return minMax;
    }
    if (node.direction === axis) {
      return node.children.reduce((sum, c) => sum + this.computeNodeMaxSize(c, axis), 0);
    }
    return node.children.reduce((m, c) => Math.min(m, this.computeNodeMaxSize(c, axis)), Infinity);
  }

  /** Push visibility + active flags to each cached PanelApi after render. */
  private propagatePanelApiState(): void {
    const visible = new Set<string>();
    const walk = (node: LayoutNode): void => {
      if (node.type === 'tabgroup') { if (node.activePanel) visible.add(node.activePanel); }
      else { for (const c of node.children) walk(c); }
    };
    walk(this.state.layout);
    for (const [panelId, placement] of this.state.placements) {
      if (placement.type === 'floating' || placement.type === 'popout') visible.add(panelId);
    }
    const activeId = this.state.activePaneId;
    for (const [panelId, api] of this.panelApis) {
      api._setVisible(visible.has(panelId));
      api._setActive(panelId === activeId);
    }
  }

  /** Dispose PanelApis and render containers for panels no longer in state. */
  private cleanupPanelApis(): void {
    for (const [panelId, api] of this.panelApis) {
      if (!this.state.panels.has(panelId)) { api._dispose(); this.panelApis.delete(panelId); this.destroyContent(panelId); }
    }
    for (const panelId of Array.from(this.renderManager.panelIds())) {
      if (!this.state.panels.has(panelId)) this.destroyContent(panelId);
    }
  }

  /** Enable or disable the debug overlay showing layout IDs and split ratios. */
  private setDebugOverlay(enabled: boolean): void {
    if (!enabled) { this.debugOverlayEl?.remove(); this.debugOverlayEl = null; return; }
    if (!this.debugOverlayEl) {
      this.debugOverlayEl = document.createElement('div');
      this.debugOverlayEl.className = 'dock-debug-overlay';
      this.debugOverlayEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:10030;';
      this.rootEl.appendChild(this.debugOverlayEl);
    }
    this.debugOverlayEl.innerHTML = '';
    const rootRect = this.rootEl.getBoundingClientRect();
    const addLabel = (el: HTMLElement, text: string, bg: string) => {
      const rect = el.getBoundingClientRect();
      const label = document.createElement('div');
      label.style.cssText = `position:absolute;left:${rect.left - rootRect.left}px;top:${rect.top - rootRect.top}px;background:${bg};color:#fff;font-size:9px;padding:1px 4px;border-radius:2px;font-family:monospace;`;
      label.textContent = text;
      this.debugOverlayEl!.appendChild(label);
    };
    this.rootEl.querySelectorAll<HTMLElement>('[data-dock-target]').forEach(el => {
      addLabel(el, `${el.getAttribute('data-dock-target')} | ${el.getAttribute('data-panel-id') || ''}`, 'rgba(0,0,0,0.6)');
    });
    this.rootEl.querySelectorAll<HTMLElement>('.dock-splitter').forEach(el => {
      const val = el.getAttribute('aria-valuenow');
      if (val) addLabel(el, `${val}%`, 'rgba(128,0,255,0.7)');
    });
  }

  /** Clean up all resources. After calling `dispose()`, this instance must not be used again. */
  dispose(): void {
    // Dispose sub-managers
    for (const m of [this.dragManager, this.focusManager, this.keyboardManager]) m.dispose();
    this.panelFinder?.dispose();

    // Dispose all view maps and panel APIs
    const disposeMap = (map: Map<unknown, { dispose(): void }>) => { for (const [, v] of map) v.dispose(); map.clear(); };
    for (const [, api] of this.panelApis) api._dispose();
    this.panelApis.clear();
    disposeMap(this.tabGroupViews);
    disposeMap(this.splitViews);
    disposeMap(this.floatingViews);
    disposeMap(this.unpinnedStripViews);

    if (this.maximizeOverlay) { this.maximizeOverlay.dispose(); this.maximizeOverlay = null; }
    this.renderManager.dispose();
    this.rootEl.removeEventListener('mousedown', this.onActionClick);
    this.rootEl.parentNode?.removeChild(this.rootEl);
    releaseStyles();
  }

  private onActionClick = (e: MouseEvent): void => {
    // Only handle primary mouse button
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLElement>('button[data-action]');
    if (!btn) return;

    // Stop propagation so DockDragManager doesn't also process this mousedown
    e.stopPropagation();

    const action = btn.getAttribute('data-action');
    const panelId = btn.getAttribute('data-panel-id') || '';

    switch (action) {
      case 'close': this.closePanel(panelId); break;
      case 'maximize': this.dispatch({ type: 'MAXIMIZE_PANEL', panelId }); break;
      case 'restore': this.dispatch({ type: 'RESTORE_PANEL', panelId }); break;
      case 'float': {
        const rect = btn.closest('.dock-tab-group')?.getBoundingClientRect();
        const rootRect = this.rootEl.getBoundingClientRect();
        const fw = 400, fh = 300;
        const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));
        const fx = clamp(rect ? rect.left + 40 : 200, rootRect.left, rootRect.right - fw - 20) - rootRect.left;
        const fy = clamp(rect ? rect.top + 40 : 200, rootRect.top, rootRect.bottom - fh - 20) - rootRect.top;
        this.dispatch({ type: 'FLOAT_PANEL', panelId, x: fx, y: fy, width: fw, height: fh });
        break;
      }
      case 'unpin': this.dispatch({ type: 'UNPIN_PANEL', panelId }); break;
      case 'dock-back': {
        if (this.state.panels.get(panelId)?.dockable === false) break;
        this.dispatch({ type: 'DOCK_FLOATING', panelId, targetGroupId: 'default', position: 'center' });
        break;
      }
      case 'pin': this.dispatch({ type: 'PIN_PANEL', panelId }); break;
    }
  };

  /** Close a panel, respecting the onWillClose callback. */
  private closePanel(panelId: string): void {
    if (this.options.onWillClose) {
      const event = createPreventableEvent('willClose', panelId);
      this.options.onWillClose(event, panelId);
      if (event.defaultPrevented) return;
    }
    this.dispatch({ type: 'CLOSE_PANEL', panelId });
  }

  /** Bind a placeholder element to a panel's persistent render container. */
  private getOrCreateContent(panelId: string, parentContainer: HTMLElement): IDisposable {
    return this.renderManager.bindPlaceholder(panelId, parentContainer);
  }

  /** Permanently destroy a panel's content (called when panel is closed). */
  private destroyContent(panelId: string): void {
    this.renderManager.destroyContainer(panelId);
  }

  private render(): void {
    try {
      this.renderLayout();
      this.renderFloatingPanels();
      this.renderUnpinnedStrips();
      this.renderMaximizeOverlay();
      this.propagatePanelApiState();
    } catch (err) {
      console.error('[DockviewComponent] Render error:', err);
    }
  }

  private renderLayout(): void {
    const layoutEl = this.renderLayoutNode(this.state.layout);
    if (this.layoutContentEl.firstChild !== layoutEl) {
      while (this.layoutContentEl.firstChild) this.layoutContentEl.removeChild(this.layoutContentEl.firstChild);
      this.layoutContentEl.appendChild(layoutEl);
    }
    // Remove extra children (leftover splitters from collapsed splits)
    while (this.layoutContentEl.lastChild !== this.layoutContentEl.firstChild) {
      if (this.layoutContentEl.lastChild) this.layoutContentEl.removeChild(this.layoutContentEl.lastChild);
    }
    this.cleanupStaleViews();
    this.cleanupPanelApis();
  }

  private renderLayoutNode(node: LayoutNode): HTMLElement {
    return node.type === 'tabgroup' ? this.renderTabGroup(node) : this.renderSplit(node);
  }

  private renderTabGroup(node: TabGroupNode): HTMLElement {
    const existing = this.tabGroupViews.get(node.id);
    if (existing) {
      existing.update(node, this.state.panels, this.state.activePaneId, this.state.maximizedPanelId);
      return existing.element;
    }

    const callbacks: TabGroupViewCallbacks = {
      onClosePanel: (panelId) => { this.closePanel(panelId); },
      onFloatPanel: (panelId) => { this.dispatch({ type: 'FLOAT_PANEL', panelId, x: 200, y: 200, width: 400, height: 300 }); },
      onMaximizePanel: (panelId) => { this.dispatch({ type: 'MAXIMIZE_PANEL', panelId }); },
      onRestorePanel: (panelId) => { this.dispatch({ type: 'RESTORE_PANEL', panelId }); },
      onUnpinPanel: (panelId) => { this.dispatch({ type: 'UNPIN_PANEL', panelId }); },
      onSetActivePanel: (tabGroupId, panelId) => { this.dispatch({ type: 'SET_ACTIVE_PANEL', groupId: tabGroupId, panelId }); },
      onSetActivePane: (panelId) => { this.dispatch({ type: 'SET_ACTIVE_PANE', panelId }); },
      onSaveLayout: this.options.onSaveLayout ? () => this.options.onSaveLayout!(this.state) : undefined,
      onSetHeaderCollapsed: (tabGroupId, collapsed) => { this.dispatch({ type: 'SET_HEADER_COLLAPSED', groupId: tabGroupId, collapsed }); },
      onToggleMaximize: (panelId) => {
        this.dispatch({ type: this.state.maximizedPanelId === panelId ? 'RESTORE_PANEL' : 'MAXIMIZE_PANEL', panelId });
      },
      createContent: (panelId, container) => this.getOrCreateContent(panelId, container),
      createTab: this.options.createTab,
      createHeaderActions: this.options.createHeaderActions,
      createWatermark: this.options.createWatermark,
    };

    const view = new TabGroupView(
      node,
      this.state.panels,
      this.state.activePaneId,
      this.state.maximizedPanelId,
      callbacks,
    );
    this.tabGroupViews.set(node.id, view);
    return view.element;
  }

  private renderSplit(node: SplitNode): HTMLElement {
    const existing = this.splitViews.get(node.id);
    if (existing) {
      const containers = existing.getChildContainers();
      // Try to reuse if structure unchanged
      if (containers.length === node.children.length) {
        // Pre-resolve children and check for DOM cycles (ancestor/descendant swap)
        const childEls: HTMLElement[] = [];
        let cycle = false;
        for (let i = 0; i < node.children.length; i++) {
          const childEl = this.renderLayoutNode(node.children[i]);
          if (childEl === existing.element || childEl.contains(containers[i])) { cycle = true; break; }
          childEls.push(childEl);
        }
        if (!cycle) {
          existing.updateSizes(node.sizes);
          for (let i = 0; i < node.children.length; i++) {
            if (containers[i].firstChild !== childEls[i]) {
              while (containers[i].firstChild) containers[i].removeChild(containers[i].firstChild!);
              containers[i].appendChild(childEls[i]);
            }
          }
          return existing.element;
        }
      }
      // Structure changed or cycle — recreate
      existing.element.parentNode?.removeChild(existing.element);
      existing.dispose();
      this.splitViews.delete(node.id);
    }

    const view = new SplitView(node, {
      onResizeSplit: (splitId, sizes) => {
        this.dispatch({ type: 'RESIZE_SPLIT', splitId, sizes });
      },
      createChildView: (childNode) => this.renderLayoutNode(childNode),
      getChildMinSize: (childNode, axis) => this.computeNodeMinSize(childNode, axis),
      getChildMaxSize: (childNode, axis) => this.computeNodeMaxSize(childNode, axis),
    });
    this.splitViews.set(node.id, view);
    return view.element;
  }

  private renderFloatingPanels(): void {
    // Collect current floating panel IDs from placements
    const floatingPlacements = new Map<string, Placement & { type: 'floating' }>();
    for (const [panelId, placement] of this.state.placements) {
      if (placement.type === 'floating') {
        floatingPlacements.set(panelId, placement as Placement & { type: 'floating' });
      }
    }

    for (const [id, view] of this.floatingViews) {
      if (!floatingPlacements.has(id)) {
        view.dispose();
        this.floatingViews.delete(id);
        if (this.state.panels.has(id)) {
          for (const [, tgView] of this.tabGroupViews) {
            if (tgView.containsPanel(id)) { tgView.invalidateContentSlot(id); break; }
          }
        }
      }
    }

    for (const [fpId, placement] of floatingPlacements) {
      const panel = this.state.panels.get(fpId);
      if (!panel) continue;
      const fp: FloatingPanel = { panelId: fpId, x: placement.x, y: placement.y, width: placement.width, height: placement.height, zIndex: placement.zIndex };

      const existing = this.floatingViews.get(fpId);
      if (existing) {
        existing.update(fp, panel, this.state.activePaneId);
      } else {
        const callbacks: FloatingWindowViewCallbacks = {
          onUpdateFloating: (panelId, updates) => { this.dispatch({ type: 'UPDATE_FLOATING', panelId, ...updates }); },
          onBringToFront: (panelId) => { this.dispatch({ type: 'BRING_TO_FRONT', panelId }); },
          onDockBack: (panelId) => {
            const targetId = findFirstTabGroup(this.state.layout);
            if (targetId) this.dispatch({ type: 'DOCK_FLOATING', panelId, targetGroupId: targetId, position: 'center' });
          },
          onClosePanel: (panelId) => { this.closePanel(panelId); },
          onSetActivePane: (panelId) => { this.dispatch({ type: 'SET_ACTIVE_PANE', panelId }); },
          onDockToTarget: (panelId, targetId, position) => { this.dispatch({ type: 'DOCK_FLOATING', panelId, targetGroupId: targetId, position }); },
          getDragManager: () => this.dragManager,
          createContent: (panelId, container) => this.getOrCreateContent(panelId, container),
        };

        const view = new FloatingWindowView(fp, panel, this.state.activePaneId, callbacks);
        this.floatingViews.set(fpId, view);
        this.rootEl.appendChild(view.element);
      }
    }
  }

  private getStripContainer(edge: DockEdge): HTMLDivElement {
    return edge === 'left' ? this.leftStripContainer : edge === 'right' ? this.rightStripContainer
      : edge === 'top' ? this.topStripContainer : this.bottomStripContainer;
  }

  private renderUnpinnedStrips(): void {
    const edges: DockEdge[] = ['left', 'right', 'top', 'bottom'];

    // Collect unpinned panels from placements
    const unpinnedPanels: import('../types/dock').UnpinnedPanel[] = [];
    for (const [panelId, placement] of this.state.placements) {
      if (placement.type === 'unpinned') {
        unpinnedPanels.push({ panelId, edge: placement.edge, size: placement.size });
      }
    }

    for (const edge of edges) {
      const edgePanels = unpinnedPanels.filter((p) => p.edge === edge);
      const container = this.getStripContainer(edge);

      if (edgePanels.length === 0) {
        const existing = this.unpinnedStripViews.get(edge);
        if (existing) { existing.dispose(); this.unpinnedStripViews.delete(edge); }
        container.style.display = 'none';
        continue;
      }

      container.style.display = '';

      const existing = this.unpinnedStripViews.get(edge);
      if (existing) {
        existing.update(edgePanels, this.state.panels);
      } else {
        const view = new UnpinnedStripView(edge, edgePanels, this.state.panels, {
          onPinPanel: (panelId) => { this.dispatch({ type: 'PIN_PANEL', panelId }); },
          onClosePanel: (panelId) => { this.closePanel(panelId); },
          onResizeUnpinned: (panelId, size) => { this.dispatch({ type: 'RESIZE_UNPINNED', panelId, size }); },
          createContent: (panelId, cont) => this.getOrCreateContent(panelId, cont),
        });
        this.unpinnedStripViews.set(edge, view);
        container.appendChild(view.stripEl);
      }
    }
  }

  private renderMaximizeOverlay(): void {
    if (this.state.maximizedPanelId) {
      const panel = this.state.panels.get(this.state.maximizedPanelId);
      if (panel) {
        // If overlay exists but for a different panel, dispose and recreate
        if (this.maximizeOverlay && this.maximizeOverlayPanelId !== this.state.maximizedPanelId) {
          this.maximizeOverlay.dispose();
          this.maximizeOverlay = null;
        }
        if (!this.maximizeOverlay) {
          this.maximizeOverlayPanelId = this.state.maximizedPanelId;
          this.maximizeOverlay = new MaximizeOverlayView(this.state.maximizedPanelId, panel, {
            onRestorePanel: (panelId) => { this.dispatch({ type: 'RESTORE_PANEL', panelId }); },
            createContent: (panelId, container) => this.getOrCreateContent(panelId, container),
          });
          this.rootEl.appendChild(this.maximizeOverlay.element);
        }
      }
    } else if (this.maximizeOverlay) {
      const restoredPanelId = this.maximizeOverlayPanelId;
      this.maximizeOverlay.dispose();
      this.maximizeOverlay = null;
      this.maximizeOverlayPanelId = undefined;
      // Invalidate TabGroupView content slot so it re-requests via getOrCreateContent
      if (restoredPanelId) {
        for (const [, view] of this.tabGroupViews) {
          if (view.containsPanel(restoredPanelId)) { view.invalidateContentSlot(restoredPanelId); break; }
        }
      }
    }
  }

  private cleanupStaleViews(): void {
    const currentTabGroupIds = new Set<string>();
    const currentSplitIds = new Set<string>();
    this.collectNodeIds(this.state.layout, currentTabGroupIds, currentSplitIds);
    const pruneMap = <V extends { dispose(): void }>(map: Map<string, V>, live: Set<string>) => {
      for (const [id, view] of map) { if (!live.has(id)) { view.dispose(); map.delete(id); } }
    };
    pruneMap(this.tabGroupViews, currentTabGroupIds);
    pruneMap(this.splitViews, currentSplitIds);
  }

  private collectNodeIds(node: LayoutNode, tabGroupIds: Set<string>, splitIds: Set<string>): void {
    if (node.type === 'tabgroup') {
      tabGroupIds.add(node.id);
    } else {
      splitIds.add(node.id);
      for (const child of node.children) {
        this.collectNodeIds(child, tabGroupIds, splitIds);
      }
    }
  }
}
