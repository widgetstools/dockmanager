import { describe, it, expect, beforeEach } from 'vitest';
import { DockviewApi } from '../api/DockviewApi';
import { dockReducer, createDefaultState } from '../reducer/dockReducer';
import type { DockManagerState, TabGroupNode } from '../types/dock';
import { resetIdCounter } from '../layout/LayoutTree';

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

function createApiWithState(
  initialState: DockManagerState,
): { api: DockviewApi; getState: () => DockManagerState } {
  let state = initialState;
  const getState = () => state;
  const dispatch = (action: any) => {
    state = dockReducer(state, action);
  };
  return { api: new DockviewApi(getState, dispatch), getState };
}

/** Reusable state: split layout with three tab groups */
function createTestState(): DockManagerState {
  return {
    layout: {
      type: 'split',
      id: 'split_root',
      direction: 'horizontal',
      children: [
        {
          type: 'tabgroup',
          id: 'tg_left',
          panels: ['explorer'],
          activePanel: 'explorer',
        },
        {
          type: 'split',
          id: 'split_center',
          direction: 'vertical',
          children: [
            {
              type: 'tabgroup',
              id: 'tg_center',
              panels: ['doc1', 'doc2', 'doc3'],
              activePanel: 'doc1',
            },
            {
              type: 'tabgroup',
              id: 'tg_bottom',
              panels: ['terminal'],
              activePanel: 'terminal',
            },
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetIdCounter();
});

// ── 1. State queries ─────────────────────────────────────────────────────

describe('State queries', () => {
  it('activePanelId returns the current active pane id', () => {
    const { api } = createApiWithState(createTestState());
    expect(api.activePanelId).toBe('doc1');
  });

  it('panelCount returns total number of panels', () => {
    const { api } = createApiWithState(createTestState());
    expect(api.panelCount).toBe(5);
  });

  it('hasPanel returns true for existing panel', () => {
    const { api } = createApiWithState(createTestState());
    expect(api.hasPanel('doc1')).toBe(true);
  });

  it('hasPanel returns false for non-existing panel', () => {
    const { api } = createApiWithState(createTestState());
    expect(api.hasPanel('nope')).toBe(false);
  });

  it('getPanel returns panel config for existing panel', () => {
    const { api } = createApiWithState(createTestState());
    const panel = api.getPanel('doc1');
    expect(panel).toBeDefined();
    expect(panel!.title).toBe('Document 1');
  });

  it('getPanel returns undefined for non-existing panel', () => {
    const { api } = createApiWithState(createTestState());
    expect(api.getPanel('missing')).toBeUndefined();
  });

  it('isFloating returns false for a docked panel', () => {
    const { api } = createApiWithState(createTestState());
    expect(api.isFloating('doc1')).toBe(false);
  });

  it('isActive returns true for the active pane', () => {
    const { api } = createApiWithState(createTestState());
    expect(api.isActive('doc1')).toBe(true);
    expect(api.isActive('doc2')).toBe(false);
  });

  it('isMaximized returns false when nothing is maximized', () => {
    const { api } = createApiWithState(createTestState());
    expect(api.isMaximized('doc1')).toBe(false);
  });

  it('maximizedPanelId returns undefined when nothing is maximized', () => {
    const { api } = createApiWithState(createTestState());
    expect(api.maximizedPanelId).toBeUndefined();
  });

  it('getAllPanelIds returns all panel IDs', () => {
    const { api } = createApiWithState(createTestState());
    const ids = api.getAllPanelIds();
    expect(ids).toHaveLength(5);
    expect(ids).toContain('explorer');
    expect(ids).toContain('doc1');
    expect(ids).toContain('terminal');
  });

  it('getLayoutPanelIds returns panels in layout order', () => {
    const { api } = createApiWithState(createTestState());
    const ids = api.getLayoutPanelIds();
    expect(ids).toEqual(['explorer', 'doc1', 'doc2', 'doc3', 'terminal']);
  });

  it('isPanelPlaced returns true for panels in the layout', () => {
    const { api } = createApiWithState(createTestState());
    expect(api.isPanelPlaced('doc1')).toBe(true);
  });

  it('getGroupForPanel returns the tab group ID for a panel', () => {
    const { api } = createApiWithState(createTestState());
    expect(api.getGroupForPanel('doc1')).toBe('tg_center');
    expect(api.getGroupForPanel('explorer')).toBe('tg_left');
  });

  it('getGroupForPanel returns null for missing panel', () => {
    const { api } = createApiWithState(createTestState());
    expect(api.getGroupForPanel('nope')).toBeNull();
  });

  it('getGroup returns a tab group by ID', () => {
    const { api } = createApiWithState(createTestState());
    const group = api.getGroup('tg_center');
    expect(group).toBeDefined();
    expect(group!.panels).toEqual(['doc1', 'doc2', 'doc3']);
  });

  it('getGroup returns null for unknown ID', () => {
    const { api } = createApiWithState(createTestState());
    expect(api.getGroup('unknown')).toBeNull();
  });

  it('getAllGroups returns all tab groups', () => {
    const { api } = createApiWithState(createTestState());
    const groups = api.getAllGroups();
    expect(groups).toHaveLength(3);
    const ids = groups.map((g) => g.id);
    expect(ids).toContain('tg_left');
    expect(ids).toContain('tg_center');
    expect(ids).toContain('tg_bottom');
  });

  it('getFloatingPanels returns empty array when none are floating', () => {
    const { api } = createApiWithState(createTestState());
    expect(api.getFloatingPanels()).toEqual([]);
  });

  it('layout getter returns the layout tree', () => {
    const { api } = createApiWithState(createTestState());
    expect(api.layout.type).toBe('split');
  });

  it('state getter returns the full state', () => {
    const { api } = createApiWithState(createTestState());
    const s = api.state;
    expect(s.panels).toBeDefined();
    expect(s.layout).toBeDefined();
  });
});

// ── 2. addPanel ──────────────────────────────────────────────────────────

describe('addPanel', () => {
  it('adds a panel to the first tab group', () => {
    const { api, getState } = createApiWithState(createTestState());
    api.addPanel({ id: 'newPanel', title: 'New Panel' });
    expect(api.hasPanel('newPanel')).toBe(true);
    expect(api.panelCount).toBe(6);
    // Should be added to the first tab group (tg_left)
    expect(api.getGroupForPanel('newPanel')).toBe('tg_left');
  });

  it('sets the new panel as active pane', () => {
    const { api } = createApiWithState(createTestState());
    api.addPanel({ id: 'newPanel', title: 'New Panel' });
    expect(api.activePanelId).toBe('newPanel');
  });

  it('adds panel with custom properties', () => {
    const { api } = createApiWithState(createTestState());
    api.addPanel({
      id: 'custom',
      title: 'Custom Panel',
      icon: 'star',
      closable: false,
      floatable: false,
      tabComponent: 'CustomTab',
    });
    const panel = api.getPanel('custom');
    expect(panel).toBeDefined();
    expect(panel!.icon).toBe('star');
    expect(panel!.closable).toBe(false);
    expect(panel!.floatable).toBe(false);
    expect(panel!.tabComponent).toBe('CustomTab');
  });

  it('does not duplicate an existing panel', () => {
    const { api } = createApiWithState(createTestState());
    api.addPanel({ id: 'doc1', title: 'Duplicate Doc 1' });
    // Panel should still exist but title should NOT change (duplicate is a no-op)
    expect(api.panelCount).toBe(5);
    expect(api.getPanel('doc1')!.title).toBe('Document 1');
  });

  it('adds panel to a specific target group with center position', () => {
    const { api } = createApiWithState(createTestState());
    api.addPanel({
      id: 'newPanel',
      title: 'New Panel',
      targetGroupId: 'tg_bottom',
      position: 'center',
    });
    expect(api.getGroupForPanel('newPanel')).toBe('tg_bottom');
  });

  it('adds panel to a target with edge position (creates split)', () => {
    const { api } = createApiWithState(createTestState());
    api.addPanel({
      id: 'sidebar',
      title: 'Sidebar',
      targetGroupId: 'tg_center',
      position: 'right',
    });
    expect(api.hasPanel('sidebar')).toBe(true);
    // The panel should be in its own new tab group (split was created)
    const groupId = api.getGroupForPanel('sidebar');
    expect(groupId).not.toBe('tg_center');
    expect(groupId).not.toBeNull();
  });

  it('adds panel to empty state', () => {
    const { api } = createApiWithState(createDefaultState());
    api.addPanel({ id: 'first', title: 'First' });
    expect(api.panelCount).toBe(1);
    expect(api.hasPanel('first')).toBe(true);
    expect(api.activePanelId).toBe('first');
  });
});

// ── 3. closePanel ────────────────────────────────────────────────────────

describe('closePanel', () => {
  it('removes the panel from the state', () => {
    const { api } = createApiWithState(createTestState());
    api.closePanel('doc2');
    expect(api.hasPanel('doc2')).toBe(false);
    expect(api.panelCount).toBe(4);
  });

  it('falls back active pane when closing the active panel', () => {
    const { api } = createApiWithState(createTestState());
    expect(api.activePanelId).toBe('doc1');
    api.closePanel('doc1');
    expect(api.activePanelId).not.toBe('doc1');
    // Should fall back to another panel in the layout
    expect(api.activePanelId).toBeTruthy();
  });

  it('closing a non-active panel does not change active pane', () => {
    const { api } = createApiWithState(createTestState());
    expect(api.activePanelId).toBe('doc1');
    api.closePanel('doc3');
    expect(api.activePanelId).toBe('doc1');
  });

  it('closing all panels leaves an empty state', () => {
    const { api } = createApiWithState(createTestState());
    api.closePanel('explorer');
    api.closePanel('doc1');
    api.closePanel('doc2');
    api.closePanel('doc3');
    api.closePanel('terminal');
    expect(api.panelCount).toBe(0);
    expect(api.activePanelId).toBe('');
  });

  it('closing a maximized panel clears maximizedPanelId', () => {
    const { api } = createApiWithState(createTestState());
    api.maximizePanel('doc1');
    expect(api.maximizedPanelId).toBe('doc1');
    api.closePanel('doc1');
    expect(api.maximizedPanelId).toBeUndefined();
  });
});

// ── 4. movePanel ─────────────────────────────────────────────────────────

describe('movePanel', () => {
  it('moves a panel to another tab group (center)', () => {
    const { api } = createApiWithState(createTestState());
    api.movePanel({
      panelId: 'doc1',
      targetGroupId: 'tg_bottom',
      position: 'center',
    });
    expect(api.getGroupForPanel('doc1')).toBe('tg_bottom');
  });

  it('sets the moved panel as active pane', () => {
    const { api } = createApiWithState(createTestState());
    api.movePanel({
      panelId: 'terminal',
      targetGroupId: 'tg_center',
      position: 'center',
    });
    expect(api.activePanelId).toBe('terminal');
  });

  it('moves a panel to an edge position (creates split)', () => {
    const { api } = createApiWithState(createTestState());
    const groupsBefore = api.getAllGroups().length;
    api.movePanel({
      panelId: 'doc1',
      targetGroupId: 'tg_bottom',
      position: 'right',
    });
    // Should create a new tab group for doc1
    const groupId = api.getGroupForPanel('doc1');
    expect(groupId).not.toBe('tg_bottom');
    expect(groupId).not.toBeNull();
    // Number of groups should increase
    expect(api.getAllGroups().length).toBeGreaterThanOrEqual(groupsBefore);
  });

  it('moving a panel center to its current group is a no-op', () => {
    const { api, getState } = createApiWithState(createTestState());
    const before = getState();
    api.movePanel({
      panelId: 'doc1',
      targetGroupId: 'tg_center',
      position: 'center',
    });
    // State should be identical reference (no-op)
    expect(getState()).toBe(before);
  });
});

// ── 5. floatPanel / dockFloatingPanel ────────────────────────────────────

describe('floatPanel', () => {
  it('removes the panel from layout and adds to floating', () => {
    const { api } = createApiWithState(createTestState());
    api.floatPanel({ panelId: 'doc1' });
    expect(api.isFloating('doc1')).toBe(true);
    expect(api.getGroupForPanel('doc1')).toBeNull();
    expect(api.getFloatingPanels()).toHaveLength(1);
  });

  it('sets the floated panel as active', () => {
    const { api } = createApiWithState(createTestState());
    api.floatPanel({ panelId: 'doc2' });
    expect(api.activePanelId).toBe('doc2');
  });

  it('uses default position when not specified', () => {
    const { api } = createApiWithState(createTestState());
    api.floatPanel({ panelId: 'doc1' });
    const fp = api.getFloatingPanels()[0];
    expect(fp.x).toBe(100);
    expect(fp.y).toBe(100);
    expect(fp.width).toBe(400);
    expect(fp.height).toBe(300);
  });

  it('uses custom position when specified', () => {
    const { api } = createApiWithState(createTestState());
    api.floatPanel({ panelId: 'doc1', x: 50, y: 60, width: 500, height: 400 });
    const fp = api.getFloatingPanels()[0];
    expect(fp.x).toBe(50);
    expect(fp.y).toBe(60);
    expect(fp.width).toBe(500);
    expect(fp.height).toBe(400);
  });

  it('isPanelPlaced still returns true for a floating panel', () => {
    const { api } = createApiWithState(createTestState());
    api.floatPanel({ panelId: 'doc1' });
    expect(api.isPanelPlaced('doc1')).toBe(true);
  });
});

describe('dockFloatingPanel', () => {
  it('moves a floating panel back into the layout', () => {
    const { api } = createApiWithState(createTestState());
    api.floatPanel({ panelId: 'doc1' });
    expect(api.isFloating('doc1')).toBe(true);
    api.dockFloatingPanel('doc1');
    expect(api.isFloating('doc1')).toBe(false);
    expect(api.getGroupForPanel('doc1')).not.toBeNull();
  });

  it('docks to a specific target group', () => {
    const { api } = createApiWithState(createTestState());
    api.floatPanel({ panelId: 'doc1' });
    api.dockFloatingPanel('doc1', 'tg_bottom', 'center');
    expect(api.getGroupForPanel('doc1')).toBe('tg_bottom');
  });

  it('sets the docked panel as active', () => {
    const { api } = createApiWithState(createTestState());
    api.floatPanel({ panelId: 'doc2' });
    api.dockFloatingPanel('doc2');
    expect(api.activePanelId).toBe('doc2');
  });
});

// ── 6. maximizePanel / restorePanel / toggleMaximize ─────────────────────

describe('maximizePanel', () => {
  it('sets the maximized panel ID', () => {
    const { api } = createApiWithState(createTestState());
    api.maximizePanel('doc1');
    expect(api.maximizedPanelId).toBe('doc1');
    expect(api.isMaximized('doc1')).toBe(true);
  });

  it('sets the maximized panel as active pane', () => {
    const { api } = createApiWithState(createTestState());
    api.maximizePanel('doc2');
    expect(api.activePanelId).toBe('doc2');
  });

  it('does nothing for a non-existing panel', () => {
    const { api, getState } = createApiWithState(createTestState());
    const before = getState();
    api.maximizePanel('nonexistent');
    expect(getState()).toBe(before);
  });
});

describe('restorePanel', () => {
  it('clears the maximized panel ID', () => {
    const { api } = createApiWithState(createTestState());
    api.maximizePanel('doc1');
    expect(api.maximizedPanelId).toBe('doc1');
    api.restorePanel();
    expect(api.maximizedPanelId).toBeUndefined();
  });
});

describe('toggleMaximize', () => {
  it('maximizes a non-maximized panel', () => {
    const { api } = createApiWithState(createTestState());
    api.toggleMaximize('doc1');
    expect(api.isMaximized('doc1')).toBe(true);
  });

  it('restores a maximized panel', () => {
    const { api } = createApiWithState(createTestState());
    api.maximizePanel('doc1');
    api.toggleMaximize('doc1');
    expect(api.maximizedPanelId).toBeUndefined();
  });

  it('switching maximize from one panel to another', () => {
    const { api } = createApiWithState(createTestState());
    api.maximizePanel('doc1');
    api.toggleMaximize('doc2');
    expect(api.isMaximized('doc2')).toBe(true);
    expect(api.isMaximized('doc1')).toBe(false);
  });
});

// ── 7. navigateNext / navigatePrevious ───────────────────────────────────

describe('navigateNext', () => {
  it('navigates to the next panel in DFS order', () => {
    const { api } = createApiWithState(createTestState());
    // Active is doc1. DFS order: explorer, doc1, doc2, doc3, terminal
    api.navigateNext();
    expect(api.activePanelId).toBe('doc2');
  });

  it('wraps around from the last panel to the first', () => {
    const { api } = createApiWithState(createTestState());
    api.setActivePane('terminal');
    api.navigateNext();
    expect(api.activePanelId).toBe('explorer');
  });
});

describe('navigatePrevious', () => {
  it('navigates to the previous panel in DFS order', () => {
    const { api } = createApiWithState(createTestState());
    // Active is doc1 (index 1). Previous should be explorer (index 0)
    api.navigatePrevious();
    expect(api.activePanelId).toBe('explorer');
  });

  it('wraps around from the first panel to the last', () => {
    const { api } = createApiWithState(createTestState());
    api.setActivePane('explorer');
    api.navigatePrevious();
    expect(api.activePanelId).toBe('terminal');
  });
});

// ── 8. updatePanel ───────────────────────────────────────────────────────

describe('updatePanel', () => {
  it('updates the title of a panel', () => {
    const { api } = createApiWithState(createTestState());
    api.updatePanel('doc1', { title: 'Renamed Doc' });
    expect(api.getPanel('doc1')!.title).toBe('Renamed Doc');
  });

  it('updates the icon of a panel', () => {
    const { api } = createApiWithState(createTestState());
    api.updatePanel('doc1', { icon: 'file' });
    expect(api.getPanel('doc1')!.icon).toBe('file');
  });

  it('does not affect other panels', () => {
    const { api } = createApiWithState(createTestState());
    api.updatePanel('doc1', { title: 'Changed' });
    expect(api.getPanel('doc2')!.title).toBe('Document 2');
  });

  it('does nothing for a non-existing panel', () => {
    const { api, getState } = createApiWithState(createTestState());
    const before = getState();
    api.updatePanel('nonexistent', { title: 'Ghost' });
    expect(getState()).toBe(before);
  });

  it('can update multiple properties at once', () => {
    const { api } = createApiWithState(createTestState());
    api.updatePanel('doc1', { title: 'New Title', icon: 'edit', closable: false });
    const panel = api.getPanel('doc1')!;
    expect(panel.title).toBe('New Title');
    expect(panel.icon).toBe('edit');
    expect(panel.closable).toBe(false);
  });
});

// ── 9. closeAllPanels ────────────────────────────────────────────────────

describe('closeAllPanels', () => {
  it('removes all panels', () => {
    const { api } = createApiWithState(createTestState());
    api.closeAllPanels();
    expect(api.panelCount).toBe(0);
    expect(api.getAllPanelIds()).toEqual([]);
  });

  it('clears active pane', () => {
    const { api } = createApiWithState(createTestState());
    api.closeAllPanels();
    expect(api.activePanelId).toBe('');
  });

  it('clears maximized panel', () => {
    const { api } = createApiWithState(createTestState());
    api.maximizePanel('doc1');
    api.closeAllPanels();
    expect(api.maximizedPanelId).toBeUndefined();
  });

  it('works on already empty state', () => {
    const { api } = createApiWithState(createDefaultState());
    api.closeAllPanels();
    expect(api.panelCount).toBe(0);
  });

  it('also removes floating panels', () => {
    const { api } = createApiWithState(createTestState());
    api.floatPanel({ panelId: 'doc1' });
    expect(api.getFloatingPanels()).toHaveLength(1);
    api.closeAllPanels();
    expect(api.getFloatingPanels()).toEqual([]);
    expect(api.panelCount).toBe(0);
  });
});

// ── 10. setActivePane / setActivePanel ───────────────────────────────────

describe('setActivePane', () => {
  it('sets the globally active pane', () => {
    const { api } = createApiWithState(createTestState());
    api.setActivePane('doc2');
    expect(api.activePanelId).toBe('doc2');
  });

  it('does nothing for a non-existing panel', () => {
    const { api } = createApiWithState(createTestState());
    api.setActivePane('nonexistent');
    expect(api.activePanelId).toBe('doc1');
  });
});

describe('setActivePanel', () => {
  it('sets the active tab within a tab group', () => {
    const { api } = createApiWithState(createTestState());
    api.setActivePanel('tg_center', 'doc2');
    const group = api.getGroup('tg_center');
    expect(group!.activePanel).toBe('doc2');
  });

  it('does not change activePanel if panelId is not in that group', () => {
    const { api } = createApiWithState(createTestState());
    api.setActivePanel('tg_center', 'explorer');
    const group = api.getGroup('tg_center');
    // explorer is not in tg_center, so activePanel should remain doc1
    expect(group!.activePanel).toBe('doc1');
  });
});

// ── 11. Additional operations ────────────────────────────────────────────

describe('updateFloatingPanel', () => {
  it('updates the position of a floating panel', () => {
    const { api } = createApiWithState(createTestState());
    api.floatPanel({ panelId: 'doc1' });
    api.updateFloatingPanel('doc1', { x: 200, y: 300 });
    const fp = api.getFloatingPanels().find((p) => p.panelId === 'doc1')!;
    expect(fp.x).toBe(200);
    expect(fp.y).toBe(300);
    // Width and height should remain from the original float
    expect(fp.width).toBe(400);
    expect(fp.height).toBe(300);
  });
});

describe('bringToFront', () => {
  it('increases the zIndex of a floating panel', () => {
    const { api } = createApiWithState(createTestState());
    api.floatPanel({ panelId: 'doc1' });
    api.floatPanel({ panelId: 'doc2' });
    const z1Before = api.getFloatingPanels().find((p) => p.panelId === 'doc1')!.zIndex;
    api.bringToFront('doc1');
    const z1After = api.getFloatingPanels().find((p) => p.panelId === 'doc1')!.zIndex;
    expect(z1After).toBeGreaterThan(z1Before);
  });

  it('sets the panel as active pane', () => {
    const { api } = createApiWithState(createTestState());
    api.floatPanel({ panelId: 'doc1' });
    api.floatPanel({ panelId: 'doc2' });
    api.bringToFront('doc1');
    expect(api.activePanelId).toBe('doc1');
  });
});

describe('resizeSplit', () => {
  it('updates split sizes', () => {
    const { api } = createApiWithState(createTestState());
    api.resizeSplit('split_root', [30, 70]);
    const layout = api.layout;
    expect(layout.type).toBe('split');
    if (layout.type === 'split') {
      expect(layout.sizes).toEqual([30, 70]);
    }
  });
});

describe('setHeaderPosition', () => {
  it('sets the header position on a tab group', () => {
    const { api } = createApiWithState(createTestState());
    api.setHeaderPosition('tg_center', 'bottom');
    const group = api.getGroup('tg_center');
    expect(group!.headerPosition).toBe('bottom');
  });

  it('clears the header position when set to undefined', () => {
    const { api } = createApiWithState(createTestState());
    api.setHeaderPosition('tg_center', 'left');
    api.setHeaderPosition('tg_center', undefined);
    const group = api.getGroup('tg_center');
    expect(group!.headerPosition).toBeUndefined();
  });
});

describe('loadState', () => {
  it('replaces the entire state', () => {
    const { api } = createApiWithState(createTestState());
    const freshState = createDefaultState();
    api.loadState(freshState);
    expect(api.panelCount).toBe(0);
    expect(api.activePanelId).toBe('');
  });
});

describe('unpinPanel', () => {
  it('removes the panel from layout and adds to unpinned', () => {
    const { api, getState } = createApiWithState(createTestState());
    api.unpinPanel('explorer');
    expect(api.getGroupForPanel('explorer')).toBeNull();
    expect(getState().unpinnedPanels.some((p) => p.panelId === 'explorer')).toBe(true);
  });
});

describe('complex workflows', () => {
  it('add then float then dock a panel', () => {
    const { api } = createApiWithState(createDefaultState());
    api.addPanel({ id: 'p1', title: 'Panel 1' });
    api.addPanel({ id: 'p2', title: 'Panel 2' });
    expect(api.panelCount).toBe(2);

    api.floatPanel({ panelId: 'p1', x: 10, y: 20, width: 300, height: 200 });
    expect(api.isFloating('p1')).toBe(true);

    api.dockFloatingPanel('p1');
    expect(api.isFloating('p1')).toBe(false);
    expect(api.isPanelPlaced('p1')).toBe(true);
  });

  it('navigate through panels sequentially', () => {
    const { api } = createApiWithState(createTestState());
    // Starting at doc1
    const visited: string[] = [api.activePanelId];
    for (let i = 0; i < 4; i++) {
      api.navigateNext();
      visited.push(api.activePanelId);
    }
    // Should visit doc2, doc3, terminal, explorer
    expect(visited).toEqual(['doc1', 'doc2', 'doc3', 'terminal', 'explorer']);
  });

  it('maximize then navigate then restore', () => {
    const { api } = createApiWithState(createTestState());
    api.maximizePanel('doc1');
    expect(api.isMaximized('doc1')).toBe(true);
    api.navigateNext();
    expect(api.activePanelId).toBe('doc2');
    api.restorePanel();
    expect(api.maximizedPanelId).toBeUndefined();
  });
});
