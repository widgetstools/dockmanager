import { describe, it, expect, beforeEach } from 'vitest';
import {
  LayoutTree,
  removePanel,
  insertInGroup,
  insertBySplit,
  insertAtEdge,
  movePanel,
  findTabGroupForPanel,
  findFirstTabGroup,
  findTabGroupById,
  findAllTabGroups,
  collectLayoutPanelIds,
  collectAllPanelsOrdered,
  countPanels,
  detectPanelEdge,
  findTabGroupByEdge,
  setActivePanel,
  updateSizes,
  resetIdCounter,
  genId,
  isPanelPlaced,
  findNextPanel,
  findPreviousPanel,
} from '../layout/LayoutTree';
import type { LayoutNode, TabGroupNode, SplitNode } from '../types/dock';

// ─── Test fixtures ──────────────────────────────────────────────────

function tg(id: string, panels: string[], active?: string): TabGroupNode {
  return { type: 'tabgroup', id, panels, activePanel: active || panels[0] || '' };
}

function split(id: string, dir: 'horizontal' | 'vertical', children: LayoutNode[], sizes?: number[]): SplitNode {
  return {
    type: 'split', id, direction: dir, children,
    sizes: sizes || children.map(() => 100 / children.length),
  };
}

// Standard IDE-like layout:
// horizontal [tg_left(explorer,search) | vertical [tg_center(doc1,doc2) | tg_bottom(terminal)] | tg_right(outline)]
function createIDELayout(): SplitNode {
  return split('root', 'horizontal', [
    tg('tg_left', ['explorer', 'search'], 'explorer'),
    split('center_v', 'vertical', [
      tg('tg_center', ['doc1', 'doc2', 'doc3'], 'doc1'),
      tg('tg_bottom', ['terminal', 'problems'], 'terminal'),
    ], [65, 35]),
    tg('tg_right', ['outline']),
  ], [20, 58, 22]);
}

beforeEach(() => resetIdCounter());

// ─── LayoutTree class ──────────────────────────────────────────────

describe('LayoutTree class', () => {
  describe('lookups', () => {
    it('findGroup finds a tab group by ID', () => {
      const tree = new LayoutTree(createIDELayout());
      const group = tree.findGroup('tg_center');
      expect(group).not.toBeNull();
      expect(group!.panels).toEqual(['doc1', 'doc2', 'doc3']);
    });

    it('findGroup returns null for unknown ID', () => {
      const tree = new LayoutTree(tg('tg1', ['a']));
      expect(tree.findGroup('nonexistent')).toBeNull();
    });

    it('findSplit finds a split by ID', () => {
      const tree = new LayoutTree(createIDELayout());
      const s = tree.findSplit('center_v');
      expect(s).not.toBeNull();
      expect(s!.direction).toBe('vertical');
    });

    it('findSplit returns null for unknown ID', () => {
      const tree = new LayoutTree(tg('tg1', ['a']));
      expect(tree.findSplit('nonexistent')).toBeNull();
    });

    it('groupForPanel finds the group containing a panel', () => {
      const tree = new LayoutTree(createIDELayout());
      const group = tree.groupForPanel('doc2');
      expect(group).not.toBeNull();
      expect(group!.id).toBe('tg_center');
    });

    it('groupForPanel returns null for unknown panel', () => {
      const tree = new LayoutTree(tg('tg1', ['a']));
      expect(tree.groupForPanel('nonexistent')).toBeNull();
    });

    it('allGroups returns all tab groups in DFS order', () => {
      const tree = new LayoutTree(createIDELayout());
      const groups = tree.allGroups();
      expect(groups.map(g => g.id)).toEqual(['tg_left', 'tg_center', 'tg_bottom', 'tg_right']);
    });

    it('allPanelIds returns all panel IDs in DFS order', () => {
      const tree = new LayoutTree(createIDELayout());
      const ids = tree.allPanelIds();
      expect(ids).toEqual(['explorer', 'search', 'doc1', 'doc2', 'doc3', 'terminal', 'problems', 'outline']);
    });
  });

  describe('insertPanel', () => {
    it('center adds panel to group', () => {
      const root = tg('tg1', ['a', 'b']);
      const tree = new LayoutTree(root);
      const target = tree.findGroup('tg1')!;
      const newTree = tree.insertPanel(target, 'c', 'center');
      const group = newTree.findGroup('tg1')!;
      expect(group.panels).toEqual(['a', 'b', 'c']);
      expect(group.activePanel).toBe('c');
    });

    it('edge position creates a split', () => {
      const root = tg('tg1', ['a']);
      const tree = new LayoutTree(root);
      const target = tree.findGroup('tg1')!;
      const newTree = tree.insertPanel(target, 'b', 'right');
      expect(newTree.root.type).toBe('split');
      const s = newTree.root as SplitNode;
      expect(s.direction).toBe('horizontal');
      expect(s.children.length).toBe(2);
    });

    it('insertion is immutable — original tree unchanged', () => {
      const root = tg('tg1', ['a']);
      const tree = new LayoutTree(root);
      const target = tree.findGroup('tg1')!;
      tree.insertPanel(target, 'b', 'center');
      // Original tree should be unchanged
      expect((tree.root as TabGroupNode).panels).toEqual(['a']);
    });
  });

  describe('removePanel', () => {
    it('removes panel from multi-panel group', () => {
      const tree = new LayoutTree(tg('tg1', ['a', 'b', 'c']));
      const newTree = tree.removePanel('b');
      const group = newTree.findGroup('tg1')!;
      expect(group.panels).toEqual(['a', 'c']);
    });

    it('last panel removal promotes sibling', () => {
      const root = split('s1', 'horizontal', [
        tg('tg1', ['a']),
        tg('tg2', ['b', 'c']),
      ]);
      const tree = new LayoutTree(root);
      const newTree = tree.removePanel('a');
      // tg1 removed, split collapsed to tg2
      expect(newTree.root.type).toBe('tabgroup');
      expect((newTree.root as TabGroupNode).id).toBe('tg2');
    });

    it('nonexistent panel returns equivalent tree', () => {
      const root = tg('tg1', ['a', 'b']);
      const tree = new LayoutTree(root);
      const newTree = tree.removePanel('nonexistent');
      expect((newTree.root as TabGroupNode).panels).toEqual(['a', 'b']);
    });
  });

  describe('movePanel', () => {
    it('moves panel between groups', () => {
      const root = split('s1', 'horizontal', [
        tg('tg1', ['a', 'b']),
        tg('tg2', ['c']),
      ]);
      const tree = new LayoutTree(root);
      const target = tree.findGroup('tg2')!;
      const newTree = tree.movePanel('b', target, 'center');
      const g1 = newTree.findGroup('tg1')!;
      const g2 = newTree.findGroup('tg2')!;
      expect(g1.panels).toEqual(['a']);
      expect(g2.panels).toContain('b');
      expect(g2.panels).toContain('c');
    });
  });

  describe('resizeSplit', () => {
    it('updates sizes immutably', () => {
      const root = split('s1', 'horizontal', [
        tg('tg1', ['a']),
        tg('tg2', ['b']),
      ], [50, 50]);
      const tree = new LayoutTree(root);
      const s = tree.findSplit('s1')!;
      const newTree = tree.resizeSplit(s, [30, 70]);
      const newSplit = newTree.root as SplitNode;
      expect(newSplit.sizes).toEqual([30, 70]);
      // Original unchanged
      expect((tree.root as SplitNode).sizes).toEqual([50, 50]);
    });
  });

  describe('reorderTabs', () => {
    it('reorders panels in group', () => {
      const root = tg('tg1', ['a', 'b', 'c'], 'a');
      const tree = new LayoutTree(root);
      const group = tree.findGroup('tg1')!;
      const newTree = tree.reorderTabs(group, ['c', 'a', 'b']);
      const newGroup = newTree.findGroup('tg1')!;
      expect(newGroup.panels).toEqual(['c', 'a', 'b']);
      expect(newGroup.activePanel).toBe('a'); // preserved
    });
  });

  describe('setActivePanel', () => {
    it('sets active panel in group', () => {
      const root = tg('tg1', ['a', 'b', 'c'], 'a');
      const tree = new LayoutTree(root);
      const newTree = tree.setActivePanel('tg1', 'c');
      const group = newTree.findGroup('tg1')!;
      expect(group.activePanel).toBe('c');
    });
  });
});

// ─── Compat functions ──────────────────────────────────────────────

describe('compat functions', () => {
  describe('findTabGroupForPanel', () => {
    it('finds correct group', () => {
      const layout = createIDELayout();
      expect(findTabGroupForPanel(layout, 'doc1')).toBe('tg_center');
      expect(findTabGroupForPanel(layout, 'explorer')).toBe('tg_left');
      expect(findTabGroupForPanel(layout, 'nonexistent')).toBeNull();
    });
  });

  describe('findFirstTabGroup', () => {
    it('returns DFS first', () => {
      expect(findFirstTabGroup(createIDELayout())).toBe('tg_left');
    });
  });

  describe('findTabGroupById', () => {
    it('finds group', () => {
      const g = findTabGroupById(createIDELayout(), 'tg_center');
      expect(g).not.toBeNull();
      expect(g!.panels).toEqual(['doc1', 'doc2', 'doc3']);
    });
  });

  describe('findAllTabGroups', () => {
    it('returns all groups', () => {
      const groups = findAllTabGroups(createIDELayout());
      expect(groups.map(g => g.id)).toEqual(['tg_left', 'tg_center', 'tg_bottom', 'tg_right']);
    });
  });

  describe('collectAllPanelsOrdered', () => {
    it('returns DFS order', () => {
      const panels = collectAllPanelsOrdered(createIDELayout());
      expect(panels[0]).toBe('explorer');
      expect(panels[panels.length - 1]).toBe('outline');
    });
  });

  describe('collectLayoutPanelIds', () => {
    it('returns all panel IDs as Set', () => {
      const ids = collectLayoutPanelIds(createIDELayout());
      expect(ids.size).toBe(8);
      expect(ids.has('doc1')).toBe(true);
      expect(ids.has('outline')).toBe(true);
    });
  });

  describe('isPanelPlaced', () => {
    it('finds panel in layout', () => {
      const state = {
        layout: tg('tg1', ['a']),
        floatingPanels: [] as { panelId: string }[],
        unpinnedPanels: [] as { panelId: string }[],
      };
      expect(isPanelPlaced(state, 'a')).toBe(true);
      expect(isPanelPlaced(state, 'b')).toBe(false);
    });

    it('finds panel in floating', () => {
      const state = {
        layout: tg('tg1', ['a']),
        floatingPanels: [{ panelId: 'f1' }],
        unpinnedPanels: [] as { panelId: string }[],
      };
      expect(isPanelPlaced(state, 'f1')).toBe(true);
    });
  });

  describe('countPanels', () => {
    it('returns total', () => {
      expect(countPanels(createIDELayout())).toBe(8);
    });
  });

  describe('genId', () => {
    it('returns a UUID string', () => {
      const id = genId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('returns unique IDs', () => {
      const ids = new Set(Array.from({ length: 10 }, () => genId()));
      expect(ids.size).toBe(10);
    });
  });

  describe('removePanel (compat)', () => {
    it('removes a panel from a tab group', () => {
      const layout = tg('tg1', ['a', 'b', 'c'], 'a');
      const result = removePanel(layout, 'b');
      expect(result!.type).toBe('tabgroup');
      expect((result as TabGroupNode).panels).toEqual(['a', 'c']);
    });

    it('updates activePanel when active is removed', () => {
      const layout = tg('tg1', ['a', 'b'], 'a');
      const result = removePanel(layout, 'a') as TabGroupNode;
      expect(result.activePanel).toBe('b');
    });

    it('returns null when last panel is removed', () => {
      const layout = tg('tg1', ['a']);
      const result = removePanel(layout, 'a');
      expect(result).toBeNull();
    });

    it('collapses split when a child becomes empty', () => {
      const layout = split('s1', 'horizontal', [
        tg('tg1', ['a']),
        tg('tg2', ['b', 'c']),
      ]);
      const result = removePanel(layout, 'a');
      expect(result!.type).toBe('tabgroup');
      expect((result as TabGroupNode).id).toBe('tg2');
    });

    it('normalizes sizes after child removal from split', () => {
      const layout = split('s1', 'horizontal', [
        tg('tg1', ['a']),
        tg('tg2', ['b']),
        tg('tg3', ['c']),
      ], [30, 40, 30]);
      const result = removePanel(layout, 'b');
      expect(result!.type).toBe('split');
      const s = result as SplitNode;
      expect(s.children.length).toBe(2);
      const total = s.sizes.reduce((a, b) => a + b, 0);
      expect(Math.abs(total - 100)).toBeLessThan(0.1);
    });

    it('returns unchanged tree when panel not found', () => {
      const layout = tg('tg1', ['a', 'b']);
      const result = removePanel(layout, 'nonexistent');
      expect(result).toEqual(layout);
    });
  });

  describe('insertInGroup (compat)', () => {
    it('adds panel to target group', () => {
      const layout = tg('tg1', ['a', 'b']);
      const result = insertInGroup(layout, 'tg1', 'c') as TabGroupNode;
      expect(result.panels).toEqual(['a', 'b', 'c']);
      expect(result.activePanel).toBe('c');
    });

    it('finds target in nested structure', () => {
      const layout = createIDELayout();
      const result = insertInGroup(layout, 'tg_center', 'newdoc');
      const center = findTabGroupById(result, 'tg_center')!;
      expect(center.panels).toContain('newdoc');
    });

    it('returns unchanged tree when target not found', () => {
      const layout = tg('tg1', ['a']);
      const result = insertInGroup(layout, 'nonexistent', 'b');
      expect(result).toEqual(layout);
    });
  });

  describe('insertBySplit (compat)', () => {
    it('splits right creating horizontal split', () => {
      const layout = tg('tg1', ['a']);
      const result = insertBySplit(layout, 'tg1', 'b', 'right');
      expect(result.type).toBe('split');
      const s = result as SplitNode;
      expect(s.direction).toBe('horizontal');
      expect((s.children[0] as TabGroupNode).panels).toEqual(['a']);
      expect((s.children[1] as TabGroupNode).panels).toEqual(['b']);
    });

    it('center acts as insertInGroup', () => {
      const layout = tg('tg1', ['a']);
      const result = insertBySplit(layout, 'tg1', 'b', 'center') as TabGroupNode;
      expect(result.panels).toEqual(['a', 'b']);
    });
  });

  describe('insertAtEdge (compat)', () => {
    it('inserts at right edge of horizontal split', () => {
      const layout = split('s1', 'horizontal', [
        tg('tg1', ['a']),
        tg('tg2', ['b']),
      ], [60, 40]);
      const result = insertAtEdge(layout, 'c', 'right') as SplitNode;
      expect(result.children.length).toBe(3);
      expect((result.children[2] as TabGroupNode).panels).toEqual(['c']);
      expect(Math.abs(result.sizes.reduce((a, b) => a + b, 0) - 100)).toBeLessThan(0.1);
    });

    it('wraps in new split when direction doesnt match', () => {
      const layout = split('s1', 'vertical', [
        tg('tg1', ['a']),
        tg('tg2', ['b']),
      ]);
      const result = insertAtEdge(layout, 'c', 'right');
      expect(result.type).toBe('split');
      const s = result as SplitNode;
      expect(s.direction).toBe('horizontal');
      expect(s.children[0].type).toBe('split');
      expect((s.children[1] as TabGroupNode).panels).toEqual(['c']);
    });

    it('wraps single tab group in new split', () => {
      const layout = tg('tg1', ['a']);
      const result = insertAtEdge(layout, 'b', 'bottom') as SplitNode;
      expect(result.direction).toBe('vertical');
      expect(result.children.length).toBe(2);
    });
  });

  describe('movePanel (compat)', () => {
    it('moves panel from one group to another (center)', () => {
      const layout = split('s1', 'horizontal', [
        tg('tg1', ['a', 'b']),
        tg('tg2', ['c']),
      ]);
      const result = movePanel(layout, 'b', 'tg2', 'center');
      const g1 = findTabGroupById(result, 'tg1')!;
      const g2 = findTabGroupById(result, 'tg2')!;
      expect(g1.panels).toEqual(['a']);
      expect(g2.panels).toContain('b');
      expect(g2.panels).toContain('c');
    });

    it('no-op for same group center drop', () => {
      const layout = tg('tg1', ['a', 'b']);
      const result = movePanel(layout, 'a', 'tg1', 'center');
      expect(result).toEqual(layout);
    });

    it('no-op for single panel edge drop on same group', () => {
      const layout = tg('tg1', ['a']);
      const result = movePanel(layout, 'a', 'tg1', 'right');
      expect(result).toEqual(layout);
    });

    it('collapses source when last panel is moved', () => {
      const layout = split('s1', 'horizontal', [
        tg('tg1', ['a']),
        tg('tg2', ['b']),
      ]);
      const result = movePanel(layout, 'a', 'tg2', 'center');
      expect(result.type).toBe('tabgroup');
      const r = result as TabGroupNode;
      expect(r.panels).toContain('a');
      expect(r.panels).toContain('b');
    });
  });

  describe('detectPanelEdge (compat)', () => {
    const layout = createIDELayout();

    it('left panel returns left', () => {
      expect(detectPanelEdge(layout, 'explorer')).toBe('left');
    });

    it('right panel returns right', () => {
      expect(detectPanelEdge(layout, 'outline')).toBe('right');
    });

    it('bottom panel returns bottom', () => {
      expect(detectPanelEdge(layout, 'terminal')).toBe('bottom');
    });
  });

  describe('findTabGroupByEdge (compat)', () => {
    it('finds left edge group', () => {
      expect(findTabGroupByEdge(createIDELayout(), 'left')).toBe('tg_left');
    });

    it('finds right edge group', () => {
      expect(findTabGroupByEdge(createIDELayout(), 'right')).toBe('tg_right');
    });

    it('returns null when edge doesnt match direction', () => {
      const layout = split('s1', 'horizontal', [tg('tg1', ['a']), tg('tg2', ['b'])]);
      expect(findTabGroupByEdge(layout, 'bottom')).toBeNull();
    });

    it('returns null for single tab group', () => {
      expect(findTabGroupByEdge(tg('tg1', ['a']), 'left')).toBeNull();
    });
  });

  describe('tree updates (compat)', () => {
    it('setActivePanel updates active panel', () => {
      const layout = tg('tg1', ['a', 'b', 'c'], 'a');
      const result = setActivePanel(layout, 'tg1', 'c') as TabGroupNode;
      expect(result.activePanel).toBe('c');
    });

    it('updateSizes updates split sizes', () => {
      const layout = split('s1', 'horizontal', [tg('tg1', ['a']), tg('tg2', ['b'])], [50, 50]);
      const result = updateSizes(layout, 's1', [30, 70]) as SplitNode;
      expect(result.sizes).toEqual([30, 70]);
    });

    it('findNextPanel wraps around', () => {
      const layout = tg('tg1', ['a', 'b', 'c']);
      expect(findNextPanel(layout, 'c')).toBe('a');
      expect(findNextPanel(layout, 'a')).toBe('b');
    });

    it('findPreviousPanel wraps around', () => {
      const layout = tg('tg1', ['a', 'b', 'c']);
      expect(findPreviousPanel(layout, 'a')).toBe('c');
      expect(findPreviousPanel(layout, 'b')).toBe('a');
    });
  });
});

// ─── Edge cases ─────────────────────────────────────────────────────

describe('edge cases', () => {
  it('removePanel from deeply nested tree', () => {
    const layout = split('s1', 'horizontal', [
      split('s2', 'vertical', [
        split('s3', 'horizontal', [
          tg('tg1', ['a']),
          tg('tg2', ['b']),
        ]),
        tg('tg3', ['c']),
      ]),
      tg('tg4', ['d']),
    ]);
    const result = removePanel(layout, 'a');
    expect(countPanels(result!)).toBe(3);
    expect(findTabGroupForPanel(result!, 'b')).not.toBeNull();
  });

  it('insertAtEdge with custom size', () => {
    const layout = tg('tg1', ['a']);
    const result = insertAtEdge(layout, 'b', 'left', 30) as SplitNode;
    expect(result.sizes[0]).toBe(30);
    expect(result.sizes[1]).toBe(70);
  });

  it('movePanel handles target group that gets collapsed after remove', () => {
    const layout = split('s1', 'horizontal', [
      tg('tg1', ['a']),
      tg('tg2', ['b']),
    ]);
    const result = movePanel(layout, 'a', 'tg2', 'center');
    expect(result.type).toBe('tabgroup');
    const r = result as TabGroupNode;
    expect(r.panels).toContain('a');
    expect(r.panels).toContain('b');
  });
});
