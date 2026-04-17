/**
 * Float → Dock invariant tests.
 *
 * Specifically targets the code path that fi-trading-terminal hits:
 *   1. FLOAT_PANEL removes a panel from its tab group (collapsing the
 *      group if it was the only member).
 *   2. User drags the floating panel onto another group at an edge
 *      (left/right/top/bottom) → DOCK_FLOATING with non-center position.
 *   3. The reducer must produce a layout that satisfies all structural
 *      invariants: no empty nested groups, no orphan panels, no
 *      duplicate placements, every activePanel∈panels.
 *
 * The fi-trading-terminal log showed `DOCK_ACTION DOCK_FLOATING` with
 * `position:'left'` onto `tg_3` triggering `Invariant violations after
 * action DOCK_FLOATING`, but the log truncated which invariant fired.
 * These tests enumerate every shape/position combination that pattern
 * can take, so the failing one is flushed out deterministically.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { dockReducer, createDefaultState, validateState, type DockAction } from '../reducer/dockReducer';
import type { DockManagerState, DockPosition, LayoutNode } from '../types/dock';
import {
  resetIdCounter,
  syncIdCounter,
  findAllTabGroups,
  findTabGroupForPanel,
  genId,
} from '../layout/LayoutTree';
import { checkLayoutInvariants } from '../layout/layoutInvariants';

// ── Helpers mirroring fi-trading-terminal/src/App.tsx shape ──
const p = (id: string, title: string) => ({ id, title, widgetType: id, closable: false });
const tg = (id: string, panels: string[], active?: string) => ({
  type: 'tabgroup' as const,
  id,
  panels,
  activePanel: active || panels[0],
});
const sp = (id: string, dir: 'horizontal' | 'vertical', sizes: number[], children: LayoutNode[]) =>
  ({ type: 'split' as const, id, direction: dir, sizes, children });
const base = (
  layout: LayoutNode,
  panels: Record<string, { id: string; title: string }>,
  active: string,
): DockManagerState => ({
  layout,
  panels,
  floatingPanels: [],
  popoutPanels: [],
  unpinnedPanels: [],
  nextZIndex: 100,
  activePaneId: active,
});

beforeEach(() => {
  resetIdCounter();
});

/**
 * The exact tradeLayout() fixture from fi-trading-terminal's App.tsx.
 * Reproducing the shape matters because the bug was observed against
 * this specific structure.
 */
function tradingTerminalTradeLayout(): DockManagerState {
  return base(
    sp('root', 'vertical', [55, 45], [
      sp('top', 'horizontal', [32, 68], [
        tg('tg-blotter', ['bondBlotter']),
        tg('tg-chart', ['chart']),
      ]),
      sp('bottom', 'horizontal', [32, 68], [
        tg('tg-ob', ['orderBook']),
        tg('tg-orders', ['blotter']),
      ]),
    ]),
    {
      bondBlotter: p('bondBlotter', 'Bond Blotter'),
      chart: p('chart', 'Chart'),
      orderBook: p('orderBook', 'Order Book'),
      blotter: p('blotter', 'Orders'),
    },
    'bondBlotter',
  );
}

function expectNoViolations(state: DockManagerState, label: string) {
  const violations = checkLayoutInvariants(state);
  if (violations.length > 0) {
    const summary = violations.map(v => `[${v.kind}] ${v.detail}`).join('\n  ');
    throw new Error(
      `${label} produced ${violations.length} invariant violation(s):\n  ${summary}\n` +
        `layout=${JSON.stringify(state.layout, null, 2)}`,
    );
  }
  expect(violations).toEqual([]);
}

// ── Focused reproduction: the exact trading-terminal drag ──

describe('FLOAT_PANEL → DOCK_FLOATING reproduces trading-terminal scenario', () => {
  const POSITIONS: DockPosition[] = ['left', 'right', 'top', 'bottom', 'center'];

  /**
   * Enumerate: for each source panel (the one we float), and each
   * surviving target group after the float, and each drop position —
   * run the float+dock sequence and assert invariants.
   */
  for (const sourcePanelId of ['bondBlotter', 'chart', 'orderBook', 'blotter']) {
    describe(`floating '${sourcePanelId}'`, () => {
      // Capture all group IDs that still exist after the float
      const stateAfterFloat = dockReducer(tradingTerminalTradeLayout(), {
        type: 'FLOAT_PANEL',
        payload: { panelId: sourcePanelId, x: 100, y: 100, width: 400, height: 300 },
      });
      const groupIdsAfterFloat = findAllTabGroups(stateAfterFloat.layout).map(g => g.id);

      it(`FLOAT_PANEL alone produces no invariant violations`, () => {
        expectNoViolations(stateAfterFloat, `FLOAT_PANEL(${sourcePanelId})`);
        // And the panel is in floatingPanels
        expect(stateAfterFloat.floatingPanels.some(f => f.panelId === sourcePanelId)).toBe(true);
      });

      for (const targetId of groupIdsAfterFloat) {
        for (const position of POSITIONS) {
          it(`DOCK_FLOATING(${sourcePanelId}, target=${targetId}, pos=${position}) keeps invariants`, () => {
            const result = dockReducer(stateAfterFloat, {
              type: 'DOCK_FLOATING',
              payload: { panelId: sourcePanelId, targetTabGroupId: targetId, position },
            });
            expectNoViolations(
              result,
              `DOCK_FLOATING(${sourcePanelId}, ${targetId}, ${position})`,
            );
            // Panel must land in the layout, not lost to the void
            expect(findTabGroupForPanel(result.layout, sourcePanelId)).not.toBeNull();
            expect(result.floatingPanels.some(f => f.panelId === sourcePanelId)).toBe(false);
          });
        }
      }
    });
  }

  it('DOCK_FLOATING on a targetTabGroupId that no longer exists is a no-op or handled cleanly', () => {
    const state = dockReducer(tradingTerminalTradeLayout(), {
      type: 'FLOAT_PANEL',
      payload: { panelId: 'blotter', x: 100, y: 100, width: 400, height: 300 },
    });
    // After float, 'tg-orders' was the group holding 'blotter' alone — it's gone
    const result = dockReducer(state, {
      type: 'DOCK_FLOATING',
      payload: { panelId: 'blotter', targetTabGroupId: 'tg-orders', position: 'left' },
    });
    expectNoViolations(result, 'DOCK_FLOATING onto missing target');
    // Panel must still be somewhere
    const inLayout = findTabGroupForPanel(result.layout, 'blotter') !== null;
    const inFloat = result.floatingPanels.some(f => f.panelId === 'blotter');
    expect(inLayout || inFloat).toBe(true);
  });

  it('DOCK_FLOATING onto a new auto-generated tg_N target keeps invariants', () => {
    // Reproduce the log pattern: target was 'tg_3' — an auto-generated ID
    // suggesting a prior action created it.
    let state = tradingTerminalTradeLayout();
    // Float and re-dock a panel to create an auto-generated group
    state = dockReducer(state, {
      type: 'FLOAT_PANEL',
      payload: { panelId: 'orderBook', x: 200, y: 200, width: 400, height: 300 },
    });
    state = dockReducer(state, {
      type: 'DOCK_FLOATING',
      payload: { panelId: 'orderBook', targetTabGroupId: 'tg-chart', position: 'right' },
    });
    expectNoViolations(state, 'setup — float+dock to create aux group');

    // Now float blotter and dock it onto one of the groups at 'left'
    state = dockReducer(state, {
      type: 'FLOAT_PANEL',
      payload: { panelId: 'blotter', x: 300, y: 300, width: 400, height: 300 },
    });
    expectNoViolations(state, 'float blotter');

    const firstGroup = findAllTabGroups(state.layout)[0];
    const result = dockReducer(state, {
      type: 'DOCK_FLOATING',
      payload: { panelId: 'blotter', targetTabGroupId: firstGroup.id, position: 'left' },
    });
    expectNoViolations(result, `DOCK_FLOATING blotter onto ${firstGroup.id} left`);
  });
});

// ── Chain replay: float+dock many times in a row ──

describe('long chain of FLOAT_PANEL + DOCK_FLOATING survives invariants', () => {
  /**
   * Replays alternating float and dock actions for every panel in the
   * trading-terminal fixture. Each step asserts invariants so the failing
   * step is pinpointed instead of observed after the fact.
   */
  it('alternating float+dock for every panel at every position never violates invariants', () => {
    let state = tradingTerminalTradeLayout();
    const panelIds = ['bondBlotter', 'chart', 'orderBook', 'blotter'];
    const positions: DockPosition[] = ['left', 'right', 'top', 'bottom', 'center'];

    let step = 0;
    for (let round = 0; round < 3; round++) {
      for (const panelId of panelIds) {
        // Float
        state = dockReducer(state, {
          type: 'FLOAT_PANEL',
          payload: { panelId, x: 100, y: 100, width: 400, height: 300 },
        });
        step++;
        expectNoViolations(state, `step=${step} FLOAT_PANEL(${panelId})`);

        // Dock back at each position variant on the first available group
        const groups = findAllTabGroups(state.layout);
        expect(groups.length).toBeGreaterThan(0);
        const targetId = groups[0].id;
        const position = positions[step % positions.length];
        state = dockReducer(state, {
          type: 'DOCK_FLOATING',
          payload: { panelId, targetTabGroupId: targetId, position },
        });
        step++;
        expectNoViolations(state, `step=${step} DOCK_FLOATING(${panelId}, ${targetId}, ${position})`);
      }
    }
  });
});

// ── Randomized fuzz using the trading-terminal starting shape ──

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('fuzz starting from trading-terminal layout', () => {
  const POSITIONS: DockPosition[] = ['left', 'right', 'top', 'bottom', 'center'];
  const PANEL_IDS = ['bondBlotter', 'chart', 'orderBook', 'blotter'];

  function pickAction(state: DockManagerState, rand: () => number): DockAction | null {
    const groups = findAllTabGroups(state.layout);
    const layoutPanels = groups.flatMap(g => g.panels);
    const r = rand();

    // 40%: FLOAT_PANEL
    if (r < 0.4) {
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
    // 40%: DOCK_FLOATING
    if (r < 0.8) {
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
    // 20%: MOVE_PANEL inside the layout
    if (layoutPanels.length === 0 || groups.length === 0) return null;
    return {
      type: 'MOVE_PANEL',
      payload: {
        panelId: layoutPanels[Math.floor(rand() * layoutPanels.length)],
        targetTabGroupId: groups[Math.floor(rand() * groups.length)].id,
        position: POSITIONS[Math.floor(rand() * POSITIONS.length)],
      },
    };
  }

  function refillIfMissing(state: DockManagerState): DockManagerState {
    let s = state;
    for (const id of PANEL_IDS) {
      if (!s.panels[id]) {
        s = dockReducer(s, { type: 'ADD_PANEL', payload: { panelId: id, title: id } });
      }
    }
    return s;
  }

  it('200 seeds × 300 steps starting from tradingTerminalTradeLayout — no violations', () => {
    let fail: {
      seedNum: number;
      step: number;
      history: DockAction[];
      violations: string[];
      layout: LayoutNode;
    } | null = null;

    for (let seedNum = 1; seedNum <= 200 && !fail; seedNum++) {
      resetIdCounter();
      const rand = mulberry32(seedNum);
      let state = tradingTerminalTradeLayout();
      const history: DockAction[] = [];

      for (let step = 0; step < 300; step++) {
        state = refillIfMissing(state);
        const action = pickAction(state, rand);
        if (!action) continue;
        history.push(action);
        state = dockReducer(state, action);

        const violations = checkLayoutInvariants(state);
        if (violations.length > 0) {
          fail = {
            seedNum,
            step,
            history,
            violations: violations.map(v => `[${v.kind}] ${v.detail}`),
            layout: state.layout,
          };
          break;
        }
      }
    }

    if (fail) {
      // eslint-disable-next-line no-console
      console.error(`\n=== trading-terminal fuzz FAILURE ===`);
      console.error(`seed=${fail.seedNum} step=${fail.step}`);
      console.error('violations:\n  ' + fail.violations.join('\n  '));
      console.error('last 20 actions:');
      for (const h of fail.history.slice(-20)) console.error(' ', JSON.stringify(h));
      console.error('final layout:', JSON.stringify(fail.layout, null, 2));
      throw new Error(`fuzz violation at seed=${fail.seedNum} step=${fail.step}`);
    }
  });
});

// ── syncIdCounter prevents DUP_GROUP_ID after restoring saved layouts ──

describe('syncIdCounter prevents duplicate IDs on restored layouts', () => {
  it('genId produces unique IDs after syncIdCounter scans a restored layout', () => {
    resetIdCounter();
    const restored = sp('root', 'horizontal', [50, 50], [
      tg('tg_5', ['a']),
      tg('tg_10', ['b']),
    ]);
    syncIdCounter(restored);
    const newId = genId('tg');
    expect(newId).toBe('tg_11');
  });

  it('float+dock on a restored layout with high IDs does not produce DUP_GROUP_ID', () => {
    resetIdCounter();
    const state = base(
      sp('split_8', 'horizontal', [50, 50], [
        tg('tg_5', ['bondBlotter', 'chart']),
        tg('tg_7', ['orderBook', 'blotter']),
      ]),
      {
        bondBlotter: p('bondBlotter', 'Bond Blotter'),
        chart: p('chart', 'Chart'),
        orderBook: p('orderBook', 'Order Book'),
        blotter: p('blotter', 'Orders'),
      },
      'bondBlotter',
    );
    syncIdCounter(state.layout);

    const floated = dockReducer(state, {
      type: 'FLOAT_PANEL',
      payload: { panelId: 'chart', x: 100, y: 100, width: 400, height: 300 },
    });
    const docked = dockReducer(floated, {
      type: 'DOCK_FLOATING',
      payload: { panelId: 'chart', targetTabGroupId: 'tg_5', position: 'left' },
    });
    const violations = checkLayoutInvariants(docked);
    expect(violations).toEqual([]);
  });

  it('validateState calls syncIdCounter so consumers get protection automatically', () => {
    resetIdCounter();
    const restored: DockManagerState = {
      layout: sp('split_3', 'horizontal', [50, 50], [
        tg('tg_4', ['a']),
        tg('tg_6', ['b']),
      ]),
      panels: { a: p('a', 'A'), b: p('b', 'B') },
      floatingPanels: [],
      popoutPanels: [],
      unpinnedPanels: [],
      nextZIndex: 1000,
      activePaneId: 'a',
    };
    validateState(restored);
    const newId = genId('tg');
    expect(parseInt(newId.split('_')[1], 10)).toBeGreaterThan(6);
  });
});

// ── Defensive coding: edge-case guards ──────────────────────────────

describe('defensive guards prevent silent panel loss', () => {
  function makeState(): DockManagerState {
    return tradingTerminalTradeLayout();
  }

  describe('DOCK_POPOUT with stale target', () => {
    it('falls back to first group when targetTabGroupId no longer exists', () => {
      let state = makeState();
      state = dockReducer(state, {
        type: 'POPOUT_PANEL',
        payload: { panelId: 'chart', windowName: 'w1', x: 0, y: 0, width: 400, height: 300 },
      });
      expect(state.popoutPanels?.some(p => p.panelId === 'chart')).toBe(true);

      const result = dockReducer(state, {
        type: 'DOCK_POPOUT',
        payload: { panelId: 'chart', targetTabGroupId: 'nonexistent_99', position: 'left' },
      });
      expectNoViolations(result, 'DOCK_POPOUT onto stale target');
      expect(findTabGroupForPanel(result.layout, 'chart')).not.toBeNull();
      expect(result.popoutPanels?.some(p => p.panelId === 'chart')).toBe(false);
    });
  });

  describe('MOVE_PANEL with invalid inputs', () => {
    it('returns state unchanged when target group does not exist', () => {
      const state = makeState();
      const result = dockReducer(state, {
        type: 'MOVE_PANEL',
        payload: { panelId: 'chart', targetTabGroupId: 'nonexistent_99', position: 'left' },
      });
      expect(result).toBe(state);
    });

    it('returns state unchanged when panel does not exist', () => {
      const state = makeState();
      const result = dockReducer(state, {
        type: 'MOVE_PANEL',
        payload: { panelId: 'ghost_panel', targetTabGroupId: 'tg-chart', position: 'center' },
      });
      expect(result).toBe(state);
    });
  });

  describe('PIN_PANEL when not in unpinnedPanels', () => {
    it('returns state unchanged if panel is not in the unpinned list', () => {
      const state = makeState();
      const result = dockReducer(state, {
        type: 'PIN_PANEL',
        payload: { panelId: 'chart' },
      });
      expect(result).toBe(state);
    });
  });

  describe('REORDER_TABS bounds check', () => {
    it('returns state unchanged when newIndex is out of bounds', () => {
      const state = makeState();
      const result = dockReducer(state, {
        type: 'REORDER_TABS',
        payload: { tabGroupId: 'tg-blotter', panelId: 'bondBlotter', newIndex: 999 },
      });
      expect(result).toBe(state);
    });

    it('returns state unchanged when newIndex is negative', () => {
      const state = makeState();
      const result = dockReducer(state, {
        type: 'REORDER_TABS',
        payload: { tabGroupId: 'tg-blotter', panelId: 'bondBlotter', newIndex: -1 },
      });
      expect(result).toBe(state);
    });
  });

  describe('DOCK_TO_EDGE with nonexistent panel', () => {
    it('returns state unchanged when panelId is not registered', () => {
      const state = makeState();
      const result = dockReducer(state, {
        type: 'DOCK_TO_EDGE',
        payload: { panelId: 'ghost_panel', edge: 'left' },
      });
      expect(result).toBe(state);
    });
  });

  describe('DOCK_POPOUT chain replay keeps invariants', () => {
    it('popout + dock-back at every position maintains invariants', () => {
      const positions: DockPosition[] = ['left', 'right', 'top', 'bottom', 'center'];
      for (const panelId of ['bondBlotter', 'chart', 'orderBook', 'blotter']) {
        for (const position of positions) {
          resetIdCounter();
          let state = makeState();
          state = dockReducer(state, {
            type: 'POPOUT_PANEL',
            payload: { panelId, windowName: `w_${panelId}`, x: 0, y: 0, width: 400, height: 300 },
          });
          expectNoViolations(state, `POPOUT(${panelId})`);

          const groups = findAllTabGroups(state.layout);
          const target = groups[0]?.id;
          if (!target) continue;

          state = dockReducer(state, {
            type: 'DOCK_POPOUT',
            payload: { panelId, targetTabGroupId: target, position },
          });
          expectNoViolations(state, `DOCK_POPOUT(${panelId}, ${target}, ${position})`);
          expect(findTabGroupForPanel(state.layout, panelId)).not.toBeNull();
        }
      }
    });
  });
});
