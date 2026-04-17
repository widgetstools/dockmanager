import type {
  DockManagerState,
  LayoutNode,
  TabGroupNode,
  SplitNode,
  FloatingPanel,
  PanelConfig,
  DockPosition,
  PreventableDockEvent,
  DockEdge,
} from '../types/dock';
import { createPreventableEvent } from '../types/dock';
import { dockReducer, type DockAction } from '../reducer/dockReducer';
import { findFirstTabGroup, findTabGroupForPanel, syncIdCounter } from '../layout/LayoutTree';
import { checkLayoutInvariants, findLostPanels } from '../layout/layoutInvariants';
import { PanelApi } from '../api/PanelApi';
import { DockviewApi } from '../api/DockviewApi';
import { DockDragManager } from './DockDragManager';
import { FocusManager } from './FocusManager';
import { KeyboardManager } from './KeyboardManager';
import { StateHistoryManager } from './StateHistoryManager';
import { PanelFinder } from './PanelFinder';
import { TabGroupView, type TabGroupViewCallbacks } from './views/TabGroupView';
import { SplitView } from './views/SplitView';
import { FloatingWindowView, type FloatingWindowViewCallbacks } from './views/FloatingWindowView';
import { UnpinnedStripView } from './views/UnpinnedStripView';
import { MaximizeOverlayView } from './views/MaximizeOverlayView';
import { RenderContainerManager } from './RenderContainerManager';
import type { DockTheme } from '../theme/DockTheme';
import { applyTheme, vsCodeLight, vsCodeDark } from '../theme/DockTheme';
import { ensureStyles, releaseStyles } from './styleInjector';
import { debugLog, debugError, isDockManagerDebugEnabled } from '../utils/debug';

// ─── Options ─────────────────────────────────────────────────────────

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
  /**
   * Factory called to render a panel's content into a container element.
   *
   * @param panelId - The panel to render.
   * @param container - The DOM element to mount content into.
   * @param api - PanelApi instance for this panel (widget-to-header communication).
   * @returns A disposable that cleans up the rendered content.
   */
  createContent: (panelId: string, container: HTMLElement, api: PanelApi) => IDisposable;
  /**
   * Optional factory to render a custom tab for a panel.
   *
   * @param panelId - The panel the tab belongs to.
   * @param container - The DOM element to mount the tab into.
   * @param isActive - Whether the tab is currently active.
   * @returns A disposable that cleans up the rendered tab.
   */
  createTab?: (panelId: string, container: HTMLElement, isActive: boolean) => IDisposable;
  /**
   * Optional factory to render custom header action buttons in a tab group.
   *
   * @param slot - Which slot to render into (`'left'`, `'right'`, or `'prefix'`).
   * @param tabGroupId - The tab group the actions belong to.
   * @param container - The DOM element to mount actions into.
   * @returns A disposable that cleans up the rendered actions.
   */
  createHeaderActions?: (slot: 'left' | 'right' | 'prefix', tabGroupId: string, container: HTMLElement) => IDisposable;
  /**
   * Optional factory to render a watermark (placeholder) into an empty tab
   * group. When a tab group has no panels and this callback is provided, the
   * returned element is rendered inside the group's content area instead of
   * the default `.dock-empty-placeholder`. The group remains a valid drop
   * target so users can drag panels into it.
   *
   * @param container - The DOM element to mount the watermark into.
   * @returns A disposable that cleans up the watermark when a panel is added
   *          to the group (or the group is disposed).
   */
  createWatermark?: (container: HTMLElement) => IDisposable;
  /** Called after every state change with the new state. */
  onStateChange?: (state: DockManagerState) => void;
  /** Called before a panel is closed. Call `event.preventDefault()` to cancel. */
  onWillClose?: (event: PreventableDockEvent, panelId: string) => void;
  /** Called before a drag-and-drop completes. Call `event.preventDefault()` to cancel. */
  onWillDrop?: (event: PreventableDockEvent, sourceId: string, targetId: string, position: DockPosition) => void;
  /** Called when the user explicitly requests a layout save via context menu. */
  onSaveLayout?: (state: DockManagerState) => void;
  /**
   * Color theme. Can be:
   *   - `'light'` / `'dark'` — uses the default VS Code-style theme
   *   - A `DockTheme` object — applies custom colors via CSS custom properties
   *
   * Defaults to `'light'`.
   */
  theme?: 'light' | 'dark' | DockTheme;
  /** Whether to show edge dock indicators. Defaults to true. */
  allowRootDock?: boolean;
  /** Whether to allow dropping on splitters. Defaults to true. */
  allowSplitterDock?: boolean;
  /** Custom strings for UI elements (tooltips, context menu, etc.) */
  resourceStrings?: Partial<import('../types/resourceStrings').DockResourceStrings>;
}

// ─── DockviewComponent ───────────────────────────────────────────────

/**
 * Framework-agnostic dock layout manager.
 *
 * `DockviewComponent` owns the entire DOM tree for the dock layout.
 * It accepts a host element and a set of renderer callbacks, then
 * manages tab groups, split panes, floating windows, unpinned strips,
 * drag-and-drop, and keyboard navigation internally.
 *
 * Framework wrappers (React, Vue, Angular) typically instantiate this
 * class and supply framework-specific content renderers.
 *
 * @example
 * ```ts
 * const dock = new DockviewComponent(document.getElementById('root')!, {
 *   initialState: createDefaultState(),
 *   createContent: (panelId, container) => {
 *     container.textContent = panelId;
 *     return { dispose: () => { container.textContent = ''; } };
 *   },
 * });
 * dock.dispatch({ type: 'ADD_PANEL', payload: { panelId: 'p1', title: 'Panel 1' } });
 * // Later:
 * dock.dispose();
 * ```
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
  /**
   * Stable render container manager. Each panel has exactly ONE content
   * container that lives at a fixed location in the DOM (the render root)
   * for its entire lifetime. Views render placeholder divs and the manager
   * mirrors the placeholder rect onto the container. No reparenting.
   */
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

  /**
   * Create a new dock layout manager.
   *
   * @param element - The host DOM element. The dock layout will fill this element.
   * @param options - Configuration including initial state and renderer callbacks.
   */
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

    // Main row: [left-strip] [center-layout] [right-strip]
    this.layoutRowEl = document.createElement('div');
    this.layoutRowEl.style.cssText = 'flex:1;display:flex;flex-direction:row;overflow:hidden;position:relative;';

    this.leftStripContainer = document.createElement('div');
    this.leftStripContainer.style.cssText = 'position:relative;display:none;';
    this.layoutRowEl.appendChild(this.leftStripContainer);

    this.centerEl = document.createElement('div');
    this.centerEl.style.cssText = 'flex:1;overflow:hidden;position:relative;';
    this.layoutRowEl.appendChild(this.centerEl);

    this.rightStripContainer = document.createElement('div');
    this.rightStripContainer.style.cssText = 'position:relative;display:none;';
    this.layoutRowEl.appendChild(this.rightStripContainer);

    // Top strip container (for top-edge unpinned panels)
    this.topStripContainer = document.createElement('div');
    this.topStripContainer.style.cssText = 'position:relative;display:none;';
    this.rootEl.appendChild(this.topStripContainer);

    this.rootEl.appendChild(this.layoutRowEl);

    // Bottom strip container
    this.bottomStripContainer = document.createElement('div');
    this.bottomStripContainer.style.cssText = 'position:relative;display:none;';
    this.rootEl.appendChild(this.bottomStripContainer);

    // Layout content area (inside center)
    this.layoutContentEl = document.createElement('div');
    this.layoutContentEl.style.cssText = 'width:100%;height:100%;';
    this.centerEl.appendChild(this.layoutContentEl);

    this.container.appendChild(this.rootEl);

    // Stable render container manager — owns the persistent content containers
    // for every panel. Must be created AFTER rootEl is attached so its
    // ResizeObserver sees the correct host rect, but BEFORE any views are built
    // (views call createContent which routes through the manager).
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

    // Set up event delegation for action buttons.
    // Use mousedown instead of click so that actions fire immediately,
    // before any re-render (triggered by DockDragManager's onSelect on
    // mouseup) can remove the button from the DOM and swallow the click.
    this.rootEl.addEventListener('mousedown', this.onActionClick);

    // Initialize drag manager
    this.dragManager = new DockDragManager({
      containerElement: this.rootEl,
      onDrop: (sourceId, targetId, position) => {
        // Check if the source is a floating panel
        const isFloating = this.state.floatingPanels.some(fp => fp.panelId === sourceId);

        debugLog('DOCK_DROP', { sourceId, targetId, position, isFloating });

        if (targetId === '__root__') {
          if (isFloating) {
            // Dock floating panel, then move to edge
            this.dispatch({ type: 'DOCK_FLOATING', payload: { panelId: sourceId, targetTabGroupId: findFirstTabGroup(this.state.layout) || '', position: 'center' } });
            this.dispatch({ type: 'DOCK_TO_EDGE', payload: { panelId: sourceId, edge: position } });
          } else {
            this.dispatch({ type: 'DOCK_TO_EDGE', payload: { panelId: sourceId, edge: position } });
          }
        } else if (isFloating) {
          // Dock floating panel to the specific target
          this.dispatch({ type: 'DOCK_FLOATING', payload: { panelId: sourceId, targetTabGroupId: targetId, position } });
        } else {
          this.dispatch({ type: 'MOVE_PANEL', payload: { panelId: sourceId, targetTabGroupId: targetId, position } });
        }
      },
      onFloat: (sourceId, x, y) => {
        debugLog('DOCK_DROP_FLOAT', { sourceId, x, y });
        this.dispatch({
          type: 'FLOAT_PANEL',
          payload: { panelId: sourceId, x, y, width: 400, height: 300 },
        });
      },
      onSelect: (sourceId) => {
        const tabGroupId = findTabGroupForPanel(this.state.layout, sourceId);
        if (tabGroupId) {
          this.dispatch({ type: 'SET_ACTIVE_PANEL', payload: { tabGroupId, panelId: sourceId } });
        }
        this.dispatch({ type: 'SET_ACTIVE_PANE', payload: { panelId: sourceId } });
      },
      onReorderTab: (tabGroupId, panelId, newIndex) => {
        this.dispatch({ type: 'REORDER_TABS', payload: { tabGroupId, panelId, newIndex } });
      },
      onWillDrop: this.options.onWillDrop
        ? (event, sourceId, targetId, position) => {
            this.options.onWillDrop?.(event, sourceId, targetId, position);
          }
        : undefined,
      theme: this.resolveThemeMode(options.theme),
    });

    // Initialize focus manager
    this.focusManager = new FocusManager({
      containerElement: this.rootEl,
      onFocusChanged: (panelId) => {
        if (panelId) {
          this.dispatch({ type: 'SET_ACTIVE_PANE', payload: { panelId } });
        }
      },
      onNavigate: (direction) => {
        this.dispatch({ type: 'NAVIGATE', payload: { direction } });
      },
      onCloseActivePanel: () => {
        const activePanelId = this.state.activePaneId;
        if (activePanelId && this.state.panels[activePanelId]?.closable !== false) {
          if (this.options.onWillClose) {
            const event = createPreventableEvent('willClose', activePanelId);
            this.options.onWillClose(event, activePanelId);
            if (event.defaultPrevented) return;
          }
          this.dispatch({ type: 'CLOSE_PANEL', payload: { panelId: activePanelId } });
        }
      },
      onNavigateTabGroup: (direction) => {
        this.dispatch({ type: 'NAVIGATE', payload: { direction } });
      },
    });

    // Initialize keyboard manager
    this.keyboardManager = new KeyboardManager({
      containerElement: this.rootEl,
      dispatch: (action) => this.dispatch(action),
      getState: () => this.state,
      onUndo: () => this.undo(),
      onRedo: () => this.redo(),
      onPanelFinder: () => this.panelFinder?.toggle(),
    });

    // Initialize panel finder (Ctrl+P)
    this.panelFinder = new PanelFinder({
      containerElement: this.rootEl,
      getState: () => this.state,
      onActivatePanel: (panelId) => {
        // Activate the panel wherever it is
        const tabGroupId = findTabGroupForPanel(this.state.layout, panelId);
        if (tabGroupId) {
          this.dispatch({ type: 'SET_ACTIVE_PANEL', payload: { tabGroupId, panelId } });
        }
        this.dispatch({ type: 'SET_ACTIVE_PANE', payload: { panelId } });
      },
    });

    // Initial render
    this.render();
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Dispatch a {@link DockAction} to update state and re-render.
   *
   * If the reducer throws, the error is logged and the previous valid state
   * is preserved. If the state did not change (same reference), rendering is skipped.
   *
   * @param action - The action to dispatch.
   */
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

    try {
      this.state = dockReducer(this.state, action);
    } catch (err) {
      console.error('[DockviewComponent] Reducer error for action', action.type, err, {
        action,
        prevState,
      });
      // Don't update state if reducer threw — keep previous valid state
      return;
    }

    if (this.state !== prevState) {
      // Always check for lost panels — panels that were registered before
      // this action but are no longer in any placement AND still registered
      // in state.panels. This indicates a reducer bug that silently dropped
      // the panel somewhere between remove and insert.
      const lost = findLostPanels(prevState, this.state);
      if (lost.length > 0) {
        console.error(
          '[DockManager] PANEL LOST after action',
          action.type,
          'panels=',
          lost,
          {
            action,
            prevLayout: prevState.layout,
            nextLayout: this.state.layout,
          },
        );
      }

      // Invariant checks (debug-gated — noisy if enabled on production)
      if (isDockManagerDebugEnabled()) {
        const violations = checkLayoutInvariants(this.state);
        if (violations.length > 0) {
          // Print the violation details as plain text so a copy-pasted
          // devtools log is self-contained and doesn't require expanding
          // a collapsed object.
          const summary = violations.map(v => `[${v.kind}] ${v.detail}`).join('\n  ');
          console.warn(
            `[DockManager] ${violations.length} invariant violation(s) after action ${action.type}:\n  ${summary}`,
          );
          console.warn('[DockManager] violation context', {
            action,
            violations,
            prevLayout: prevState.layout,
            nextLayout: this.state.layout,
            prevFloating: prevState.floatingPanels.map(p => p.panelId),
            nextFloating: this.state.floatingPanels.map(p => p.panelId),
            prevUnpinned: prevState.unpinnedPanels.map(p => p.panelId),
            nextUnpinned: this.state.unpinnedPanels.map(p => p.panelId),
            prevPopout: (prevState.popoutPanels ?? []).map(p => p.panelId),
            nextPopout: (this.state.popoutPanels ?? []).map(p => p.panelId),
          });
        }
      }

      try {
        this.render();
      } catch (renderErr) {
        console.error(
          '[DockviewComponent] Render error after action',
          action.type,
          renderErr,
          { action, layout: this.state.layout },
        );
        // Don't freeze — existing DOM remains intact
      }
      try {
        this.options.onStateChange?.(this.state);
      } catch (cbErr) {
        console.error('[DockviewComponent] onStateChange callback error:', cbErr, { action });
      }
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

  // ── Theme helpers ──────────────────────────────────────────────────

  /** Resolve a theme option to a 'light' | 'dark' mode string */
  private resolveThemeMode(theme?: 'light' | 'dark' | DockTheme): 'light' | 'dark' {
    if (!theme) return 'light';
    if (typeof theme === 'string') return theme;
    return theme.mode;
  }

  /** Apply theme option — handles string ('light'/'dark') or DockTheme object */
  private applyThemeOption(theme?: 'light' | 'dark' | DockTheme): void {
    const mode = this.resolveThemeMode(theme);

    // Toggle dark class for CSS base rules
    if (mode === 'dark') {
      this.rootEl.classList.add('dark');
    } else {
      this.rootEl.classList.remove('dark');
    }

    // Apply theme colors as CSS custom properties on the container
    if (typeof theme === 'object' && theme !== null) {
      // Custom DockTheme object
      applyTheme(this.rootEl, theme);
    } else {
      // Built-in string theme — apply default colors
      applyTheme(this.rootEl, mode === 'dark' ? vsCodeDark : vsCodeLight);
    }

    // Update drag manager theme
    if (this.dragManager) {
      this.dragManager.setTheme(mode);
    }
  }

  /**
   * Update component options at runtime (e.g., switch theme or change callbacks).
   *
   * @param options - Partial options to merge into the current configuration.
   */
  updateOptions(options: Partial<DockviewComponentOptions>): void {
    Object.assign(this.options, options);

    if (options.theme !== undefined) {
      this.applyThemeOption(options.theme);
    }

    if (options.onWillDrop !== undefined) {
      this.dragManager.setOnWillDrop(
        options.onWillDrop
          ? (event, sourceId, targetId, position) => {
              options.onWillDrop?.(event, sourceId, targetId, position);
            }
          : undefined,
      );
    }
  }

  /**
   * Get or create a {@link PanelApi} for a given panel.
   *
   * The returned API is wired to dispatch `UPDATE_PANEL_CONFIG` actions
   * back into this component. Panel APIs are cached and reused across renders.
   *
   * @param panelId - The panel to get an API for.
   * @returns The PanelApi instance for the given panel.
   */
  getPanelApi(panelId: string): PanelApi {
    let api = this.panelApis.get(panelId);
    if (!api) {
      api = new PanelApi(panelId);
      api._setConfigAccessor(() => this.state.panels[panelId]);
      api._setUpdateHandler((id, updates) => {
        this.dispatch({ type: 'UPDATE_PANEL_CONFIG', payload: { panelId: id, updates } });
      });
      api._setAttentionHandler((id, attention) => {
        // Find the tab element and toggle attention CSS class
        const tabEl = this.rootEl.querySelector(`[data-tab-id="${id}"]`);
        if (tabEl) {
          tabEl.classList.toggle('dock-tab-attention', attention);
        }
      });
      this.panelApis.set(panelId, api);
    }
    return api;
  }

  /**
   * Compute the minimum size (pixels) a layout node can occupy along an axis.
   * For tab groups: max of all contained panels' min along that axis (any
   * panel could become active). For splits: sum along the same axis, max
   * along the perpendicular axis. Falls back to 0 when unconstrained.
   */
  private computeNodeMinSize(node: LayoutNode, axis: 'horizontal' | 'vertical'): number {
    if (node.type === 'tabgroup') {
      let maxMin = 0;
      for (const pid of node.panels) {
        const p = this.state.panels[pid];
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

  /**
   * Compute the maximum size (pixels) a layout node can occupy along an axis.
   * For tab groups: min of all contained panels' max. For splits: sum along
   * the same axis, min along perpendicular. Returns Infinity when unconstrained.
   */
  private computeNodeMaxSize(node: LayoutNode, axis: 'horizontal' | 'vertical'): number {
    if (node.type === 'tabgroup') {
      let minMax = Infinity;
      for (const pid of node.panels) {
        const p = this.state.panels[pid];
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

  /**
   * After each render, push visibility + active flags to each cached PanelApi.
   * Visibility = panel is the active tab of its tab group. Active = panel is
   * the globally focused pane (state.activePaneId).
   */
  private propagatePanelApiState(): void {
    // Collect the set of visible panel IDs (active tab in each tab group).
    const visible = new Set<string>();
    const walk = (node: LayoutNode): void => {
      if (node.type === 'tabgroup') {
        if (node.activePanel) visible.add(node.activePanel);
      } else if (node.type === 'split') {
        for (const c of node.children) walk(c);
      }
    };
    walk(this.state.layout);
    // Floating + popout panels count as visible.
    for (const fp of this.state.floatingPanels) visible.add(fp.panelId);
    for (const pp of (this.state.popoutPanels || [])) visible.add(pp.panelId);

    const activeId = this.state.activePaneId;
    for (const [panelId, api] of this.panelApis) {
      api._setVisible(visible.has(panelId));
      api._setActive(panelId === activeId);
    }
  }

  /**
   * Dispose PanelApis for panels that no longer exist in state.
   */
  private cleanupPanelApis(): void {
    for (const [panelId, api] of this.panelApis) {
      if (!this.state.panels[panelId]) {
        api._dispose();
        this.panelApis.delete(panelId);
        this.destroyContent(panelId);
      }
    }
    // Clean up any orphaned render containers (e.g. content created for a
    // panel that was removed without going through cleanupPanelApis above).
    for (const panelId of Array.from(this.renderManager.panelIds())) {
      if (!this.state.panels[panelId]) {
        this.destroyContent(panelId);
      }
    }
  }

  /** Enable or disable the debug overlay showing layout IDs and split ratios. */
  private setDebugOverlay(enabled: boolean): void {
    if (enabled) {
      if (!this.debugOverlayEl) {
        this.debugOverlayEl = document.createElement('div');
        this.debugOverlayEl.className = 'dock-debug-overlay';
        this.debugOverlayEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:10030;';
        this.rootEl.appendChild(this.debugOverlayEl);
      }
      this.updateDebugOverlay();
    } else {
      if (this.debugOverlayEl) {
        this.debugOverlayEl.remove();
        this.debugOverlayEl = null;
      }
    }
  }

  /** Update the debug overlay with current layout info. */
  private updateDebugOverlay(): void {
    if (!this.debugOverlayEl) return;
    this.debugOverlayEl.innerHTML = '';

    // Add labels for all tab groups
    const groups = this.rootEl.querySelectorAll<HTMLElement>('[data-dock-target]');
    groups.forEach(el => {
      const id = el.getAttribute('data-dock-target');
      const panelId = el.getAttribute('data-panel-id');
      const rect = el.getBoundingClientRect();
      const rootRect = this.rootEl.getBoundingClientRect();

      const label = document.createElement('div');
      label.style.cssText = `position:absolute;left:${rect.left - rootRect.left}px;top:${rect.top - rootRect.top}px;background:rgba(0,0,0,0.6);color:#fff;font-size:9px;padding:1px 4px;border-radius:2px;font-family:monospace;z-index:1;`;
      label.textContent = `${id} | ${panelId || ''}`;
      this.debugOverlayEl!.appendChild(label);
    });

    // Add labels for all splitters
    const splitters = this.rootEl.querySelectorAll<HTMLElement>('.dock-splitter');
    splitters.forEach(el => {
      const val = el.getAttribute('aria-valuenow');
      if (val) {
        const rect = el.getBoundingClientRect();
        const rootRect = this.rootEl.getBoundingClientRect();
        const label = document.createElement('div');
        label.style.cssText = `position:absolute;left:${rect.left - rootRect.left}px;top:${rect.top - rootRect.top}px;background:rgba(128,0,255,0.7);color:#fff;font-size:9px;padding:1px 3px;border-radius:2px;font-family:monospace;`;
        label.textContent = `${val}%`;
        this.debugOverlayEl!.appendChild(label);
      }
    });
  }

  /**
   * Clean up all resources: dispose sub-managers, views, panel APIs, and
   * remove the root DOM element from the container.
   *
   * After calling `dispose()`, this instance must not be used again.
   */
  dispose(): void {
    this.dragManager.dispose();
    this.focusManager.dispose();
    this.keyboardManager.dispose();
    this.panelFinder?.dispose();

    // Dispose all PanelApis
    for (const [, api] of this.panelApis) api._dispose();
    this.panelApis.clear();

    // Dispose all views
    for (const [, view] of this.tabGroupViews) view.dispose();
    this.tabGroupViews.clear();

    for (const [, view] of this.splitViews) view.dispose();
    this.splitViews.clear();

    for (const [, view] of this.floatingViews) view.dispose();
    this.floatingViews.clear();

    for (const [, view] of this.unpinnedStripViews) view.dispose();
    this.unpinnedStripViews.clear();

    if (this.maximizeOverlay) {
      this.maximizeOverlay.dispose();
      this.maximizeOverlay = null;
    }

    // Destroy all panel content via the render manager
    this.renderManager.dispose();

    this.rootEl.removeEventListener('mousedown', this.onActionClick);

    if (this.rootEl.parentNode) {
      this.rootEl.parentNode.removeChild(this.rootEl);
    }

    releaseStyles();
  }

  // ── Event delegation: action buttons ────────────────────────────

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
      case 'close': {
        if (this.options.onWillClose) {
          const event = createPreventableEvent('willClose', panelId);
          this.options.onWillClose(event, panelId);
          if (event.defaultPrevented) return;
        }
        this.dispatch({ type: 'CLOSE_PANEL', payload: { panelId } });
        break;
      }
      case 'maximize': {
        this.dispatch({ type: 'MAXIMIZE_PANEL', payload: { panelId } });
        break;
      }
      case 'restore': {
        this.dispatch({ type: 'RESTORE_PANEL', payload: { panelId } });
        break;
      }
      case 'float': {
        const rect = btn.closest('.dock-tab-group')?.getBoundingClientRect();
        const rootRect = this.rootEl.getBoundingClientRect();
        const fw = 400, fh = 300;
        // Position near original location but clamp within the dock manager bounds
        let fx = rect ? rect.left + 40 : 200;
        let fy = rect ? rect.top + 40 : 200;
        fx = Math.max(rootRect.left, Math.min(fx, rootRect.right - fw - 20));
        fy = Math.max(rootRect.top, Math.min(fy, rootRect.bottom - fh - 20));
        // Convert to relative coordinates (floating windows are position:absolute within rootEl)
        fx -= rootRect.left;
        fy -= rootRect.top;
        this.dispatch({
          type: 'FLOAT_PANEL',
          payload: { panelId, x: fx, y: fy, width: fw, height: fh },
        });
        break;
      }
      case 'unpin': {
        this.dispatch({ type: 'UNPIN_PANEL', payload: { panelId } });
        break;
      }
      case 'dock-back': {
        const panelConfig = this.state.panels[panelId];
        if (panelConfig?.dockable === false) break;
        // Pass 'default' as targetTabGroupId so the reducer uses the saved
        // sourceTabGroupId from when the panel was originally floated
        this.dispatch({
          type: 'DOCK_FLOATING',
          payload: { panelId, targetTabGroupId: 'default', position: 'center' },
        });
        break;
      }
      case 'pin': {
        this.dispatch({ type: 'PIN_PANEL', payload: { panelId } });
        break;
      }
    }
  };

  // ── Content management ──────────────────────────────────────────

  /**
   * Bind a placeholder element to a panel. The persistent content container
   * (owned by the render manager) is positioned over the placeholder. The
   * returned disposable hides the container; call destroyContent() to
   * permanently dispose it when the panel is closed.
   *
   * Views call this with whatever wrapper div they previously used as the
   * createContent parent — the wrapper now serves as a placeholder rather
   * than a parent. The container is never reparented.
   */
  private getOrCreateContent(panelId: string, parentContainer: HTMLElement): IDisposable {
    return this.renderManager.bindPlaceholder(panelId, parentContainer);
  }

  /**
   * Permanently destroy a panel's content (called when panel is closed).
   */
  private destroyContent(panelId: string): void {
    this.renderManager.destroyContainer(panelId);
  }

  // ── Rendering ───────────────────────────────────────────────────

  private render(): void {
    try {
      this.renderLayout();
      this.renderFloatingPanels();
      this.renderUnpinnedStrips();
      this.renderMaximizeOverlay();
      this.propagatePanelApiState();
    } catch (err) {
      console.error('[DockviewComponent] Render error:', err);
      // Don't re-throw — prevent DOM manipulation errors from freezing the component.
      // The component remains interactive and the next dispatch will attempt to re-render.
    }
  }

  // ── Layout rendering ────────────────────────────────────────────

  private renderLayout(): void {
    const layoutEl = this.renderLayoutNode(this.state.layout);
    // Replace content of layoutContentEl
    if (this.layoutContentEl.firstChild !== layoutEl) {
      // Remove stale children individually instead of innerHTML = '' to avoid
      // detaching reusable child elements that may still be referenced by views.
      while (this.layoutContentEl.firstChild) {
        this.layoutContentEl.removeChild(this.layoutContentEl.firstChild);
      }
      this.layoutContentEl.appendChild(layoutEl);
    }
    // Remove any extra children (e.g., leftover splitters or child containers
    // from a split that collapsed to fewer children).
    while (this.layoutContentEl.lastChild !== this.layoutContentEl.firstChild) {
      if (this.layoutContentEl.lastChild) {
        this.layoutContentEl.removeChild(this.layoutContentEl.lastChild);
      }
    }

    // Clean up stale views and panel APIs
    this.cleanupStaleViews();
    this.cleanupPanelApis();
  }

  private renderLayoutNode(node: LayoutNode): HTMLElement {
    if (node.type === 'tabgroup') {
      return this.renderTabGroup(node);
    } else {
      return this.renderSplit(node);
    }
  }

  private renderTabGroup(node: TabGroupNode): HTMLElement {
    const existing = this.tabGroupViews.get(node.id);
    if (existing) {
      existing.update(node, this.state.panels, this.state.activePaneId, this.state.maximizedPanelId);
      return existing.element;
    }

    const callbacks: TabGroupViewCallbacks = {
      onClosePanel: (panelId) => {
        if (this.options.onWillClose) {
          const event = createPreventableEvent('willClose', panelId);
          this.options.onWillClose(event, panelId);
          if (event.defaultPrevented) return;
        }
        this.dispatch({ type: 'CLOSE_PANEL', payload: { panelId } });
      },
      onFloatPanel: (panelId) => {
        this.dispatch({
          type: 'FLOAT_PANEL',
          payload: { panelId, x: 200, y: 200, width: 400, height: 300 },
        });
      },
      onMaximizePanel: (panelId) => {
        this.dispatch({ type: 'MAXIMIZE_PANEL', payload: { panelId } });
      },
      onRestorePanel: (panelId) => {
        this.dispatch({ type: 'RESTORE_PANEL', payload: { panelId } });
      },
      onUnpinPanel: (panelId) => {
        this.dispatch({ type: 'UNPIN_PANEL', payload: { panelId } });
      },
      onSetActivePanel: (tabGroupId, panelId) => {
        this.dispatch({ type: 'SET_ACTIVE_PANEL', payload: { tabGroupId, panelId } });
      },
      onSetActivePane: (panelId) => {
        this.dispatch({ type: 'SET_ACTIVE_PANE', payload: { panelId } });
      },
      onSaveLayout: this.options.onSaveLayout
        ? () => this.options.onSaveLayout!(this.state)
        : undefined,
      onSetHeaderCollapsed: (tabGroupId, collapsed) => {
        this.dispatch({ type: 'SET_HEADER_COLLAPSED', payload: { tabGroupId, collapsed } });
      },
      onToggleMaximize: (panelId) => {
        if (this.state.maximizedPanelId === panelId) {
          this.dispatch({ type: 'RESTORE_PANEL', payload: { panelId } });
        } else {
          this.dispatch({ type: 'MAXIMIZE_PANEL', payload: { panelId } });
        }
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
      // Check if structure changed
      const containers = existing.getChildContainers();
      if (containers.length === node.children.length) {
        // Pre-resolve children and check for DOM cycles. A cycle occurs when a
        // drop swaps an ancestor with one of its descendants — the reused outer
        // SplitView would be asked to appendChild a node that currently contains
        // its own destination container, throwing HierarchyRequestError.
        const childEls: HTMLElement[] = [];
        let cycle = false;
        for (let i = 0; i < node.children.length; i++) {
          const childEl = this.renderLayoutNode(node.children[i]);
          if (childEl === existing.element || childEl.contains(containers[i])) {
            cycle = true;
            break;
          }
          childEls.push(childEl);
        }
        if (!cycle) {
          existing.updateSizes(node.sizes);
          for (let i = 0; i < node.children.length; i++) {
            const childEl = childEls[i];
            const container = containers[i];
            if (container.firstChild !== childEl) {
              while (container.firstChild) {
                container.removeChild(container.firstChild);
              }
              container.appendChild(childEl);
            }
          }
          return existing.element;
        }
        // Cycle detected — fall through to recreate this SplitView fresh.
        if (existing.element.parentNode) {
          existing.element.parentNode.removeChild(existing.element);
        }
        existing.dispose();
        this.splitViews.delete(node.id);
      } else {
        // Structure changed — detach the element from the DOM before disposing
        // so that dispose() doesn't try to remove an already-orphaned element.
        if (existing.element.parentNode) {
          existing.element.parentNode.removeChild(existing.element);
        }
        existing.dispose();
        this.splitViews.delete(node.id);
      }
    }

    const view = new SplitView(node, {
      onResizeSplit: (splitId, sizes) => {
        this.dispatch({ type: 'RESIZE_SPLIT', payload: { splitId, sizes } });
      },
      createChildView: (childNode) => this.renderLayoutNode(childNode),
      getChildMinSize: (childNode, axis) => this.computeNodeMinSize(childNode, axis),
      getChildMaxSize: (childNode, axis) => this.computeNodeMaxSize(childNode, axis),
    });
    this.splitViews.set(node.id, view);
    return view.element;
  }

  // ── Floating panels ─────────────────────────────────────────────

  private renderFloatingPanels(): void {
    const currentIds = new Set(this.state.floatingPanels.map((fp) => fp.panelId));

    // Remove stale floating views (panel was docked back or closed)
    for (const [id, view] of this.floatingViews) {
      if (!currentIds.has(id)) {
        view.dispose();
        this.floatingViews.delete(id);

        // Reparent content back into the TabGroupView
        if (this.state.panels[id]) {
          for (const [, tgView] of this.tabGroupViews) {
            if (tgView.containsPanel(id)) {
              tgView.invalidateContentSlot(id);
              break;
            }
          }
        }
      }
    }

    // Create or update floating views
    for (const fp of this.state.floatingPanels) {
      const panel = this.state.panels[fp.panelId];
      if (!panel) continue;

      const existing = this.floatingViews.get(fp.panelId);
      if (existing) {
        existing.update(fp, panel, this.state.activePaneId);
      } else {
        const callbacks: FloatingWindowViewCallbacks = {
          onUpdateFloating: (panelId, updates) => {
            this.dispatch({
              type: 'UPDATE_FLOATING',
              payload: { panelId, ...updates },
            });
          },
          onBringToFront: (panelId) => {
            this.dispatch({ type: 'BRING_TO_FRONT', payload: { panelId } });
          },
          onDockBack: (panelId) => {
            const targetId = findFirstTabGroup(this.state.layout);
            if (targetId) {
              this.dispatch({
                type: 'DOCK_FLOATING',
                payload: { panelId, targetTabGroupId: targetId, position: 'center' },
              });
            }
          },
          onClosePanel: (panelId) => {
            if (this.options.onWillClose) {
              const event = createPreventableEvent('willClose', panelId);
              this.options.onWillClose(event, panelId);
              if (event.defaultPrevented) return;
            }
            this.dispatch({ type: 'CLOSE_PANEL', payload: { panelId } });
          },
          onSetActivePane: (panelId) => {
            this.dispatch({ type: 'SET_ACTIVE_PANE', payload: { panelId } });
          },
          onDockToTarget: (panelId, targetId, position) => {
            this.dispatch({
              type: 'DOCK_FLOATING',
              payload: { panelId, targetTabGroupId: targetId, position },
            });
          },
          getDragManager: () => this.dragManager,
          createContent: (panelId, container) => this.getOrCreateContent(panelId, container),
        };

        const view = new FloatingWindowView(fp, panel, this.state.activePaneId, callbacks);
        this.floatingViews.set(fp.panelId, view);
        this.rootEl.appendChild(view.element);
      }
    }
  }

  // ── Unpinned strips ─────────────────────────────────────────────

  private renderUnpinnedStrips(): void {
    const edges: DockEdge[] = ['left', 'right', 'top', 'bottom'];

    for (const edge of edges) {
      const edgePanels = this.state.unpinnedPanels.filter((p) => p.edge === edge);
      const container =
        edge === 'left'
          ? this.leftStripContainer
          : edge === 'right'
          ? this.rightStripContainer
          : edge === 'top'
          ? this.topStripContainer
          : this.bottomStripContainer;

      if (edgePanels.length === 0) {
        // Remove strip if present
        const existing = this.unpinnedStripViews.get(edge);
        if (existing) {
          existing.dispose();
          this.unpinnedStripViews.delete(edge);
        }
        container.style.display = 'none';
        continue;
      }

      container.style.display = '';

      const existing = this.unpinnedStripViews.get(edge);
      if (existing) {
        existing.update(edgePanels, this.state.panels);
      } else {
        const view = new UnpinnedStripView(edge, edgePanels, this.state.panels, {
          onPinPanel: (panelId) => {
            this.dispatch({ type: 'PIN_PANEL', payload: { panelId } });
          },
          onClosePanel: (panelId) => {
            if (this.options.onWillClose) {
              const event = createPreventableEvent('willClose', panelId);
              this.options.onWillClose(event, panelId);
              if (event.defaultPrevented) return;
            }
            this.dispatch({ type: 'CLOSE_PANEL', payload: { panelId } });
          },
          onResizeUnpinned: (panelId, size) => {
            this.dispatch({ type: 'RESIZE_UNPINNED', payload: { panelId, size } });
          },
          createContent: (panelId, cont) => this.getOrCreateContent(panelId, cont),
        });
        this.unpinnedStripViews.set(edge, view);
        container.appendChild(view.stripEl);
      }
    }
  }

  // ── Maximize overlay ────────────────────────────────────────────

  private renderMaximizeOverlay(): void {
    if (this.state.maximizedPanelId) {
      const panel = this.state.panels[this.state.maximizedPanelId];
      if (panel) {
        // If overlay exists but for a different panel, dispose and recreate
        if (this.maximizeOverlay && this.maximizeOverlayPanelId !== this.state.maximizedPanelId) {
          this.maximizeOverlay.dispose();
          this.maximizeOverlay = null;
        }
        if (!this.maximizeOverlay) {
          this.maximizeOverlayPanelId = this.state.maximizedPanelId;
          this.maximizeOverlay = new MaximizeOverlayView(
            this.state.maximizedPanelId,
            panel,
            {
              onRestorePanel: (panelId) => {
                this.dispatch({ type: 'RESTORE_PANEL', payload: { panelId } });
              },
              createContent: (panelId, container) => this.getOrCreateContent(panelId, container),
            },
          );
          this.rootEl.appendChild(this.maximizeOverlay.element);
        }
      }
    } else if (this.maximizeOverlay) {
      const restoredPanelId = this.maximizeOverlayPanelId;

      this.maximizeOverlay.dispose();
      this.maximizeOverlay = null;
      this.maximizeOverlayPanelId = undefined;

      // Invalidate the TabGroupView's stale content slot so it re-requests
      // the content via getOrCreateContent, which reparents the cached DOM.
      if (restoredPanelId) {
        for (const [, view] of this.tabGroupViews) {
          if (view.containsPanel(restoredPanelId)) {
            view.invalidateContentSlot(restoredPanelId);
            break;
          }
        }
      }
    }
  }

  // ── Cleanup stale views ─────────────────────────────────────────

  private cleanupStaleViews(): void {
    // Collect all current tab group IDs and split IDs from the layout
    const currentTabGroupIds = new Set<string>();
    const currentSplitIds = new Set<string>();
    this.collectNodeIds(this.state.layout, currentTabGroupIds, currentSplitIds);

    // Remove stale tab group views
    for (const [id, view] of this.tabGroupViews) {
      if (!currentTabGroupIds.has(id)) {
        view.dispose();
        this.tabGroupViews.delete(id);
      }
    }

    // Remove stale split views
    for (const [id, view] of this.splitViews) {
      if (!currentSplitIds.has(id)) {
        view.dispose();
        this.splitViews.delete(id);
      }
    }
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
