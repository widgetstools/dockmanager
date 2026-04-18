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

export interface AddPanelOptions {
  id?: string;
  panelId?: string;
  title: string;
  icon?: string;
  closable?: boolean;
  floatable?: boolean;
  dockable?: boolean;
  tabComponent?: string;
  widgetType?: string;
  widgetProps?: Record<string, unknown>;
  targetGroupId?: string;
  position?: DockPosition;
}

export interface FloatPanelOptions {
  panelId: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface MovePanelOptions {
  panelId: string;
  targetGroupId: string;
  position: DockPosition;
}

// ─── API ──────────────────────────────────────────────────────────────

export class DockviewApi {
  constructor(
    private readonly getState: () => DockManagerState,
    private readonly dispatch: (action: DockAction) => void,
    private readonly _onUndo?: () => void,
    private readonly _onRedo?: () => void,
  ) {}

  // ── State queries ──────────────────────────────────────────────

  get state(): Readonly<DockManagerState> { return this.getState(); }
  get activePanelId(): string { return this.getState().activePaneId; }
  get maximizedPanelId(): string | undefined { return this.getState().maximizedPanelId; }
  get panelCount(): number { return this.getState().panels.size; }
  get layout(): LayoutNode { return this.getState().layout; }

  getPanel(panelId: string): PanelConfig | undefined { return this.getState().panels.get(panelId); }
  getLayoutPanelIds(): string[] { return collectAllPanelsOrdered(this.getState().layout); }
  getAllPanelIds(): string[] { return Array.from(this.getState().panels.keys()); }
  hasPanel(panelId: string): boolean { return this.getState().panels.has(panelId); }
  isPanelPlaced(panelId: string): boolean { return this.getState().placements.has(panelId); }
  getGroupForPanel(panelId: string): string | null { return findTabGroupForPanel(this.getState().layout, panelId); }
  getGroup(groupId: string): TabGroupNode | null { return findTabGroupById(this.getState().layout, groupId); }
  getAllGroups(): TabGroupNode[] { return findAllTabGroups(this.getState().layout); }
  isFloating(panelId: string): boolean { return this.getState().placements.get(panelId)?.type === 'floating'; }
  isActive(panelId: string): boolean { return this.getState().activePaneId === panelId; }
  isMaximized(panelId: string): boolean { return this.getState().maximizedPanelId === panelId; }

  getFloatingPanels(): readonly FloatingPanel[] {
    const result: FloatingPanel[] = [];
    for (const [panelId, placement] of this.getState().placements) {
      if (placement.type === 'floating') {
        result.push({
          panelId,
          x: placement.x, y: placement.y,
          width: placement.width, height: placement.height,
          zIndex: placement.zIndex,
          sourceTabGroupId: placement.sourceGroupId,
        });
      }
    }
    return result;
  }

  // ── Panel operations ───────────────────────────────────────────

  addPanel(options: AddPanelOptions): void {
    const panelId = options.panelId || options.id;
    if (!panelId) { console.error('[DockviewApi] addPanel requires id or panelId'); return; }
    const { title, icon, closable, floatable, dockable, tabComponent, widgetType, widgetProps, targetGroupId, position } = options;
    this.dispatch({
      type: 'ADD_PANEL', panelId,
      config: { id: panelId, title, icon, closable, floatable, dockable, tabComponent, widgetType, widgetProps } as PanelConfig,
      target: targetGroupId, position,
    });
  }

  closePanel(panelId: string): void { this.dispatch({ type: 'CLOSE_PANEL', panelId }); }

  movePanel(options: MovePanelOptions): void {
    this.dispatch({ type: 'MOVE_PANEL', panelId: options.panelId, targetGroupId: options.targetGroupId, position: options.position });
  }

  setActivePanel(groupId: string, panelId: string): void { this.dispatch({ type: 'SET_ACTIVE_PANEL', groupId, panelId }); }
  setActivePane(panelId: string): void { this.dispatch({ type: 'SET_ACTIVE_PANE', panelId }); }

  updatePanel(panelId: string, updates: Partial<PanelConfig>): void {
    this.dispatch({ type: 'UPDATE_PANEL_CONFIG', panelId, config: updates });
  }

  // ── Floating operations ────────────────────────────────────────

  floatPanel(options: FloatPanelOptions): void {
    this.dispatch({
      type: 'FLOAT_PANEL', panelId: options.panelId,
      x: options.x ?? 100, y: options.y ?? 100,
      width: options.width ?? 400, height: options.height ?? 300,
    });
  }

  dockFloatingPanel(panelId: string, targetGroupId?: string, position: DockPosition = 'center'): void {
    if (this.getState().panels.get(panelId)?.dockable === false) return;
    this.dispatch({ type: 'DOCK_FLOATING', panelId, targetGroupId: targetGroupId || 'default', position });
  }

  updateFloatingPanel(panelId: string, updates: { x?: number; y?: number; width?: number; height?: number }): void {
    this.dispatch({ type: 'UPDATE_FLOATING', panelId, ...updates });
  }

  bringToFront(panelId: string): void { this.dispatch({ type: 'BRING_TO_FRONT', panelId }); }

  // ── Maximize/restore ───────────────────────────────────────────

  maximizePanel(panelId: string): void { this.dispatch({ type: 'MAXIMIZE_PANEL', panelId }); }
  restorePanel(): void { this.dispatch({ type: 'RESTORE_PANEL', panelId: '' }); }

  toggleMaximize(panelId: string): void {
    this.getState().maximizedPanelId === panelId ? this.restorePanel() : this.maximizePanel(panelId);
  }

  // ── Navigation ─────────────────────────────────────────────────

  navigateNext(): void { this.dispatch({ type: 'NAVIGATE', direction: 'next' }); }
  navigatePrevious(): void { this.dispatch({ type: 'NAVIGATE', direction: 'previous' }); }

  // ── Layout operations ──────────────────────────────────────────

  resizeSplit(splitId: string, sizes: number[]): void { this.dispatch({ type: 'RESIZE_SPLIT', splitId, sizes }); }

  setHeaderPosition(groupId: string, position: HeaderPosition | undefined): void {
    this.dispatch({ type: 'SET_HEADER_POSITION', groupId, position });
  }

  setTabGroupLocked(groupId: string, locked: boolean): void {
    this.dispatch({ type: 'SET_TAB_GROUP_LOCKED', groupId, locked });
  }

  // ── Unpinned panels ────────────────────────────────────────────

  unpinPanel(panelId: string): void { this.dispatch({ type: 'UNPIN_PANEL', panelId }); }
  pinPanel(panelId: string): void { this.dispatch({ type: 'PIN_PANEL', panelId }); }

  // ── State management ───────────────────────────────────────────

  loadState(state: DockManagerState): void { this.dispatch({ type: 'LOAD_STATE', state }); }

  closeAllPanels(): void {
    for (const id of this.getAllPanelIds()) this.dispatch({ type: 'CLOSE_PANEL', panelId: id });
  }

  // ── Undo / Redo ─────────────────────────────────────────────────

  undo(): void { this._onUndo?.(); }
  redo(): void { this._onRedo?.(); }

  // ── Layout Presets ──────────────────────────────────────────────

  private presets = new Map<string, { name: string; state: DockManagerState }>();

  resetLayout(defaultState: DockManagerState): void { this.dispatch({ type: 'LOAD_STATE', state: defaultState }); }

  savePreset(name: string): { name: string; state: DockManagerState } {
    const preset = { name, state: structuredClone(this.getState()) };
    this.presets.set(name, preset);
    return preset;
  }

  loadPreset(preset: { name: string; state: DockManagerState }): void {
    this.dispatch({ type: 'LOAD_STATE', state: preset.state });
  }

  getPresets(): { name: string; state: DockManagerState }[] { return Array.from(this.presets.values()); }

  // ── Floating operations (extended) ────────────────────────────

  dockAllFloating(): void {
    const floatingIds: string[] = [];
    for (const [panelId, placement] of this.getState().placements) {
      if (placement.type === 'floating') floatingIds.push(panelId);
    }
    for (const panelId of floatingIds) {
      this.dispatch({ type: 'DOCK_FLOATING', panelId, targetGroupId: 'default', position: 'center' });
    }
  }

  // ── Persistence (URL) ─────────────────────────────────────────

  exportAsUrl(): string {
    const json = serialize(this.getState());
    return typeof btoa === 'function'
      ? btoa(unescape(encodeURIComponent(json)))
      : Buffer.from(json, 'utf-8').toString('base64');
  }

  importFromUrl(urlString: string): void {
    const json = typeof atob === 'function'
      ? decodeURIComponent(escape(atob(urlString)))
      : Buffer.from(urlString, 'base64').toString('utf-8');
    this.dispatch({ type: 'LOAD_STATE', state: deserialize(json).state });
  }

  // ── Developer Experience ──────────────────────────────────────

  private _debugMode = false;
  private _debugOverlayHandler: ((enabled: boolean) => void) | null = null;

  setDebugMode(enabled: boolean): void {
    this._debugMode = enabled;
    this._debugOverlayHandler?.(enabled);
  }

  /** @internal */
  _setDebugOverlayHandler(handler: (enabled: boolean) => void): void { this._debugOverlayHandler = handler; }

  get debugMode(): boolean { return this._debugMode; }
}
