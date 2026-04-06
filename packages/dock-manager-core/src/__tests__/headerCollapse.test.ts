// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dockReducer, createDefaultState } from '../reducer/dockReducer';
import type { DockAction } from '../reducer/dockReducer';
import type { DockManagerState, TabGroupNode, SplitNode } from '../types/dock';
import { resetIdCounter, findTabGroupById, findTabGroupForPanel, findAllTabGroups } from '../layout/LayoutTree';
import { TabGroupView, type TabGroupViewCallbacks } from '../dom/views/TabGroupView';
import type { IDisposable } from '../dom/DockviewComponent';

// Mock ResizeObserver for jsdom
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', MockResizeObserver);

// ─── Helpers ─────────────────────────────────────────────────────────

function makeCallbacks(overrides?: Partial<TabGroupViewCallbacks>): TabGroupViewCallbacks {
  return {
    onClosePanel: vi.fn(),
    onFloatPanel: vi.fn(),
    onMaximizePanel: vi.fn(),
    onRestorePanel: vi.fn(),
    onUnpinPanel: vi.fn(),
    onSetActivePanel: vi.fn(),
    onSetActivePane: vi.fn(),
    onSetHeaderCollapsed: vi.fn(),
    createContent: (_id: string, container: HTMLElement): IDisposable => {
      container.textContent = 'content';
      return { dispose: () => {} };
    },
    ...overrides,
  };
}

function createCollapsedSinglePanelState(): DockManagerState {
  return {
    layout: {
      type: 'tabgroup',
      id: 'tg_single',
      panels: ['panelA'],
      activePanel: 'panelA',
      headerCollapsed: true,
    } as TabGroupNode,
    panels: {
      panelA: { id: 'panelA', title: 'Panel A', closable: true },
    },
    floatingPanels: [],
    popoutPanels: [],
    unpinnedPanels: [],
    nextZIndex: 1000,
    activePaneId: 'panelA',
  };
}

function createTwoGroupState(opts?: { leftCollapsed?: boolean }): DockManagerState {
  return {
    layout: {
      type: 'split',
      id: 'split_root',
      direction: 'horizontal',
      children: [
        {
          type: 'tabgroup',
          id: 'tg_left',
          panels: ['panelA'],
          activePanel: 'panelA',
          ...(opts?.leftCollapsed ? { headerCollapsed: true } : {}),
        } as TabGroupNode,
        {
          type: 'tabgroup',
          id: 'tg_right',
          panels: ['panelB', 'panelC'],
          activePanel: 'panelB',
        } as TabGroupNode,
      ],
      sizes: [30, 70],
    } as SplitNode,
    panels: {
      panelA: { id: 'panelA', title: 'Panel A', closable: true },
      panelB: { id: 'panelB', title: 'Panel B', closable: true },
      panelC: { id: 'panelC', title: 'Panel C', closable: true },
    },
    floatingPanels: [],
    popoutPanels: [],
    unpinnedPanels: [],
    nextZIndex: 1000,
    activePaneId: 'panelB',
  };
}

beforeEach(() => {
  resetIdCounter();
});

// ═══════════════════════════════════════════════════════════════════════
// 1. Reducer: SET_HEADER_COLLAPSED
// ═══════════════════════════════════════════════════════════════════════

describe('SET_HEADER_COLLAPSED reducer', () => {
  it('sets headerCollapsed to true on a tab group', () => {
    const state = createTwoGroupState();
    const next = dockReducer(state, {
      type: 'SET_HEADER_COLLAPSED',
      payload: { tabGroupId: 'tg_left', collapsed: true },
    });
    const tg = findTabGroupById(next.layout, 'tg_left');
    expect(tg?.headerCollapsed).toBe(true);
  });

  it('clears headerCollapsed (sets to undefined) when collapsed=false', () => {
    const state = createCollapsedSinglePanelState();
    const tg0 = findTabGroupById(state.layout, 'tg_single');
    expect(tg0?.headerCollapsed).toBe(true);

    const next = dockReducer(state, {
      type: 'SET_HEADER_COLLAPSED',
      payload: { tabGroupId: 'tg_single', collapsed: false },
    });
    const tg1 = findTabGroupById(next.layout, 'tg_single');
    expect(tg1?.headerCollapsed).toBeUndefined();
  });

  it('does not affect other tab groups', () => {
    const state = createTwoGroupState();
    const next = dockReducer(state, {
      type: 'SET_HEADER_COLLAPSED',
      payload: { tabGroupId: 'tg_left', collapsed: true },
    });
    const right = findTabGroupById(next.layout, 'tg_right');
    expect(right?.headerCollapsed).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. Reducer: MOVE_PANEL clears headerCollapsed on target
// ═══════════════════════════════════════════════════════════════════════

describe('MOVE_PANEL with collapsed target', () => {
  it('rejects center-docking into a header-collapsed group', () => {
    const state = createTwoGroupState({ leftCollapsed: true });
    const next = dockReducer(state, {
      type: 'MOVE_PANEL',
      payload: { panelId: 'panelB', targetTabGroupId: 'tg_left', position: 'center' },
    });
    // Drop refused — state unchanged
    expect(next).toBe(state);
  });

  it('rejects edge-docking against a header-collapsed target', () => {
    const state = createTwoGroupState({ leftCollapsed: true });
    const next = dockReducer(state, {
      type: 'MOVE_PANEL',
      payload: { panelId: 'panelB', targetTabGroupId: 'tg_left', position: 'right' },
    });
    expect(next).toBe(state);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. Reducer: DOCK_FLOATING clears headerCollapsed
// ═══════════════════════════════════════════════════════════════════════

describe('DOCK_FLOATING with collapsed target', () => {
  it('rejects docking a floating panel onto a header-collapsed group', () => {
    let state = createTwoGroupState({ leftCollapsed: true });
    state = dockReducer(state, {
      type: 'FLOAT_PANEL',
      payload: { panelId: 'panelB', x: 100, y: 100, width: 300, height: 200 },
    });
    expect(state.floatingPanels).toHaveLength(1);

    const next = dockReducer(state, {
      type: 'DOCK_FLOATING',
      payload: { panelId: 'panelB', targetTabGroupId: 'tg_left', position: 'center' },
    });
    // Drop refused — state unchanged, panel still floating
    expect(next).toBe(state);
    expect(next.floatingPanels).toHaveLength(1);
  });

  it('clears headerCollapsed when docking back to saved sourceTabGroupId', () => {
    // Two groups: left is collapsed with panelA. Float panelA (sourceTabGroupId=tg_left saved).
    // Add panelD to keep layout alive.
    let state = createTwoGroupState({ leftCollapsed: true });
    // First uncollapse tg_left so we can float from it (normally UI prevents drag from collapsed)
    // Actually the reducer doesn't care about UI constraints, so we can float directly
    state = dockReducer(state, {
      type: 'FLOAT_PANEL',
      payload: { panelId: 'panelA', x: 100, y: 100, width: 300, height: 200 },
    });
    // panelA is floating, tg_left should be gone (empty groups are cleaned up)
    // So when we dock back, it should fall through to first available group
    const floatingA = state.floatingPanels.find(f => f.panelId === 'panelA');
    expect(floatingA?.sourceTabGroupId).toBe('tg_left');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. Reducer: ADD_PANEL clears headerCollapsed
// ═══════════════════════════════════════════════════════════════════════

describe('ADD_PANEL with collapsed first group', () => {
  it('clears headerCollapsed when adding panel to a collapsed group', () => {
    const state = createCollapsedSinglePanelState();
    const next = dockReducer(state, {
      type: 'ADD_PANEL',
      payload: { panelId: 'newPanel', title: 'New Panel' },
    });
    const tg = findTabGroupById(next.layout, 'tg_single');
    expect(tg?.headerCollapsed).toBeUndefined();
    expect(tg?.panels).toContain('newPanel');
    expect(tg?.panels).toContain('panelA');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. Reducer: PIN_PANEL clears headerCollapsed
// ═══════════════════════════════════════════════════════════════════════

describe('PIN_PANEL with collapsed source group', () => {
  it('clears headerCollapsed when pinning panel back to collapsed group', () => {
    // Start with a collapsed single-panel state, unpin panelA, add new panel to keep layout
    let state = createTwoGroupState({ leftCollapsed: true });
    // Unpin panelA from tg_left
    state = dockReducer(state, {
      type: 'UNPIN_PANEL',
      payload: { panelId: 'panelA' },
    });
    expect(state.unpinnedPanels).toHaveLength(1);
    expect(state.unpinnedPanels[0].sourceTabGroupId).toBe('tg_left');

    // Pin panelA back — it should go to tg_left if it still exists
    // After removing panelA, tg_left is empty and gets cleaned up
    // So the pin will create a new group at the edge
    const next = dockReducer(state, {
      type: 'PIN_PANEL',
      payload: { panelId: 'panelA' },
    });
    expect(next.unpinnedPanels).toHaveLength(0);
    // panelA should be back in the layout
    const panelGroup = findTabGroupForPanel(next.layout, 'panelA');
    expect(panelGroup).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6. Reducer: CLOSE_PANEL on collapsed pane
// ═══════════════════════════════════════════════════════════════════════

describe('CLOSE_PANEL on collapsed pane', () => {
  it('removes the panel and cleans up layout when closing panel in collapsed pane', () => {
    const state = createTwoGroupState({ leftCollapsed: true });
    const next = dockReducer(state, {
      type: 'CLOSE_PANEL',
      payload: { panelId: 'panelA' },
    });
    // panelA should be gone
    expect(next.panels['panelA']).toBeUndefined();
    // tg_left should be cleaned up (no panels)
    const tg = findTabGroupById(next.layout, 'tg_left');
    expect(tg).toBeNull();
    // Other panels should still exist
    expect(next.panels['panelB']).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 7. Reducer: FLOAT_PANEL from collapsed pane
// ═══════════════════════════════════════════════════════════════════════

describe('FLOAT_PANEL from collapsed pane', () => {
  it('preserves sourceTabGroupId when floating from collapsed pane', () => {
    const state = createTwoGroupState({ leftCollapsed: true });
    const next = dockReducer(state, {
      type: 'FLOAT_PANEL',
      payload: { panelId: 'panelA', x: 100, y: 100, width: 300, height: 200 },
    });
    const floating = next.floatingPanels.find(f => f.panelId === 'panelA');
    expect(floating).toBeDefined();
    expect(floating?.sourceTabGroupId).toBe('tg_left');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 8. Reducer: MAXIMIZE_PANEL / RESTORE_PANEL with collapsed pane
// ═══════════════════════════════════════════════════════════════════════

describe('MAXIMIZE_PANEL with collapsed pane', () => {
  it('maximizes panel in collapsed pane without errors', () => {
    const state = createCollapsedSinglePanelState();
    const next = dockReducer(state, {
      type: 'MAXIMIZE_PANEL',
      payload: { panelId: 'panelA' },
    });
    expect(next.maximizedPanelId).toBe('panelA');
  });

  it('restores panel in collapsed pane without errors', () => {
    let state = createCollapsedSinglePanelState();
    state = dockReducer(state, {
      type: 'MAXIMIZE_PANEL',
      payload: { panelId: 'panelA' },
    });
    const next = dockReducer(state, {
      type: 'RESTORE_PANEL',
      payload: { panelId: 'panelA' },
    });
    expect(next.maximizedPanelId).toBeUndefined();
    // headerCollapsed should still be preserved
    const tg = findTabGroupById(next.layout, 'tg_single');
    expect(tg?.headerCollapsed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 9. Serialization round-trip
// ═══════════════════════════════════════════════════════════════════════

describe('headerCollapsed serialization', () => {
  it('headerCollapsed survives JSON round-trip', () => {
    const state = createCollapsedSinglePanelState();
    const json = JSON.stringify(state);
    const restored: DockManagerState = JSON.parse(json);
    const tg = findTabGroupById(restored.layout, 'tg_single');
    expect(tg?.headerCollapsed).toBe(true);
  });

  it('LOAD_STATE preserves headerCollapsed', () => {
    const collapsed = createCollapsedSinglePanelState();
    const initial = createTwoGroupState();
    const next = dockReducer(initial, {
      type: 'LOAD_STATE',
      payload: collapsed,
    });
    const tg = findTabGroupById(next.layout, 'tg_single');
    expect(tg?.headerCollapsed).toBe(true);
  });

  it('headerCollapsed is ignored on multi-panel groups during deserialization', () => {
    // Craft an invalid state: multi-panel group with headerCollapsed
    const state: DockManagerState = {
      layout: {
        type: 'tabgroup',
        id: 'tg_multi',
        panels: ['p1', 'p2'],
        activePanel: 'p1',
        headerCollapsed: true,
      } as TabGroupNode,
      panels: {
        p1: { id: 'p1', title: 'P1' },
        p2: { id: 'p2', title: 'P2' },
      },
      floatingPanels: [],
      popoutPanels: [],
      unpinnedPanels: [],
      nextZIndex: 1000,
      activePaneId: 'p1',
    };
    // The view should ignore this in the constructor (panels.length !== 1)
    const callbacks = makeCallbacks();
    const tgNode = state.layout as TabGroupNode;
    const view = new TabGroupView(tgNode, state.panels, 'p1', undefined, callbacks);
    // data-dock-target should be present (not removed)
    expect(view.element.getAttribute('data-dock-target')).toBe('tg_multi');
    // data-header-collapsed should NOT be set
    expect(view.element.hasAttribute('data-header-collapsed')).toBe(false);
    view.dispose();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 10. TabGroupView: data-dock-target attribute management
// ═══════════════════════════════════════════════════════════════════════

describe('TabGroupView header collapse — data-dock-target', () => {
  it('sets data-dock-target on construction for non-collapsed pane', () => {
    const node: TabGroupNode = { type: 'tabgroup', id: 'tg1', panels: ['p1'], activePanel: 'p1' };
    const panels = { p1: { id: 'p1', title: 'Panel 1' } };
    const view = new TabGroupView(node, panels, 'p1', undefined, makeCallbacks());
    expect(view.element.getAttribute('data-dock-target')).toBe('tg1');
    view.dispose();
  });

  it('keeps data-dock-target present when header is collapsed on construction', () => {
    const node: TabGroupNode = {
      type: 'tabgroup', id: 'tg1', panels: ['p1'], activePanel: 'p1', headerCollapsed: true,
    };
    const panels = { p1: { id: 'p1', title: 'Panel 1' } };
    const view = new TabGroupView(node, panels, 'p1', undefined, makeCallbacks());
    expect(view.element.getAttribute('data-dock-target')).toBe('tg1');
    expect(view.element.hasAttribute('data-header-collapsed')).toBe(true);
    view.dispose();
  });

  it('keeps data-dock-target when pill is clicked to collapse', () => {
    const callbacks = makeCallbacks();
    const node: TabGroupNode = { type: 'tabgroup', id: 'tg1', panels: ['p1'], activePanel: 'p1' };
    const panels = { p1: { id: 'p1', title: 'Panel 1' } };
    const view = new TabGroupView(node, panels, 'p1', undefined, callbacks);
    document.body.appendChild(view.element);

    // Find and click the collapse pill
    const pill = view.element.querySelector('.dock-header-collapse-pill') as HTMLButtonElement;
    expect(pill).not.toBeNull();
    pill.click();

    expect(view.element.getAttribute('data-dock-target')).toBe('tg1');
    expect(view.element.hasAttribute('data-header-collapsed')).toBe(true);
    expect(callbacks.onSetHeaderCollapsed).toHaveBeenCalledWith('tg1', true);

    // Click again to uncollapse
    // The pill is on the header which is now hidden, so use the hover zone
    const hoverZone = view.element.querySelector('.dock-header-hover-zone') as HTMLDivElement;
    expect(hoverZone).not.toBeNull();
    hoverZone.click();

    expect(view.element.getAttribute('data-dock-target')).toBe('tg1');
    expect(view.element.hasAttribute('data-header-collapsed')).toBe(false);
    expect(callbacks.onSetHeaderCollapsed).toHaveBeenCalledWith('tg1', false);

    document.body.removeChild(view.element);
    view.dispose();
  });

  it('keeps data-dock-target when multi-panel update forces uncollapse', () => {
    const callbacks = makeCallbacks();
    const node: TabGroupNode = {
      type: 'tabgroup', id: 'tg1', panels: ['p1'], activePanel: 'p1', headerCollapsed: true,
    };
    const panels = { p1: { id: 'p1', title: 'Panel 1' }, p2: { id: 'p2', title: 'Panel 2' } };
    const view = new TabGroupView(node, panels, 'p1', undefined, callbacks);

    // data-dock-target stays present even while collapsed
    expect(view.element.getAttribute('data-dock-target')).toBe('tg1');

    // Now update with two panels — should auto-uncollapse
    const updatedNode: TabGroupNode = {
      type: 'tabgroup', id: 'tg1', panels: ['p1', 'p2'], activePanel: 'p1',
    };
    view.update(updatedNode, panels, 'p1', undefined);

    // data-dock-target should be restored
    expect(view.element.getAttribute('data-dock-target')).toBe('tg1');
    expect(view.element.hasAttribute('data-header-collapsed')).toBe(false);
    // Should have notified reducer to clear collapsed state
    expect(callbacks.onSetHeaderCollapsed).toHaveBeenCalledWith('tg1', false);

    view.dispose();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 11. TabGroupView: header visibility
// ═══════════════════════════════════════════════════════════════════════

describe('TabGroupView header collapse — header visibility', () => {
  it('header is visible by default for single-tab pane', () => {
    const node: TabGroupNode = { type: 'tabgroup', id: 'tg1', panels: ['p1'], activePanel: 'p1' };
    const panels = { p1: { id: 'p1', title: 'Panel 1' } };
    const view = new TabGroupView(node, panels, 'p1', undefined, makeCallbacks());
    const header = view.element.querySelector('.dock-panel-header') as HTMLElement;
    expect(header.style.display).not.toBe('none');
    view.dispose();
  });

  it('header is hidden when headerCollapsed is true on construction', () => {
    const node: TabGroupNode = {
      type: 'tabgroup', id: 'tg1', panels: ['p1'], activePanel: 'p1', headerCollapsed: true,
    };
    const panels = { p1: { id: 'p1', title: 'Panel 1' } };
    const view = new TabGroupView(node, panels, 'p1', undefined, makeCallbacks());
    const header = view.element.querySelector('.dock-panel-header') as HTMLElement;
    expect(header.style.display).toBe('none');
    view.dispose();
  });

  it('shows collapse pill only for single-tab panes', () => {
    // Single tab — pill should exist
    const node1: TabGroupNode = { type: 'tabgroup', id: 'tg1', panels: ['p1'], activePanel: 'p1' };
    const panels = { p1: { id: 'p1', title: 'P1' }, p2: { id: 'p2', title: 'P2' } };
    const view1 = new TabGroupView(node1, panels, 'p1', undefined, makeCallbacks());
    expect(view1.element.querySelector('.dock-header-collapse-pill')).not.toBeNull();
    view1.dispose();

    // Multi tab — pill should not exist
    const node2: TabGroupNode = { type: 'tabgroup', id: 'tg2', panels: ['p1', 'p2'], activePanel: 'p1' };
    const view2 = new TabGroupView(node2, panels, 'p1', undefined, makeCallbacks());
    expect(view2.element.querySelector('.dock-header-collapse-pill')).toBeNull();
    view2.dispose();
  });

  it('hover zone exists only when header is collapsed', () => {
    const node: TabGroupNode = { type: 'tabgroup', id: 'tg1', panels: ['p1'], activePanel: 'p1' };
    const panels = { p1: { id: 'p1', title: 'Panel 1' } };
    const view = new TabGroupView(node, panels, 'p1', undefined, makeCallbacks());

    // Not collapsed — hover zone exists but only activates via CSS when collapsed
    const hoverZone = view.element.querySelector('.dock-header-hover-zone');
    expect(hoverZone).not.toBeNull();

    view.dispose();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 12. TabGroupView: update() sync from layout
// ═══════════════════════════════════════════════════════════════════════

describe('TabGroupView update() — headerCollapsed sync', () => {
  it('collapses header when update() receives headerCollapsed=true', () => {
    const node: TabGroupNode = { type: 'tabgroup', id: 'tg1', panels: ['p1'], activePanel: 'p1' };
    const panels = { p1: { id: 'p1', title: 'Panel 1' } };
    const view = new TabGroupView(node, panels, 'p1', undefined, makeCallbacks());

    expect(view.element.getAttribute('data-dock-target')).toBe('tg1');

    // Update with headerCollapsed=true (e.g., from LOAD_STATE)
    const collapsedNode: TabGroupNode = {
      type: 'tabgroup', id: 'tg1', panels: ['p1'], activePanel: 'p1', headerCollapsed: true,
    };
    view.update(collapsedNode, panels, 'p1', undefined);

    expect(view.element.getAttribute('data-dock-target')).toBe('tg1');
    expect(view.element.hasAttribute('data-header-collapsed')).toBe(true);

    view.dispose();
  });

  it('uncollapses header when update() receives headerCollapsed=false/undefined', () => {
    const node: TabGroupNode = {
      type: 'tabgroup', id: 'tg1', panels: ['p1'], activePanel: 'p1', headerCollapsed: true,
    };
    const panels = { p1: { id: 'p1', title: 'Panel 1' } };
    const view = new TabGroupView(node, panels, 'p1', undefined, makeCallbacks());

    expect(view.element.getAttribute('data-dock-target')).toBe('tg1');

    // Update without headerCollapsed
    const openNode: TabGroupNode = {
      type: 'tabgroup', id: 'tg1', panels: ['p1'], activePanel: 'p1',
    };
    view.update(openNode, panels, 'p1', undefined);

    expect(view.element.getAttribute('data-dock-target')).toBe('tg1');
    expect(view.element.hasAttribute('data-header-collapsed')).toBe(false);

    view.dispose();
  });

  it('does not collapse multi-panel groups even if headerCollapsed is set', () => {
    const node: TabGroupNode = {
      type: 'tabgroup', id: 'tg1', panels: ['p1', 'p2'], activePanel: 'p1',
      headerCollapsed: true,
    };
    const panels = { p1: { id: 'p1', title: 'P1' }, p2: { id: 'p2', title: 'P2' } };
    const view = new TabGroupView(node, panels, 'p1', undefined, makeCallbacks());

    // Should NOT be collapsed (multi-panel)
    expect(view.element.getAttribute('data-dock-target')).toBe('tg1');
    expect(view.element.hasAttribute('data-header-collapsed')).toBe(false);

    view.dispose();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 13. Edge case: transitions between single/multi panel
// ═══════════════════════════════════════════════════════════════════════

describe('TabGroupView — single/multi panel transitions', () => {
  it('collapsed single-tab → add panel → header uncollapsed with dock target', () => {
    const callbacks = makeCallbacks();
    const node: TabGroupNode = {
      type: 'tabgroup', id: 'tg1', panels: ['p1'], activePanel: 'p1', headerCollapsed: true,
    };
    const panels = {
      p1: { id: 'p1', title: 'P1' },
      p2: { id: 'p2', title: 'P2' },
    };
    const view = new TabGroupView(node, panels, 'p1', undefined, callbacks);

    // Collapsed (data-dock-target stays present)
    expect(view.element.getAttribute('data-dock-target')).toBe('tg1');
    expect(view.element.hasAttribute('data-header-collapsed')).toBe(true);

    // Panel added
    const updated: TabGroupNode = {
      type: 'tabgroup', id: 'tg1', panels: ['p1', 'p2'], activePanel: 'p1',
    };
    view.update(updated, panels, 'p1', undefined);

    // Uncollapsed
    expect(view.element.getAttribute('data-dock-target')).toBe('tg1');
    expect(view.element.hasAttribute('data-header-collapsed')).toBe(false);
    // Pill should be removed
    expect(view.element.querySelector('.dock-header-collapse-pill')).toBeNull();
    expect(view.element.querySelector('.dock-header-hover-zone')).toBeNull();
    // Reducer notified
    expect(callbacks.onSetHeaderCollapsed).toHaveBeenCalledWith('tg1', false);

    view.dispose();
  });

  it('multi-tab → remove panel → collapse pill appears', () => {
    const node: TabGroupNode = {
      type: 'tabgroup', id: 'tg1', panels: ['p1', 'p2'], activePanel: 'p1',
    };
    const panels = { p1: { id: 'p1', title: 'P1' }, p2: { id: 'p2', title: 'P2' } };
    const view = new TabGroupView(node, panels, 'p1', undefined, makeCallbacks());

    expect(view.element.querySelector('.dock-header-collapse-pill')).toBeNull();

    // Remove a panel
    const updated: TabGroupNode = {
      type: 'tabgroup', id: 'tg1', panels: ['p1'], activePanel: 'p1',
    };
    const remainingPanels = { p1: { id: 'p1', title: 'P1' } };
    view.update(updated, remainingPanels, 'p1', undefined);

    expect(view.element.querySelector('.dock-header-collapse-pill')).not.toBeNull();
    expect(view.element.querySelector('.dock-header-hover-zone')).not.toBeNull();

    view.dispose();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 14. Reducer: compound scenarios
// ═══════════════════════════════════════════════════════════════════════

describe('Compound edge cases', () => {
  it('SET_HEADER_COLLAPSED → MOVE_PANEL center is rejected', () => {
    let state = createTwoGroupState();
    state = dockReducer(state, {
      type: 'SET_HEADER_COLLAPSED',
      payload: { tabGroupId: 'tg_left', collapsed: true },
    });
    const before = state;
    state = dockReducer(state, {
      type: 'MOVE_PANEL',
      payload: { panelId: 'panelC', targetTabGroupId: 'tg_left', position: 'center' },
    });
    // Drop refused — collapsed pane stays untouched
    expect(state).toBe(before);
    const tg = findTabGroupById(state.layout, 'tg_left');
    expect(tg?.headerCollapsed).toBe(true);
    expect(tg?.panels).toEqual(['panelA']);
  });

  it('collapse → float → dock back to collapsed source is rejected', () => {
    let state = createTwoGroupState();
    state = dockReducer(state, {
      type: 'SET_HEADER_COLLAPSED',
      payload: { tabGroupId: 'tg_left', collapsed: true },
    });
    state = dockReducer(state, {
      type: 'FLOAT_PANEL',
      payload: { panelId: 'panelB', x: 100, y: 100, width: 300, height: 200 },
    });
    const before = state;
    state = dockReducer(state, {
      type: 'DOCK_FLOATING',
      payload: { panelId: 'panelB', targetTabGroupId: 'tg_left', position: 'center' },
    });
    expect(state).toBe(before);
    const tg = findTabGroupById(state.layout, 'tg_left');
    expect(tg?.headerCollapsed).toBe(true);
    expect(tg?.panels).toEqual(['panelA']);
  });

  it('collapse → unpin → pin back clears collapsed on source group', () => {
    let state: DockManagerState = {
      layout: {
        type: 'split',
        id: 'split_root',
        direction: 'horizontal',
        children: [
          {
            type: 'tabgroup',
            id: 'tg_left',
            panels: ['panelA', 'panelB'],
            activePanel: 'panelA',
          } as TabGroupNode,
          {
            type: 'tabgroup',
            id: 'tg_right',
            panels: ['panelC'],
            activePanel: 'panelC',
          } as TabGroupNode,
        ],
        sizes: [50, 50],
      } as SplitNode,
      panels: {
        panelA: { id: 'panelA', title: 'Panel A', closable: true },
        panelB: { id: 'panelB', title: 'Panel B', closable: true },
        panelC: { id: 'panelC', title: 'Panel C', closable: true },
      },
      floatingPanels: [],
      popoutPanels: [],
      unpinnedPanels: [],
      nextZIndex: 1000,
      activePaneId: 'panelA',
    };

    // Close panelB so tg_left becomes single-panel
    state = dockReducer(state, {
      type: 'CLOSE_PANEL',
      payload: { panelId: 'panelB' },
    });
    // Collapse tg_left
    state = dockReducer(state, {
      type: 'SET_HEADER_COLLAPSED',
      payload: { tabGroupId: 'tg_left', collapsed: true },
    });
    const tg1 = findTabGroupById(state.layout, 'tg_left');
    expect(tg1?.headerCollapsed).toBe(true);
    expect(tg1?.panels).toEqual(['panelA']);

    // Unpin panelC
    state = dockReducer(state, {
      type: 'UNPIN_PANEL',
      payload: { panelId: 'panelC' },
    });
    // Pin panelC back — it should go to tg_right (its source)
    // tg_right might have been cleaned up since it was empty
    state = dockReducer(state, {
      type: 'PIN_PANEL',
      payload: { panelId: 'panelC' },
    });
    // panelC should be in the layout
    const panelCGroup = findTabGroupForPanel(state.layout, 'panelC');
    expect(panelCGroup).toBeTruthy();
    // tg_left collapsed state should be unaffected (panelC goes elsewhere)
    const leftGroup = findTabGroupById(state.layout, 'tg_left');
    if (leftGroup) {
      expect(leftGroup.headerCollapsed).toBe(true);
    }
  });

  it('all panels in layout can be found even with collapsed groups', () => {
    let state = createTwoGroupState({ leftCollapsed: true });
    const allGroups = findAllTabGroups(state.layout);
    const allPanels = allGroups.flatMap(g => g.panels);
    expect(allPanels).toContain('panelA');
    expect(allPanels).toContain('panelB');
    expect(allPanels).toContain('panelC');
  });

  it('SET_ACTIVE_PANE works for panel in collapsed group', () => {
    const state = createTwoGroupState({ leftCollapsed: true });
    const next = dockReducer(state, {
      type: 'SET_ACTIVE_PANE',
      payload: { panelId: 'panelA' },
    });
    expect(next.activePaneId).toBe('panelA');
  });
});
