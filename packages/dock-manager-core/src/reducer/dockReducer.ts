import type {
  DockManagerState, DockPosition, DockEdge, PanelConfig,
  HeaderPosition, LayoutNode, TabGroupNode, Placement,
} from '../types/dock';
import {
  LayoutTree, findTabGroupForPanel, findFirstTabGroup, collectAllPanelsOrdered,
  findNextPanel, findPreviousPanel, detectPanelEdge, insertAtEdge, genId,
} from '../layout/LayoutTree';

export type DockAction =
  | { type: 'ADD_PANEL'; panelId: string; config: PanelConfig; target?: string; position?: DockPosition }
  | { type: 'CLOSE_PANEL'; panelId: string }
  | { type: 'MOVE_PANEL'; panelId: string; targetGroupId: string; position: DockPosition }
  | { type: 'FLOAT_PANEL'; panelId: string; x: number; y: number; width: number; height: number }
  | { type: 'DOCK_FLOATING'; panelId: string; targetGroupId: string; position: DockPosition }
  | { type: 'UPDATE_FLOATING'; panelId: string; x?: number; y?: number; width?: number; height?: number }
  | { type: 'UNPIN_PANEL'; panelId: string }
  | { type: 'PIN_PANEL'; panelId: string }
  | { type: 'POPOUT_PANEL'; panelId: string; windowName: string; x: number; y: number; width: number; height: number }
  | { type: 'DOCK_POPOUT'; panelId: string; targetGroupId: string; position: DockPosition }
  | { type: 'SET_ACTIVE_PANEL'; groupId: string; panelId: string }
  | { type: 'MAXIMIZE_PANEL'; panelId: string }
  | { type: 'RESTORE_PANEL'; panelId: string }
  | { type: 'RESIZE_SPLIT'; splitId: string; sizes: number[] }
  | { type: 'REORDER_TABS'; groupId: string; panels: string[] }
  | { type: 'DOCK_TO_EDGE'; panelId: string; edge: DockEdge }
  | { type: 'LOAD_STATE'; state: DockManagerState }
  | { type: 'SET_ACTIVE_PANE'; panelId: string }
  | { type: 'UPDATE_PANEL_CONFIG'; panelId: string; config: Partial<PanelConfig> }
  | { type: 'SET_HEADER_POSITION'; groupId: string; position: HeaderPosition | undefined }
  | { type: 'SET_HEADER_COLLAPSED'; groupId: string; collapsed: boolean }
  | { type: 'SET_TAB_GROUP_LOCKED'; groupId: string; locked: boolean }
  | { type: 'NAVIGATE'; direction: 'next' | 'previous' }
  | { type: 'ACTIVATE_OVERFLOW_TAB'; groupId: string; panelId: string }
  | { type: 'BRING_TO_FRONT'; panelId: string }
  | { type: 'RESIZE_UNPINNED'; panelId: string; size: number }
  | { type: 'UPDATE_POPOUT'; panelId: string; x?: number; y?: number; width?: number; height?: number };

// ─── Helpers ────────────────────────────────────────────────────────
const tree = (layout: LayoutNode) => new LayoutTree(layout);
const safeRemove = (layout: LayoutNode, id: string) => tree(layout).removePanel(id).root;
const newRoot = (panelId: string): LayoutNode => ({ type: 'tabgroup', id: genId(), panels: [panelId], activePanel: panelId });

function pickActive(removedId: string, currentId: string, layout: LayoutNode, placements: Map<string, Placement>): string {
  if (currentId !== removedId) return currentId;
  const lp = collectAllPanelsOrdered(layout);
  if (lp.length > 0) return lp[0];
  for (const [pid, p] of placements) { if (p.type === 'floating') return pid; }
  return '';
}

function clonePlacements(p: Map<string, Placement>, id: string, val: Placement): Map<string, Placement> {
  const m = new Map(p); m.set(id, val); return m;
}

function resolveGroup(t: LayoutTree, layout: LayoutNode, groupId?: string | null): TabGroupNode | null {
  if (groupId) { const g = t.findGroup(groupId); if (g) return g; }
  const fid = findFirstTabGroup(layout);
  return fid ? t.findGroup(fid) : null;
}

function insertOrCreate(t: LayoutTree, target: TabGroupNode | null, panelId: string, pos: DockPosition = 'center'): LayoutTree {
  return target ? t.insertPanel(target, panelId, pos) : new LayoutTree(newRoot(panelId));
}

function setDocked(placements: Map<string, Placement>, root: LayoutNode, panelId: string): Map<string, Placement> {
  const grp = tree(root).groupForPanel(panelId);
  return clonePlacements(placements, panelId, { type: 'docked', groupId: grp?.id || '' });
}

function withActive(state: DockManagerState, groupId: string, panelId: string): DockManagerState {
  return { ...state, layout: tree(state.layout).setActivePanel(groupId, panelId).root, activePaneId: panelId };
}

function updateGroup(state: DockManagerState, groupId: string, props: Record<string, unknown>): DockManagerState {
  const t = tree(state.layout);
  return t.findGroup(groupId) ? { ...state, layout: t.updateGroup(groupId, props).root } : state;
}

function getPlacement<T extends Placement['type']>(state: DockManagerState, panelId: string, type: T) {
  const p = state.placements.get(panelId);
  return p?.type === type ? p as Extract<Placement, { type: T }> : null;
}

function bumpZ(state: DockManagerState, panelId: string, patch: Partial<Placement>): DockManagerState {
  const p = state.placements.get(panelId)!;
  return { ...state, placements: clonePlacements(state.placements, panelId, { ...p, ...patch, zIndex: state.nextZIndex } as Placement), nextZIndex: state.nextZIndex + 1 };
}

// ─── Reducer ────────────────────────────────────────────────────────
export function dockReducer(state: DockManagerState, action: DockAction): DockManagerState {
  switch (action.type) {
    case 'ADD_PANEL': {
      const { panelId, config, target, position } = action;
      if (state.panels.has(panelId)) return state;
      const panels = new Map(state.panels); panels.set(panelId, config);
      const t = tree(state.layout), resolved = resolveGroup(t, state.layout, target);
      let nt: LayoutTree;
      if (resolved) {
        nt = t.insertPanel(resolved, panelId, position || 'center');
        if (resolved.headerCollapsed) nt = nt.updateGroup(resolved.id, { headerCollapsed: undefined });
      } else nt = new LayoutTree(newRoot(panelId));
      return { ...state, panels, layout: nt.root, placements: setDocked(state.placements, nt.root, panelId), activePaneId: panelId };
    }
    case 'CLOSE_PANEL': {
      const { panelId } = action;
      if (!state.panels.has(panelId)) return state;
      if (tree(state.layout).groupForPanel(panelId)?.locked) return state;
      const layout = safeRemove(state.layout, panelId);
      const panels = new Map(state.panels); panels.delete(panelId);
      const placements = new Map(state.placements); placements.delete(panelId);
      return { ...state, layout, panels, placements, maximizedPanelId: state.maximizedPanelId === panelId ? undefined : state.maximizedPanelId, activePaneId: pickActive(panelId, state.activePaneId, layout, placements) };
    }
    case 'MOVE_PANEL': {
      const { panelId, targetGroupId, position } = action;
      if (!state.panels.has(panelId)) return state;
      const t = tree(state.layout), tg = t.findGroup(targetGroupId);
      if (!tg) return state;
      const sg = t.groupForPanel(panelId);
      if (sg?.id === targetGroupId && (position === 'center' || sg.panels.length === 1)) return state;
      if (tg.locked && sg?.id !== targetGroupId) return state;
      if (sg?.locked && sg.id !== targetGroupId) return state;
      if (tg.headerCollapsed) return state;
      const cfg = state.panels.get(panelId);
      if (cfg?.documentOnly && position === 'center' && !tg.panels.some(pid => state.panels.get(pid)?.documentOnly)) return state;
      const nt = t.movePanel(panelId, tg, position);
      const ng = tree(nt.root).groupForPanel(panelId);
      return { ...state, layout: nt.root, placements: clonePlacements(state.placements, panelId, { type: 'docked', groupId: ng?.id || targetGroupId }), activePaneId: panelId };
    }
    case 'FLOAT_PANEL': {
      const { panelId, x, y, width, height } = action;
      if (!state.panels.has(panelId)) return state;
      const sg = tree(state.layout).groupForPanel(panelId);
      if (sg?.locked) return state;
      const layout = safeRemove(state.layout, panelId);
      return { ...state, layout, placements: clonePlacements(state.placements, panelId, { type: 'floating', x, y, width, height, zIndex: state.nextZIndex, sourceGroupId: sg?.id }), nextZIndex: state.nextZIndex + 1, activePaneId: panelId };
    }
    case 'DOCK_FLOATING': {
      const { panelId, targetGroupId, position } = action;
      const pl = getPlacement(state, panelId, 'floating');
      if (!pl) return state;
      if (state.panels.get(panelId)?.dockable === false) return state;
      const t = tree(state.layout);
      let tg = targetGroupId ? t.findGroup(targetGroupId) : null;
      if (!tg && pl.sourceGroupId) tg = t.findGroup(pl.sourceGroupId);
      if (!tg) tg = resolveGroup(t, state.layout);
      if (tg?.headerCollapsed) return state;
      const nt = insertOrCreate(t, tg, panelId, position || 'center');
      return { ...state, layout: nt.root, placements: setDocked(state.placements, nt.root, panelId), activePaneId: panelId };
    }
    case 'UPDATE_FLOATING': {
      const { panelId, ...u } = action;
      if (!getPlacement(state, panelId, 'floating')) return state;
      return bumpZ(state, panelId, { ...u, type: 'floating' });
    }
    case 'UNPIN_PANEL': {
      const { panelId } = action;
      if (!state.panels.has(panelId)) return state;
      const t = tree(state.layout), sg = t.groupForPanel(panelId);
      if (sg?.locked) return state;
      const edge = detectPanelEdge(state.layout, panelId), layout = safeRemove(state.layout, panelId);
      const placements = clonePlacements(state.placements, panelId, { type: 'unpinned', edge, size: 200, sourceGroupId: sg?.id });
      return { ...state, layout, placements, activePaneId: pickActive(panelId, state.activePaneId, layout, placements) };
    }
    case 'PIN_PANEL': {
      const { panelId } = action;
      const pl = getPlacement(state, panelId, 'unpinned');
      if (!pl) return state;
      const t = tree(state.layout), sg = pl.sourceGroupId ? t.findGroup(pl.sourceGroupId) : null;
      const nt = sg ? t.insertPanel(sg, panelId, 'center') : new LayoutTree(insertAtEdge(state.layout, panelId, pl.edge || 'left'));
      return { ...state, layout: nt.root, placements: setDocked(state.placements, nt.root, panelId), activePaneId: panelId };
    }
    case 'POPOUT_PANEL': {
      const { panelId, windowName, x, y, width, height } = action;
      if (!state.panels.has(panelId)) return state;
      return { ...state, layout: safeRemove(state.layout, panelId), placements: clonePlacements(state.placements, panelId, { type: 'popout', windowName, x, y, width, height }) };
    }
    case 'DOCK_POPOUT': {
      const { panelId, targetGroupId, position } = action;
      if (!getPlacement(state, panelId, 'popout')) return state;
      const t = tree(state.layout), tg = resolveGroup(t, state.layout, targetGroupId);
      const nt = insertOrCreate(t, tg, panelId, position || 'center');
      return { ...state, layout: nt.root, placements: setDocked(state.placements, nt.root, panelId), activePaneId: panelId };
    }
    case 'SET_ACTIVE_PANEL':
    case 'ACTIVATE_OVERFLOW_TAB': {
      const { groupId, panelId } = action;
      const g = tree(state.layout).findGroup(groupId);
      if (!g || !g.panels.includes(panelId)) return state;
      return withActive(state, groupId, panelId);
    }
    case 'MAXIMIZE_PANEL':
      return state.panels.has(action.panelId) ? { ...state, maximizedPanelId: action.panelId, activePaneId: action.panelId } : state;
    case 'RESTORE_PANEL':
      return { ...state, maximizedPanelId: undefined };
    case 'RESIZE_SPLIT': {
      const t = tree(state.layout), s = t.findSplit(action.splitId);
      return s ? { ...state, layout: t.resizeSplit(s, action.sizes).root } : state;
    }
    case 'REORDER_TABS': {
      const { groupId, panels } = action;
      const t = tree(state.layout), g = t.findGroup(groupId);
      if (!g) return state;
      if (g.panels.length === panels.length && g.panels.every((p, i) => p === panels[i])) return state;
      return { ...state, layout: t.reorderTabs(g, panels).root };
    }
    case 'DOCK_TO_EDGE': {
      const { panelId, edge } = action;
      if (!state.panels.has(panelId)) return state;
      const nl = insertAtEdge(safeRemove(state.layout, panelId), panelId, edge);
      return { ...state, layout: nl, placements: setDocked(state.placements, nl, panelId), activePaneId: panelId };
    }
    case 'LOAD_STATE':
      return action.state;
    case 'SET_ACTIVE_PANE': {
      const { panelId } = action;
      if (!state.panels.has(panelId)) return state;
      const gid = findTabGroupForPanel(state.layout, panelId);
      return gid ? withActive(state, gid, panelId) : { ...state, activePaneId: panelId };
    }
    case 'UPDATE_PANEL_CONFIG': {
      const { panelId, config } = action;
      if (!state.panels.has(panelId)) return state;
      const panels = new Map(state.panels); panels.set(panelId, { ...panels.get(panelId)!, ...config });
      return { ...state, panels };
    }
    case 'SET_HEADER_POSITION':
      return updateGroup(state, action.groupId, { headerPosition: action.position });
    case 'SET_HEADER_COLLAPSED':
      return updateGroup(state, action.groupId, { headerCollapsed: action.collapsed || undefined });
    case 'SET_TAB_GROUP_LOCKED':
      return updateGroup(state, action.groupId, { locked: action.locked || undefined });
    case 'NAVIGATE': {
      if (!state.activePaneId) return state;
      const nid = action.direction === 'next' ? findNextPanel(state.layout, state.activePaneId) : findPreviousPanel(state.layout, state.activePaneId);
      if (!nid || nid === state.activePaneId) return state;
      const gid = findTabGroupForPanel(state.layout, nid);
      return gid ? withActive(state, gid, nid) : state;
    }
    case 'BRING_TO_FRONT': {
      if (!getPlacement(state, action.panelId, 'floating')) return state;
      return { ...bumpZ(state, action.panelId, {}), activePaneId: action.panelId };
    }
    case 'RESIZE_UNPINNED': {
      const pl = getPlacement(state, action.panelId, 'unpinned');
      return pl ? { ...state, placements: clonePlacements(state.placements, action.panelId, { ...pl, size: action.size }) } : state;
    }
    case 'UPDATE_POPOUT': {
      const { panelId, ...u } = action;
      const pl = getPlacement(state, panelId, 'popout');
      return pl ? { ...state, placements: clonePlacements(state.placements, panelId, { ...pl, ...u, type: 'popout' }) } : state;
    }
    default:
      return state;
  }
}

// ─── State validation ───────────────────────────────────────────────
export function validateState(state: DockManagerState): Array<{ kind: string; detail: string }> {
  const errors: Array<{ kind: string; detail: string }> = [];
  const err = (kind: string, detail: string) => errors.push({ kind, detail });
  if (!state.layout) err('missing_layout', 'State has no layout tree');
  if (!(state.panels instanceof Map)) err('invalid_panels', 'panels must be a Map');
  if (!(state.placements instanceof Map)) err('invalid_placements', 'placements must be a Map');
  if (typeof state.nextZIndex !== 'number' || state.nextZIndex < 0) err('invalid_zindex', `nextZIndex is ${state.nextZIndex}`);
  if (state.panels instanceof Map && state.placements instanceof Map) {
    for (const id of state.panels.keys()) if (!state.placements.has(id)) err('orphan_panel', `Panel "${id}" has no placement`);
    for (const id of state.placements.keys()) if (!state.panels.has(id)) err('stale_placement', `Placement for "${id}" has no panel config`);
  }
  if (state.layout && state.placements instanceof Map)
    for (const [id, p] of state.placements)
      if (p.type === 'docked' && !findTabGroupForPanel(state.layout, id)) err('docked_not_in_layout', `Panel "${id}" is docked but not in layout tree`);
  if (state.maximizedPanelId && state.panels instanceof Map && !state.panels.has(state.maximizedPanelId))
    err('invalid_maximized', `maximizedPanelId "${state.maximizedPanelId}" not in panels`);
  return errors;
}

// ─── Default state factory ──────────────────────────────────────────
export function createDefaultState(): DockManagerState {
  return {
    layout: { type: 'tabgroup', id: genId(), panels: [], activePanel: '' },
    panels: new Map(), placements: new Map(), activePaneId: '', nextZIndex: 1,
  };
}
