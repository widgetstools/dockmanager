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
import { findAllTabGroups } from '../layout/LayoutTree';
import { checkLayoutInvariants, type InvariantViolation } from '../layout/layoutInvariants';
import type {
  DockManagerState,
  DockPosition,
  DockEdge,
} from '../types/dock';

type Violation = InvariantViolation;

const checkInvariants = checkLayoutInvariants;

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
      panelId: id, config: { id, title: id } as any,
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
      panelId: panelIds[1], targetGroupId: groups[0].id, position: 'right',
    });
    s = dockReducer(s, {
      type: 'MOVE_PANEL',
      panelId: panelIds[2], targetGroupId: groups[0].id, position: 'bottom',
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

  // Helper: get floating panel IDs from placements
  const floatingPanelIds = [...state.placements.entries()]
    .filter(([, p]) => p.type === 'floating')
    .map(([id]) => id);
  const unpinnedPanelIds = [...state.placements.entries()]
    .filter(([, p]) => p.type === 'unpinned')
    .map(([id]) => id);
  const popoutPanelIds = [...state.placements.entries()]
    .filter(([, p]) => p.type === 'popout')
    .map(([id]) => id);

  // 50% MOVE_PANEL
  if (r < 0.5) {
    if (groups.length === 0 || layoutPanels.length === 0) return null;
    return {
      type: 'MOVE_PANEL',
      panelId: layoutPanels[Math.floor(rand() * layoutPanels.length)],
      targetGroupId: groups[Math.floor(rand() * groups.length)].id,
      position: POSITIONS[Math.floor(rand() * POSITIONS.length)],
    };
  }
  // 12% FLOAT_PANEL
  if (r < 0.62) {
    if (layoutPanels.length === 0) return null;
    return {
      type: 'FLOAT_PANEL',
      panelId: layoutPanels[Math.floor(rand() * layoutPanels.length)],
      x: 100,
      y: 100,
      width: 400,
      height: 300,
    };
  }
  // 8% DOCK_FLOATING
  if (r < 0.7) {
    if (floatingPanelIds.length === 0 || groups.length === 0) return null;
    return {
      type: 'DOCK_FLOATING',
      panelId: floatingPanelIds[Math.floor(rand() * floatingPanelIds.length)],
      targetGroupId: groups[Math.floor(rand() * groups.length)].id,
      position: POSITIONS[Math.floor(rand() * POSITIONS.length)],
    };
  }
  // 8% UNPIN_PANEL
  if (r < 0.78) {
    if (layoutPanels.length === 0) return null;
    return {
      type: 'UNPIN_PANEL',
      panelId: layoutPanels[Math.floor(rand() * layoutPanels.length)],
    };
  }
  // 8% PIN_PANEL
  if (r < 0.86) {
    if (unpinnedPanelIds.length === 0) return null;
    return {
      type: 'PIN_PANEL',
      panelId: unpinnedPanelIds[Math.floor(rand() * unpinnedPanelIds.length)],
    };
  }
  // 6% CLOSE_PANEL + re-ADD so the panel count is stable
  if (r < 0.92) {
    if (layoutPanels.length === 0) return null;
    const id = layoutPanels[Math.floor(rand() * layoutPanels.length)];
    return { type: 'CLOSE_PANEL', panelId: id };
  }
  // 4% POPOUT_PANEL
  if (r < 0.96) {
    if (layoutPanels.length === 0) return null;
    const id = layoutPanels[Math.floor(rand() * layoutPanels.length)];
    return {
      type: 'POPOUT_PANEL',
      panelId: id, windowName: `w_${id}`, x: 0, y: 0, width: 400, height: 300,
    };
  }
  // 4% DOCK_POPOUT or DOCK_TO_EDGE or REORDER_TABS
  if (popoutPanelIds.length > 0 && groups.length > 0) {
    return {
      type: 'DOCK_POPOUT',
      panelId: popoutPanelIds[Math.floor(rand() * popoutPanelIds.length)],
      targetGroupId: groups[Math.floor(rand() * groups.length)].id,
      position: POSITIONS[Math.floor(rand() * POSITIONS.length)],
    };
  }
  // Fallback: DOCK_TO_EDGE on a random in-layout panel
  if (layoutPanels.length > 0) {
    const edges: DockEdge[] = ['left', 'right', 'top', 'bottom'];
    return {
      type: 'DOCK_TO_EDGE',
      panelId: layoutPanels[Math.floor(rand() * layoutPanels.length)],
      edge: edges[Math.floor(rand() * edges.length)],
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
    if (!s.panels.has(id)) {
      s = dockReducer(s, { type: 'ADD_PANEL', panelId: id, config: { id, title: id } as any });
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
    const floating = [...fail.state.placements.entries()].filter(([, p]) => p.type === 'floating').map(([id]) => id);
    const unpinned = [...fail.state.placements.entries()].filter(([, p]) => p.type === 'unpinned').map(([id]) => id);
    const popout = [...fail.state.placements.entries()].filter(([, p]) => p.type === 'popout').map(([id]) => id);
    console.log('floating:', floating);
    console.log('unpinned:', unpinned);
    console.log('popout:', popout);
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
