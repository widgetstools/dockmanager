import type {
  DockManagerState,
  DockPosition,
  PanelConfig,
  HeaderPosition,
  TabGroupNode,
  LayoutNode,
  FloatingPanel,
  Placement,
} from '../types/dock';
import type { DockAction } from '../reducer/dockReducer';
import {
  LayoutTree,
  findTabGroupForPanel,
  findFirstTabGroup,
  findTabGroupById,
  findAllTabGroups,
  collectAllPanelsOrdered,
  collectLayoutPanelIds,
} from '../layout/LayoutTree';
import { serialize, deserialize } from '../serialization/serializer';

// ─── Types ────────────────────────────────────────────────────────────

/**
 * Options for adding a new panel via {@link DockviewApi.addPanel}.
 */
export interface AddPanelOptions {
  /** Unique identifier for the new panel. Use `id` or `panelId`. */
  id?: string;
  /** Unique identifier for the new panel. Alias for `id`. */
  panelId?: string;
  /** Display title shown in the tab header. */
  title: string;
  /** Optional icon key or URL rendered beside the title. */
  icon?: string;
  /** Whether the panel can be closed by the user. Defaults to `true`. */
  closable?: boolean;
  /** Whether the panel can be floated by the user. Defaults to `true`. */
  floatable?: boolean;
  /** Whether this floating panel can be docked back into the layout. Defaults to `true`. */
  dockable?: boolean;
  /** Component key for a custom tab renderer. */
  tabComponent?: string;
  /** Widget type identifier for the widget registry. */
  widgetType?: string;
  /** Widget-specific props/configuration (must be JSON-serializable). */
  widgetProps?: Record<string, unknown>;
  /** Target tab group to add to. If omitted, adds to the first tab group. */
  targetGroupId?: string;
  /** Position relative to the target group. Defaults to `'center'` (add as tab). */
  position?: DockPosition;
}

/**
 * Options for floating a panel via {@link DockviewApi.floatPanel}.
 */
export interface FloatPanelOptions {
  /** The ID of the panel to float. */
  panelId: string;
  /** Horizontal offset in pixels from the container's left edge. Defaults to `100`. */
  x?: number;
  /** Vertical offset in pixels from the container's top edge. Defaults to `100`. */
  y?: number;
  /** Width of the floating window in pixels. Defaults to `400`. */
  width?: number;
  /** Height of the floating window in pixels. Defaults to `300`. */
  height?: number;
}

/**
 * Options for moving a panel via {@link DockviewApi.movePanel}.
 */
export interface MovePanelOptions {
  /** The ID of the panel to move. */
  panelId: string;
  /** The target tab group to move the panel into. */
  targetGroupId: string;
  /** Where to place the panel relative to the target group. */
  position: DockPosition;
}

// ─── API ──────────────────────────────────────────────────────────────

/**
 * Typed, high-level API for programmatic control of the dock manager.
 *
 * Wraps the low-level reducer dispatch with validated, documented methods.
 * Use this instead of dispatching raw {@link DockAction} objects directly.
 *
 * The API is stateless itself -- it reads from and writes to the state
 * via the `getState` and `dispatch` callbacks provided at construction time.
 *
 * @example
 * ```ts
 * const api = new DockviewApi(getState, dispatch);
 * api.addPanel({ id: 'editor', title: 'Editor' });
 * api.movePanel({ panelId: 'editor', targetGroupId: 'tg_right', position: 'center' });
 * api.floatPanel({ panelId: 'editor', x: 100, y: 100, width: 400, height: 300 });
 * api.closePanel('editor');
 * ```
 */
export class DockviewApi {
  /**
   * @param getState - Returns the current {@link DockManagerState} snapshot.
   * @param dispatch - Sends a {@link DockAction} to mutate state.
   * @param _onUndo - Optional undo callback wired by DockviewComponent.
   * @param _onRedo - Optional redo callback wired by DockviewComponent.
   */
  constructor(
    private readonly getState: () => DockManagerState,
    private readonly dispatch: (action: DockAction) => void,
    private readonly _onUndo?: () => void,
    private readonly _onRedo?: () => void,
  ) {}

  // ── State queries ──────────────────────────────────────────────

  /** Get the current dock manager state (read-only snapshot) */
  get state(): Readonly<DockManagerState> {
    return this.getState();
  }

  /** Get the currently active pane's panel ID */
  get activePanelId(): string {
    return this.getState().activePaneId;
  }

  /** Get the currently maximized panel ID, or undefined */
  get maximizedPanelId(): string | undefined {
    return this.getState().maximizedPanelId;
  }

  /**
   * Get a panel's configuration by ID.
   *
   * @param panelId - The panel to look up.
   * @returns The panel config, or `undefined` if no panel with that ID exists.
   */
  getPanel(panelId: string): PanelConfig | undefined {
    return this.getState().panels.get(panelId);
  }

  /**
   * Get all panel IDs in the docked layout tree (excludes floating and unpinned panels).
   *
   * @returns Panel IDs in depth-first order.
   */
  getLayoutPanelIds(): string[] {
    return collectAllPanelsOrdered(this.getState().layout);
  }

  /** Get all panel IDs across the entire dock manager */
  getAllPanelIds(): string[] {
    return Array.from(this.getState().panels.keys());
  }

  /** Get the total number of panels */
  get panelCount(): number {
    return this.getState().panels.size;
  }

  /**
   * Check if a panel exists in the dock manager.
   *
   * @param panelId - The panel ID to check.
   * @returns `true` if the panel is registered (regardless of placement).
   */
  hasPanel(panelId: string): boolean {
    return this.getState().panels.has(panelId);
  }

  /**
   * Check if a panel is placed somewhere visible (in the layout tree, floating, or unpinned).
   *
   * @param panelId - The panel ID to check.
   * @returns `true` if the panel occupies a slot in the UI.
   */
  isPanelPlaced(panelId: string): boolean {
    return this.getState().placements.has(panelId);
  }

  /**
   * Get the tab group ID that contains a given panel.
   *
   * @param panelId - The panel to search for.
   * @returns The containing tab group ID, or `null` if the panel is not in any group.
   */
  getGroupForPanel(panelId: string): string | null {
    return findTabGroupForPanel(this.getState().layout, panelId);
  }

  /**
   * Get a tab group by its ID.
   *
   * @param groupId - The tab group ID.
   * @returns The tab group node, or `null` if not found.
   */
  getGroup(groupId: string): TabGroupNode | null {
    return findTabGroupById(this.getState().layout, groupId);
  }

  /** Get all tab groups */
  getAllGroups(): TabGroupNode[] {
    return findAllTabGroups(this.getState().layout);
  }

  /**
   * Get all floating panels in the old `FloatingPanel[]` shape for backward compatibility.
   */
  getFloatingPanels(): readonly FloatingPanel[] {
    const state = this.getState();
    const result: FloatingPanel[] = [];
    for (const [panelId, placement] of state.placements) {
      if (placement.type === 'floating') {
        result.push({
          panelId,
          x: placement.x,
          y: placement.y,
          width: placement.width,
          height: placement.height,
          zIndex: placement.zIndex,
          sourceTabGroupId: placement.sourceGroupId,
        });
      }
    }
    return result;
  }

  /**
   * Check if a panel is currently rendered as a floating window.
   *
   * @param panelId - The panel ID to check.
   * @returns `true` if the panel is floating.
   */
  isFloating(panelId: string): boolean {
    const placement = this.getState().placements.get(panelId);
    return placement?.type === 'floating';
  }

  /** Check if a panel is the active pane */
  isActive(panelId: string): boolean {
    return this.getState().activePaneId === panelId;
  }

  /** Check if a panel is maximized */
  isMaximized(panelId: string): boolean {
    return this.getState().maximizedPanelId === panelId;
  }

  /** Get the layout tree */
  get layout(): LayoutNode {
    return this.getState().layout;
  }

  // ── Panel operations ───────────────────────────────────────────

  /**
   * Add a new panel to the dock manager.
   *
   * By default the panel is inserted as a new tab in the first tab group.
   * Use `targetGroupId` and `position` to control placement.
   *
   * @param options - Panel creation and placement options.
   *
   * @example
   * ```ts
   * api.addPanel({ id: 'terminal', title: 'Terminal', closable: true });
   * api.addPanel({ id: 'output', title: 'Output', targetGroupId: 'tg_2', position: 'bottom' });
   * ```
   */
  addPanel(options: AddPanelOptions): void {
    const panelId = options.panelId || options.id;
    if (!panelId) {
      console.error('[DockviewApi] addPanel requires id or panelId');
      return;
    }

    const { title, icon, closable, floatable, dockable, tabComponent, widgetType, widgetProps, targetGroupId, position } = options;

    const config: PanelConfig = {
      id: panelId,
      title,
      icon,
      closable,
      floatable,
      dockable,
      tabComponent,
      widgetType,
      widgetProps,
    };

    this.dispatch({
      type: 'ADD_PANEL',
      panelId,
      config,
      target: targetGroupId,
      position: position,
    });
  }

  /**
   * Remove a panel from the dock manager entirely.
   *
   * The panel is removed from the layout tree, floating list, and unpinned list,
   * and its {@link PanelConfig} is deleted.
   *
   * @param panelId - The ID of the panel to close.
   */
  closePanel(panelId: string): void {
    this.dispatch({ type: 'CLOSE_PANEL', panelId });
  }

  /**
   * Move a panel to a different location in the layout.
   *
   * @param options - Target group and position for the move.
   */
  movePanel(options: MovePanelOptions): void {
    this.dispatch({
      type: 'MOVE_PANEL',
      panelId: options.panelId,
      targetGroupId: options.targetGroupId,
      position: options.position,
    });
  }

  /**
   * Set the active (visible) panel within a tab group, switching the displayed tab.
   *
   * @param groupId - The tab group containing the panel.
   * @param panelId - The panel to make active.
   */
  setActivePanel(groupId: string, panelId: string): void {
    this.dispatch({ type: 'SET_ACTIVE_PANEL', groupId, panelId });
  }

  /**
   * Set the globally active pane (highlighted with the focus indicator).
   *
   * @param panelId - The panel to focus.
   */
  setActivePane(panelId: string): void {
    this.dispatch({ type: 'SET_ACTIVE_PANE', panelId });
  }

  /**
   * Update a panel's configuration (title, icon, closable, etc.).
   *
   * Only the provided fields are merged; unspecified fields remain unchanged.
   *
   * @param panelId - The panel to update.
   * @param updates - Partial config to merge.
   */
  updatePanel(panelId: string, updates: Partial<PanelConfig>): void {
    this.dispatch({ type: 'UPDATE_PANEL_CONFIG', panelId, config: updates });
  }

  // ── Floating operations ────────────────────────────────────────

  /**
   * Float a panel by removing it from the layout tree and rendering it
   * as a draggable, resizable floating window.
   *
   * @param options - Position and size for the floating window.
   */
  floatPanel(options: FloatPanelOptions): void {
    this.dispatch({
      type: 'FLOAT_PANEL',
      panelId: options.panelId,
      x: options.x ?? 100,
      y: options.y ?? 100,
      width: options.width ?? 400,
      height: options.height ?? 300,
    });
  }

  /**
   * Dock a floating panel back into the layout tree.
   *
   * @param panelId - The floating panel to dock.
   * @param targetGroupId - The tab group to dock into. Defaults to `'default'` (first group).
   * @param position - Where to place it relative to the target. Defaults to `'center'`.
   */
  dockFloatingPanel(panelId: string, targetGroupId?: string, position: DockPosition = 'center'): void {
    const panel = this.getState().panels.get(panelId);
    if (panel?.dockable === false) return;
    this.dispatch({
      type: 'DOCK_FLOATING',
      panelId,
      targetGroupId: targetGroupId || 'default',
      position,
    });
  }

  /**
   * Update a floating panel's position and/or size.
   *
   * @param panelId - The floating panel to update.
   * @param updates - Partial position/size values to merge.
   */
  updateFloatingPanel(panelId: string, updates: { x?: number; y?: number; width?: number; height?: number }): void {
    this.dispatch({ type: 'UPDATE_FLOATING', panelId, ...updates });
  }

  /**
   * Bring a floating panel to the front by assigning it the highest z-index.
   *
   * @param panelId - The floating panel to bring forward.
   */
  bringToFront(panelId: string): void {
    this.dispatch({ type: 'BRING_TO_FRONT', panelId });
  }

  // ── Maximize/restore ───────────────────────────────────────────

  /**
   * Maximize a panel so it occupies the full container space.
   *
   * @param panelId - The panel to maximize.
   */
  maximizePanel(panelId: string): void {
    this.dispatch({ type: 'MAXIMIZE_PANEL', panelId });
  }

  /** Restore the maximized panel to its original position */
  restorePanel(): void {
    this.dispatch({ type: 'RESTORE_PANEL', panelId: '' });
  }

  /**
   * Toggle maximize state for a panel. Maximizes if not already maximized,
   * restores if it is.
   *
   * @param panelId - The panel to toggle.
   */
  toggleMaximize(panelId: string): void {
    if (this.getState().maximizedPanelId === panelId) {
      this.restorePanel();
    } else {
      this.maximizePanel(panelId);
    }
  }

  // ── Navigation ─────────────────────────────────────────────────

  /** Navigate to the next panel (Ctrl+Tab behavior) */
  navigateNext(): void {
    this.dispatch({ type: 'NAVIGATE', direction: 'next' });
  }

  /** Navigate to the previous panel (Ctrl+Shift+Tab behavior) */
  navigatePrevious(): void {
    this.dispatch({ type: 'NAVIGATE', direction: 'previous' });
  }

  // ── Layout operations ──────────────────────────────────────────

  /**
   * Resize the children of a split node.
   *
   * @param splitId - The split node to resize.
   * @param sizes - New size percentages for each child. Must sum to 100.
   */
  resizeSplit(splitId: string, sizes: number[]): void {
    this.dispatch({ type: 'RESIZE_SPLIT', splitId, sizes });
  }

  /**
   * Set the header (tab bar) position for a tab group.
   *
   * @param groupId - The tab group to update.
   * @param position - The new header position, or `undefined` to reset to default.
   */
  setHeaderPosition(groupId: string, position: HeaderPosition | undefined): void {
    this.dispatch({ type: 'SET_HEADER_POSITION', groupId, position });
  }

  /**
   * Lock or unlock a tab group. Locked groups reject drops, prevent their
   * panels from being dragged out / floated / closed, and hide tab close buttons.
   *
   * @param groupId - The tab group to lock/unlock.
   * @param locked - `true` to lock, `false` to unlock.
   */
  setTabGroupLocked(groupId: string, locked: boolean): void {
    this.dispatch({ type: 'SET_TAB_GROUP_LOCKED', groupId, locked });
  }

  // ── Unpinned panels ────────────────────────────────────────────

  /**
   * Unpin a panel, removing it from the layout tree and displaying it
   * as an auto-hide strip along the nearest edge.
   *
   * @param panelId - The panel to unpin.
   */
  unpinPanel(panelId: string): void {
    this.dispatch({ type: 'UNPIN_PANEL', panelId });
  }

  /**
   * Pin an unpinned panel back into the layout tree as a tab in the first group.
   *
   * @param panelId - The unpinned panel to restore.
   */
  pinPanel(panelId: string): void {
    this.dispatch({ type: 'PIN_PANEL', panelId });
  }

  // ── State management ───────────────────────────────────────────

  /**
   * Replace the entire dock manager state (e.g., to restore a serialized layout).
   *
   * The state is validated and repaired before being applied.
   *
   * @param state - The complete state to load.
   */
  loadState(state: DockManagerState): void {
    this.dispatch({ type: 'LOAD_STATE', state });
  }

  /** Close all panels */
  closeAllPanels(): void {
    const panelIds = this.getAllPanelIds();
    for (const id of panelIds) {
      this.dispatch({ type: 'CLOSE_PANEL', panelId: id });
    }
  }

  // ── Undo / Redo ─────────────────────────────────────────────────

  /** Undo the last state change. */
  undo(): void {
    this._onUndo?.();
  }

  /** Redo a previously undone state change. */
  redo(): void {
    this._onRedo?.();
  }

  // ── Layout Presets ──────────────────────────────────────────────

  private presets = new Map<string, { name: string; state: DockManagerState }>();

  /** Reset layout to a given default state. */
  resetLayout(defaultState: DockManagerState): void {
    this.dispatch({ type: 'LOAD_STATE', state: defaultState });
  }

  /** Save the current state as a named preset. Returns the preset object. */
  savePreset(name: string): { name: string; state: DockManagerState } {
    const preset = { name, state: structuredClone(this.getState()) };
    this.presets.set(name, preset);
    return preset;
  }

  /** Load a previously saved preset. */
  loadPreset(preset: { name: string; state: DockManagerState }): void {
    this.dispatch({ type: 'LOAD_STATE', state: preset.state });
  }

  /** Get all saved presets. */
  getPresets(): { name: string; state: DockManagerState }[] {
    return Array.from(this.presets.values());
  }

  // ── Floating operations (extended) ────────────────────────────

  /** Dock all floating panels back into the layout. */
  dockAllFloating(): void {
    const state = this.getState();
    const floatingPanelIds: string[] = [];
    for (const [panelId, placement] of state.placements) {
      if (placement.type === 'floating') {
        floatingPanelIds.push(panelId);
      }
    }
    for (const panelId of floatingPanelIds) {
      this.dispatch({
        type: 'DOCK_FLOATING',
        panelId,
        targetGroupId: 'default',
        position: 'center',
      });
    }
  }

  // ── Persistence (URL) ─────────────────────────────────────────

  /** Export the current state as a base64 URL-safe string. */
  exportAsUrl(): string {
    const json = JSON.stringify(serialize(this.getState()));
    if (typeof btoa === 'function') {
      return btoa(unescape(encodeURIComponent(json)));
    }
    return Buffer.from(json, 'utf-8').toString('base64');
  }

  /** Import state from a base64 URL-safe string. */
  importFromUrl(urlString: string): void {
    let json: string;
    if (typeof atob === 'function') {
      json = decodeURIComponent(escape(atob(urlString)));
    } else {
      json = Buffer.from(urlString, 'base64').toString('utf-8');
    }
    const state = deserialize(JSON.parse(json));
    this.dispatch({ type: 'LOAD_STATE', state });
  }

  // ── Developer Experience ──────────────────────────────────────

  private _debugMode = false;
  private _debugOverlayHandler: ((enabled: boolean) => void) | null = null;

  /** Enable/disable debug overlay showing group IDs, panel IDs, split ratios. */
  setDebugMode(enabled: boolean): void {
    this._debugMode = enabled;
    this._debugOverlayHandler?.(enabled);
  }

  /** @internal Set the debug overlay handler (called by DockviewComponent). */
  _setDebugOverlayHandler(handler: (enabled: boolean) => void): void {
    this._debugOverlayHandler = handler;
  }

  /** Whether debug mode is currently enabled. */
  get debugMode(): boolean {
    return this._debugMode;
  }
}
