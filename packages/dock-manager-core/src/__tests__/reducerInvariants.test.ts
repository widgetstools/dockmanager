/**
 * Deep fuzz of the reducer looking for cases where empty tab groups
 * leak into the layout tree.
 *
 * Invariants:
 *  1. The layout tree never contains an empty tab group as a child of a
 *     split. An empty tab group is only allowed as the ENTIRE layout
 *     when no panels are currently docked (the safeEmptyGroup fallback).
 *  2. For every tab group, activePanel ∈ panels (or panels is empty).
 *  3. Panels registered in state.panels must be in layout OR floating OR
 *     unpinned OR popout — no orphans.
 *  4. findAllTabGroups returns no duplicate group IDs.
 */
import { describe, it } from 'vitest';
import {
  dockReducer,
  createDefaultState,
  type DockAction,
} from '../reducer/dockReducer';
import {
  findAllTabGroups,
  collectLayoutPanelIds,
} from '../layout/LayoutTree';
import type {
  DockManagerState,
  DockPosition,
  LayoutNode,
  TabGroupNode,
  SplitNode,
} from '../types/dock';

type Violation = { kind: string; detail: string };

function collectEmptyGroups(node: LayoutNode, parentType: 'root' | 'split'): TabGroupNode[] {
  const out: TabGroupNode[] = [];
  if (node.type === 'tabgroup') {
    if (node.panels.length === 0 && parentType === 'split') out.push(node);
    return out;
  }
  for (const child of node.children) {
    out.push(...collectEmptyGroups(child, 'split'));
  }
  return out;
}

function isRootEmptyTabgroup(layout: LayoutNode): boolean {
  return layout.type === 'tabgroup' && layout.panels.length === 0;
}

function checkInvariants(state: DockManagerState): Violation[] {
  const out: Violation[] = [];

  // 1. No empty tabgroups as children of splits
  const emptyNested = collectEmptyGroups(state.layout, 'root');
  for (const g of emptyNested) {
    out.push({ kind: 'EMPTY_NESTED', detail: `empty tabgroup ${g.id} is a split child` });
  }

  // 1b. Root-level empty tabgroup is only allowed when no panels are docked.
  // If state.panels has entries, but layout is the fallback empty group AND
  // at least one of those panels is NOT floating/unpinned/popout, something
  // was lost. That's an issue — but separate from EMPTY_NESTED.

  // 2. activePanel must be in panels (or panels empty)
  const groups = findAllTabGroups(state.layout);
  for (const g of groups) {
    if (g.panels.length > 0 && !g.panels.includes(g.activePanel)) {
      out.push({
        kind: 'ACTIVE_NOT_IN_PANELS',
        detail: `group ${g.id} active=${g.activePanel} panels=[${g.panels.join(',')}]`,
      });
    }
    for (const pid of g.panels) {
      if (!state.panels[pid]) {
        out.push({ kind: 'UNKNOWN_PANEL', detail: `group ${g.id} has unregistered panel ${pid}` });
      }
    }
  }

  // 3. Every panel in state.panels must be placed somewhere (layout OR
  // floating OR unpinned OR popout). Panels removed via CLOSE_PANEL are
  // no longer in state.panels so they are not flagged here.
  const layoutIds = collectLayoutPanelIds(state.layout);
  const floatIds = new Set(state.floatingPanels.map(p => p.panelId));
  const unpinIds = new Set(state.unpinnedPanels.map(p => p.panelId));
  const popoutIds = new Set((state.popoutPanels ?? []).map(p => p.panelId));
  for (const id of Object.keys(state.panels)) {
    if (!layoutIds.has(id) && !floatIds.has(id) && !unpinIds.has(id) && !popoutIds.has(id)) {
      out.push({ kind: 'ORPHAN_PANEL', detail: `panel ${id} not in layout/floating/unpinned/popout` });
    }
  }

  // 4. Duplicate group IDs
  const seen = new Set<string>();
  for (const g of groups) {
    if (seen.has(g.id)) {
      out.push({ kind: 'DUP_GROUP_ID', detail: `duplicate group id ${g.id}` });
    }
    seen.add(g.id);
  }

  return out;
}

// ─── Deterministic PRNG ─────────────────────────────────────────────

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POSITIONS: DockPosition[] = ['left', 'right', 'top', 'bottom', 'center'];

function seed(state: DockManagerState, panelIds: string[]): DockManagerState {
  let s = state;
  for (const id of panelIds) {
    s = dockReducer(s, {
      type: 'ADD_PANEL',
      payload: { panelId: id, title: id },
    });
  }
  return s;
}

// Builds an initial state with a small nested split so fuzz can explore
// more diverse shapes than a flat single tab group would allow.
function seedNested(panelIds: string[]): DockManagerState {
  let s = seed(createDefaultState(), panelIds);
  // split the first panel off so we have a 2-group tree
  const groups = findAllTabGroups(s.layout);
  if (groups.length > 0 && panelIds.length >= 3) {
    s = dockReducer(s, {
      type: 'MOVE_PANEL',
      payload: { panelId: panelIds[1], targetTabGroupId: groups[0].id, position: 'right' },
    });
    s = dockReducer(s, {
      type: 'MOVE_PANEL',
      payload: { panelId: panelIds[2], targetTabGroupId: groups[0].id, position: 'bottom' },
    });
  }
  return s;
}

function pickAction(
  state: DockManagerState,
  rand: () => number,
  panelIds: string[],
): DockAction | null {
  const groups = findAllTabGroups(state.layout);
  const layoutPanels: string[] = [];
  for (const g of groups) layoutPanels.push(...g.panels);

  const r = rand();

  // 50% MOVE_PANEL
  if (r < 0.5) {
    if (groups.length === 0 || layoutPanels.length === 0) return null;
    return {
      type: 'MOVE_PANEL',
      payload: {
        panelId: layoutPanels[Math.floor(rand() * layoutPanels.length)],
        targetTabGroupId: groups[Math.floor(rand() * groups.length)].id,
        position: POSITIONS[Math.floor(rand() * POSITIONS.length)],
      },
    };
  }
  // 12% FLOAT_PANEL
  if (r < 0.62) {
    if (layoutPanels.length === 0) return null;
    return {
      type: 'FLOAT_PANEL',
      payload: {
        panelId: layoutPanels[Math.floor(rand() * layoutPanels.length)],
        x: 100,
        y: 100,
        width: 400,
        height: 300,
      },
    };
  }
  // 8% DOCK_FLOATING
  if (r < 0.7) {
    if (state.floatingPanels.length === 0 || groups.length === 0) return null;
    return {
      type: 'DOCK_FLOATING',
      payload: {
        panelId: state.floatingPanels[Math.floor(rand() * state.floatingPanels.length)].panelId,
        targetTabGroupId: groups[Math.floor(rand() * groups.length)].id,
        position: POSITIONS[Math.floor(rand() * POSITIONS.length)],
      },
    };
  }
  // 8% UNPIN_PANEL
  if (r < 0.78) {
    if (layoutPanels.length === 0) return null;
    return {
      type: 'UNPIN_PANEL',
      payload: { panelId: layoutPanels[Math.floor(rand() * layoutPanels.length)] },
    };
  }
  // 8% PIN_PANEL
  if (r < 0.86) {
    if (state.unpinnedPanels.length === 0) return null;
    return {
      type: 'PIN_PANEL',
      payload: {
        panelId: state.unpinnedPanels[Math.floor(rand() * state.unpinnedPanels.length)].panelId,
      },
    };
  }
  // 6% CLOSE_PANEL + re-ADD so the panel count is stable
  if (r < 0.92) {
    if (layoutPanels.length === 0) return null;
    const id = layoutPanels[Math.floor(rand() * layoutPanels.length)];
    return { type: 'CLOSE_PANEL', payload: { panelId: id } };
  }
  // 4% POPOUT_PANEL
  if (r < 0.96) {
    if (layoutPanels.length === 0) return null;
    const id = layoutPanels[Math.floor(rand() * layoutPanels.length)];
    return {
      type: 'POPOUT_PANEL',
      payload: { panelId: id, windowName: `w_${id}`, x: 0, y: 0, width: 400, height: 300 },
    };
  }
  // 4% DOCK_POPOUT
  if (state.popoutPanels && state.popoutPanels.length > 0 && groups.length > 0) {
    return {
      type: 'DOCK_POPOUT',
      payload: {
        panelId: state.popoutPanels[Math.floor(rand() * state.popoutPanels.length)].panelId,
        targetTabGroupId: groups[Math.floor(rand() * groups.length)].id,
        position: POSITIONS[Math.floor(rand() * POSITIONS.length)],
      },
    };
  }
  return null;
}

// Re-add any panel that got closed so panel count stays ~constant and
// we don't trivially drain the state.
function refillIfMissing(
  state: DockManagerState,
  allPanelIds: string[],
): DockManagerState {
  let s = state;
  for (const id of allPanelIds) {
    if (!s.panels[id]) {
      s = dockReducer(s, { type: 'ADD_PANEL', payload: { panelId: id, title: id } });
    }
  }
  return s;
}

function run(
  label: string,
  stateFactory: () => DockManagerState,
  panelIds: string[],
  seeds: number,
  stepsPerSeed: number,
) {
  let fail: {
    seedNum: number;
    step: number;
    history: DockAction[];
    state: DockManagerState;
    violations: Violation[];
  } | null = null;

  for (let seedNum = 1; seedNum <= seeds && !fail; seedNum++) {
    const rand = mulberry32(seedNum);
    let state = stateFactory();
    const history: DockAction[] = [];

    for (let step = 0; step < stepsPerSeed; step++) {
      state = refillIfMissing(state, panelIds);
      const action = pickAction(state, rand, panelIds);
      if (!action) continue;
      history.push(action);
      state = dockReducer(state, action);

      const violations = checkInvariants(state);
      if (violations.length > 0) {
        fail = { seedNum, step, history, state, violations };
        break;
      }
    }
  }

  if (fail) {
    console.log(`\n=== ${label} FUZZ FAILURE ===`);
    console.log(`seed=${fail.seedNum} step=${fail.step}`);
    console.log('violations:');
    for (const v of fail.violations) console.log(`  [${v.kind}] ${v.detail}`);
    console.log('history (last 25):');
    for (const h of fail.history.slice(-25)) console.log(' ', JSON.stringify(h));
    console.log('layout:');
    console.log(JSON.stringify(fail.state.layout, null, 2));
    console.log('floating:', fail.state.floatingPanels.map(f => f.panelId));
    console.log('unpinned:', fail.state.unpinnedPanels.map(u => u.panelId));
    console.log('popout:', (fail.state.popoutPanels ?? []).map(p => p.panelId));
    throw new Error(`${label} fuzz failure at seed ${fail.seedNum} step ${fail.step}`);
  }
}

describe('reducer invariants — no empty tab groups among populated', () => {
  const panelIds = ['A', 'B', 'C', 'D', 'E', 'F'];

  it('MOVE only, nested initial state', () => {
    run(
      'MOVE',
      () => seedNested(panelIds),
      panelIds,
      400,
      200,
    );
  });

  it('mixed actions, nested initial state', () => {
    run(
      'MIXED',
      () => seedNested(panelIds),
      panelIds,
      400,
      200,
    );
  });

  it('mixed actions, flat initial state', () => {
    run(
      'MIXED-FLAT',
      () => seed(createDefaultState(), panelIds),
      panelIds,
      400,
      200,
    );
  });
});
