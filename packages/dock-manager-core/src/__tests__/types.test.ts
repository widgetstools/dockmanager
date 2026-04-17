import { describe, it, expect } from 'vitest';
import type {
  Placement,
  DockManagerState,
  LayoutNode,
  TabGroupNode,
  SplitNode,
  PanelConfig,
  DockEdge,
  FloatingPanel,
  PopoutPanel,
  UnpinnedPanel,
  SplitDirection,
  DockPosition,
  HeaderPosition,
  DockEvent,
  DockEventType,
  PreventableDockEvent,
  DragItem,
  DropZone,
  ActivePaneInfo,
  LayoutConstraints,
} from '../types/dock';
import { createPreventableEvent } from '../types/dock';

// ── Placement type ──────────────────────────────────────────────────

describe('Placement type', () => {
  it('supports docked placement', () => {
    const p: Placement = { type: 'docked', groupId: 'tg_1' };
    expect(p.type).toBe('docked');
    expect(p.groupId).toBe('tg_1');
  });

  it('supports floating placement with all fields', () => {
    const p: Placement = {
      type: 'floating',
      x: 100,
      y: 200,
      width: 400,
      height: 300,
      zIndex: 5,
      sourceGroupId: 'tg_1',
    };
    expect(p.type).toBe('floating');
    expect(p.x).toBe(100);
    expect(p.sourceGroupId).toBe('tg_1');
  });

  it('supports floating placement without optional sourceGroupId', () => {
    const p: Placement = {
      type: 'floating',
      x: 0,
      y: 0,
      width: 200,
      height: 150,
      zIndex: 1,
    };
    expect(p.type).toBe('floating');
    expect('sourceGroupId' in p).toBe(false);
  });

  it('supports unpinned placement', () => {
    const p: Placement = {
      type: 'unpinned',
      edge: 'bottom',
      size: 250,
      sourceGroupId: 'tg_2',
    };
    expect(p.type).toBe('unpinned');
    expect(p.edge).toBe('bottom');
    expect(p.size).toBe(250);
  });

  it('supports unpinned placement without sourceGroupId', () => {
    const p: Placement = { type: 'unpinned', edge: 'left', size: 200 };
    expect(p.type).toBe('unpinned');
  });

  it('supports popout placement', () => {
    const p: Placement = {
      type: 'popout',
      windowName: 'popout_1',
      x: 50,
      y: 60,
      width: 800,
      height: 600,
    };
    expect(p.type).toBe('popout');
    expect(p.windowName).toBe('popout_1');
  });

  it('discriminates placement types correctly', () => {
    const placements: Placement[] = [
      { type: 'docked', groupId: 'tg_1' },
      { type: 'floating', x: 0, y: 0, width: 100, height: 100, zIndex: 1 },
      { type: 'unpinned', edge: 'right', size: 150 },
      { type: 'popout', windowName: 'w1', x: 0, y: 0, width: 400, height: 300 },
    ];
    const types = placements.map((p) => p.type);
    expect(types).toEqual(['docked', 'floating', 'unpinned', 'popout']);
  });
});

// ── DockManagerState shape ──────────────────────────────────────────

describe('DockManagerState', () => {
  function createMinimalState(): DockManagerState {
    const tabGroup: TabGroupNode = {
      type: 'tabgroup',
      id: 'tg_1',
      panels: ['panel_1'],
      activePanel: 'panel_1',
    };

    const panels = new Map<string, PanelConfig>([
      ['panel_1', { id: 'panel_1', title: 'Panel 1' }],
    ]);

    const placements = new Map<string, Placement>([
      ['panel_1', { type: 'docked', groupId: 'tg_1' }],
    ]);

    return {
      layout: tabGroup,
      panels,
      placements,
      activePaneId: 'panel_1',
      nextZIndex: 1,
    };
  }

  it('uses Map<string, PanelConfig> for panels', () => {
    const state = createMinimalState();
    expect(state.panels).toBeInstanceOf(Map);
    expect(state.panels.get('panel_1')?.title).toBe('Panel 1');
  });

  it('uses Map<string, Placement> for placements', () => {
    const state = createMinimalState();
    expect(state.placements).toBeInstanceOf(Map);
    const placement = state.placements.get('panel_1');
    expect(placement?.type).toBe('docked');
  });

  it('supports maximizedPanelId as optional', () => {
    const state = createMinimalState();
    expect(state.maximizedPanelId).toBeUndefined();

    const stateWithMax: DockManagerState = {
      ...state,
      maximizedPanelId: 'panel_1',
    };
    expect(stateWithMax.maximizedPanelId).toBe('panel_1');
  });

  it('supports mixed placement types in the placements map', () => {
    const tabGroup: TabGroupNode = {
      type: 'tabgroup',
      id: 'tg_1',
      panels: ['p1'],
      activePanel: 'p1',
    };

    const panels = new Map<string, PanelConfig>([
      ['p1', { id: 'p1', title: 'Docked' }],
      ['p2', { id: 'p2', title: 'Floating' }],
      ['p3', { id: 'p3', title: 'Unpinned' }],
      ['p4', { id: 'p4', title: 'Popout' }],
    ]);

    const placements = new Map<string, Placement>([
      ['p1', { type: 'docked', groupId: 'tg_1' }],
      ['p2', { type: 'floating', x: 10, y: 20, width: 300, height: 200, zIndex: 2 }],
      ['p3', { type: 'unpinned', edge: 'bottom', size: 200 }],
      ['p4', { type: 'popout', windowName: 'win1', x: 0, y: 0, width: 600, height: 400 }],
    ]);

    const state: DockManagerState = {
      layout: tabGroup,
      panels,
      placements,
      activePaneId: 'p1',
      nextZIndex: 3,
    };

    expect(state.placements.size).toBe(4);
    expect(state.panels.size).toBe(4);
  });
});

// ── LayoutNode (TabGroupNode, SplitNode) ────────────────────────────

describe('LayoutNode', () => {
  it('supports TabGroupNode as a leaf', () => {
    const node: LayoutNode = {
      type: 'tabgroup',
      id: 'tg_1',
      panels: ['p1', 'p2'],
      activePanel: 'p1',
      headerPosition: 'top',
      headerCollapsed: false,
      locked: false,
    };
    expect(node.type).toBe('tabgroup');
  });

  it('supports SplitNode as a branch', () => {
    const tg1: TabGroupNode = {
      type: 'tabgroup',
      id: 'tg_1',
      panels: ['p1'],
      activePanel: 'p1',
    };
    const tg2: TabGroupNode = {
      type: 'tabgroup',
      id: 'tg_2',
      panels: ['p2'],
      activePanel: 'p2',
    };
    const split: SplitNode = {
      type: 'split',
      id: 'split_1',
      direction: 'horizontal',
      children: [tg1, tg2],
      sizes: [50, 50],
    };
    expect(split.type).toBe('split');
    expect(split.children).toHaveLength(2);
    expect(split.sizes).toEqual([50, 50]);
  });

  it('supports nested splits', () => {
    const tg1: TabGroupNode = {
      type: 'tabgroup',
      id: 'tg_1',
      panels: ['p1'],
      activePanel: 'p1',
    };
    const tg2: TabGroupNode = {
      type: 'tabgroup',
      id: 'tg_2',
      panels: ['p2'],
      activePanel: 'p2',
    };
    const tg3: TabGroupNode = {
      type: 'tabgroup',
      id: 'tg_3',
      panels: ['p3'],
      activePanel: 'p3',
    };
    const innerSplit: SplitNode = {
      type: 'split',
      id: 'split_inner',
      direction: 'vertical',
      children: [tg2, tg3],
      sizes: [60, 40],
    };
    const root: LayoutNode = {
      type: 'split',
      id: 'split_root',
      direction: 'horizontal',
      children: [tg1, innerSplit],
      sizes: [30, 70],
    };
    expect(root.type).toBe('split');
    if (root.type === 'split') {
      expect(root.children[1].type).toBe('split');
    }
  });
});

// ── PreventableDockEvent ────────────────────────────────────────────

describe('PreventableDockEvent', () => {
  it('creates event with correct type and panelId', () => {
    const event = createPreventableEvent('willClose', 'panel_1');
    expect(event.type).toBe('willClose');
    expect(event.panelId).toBe('panel_1');
  });

  it('starts with defaultPrevented = false', () => {
    const event = createPreventableEvent('willDrop');
    expect(event.defaultPrevented).toBe(false);
  });

  it('sets defaultPrevented to true when preventDefault() is called', () => {
    const event = createPreventableEvent('willFocus', 'panel_2');
    event.preventDefault();
    expect(event.defaultPrevented).toBe(true);
  });

  it('works without panelId', () => {
    const event = createPreventableEvent('layoutChanged');
    expect(event.panelId).toBeUndefined();
    expect(event.defaultPrevented).toBe(false);
  });
});

// ── Backward-compatible types still exported ────────────────────────

describe('Backward-compatible types', () => {
  it('FloatingPanel type is usable', () => {
    const fp: FloatingPanel = {
      panelId: 'p1',
      x: 0,
      y: 0,
      width: 200,
      height: 150,
      zIndex: 1,
    };
    expect(fp.panelId).toBe('p1');
  });

  it('PopoutPanel type is usable', () => {
    const pp: PopoutPanel = {
      panelId: 'p2',
      windowName: 'w1',
      x: 0,
      y: 0,
      width: 400,
      height: 300,
    };
    expect(pp.panelId).toBe('p2');
  });

  it('UnpinnedPanel type is usable', () => {
    const up: UnpinnedPanel = {
      panelId: 'p3',
      edge: 'bottom',
      size: 200,
    };
    expect(up.panelId).toBe('p3');
  });
});
