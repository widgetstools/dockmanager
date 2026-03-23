import { describe, it, expect, beforeEach } from 'vitest';
import {
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
  countPanels,
  detectPanelEdge,
  findTabGroupByEdge,
  setActivePanel,
  updateSizes,
  resetIdCounter,
  collectAllPanelsOrdered,
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

// ─── removePanel ────────────────────────────────────────────────────

describe('removePanel', () => {
  it('removes a panel from a tab group', () => {
    const layout = tg('tg1', ['a', 'b', 'c'], 'a');
    const result = removePanel(layout, 'b');
    expect(result.type).toBe('tabgroup');
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
    // tg1 is removed, split collapses to just tg2
    expect(result.type).toBe('tabgroup');
    expect((result as TabGroupNode).id).toBe('tg2');
  });

  it('normalizes sizes after child removal from split', () => {
    const layout = split('s1', 'horizontal', [
      tg('tg1', ['a']),
      tg('tg2', ['b']),
      tg('tg3', ['c']),
    ], [30, 40, 30]);
    const result = removePanel(layout, 'b');
    // tg2 removed, remaining sizes should normalize to 100
    expect(result.type).toBe('split');
    const s = result as SplitNode;
    expect(s.children.length).toBe(2);
    const total = s.sizes.reduce((a, b) => a + b, 0);
    expect(Math.abs(total - 100)).toBeLessThan(0.1);
  });

  it('promotes single child when split has only one child left', () => {
    const layout = split('s1', 'horizontal', [
      tg('tg1', ['a']),
      tg('tg2', ['b']),
    ]);
    const result = removePanel(layout, 'a');
    expect(result.type).toBe('tabgroup');
    expect((result as TabGroupNode).id).toBe('tg2');
  });

  it('handles nested splits correctly', () => {
    const layout = createIDELayout();
    const result = removePanel(layout, 'outline');
    // tg_right removed, root split should collapse from 3 to 2 children
    expect(result.type).toBe('split');
    const s = result as SplitNode;
    expect(s.children.length).toBe(2);
    // Sizes should be normalized
    expect(Math.abs(s.sizes.reduce((a, b) => a + b, 0) - 100)).toBeLessThan(0.1);
  });

  it('returns unchanged tree when panel not found', () => {
    const layout = tg('tg1', ['a', 'b']);
    const result = removePanel(layout, 'nonexistent');
    expect(result).toEqual(layout);
  });
});

// ─── insertInGroup ──────────────────────────────────────────────────

describe('insertInGroup', () => {
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
    expect(center.activePanel).toBe('newdoc');
  });

  it('returns unchanged tree when target not found', () => {
    const layout = tg('tg1', ['a']);
    const result = insertInGroup(layout, 'nonexistent', 'b');
    expect(result).toEqual(layout);
  });
});

// ─── insertBySplit ──────────────────────────────────────────────────

describe('insertBySplit', () => {
  it('splits right creating horizontal split', () => {
    const layout = tg('tg1', ['a']);
    const result = insertBySplit(layout, 'tg1', 'b', 'right');
    expect(result.type).toBe('split');
    const s = result as SplitNode;
    expect(s.direction).toBe('horizontal');
    expect(s.children.length).toBe(2);
    expect((s.children[0] as TabGroupNode).panels).toEqual(['a']);
    expect((s.children[1] as TabGroupNode).panels).toEqual(['b']);
  });

  it('splits bottom creating vertical split', () => {
    const layout = tg('tg1', ['a']);
    const result = insertBySplit(layout, 'tg1', 'b', 'bottom');
    expect(result.type).toBe('split');
    const s = result as SplitNode;
    expect(s.direction).toBe('vertical');
    expect((s.children[1] as TabGroupNode).panels).toEqual(['b']);
  });

  it('splits left puts new panel first', () => {
    const layout = tg('tg1', ['a']);
    const result = insertBySplit(layout, 'tg1', 'b', 'left') as SplitNode;
    expect((result.children[0] as TabGroupNode).panels).toEqual(['b']);
    expect((result.children[1] as TabGroupNode).panels).toEqual(['a']);
  });

  it('center acts as insertInGroup', () => {
    const layout = tg('tg1', ['a']);
    const result = insertBySplit(layout, 'tg1', 'b', 'center') as TabGroupNode;
    expect(result.panels).toEqual(['a', 'b']);
  });
});

// ─── insertAtEdge ───────────────────────────────────────────────────

describe('insertAtEdge', () => {
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

  it('inserts at left edge prepending', () => {
    const layout = split('s1', 'horizontal', [
      tg('tg1', ['a']),
      tg('tg2', ['b']),
    ], [60, 40]);
    const result = insertAtEdge(layout, 'c', 'left') as SplitNode;
    expect(result.children.length).toBe(3);
    expect((result.children[0] as TabGroupNode).panels).toEqual(['c']);
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
    expect(s.children.length).toBe(2);
    // First child is the original vertical split, second is new group
    expect(s.children[0].type).toBe('split');
    expect((s.children[1] as TabGroupNode).panels).toEqual(['c']);
  });

  it('wraps single tab group in new split', () => {
    const layout = tg('tg1', ['a']);
    const result = insertAtEdge(layout, 'b', 'bottom') as SplitNode;
    expect(result.direction).toBe('vertical');
    expect(result.children.length).toBe(2);
    expect((result.children[0] as TabGroupNode).panels).toEqual(['a']);
    expect((result.children[1] as TabGroupNode).panels).toEqual(['b']);
  });

  it('sizes sum to 100', () => {
    const layout = createIDELayout();
    const result = insertAtEdge(layout, 'newpanel', 'right') as SplitNode;
    const total = result.sizes.reduce((a, b) => a + b, 0);
    expect(Math.abs(total - 100)).toBeLessThan(0.1);
  });
});

// ─── movePanel ──────────────────────────────────────────────────────

describe('movePanel', () => {
  it('moves panel from one group to another (center)', () => {
    const layout = split('s1', 'horizontal', [
      tg('tg1', ['a', 'b']),
      tg('tg2', ['c']),
    ]);
    const result = movePanel(layout, 'b', 'tg2', 'center');
    const tg1 = findTabGroupById(result, 'tg1')!;
    const tg2 = findTabGroupById(result, 'tg2')!;
    expect(tg1.panels).toEqual(['a']);
    expect(tg2.panels).toContain('b');
    expect(tg2.panels).toContain('c');
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

  it('moves panel to edge split', () => {
    const layout = split('s1', 'horizontal', [
      tg('tg1', ['a', 'b']),
      tg('tg2', ['c']),
    ]);
    const result = movePanel(layout, 'a', 'tg2', 'bottom');
    // a should be in a new group below tg2
    expect(findTabGroupForPanel(result, 'a')).not.toBeNull();
    expect(findTabGroupForPanel(result, 'a')).not.toBe('tg1');
    expect(findTabGroupForPanel(result, 'a')).not.toBe('tg2');
  });

  it('collapses source when last panel is moved', () => {
    const layout = split('s1', 'horizontal', [
      tg('tg1', ['a']),
      tg('tg2', ['b']),
    ]);
    const result = movePanel(layout, 'a', 'tg2', 'center');
    // tg1 should be gone, split collapsed
    expect(result.type).toBe('tabgroup');
    expect((result as TabGroupNode).panels).toContain('a');
    expect((result as TabGroupNode).panels).toContain('b');
  });
});

// ─── Query operations ───────────────────────────────────────────────

describe('queries', () => {
  const layout = createIDELayout();

  it('findTabGroupForPanel finds correct group', () => {
    expect(findTabGroupForPanel(layout, 'doc1')).toBe('tg_center');
    expect(findTabGroupForPanel(layout, 'explorer')).toBe('tg_left');
    expect(findTabGroupForPanel(layout, 'outline')).toBe('tg_right');
    expect(findTabGroupForPanel(layout, 'nonexistent')).toBeNull();
  });

  it('findFirstTabGroup returns DFS first', () => {
    expect(findFirstTabGroup(layout)).toBe('tg_left');
  });

  it('findTabGroupById finds group', () => {
    const tg = findTabGroupById(layout, 'tg_center');
    expect(tg).not.toBeNull();
    expect(tg!.panels).toEqual(['doc1', 'doc2', 'doc3']);
  });

  it('findAllTabGroups returns all groups', () => {
    const groups = findAllTabGroups(layout);
    expect(groups.map(g => g.id)).toEqual(['tg_left', 'tg_center', 'tg_bottom', 'tg_right']);
  });

  it('collectLayoutPanelIds returns all panel IDs', () => {
    const ids = collectLayoutPanelIds(layout);
    expect(ids.size).toBe(8);
    expect(ids.has('doc1')).toBe(true);
    expect(ids.has('outline')).toBe(true);
  });

  it('countPanels returns total', () => {
    expect(countPanels(layout)).toBe(8);
  });

  it('collectAllPanelsOrdered returns DFS order', () => {
    const panels = collectAllPanelsOrdered(layout);
    expect(panels[0]).toBe('explorer');
    expect(panels[panels.length - 1]).toBe('outline');
  });
});

// ─── detectPanelEdge ────────────────────────────────────────────────

describe('detectPanelEdge', () => {
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

  it('center panel returns left (not on any specific edge)', () => {
    // Center is neither left, right, top, nor bottom — defaults to left
    const edge = detectPanelEdge(layout, 'doc1');
    // It's in the middle horizontal split child, so its path doesn't include 'left' explicitly
    // but doesn't include 'right' or 'bottom' either
    expect(['left', 'top']).toContain(edge);
  });
});

// ─── findTabGroupByEdge ─────────────────────────────────────────────

describe('findTabGroupByEdge', () => {
  it('finds left edge group', () => {
    const layout = createIDELayout();
    expect(findTabGroupByEdge(layout, 'left')).toBe('tg_left');
  });

  it('finds right edge group', () => {
    const layout = createIDELayout();
    expect(findTabGroupByEdge(layout, 'right')).toBe('tg_right');
  });

  it('returns null when edge doesnt match direction', () => {
    const layout = split('s1', 'horizontal', [tg('tg1', ['a']), tg('tg2', ['b'])]);
    expect(findTabGroupByEdge(layout, 'bottom')).toBeNull();
  });

  it('returns null for single tab group', () => {
    expect(findTabGroupByEdge(tg('tg1', ['a']), 'left')).toBeNull();
  });
});

// ─── Tree updates ───────────────────────────────────────────────────

describe('tree updates', () => {
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
    // tg1 removed → s3 collapses to tg2 → s2 has [tg2, tg3]
    expect(countPanels(result)).toBe(3);
    expect(findTabGroupForPanel(result, 'b')).not.toBeNull();
  });

  it('insertAtEdge with custom size', () => {
    const layout = tg('tg1', ['a']);
    const result = insertAtEdge(layout, 'b', 'left', 30) as SplitNode;
    expect(result.sizes[0]).toBe(30);
    expect(result.sizes[1]).toBe(70);
  });

  it('movePanel handles target group that gets collapsed after remove', () => {
    // a is in tg1 which is sibling of tg2 in a split
    // Moving a from tg1 to tg2 center when tg1 has only a
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
