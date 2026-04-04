/**
 * Dock Manager Reducer
 *
 * Pure reducer function for immutable state management.
 * Uses LayoutTree module for all tree operations.
 */

import type {
  DockManagerState,
  DockPosition,
  PanelConfig,
  HeaderPosition,
  PopoutPanel,
} from '../types/dock';
import {
  removePanel,
  insertInGroup,
  insertBySplit,
  insertAtEdge,
  movePanel,
  findFirstTabGroup,
  findTabGroupById,
  findTabGroupForPanel,
  findTabGroupByEdge,
  setActivePanel,
  updateSizes,
  updateTabGroup,
  reorderPanelToFront,
  detectPanelEdge,
  collectAllPanelsOrdered,
  findNextPanel,
  findPreviousPanel,
  genId,
} from '../layout/LayoutTree';

// ─── Action types ────────────────────────────────────────────────────

export type DockAction =
  | { type: 'ADD_PANEL'; payload: { panelId: string; title: string; icon?: string; closable?: boolean; floatable?: boolean; dockable?: boolean; tabComponent?: string; widgetType?: string; widgetProps?: Record<string, unknown> } }
  | { type: 'MOVE_PANEL'; payload: { panelId: string; targetTabGroupId: string; position: DockPosition } }
  | { type: 'CLOSE_PANEL'; payload: { panelId: string } }
  | { type: 'FLOAT_PANEL'; payload: { panelId: string; x: number; y: number; width: number; height: number } }
  | { type: 'DOCK_FLOATING'; payload: { panelId: string; targetTabGroupId: string; position: DockPosition } }
  | { type: 'UPDATE_FLOATING'; payload: { panelId: string; x?: number; y?: number; width?: number; height?: number } }
  | { type: 'SET_ACTIVE_PANEL'; payload: { tabGroupId: string; panelId: string } }
  | { type: 'RESIZE_SPLIT'; payload: { splitId: string; sizes: number[] } }
  | { type: 'BRING_TO_FRONT'; payload: { panelId: string } }
  | { type: 'UNPIN_PANEL'; payload: { panelId: string } }
  | { type: 'PIN_PANEL'; payload: { panelId: string } }
  | { type: 'RESIZE_UNPINNED'; payload: { panelId: string; size: number } }
  | { type: 'LOAD_STATE'; payload: DockManagerState }
  | { type: 'MAXIMIZE_PANEL'; payload: { panelId: string } }
  | { type: 'RESTORE_PANEL'; payload: { panelId: string } }
  | { type: 'SET_ACTIVE_PANE'; payload: { panelId: string } }
  | { type: 'UPDATE_PANEL_CONFIG'; payload: { panelId: string; updates: Partial<PanelConfig> } }
  | { type: 'POPOUT_PANEL'; payload: { panelId: string; windowName: string; x: number; y: number; width: number; height: number } }
  | { type: 'DOCK_POPOUT'; payload: { panelId: string; targetTabGroupId: string; position: DockPosition } }
  | { type: 'UPDATE_POPOUT'; payload: { panelId: string; x?: number; y?: number; width?: number; height?: number } }
  | { type: 'SET_HEADER_POSITION'; payload: { tabGroupId: string; headerPosition: HeaderPosition | undefined } }
  | { type: 'NAVIGATE'; payload: { direction: 'next' | 'previous' } }
  | { type: 'ACTIVATE_OVERFLOW_TAB'; payload: { tabGroupId: string; panelId: string } }
  | { type: 'DOCK_TO_EDGE'; payload: { panelId: string; edge: DockPosition } }
  | { type: 'REORDER_TABS'; payload: { tabGroupId: string; panelId: string; newIndex: number } };

// ─── Helpers ──────────────────────────────────────────────────────────

/** Create a safe empty tab group for when removePanel returns null */
function safeEmptyGroup(): import('../types/dock').TabGroupNode {
  return { type: 'tabgroup', id: genId('tg'), panels: [], activePanel: '' };
}

/** Pick fallback activePaneId when the current one is removed */
function fallbackActive(
  currentId: string,
  removedId: string,
  layout: import('../types/dock').LayoutNode,
  floating: { panelId: string }[],
): string {
  if (currentId !== removedId) return currentId;
  const all = collectAllPanelsOrdered(layout);
  if (all.length > 0) return all[0];
  if (floating.length > 0) return floating[0].panelId;
  return '';
}

/** Remove a panel from all placement arrays (floating, unpinned, popout) */
function removeFromPlacements(state: DockManagerState, panelId: string) {
  return {
    floatingPanels: state.floatingPanels.filter(p => p.panelId !== panelId),
    unpinnedPanels: state.unpinnedPanels.filter(p => p.panelId !== panelId),
    popoutPanels: (state.popoutPanels || []).filter(p => p.panelId !== panelId),
  };
}

// ─── Reducer ─────────────────────────────────────────────────────────

export function dockReducer(state: DockManagerState, action: DockAction): DockManagerState {
  switch (action.type) {

    // ── Panel lifecycle ──────────────────────────────────────────────

    case 'ADD_PANEL': {
      const { panelId } = action.payload;
      if (state.panels[panelId]) return state; // No duplicates

      const panel: PanelConfig = {
        id: panelId,
        title: action.payload.title,
        icon: action.payload.icon,
        closable: action.payload.closable !== false,
        floatable: action.payload.floatable !== false,
        dockable: action.payload.dockable,
        tabComponent: action.payload.tabComponent,
        widgetType: action.payload.widgetType,
        widgetProps: action.payload.widgetProps,
      };

      const targetGroup = findFirstTabGroup(state.layout);
      const layout = targetGroup
        ? insertInGroup(state.layout, targetGroup, panelId)
        : { type: 'tabgroup' as const, id: genId('tg'), panels: [panelId], activePanel: panelId };

      return {
        ...state,
        panels: { ...state.panels, [panelId]: panel },
        layout,
        activePaneId: panelId,
      };
    }

    case 'CLOSE_PANEL': {
      const { panelId } = action.payload;
      const layout = removePanel(state.layout, panelId) ?? safeEmptyGroup();
      const panels = { ...state.panels };
      delete panels[panelId];
      const placements = removeFromPlacements(state, panelId);
      const maximizedPanelId = state.maximizedPanelId === panelId ? undefined : state.maximizedPanelId;
      const activePaneId = fallbackActive(state.activePaneId, panelId, layout, placements.floatingPanels);

      return { ...state, layout, panels, ...placements, maximizedPanelId, activePaneId };
    }

    case 'UPDATE_PANEL_CONFIG': {
      const { panelId, updates } = action.payload;
      if (!state.panels[panelId]) return state;
      return {
        ...state,
        panels: { ...state.panels, [panelId]: { ...state.panels[panelId], ...updates } },
      };
    }

    // ── Move / Drag-drop ─────────────────────────────────────────────

    case 'MOVE_PANEL': {
      const { panelId, targetTabGroupId, position } = action.payload;
      // Check no-op cases before mutating
      const sourceGroup = findTabGroupForPanel(state.layout, panelId);
      if (sourceGroup === targetTabGroupId && position === 'center') return state;
      const targetGroup = findTabGroupById(state.layout, targetTabGroupId);
      if (sourceGroup === targetTabGroupId && targetGroup && targetGroup.panels.length === 1) return state;

      // Document host enforcement: documentOnly panels can only move to document host groups
      const sourcePanel = state.panels[panelId];
      if (sourcePanel?.documentOnly && targetGroup) {
        const isDocHost = targetGroup.panels.some(pid => state.panels[pid]?.documentOnly) ||
          targetTabGroupId === '__root__'; // root docking is always allowed
        if (!isDocHost && position === 'center') {
          return state; // Reject: not a document host group
        }
      }

      const layout = movePanel(state.layout, panelId, targetTabGroupId, position);
      const placements = removeFromPlacements(state, panelId);
      return { ...state, layout, ...placements, activePaneId: panelId };
    }

    // ── Floating panels ──────────────────────────────────────────────

    case 'FLOAT_PANEL': {
      const { panelId, width, height } = action.payload;
      let { x, y } = action.payload;
      // Remember which tab group the panel came from so we can dock it back
      const sourceTabGroupId = findTabGroupForPanel(state.layout, panelId) || undefined;
      const layout = removePanel(state.layout, panelId) ?? safeEmptyGroup();

      // Cascade: offset each new floating window by 20px from the last
      const existingFloating = state.floatingPanels.filter(p => p.panelId !== panelId);
      if (existingFloating.length > 0) {
        const last = existingFloating[existingFloating.length - 1];
        const cascadeX = last.x + 20;
        const cascadeY = last.y + 20;
        // Only use cascade if the requested position matches the default
        if (x === last.x || (Math.abs(x - last.x) < 5)) {
          x = cascadeX;
          y = cascadeY;
        }
      }

      const floatingPanels = [
        ...existingFloating,
        { panelId, x, y, width, height, zIndex: state.nextZIndex, sourceTabGroupId },
      ];
      return { ...state, layout, floatingPanels, nextZIndex: state.nextZIndex + 1, activePaneId: panelId };
    }

    case 'DOCK_FLOATING': {
      const { panelId, targetTabGroupId, position } = action.payload;
      if (state.panels[panelId]?.dockable === false) return state;
      const floatingEntry = state.floatingPanels.find(p => p.panelId === panelId);
      const floatingPanels = state.floatingPanels.filter(p => p.panelId !== panelId);

      // Priority: explicit target > saved source > first available group
      let target = (targetTabGroupId && targetTabGroupId !== 'default')
        ? targetTabGroupId
        : null;

      // If no explicit target, try to dock back to the original tab group
      if (!target && floatingEntry?.sourceTabGroupId) {
        // Verify the source group still exists in the layout
        const sourceExists = findTabGroupById(state.layout, floatingEntry.sourceTabGroupId);
        if (sourceExists) {
          // Insert back into the original group as a tab (center position)
          const layout = insertInGroup(state.layout, floatingEntry.sourceTabGroupId, panelId);
          return { ...state, floatingPanels, layout, activePaneId: panelId };
        }
      }

      // Fallback to first tab group
      if (!target) {
        target = findFirstTabGroup(state.layout);
      }

      const layout = target
        ? (position === 'center'
          ? insertInGroup(state.layout, target, panelId)
          : insertBySplit(state.layout, target, panelId, position))
        : { type: 'tabgroup' as const, id: genId('tg'), panels: [panelId], activePanel: panelId };

      return { ...state, floatingPanels, layout, activePaneId: panelId };
    }

    case 'UPDATE_FLOATING': {
      const { panelId, ...updates } = action.payload;
      return {
        ...state,
        floatingPanels: state.floatingPanels.map(p => p.panelId === panelId ? { ...p, ...updates } : p),
      };
    }

    case 'BRING_TO_FRONT': {
      const { panelId } = action.payload;
      return {
        ...state,
        floatingPanels: state.floatingPanels.map(p =>
          p.panelId === panelId ? { ...p, zIndex: state.nextZIndex } : p,
        ),
        nextZIndex: state.nextZIndex + 1,
        activePaneId: panelId,
      };
    }

    // ── Pin / Unpin ──────────────────────────────────────────────────

    case 'UNPIN_PANEL': {
      const { panelId } = action.payload;
      const edge = detectPanelEdge(state.layout, panelId);
      const sourceTabGroupId = findTabGroupForPanel(state.layout, panelId) || undefined;
      const layout = removePanel(state.layout, panelId) ?? safeEmptyGroup();
      const unpinnedPanels = [
        ...state.unpinnedPanels.filter(p => p.panelId !== panelId),
        { panelId, edge, size: 200, sourceTabGroupId },
      ];
      const activePaneId = fallbackActive(state.activePaneId, panelId, layout, state.floatingPanels);
      return { ...state, layout, unpinnedPanels, activePaneId };
    }

    case 'PIN_PANEL': {
      const { panelId } = action.payload;
      const entry = state.unpinnedPanels.find(p => p.panelId === panelId);
      const unpinnedPanels = state.unpinnedPanels.filter(p => p.panelId !== panelId);

      // Remove from layout first (prevent duplicates)
      let layout: import('../types/dock').LayoutNode = removePanel(state.layout, panelId) ?? safeEmptyGroup();
      const edge = entry?.edge || 'left';
      const sourceId = entry?.sourceTabGroupId;

      // Strategy 1: Restore to original tab group if it still exists
      if (sourceId && findTabGroupById(layout, sourceId)) {
        layout = insertInGroup(layout, sourceId, panelId);
      }
      // Strategy 2: Insert at the stored root-level edge
      else {
        layout = insertAtEdge(layout, panelId, edge);
      }

      return { ...state, unpinnedPanels, layout, activePaneId: panelId };
    }

    case 'RESIZE_UNPINNED': {
      const { panelId, size } = action.payload;
      const unpinnedPanels = state.unpinnedPanels.map(p =>
        p.panelId === panelId ? { ...p, size } : p,
      );
      return { ...state, unpinnedPanels };
    }

    // ── Popout windows ───────────────────────────────────────────────

    case 'POPOUT_PANEL': {
      const { panelId, windowName, x, y, width, height } = action.payload;
      const layout = removePanel(state.layout, panelId) ?? safeEmptyGroup();
      const floatingPanels = state.floatingPanels.filter(p => p.panelId !== panelId);
      const popout: PopoutPanel = { panelId, windowName, x, y, width, height };
      return {
        ...state,
        layout,
        floatingPanels,
        popoutPanels: [...(state.popoutPanels || []), popout],
      };
    }

    case 'DOCK_POPOUT': {
      const { panelId, targetTabGroupId, position } = action.payload;
      const popoutPanels = (state.popoutPanels || []).filter(p => p.panelId !== panelId);
      const target = (targetTabGroupId && targetTabGroupId !== 'default')
        ? targetTabGroupId
        : findFirstTabGroup(state.layout);

      const layout = target
        ? insertBySplit(state.layout, target, panelId, position)
        : { type: 'tabgroup' as const, id: genId('tg'), panels: [panelId], activePanel: panelId };

      return { ...state, popoutPanels, layout, activePaneId: panelId };
    }

    case 'UPDATE_POPOUT': {
      const { panelId, ...updates } = action.payload;
      return {
        ...state,
        popoutPanels: (state.popoutPanels || []).map(p =>
          p.panelId === panelId ? { ...p, ...updates } : p,
        ),
      };
    }

    // ── Layout operations ────────────────────────────────────────────

    case 'SET_ACTIVE_PANEL': {
      const { tabGroupId, panelId } = action.payload;
      return { ...state, layout: setActivePanel(state.layout, tabGroupId, panelId) };
    }

    case 'ACTIVATE_OVERFLOW_TAB': {
      const { tabGroupId, panelId } = action.payload;
      return {
        ...state,
        layout: reorderPanelToFront(state.layout, tabGroupId, panelId),
        activePaneId: panelId,
      };
    }

    case 'DOCK_TO_EDGE': {
      const { panelId, edge } = action.payload;
      // 'center' edge doesn't make sense for root docking — treat as 'bottom'
      const dockEdge: import('../types/dock').DockEdge = edge === 'center' ? 'bottom' : edge;
      // Remove panel from current location (layout, floating, unpinned)
      const afterRemove = removePanel(state.layout, panelId);
      let floatingPanels = state.floatingPanels.filter(fp => fp.panelId !== panelId);
      let unpinnedPanels = state.unpinnedPanels.filter(up => up.panelId !== panelId);
      // Insert at root edge
      let layout: import('../types/dock').LayoutNode;
      if (afterRemove) {
        layout = insertAtEdge(afterRemove, panelId, dockEdge);
      } else {
        layout = { type: 'tabgroup' as const, id: genId('tg'), panels: [panelId], activePanel: panelId };
      }
      return { ...state, layout, floatingPanels, unpinnedPanels, activePaneId: panelId };
    }

    case 'REORDER_TABS': {
      const { tabGroupId, panelId, newIndex } = action.payload;
      const group = findTabGroupById(state.layout, tabGroupId);
      if (!group) return state;
      const oldIndex = group.panels.indexOf(panelId);
      if (oldIndex === -1 || oldIndex === newIndex) return state;
      // Reorder: remove from old position, insert at new position
      const newPanels = [...group.panels];
      newPanels.splice(oldIndex, 1);
      newPanels.splice(newIndex, 0, panelId);
      const layout = updateTabGroup(state.layout, tabGroupId, (tg) => ({ ...tg, panels: newPanels }));
      return { ...state, layout };
    }

    case 'RESIZE_SPLIT': {
      const { splitId, sizes } = action.payload;
      return { ...state, layout: updateSizes(state.layout, splitId, sizes) };
    }

    case 'SET_HEADER_POSITION': {
      const { tabGroupId, headerPosition } = action.payload;
      return {
        ...state,
        layout: updateTabGroup(state.layout, tabGroupId, tg => ({ ...tg, headerPosition })),
      };
    }

    // ── Maximize / Restore ───────────────────────────────────────────

    case 'MAXIMIZE_PANEL': {
      const { panelId } = action.payload;
      if (!state.panels[panelId]) return state;
      return { ...state, maximizedPanelId: panelId, activePaneId: panelId };
    }

    case 'RESTORE_PANEL':
      return { ...state, maximizedPanelId: undefined };

    // ── Active pane / Navigation ─────────────────────────────────────

    case 'SET_ACTIVE_PANE': {
      const { panelId } = action.payload;
      if (!state.panels[panelId]) return state;
      return { ...state, activePaneId: panelId };
    }

    case 'NAVIGATE': {
      const { direction } = action.payload;
      if (!state.activePaneId) return state;

      const nextId = direction === 'next'
        ? findNextPanel(state.layout, state.activePaneId)
        : findPreviousPanel(state.layout, state.activePaneId);

      if (!nextId || nextId === state.activePaneId) return state;

      const tabGroupId = findTabGroupForPanel(state.layout, nextId);
      if (!tabGroupId) return state;

      return {
        ...state,
        layout: setActivePanel(state.layout, tabGroupId, nextId),
        activePaneId: nextId,
      };
    }

    // ── State management ─────────────────────────────────────────────

    case 'LOAD_STATE':
      return validateState(action.payload);

    default:
      return state;
  }
}

// ─── State validation ─────────────────────────────────────────────────

export function validateState(state: DockManagerState): DockManagerState {
  const s = { ...state };

  if (!Array.isArray(s.floatingPanels)) s.floatingPanels = [];
  if (!Array.isArray(s.unpinnedPanels)) s.unpinnedPanels = [];
  if (!Array.isArray(s.popoutPanels)) s.popoutPanels = [];
  if (typeof s.nextZIndex !== 'number' || s.nextZIndex < 1000) s.nextZIndex = 1000;
  if (!s.panels || typeof s.panels !== 'object') s.panels = {};

  if (!s.layout) {
    s.layout = { type: 'tabgroup', id: genId('tg'), panels: [], activePanel: '' };
  }

  if (s.activePaneId && !s.panels[s.activePaneId]) {
    const allPanels = collectAllPanelsOrdered(s.layout);
    s.activePaneId = allPanels[0] || '';
  }

  if (s.maximizedPanelId && !s.panels[s.maximizedPanelId]) {
    s.maximizedPanelId = undefined;
  }

  return s;
}

// ─── Default state factory ───────────────────────────────────────────

export function createDefaultState(): DockManagerState {
  return {
    layout: { type: 'tabgroup', id: genId('tg'), panels: [], activePanel: '' },
    panels: {},
    floatingPanels: [],
    popoutPanels: [],
    unpinnedPanels: [],
    nextZIndex: 1000,
    activePaneId: '',
  };
}
