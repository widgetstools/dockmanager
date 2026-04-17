/**
 * DockReducer — Pure reducer for DockManagerState with placement Map.
 *
 * All 16 primary actions plus backward-compat actions for the existing DOM layer.
 * Uses LayoutTree class for immutable tree operations.
 */

import type {
  DockManagerState,
  DockPosition,
  DockEdge,
  PanelConfig,
  HeaderPosition,
  LayoutNode,
  Placement,
} from '../types/dock';

import {
  LayoutTree,
  findTabGroupForPanel,
  findFirstTabGroup,
  collectAllPanelsOrdered,
  findNextPanel,
  findPreviousPanel,
  detectPanelEdge,
  insertAtEdge,
  genId,
} from '../layout/LayoutTree';

// ─── Action types ────────────────────────────────────────────────────

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
  // Backward-compat actions dispatched by existing DOM layer
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

// ─── Helpers ──────────────────────────────────────────────────────────

/** Pick a fallback activePaneId from the layout or placements */
function pickActive(
  removedId: string,
  currentId: string,
  layout: LayoutNode,
  placements: Map<string, Placement>,
): string {
  if (currentId !== removedId) return currentId;
  const layoutPanels = collectAllPanelsOrdered(layout);
  if (layoutPanels.length > 0) return layoutPanels[0];
  for (const [pid, p] of placements) {
    if (p.type === 'floating') return pid;
  }
  return '';
}

/** Clone placements map, removing a specific panel */
function placementsWithout(placements: Map<string, Placement>, panelId: string): Map<string, Placement> {
  const m = new Map(placements);
  m.delete(panelId);
  return m;
}

/** Remove a panel from layout, returning new root (or empty group if null) */
function safeRemove(layout: LayoutNode, panelId: string): LayoutNode {
  const tree = new LayoutTree(layout);
  return tree.removePanel(panelId).root;
}

// ─── Reducer ─────────────────────────────────────────────────────────

export function dockReducer(state: DockManagerState, action: DockAction): DockManagerState {
  switch (action.type) {

    // ── Panel lifecycle ──────────────────────────────────────────────

    case 'ADD_PANEL': {
      const { panelId, config, target, position } = action;
      if (state.panels.has(panelId)) return state; // no duplicates

      const panels = new Map(state.panels);
      panels.set(panelId, config);

      const tree = new LayoutTree(state.layout);
      let newTree: LayoutTree;

      if (target) {
        const targetGroup = tree.findGroup(target);
        if (targetGroup) {
          newTree = tree.insertPanel(targetGroup, panelId, position || 'center');
        } else {
          // target doesn't exist, fall back to first group
          const firstId = findFirstTabGroup(state.layout);
          if (firstId) {
            const firstGroup = tree.findGroup(firstId)!;
            newTree = tree.insertPanel(firstGroup, panelId, position || 'center');
          } else {
            newTree = new LayoutTree({ type: 'tabgroup', id: genId(), panels: [panelId], activePanel: panelId });
          }
        }
      } else {
        const firstId = findFirstTabGroup(state.layout);
        if (firstId) {
          const firstGroup = tree.findGroup(firstId)!;
          newTree = tree.insertPanel(firstGroup, panelId, position || 'center');
        } else {
          newTree = new LayoutTree({ type: 'tabgroup', id: genId(), panels: [panelId], activePanel: panelId });
        }
      }

      const placements = new Map(state.placements);
      const groupForNew = new LayoutTree(newTree.root).groupForPanel(panelId);
      placements.set(panelId, { type: 'docked', groupId: groupForNew?.id || '' });

      return {
        ...state,
        panels,
        layout: newTree.root,
        placements,
        activePaneId: panelId,
      };
    }

    case 'CLOSE_PANEL': {
      const { panelId } = action;
      if (!state.panels.has(panelId)) return state;

      // Check if in a locked group
      const srcGroup = new LayoutTree(state.layout).groupForPanel(panelId);
      if (srcGroup?.locked) return state;

      const layout = safeRemove(state.layout, panelId);
      const panels = new Map(state.panels);
      panels.delete(panelId);
      const placements = placementsWithout(state.placements, panelId);
      const maximizedPanelId = state.maximizedPanelId === panelId ? undefined : state.maximizedPanelId;
      const activePaneId = pickActive(panelId, state.activePaneId, layout, placements);

      return { ...state, layout, panels, placements, maximizedPanelId, activePaneId };
    }

    // ── Move / Drag-drop ─────────────────────────────────────────────

    case 'MOVE_PANEL': {
      const { panelId, targetGroupId, position } = action;
      if (!state.panels.has(panelId)) return state;

      const tree = new LayoutTree(state.layout);
      const targetGroup = tree.findGroup(targetGroupId);
      if (!targetGroup) return state;

      const sourceGroup = tree.groupForPanel(panelId);
      if (sourceGroup?.id === targetGroupId && position === 'center') return state;
      if (sourceGroup?.id === targetGroupId && sourceGroup.panels.length === 1) return state;

      // Reject locked target (external drops)
      if (targetGroup.locked && sourceGroup?.id !== targetGroupId) return state;
      // Reject dragging out of locked source
      if (sourceGroup?.locked && sourceGroup.id !== targetGroupId) return state;

      const newTree = tree.movePanel(panelId, targetGroup, position);

      // Update placements: remove old, add docked
      const placements = new Map(state.placements);
      const newGroup = new LayoutTree(newTree.root).groupForPanel(panelId);
      placements.set(panelId, { type: 'docked', groupId: newGroup?.id || targetGroupId });

      return { ...state, layout: newTree.root, placements, activePaneId: panelId };
    }

    // ── Floating panels ──────────────────────────────────────────────

    case 'FLOAT_PANEL': {
      const { panelId, x, y, width, height } = action;
      if (!state.panels.has(panelId)) return state;

      // Reject if in locked group
      const srcGroup = new LayoutTree(state.layout).groupForPanel(panelId);
      if (srcGroup?.locked) return state;

      const sourceGroupId = srcGroup?.id;
      const layout = safeRemove(state.layout, panelId);

      const placements = new Map(state.placements);
      placements.set(panelId, {
        type: 'floating',
        x, y, width, height,
        zIndex: state.nextZIndex,
        sourceGroupId,
      });

      return { ...state, layout, placements, nextZIndex: state.nextZIndex + 1, activePaneId: panelId };
    }

    case 'DOCK_FLOATING': {
      const { panelId, targetGroupId, position } = action;
      const placement = state.placements.get(panelId);
      if (!placement || placement.type !== 'floating') return state;

      // Check dockable
      const panelConfig = state.panels.get(panelId);
      if (panelConfig?.dockable === false) return state;

      const tree = new LayoutTree(state.layout);

      // Fallback chain: target → sourceGroupId → firstGroup
      let target = targetGroupId ? tree.findGroup(targetGroupId) : null;
      if (!target && placement.sourceGroupId) {
        target = tree.findGroup(placement.sourceGroupId);
      }
      if (!target) {
        const firstId = findFirstTabGroup(state.layout);
        target = firstId ? tree.findGroup(firstId) : null;
      }

      let newTree: LayoutTree;
      if (target) {
        newTree = tree.insertPanel(target, panelId, position || 'center');
      } else {
        newTree = new LayoutTree({ type: 'tabgroup', id: genId(), panels: [panelId], activePanel: panelId });
      }

      const placements = new Map(state.placements);
      const newGroup = new LayoutTree(newTree.root).groupForPanel(panelId);
      placements.set(panelId, { type: 'docked', groupId: newGroup?.id || '' });

      return { ...state, layout: newTree.root, placements, activePaneId: panelId };
    }

    case 'UPDATE_FLOATING': {
      const { panelId, ...updates } = action;
      const placement = state.placements.get(panelId);
      if (!placement || placement.type !== 'floating') return state;

      const placements = new Map(state.placements);
      placements.set(panelId, {
        ...placement,
        ...updates,
        zIndex: state.nextZIndex,
        type: 'floating', // ensure discriminator
      });

      return { ...state, placements, nextZIndex: state.nextZIndex + 1 };
    }

    // ── Pin / Unpin ──────────────────────────────────────────────────

    case 'UNPIN_PANEL': {
      const { panelId } = action;
      if (!state.panels.has(panelId)) return state;

      const tree = new LayoutTree(state.layout);
      const srcGroup = tree.groupForPanel(panelId);
      if (srcGroup?.locked) return state;

      const edge = detectPanelEdge(state.layout, panelId);
      const sourceGroupId = srcGroup?.id;
      const layout = safeRemove(state.layout, panelId);

      const placements = new Map(state.placements);
      placements.set(panelId, { type: 'unpinned', edge, size: 200, sourceGroupId });

      const activePaneId = pickActive(panelId, state.activePaneId, layout, placements);
      return { ...state, layout, placements, activePaneId };
    }

    case 'PIN_PANEL': {
      const { panelId } = action;
      const placement = state.placements.get(panelId);
      if (!placement || placement.type !== 'unpinned') return state;

      const tree = new LayoutTree(state.layout);
      const edge = placement.edge || 'left';
      const sourceId = placement.sourceGroupId;

      let newTree: LayoutTree;
      // Try to restore to original group
      if (sourceId && tree.findGroup(sourceId)) {
        const sourceGroup = tree.findGroup(sourceId)!;
        newTree = tree.insertPanel(sourceGroup, panelId, 'center');
      } else {
        // Insert at edge
        newTree = new LayoutTree(insertAtEdge(state.layout, panelId, edge));
      }

      const placements = new Map(state.placements);
      const newGroup = new LayoutTree(newTree.root).groupForPanel(panelId);
      placements.set(panelId, { type: 'docked', groupId: newGroup?.id || '' });

      return { ...state, layout: newTree.root, placements, activePaneId: panelId };
    }

    // ── Popout windows ───────────────────────────────────────────────

    case 'POPOUT_PANEL': {
      const { panelId, windowName, x, y, width, height } = action;
      if (!state.panels.has(panelId)) return state;

      const layout = safeRemove(state.layout, panelId);
      const placements = new Map(state.placements);
      placements.set(panelId, { type: 'popout', windowName, x, y, width, height });

      return { ...state, layout, placements };
    }

    case 'DOCK_POPOUT': {
      const { panelId, targetGroupId, position } = action;
      const placement = state.placements.get(panelId);
      if (!placement || placement.type !== 'popout') return state;

      const tree = new LayoutTree(state.layout);
      let target = targetGroupId ? tree.findGroup(targetGroupId) : null;
      if (!target) {
        const firstId = findFirstTabGroup(state.layout);
        target = firstId ? tree.findGroup(firstId) : null;
      }

      let newTree: LayoutTree;
      if (target) {
        newTree = tree.insertPanel(target, panelId, position || 'center');
      } else {
        newTree = new LayoutTree({ type: 'tabgroup', id: genId(), panels: [panelId], activePanel: panelId });
      }

      const placements = new Map(state.placements);
      const newGroup = new LayoutTree(newTree.root).groupForPanel(panelId);
      placements.set(panelId, { type: 'docked', groupId: newGroup?.id || '' });

      return { ...state, layout: newTree.root, placements, activePaneId: panelId };
    }

    // ── Layout operations ────────────────────────────────────────────

    case 'SET_ACTIVE_PANEL': {
      const { groupId, panelId } = action;
      const tree = new LayoutTree(state.layout);
      const group = tree.findGroup(groupId);
      if (!group || !group.panels.includes(panelId)) return state;
      const newTree = tree.setActivePanel(groupId, panelId);
      return { ...state, layout: newTree.root, activePaneId: panelId };
    }

    case 'MAXIMIZE_PANEL': {
      const { panelId } = action;
      if (!state.panels.has(panelId)) return state;
      return { ...state, maximizedPanelId: panelId, activePaneId: panelId };
    }

    case 'RESTORE_PANEL': {
      return { ...state, maximizedPanelId: undefined };
    }

    case 'RESIZE_SPLIT': {
      const { splitId, sizes } = action;
      const tree = new LayoutTree(state.layout);
      const split = tree.findSplit(splitId);
      if (!split) return state;
      const newTree = tree.resizeSplit(split, sizes);
      return { ...state, layout: newTree.root };
    }

    case 'REORDER_TABS': {
      const { groupId, panels } = action;
      const tree = new LayoutTree(state.layout);
      const group = tree.findGroup(groupId);
      if (!group) return state;
      const newTree = tree.reorderTabs(group, panels);
      return { ...state, layout: newTree.root };
    }

    case 'DOCK_TO_EDGE': {
      const { panelId, edge } = action;
      if (!state.panels.has(panelId)) return state;

      // Remove from current location
      const layout = safeRemove(state.layout, panelId);
      const newLayout = insertAtEdge(layout, panelId, edge);

      const placements = new Map(state.placements);
      const newGroup = new LayoutTree(newLayout).groupForPanel(panelId);
      placements.set(panelId, { type: 'docked', groupId: newGroup?.id || '' });

      return { ...state, layout: newLayout, placements, activePaneId: panelId };
    }

    // ── State management ─────────────────────────────────────────────

    case 'LOAD_STATE': {
      return action.state;
    }

    // ── Backward-compat actions ──────────────────────────────────────

    case 'SET_ACTIVE_PANE': {
      const { panelId } = action;
      if (!state.panels.has(panelId)) return state;

      // Find the group containing this panel and set it active there too
      const groupId = findTabGroupForPanel(state.layout, panelId);
      if (groupId) {
        const tree = new LayoutTree(state.layout);
        const newTree = tree.setActivePanel(groupId, panelId);
        return { ...state, layout: newTree.root, activePaneId: panelId };
      }
      return { ...state, activePaneId: panelId };
    }

    case 'UPDATE_PANEL_CONFIG': {
      const { panelId, config } = action;
      if (!state.panels.has(panelId)) return state;
      const panels = new Map(state.panels);
      panels.set(panelId, { ...panels.get(panelId)!, ...config });
      return { ...state, panels };
    }

    case 'SET_HEADER_POSITION': {
      const { groupId, position } = action;
      const tree = new LayoutTree(state.layout);
      if (!tree.findGroup(groupId)) return state;
      const newTree = tree.updateGroup(groupId, { headerPosition: position });
      return { ...state, layout: newTree.root };
    }

    case 'SET_HEADER_COLLAPSED': {
      const { groupId, collapsed } = action;
      const tree = new LayoutTree(state.layout);
      if (!tree.findGroup(groupId)) return state;
      const newTree = tree.updateGroup(groupId, { headerCollapsed: collapsed || undefined });
      return { ...state, layout: newTree.root };
    }

    case 'SET_TAB_GROUP_LOCKED': {
      const { groupId, locked } = action;
      const tree = new LayoutTree(state.layout);
      if (!tree.findGroup(groupId)) return state;
      const newTree = tree.updateGroup(groupId, { locked: locked || undefined });
      return { ...state, layout: newTree.root };
    }

    case 'NAVIGATE': {
      const { direction } = action;
      if (!state.activePaneId) return state;
      const nextId = direction === 'next'
        ? findNextPanel(state.layout, state.activePaneId)
        : findPreviousPanel(state.layout, state.activePaneId);
      if (!nextId || nextId === state.activePaneId) return state;
      const groupId = findTabGroupForPanel(state.layout, nextId);
      if (!groupId) return state;
      const tree = new LayoutTree(state.layout);
      const newTree = tree.setActivePanel(groupId, nextId);
      return { ...state, layout: newTree.root, activePaneId: nextId };
    }

    case 'ACTIVATE_OVERFLOW_TAB': {
      const { groupId, panelId } = action;
      const tree = new LayoutTree(state.layout);
      const group = tree.findGroup(groupId);
      if (!group || !group.panels.includes(panelId)) return state;
      const newTree = tree.setActivePanel(groupId, panelId);
      return { ...state, layout: newTree.root, activePaneId: panelId };
    }

    case 'BRING_TO_FRONT': {
      const { panelId } = action;
      const placement = state.placements.get(panelId);
      if (!placement || placement.type !== 'floating') return state;
      const placements = new Map(state.placements);
      placements.set(panelId, { ...placement, zIndex: state.nextZIndex });
      return { ...state, placements, nextZIndex: state.nextZIndex + 1, activePaneId: panelId };
    }

    case 'RESIZE_UNPINNED': {
      const { panelId, size } = action;
      const placement = state.placements.get(panelId);
      if (!placement || placement.type !== 'unpinned') return state;
      const placements = new Map(state.placements);
      placements.set(panelId, { ...placement, size });
      return { ...state, placements };
    }

    case 'UPDATE_POPOUT': {
      const { panelId, ...updates } = action;
      const placement = state.placements.get(panelId);
      if (!placement || placement.type !== 'popout') return state;
      const placements = new Map(state.placements);
      placements.set(panelId, { ...placement, ...updates, type: 'popout' });
      return { ...state, placements };
    }

    default:
      return state;
  }
}

// ─── State validation ─────────────────────────────────────────────────

export function validateState(state: DockManagerState): Array<{ kind: string; detail: string }> {
  const errors: Array<{ kind: string; detail: string }> = [];

  if (!state.layout) {
    errors.push({ kind: 'missing_layout', detail: 'State has no layout tree' });
  }

  if (!(state.panels instanceof Map)) {
    errors.push({ kind: 'invalid_panels', detail: 'panels must be a Map' });
  }

  if (!(state.placements instanceof Map)) {
    errors.push({ kind: 'invalid_placements', detail: 'placements must be a Map' });
  }

  if (typeof state.nextZIndex !== 'number' || state.nextZIndex < 0) {
    errors.push({ kind: 'invalid_zindex', detail: `nextZIndex is ${state.nextZIndex}` });
  }

  // Check for orphan panels (in panels but not in placements)
  if (state.panels instanceof Map && state.placements instanceof Map) {
    for (const panelId of state.panels.keys()) {
      if (!state.placements.has(panelId)) {
        errors.push({ kind: 'orphan_panel', detail: `Panel "${panelId}" has no placement` });
      }
    }

    // Check for stale placements (in placements but not in panels)
    for (const panelId of state.placements.keys()) {
      if (!state.panels.has(panelId)) {
        errors.push({ kind: 'stale_placement', detail: `Placement for "${panelId}" has no panel config` });
      }
    }
  }

  // Check docked placements reference valid groups
  if (state.layout && state.placements instanceof Map) {
    for (const [panelId, placement] of state.placements) {
      if (placement.type === 'docked') {
        const inLayout = findTabGroupForPanel(state.layout, panelId);
        if (!inLayout) {
          errors.push({ kind: 'docked_not_in_layout', detail: `Panel "${panelId}" is docked but not in layout tree` });
        }
      }
    }
  }

  // Check maximizedPanelId references a valid panel
  if (state.maximizedPanelId && state.panels instanceof Map && !state.panels.has(state.maximizedPanelId)) {
    errors.push({ kind: 'invalid_maximized', detail: `maximizedPanelId "${state.maximizedPanelId}" not in panels` });
  }

  return errors;
}

// ─── Default state factory ───────────────────────────────────────────

export function createDefaultState(): DockManagerState {
  return {
    layout: { type: 'tabgroup', id: genId(), panels: [], activePanel: '' },
    panels: new Map(),
    placements: new Map(),
    activePaneId: '',
    nextZIndex: 1,
  };
}
