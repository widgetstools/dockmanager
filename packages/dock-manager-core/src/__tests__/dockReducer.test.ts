import { describe, it, expect, beforeEach } from 'vitest';
import { dockReducer, createDefaultState, validateState } from '../reducer/dockReducer';
import type { DockAction } from '../reducer/dockReducer';
import type { DockManagerState, TabGroupNode, SplitNode, LayoutNode } from '../types/dock';
import {
  resetIdCounter,
  findTabGroupForPanel,
  findTabGroupById,
  findAllTabGroups,
  collectAllPanelsOrdered,
} from '../layout/LayoutTree';

// ---------------------------------------------------------------------------
// Test state factory
// ---------------------------------------------------------------------------

function createTestState(): DockManagerState {
  return {
    layout: {
      type: 'split',
      id: 'split_root',
      direction: 'horizontal',
      children: [
        { type: 'tabgroup', id: 'tg_left', panels: ['explorer'], activePanel: 'explorer' },
        {
          type: 'split',
          id: 'split_center',
          direction: 'vertical',
          children: [
            { type: 'tabgroup', id: 'tg_center', panels: ['doc1', 'doc2', 'doc3'], activePanel: 'doc1' },
            { type: 'tabgroup', id: 'tg_bottom', panels: ['terminal'], activePanel: 'terminal' },
          ],
          sizes: [70, 30],
        },
      ],
      sizes: [20, 80],
    },
    panels: {
      explorer: { id: 'explorer', title: 'Explorer' },
      doc1: { id: 'doc1', title: 'Document 1', closable: true },
      doc2: { id: 'doc2', title: 'Document 2', closable: true },
      doc3: { id: 'doc3', title: 'Document 3', closable: true },
      terminal: { id: 'terminal', title: 'Terminal' },
    },
    floatingPanels: [],
    popoutPanels: [],
    unpinnedPanels: [],
    nextZIndex: 1000,
    activePaneId: 'doc1',
  };
}

/** Minimal state with a single empty tab group */
function createEmptyState(): DockManagerState {
  return {
    layout: { type: 'tabgroup', id: 'tg_only', panels: [], activePanel: '' },
    panels: {},
    floatingPanels: [],
    popoutPanels: [],
    unpinnedPanels: [],
    nextZIndex: 1000,
    activePaneId: '',
  };
}

/** State with a single panel in one tab group */
function createSinglePanelState(): DockManagerState {
  return {
    layout: { type: 'tabgroup', id: 'tg_single', panels: ['only'], activePanel: 'only' },
    panels: { only: { id: 'only', title: 'Only Panel', closable: true } },
    floatingPanels: [],
    popoutPanels: [],
    unpinnedPanels: [],
    nextZIndex: 1000,
    activePaneId: 'only',
  };
}

// ---------------------------------------------------------------------------
// Reset ID counter between tests so generated IDs are deterministic
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetIdCounter();
});

// ===========================================================================
// 1. ADD_PANEL
// ===========================================================================

describe('ADD_PANEL', () => {
  it('adds a panel to the first tab group', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'ADD_PANEL',
      payload: { panelId: 'new1', title: 'New Panel' },
    });
    expect(result.panels['new1']).toBeDefined();
    expect(result.panels['new1'].title).toBe('New Panel');
    // Panel should be in the first tab group (tg_left via DFS)
    const tg = findTabGroupById(result.layout, 'tg_left') as TabGroupNode;
    expect(tg.panels).toContain('new1');
    expect(tg.activePanel).toBe('new1');
  });

  it('sets activePaneId to the new panel', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'ADD_PANEL',
      payload: { panelId: 'new1', title: 'New Panel' },
    });
    expect(result.activePaneId).toBe('new1');
  });

  it('prevents duplicate panels', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'ADD_PANEL',
      payload: { panelId: 'doc1', title: 'Duplicate' },
    });
    // Should return same state reference
    expect(result).toBe(state);
  });

  it('creates a new tab group when layout has no tab groups', () => {
    // Construct a degenerate state where layout is a split with no children (shouldn't happen, but edge case)
    const state: DockManagerState = {
      layout: { type: 'split', id: 's1', direction: 'horizontal', children: [], sizes: [] },
      panels: {},
      floatingPanels: [],
      popoutPanels: [],
      unpinnedPanels: [],
      nextZIndex: 1000,
      activePaneId: '',
    };
    const result = dockReducer(state, {
      type: 'ADD_PANEL',
      payload: { panelId: 'p1', title: 'Panel 1' },
    });
    expect(result.layout.type).toBe('tabgroup');
    expect((result.layout as TabGroupNode).panels).toEqual(['p1']);
    expect(result.activePaneId).toBe('p1');
  });

  it('defaults closable and floatable to true', () => {
    const state = createEmptyState();
    const result = dockReducer(state, {
      type: 'ADD_PANEL',
      payload: { panelId: 'p1', title: 'P1' },
    });
    expect(result.panels['p1'].closable).toBe(true);
    expect(result.panels['p1'].floatable).toBe(true);
  });

  it('respects explicit closable=false', () => {
    const state = createEmptyState();
    const result = dockReducer(state, {
      type: 'ADD_PANEL',
      payload: { panelId: 'p1', title: 'P1', closable: false },
    });
    expect(result.panels['p1'].closable).toBe(false);
  });

  it('stores icon and tabComponent', () => {
    const state = createEmptyState();
    const result = dockReducer(state, {
      type: 'ADD_PANEL',
      payload: { panelId: 'p1', title: 'P1', icon: 'file-icon', tabComponent: 'CustomTab' },
    });
    expect(result.panels['p1'].icon).toBe('file-icon');
    expect(result.panels['p1'].tabComponent).toBe('CustomTab');
  });

  it('adds to an empty tab group correctly', () => {
    const state = createEmptyState();
    const result = dockReducer(state, {
      type: 'ADD_PANEL',
      payload: { panelId: 'first', title: 'First' },
    });
    const tg = result.layout as TabGroupNode;
    expect(tg.panels).toContain('first');
    expect(tg.activePanel).toBe('first');
  });
});

// ===========================================================================
// 2. MOVE_PANEL
// ===========================================================================

describe('MOVE_PANEL', () => {
  it('center drop merges panel into target tab group', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'MOVE_PANEL',
      payload: { panelId: 'explorer', targetTabGroupId: 'tg_center', position: 'center' },
    });
    const tgCenter = findTabGroupById(result.layout, 'tg_center') as TabGroupNode;
    expect(tgCenter.panels).toContain('explorer');
    expect(tgCenter.activePanel).toBe('explorer');
    // tg_left should have been collapsed away since it's now empty
    expect(findTabGroupById(result.layout, 'tg_left')).toBeNull();
  });

  it('no-op when panel already in target with center position', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'MOVE_PANEL',
      payload: { panelId: 'doc1', targetTabGroupId: 'tg_center', position: 'center' },
    });
    expect(result).toBe(state);
  });

  it('no-op when trying to split a single panel with itself', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'MOVE_PANEL',
      payload: { panelId: 'explorer', targetTabGroupId: 'tg_left', position: 'right' },
    });
    expect(result).toBe(state);
  });

  it('edge drop creates a new split', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'MOVE_PANEL',
      payload: { panelId: 'doc2', targetTabGroupId: 'tg_center', position: 'right' },
    });
    // doc2 should be in a new tab group adjacent to tg_center
    const allTgs = findAllTabGroups(result.layout);
    const doc2Group = allTgs.find((tg) => tg.panels.includes('doc2'));
    expect(doc2Group).toBeDefined();
    expect(doc2Group!.panels).toEqual(['doc2']);
    // Original group should still have doc1 and doc3
    const centerGroup = findTabGroupById(result.layout, 'tg_center') as TabGroupNode;
    expect(centerGroup.panels).toContain('doc1');
    expect(centerGroup.panels).toContain('doc3');
    expect(centerGroup.panels).not.toContain('doc2');
  });

  it('sets activePaneId to the moved panel', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'MOVE_PANEL',
      payload: { panelId: 'terminal', targetTabGroupId: 'tg_center', position: 'center' },
    });
    expect(result.activePaneId).toBe('terminal');
  });

  it('handles moving the last panel from a group (group collapses)', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'MOVE_PANEL',
      payload: { panelId: 'terminal', targetTabGroupId: 'tg_left', position: 'center' },
    });
    // tg_bottom had only 'terminal', so it should be collapsed
    expect(findTabGroupById(result.layout, 'tg_bottom')).toBeNull();
    const tgLeft = findTabGroupById(result.layout, 'tg_left') as TabGroupNode;
    expect(tgLeft.panels).toContain('terminal');
  });

  it('removes panel from floating when moved via MOVE_PANEL', () => {
    const state: DockManagerState = {
      ...createTestState(),
      floatingPanels: [{ panelId: 'explorer', x: 0, y: 0, width: 300, height: 200, zIndex: 1000 }],
    };
    const result = dockReducer(state, {
      type: 'MOVE_PANEL',
      payload: { panelId: 'explorer', targetTabGroupId: 'tg_center', position: 'center' },
    });
    expect(result.floatingPanels.find((f) => f.panelId === 'explorer')).toBeUndefined();
  });

  it('removes panel from unpinned when moved via MOVE_PANEL', () => {
    const state: DockManagerState = {
      ...createTestState(),
      unpinnedPanels: [{ panelId: 'explorer', edge: 'left', size: 200 }],
    };
    const result = dockReducer(state, {
      type: 'MOVE_PANEL',
      payload: { panelId: 'explorer', targetTabGroupId: 'tg_center', position: 'center' },
    });
    expect(result.unpinnedPanels.find((u) => u.panelId === 'explorer')).toBeUndefined();
  });

  it('handles target group collapsing after remove (falls back to first tab group)', () => {
    // Create state where source and target are the same tab group, panel is last
    const state: DockManagerState = {
      layout: {
        type: 'split',
        id: 'sp1',
        direction: 'horizontal',
        children: [
          { type: 'tabgroup', id: 'tg_a', panels: ['a'], activePanel: 'a' },
          { type: 'tabgroup', id: 'tg_b', panels: ['b'], activePanel: 'b' },
        ],
        sizes: [50, 50],
      },
      panels: {
        a: { id: 'a', title: 'A' },
        b: { id: 'b', title: 'B' },
      },
      floatingPanels: [],
      popoutPanels: [],
      unpinnedPanels: [],
      nextZIndex: 1000,
      activePaneId: 'a',
    };
    // Moving 'a' to tg_b right will remove 'a' from tg_a, collapsing the split to just tg_b
    // tg_b still exists so the insert should work
    const result = dockReducer(state, {
      type: 'MOVE_PANEL',
      payload: { panelId: 'a', targetTabGroupId: 'tg_b', position: 'right' },
    });
    const allPanels = collectAllPanelsOrdered(result.layout);
    expect(allPanels).toContain('a');
    expect(allPanels).toContain('b');
  });

  it('creates new layout when removing the only panel nullifies the layout', () => {
    const state = createSinglePanelState();
    const result = dockReducer(state, {
      type: 'MOVE_PANEL',
      payload: { panelId: 'only', targetTabGroupId: 'tg_single', position: 'right' },
    });
    // should be no-op because can't split single panel with itself
    expect(result).toBe(state);
  });
});

// ===========================================================================
// 3. CLOSE_PANEL
// ===========================================================================

describe('CLOSE_PANEL', () => {
  it('removes panel from layout', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'CLOSE_PANEL',
      payload: { panelId: 'doc2' },
    });
    const allPanels = collectAllPanelsOrdered(result.layout);
    expect(allPanels).not.toContain('doc2');
  });

  it('removes panel from panels map', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'CLOSE_PANEL',
      payload: { panelId: 'doc2' },
    });
    expect(result.panels['doc2']).toBeUndefined();
  });

  it('removes panel from floating panels', () => {
    const state: DockManagerState = {
      ...createTestState(),
      floatingPanels: [{ panelId: 'floater', x: 10, y: 10, width: 200, height: 150, zIndex: 1001 }],
      panels: {
        ...createTestState().panels,
        floater: { id: 'floater', title: 'Floater' },
      },
    };
    const result = dockReducer(state, {
      type: 'CLOSE_PANEL',
      payload: { panelId: 'floater' },
    });
    expect(result.floatingPanels).toHaveLength(0);
    expect(result.panels['floater']).toBeUndefined();
  });

  it('removes panel from unpinned panels', () => {
    const state: DockManagerState = {
      ...createTestState(),
      unpinnedPanels: [{ panelId: 'doc1', edge: 'left', size: 200 }],
    };
    const result = dockReducer(state, {
      type: 'CLOSE_PANEL',
      payload: { panelId: 'doc1' },
    });
    expect(result.unpinnedPanels).toHaveLength(0);
  });

  it('removes panel from popout panels', () => {
    const state: DockManagerState = {
      ...createTestState(),
      popoutPanels: [{ panelId: 'doc1', windowName: 'w1', x: 0, y: 0, width: 400, height: 300 }],
    };
    const result = dockReducer(state, {
      type: 'CLOSE_PANEL',
      payload: { panelId: 'doc1' },
    });
    expect(result.popoutPanels).toHaveLength(0);
  });

  it('clears maximizedPanelId when the maximized panel is closed', () => {
    const state: DockManagerState = {
      ...createTestState(),
      maximizedPanelId: 'doc1',
    };
    const result = dockReducer(state, {
      type: 'CLOSE_PANEL',
      payload: { panelId: 'doc1' },
    });
    expect(result.maximizedPanelId).toBeUndefined();
  });

  it('preserves maximizedPanelId when a different panel is closed', () => {
    const state: DockManagerState = {
      ...createTestState(),
      maximizedPanelId: 'doc1',
    };
    const result = dockReducer(state, {
      type: 'CLOSE_PANEL',
      payload: { panelId: 'doc2' },
    });
    expect(result.maximizedPanelId).toBe('doc1');
  });

  it('falls back activePaneId when the active panel is closed', () => {
    const state = createTestState(); // activePaneId = 'doc1'
    const result = dockReducer(state, {
      type: 'CLOSE_PANEL',
      payload: { panelId: 'doc1' },
    });
    // Should fall back to next panel in DFS order
    expect(result.activePaneId).not.toBe('doc1');
    expect(result.activePaneId).toBeTruthy();
  });

  it('preserves activePaneId when a non-active panel is closed', () => {
    const state = createTestState(); // activePaneId = 'doc1'
    const result = dockReducer(state, {
      type: 'CLOSE_PANEL',
      payload: { panelId: 'doc3' },
    });
    expect(result.activePaneId).toBe('doc1');
  });

  it('closing the last panel creates a safe empty layout', () => {
    const state = createSinglePanelState();
    const result = dockReducer(state, {
      type: 'CLOSE_PANEL',
      payload: { panelId: 'only' },
    });
    expect(result.layout.type).toBe('tabgroup');
    expect((result.layout as TabGroupNode).panels).toEqual([]);
    expect(result.activePaneId).toBe('');
  });

  it('falls back activePaneId to first floating panel when layout is empty', () => {
    const state: DockManagerState = {
      layout: { type: 'tabgroup', id: 'tg1', panels: ['a'], activePanel: 'a' },
      panels: {
        a: { id: 'a', title: 'A' },
        floater: { id: 'floater', title: 'Floater' },
      },
      floatingPanels: [{ panelId: 'floater', x: 0, y: 0, width: 200, height: 100, zIndex: 1000 }],
      popoutPanels: [],
      unpinnedPanels: [],
      nextZIndex: 1001,
      activePaneId: 'a',
    };
    const result = dockReducer(state, {
      type: 'CLOSE_PANEL',
      payload: { panelId: 'a' },
    });
    expect(result.activePaneId).toBe('floater');
  });

  it('collapses parent split when closing last panel in group', () => {
    const state = createTestState();
    // Close 'terminal' - the only panel in tg_bottom
    const result = dockReducer(state, {
      type: 'CLOSE_PANEL',
      payload: { panelId: 'terminal' },
    });
    // tg_bottom should be gone, split_center should collapse
    expect(findTabGroupById(result.layout, 'tg_bottom')).toBeNull();
  });
});

// ===========================================================================
// 4. FLOAT_PANEL
// ===========================================================================

describe('FLOAT_PANEL', () => {
  it('removes panel from layout and adds to floatingPanels', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'FLOAT_PANEL',
      payload: { panelId: 'doc2', x: 100, y: 100, width: 400, height: 300 },
    });
    const allLayoutPanels = collectAllPanelsOrdered(result.layout);
    expect(allLayoutPanels).not.toContain('doc2');
    expect(result.floatingPanels).toHaveLength(1);
    expect(result.floatingPanels[0]).toMatchObject({
      panelId: 'doc2',
      x: 100,
      y: 100,
      width: 400,
      height: 300,
      zIndex: 1000,
    });
  });

  it('increments nextZIndex', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'FLOAT_PANEL',
      payload: { panelId: 'doc2', x: 0, y: 0, width: 300, height: 200 },
    });
    expect(result.nextZIndex).toBe(1001);
  });

  it('sets activePaneId to the floated panel', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'FLOAT_PANEL',
      payload: { panelId: 'doc2', x: 0, y: 0, width: 300, height: 200 },
    });
    expect(result.activePaneId).toBe('doc2');
  });

  it('creates safe empty layout when floating the only panel', () => {
    const state = createSinglePanelState();
    const result = dockReducer(state, {
      type: 'FLOAT_PANEL',
      payload: { panelId: 'only', x: 50, y: 50, width: 200, height: 150 },
    });
    expect(result.layout.type).toBe('tabgroup');
    expect((result.layout as TabGroupNode).panels).toEqual([]);
    expect(result.floatingPanels).toHaveLength(1);
  });

  it('replaces existing floating entry for the same panel', () => {
    const state: DockManagerState = {
      ...createTestState(),
      floatingPanels: [{ panelId: 'doc2', x: 0, y: 0, width: 100, height: 100, zIndex: 999 }],
    };
    const result = dockReducer(state, {
      type: 'FLOAT_PANEL',
      payload: { panelId: 'doc2', x: 200, y: 200, width: 400, height: 300 },
    });
    const doc2Entries = result.floatingPanels.filter((f) => f.panelId === 'doc2');
    expect(doc2Entries).toHaveLength(1);
    expect(doc2Entries[0].x).toBe(200);
  });
});

// ===========================================================================
// 5. DOCK_FLOATING
// ===========================================================================

describe('DOCK_FLOATING', () => {
  function createFloatingState(): DockManagerState {
    return {
      ...createTestState(),
      floatingPanels: [{ panelId: 'floater', x: 100, y: 100, width: 300, height: 200, zIndex: 1000 }],
      panels: {
        ...createTestState().panels,
        floater: { id: 'floater', title: 'Floater' },
      },
    };
  }

  it('removes from floating and inserts into target tab group (center)', () => {
    const state = createFloatingState();
    const result = dockReducer(state, {
      type: 'DOCK_FLOATING',
      payload: { panelId: 'floater', targetTabGroupId: 'tg_center', position: 'center' },
    });
    expect(result.floatingPanels).toHaveLength(0);
    const tg = findTabGroupById(result.layout, 'tg_center') as TabGroupNode;
    expect(tg.panels).toContain('floater');
  });

  it('sets activePaneId to docked panel', () => {
    const state = createFloatingState();
    const result = dockReducer(state, {
      type: 'DOCK_FLOATING',
      payload: { panelId: 'floater', targetTabGroupId: 'tg_center', position: 'center' },
    });
    expect(result.activePaneId).toBe('floater');
  });

  it('creates new tab group when targetTabGroupId is "default"', () => {
    const state = createFloatingState();
    const result = dockReducer(state, {
      type: 'DOCK_FLOATING',
      payload: { panelId: 'floater', targetTabGroupId: 'default', position: 'center' },
    });
    // Should dock into first tab group
    const allPanels = collectAllPanelsOrdered(result.layout);
    expect(allPanels).toContain('floater');
  });

  it('creates a new layout if there are no tab groups', () => {
    const state: DockManagerState = {
      layout: { type: 'split', id: 's1', direction: 'horizontal', children: [], sizes: [] },
      panels: { f: { id: 'f', title: 'F' } },
      floatingPanels: [{ panelId: 'f', x: 0, y: 0, width: 100, height: 100, zIndex: 1000 }],
      popoutPanels: [],
      unpinnedPanels: [],
      nextZIndex: 1001,
      activePaneId: 'f',
    };
    const result = dockReducer(state, {
      type: 'DOCK_FLOATING',
      payload: { panelId: 'f', targetTabGroupId: '', position: 'center' },
    });
    expect(result.layout.type).toBe('tabgroup');
    expect((result.layout as TabGroupNode).panels).toContain('f');
  });

  it('docks to edge position creating a split', () => {
    const state = createFloatingState();
    const result = dockReducer(state, {
      type: 'DOCK_FLOATING',
      payload: { panelId: 'floater', targetTabGroupId: 'tg_center', position: 'left' },
    });
    const allPanels = collectAllPanelsOrdered(result.layout);
    expect(allPanels).toContain('floater');
    expect(result.floatingPanels).toHaveLength(0);
  });
});

// ===========================================================================
// 6. UPDATE_FLOATING
// ===========================================================================

describe('UPDATE_FLOATING', () => {
  it('updates position of a floating panel', () => {
    const state: DockManagerState = {
      ...createTestState(),
      floatingPanels: [{ panelId: 'f1', x: 0, y: 0, width: 200, height: 150, zIndex: 1000 }],
    };
    const result = dockReducer(state, {
      type: 'UPDATE_FLOATING',
      payload: { panelId: 'f1', x: 50, y: 75 },
    });
    expect(result.floatingPanels[0].x).toBe(50);
    expect(result.floatingPanels[0].y).toBe(75);
    expect(result.floatingPanels[0].width).toBe(200); // unchanged
  });

  it('updates size of a floating panel', () => {
    const state: DockManagerState = {
      ...createTestState(),
      floatingPanels: [{ panelId: 'f1', x: 10, y: 10, width: 200, height: 150, zIndex: 1000 }],
    };
    const result = dockReducer(state, {
      type: 'UPDATE_FLOATING',
      payload: { panelId: 'f1', width: 500, height: 400 },
    });
    expect(result.floatingPanels[0].width).toBe(500);
    expect(result.floatingPanels[0].height).toBe(400);
    expect(result.floatingPanels[0].x).toBe(10); // unchanged
  });

  it('ignores non-matching panels', () => {
    const state: DockManagerState = {
      ...createTestState(),
      floatingPanels: [{ panelId: 'f1', x: 0, y: 0, width: 200, height: 150, zIndex: 1000 }],
    };
    const result = dockReducer(state, {
      type: 'UPDATE_FLOATING',
      payload: { panelId: 'nonexistent', x: 999 },
    });
    expect(result.floatingPanels[0].x).toBe(0);
  });
});

// ===========================================================================
// 7. SET_ACTIVE_PANEL
// ===========================================================================

describe('SET_ACTIVE_PANEL', () => {
  it('sets activePanel on a tab group', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'SET_ACTIVE_PANEL',
      payload: { tabGroupId: 'tg_center', panelId: 'doc3' },
    });
    const tg = findTabGroupById(result.layout, 'tg_center') as TabGroupNode;
    expect(tg.activePanel).toBe('doc3');
  });

  it('no-op if panel does not exist in the group', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'SET_ACTIVE_PANEL',
      payload: { tabGroupId: 'tg_center', panelId: 'explorer' },
    });
    const tg = findTabGroupById(result.layout, 'tg_center') as TabGroupNode;
    expect(tg.activePanel).toBe('doc1'); // unchanged
  });

  it('no-op if tab group does not exist', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'SET_ACTIVE_PANEL',
      payload: { tabGroupId: 'nonexistent', panelId: 'doc1' },
    });
    // Layout unchanged
    expect(result.layout).toEqual(state.layout);
  });
});

// ===========================================================================
// 8. ACTIVATE_OVERFLOW_TAB
// ===========================================================================

describe('ACTIVATE_OVERFLOW_TAB', () => {
  it('reorders panel to front and sets it as active', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'ACTIVATE_OVERFLOW_TAB',
      payload: { tabGroupId: 'tg_center', panelId: 'doc3' },
    });
    const tg = findTabGroupById(result.layout, 'tg_center') as TabGroupNode;
    expect(tg.panels[0]).toBe('doc3');
    expect(tg.activePanel).toBe('doc3');
  });

  it('sets activePaneId', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'ACTIVATE_OVERFLOW_TAB',
      payload: { tabGroupId: 'tg_center', panelId: 'doc2' },
    });
    expect(result.activePaneId).toBe('doc2');
  });

  it('no-op if panel not in the group', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'ACTIVATE_OVERFLOW_TAB',
      payload: { tabGroupId: 'tg_center', panelId: 'explorer' },
    });
    const tg = findTabGroupById(result.layout, 'tg_center') as TabGroupNode;
    expect(tg.panels[0]).toBe('doc1'); // unchanged order
  });
});

// ===========================================================================
// 9. RESIZE_SPLIT
// ===========================================================================

describe('RESIZE_SPLIT', () => {
  it('updates sizes array on the target split', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'RESIZE_SPLIT',
      payload: { splitId: 'split_root', sizes: [30, 70] },
    });
    const root = result.layout as SplitNode;
    expect(root.sizes).toEqual([30, 70]);
  });

  it('updates nested split sizes', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'RESIZE_SPLIT',
      payload: { splitId: 'split_center', sizes: [50, 50] },
    });
    const root = result.layout as SplitNode;
    const center = root.children[1] as SplitNode;
    expect(center.sizes).toEqual([50, 50]);
  });

  it('no-op for non-existent split', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'RESIZE_SPLIT',
      payload: { splitId: 'nonexistent', sizes: [50, 50] },
    });
    expect(result.layout).toEqual(state.layout);
  });
});

// ===========================================================================
// 10. BRING_TO_FRONT
// ===========================================================================

describe('BRING_TO_FRONT', () => {
  it('updates zIndex and increments nextZIndex', () => {
    const state: DockManagerState = {
      ...createTestState(),
      floatingPanels: [
        { panelId: 'f1', x: 0, y: 0, width: 200, height: 100, zIndex: 1000 },
        { panelId: 'f2', x: 50, y: 50, width: 200, height: 100, zIndex: 1001 },
      ],
      nextZIndex: 1002,
    };
    const result = dockReducer(state, {
      type: 'BRING_TO_FRONT',
      payload: { panelId: 'f1' },
    });
    expect(result.floatingPanels.find((f) => f.panelId === 'f1')!.zIndex).toBe(1002);
    expect(result.floatingPanels.find((f) => f.panelId === 'f2')!.zIndex).toBe(1001); // unchanged
    expect(result.nextZIndex).toBe(1003);
  });

  it('sets activePaneId', () => {
    const state: DockManagerState = {
      ...createTestState(),
      floatingPanels: [{ panelId: 'f1', x: 0, y: 0, width: 200, height: 100, zIndex: 1000 }],
      activePaneId: 'doc1',
    };
    const result = dockReducer(state, {
      type: 'BRING_TO_FRONT',
      payload: { panelId: 'f1' },
    });
    expect(result.activePaneId).toBe('f1');
  });
});

// ===========================================================================
// 11. UNPIN_PANEL
// ===========================================================================

describe('UNPIN_PANEL', () => {
  it('removes panel from layout and adds to unpinnedPanels', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'UNPIN_PANEL',
      payload: { panelId: 'explorer' },
    });
    const allLayoutPanels = collectAllPanelsOrdered(result.layout);
    expect(allLayoutPanels).not.toContain('explorer');
    expect(result.unpinnedPanels).toHaveLength(1);
    expect(result.unpinnedPanels[0].panelId).toBe('explorer');
    expect(result.unpinnedPanels[0].size).toBe(200);
  });

  it('detects edge from layout position', () => {
    const state = createTestState();
    // explorer is in tg_left which is the leftmost child of horizontal split
    const result = dockReducer(state, {
      type: 'UNPIN_PANEL',
      payload: { panelId: 'explorer' },
    });
    expect(result.unpinnedPanels[0].edge).toBe('left');
  });

  it('falls back activePaneId when active panel is unpinned', () => {
    const state: DockManagerState = {
      ...createTestState(),
      activePaneId: 'explorer',
    };
    const result = dockReducer(state, {
      type: 'UNPIN_PANEL',
      payload: { panelId: 'explorer' },
    });
    expect(result.activePaneId).not.toBe('explorer');
    expect(result.activePaneId).toBeTruthy();
  });

  it('preserves activePaneId when a non-active panel is unpinned', () => {
    const state = createTestState(); // activePaneId = 'doc1'
    const result = dockReducer(state, {
      type: 'UNPIN_PANEL',
      payload: { panelId: 'terminal' },
    });
    expect(result.activePaneId).toBe('doc1');
  });

  it('creates safe empty layout when unpinning the only panel', () => {
    const state = createSinglePanelState();
    const result = dockReducer(state, {
      type: 'UNPIN_PANEL',
      payload: { panelId: 'only' },
    });
    expect(result.layout.type).toBe('tabgroup');
    expect((result.layout as TabGroupNode).panels).toEqual([]);
    expect(result.unpinnedPanels).toHaveLength(1);
  });

  it('replaces existing unpinned entry for the same panel', () => {
    const state: DockManagerState = {
      ...createTestState(),
      unpinnedPanels: [{ panelId: 'explorer', edge: 'right', size: 100 }],
    };
    const result = dockReducer(state, {
      type: 'UNPIN_PANEL',
      payload: { panelId: 'explorer' },
    });
    const entries = result.unpinnedPanels.filter((u) => u.panelId === 'explorer');
    expect(entries).toHaveLength(1);
  });
});

// ===========================================================================
// 12. PIN_PANEL
// ===========================================================================

describe('PIN_PANEL', () => {
  it('removes from unpinned and inserts into layout', () => {
    const state: DockManagerState = {
      ...createTestState(),
      unpinnedPanels: [{ panelId: 'unpinned1', edge: 'left', size: 200 }],
      panels: {
        ...createTestState().panels,
        unpinned1: { id: 'unpinned1', title: 'Unpinned 1' },
      },
    };
    const result = dockReducer(state, {
      type: 'PIN_PANEL',
      payload: { panelId: 'unpinned1', edge: 'left' },
    });
    expect(result.unpinnedPanels).toHaveLength(0);
    const allPanels = collectAllPanelsOrdered(result.layout);
    expect(allPanels).toContain('unpinned1');
  });

  it('sets activePaneId to pinned panel', () => {
    const state: DockManagerState = {
      ...createTestState(),
      unpinnedPanels: [{ panelId: 'unpinned1', edge: 'left', size: 200 }],
      panels: {
        ...createTestState().panels,
        unpinned1: { id: 'unpinned1', title: 'Unpinned 1' },
      },
    };
    const result = dockReducer(state, {
      type: 'PIN_PANEL',
      payload: { panelId: 'unpinned1', edge: 'left' },
    });
    expect(result.activePaneId).toBe('unpinned1');
  });

  it('inserts at stored edge when source group is gone', () => {
    const state: DockManagerState = {
      ...createTestState(),
      unpinnedPanels: [{ panelId: 'unpinned1', edge: 'left', size: 200 }],
      panels: {
        ...createTestState().panels,
        unpinned1: { id: 'unpinned1', title: 'Unpinned 1' },
      },
    };
    const result = dockReducer(state, {
      type: 'PIN_PANEL',
      payload: { panelId: 'unpinned1', edge: 'left' },
    });
    // Should be inserted at the left edge as its own tab group (not merged into tg_left)
    const allGroups = findAllTabGroups(result.layout);
    const panelGroup = allGroups.find(g => g.panels.includes('unpinned1'));
    expect(panelGroup).toBeDefined();
    expect(panelGroup!.panels).toContain('unpinned1');
  });
});

// ===========================================================================
// 13. MAXIMIZE_PANEL
// ===========================================================================

describe('MAXIMIZE_PANEL', () => {
  it('sets maximizedPanelId for existing panel', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'MAXIMIZE_PANEL',
      payload: { panelId: 'doc1' },
    });
    expect(result.maximizedPanelId).toBe('doc1');
  });

  it('sets activePaneId to maximized panel', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'MAXIMIZE_PANEL',
      payload: { panelId: 'terminal' },
    });
    expect(result.activePaneId).toBe('terminal');
  });

  it('no-op for non-existent panel', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'MAXIMIZE_PANEL',
      payload: { panelId: 'nonexistent' },
    });
    expect(result).toBe(state);
  });
});

// ===========================================================================
// 14. RESTORE_PANEL
// ===========================================================================

describe('RESTORE_PANEL', () => {
  it('clears maximizedPanelId', () => {
    const state: DockManagerState = {
      ...createTestState(),
      maximizedPanelId: 'doc1',
    };
    const result = dockReducer(state, {
      type: 'RESTORE_PANEL',
      payload: { panelId: 'doc1' },
    });
    expect(result.maximizedPanelId).toBeUndefined();
  });

  it('works even when no panel is maximized', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'RESTORE_PANEL',
      payload: { panelId: 'doc1' },
    });
    expect(result.maximizedPanelId).toBeUndefined();
  });
});

// ===========================================================================
// 15. SET_ACTIVE_PANE
// ===========================================================================

describe('SET_ACTIVE_PANE', () => {
  it('sets activePaneId for existing panel', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'SET_ACTIVE_PANE',
      payload: { panelId: 'terminal' },
    });
    expect(result.activePaneId).toBe('terminal');
  });

  it('no-op for non-existent panel', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'SET_ACTIVE_PANE',
      payload: { panelId: 'nonexistent' },
    });
    expect(result).toBe(state);
  });
});

// ===========================================================================
// 16. UPDATE_PANEL_CONFIG
// ===========================================================================

describe('UPDATE_PANEL_CONFIG', () => {
  it('updates panel config fields', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'UPDATE_PANEL_CONFIG',
      payload: { panelId: 'doc1', updates: { title: 'Renamed', icon: 'new-icon' } },
    });
    expect(result.panels['doc1'].title).toBe('Renamed');
    expect(result.panels['doc1'].icon).toBe('new-icon');
    expect(result.panels['doc1'].id).toBe('doc1'); // unchanged
  });

  it('no-op for non-existent panel', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'UPDATE_PANEL_CONFIG',
      payload: { panelId: 'nonexistent', updates: { title: 'Nope' } },
    });
    expect(result).toBe(state);
  });

  it('preserves other panel configs', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'UPDATE_PANEL_CONFIG',
      payload: { panelId: 'doc1', updates: { title: 'Changed' } },
    });
    expect(result.panels['doc2'].title).toBe('Document 2');
    expect(result.panels['explorer'].title).toBe('Explorer');
  });

  it('can update closable and floatable', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'UPDATE_PANEL_CONFIG',
      payload: { panelId: 'doc1', updates: { closable: false, floatable: false } },
    });
    expect(result.panels['doc1'].closable).toBe(false);
    expect(result.panels['doc1'].floatable).toBe(false);
  });
});

// ===========================================================================
// 17. NAVIGATE
// ===========================================================================

describe('NAVIGATE', () => {
  it('navigates to next panel in DFS order', () => {
    const state = createTestState(); // activePaneId = 'doc1'
    // DFS order: explorer, doc1, doc2, doc3, terminal
    const result = dockReducer(state, {
      type: 'NAVIGATE',
      payload: { direction: 'next' },
    });
    expect(result.activePaneId).toBe('doc2');
  });

  it('navigates to previous panel in DFS order', () => {
    const state = createTestState(); // activePaneId = 'doc1'
    const result = dockReducer(state, {
      type: 'NAVIGATE',
      payload: { direction: 'previous' },
    });
    expect(result.activePaneId).toBe('explorer');
  });

  it('wraps around from last to first (next)', () => {
    const state: DockManagerState = {
      ...createTestState(),
      activePaneId: 'terminal', // last in DFS
    };
    const result = dockReducer(state, {
      type: 'NAVIGATE',
      payload: { direction: 'next' },
    });
    expect(result.activePaneId).toBe('explorer');
  });

  it('wraps around from first to last (previous)', () => {
    const state: DockManagerState = {
      ...createTestState(),
      activePaneId: 'explorer', // first in DFS
    };
    const result = dockReducer(state, {
      type: 'NAVIGATE',
      payload: { direction: 'previous' },
    });
    expect(result.activePaneId).toBe('terminal');
  });

  it('updates activePanel on the target tab group', () => {
    const state = createTestState(); // activePaneId = 'doc1'
    const result = dockReducer(state, {
      type: 'NAVIGATE',
      payload: { direction: 'next' },
    });
    // doc2 is in tg_center
    const tg = findTabGroupById(result.layout, 'tg_center') as TabGroupNode;
    expect(tg.activePanel).toBe('doc2');
  });

  it('no-op when activePaneId is empty', () => {
    const state: DockManagerState = {
      ...createTestState(),
      activePaneId: '',
    };
    const result = dockReducer(state, {
      type: 'NAVIGATE',
      payload: { direction: 'next' },
    });
    expect(result).toBe(state);
  });

  it('no-op when only one panel exists', () => {
    const state = createSinglePanelState();
    const result = dockReducer(state, {
      type: 'NAVIGATE',
      payload: { direction: 'next' },
    });
    // findNextPanel wraps around to same panel, which equals currentPanelId
    expect(result).toBe(state);
  });
});

// ===========================================================================
// 18. LOAD_STATE
// ===========================================================================

describe('LOAD_STATE', () => {
  it('loads valid state as-is', () => {
    const state = createTestState();
    const result = dockReducer(createEmptyState(), {
      type: 'LOAD_STATE',
      payload: state,
    });
    expect(result.panels).toEqual(state.panels);
    expect(result.activePaneId).toBe('doc1');
  });

  it('repairs missing floatingPanels array', () => {
    const broken = { ...createTestState() } as any;
    delete broken.floatingPanels;
    const result = dockReducer(createEmptyState(), {
      type: 'LOAD_STATE',
      payload: broken,
    });
    expect(Array.isArray(result.floatingPanels)).toBe(true);
  });

  it('repairs missing unpinnedPanels array', () => {
    const broken = { ...createTestState() } as any;
    delete broken.unpinnedPanels;
    const result = dockReducer(createEmptyState(), {
      type: 'LOAD_STATE',
      payload: broken,
    });
    expect(Array.isArray(result.unpinnedPanels)).toBe(true);
  });

  it('repairs missing popoutPanels array', () => {
    const broken = { ...createTestState() } as any;
    delete broken.popoutPanels;
    const result = dockReducer(createEmptyState(), {
      type: 'LOAD_STATE',
      payload: broken,
    });
    expect(Array.isArray(result.popoutPanels)).toBe(true);
  });

  it('repairs invalid nextZIndex', () => {
    const broken = { ...createTestState(), nextZIndex: 5 };
    const result = dockReducer(createEmptyState(), {
      type: 'LOAD_STATE',
      payload: broken,
    });
    expect(result.nextZIndex).toBe(1000);
  });

  it('repairs missing panels object', () => {
    const broken = { ...createTestState() } as any;
    broken.panels = null;
    const result = dockReducer(createEmptyState(), {
      type: 'LOAD_STATE',
      payload: broken,
    });
    expect(result.panels).toEqual({});
  });

  it('repairs missing layout', () => {
    const broken = { ...createTestState() } as any;
    broken.layout = null;
    const result = dockReducer(createEmptyState(), {
      type: 'LOAD_STATE',
      payload: broken,
    });
    expect(result.layout.type).toBe('tabgroup');
  });

  it('repairs activePaneId referencing non-existent panel', () => {
    const state = { ...createTestState(), activePaneId: 'deleted_panel' };
    const result = dockReducer(createEmptyState(), {
      type: 'LOAD_STATE',
      payload: state,
    });
    expect(result.activePaneId).not.toBe('deleted_panel');
    // Should fall back to first panel in layout DFS order
    expect(result.panels[result.activePaneId] || result.activePaneId === '').toBeTruthy();
  });

  it('repairs maximizedPanelId referencing non-existent panel', () => {
    const state: DockManagerState = {
      ...createTestState(),
      maximizedPanelId: 'ghost',
    };
    const result = dockReducer(createEmptyState(), {
      type: 'LOAD_STATE',
      payload: state,
    });
    expect(result.maximizedPanelId).toBeUndefined();
  });
});

// ===========================================================================
// 19. POPOUT_PANEL
// ===========================================================================

describe('POPOUT_PANEL', () => {
  it('removes panel from layout and adds to popoutPanels', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'POPOUT_PANEL',
      payload: { panelId: 'doc2', windowName: 'win1', x: 100, y: 100, width: 600, height: 400 },
    });
    const allLayoutPanels = collectAllPanelsOrdered(result.layout);
    expect(allLayoutPanels).not.toContain('doc2');
    expect(result.popoutPanels).toHaveLength(1);
    expect(result.popoutPanels[0]).toMatchObject({
      panelId: 'doc2',
      windowName: 'win1',
      x: 100,
      y: 100,
      width: 600,
      height: 400,
    });
  });

  it('removes panel from floating when popping out', () => {
    const state: DockManagerState = {
      ...createTestState(),
      floatingPanels: [{ panelId: 'doc2', x: 0, y: 0, width: 200, height: 100, zIndex: 1000 }],
    };
    const result = dockReducer(state, {
      type: 'POPOUT_PANEL',
      payload: { panelId: 'doc2', windowName: 'w1', x: 0, y: 0, width: 400, height: 300 },
    });
    expect(result.floatingPanels).toHaveLength(0);
  });

  it('creates safe empty layout when popping out the only panel', () => {
    const state = createSinglePanelState();
    const result = dockReducer(state, {
      type: 'POPOUT_PANEL',
      payload: { panelId: 'only', windowName: 'w1', x: 0, y: 0, width: 400, height: 300 },
    });
    expect(result.layout.type).toBe('tabgroup');
    expect((result.layout as TabGroupNode).panels).toEqual([]);
  });
});

// ===========================================================================
// 20. DOCK_POPOUT
// ===========================================================================

describe('DOCK_POPOUT', () => {
  function createPopoutState(): DockManagerState {
    return {
      ...createTestState(),
      popoutPanels: [{ panelId: 'popped', windowName: 'w1', x: 0, y: 0, width: 400, height: 300 }],
      panels: {
        ...createTestState().panels,
        popped: { id: 'popped', title: 'Popped Out' },
      },
    };
  }

  it('removes from popout and inserts into layout', () => {
    const state = createPopoutState();
    const result = dockReducer(state, {
      type: 'DOCK_POPOUT',
      payload: { panelId: 'popped', targetTabGroupId: 'tg_center', position: 'center' },
    });
    expect(result.popoutPanels).toHaveLength(0);
    const tg = findTabGroupById(result.layout, 'tg_center') as TabGroupNode;
    expect(tg.panels).toContain('popped');
  });

  it('sets activePaneId to docked panel', () => {
    const state = createPopoutState();
    const result = dockReducer(state, {
      type: 'DOCK_POPOUT',
      payload: { panelId: 'popped', targetTabGroupId: 'tg_center', position: 'center' },
    });
    expect(result.activePaneId).toBe('popped');
  });

  it('uses first tab group when targetTabGroupId is "default"', () => {
    const state = createPopoutState();
    const result = dockReducer(state, {
      type: 'DOCK_POPOUT',
      payload: { panelId: 'popped', targetTabGroupId: 'default', position: 'center' },
    });
    const allPanels = collectAllPanelsOrdered(result.layout);
    expect(allPanels).toContain('popped');
  });

  it('creates new tab group when no tab groups exist', () => {
    const state: DockManagerState = {
      layout: { type: 'split', id: 's1', direction: 'horizontal', children: [], sizes: [] },
      panels: { p: { id: 'p', title: 'P' } },
      floatingPanels: [],
      popoutPanels: [{ panelId: 'p', windowName: 'w1', x: 0, y: 0, width: 400, height: 300 }],
      unpinnedPanels: [],
      nextZIndex: 1000,
      activePaneId: '',
    };
    const result = dockReducer(state, {
      type: 'DOCK_POPOUT',
      payload: { panelId: 'p', targetTabGroupId: '', position: 'center' },
    });
    expect(result.layout.type).toBe('tabgroup');
    expect((result.layout as TabGroupNode).panels).toContain('p');
  });

  it('can dock to edge position creating a split', () => {
    const state = createPopoutState();
    const result = dockReducer(state, {
      type: 'DOCK_POPOUT',
      payload: { panelId: 'popped', targetTabGroupId: 'tg_center', position: 'bottom' },
    });
    const allPanels = collectAllPanelsOrdered(result.layout);
    expect(allPanels).toContain('popped');
    expect(result.popoutPanels).toHaveLength(0);
  });
});

// ===========================================================================
// 20b. UPDATE_POPOUT
// ===========================================================================

describe('UPDATE_POPOUT', () => {
  it('updates position of a popout panel', () => {
    const state: DockManagerState = {
      ...createTestState(),
      popoutPanels: [{ panelId: 'p1', windowName: 'w1', x: 0, y: 0, width: 400, height: 300 }],
    };
    const result = dockReducer(state, {
      type: 'UPDATE_POPOUT',
      payload: { panelId: 'p1', x: 100, y: 200 },
    });
    expect(result.popoutPanels[0].x).toBe(100);
    expect(result.popoutPanels[0].y).toBe(200);
    expect(result.popoutPanels[0].width).toBe(400); // unchanged
  });

  it('ignores non-matching panels', () => {
    const state: DockManagerState = {
      ...createTestState(),
      popoutPanels: [{ panelId: 'p1', windowName: 'w1', x: 0, y: 0, width: 400, height: 300 }],
    };
    const result = dockReducer(state, {
      type: 'UPDATE_POPOUT',
      payload: { panelId: 'nonexistent', x: 999 },
    });
    expect(result.popoutPanels[0].x).toBe(0);
  });
});

// ===========================================================================
// 21. SET_HEADER_POSITION
// ===========================================================================

describe('SET_HEADER_POSITION', () => {
  it('sets headerPosition on the target tab group', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'SET_HEADER_POSITION',
      payload: { tabGroupId: 'tg_center', headerPosition: 'bottom' },
    });
    const tg = findTabGroupById(result.layout, 'tg_center') as TabGroupNode;
    expect(tg.headerPosition).toBe('bottom');
  });

  it('clears headerPosition when set to undefined', () => {
    const state = createTestState();
    // First set it
    const state2 = dockReducer(state, {
      type: 'SET_HEADER_POSITION',
      payload: { tabGroupId: 'tg_center', headerPosition: 'left' },
    });
    // Then clear it
    const result = dockReducer(state2, {
      type: 'SET_HEADER_POSITION',
      payload: { tabGroupId: 'tg_center', headerPosition: undefined },
    });
    const tg = findTabGroupById(result.layout, 'tg_center') as TabGroupNode;
    expect(tg.headerPosition).toBeUndefined();
  });

  it('does not affect other tab groups', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'SET_HEADER_POSITION',
      payload: { tabGroupId: 'tg_center', headerPosition: 'right' },
    });
    const tgLeft = findTabGroupById(result.layout, 'tg_left') as TabGroupNode;
    expect(tgLeft.headerPosition).toBeUndefined();
  });
});

// ===========================================================================
// validateState (direct)
// ===========================================================================

describe('validateState', () => {
  it('returns valid state with no changes needed', () => {
    const state = createTestState();
    const result = validateState(state);
    expect(result.activePaneId).toBe('doc1');
    expect(result.floatingPanels).toEqual([]);
  });

  it('initializes nextZIndex to 1000 if below threshold', () => {
    const state = { ...createTestState(), nextZIndex: 500 };
    const result = validateState(state);
    expect(result.nextZIndex).toBe(1000);
  });

  it('preserves nextZIndex at or above 1000', () => {
    const state = { ...createTestState(), nextZIndex: 2000 };
    const result = validateState(state);
    expect(result.nextZIndex).toBe(2000);
  });

  it('handles completely empty/broken state', () => {
    const broken: any = {};
    const result = validateState(broken);
    expect(result.floatingPanels).toEqual([]);
    expect(result.unpinnedPanels).toEqual([]);
    expect(result.popoutPanels).toEqual([]);
    expect(result.nextZIndex).toBe(1000);
    expect(result.panels).toEqual({});
    expect(result.layout).toBeDefined();
  });
});

// ===========================================================================
// createDefaultState
// ===========================================================================

describe('createDefaultState', () => {
  it('creates empty state with single tab group', () => {
    const state = createDefaultState();
    expect(state.layout.type).toBe('tabgroup');
    expect((state.layout as TabGroupNode).panels).toEqual([]);
    expect(state.panels).toEqual({});
    expect(state.floatingPanels).toEqual([]);
    expect(state.popoutPanels).toEqual([]);
    expect(state.unpinnedPanels).toEqual([]);
    expect(state.nextZIndex).toBe(1000);
    expect(state.activePaneId).toBe('');
  });
});

// ===========================================================================
// Edge cases and integration scenarios
// ===========================================================================

describe('Edge cases', () => {
  it('default case returns state unchanged for unknown action', () => {
    const state = createTestState();
    const result = dockReducer(state, { type: 'UNKNOWN_ACTION' } as any);
    expect(result).toBe(state);
  });

  it('multiple floating panels have correct z-index ordering', () => {
    let state = createTestState();
    state = dockReducer(state, {
      type: 'FLOAT_PANEL',
      payload: { panelId: 'doc1', x: 0, y: 0, width: 200, height: 100 },
    });
    state = dockReducer(state, {
      type: 'FLOAT_PANEL',
      payload: { panelId: 'doc2', x: 50, y: 50, width: 200, height: 100 },
    });
    expect(state.floatingPanels).toHaveLength(2);
    const f1 = state.floatingPanels.find((f) => f.panelId === 'doc1')!;
    const f2 = state.floatingPanels.find((f) => f.panelId === 'doc2')!;
    expect(f1.zIndex).toBeLessThan(f2.zIndex);
    expect(state.nextZIndex).toBe(1002);
  });

  it('closing active panel auto-selects next panel in same group', () => {
    const state: DockManagerState = {
      ...createTestState(),
      activePaneId: 'doc1',
    };
    const result = dockReducer(state, {
      type: 'CLOSE_PANEL',
      payload: { panelId: 'doc1' },
    });
    // After closing doc1 from tg_center [doc1, doc2, doc3], activePanel should update
    const tg = findTabGroupById(result.layout, 'tg_center') as TabGroupNode;
    expect(tg.panels).not.toContain('doc1');
    // The active panel in the group falls back to remaining[0] which is doc2
    expect(tg.activePanel).toBe('doc2');
  });

  it('closing a non-active panel in same group preserves activePanel', () => {
    const state = createTestState(); // tg_center: activePanel = doc1
    const result = dockReducer(state, {
      type: 'CLOSE_PANEL',
      payload: { panelId: 'doc3' },
    });
    const tg = findTabGroupById(result.layout, 'tg_center') as TabGroupNode;
    expect(tg.activePanel).toBe('doc1');
  });

  it('removePanel collapses empty splits correctly (nested)', () => {
    // Close all panels except explorer
    let state = createTestState();
    state = dockReducer(state, { type: 'CLOSE_PANEL', payload: { panelId: 'doc1' } });
    state = dockReducer(state, { type: 'CLOSE_PANEL', payload: { panelId: 'doc2' } });
    state = dockReducer(state, { type: 'CLOSE_PANEL', payload: { panelId: 'doc3' } });
    state = dockReducer(state, { type: 'CLOSE_PANEL', payload: { panelId: 'terminal' } });
    // Only 'explorer' should remain and the split structure should have collapsed
    const allPanels = collectAllPanelsOrdered(state.layout);
    expect(allPanels).toEqual(['explorer']);
    // Layout should either be a tabgroup or a simplified tree
    const allGroups = findAllTabGroups(state.layout);
    expect(allGroups).toHaveLength(1);
    expect(allGroups[0].panels).toEqual(['explorer']);
  });

  it('sequential add then close returns to near-default state', () => {
    let state = createDefaultState();
    state = dockReducer(state, { type: 'ADD_PANEL', payload: { panelId: 'tmp', title: 'Tmp' } });
    expect(state.panels['tmp']).toBeDefined();
    state = dockReducer(state, { type: 'CLOSE_PANEL', payload: { panelId: 'tmp' } });
    expect(state.panels['tmp']).toBeUndefined();
    expect(state.activePaneId).toBe('');
  });

  it('float then dock round-trip preserves panel in layout', () => {
    let state = createTestState();
    state = dockReducer(state, {
      type: 'FLOAT_PANEL',
      payload: { panelId: 'doc2', x: 100, y: 100, width: 300, height: 200 },
    });
    expect(state.floatingPanels).toHaveLength(1);

    state = dockReducer(state, {
      type: 'DOCK_FLOATING',
      payload: { panelId: 'doc2', targetTabGroupId: 'tg_center', position: 'center' },
    });
    expect(state.floatingPanels).toHaveLength(0);
    const allPanels = collectAllPanelsOrdered(state.layout);
    expect(allPanels).toContain('doc2');
  });

  it('popout then dock round-trip preserves panel in layout', () => {
    let state = createTestState();
    state = dockReducer(state, {
      type: 'POPOUT_PANEL',
      payload: { panelId: 'doc3', windowName: 'w1', x: 0, y: 0, width: 500, height: 400 },
    });
    expect(state.popoutPanels).toHaveLength(1);

    state = dockReducer(state, {
      type: 'DOCK_POPOUT',
      payload: { panelId: 'doc3', targetTabGroupId: 'tg_center', position: 'center' },
    });
    expect(state.popoutPanels).toHaveLength(0);
    const allPanels = collectAllPanelsOrdered(state.layout);
    expect(allPanels).toContain('doc3');
  });

  it('unpin then pin round-trip preserves panel in layout', () => {
    let state = createTestState();
    state = dockReducer(state, { type: 'UNPIN_PANEL', payload: { panelId: 'explorer' } });
    expect(state.unpinnedPanels).toHaveLength(1);
    const layoutWithout = collectAllPanelsOrdered(state.layout);
    expect(layoutWithout).not.toContain('explorer');

    state = dockReducer(state, { type: 'PIN_PANEL', payload: { panelId: 'explorer', edge: 'left' } });
    expect(state.unpinnedPanels).toHaveLength(0);
    const layoutWith = collectAllPanelsOrdered(state.layout);
    expect(layoutWith).toContain('explorer');
  });

  it('insertPanel with left position creates split with new panel on left', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'MOVE_PANEL',
      payload: { panelId: 'doc2', targetTabGroupId: 'tg_left', position: 'left' },
    });
    // doc2 should appear before explorer in DFS order since it's on the left
    const allPanels = collectAllPanelsOrdered(result.layout);
    const doc2Idx = allPanels.indexOf('doc2');
    const explorerIdx = allPanels.indexOf('explorer');
    expect(doc2Idx).toBeLessThan(explorerIdx);
  });

  it('insertPanel with top position creates vertical split', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'MOVE_PANEL',
      payload: { panelId: 'doc2', targetTabGroupId: 'tg_bottom', position: 'top' },
    });
    const allPanels = collectAllPanelsOrdered(result.layout);
    expect(allPanels).toContain('doc2');
    const allGroups = findAllTabGroups(result.layout);
    const doc2Group = allGroups.find((g) => g.panels.includes('doc2'));
    expect(doc2Group).toBeDefined();
  });

  it('move panel from one group to another via bottom edge', () => {
    const state = createTestState();
    const result = dockReducer(state, {
      type: 'MOVE_PANEL',
      payload: { panelId: 'explorer', targetTabGroupId: 'tg_center', position: 'bottom' },
    });
    const allPanels = collectAllPanelsOrdered(result.layout);
    expect(allPanels).toContain('explorer');
    // explorer should no longer be in tg_left
    expect(findTabGroupById(result.layout, 'tg_left')).toBeNull();
  });
});
