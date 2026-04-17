import { describe, it, expect } from 'vitest';
import { dockReducer, createDefaultState, validateState } from '../reducer/dockReducer';
import type { DockAction } from '../reducer/dockReducer';
import type { DockManagerState, PanelConfig, Placement } from '../types/dock';

// ---------------------------------------------------------------------------
// Test state factory
// ---------------------------------------------------------------------------

function makeState(overrides?: Partial<DockManagerState>): DockManagerState {
  const panelId = 'p1';
  const groupId = 'tg1';
  return {
    layout: { type: 'tabgroup', id: groupId, panels: [panelId], activePanel: panelId },
    panels: new Map([[panelId, { id: panelId, title: 'Panel 1' } as PanelConfig]]),
    placements: new Map([[panelId, { type: 'docked' as const, groupId }]]),
    activePaneId: panelId,
    nextZIndex: 1,
    ...overrides,
  };
}

/** Build a state with two groups in a horizontal split */
function makeSplitState(): DockManagerState {
  return {
    layout: {
      type: 'split',
      id: 'split1',
      direction: 'horizontal',
      children: [
        { type: 'tabgroup', id: 'tgA', panels: ['pA1', 'pA2'], activePanel: 'pA1' },
        { type: 'tabgroup', id: 'tgB', panels: ['pB1'], activePanel: 'pB1' },
      ],
      sizes: [50, 50],
    },
    panels: new Map([
      ['pA1', { id: 'pA1', title: 'A1' } as PanelConfig],
      ['pA2', { id: 'pA2', title: 'A2' } as PanelConfig],
      ['pB1', { id: 'pB1', title: 'B1' } as PanelConfig],
    ]),
    placements: new Map([
      ['pA1', { type: 'docked', groupId: 'tgA' }],
      ['pA2', { type: 'docked', groupId: 'tgA' }],
      ['pB1', { type: 'docked', groupId: 'tgB' }],
    ]),
    activePaneId: 'pA1',
    nextZIndex: 1,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dockReducer', () => {

  // ── ADD_PANEL ────────────────────────────────────────────────────

  describe('ADD_PANEL', () => {
    it('adds a panel to the first tab group', () => {
      const state = makeState();
      const result = dockReducer(state, {
        type: 'ADD_PANEL',
        panelId: 'p2',
        config: { id: 'p2', title: 'Panel 2' } as PanelConfig,
      });
      expect(result.panels.has('p2')).toBe(true);
      expect(result.activePaneId).toBe('p2');
      expect(result.placements.get('p2')?.type).toBe('docked');
      // Panel should be in the layout
      expect(result.layout.type === 'tabgroup' && result.layout.panels.includes('p2')).toBe(true);
    });

    it('rejects duplicate panel IDs', () => {
      const state = makeState();
      const result = dockReducer(state, {
        type: 'ADD_PANEL',
        panelId: 'p1',
        config: { id: 'p1', title: 'Dup' } as PanelConfig,
      });
      expect(result).toBe(state);
    });

    it('adds panel to a specific target group', () => {
      const state = makeSplitState();
      const result = dockReducer(state, {
        type: 'ADD_PANEL',
        panelId: 'pNew',
        config: { id: 'pNew', title: 'New' } as PanelConfig,
        target: 'tgB',
      });
      expect(result.panels.has('pNew')).toBe(true);
      expect(result.placements.get('pNew')?.type).toBe('docked');
    });

    it('adds panel with split position', () => {
      const state = makeState();
      const result = dockReducer(state, {
        type: 'ADD_PANEL',
        panelId: 'p2',
        config: { id: 'p2', title: 'Panel 2' } as PanelConfig,
        target: 'tg1',
        position: 'right',
      });
      expect(result.panels.has('p2')).toBe(true);
      expect(result.layout.type).toBe('split');
    });
  });

  // ── CLOSE_PANEL ──────────────────────────────────────────────────

  describe('CLOSE_PANEL', () => {
    it('removes the panel from state', () => {
      const state = makeSplitState();
      const result = dockReducer(state, { type: 'CLOSE_PANEL', panelId: 'pB1' });
      expect(result.panels.has('pB1')).toBe(false);
      expect(result.placements.has('pB1')).toBe(false);
    });

    it('updates activePaneId when closing the active panel', () => {
      const state = makeState();
      // Add a second panel first
      const s2 = dockReducer(state, {
        type: 'ADD_PANEL',
        panelId: 'p2',
        config: { id: 'p2', title: 'P2' } as PanelConfig,
      });
      const result = dockReducer(s2, { type: 'CLOSE_PANEL', panelId: 'p2' });
      expect(result.activePaneId).not.toBe('p2');
    });

    it('clears maximizedPanelId if the maximized panel is closed', () => {
      const state = makeSplitState();
      const s2 = { ...state, maximizedPanelId: 'pB1' };
      const result = dockReducer(s2, { type: 'CLOSE_PANEL', panelId: 'pB1' });
      expect(result.maximizedPanelId).toBeUndefined();
    });

    it('no-ops for nonexistent panel', () => {
      const state = makeState();
      const result = dockReducer(state, { type: 'CLOSE_PANEL', panelId: 'nope' });
      expect(result).toBe(state);
    });

    it('rejects close on locked group', () => {
      const state = makeState({
        layout: { type: 'tabgroup', id: 'tg1', panels: ['p1'], activePanel: 'p1', locked: true },
      });
      const result = dockReducer(state, { type: 'CLOSE_PANEL', panelId: 'p1' });
      expect(result).toBe(state);
    });
  });

  // ── FLOAT_PANEL ──────────────────────────────────────────────────

  describe('FLOAT_PANEL', () => {
    it('moves panel from docked to floating placement', () => {
      const state = makeSplitState();
      const result = dockReducer(state, {
        type: 'FLOAT_PANEL',
        panelId: 'pA1',
        x: 100, y: 100, width: 300, height: 200,
      });
      const placement = result.placements.get('pA1');
      expect(placement?.type).toBe('floating');
      if (placement?.type === 'floating') {
        expect(placement.x).toBe(100);
        expect(placement.zIndex).toBe(1);
        expect(placement.sourceGroupId).toBe('tgA');
      }
      expect(result.nextZIndex).toBe(2);
      expect(result.activePaneId).toBe('pA1');
    });

    it('rejects float from locked group', () => {
      const state = makeState({
        layout: { type: 'tabgroup', id: 'tg1', panels: ['p1'], activePanel: 'p1', locked: true },
      });
      const result = dockReducer(state, {
        type: 'FLOAT_PANEL', panelId: 'p1', x: 0, y: 0, width: 200, height: 200,
      });
      expect(result).toBe(state);
    });

    it('no-ops for nonexistent panel', () => {
      const state = makeState();
      const result = dockReducer(state, {
        type: 'FLOAT_PANEL', panelId: 'nope', x: 0, y: 0, width: 200, height: 200,
      });
      expect(result).toBe(state);
    });
  });

  // ── DOCK_FLOATING ────────────────────────────────────────────────

  describe('DOCK_FLOATING', () => {
    it('docks a floating panel back into the layout', () => {
      const state = makeSplitState();
      // Float first
      const floated = dockReducer(state, {
        type: 'FLOAT_PANEL', panelId: 'pA1', x: 100, y: 100, width: 300, height: 200,
      });
      // Dock back to tgB
      const result = dockReducer(floated, {
        type: 'DOCK_FLOATING', panelId: 'pA1', targetGroupId: 'tgB', position: 'center',
      });
      expect(result.placements.get('pA1')?.type).toBe('docked');
    });

    it('uses sourceGroupId fallback when no target specified', () => {
      const state = makeSplitState();
      const floated = dockReducer(state, {
        type: 'FLOAT_PANEL', panelId: 'pA1', x: 100, y: 100, width: 300, height: 200,
      });
      const result = dockReducer(floated, {
        type: 'DOCK_FLOATING', panelId: 'pA1', targetGroupId: '', position: 'center',
      });
      expect(result.placements.get('pA1')?.type).toBe('docked');
    });

    it('falls back to first group when target is stale', () => {
      const state = makeSplitState();
      const floated = dockReducer(state, {
        type: 'FLOAT_PANEL', panelId: 'pA1', x: 100, y: 100, width: 300, height: 200,
      });
      const result = dockReducer(floated, {
        type: 'DOCK_FLOATING', panelId: 'pA1', targetGroupId: 'nonexistent', position: 'center',
      });
      expect(result.placements.get('pA1')?.type).toBe('docked');
    });

    it('rejects docking undockable panel', () => {
      const panels = new Map<string, PanelConfig>([
        ['p1', { id: 'p1', title: 'P1', dockable: false } as PanelConfig],
      ]);
      const placements = new Map<string, Placement>([
        ['p1', { type: 'floating', x: 0, y: 0, width: 200, height: 200, zIndex: 1 }],
      ]);
      const state = makeState({ panels, placements });
      const result = dockReducer(state, {
        type: 'DOCK_FLOATING', panelId: 'p1', targetGroupId: 'tg1', position: 'center',
      });
      expect(result).toBe(state);
    });

    it('no-ops when panel is not floating', () => {
      const state = makeState();
      const result = dockReducer(state, {
        type: 'DOCK_FLOATING', panelId: 'p1', targetGroupId: 'tg1', position: 'center',
      });
      expect(result).toBe(state);
    });
  });

  // ── UPDATE_FLOATING ──────────────────────────────────────────────

  describe('UPDATE_FLOATING', () => {
    it('updates position and bumps zIndex', () => {
      const state = makeSplitState();
      const floated = dockReducer(state, {
        type: 'FLOAT_PANEL', panelId: 'pA1', x: 100, y: 100, width: 300, height: 200,
      });
      const result = dockReducer(floated, {
        type: 'UPDATE_FLOATING', panelId: 'pA1', x: 200, y: 200,
      });
      const p = result.placements.get('pA1');
      expect(p?.type).toBe('floating');
      if (p?.type === 'floating') {
        expect(p.x).toBe(200);
        expect(p.y).toBe(200);
        expect(p.zIndex).toBe(floated.nextZIndex);
      }
    });

    it('no-ops for non-floating panel', () => {
      const state = makeState();
      const result = dockReducer(state, {
        type: 'UPDATE_FLOATING', panelId: 'p1', x: 50,
      });
      expect(result).toBe(state);
    });
  });

  // ── MOVE_PANEL ───────────────────────────────────────────────────

  describe('MOVE_PANEL', () => {
    it('moves panel to another group', () => {
      const state = makeSplitState();
      const result = dockReducer(state, {
        type: 'MOVE_PANEL', panelId: 'pA1', targetGroupId: 'tgB', position: 'center',
      });
      expect(result.activePaneId).toBe('pA1');
      expect(result.placements.get('pA1')?.type).toBe('docked');
    });

    it('no-ops for center move within same group', () => {
      const state = makeSplitState();
      const result = dockReducer(state, {
        type: 'MOVE_PANEL', panelId: 'pA1', targetGroupId: 'tgA', position: 'center',
      });
      expect(result).toBe(state);
    });

    it('no-ops for nonexistent panel', () => {
      const state = makeState();
      const result = dockReducer(state, {
        type: 'MOVE_PANEL', panelId: 'nope', targetGroupId: 'tg1', position: 'center',
      });
      expect(result).toBe(state);
    });

    it('no-ops for nonexistent target group', () => {
      const state = makeState();
      const result = dockReducer(state, {
        type: 'MOVE_PANEL', panelId: 'p1', targetGroupId: 'nonexistent', position: 'center',
      });
      expect(result).toBe(state);
    });

    it('rejects move into locked target group', () => {
      const state: DockManagerState = {
        layout: {
          type: 'split', id: 's1', direction: 'horizontal',
          children: [
            { type: 'tabgroup', id: 'tgA', panels: ['pA'], activePanel: 'pA' },
            { type: 'tabgroup', id: 'tgB', panels: ['pB'], activePanel: 'pB', locked: true },
          ],
          sizes: [50, 50],
        },
        panels: new Map([['pA', { id: 'pA', title: 'A' } as PanelConfig], ['pB', { id: 'pB', title: 'B' } as PanelConfig]]),
        placements: new Map([['pA', { type: 'docked', groupId: 'tgA' }], ['pB', { type: 'docked', groupId: 'tgB' }]]),
        activePaneId: 'pA',
        nextZIndex: 1,
      };
      const result = dockReducer(state, {
        type: 'MOVE_PANEL', panelId: 'pA', targetGroupId: 'tgB', position: 'center',
      });
      expect(result).toBe(state);
    });
  });

  // ── SET_ACTIVE_PANEL ─────────────────────────────────────────────

  describe('SET_ACTIVE_PANEL', () => {
    it('sets active panel in a group', () => {
      const state = makeSplitState();
      const result = dockReducer(state, {
        type: 'SET_ACTIVE_PANEL', groupId: 'tgA', panelId: 'pA2',
      });
      expect(result.activePaneId).toBe('pA2');
      if (result.layout.type === 'split') {
        const tgA = result.layout.children[0];
        if (tgA.type === 'tabgroup') {
          expect(tgA.activePanel).toBe('pA2');
        }
      }
    });

    it('no-ops for nonexistent group', () => {
      const state = makeState();
      const result = dockReducer(state, {
        type: 'SET_ACTIVE_PANEL', groupId: 'nope', panelId: 'p1',
      });
      expect(result).toBe(state);
    });

    it('no-ops when panel not in group', () => {
      const state = makeSplitState();
      const result = dockReducer(state, {
        type: 'SET_ACTIVE_PANEL', groupId: 'tgA', panelId: 'pB1',
      });
      expect(result).toBe(state);
    });
  });

  // ── MAXIMIZE_PANEL ───────────────────────────────────────────────

  describe('MAXIMIZE_PANEL', () => {
    it('sets maximizedPanelId', () => {
      const state = makeState();
      const result = dockReducer(state, { type: 'MAXIMIZE_PANEL', panelId: 'p1' });
      expect(result.maximizedPanelId).toBe('p1');
      expect(result.activePaneId).toBe('p1');
    });

    it('no-ops for nonexistent panel', () => {
      const state = makeState();
      const result = dockReducer(state, { type: 'MAXIMIZE_PANEL', panelId: 'nope' });
      expect(result).toBe(state);
    });
  });

  // ── RESTORE_PANEL ────────────────────────────────────────────────

  describe('RESTORE_PANEL', () => {
    it('clears maximizedPanelId', () => {
      const state = makeState({ maximizedPanelId: 'p1' });
      const result = dockReducer(state, { type: 'RESTORE_PANEL', panelId: 'p1' });
      expect(result.maximizedPanelId).toBeUndefined();
    });
  });

  // ── RESIZE_SPLIT ─────────────────────────────────────────────────

  describe('RESIZE_SPLIT', () => {
    it('updates split sizes', () => {
      const state = makeSplitState();
      const result = dockReducer(state, {
        type: 'RESIZE_SPLIT', splitId: 'split1', sizes: [30, 70],
      });
      if (result.layout.type === 'split') {
        expect(result.layout.sizes).toEqual([30, 70]);
      }
    });

    it('no-ops for nonexistent split', () => {
      const state = makeState();
      const result = dockReducer(state, {
        type: 'RESIZE_SPLIT', splitId: 'nope', sizes: [50, 50],
      });
      expect(result).toBe(state);
    });
  });

  // ── REORDER_TABS ─────────────────────────────────────────────────

  describe('REORDER_TABS', () => {
    it('reorders tabs within a group', () => {
      const state = makeSplitState();
      const result = dockReducer(state, {
        type: 'REORDER_TABS', groupId: 'tgA', panels: ['pA2', 'pA1'],
      });
      if (result.layout.type === 'split') {
        const tgA = result.layout.children[0];
        if (tgA.type === 'tabgroup') {
          expect(tgA.panels).toEqual(['pA2', 'pA1']);
        }
      }
    });

    it('no-ops for nonexistent group', () => {
      const state = makeState();
      const result = dockReducer(state, {
        type: 'REORDER_TABS', groupId: 'nope', panels: ['p1'],
      });
      expect(result).toBe(state);
    });
  });

  // ── UNPIN_PANEL ──────────────────────────────────────────────────

  describe('UNPIN_PANEL', () => {
    it('moves panel to unpinned placement', () => {
      const state = makeSplitState();
      const result = dockReducer(state, { type: 'UNPIN_PANEL', panelId: 'pA1' });
      const placement = result.placements.get('pA1');
      expect(placement?.type).toBe('unpinned');
      if (placement?.type === 'unpinned') {
        expect(placement.size).toBe(200);
        expect(placement.sourceGroupId).toBe('tgA');
      }
    });

    it('rejects unpin from locked group', () => {
      const state = makeState({
        layout: { type: 'tabgroup', id: 'tg1', panels: ['p1'], activePanel: 'p1', locked: true },
      });
      const result = dockReducer(state, { type: 'UNPIN_PANEL', panelId: 'p1' });
      expect(result).toBe(state);
    });

    it('no-ops for nonexistent panel', () => {
      const state = makeState();
      const result = dockReducer(state, { type: 'UNPIN_PANEL', panelId: 'nope' });
      expect(result).toBe(state);
    });
  });

  // ── PIN_PANEL ────────────────────────────────────────────────────

  describe('PIN_PANEL', () => {
    it('restores unpinned panel back to docked', () => {
      const state = makeSplitState();
      const unpinned = dockReducer(state, { type: 'UNPIN_PANEL', panelId: 'pA1' });
      const result = dockReducer(unpinned, { type: 'PIN_PANEL', panelId: 'pA1' });
      expect(result.placements.get('pA1')?.type).toBe('docked');
      expect(result.activePaneId).toBe('pA1');
    });

    it('no-ops when panel is not unpinned', () => {
      const state = makeState();
      const result = dockReducer(state, { type: 'PIN_PANEL', panelId: 'p1' });
      expect(result).toBe(state);
    });
  });

  // ── POPOUT_PANEL ─────────────────────────────────────────────────

  describe('POPOUT_PANEL', () => {
    it('moves panel to popout placement', () => {
      const state = makeState();
      const result = dockReducer(state, {
        type: 'POPOUT_PANEL', panelId: 'p1', windowName: 'win1',
        x: 50, y: 50, width: 400, height: 300,
      });
      const placement = result.placements.get('p1');
      expect(placement?.type).toBe('popout');
      if (placement?.type === 'popout') {
        expect(placement.windowName).toBe('win1');
        expect(placement.x).toBe(50);
      }
    });

    it('no-ops for nonexistent panel', () => {
      const state = makeState();
      const result = dockReducer(state, {
        type: 'POPOUT_PANEL', panelId: 'nope', windowName: 'win',
        x: 0, y: 0, width: 200, height: 200,
      });
      expect(result).toBe(state);
    });
  });

  // ── DOCK_POPOUT ──────────────────────────────────────────────────

  describe('DOCK_POPOUT', () => {
    it('docks a popped-out panel back into layout', () => {
      const state = makeState();
      const popped = dockReducer(state, {
        type: 'POPOUT_PANEL', panelId: 'p1', windowName: 'win1',
        x: 50, y: 50, width: 400, height: 300,
      });
      const result = dockReducer(popped, {
        type: 'DOCK_POPOUT', panelId: 'p1', targetGroupId: '', position: 'center',
      });
      expect(result.placements.get('p1')?.type).toBe('docked');
      expect(result.activePaneId).toBe('p1');
    });

    it('no-ops when panel is not popped out', () => {
      const state = makeState();
      const result = dockReducer(state, {
        type: 'DOCK_POPOUT', panelId: 'p1', targetGroupId: 'tg1', position: 'center',
      });
      expect(result).toBe(state);
    });
  });

  // ── DOCK_TO_EDGE ─────────────────────────────────────────────────

  describe('DOCK_TO_EDGE', () => {
    it('moves panel to a root-level edge', () => {
      const state = makeState();
      // Add second panel first so removal doesn't empty the tree
      const s2 = dockReducer(state, {
        type: 'ADD_PANEL', panelId: 'p2', config: { id: 'p2', title: 'P2' } as PanelConfig,
      });
      const result = dockReducer(s2, {
        type: 'DOCK_TO_EDGE', panelId: 'p1', edge: 'right',
      });
      expect(result.placements.get('p1')?.type).toBe('docked');
      expect(result.activePaneId).toBe('p1');
      expect(result.layout.type).toBe('split');
    });

    it('no-ops for nonexistent panel', () => {
      const state = makeState();
      const result = dockReducer(state, {
        type: 'DOCK_TO_EDGE', panelId: 'nope', edge: 'left',
      });
      expect(result).toBe(state);
    });
  });

  // ── LOAD_STATE ───────────────────────────────────────────────────

  describe('LOAD_STATE', () => {
    it('replaces entire state', () => {
      const state = makeState();
      const newState = createDefaultState();
      const result = dockReducer(state, { type: 'LOAD_STATE', state: newState });
      expect(result).toBe(newState);
      expect(result.panels.size).toBe(0);
    });
  });

  // ── Compat: SET_ACTIVE_PANE ──────────────────────────────────────

  describe('SET_ACTIVE_PANE', () => {
    it('sets activePaneId and activates in group', () => {
      const state = makeSplitState();
      const result = dockReducer(state, { type: 'SET_ACTIVE_PANE', panelId: 'pA2' });
      expect(result.activePaneId).toBe('pA2');
    });

    it('no-ops for nonexistent panel', () => {
      const state = makeState();
      const result = dockReducer(state, { type: 'SET_ACTIVE_PANE', panelId: 'nope' });
      expect(result).toBe(state);
    });
  });

  // ── Compat: UPDATE_PANEL_CONFIG ──────────────────────────────────

  describe('UPDATE_PANEL_CONFIG', () => {
    it('merges config updates', () => {
      const state = makeState();
      const result = dockReducer(state, {
        type: 'UPDATE_PANEL_CONFIG', panelId: 'p1', config: { title: 'Updated' },
      });
      expect(result.panels.get('p1')?.title).toBe('Updated');
    });

    it('no-ops for nonexistent panel', () => {
      const state = makeState();
      const result = dockReducer(state, {
        type: 'UPDATE_PANEL_CONFIG', panelId: 'nope', config: { title: 'X' },
      });
      expect(result).toBe(state);
    });
  });

  // ── Compat: BRING_TO_FRONT ───────────────────────────────────────

  describe('BRING_TO_FRONT', () => {
    it('bumps zIndex for floating panel', () => {
      const state = makeSplitState();
      const floated = dockReducer(state, {
        type: 'FLOAT_PANEL', panelId: 'pA1', x: 0, y: 0, width: 200, height: 200,
      });
      const result = dockReducer(floated, { type: 'BRING_TO_FRONT', panelId: 'pA1' });
      const p = result.placements.get('pA1');
      if (p?.type === 'floating') {
        expect(p.zIndex).toBe(floated.nextZIndex);
      }
      expect(result.nextZIndex).toBe(floated.nextZIndex + 1);
      expect(result.activePaneId).toBe('pA1');
    });

    it('no-ops for non-floating panel', () => {
      const state = makeState();
      const result = dockReducer(state, { type: 'BRING_TO_FRONT', panelId: 'p1' });
      expect(result).toBe(state);
    });
  });

  // ── Compat: NAVIGATE ─────────────────────────────────────────────

  describe('NAVIGATE', () => {
    it('navigates to next panel', () => {
      const state = makeSplitState();
      const result = dockReducer(state, { type: 'NAVIGATE', direction: 'next' });
      expect(result.activePaneId).toBe('pA2');
    });

    it('navigates to previous panel', () => {
      const state = makeSplitState();
      const result = dockReducer(state, { type: 'NAVIGATE', direction: 'previous' });
      // Wraps around: pA1 is first, previous goes to last (pB1)
      expect(result.activePaneId).toBe('pB1');
    });
  });

  // ── Compat: SET_HEADER_POSITION ──────────────────────────────────

  describe('SET_HEADER_POSITION', () => {
    it('updates header position on group', () => {
      const state = makeState();
      const result = dockReducer(state, {
        type: 'SET_HEADER_POSITION', groupId: 'tg1', position: 'bottom',
      });
      if (result.layout.type === 'tabgroup') {
        expect(result.layout.headerPosition).toBe('bottom');
      }
    });

    it('no-ops for nonexistent group', () => {
      const state = makeState();
      const result = dockReducer(state, {
        type: 'SET_HEADER_POSITION', groupId: 'nope', position: 'top',
      });
      expect(result).toBe(state);
    });
  });

  // ── Compat: SET_HEADER_COLLAPSED ─────────────────────────────────

  describe('SET_HEADER_COLLAPSED', () => {
    it('sets headerCollapsed on group', () => {
      const state = makeState();
      const result = dockReducer(state, {
        type: 'SET_HEADER_COLLAPSED', groupId: 'tg1', collapsed: true,
      });
      if (result.layout.type === 'tabgroup') {
        expect(result.layout.headerCollapsed).toBe(true);
      }
    });

    it('clears headerCollapsed when false', () => {
      const state = makeState({
        layout: { type: 'tabgroup', id: 'tg1', panels: ['p1'], activePanel: 'p1', headerCollapsed: true },
      });
      const result = dockReducer(state, {
        type: 'SET_HEADER_COLLAPSED', groupId: 'tg1', collapsed: false,
      });
      if (result.layout.type === 'tabgroup') {
        expect(result.layout.headerCollapsed).toBeUndefined();
      }
    });
  });

  // ── Compat: SET_TAB_GROUP_LOCKED ─────────────────────────────────

  describe('SET_TAB_GROUP_LOCKED', () => {
    it('sets locked on group', () => {
      const state = makeState();
      const result = dockReducer(state, {
        type: 'SET_TAB_GROUP_LOCKED', groupId: 'tg1', locked: true,
      });
      if (result.layout.type === 'tabgroup') {
        expect(result.layout.locked).toBe(true);
      }
    });
  });

  // ── Compat: RESIZE_UNPINNED ──────────────────────────────────────

  describe('RESIZE_UNPINNED', () => {
    it('updates unpinned panel size', () => {
      const state = makeSplitState();
      const unpinned = dockReducer(state, { type: 'UNPIN_PANEL', panelId: 'pA1' });
      const result = dockReducer(unpinned, { type: 'RESIZE_UNPINNED', panelId: 'pA1', size: 350 });
      const p = result.placements.get('pA1');
      if (p?.type === 'unpinned') {
        expect(p.size).toBe(350);
      }
    });

    it('no-ops for non-unpinned panel', () => {
      const state = makeState();
      const result = dockReducer(state, { type: 'RESIZE_UNPINNED', panelId: 'p1', size: 300 });
      expect(result).toBe(state);
    });
  });

  // ── Compat: UPDATE_POPOUT ────────────────────────────────────────

  describe('UPDATE_POPOUT', () => {
    it('updates popout position', () => {
      const state = makeState();
      const popped = dockReducer(state, {
        type: 'POPOUT_PANEL', panelId: 'p1', windowName: 'win1',
        x: 50, y: 50, width: 400, height: 300,
      });
      const result = dockReducer(popped, {
        type: 'UPDATE_POPOUT', panelId: 'p1', x: 100, y: 200,
      });
      const p = result.placements.get('p1');
      if (p?.type === 'popout') {
        expect(p.x).toBe(100);
        expect(p.y).toBe(200);
        expect(p.width).toBe(400); // unchanged
      }
    });

    it('no-ops for non-popout panel', () => {
      const state = makeState();
      const result = dockReducer(state, { type: 'UPDATE_POPOUT', panelId: 'p1', x: 100 });
      expect(result).toBe(state);
    });
  });

  // ── Compat: ACTIVATE_OVERFLOW_TAB ────────────────────────────────

  describe('ACTIVATE_OVERFLOW_TAB', () => {
    it('activates the overflow tab', () => {
      const state = makeSplitState();
      const result = dockReducer(state, {
        type: 'ACTIVATE_OVERFLOW_TAB', groupId: 'tgA', panelId: 'pA2',
      });
      expect(result.activePaneId).toBe('pA2');
    });
  });

  // ── Unknown action ───────────────────────────────────────────────

  describe('unknown action', () => {
    it('returns state unchanged', () => {
      const state = makeState();
      const result = dockReducer(state, { type: 'UNKNOWN' } as any);
      expect(result).toBe(state);
    });
  });
});

// ---------------------------------------------------------------------------
// validateState
// ---------------------------------------------------------------------------

describe('validateState', () => {
  it('returns empty array for valid state', () => {
    const state = makeState();
    expect(validateState(state)).toEqual([]);
  });

  it('detects orphan panels', () => {
    const state = makeState();
    state.placements.delete('p1');
    const errors = validateState(state);
    expect(errors.some(e => e.kind === 'orphan_panel')).toBe(true);
  });

  it('detects stale placements', () => {
    const state = makeState();
    state.placements.set('ghost', { type: 'docked', groupId: 'tg1' });
    const errors = validateState(state);
    expect(errors.some(e => e.kind === 'stale_placement')).toBe(true);
  });

  it('detects docked panel not in layout', () => {
    const state = makeState();
    state.panels.set('p2', { id: 'p2', title: 'P2' } as PanelConfig);
    state.placements.set('p2', { type: 'docked', groupId: 'tg1' });
    const errors = validateState(state);
    expect(errors.some(e => e.kind === 'docked_not_in_layout')).toBe(true);
  });

  it('detects invalid maximizedPanelId', () => {
    const state = makeState({ maximizedPanelId: 'nonexistent' });
    const errors = validateState(state);
    expect(errors.some(e => e.kind === 'invalid_maximized')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createDefaultState
// ---------------------------------------------------------------------------

describe('createDefaultState', () => {
  it('returns a valid empty state', () => {
    const state = createDefaultState();
    expect(state.panels).toBeInstanceOf(Map);
    expect(state.placements).toBeInstanceOf(Map);
    expect(state.panels.size).toBe(0);
    expect(state.placements.size).toBe(0);
    expect(state.activePaneId).toBe('');
    expect(state.nextZIndex).toBe(1);
    expect(state.layout.type).toBe('tabgroup');
    expect(validateState(state)).toEqual([]);
  });
});
