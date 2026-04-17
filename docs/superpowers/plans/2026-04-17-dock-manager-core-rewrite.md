# dock-manager-core Lean Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite dock-manager-core to ~5K lines (from ~10.4K source) using a single Placement Map, immutable LayoutTree class, consolidated 16-action reducer, and 6-file DOM layer — while preserving the full public API surface so all 59 e2e tests and both React/Angular wrappers pass unchanged.

**Architecture:** Replace the parallel-collection state shape (`floatingPanels[]`, `unpinnedPanels[]`, `popoutPanels[]`) with a single `Map<string, Placement>`. Replace procedural layout tree functions with an immutable `LayoutTree` class using validated-input pattern. Merge 18+ DOM files into 6 focused files. Use `crypto.randomUUID()` for all node IDs.

**Tech Stack:** TypeScript 5.9, Vitest, Playwright, zero runtime dependencies

**Spec:** `docs/superpowers/specs/2026-04-17-dock-manager-core-rewrite-design.md`

---

## File Structure

### New/Rewritten Files

| File | Responsibility | Est. Lines |
|------|---------------|------------|
| `src/types/dock.ts` | `Placement` union, `DockManagerState` with placements map, `LayoutNode`/`TabGroupNode`/`SplitNode`, all shared types | ~200 |
| `src/layout/LayoutTree.ts` | Immutable `LayoutTree` class: find, insert, remove, move, resize. `crypto.randomUUID()` IDs | ~250 |
| `src/reducer/dockReducer.ts` | 16-action reducer, `createDefaultState`, `validateState` | ~300 |
| `src/serialization/serializer.ts` | v3 format (placement map), v1/v2 migration, localStorage/file/URL persistence | ~250 |
| `src/api/DockviewApi.ts` | Same public methods, reads placement map internally | ~400 |
| `src/dom/DockviewComponent.ts` | Orchestrator: root DOM, view lifecycle, render containers, focus, state history | ~600 |
| `src/dom/views/TabGroupView.ts` | Tab group rendering, context menu (inline), tab overflow (ResizeObserver) | ~500 |
| `src/dom/views/SplitView.ts` | Flexbox splits with draggable splitters | ~200 |
| `src/dom/views/FloatingWindowView.ts` | Floating windows, 8-direction resize | ~300 |
| `src/dom/DragManager.ts` | All drag-and-drop: tab drag, tab reorder, drop indicators | ~400 |
| `src/dom/Overlays.ts` | Unpinned strips, maximize overlay, pane navigator, panel finder | ~300 |
| `src/index.ts` | Public exports (same API surface) | ~130 |

### Unchanged Files (Copy As-Is)

| File | Lines |
|------|-------|
| `src/api/PanelApi.ts` | 223 |
| `src/theme/DockTheme.ts` | 327 |
| `src/utils/lifecycle.ts` | 161 |
| `src/utils/debug.ts` | 67 |
| `src/dom/icons.ts` | 69 |
| `src/dom/styleInjector.ts` | 63 |
| `src/dom/EventEmitter.ts` | 21 |
| `src/types/resourceStrings.ts` | 33 |
| `src/styles/dock-manager.css` | 770 |

### Files Eliminated (Merged Into Above)

| Current File | Merged Into |
|---|---|
| `src/dom/ContextMenuManager.ts` (344 lines) | `TabGroupView.ts` (inline ~60 lines) |
| `src/dom/DockDragManager.ts` (584 lines) | `DragManager.ts` |
| `src/dom/DockIndicatorRenderer.ts` (470 lines) | `DragManager.ts` |
| `src/dom/TabReorderManager.ts` (175 lines) | `DragManager.ts` |
| `src/dom/FocusManager.ts` (145 lines) | `DockviewComponent.ts` (inline) |
| `src/dom/StateHistoryManager.ts` (71 lines) | `DockviewComponent.ts` (inline) |
| `src/dom/RenderContainerManager.ts` (175 lines) | `DockviewComponent.ts` (inline) |
| `src/dom/KeyboardManager.ts` (270 lines) | `DockviewComponent.ts` (inline) |
| `src/dom/TabOverflowObserver.ts` (154 lines) | `TabGroupView.ts` (20-line ResizeObserver) |
| `src/dom/PopoutWindowManager.ts` (208 lines) | `DockviewComponent.ts` (inline) |
| `src/dom/PaneNavigator.ts` (238 lines) | `Overlays.ts` |
| `src/dom/PanelFinder.ts` (140 lines) | `Overlays.ts` |
| `src/dom/views/UnpinnedStripView.ts` (358 lines) | `Overlays.ts` |
| `src/dom/views/MaximizeOverlayView.ts` (106 lines) | `Overlays.ts` |
| `src/layout/layoutInvariants.ts` (174 lines) | `LayoutTree.ts` (most checks eliminated by structure) |

---

## Execution Strategy

The rewrite happens on a fresh `rewrite/lean-core` branch. We build bottom-up: types → layout tree → reducer → serialization → API → DOM. Each layer is fully tested before the next starts. E2e tests run at the end against the complete stack.

**Critical constraint:** The public API surface exported from `src/index.ts` must remain identical. The React wrapper (`DockManagerCore.tsx`) and Angular wrapper import these types and classes — they must compile without changes if the API surface is preserved.

---

## Task 1: Create Branch and Scaffold

**Files:**
- Modify: `packages/dock-manager-core/src/` (directory structure)

- [ ] **Step 1: Create the rewrite branch from main**

```bash
cd /Users/develop/projects/dockmanager
git checkout main
git checkout -b rewrite/lean-core
```

- [ ] **Step 2: Verify current tests pass (baseline)**

```bash
cd /Users/develop/projects/dockmanager
npx vitest run --root packages/dock-manager-core 2>&1 | tail -5
```

Expected: All 682+ tests pass.

- [ ] **Step 3: Verify current e2e tests pass (baseline)**

```bash
npx playwright test 2>&1 | tail -10
```

Expected: All 59 tests pass.

- [ ] **Step 4: Commit baseline**

```bash
git add -A
git commit -m "chore: create rewrite/lean-core branch from main"
```

---

## Task 2: New Types — Placement Map & State Shape

**Files:**
- Create: `packages/dock-manager-core/src/types/dock.ts` (rewrite)
- Test: `packages/dock-manager-core/src/__tests__/types.test.ts`

This task replaces the current `dock.ts` types with the new Placement-based state shape. The old types (`FloatingPanel`, `UnpinnedPanel`, `PopoutPanel`) are replaced by the `Placement` union. `DockManagerState` changes from separate arrays to a `placements` map.

- [ ] **Step 1: Write type tests**

```ts
// packages/dock-manager-core/src/__tests__/types.test.ts
import { describe, test, expect } from 'vitest';
import type {
  Placement,
  DockManagerState,
  TabGroupNode,
  SplitNode,
  LayoutNode,
  PanelConfig,
} from '../types/dock';
import { createPreventableEvent } from '../types/dock';

describe('Placement type', () => {
  test('docked placement has groupId', () => {
    const p: Placement = { type: 'docked', groupId: 'g1' };
    expect(p.type).toBe('docked');
    expect(p.groupId).toBe('g1');
  });

  test('floating placement has position and size', () => {
    const p: Placement = {
      type: 'floating', x: 100, y: 200, width: 400, height: 300,
      zIndex: 5,
    };
    expect(p.type).toBe('floating');
    expect(p.zIndex).toBe(5);
  });

  test('unpinned placement has edge and size', () => {
    const p: Placement = { type: 'unpinned', edge: 'left', size: 200 };
    expect(p.type).toBe('unpinned');
    expect(p.edge).toBe('left');
  });

  test('popout placement has windowName', () => {
    const p: Placement = {
      type: 'popout', windowName: 'win1',
      x: 0, y: 0, width: 800, height: 600,
    };
    expect(p.type).toBe('popout');
  });
});

describe('DockManagerState shape', () => {
  test('uses placements Map instead of separate arrays', () => {
    const state: DockManagerState = {
      layout: {
        type: 'tabgroup', id: 'tg1', panels: ['p1'],
        activePanel: 'p1',
      },
      panels: new Map([['p1', { title: 'Panel 1' }]]),
      placements: new Map([['p1', { type: 'docked', groupId: 'tg1' }]]),
      activePaneId: 'p1',
      nextZIndex: 1,
    };
    expect(state.placements.get('p1')?.type).toBe('docked');
    expect(state.placements.size).toBe(1);
  });
});

describe('LayoutNode', () => {
  test('TabGroupNode has panels array for ordering', () => {
    const tg: TabGroupNode = {
      type: 'tabgroup', id: 'tg1',
      panels: ['a', 'b', 'c'], activePanel: 'b',
    };
    expect(tg.panels).toEqual(['a', 'b', 'c']);
  });

  test('SplitNode has children and sizes', () => {
    const tg1: TabGroupNode = {
      type: 'tabgroup', id: 'tg1', panels: ['a'], activePanel: 'a',
    };
    const tg2: TabGroupNode = {
      type: 'tabgroup', id: 'tg2', panels: ['b'], activePanel: 'b',
    };
    const split: SplitNode = {
      type: 'split', id: 's1', direction: 'horizontal',
      children: [tg1, tg2], sizes: [50, 50],
    };
    expect(split.children.length).toBe(2);
    expect(split.sizes).toEqual([50, 50]);
  });
});

describe('PreventableDockEvent', () => {
  test('preventDefault stops default behavior', () => {
    const event = createPreventableEvent();
    expect(event.defaultPrevented).toBe(false);
    event.preventDefault();
    expect(event.defaultPrevented).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run packages/dock-manager-core/src/__tests__/types.test.ts
```

Expected: FAIL — current `DockManagerState` uses `Record<string, PanelConfig>` and separate arrays, not `Map` and `placements`.

- [ ] **Step 3: Rewrite types/dock.ts**

```ts
// packages/dock-manager-core/src/types/dock.ts

// ── Primitives ──

export type SplitDirection = 'horizontal' | 'vertical';
export type DockPosition = 'center' | 'left' | 'right' | 'top' | 'bottom';
export type DockEdge = 'left' | 'right' | 'top' | 'bottom';
export type HeaderPosition = 'top' | 'bottom';

// ── Panel Config ──

export interface PanelConfig {
  title?: string;
  icon?: string;
  widgetType?: string;
  closable?: boolean;
  floatable?: boolean;
  maximizable?: boolean;
  unpinnable?: boolean;
  popoutable?: boolean;
  userData?: Record<string, unknown>;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

// ── Layout Constraints ──

export interface LayoutConstraints {
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

// ── Placement — Single Source of Truth ──

export type Placement =
  | { type: 'docked'; groupId: string }
  | {
      type: 'floating';
      x: number; y: number; width: number; height: number;
      zIndex: number;
      sourceGroupId?: string;
    }
  | {
      type: 'unpinned';
      edge: DockEdge; size: number;
      sourceGroupId?: string;
    }
  | {
      type: 'popout';
      windowName: string;
      x: number; y: number; width: number; height: number;
    };

// ── Layout Tree Nodes ──

export interface TabGroupNode {
  type: 'tabgroup';
  id: string;
  panels: string[];
  activePanel: string;
  headerPosition?: HeaderPosition;
  locked?: boolean;
  headerCollapsed?: boolean;
}

export interface SplitNode {
  type: 'split';
  id: string;
  direction: SplitDirection;
  children: LayoutNode[];
  sizes: number[];
}

export type LayoutNode = TabGroupNode | SplitNode;

// ── State Shape ──

export interface DockManagerState {
  layout: LayoutNode;
  panels: Map<string, PanelConfig>;
  placements: Map<string, Placement>;
  activePaneId: string;
  nextZIndex: number;
  maximizedPanelId?: string;
}

// ── Backward-Compat Types (still exported, used by serializer for v1/v2 migration) ──

export interface FloatingPanel {
  panelId: string;
  x: number; y: number; width: number; height: number;
  zIndex: number;
  sourceTabGroupId?: string;
}

export interface UnpinnedPanel {
  panelId: string;
  edge: DockEdge;
  size: number;
  sourceTabGroupId?: string;
}

export interface PopoutPanel {
  panelId: string;
  windowName: string;
  x: number; y: number; width: number; height: number;
}

// ── Events ──

export interface PreventableDockEvent {
  defaultPrevented: boolean;
  preventDefault(): void;
}

export function createPreventableEvent(): PreventableDockEvent {
  let prevented = false;
  return {
    get defaultPrevented() { return prevented; },
    preventDefault() { prevented = true; },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run packages/dock-manager-core/src/__tests__/types.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/dock-manager-core/src/types/dock.ts packages/dock-manager-core/src/__tests__/types.test.ts
git commit -m "feat(rewrite): new Placement-based types and DockManagerState shape"
```

---

## Task 3: Immutable LayoutTree Class

**Files:**
- Create: `packages/dock-manager-core/src/layout/LayoutTree.ts` (rewrite)
- Test: `packages/dock-manager-core/src/__tests__/LayoutTree.test.ts` (rewrite)

The new `LayoutTree` class wraps the root `LayoutNode` and provides all lookup and mutation methods. Every mutation returns a new `LayoutTree` instance. Uses `crypto.randomUUID()` for IDs.

- [ ] **Step 1: Write failing tests for LayoutTree lookups**

```ts
// packages/dock-manager-core/src/__tests__/LayoutTree.test.ts
import { describe, test, expect } from 'vitest';
import { LayoutTree } from '../layout/LayoutTree';
import type { TabGroupNode, SplitNode } from '../types/dock';

function makeTg(id: string, panels: string[], active?: string): TabGroupNode {
  return { type: 'tabgroup', id, panels, activePanel: active ?? panels[0] };
}

describe('LayoutTree — lookups', () => {
  test('findGroup returns group by id', () => {
    const tg = makeTg('tg1', ['a', 'b']);
    const tree = new LayoutTree(tg);
    expect(tree.findGroup('tg1')).toEqual(tg);
    expect(tree.findGroup('nonexistent')).toBeNull();
  });

  test('findSplit returns split by id', () => {
    const split: SplitNode = {
      type: 'split', id: 's1', direction: 'horizontal',
      children: [makeTg('tg1', ['a']), makeTg('tg2', ['b'])],
      sizes: [50, 50],
    };
    const tree = new LayoutTree(split);
    expect(tree.findSplit('s1')?.id).toBe('s1');
    expect(tree.findSplit('nope')).toBeNull();
  });

  test('groupForPanel returns the group containing a panel', () => {
    const tg1 = makeTg('tg1', ['a', 'b']);
    const tg2 = makeTg('tg2', ['c']);
    const split: SplitNode = {
      type: 'split', id: 's1', direction: 'horizontal',
      children: [tg1, tg2], sizes: [50, 50],
    };
    const tree = new LayoutTree(split);
    expect(tree.groupForPanel('c')?.id).toBe('tg2');
    expect(tree.groupForPanel('nonexistent')).toBeNull();
  });

  test('allGroups returns all tab groups', () => {
    const split: SplitNode = {
      type: 'split', id: 's1', direction: 'horizontal',
      children: [makeTg('tg1', ['a']), makeTg('tg2', ['b'])],
      sizes: [50, 50],
    };
    const tree = new LayoutTree(split);
    const groups = tree.allGroups();
    expect(groups.map(g => g.id).sort()).toEqual(['tg1', 'tg2']);
  });

  test('allPanelIds returns all panel IDs from tree', () => {
    const split: SplitNode = {
      type: 'split', id: 's1', direction: 'horizontal',
      children: [makeTg('tg1', ['a', 'b']), makeTg('tg2', ['c'])],
      sizes: [50, 50],
    };
    const tree = new LayoutTree(split);
    expect(tree.allPanelIds().sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('LayoutTree — insertPanel', () => {
  test('center position adds panel to existing group', () => {
    const tg = makeTg('tg1', ['a']);
    const tree = new LayoutTree(tg);
    const target = tree.findGroup('tg1')!;
    const next = tree.insertPanel(target, 'b', 'center');
    const group = next.findGroup('tg1')!;
    expect(group.panels).toEqual(['a', 'b']);
    expect(group.activePanel).toBe('b');
  });

  test('edge position creates a new split', () => {
    const tg = makeTg('tg1', ['a']);
    const tree = new LayoutTree(tg);
    const target = tree.findGroup('tg1')!;
    const next = tree.insertPanel(target, 'b', 'right');
    expect(next.root.type).toBe('split');
    const split = next.root as SplitNode;
    expect(split.direction).toBe('horizontal');
    expect(split.children.length).toBe(2);
    expect(next.allPanelIds().sort()).toEqual(['a', 'b']);
  });

  test('immutability: original tree unchanged', () => {
    const tg = makeTg('tg1', ['a']);
    const tree = new LayoutTree(tg);
    const target = tree.findGroup('tg1')!;
    tree.insertPanel(target, 'b', 'center');
    expect(tree.findGroup('tg1')!.panels).toEqual(['a']);
  });
});

describe('LayoutTree — removePanel', () => {
  test('removes panel from multi-panel group', () => {
    const tg = makeTg('tg1', ['a', 'b', 'c'], 'b');
    const tree = new LayoutTree(tg);
    const next = tree.removePanel('b');
    const group = next.findGroup('tg1')!;
    expect(group.panels).toEqual(['a', 'c']);
    expect(group.activePanel).toBe('a');
  });

  test('removing last panel from group in split promotes sibling', () => {
    const split: SplitNode = {
      type: 'split', id: 's1', direction: 'horizontal',
      children: [makeTg('tg1', ['a']), makeTg('tg2', ['b'])],
      sizes: [50, 50],
    };
    const tree = new LayoutTree(split);
    const next = tree.removePanel('a');
    expect(next.root.type).toBe('tabgroup');
    expect((next.root as TabGroupNode).id).toBe('tg2');
  });

  test('removing nonexistent panel returns same tree', () => {
    const tg = makeTg('tg1', ['a']);
    const tree = new LayoutTree(tg);
    const next = tree.removePanel('nonexistent');
    expect(next).toBe(tree);
  });
});

describe('LayoutTree — movePanel', () => {
  test('moves panel between groups', () => {
    const split: SplitNode = {
      type: 'split', id: 's1', direction: 'horizontal',
      children: [makeTg('tg1', ['a', 'b']), makeTg('tg2', ['c'])],
      sizes: [50, 50],
    };
    const tree = new LayoutTree(split);
    const target = tree.findGroup('tg2')!;
    const next = tree.movePanel('b', target, 'center');
    const g2 = next.groupForPanel('b')!;
    expect(g2.panels).toContain('b');
    expect(g2.panels).toContain('c');
  });
});

describe('LayoutTree — resizeSplit', () => {
  test('updates split sizes', () => {
    const split: SplitNode = {
      type: 'split', id: 's1', direction: 'horizontal',
      children: [makeTg('tg1', ['a']), makeTg('tg2', ['b'])],
      sizes: [50, 50],
    };
    const tree = new LayoutTree(split);
    const s = tree.findSplit('s1')!;
    const next = tree.resizeSplit(s, [30, 70]);
    expect(tree.findSplit('s1')!.sizes).toEqual([50, 50]);
    expect(next.findSplit('s1')!.sizes).toEqual([30, 70]);
  });
});

describe('LayoutTree — reorderTabs', () => {
  test('reorders panels within a group', () => {
    const tg = makeTg('tg1', ['a', 'b', 'c'], 'b');
    const tree = new LayoutTree(tg);
    const group = tree.findGroup('tg1')!;
    const next = tree.reorderTabs(group, ['c', 'a', 'b']);
    expect(next.findGroup('tg1')!.panels).toEqual(['c', 'a', 'b']);
    expect(next.findGroup('tg1')!.activePanel).toBe('b');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run packages/dock-manager-core/src/__tests__/LayoutTree.test.ts
```

Expected: FAIL — `LayoutTree` class doesn't exist yet in new form.

- [ ] **Step 3: Implement LayoutTree class**

```ts
// packages/dock-manager-core/src/layout/LayoutTree.ts
import type { LayoutNode, TabGroupNode, SplitNode, DockPosition } from '../types/dock';

export class LayoutTree {
  readonly root: LayoutNode;

  constructor(root: LayoutNode) {
    this.root = root;
  }

  // ── Lookups ──

  findGroup(id: string): TabGroupNode | null {
    return this.walkGroups(this.root, g => g.id === id ? g : null);
  }

  findSplit(id: string): SplitNode | null {
    return this.walkSplits(this.root, s => s.id === id ? s : null);
  }

  groupForPanel(panelId: string): TabGroupNode | null {
    return this.walkGroups(this.root, g => g.panels.includes(panelId) ? g : null);
  }

  allGroups(): TabGroupNode[] {
    const result: TabGroupNode[] = [];
    this.walkGroups(this.root, g => { result.push(g); return null; });
    return result;
  }

  allPanelIds(): string[] {
    const ids: string[] = [];
    this.walkGroups(this.root, g => { ids.push(...g.panels); return null; });
    return ids;
  }

  // ── Mutations (return new LayoutTree) ──

  insertPanel(target: TabGroupNode, panelId: string, position: DockPosition): LayoutTree {
    if (position === 'center') {
      const newRoot = this.replaceGroup(this.root, target.id, {
        ...target,
        panels: [...target.panels, panelId],
        activePanel: panelId,
      });
      return new LayoutTree(newRoot);
    }

    const direction: 'horizontal' | 'vertical' =
      (position === 'left' || position === 'right') ? 'horizontal' : 'vertical';
    const newGroup: TabGroupNode = {
      type: 'tabgroup',
      id: crypto.randomUUID(),
      panels: [panelId],
      activePanel: panelId,
    };
    const children = (position === 'left' || position === 'top')
      ? [newGroup, target]
      : [target, newGroup];
    const newSplit: SplitNode = {
      type: 'split',
      id: crypto.randomUUID(),
      direction,
      children,
      sizes: [50, 50],
    };
    const newRoot = this.replaceNode(this.root, target.id, newSplit);
    return new LayoutTree(newRoot);
  }

  removePanel(panelId: string): LayoutTree {
    const group = this.groupForPanel(panelId);
    if (!group) return this;

    if (group.panels.length > 1) {
      const newPanels = group.panels.filter(p => p !== panelId);
      const newActive = group.activePanel === panelId
        ? newPanels[Math.max(0, group.panels.indexOf(panelId) - 1)]
        : group.activePanel;
      const newRoot = this.replaceGroup(this.root, group.id, {
        ...group,
        panels: newPanels,
        activePanel: newActive,
      });
      return new LayoutTree(newRoot);
    }

    // Last panel in group — remove the group entirely
    const newRoot = this.removeNode(this.root, group.id);
    if (!newRoot) {
      // Tree is now empty — create empty group
      return new LayoutTree({
        type: 'tabgroup',
        id: crypto.randomUUID(),
        panels: [],
        activePanel: '',
      });
    }
    return new LayoutTree(newRoot);
  }

  movePanel(panelId: string, target: TabGroupNode, position: DockPosition): LayoutTree {
    const removed = this.removePanel(panelId);
    const newTarget = removed.findGroup(target.id);
    if (!newTarget) {
      const firstGroup = removed.allGroups()[0];
      if (!firstGroup) return removed;
      return removed.insertPanel(firstGroup, panelId, position);
    }
    return removed.insertPanel(newTarget, panelId, position);
  }

  resizeSplit(split: SplitNode, sizes: number[]): LayoutTree {
    const newRoot = this.replaceSplit(this.root, split.id, { ...split, sizes });
    return new LayoutTree(newRoot);
  }

  reorderTabs(group: TabGroupNode, panels: string[]): LayoutTree {
    const newRoot = this.replaceGroup(this.root, group.id, { ...group, panels });
    return new LayoutTree(newRoot);
  }

  setActivePanel(groupId: string, panelId: string): LayoutTree {
    const group = this.findGroup(groupId);
    if (!group || !group.panels.includes(panelId)) return this;
    const newRoot = this.replaceGroup(this.root, groupId, { ...group, activePanel: panelId });
    return new LayoutTree(newRoot);
  }

  updateGroup(groupId: string, updates: Partial<TabGroupNode>): LayoutTree {
    const group = this.findGroup(groupId);
    if (!group) return this;
    const newRoot = this.replaceGroup(this.root, groupId, { ...group, ...updates });
    return new LayoutTree(newRoot);
  }

  // ── Internal tree walkers ──

  private walkGroups<T>(node: LayoutNode, fn: (g: TabGroupNode) => T | null): T | null {
    if (node.type === 'tabgroup') return fn(node);
    for (const child of node.children) {
      const result = this.walkGroups(child, fn);
      if (result !== null) return result;
    }
    return null;
  }

  private walkSplits<T>(node: LayoutNode, fn: (s: SplitNode) => T | null): T | null {
    if (node.type === 'split') {
      const result = fn(node);
      if (result !== null) return result;
      for (const child of node.children) {
        const r = this.walkSplits(child, fn);
        if (r !== null) return r;
      }
    }
    return null;
  }

  private replaceGroup(node: LayoutNode, groupId: string, replacement: TabGroupNode): LayoutNode {
    if (node.type === 'tabgroup') {
      return node.id === groupId ? replacement : node;
    }
    const newChildren = node.children.map(c => this.replaceGroup(c, groupId, replacement));
    if (newChildren.every((c, i) => c === node.children[i])) return node;
    return { ...node, children: newChildren };
  }

  private replaceSplit(node: LayoutNode, splitId: string, replacement: SplitNode): LayoutNode {
    if (node.type === 'tabgroup') return node;
    if (node.id === splitId) return replacement;
    const newChildren = node.children.map(c => this.replaceSplit(c, splitId, replacement));
    if (newChildren.every((c, i) => c === node.children[i])) return node;
    return { ...node, children: newChildren };
  }

  private replaceNode(node: LayoutNode, nodeId: string, replacement: LayoutNode): LayoutNode {
    if (node.type === 'tabgroup') {
      return node.id === nodeId ? replacement : node;
    }
    if (node.id === nodeId) return replacement;
    const newChildren = node.children.map(c => this.replaceNode(c, nodeId, replacement));
    if (newChildren.every((c, i) => c === node.children[i])) return node;
    return { ...node, children: newChildren };
  }

  private removeNode(node: LayoutNode, nodeId: string): LayoutNode | null {
    if (node.type === 'tabgroup') {
      return node.id === nodeId ? null : node;
    }
    if (node.id === nodeId) return null;
    const newChildren: LayoutNode[] = [];
    for (const child of node.children) {
      const result = this.removeNode(child, nodeId);
      if (result !== null) newChildren.push(result);
    }
    if (newChildren.length === 0) return null;
    if (newChildren.length === 1) return newChildren[0];
    const newSizes = newChildren.map((_, i) => {
      if (i < node.sizes.length && i < newChildren.length) {
        return node.sizes[i];
      }
      return 100 / newChildren.length;
    });
    const total = newSizes.reduce((a, b) => a + b, 0);
    const normalizedSizes = newSizes.map(s => (s / total) * 100);
    return { ...node, children: newChildren, sizes: normalizedSizes };
  }
}

// ── Compat exports (used by existing code during migration) ──

export function findTabGroupForPanel(root: LayoutNode, panelId: string): TabGroupNode | null {
  return new LayoutTree(root).groupForPanel(panelId);
}

export function findFirstTabGroup(root: LayoutNode): TabGroupNode | null {
  return new LayoutTree(root).allGroups()[0] ?? null;
}

export function findTabGroupById(root: LayoutNode, id: string): TabGroupNode | null {
  return new LayoutTree(root).findGroup(id);
}

export function findAllTabGroups(root: LayoutNode): TabGroupNode[] {
  return new LayoutTree(root).allGroups();
}

export function collectAllPanelsOrdered(root: LayoutNode): string[] {
  return new LayoutTree(root).allPanelIds();
}

export const collectLayoutPanelIds = collectAllPanelsOrdered;

export function isPanelPlaced(root: LayoutNode, panelId: string): boolean {
  return new LayoutTree(root).groupForPanel(panelId) !== null;
}

export function countPanels(root: LayoutNode): number {
  return new LayoutTree(root).allPanelIds().length;
}

export function genId(): string {
  return crypto.randomUUID();
}

export function resetIdCounter(): void {
  // No-op in new implementation — UUIDs don't need counters
}

export function syncIdCounter(_root: LayoutNode | null): void {
  // No-op in new implementation — UUIDs don't need syncing
}

// Legacy compat wrappers for tree mutations
export function removePanel(root: LayoutNode, panelId: string): LayoutNode {
  return new LayoutTree(root).removePanel(panelId).root;
}

export function insertInGroup(root: LayoutNode, targetGroupId: string, panelId: string): LayoutNode {
  const tree = new LayoutTree(root);
  const target = tree.findGroup(targetGroupId);
  if (!target) return root;
  return tree.insertPanel(target, panelId, 'center').root;
}

export function insertBySplit(
  root: LayoutNode, targetGroupId: string, panelId: string, position: DockPosition
): LayoutNode {
  const tree = new LayoutTree(root);
  const target = tree.findGroup(targetGroupId);
  if (!target) return root;
  return tree.insertPanel(target, panelId, position).root;
}

export function insertAtEdge(root: LayoutNode, panelId: string, edge: 'left' | 'right' | 'top' | 'bottom'): LayoutNode {
  const tree = new LayoutTree(root);
  const firstGroup = tree.allGroups()[0];
  if (!firstGroup) return root;
  return tree.insertPanel(firstGroup, panelId, edge).root;
}

export function movePanel(
  root: LayoutNode, panelId: string, targetGroupId: string, position: DockPosition
): LayoutNode {
  const tree = new LayoutTree(root);
  const target = tree.findGroup(targetGroupId);
  if (!target) return root;
  return tree.movePanel(panelId, target, position).root;
}

export function detectPanelEdge(root: LayoutNode, panelId: string): 'left' | 'right' | 'top' | 'bottom' | null {
  const tree = new LayoutTree(root);
  const group = tree.groupForPanel(panelId);
  if (!group) return null;
  if (root.type === 'tabgroup') return null;
  return _detectEdge(root, group.id);
}

function _detectEdge(node: LayoutNode, groupId: string): 'left' | 'right' | 'top' | 'bottom' | null {
  if (node.type === 'tabgroup') return null;
  const idx = node.children.findIndex(c =>
    c.type === 'tabgroup' ? c.id === groupId : _containsGroup(c, groupId)
  );
  if (idx === -1) return null;
  if (node.direction === 'horizontal') {
    if (idx === 0) return 'left';
    if (idx === node.children.length - 1) return 'right';
  } else {
    if (idx === 0) return 'top';
    if (idx === node.children.length - 1) return 'bottom';
  }
  for (const child of node.children) {
    const result = _detectEdge(child, groupId);
    if (result) return result;
  }
  return null;
}

function _containsGroup(node: LayoutNode, groupId: string): boolean {
  if (node.type === 'tabgroup') return node.id === groupId;
  return node.children.some(c => _containsGroup(c, groupId));
}

export function findTabGroupByEdge(root: LayoutNode, edge: 'left' | 'right' | 'top' | 'bottom'): TabGroupNode | null {
  const tree = new LayoutTree(root);
  for (const group of tree.allGroups()) {
    if (detectPanelEdge(root, group.panels[0]) === edge) return group;
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run packages/dock-manager-core/src/__tests__/LayoutTree.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/dock-manager-core/src/layout/LayoutTree.ts packages/dock-manager-core/src/__tests__/LayoutTree.test.ts
git commit -m "feat(rewrite): immutable LayoutTree class with crypto.randomUUID()"
```

---

## Task 4: Reducer — 16-Action DockReducer

**Files:**
- Create: `packages/dock-manager-core/src/reducer/dockReducer.ts` (rewrite)
- Test: `packages/dock-manager-core/src/__tests__/dockReducer.test.ts` (rewrite)

The reducer operates on the new `DockManagerState` with `placements` map. 16 actions (down from 27). Every action validates inputs via `LayoutTree.findGroup()` before mutating.

- [ ] **Step 1: Write failing tests for core reducer actions**

Write tests covering all 16 actions. Each test creates a state with the new shape (panels as `Map`, placements as `Map`), dispatches an action, and asserts the new state. Key tests:

```ts
// packages/dock-manager-core/src/__tests__/dockReducer.test.ts
import { describe, test, expect } from 'vitest';
import { dockReducer, createDefaultState, validateState } from '../reducer/dockReducer';
import type { DockManagerState } from '../types/dock';
import type { DockAction } from '../reducer/dockReducer';

function makeState(overrides?: Partial<DockManagerState>): DockManagerState {
  const panelId = 'p1';
  const groupId = 'tg1';
  return {
    layout: {
      type: 'tabgroup', id: groupId,
      panels: [panelId], activePanel: panelId,
    },
    panels: new Map([[panelId, { title: 'Panel 1' }]]),
    placements: new Map([[panelId, { type: 'docked', groupId }]]),
    activePaneId: panelId,
    nextZIndex: 1,
    ...overrides,
  };
}

describe('ADD_PANEL', () => {
  test('adds panel to default group when no target specified', () => {
    const state = makeState();
    const next = dockReducer(state, {
      type: 'ADD_PANEL', panelId: 'p2',
      config: { title: 'Panel 2' },
    });
    expect(next.panels.has('p2')).toBe(true);
    expect(next.placements.get('p2')?.type).toBe('docked');
  });

  test('adds panel to specific target group', () => {
    const state = makeState();
    const next = dockReducer(state, {
      type: 'ADD_PANEL', panelId: 'p2',
      config: { title: 'Panel 2' },
      target: 'tg1', position: 'center',
    });
    const group = next.layout.type === 'tabgroup' ? next.layout : null;
    expect(group?.panels).toContain('p2');
  });

  test('ignores duplicate panel ID', () => {
    const state = makeState();
    const next = dockReducer(state, {
      type: 'ADD_PANEL', panelId: 'p1',
      config: { title: 'Dup' },
    });
    expect(next).toBe(state);
  });
});

describe('CLOSE_PANEL', () => {
  test('removes panel from layout and maps', () => {
    const state = makeState();
    const next = dockReducer(state, { type: 'CLOSE_PANEL', panelId: 'p1' });
    expect(next.panels.has('p1')).toBe(false);
    expect(next.placements.has('p1')).toBe(false);
  });

  test('ignores nonexistent panel', () => {
    const state = makeState();
    const next = dockReducer(state, { type: 'CLOSE_PANEL', panelId: 'nope' });
    expect(next).toBe(state);
  });
});

describe('FLOAT_PANEL', () => {
  test('moves docked panel to floating placement', () => {
    const state = makeState();
    const next = dockReducer(state, {
      type: 'FLOAT_PANEL', panelId: 'p1',
      x: 100, y: 200, width: 400, height: 300,
    });
    const placement = next.placements.get('p1');
    expect(placement?.type).toBe('floating');
    if (placement?.type === 'floating') {
      expect(placement.x).toBe(100);
      expect(placement.zIndex).toBeGreaterThan(0);
    }
  });
});

describe('DOCK_FLOATING', () => {
  test('moves floating panel back to docked', () => {
    const state = makeState();
    const floated = dockReducer(state, {
      type: 'FLOAT_PANEL', panelId: 'p1',
      x: 100, y: 200, width: 400, height: 300,
    });
    // Add a second panel first so there's a group to dock into
    const withP2 = dockReducer(floated, {
      type: 'ADD_PANEL', panelId: 'p2', config: { title: 'P2' },
    });
    const groupId = (withP2.placements.get('p2') as any).groupId;
    const docked = dockReducer(withP2, {
      type: 'DOCK_FLOATING', panelId: 'p1',
      targetGroupId: groupId, position: 'center',
    });
    expect(docked.placements.get('p1')?.type).toBe('docked');
  });

  test('falls back to first group when target is stale', () => {
    const state = makeState();
    const floated = dockReducer(state, {
      type: 'FLOAT_PANEL', panelId: 'p1',
      x: 100, y: 200, width: 400, height: 300,
    });
    const withP2 = dockReducer(floated, {
      type: 'ADD_PANEL', panelId: 'p2', config: { title: 'P2' },
    });
    const docked = dockReducer(withP2, {
      type: 'DOCK_FLOATING', panelId: 'p1',
      targetGroupId: 'nonexistent', position: 'center',
    });
    expect(docked.placements.get('p1')?.type).toBe('docked');
  });
});

describe('SET_ACTIVE_PANEL', () => {
  test('sets active panel in group and activePaneId', () => {
    const state: DockManagerState = {
      layout: {
        type: 'tabgroup', id: 'tg1',
        panels: ['p1', 'p2'], activePanel: 'p1',
      },
      panels: new Map([['p1', { title: 'P1' }], ['p2', { title: 'P2' }]]),
      placements: new Map([
        ['p1', { type: 'docked', groupId: 'tg1' }],
        ['p2', { type: 'docked', groupId: 'tg1' }],
      ]),
      activePaneId: 'p1',
      nextZIndex: 1,
    };
    const next = dockReducer(state, {
      type: 'SET_ACTIVE_PANEL', groupId: 'tg1', panelId: 'p2',
    });
    expect(next.activePaneId).toBe('p2');
  });
});

describe('RESIZE_SPLIT', () => {
  test('updates split sizes', () => {
    const state: DockManagerState = {
      layout: {
        type: 'split', id: 's1', direction: 'horizontal',
        children: [
          { type: 'tabgroup', id: 'tg1', panels: ['p1'], activePanel: 'p1' },
          { type: 'tabgroup', id: 'tg2', panels: ['p2'], activePanel: 'p2' },
        ],
        sizes: [50, 50],
      },
      panels: new Map([['p1', { title: 'P1' }], ['p2', { title: 'P2' }]]),
      placements: new Map([
        ['p1', { type: 'docked', groupId: 'tg1' }],
        ['p2', { type: 'docked', groupId: 'tg2' }],
      ]),
      activePaneId: 'p1',
      nextZIndex: 1,
    };
    const next = dockReducer(state, {
      type: 'RESIZE_SPLIT', splitId: 's1', sizes: [30, 70],
    });
    expect((next.layout as any).sizes).toEqual([30, 70]);
  });
});

describe('MAXIMIZE_PANEL / RESTORE_PANEL', () => {
  test('maximize sets maximizedPanelId', () => {
    const state = makeState();
    const next = dockReducer(state, { type: 'MAXIMIZE_PANEL', panelId: 'p1' });
    expect(next.maximizedPanelId).toBe('p1');
  });

  test('restore clears maximizedPanelId', () => {
    const state = { ...makeState(), maximizedPanelId: 'p1' };
    const next = dockReducer(state, { type: 'RESTORE_PANEL', panelId: 'p1' });
    expect(next.maximizedPanelId).toBeUndefined();
  });
});

describe('REORDER_TABS', () => {
  test('reorders panels in group', () => {
    const state: DockManagerState = {
      layout: {
        type: 'tabgroup', id: 'tg1',
        panels: ['p1', 'p2', 'p3'], activePanel: 'p1',
      },
      panels: new Map([['p1', {}], ['p2', {}], ['p3', {}]]),
      placements: new Map([
        ['p1', { type: 'docked', groupId: 'tg1' }],
        ['p2', { type: 'docked', groupId: 'tg1' }],
        ['p3', { type: 'docked', groupId: 'tg1' }],
      ]),
      activePaneId: 'p1',
      nextZIndex: 1,
    };
    const next = dockReducer(state, {
      type: 'REORDER_TABS', groupId: 'tg1', panels: ['p3', 'p1', 'p2'],
    });
    expect((next.layout as any).panels).toEqual(['p3', 'p1', 'p2']);
  });
});

describe('UNPIN_PANEL / PIN_PANEL', () => {
  test('unpin moves panel to unpinned placement', () => {
    const state = makeState();
    const next = dockReducer(state, { type: 'UNPIN_PANEL', panelId: 'p1' });
    expect(next.placements.get('p1')?.type).toBe('unpinned');
  });

  test('pin restores unpinned panel to docked', () => {
    const state = makeState();
    const unpinned = dockReducer(state, { type: 'UNPIN_PANEL', panelId: 'p1' });
    const withP2 = dockReducer(unpinned, {
      type: 'ADD_PANEL', panelId: 'p2', config: { title: 'P2' },
    });
    const pinned = dockReducer(withP2, { type: 'PIN_PANEL', panelId: 'p1' });
    expect(pinned.placements.get('p1')?.type).toBe('docked');
  });
});

describe('DOCK_TO_EDGE', () => {
  test('moves panel to edge of layout', () => {
    const state: DockManagerState = {
      layout: {
        type: 'tabgroup', id: 'tg1',
        panels: ['p1', 'p2'], activePanel: 'p1',
      },
      panels: new Map([['p1', {}], ['p2', {}]]),
      placements: new Map([
        ['p1', { type: 'docked', groupId: 'tg1' }],
        ['p2', { type: 'docked', groupId: 'tg1' }],
      ]),
      activePaneId: 'p1',
      nextZIndex: 1,
    };
    const next = dockReducer(state, {
      type: 'DOCK_TO_EDGE', panelId: 'p1', edge: 'right',
    });
    expect(next.layout.type).toBe('split');
  });
});

describe('validateState', () => {
  test('valid state passes', () => {
    const state = makeState();
    const violations = validateState(state);
    expect(violations).toEqual([]);
  });
});

describe('createDefaultState', () => {
  test('returns empty state with one group', () => {
    const state = createDefaultState();
    expect(state.layout.type).toBe('tabgroup');
    expect(state.panels.size).toBe(0);
    expect(state.placements.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run packages/dock-manager-core/src/__tests__/dockReducer.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement the 16-action reducer**

Write `packages/dock-manager-core/src/reducer/dockReducer.ts` implementing:

```ts
// packages/dock-manager-core/src/reducer/dockReducer.ts
import type { DockManagerState, DockPosition, DockEdge, PanelConfig, Placement } from '../types/dock';
import { LayoutTree } from '../layout/LayoutTree';

export type DockAction =
  | { type: 'ADD_PANEL'; panelId: string; config: PanelConfig; target?: string; position?: DockPosition }
  | { type: 'CLOSE_PANEL'; panelId: string }
  | { type: 'MOVE_PANEL'; panelId: string; targetGroupId: string; position: DockPosition }
  | { type: 'FLOAT_PANEL'; panelId: string; x: number; y: number; width: number; height: number }
  | { type: 'DOCK_FLOATING'; panelId: string; targetGroupId: string; position: DockPosition }
  | { type: 'UPDATE_FLOATING'; panelId: string; x?: number; y?: number; width?: number; height?: number }
  | { type: 'UNPIN_PANEL'; panelId: string }
  | { type: 'PIN_PANEL'; panelId: string }
  | { type: 'POPOUT_PANEL'; panelId: string; windowName: string; x: number; y: number; width: number; height: number }
  | { type: 'DOCK_POPOUT'; panelId: string; targetGroupId: string; position: DockPosition }
  | { type: 'SET_ACTIVE_PANEL'; groupId: string; panelId: string }
  | { type: 'MAXIMIZE_PANEL'; panelId: string }
  | { type: 'RESTORE_PANEL'; panelId: string }
  | { type: 'RESIZE_SPLIT'; splitId: string; sizes: number[] }
  | { type: 'REORDER_TABS'; groupId: string; panels: string[] }
  | { type: 'DOCK_TO_EDGE'; panelId: string; edge: DockEdge }
  | { type: 'LOAD_STATE'; state: DockManagerState };

export function createDefaultState(): DockManagerState {
  const groupId = crypto.randomUUID();
  return {
    layout: { type: 'tabgroup', id: groupId, panels: [], activePanel: '' },
    panels: new Map(),
    placements: new Map(),
    activePaneId: '',
    nextZIndex: 1,
  };
}

export function validateState(state: DockManagerState): Array<{ kind: string; detail: string }> {
  const violations: Array<{ kind: string; detail: string }> = [];
  const tree = new LayoutTree(state.layout);
  const layoutPanels = new Set(tree.allPanelIds());

  // Check every placed panel exists in panels map
  for (const [panelId, placement] of state.placements) {
    if (!state.panels.has(panelId)) {
      violations.push({ kind: 'ORPHAN_PLACEMENT', detail: `placement for unknown panel ${panelId}` });
    }
    if (placement.type === 'docked' && !layoutPanels.has(panelId)) {
      violations.push({ kind: 'ORPHAN_PANEL', detail: `panel ${panelId} docked but not in layout tree` });
    }
  }

  // Check every layout panel has a docked placement
  for (const panelId of layoutPanels) {
    const p = state.placements.get(panelId);
    if (!p) {
      violations.push({ kind: 'MISSING_PLACEMENT', detail: `panel ${panelId} in layout but no placement` });
    } else if (p.type !== 'docked') {
      violations.push({ kind: 'WRONG_PLACEMENT', detail: `panel ${panelId} in layout but placement is ${p.type}` });
    }
  }

  // Check for duplicate group IDs
  const groupIds = new Set<string>();
  const splitIds = new Set<string>();
  for (const g of tree.allGroups()) {
    if (groupIds.has(g.id)) {
      violations.push({ kind: 'DUP_GROUP_ID', detail: `duplicate tab group id ${g.id}` });
    }
    groupIds.add(g.id);
  }

  return violations;
}

export function dockReducer(state: DockManagerState, action: DockAction): DockManagerState {
  const tree = new LayoutTree(state.layout);

  switch (action.type) {
    case 'ADD_PANEL': {
      if (state.panels.has(action.panelId)) return state;
      const target = action.target ? tree.findGroup(action.target) : tree.allGroups()[0];
      if (!target) return state;
      const position = action.position ?? 'center';
      const newTree = tree.insertPanel(target, action.panelId, position);
      const newGroup = newTree.groupForPanel(action.panelId);
      const newPanels = new Map(state.panels);
      newPanels.set(action.panelId, action.config);
      const newPlacements = new Map(state.placements);
      newPlacements.set(action.panelId, { type: 'docked', groupId: newGroup!.id });
      return {
        ...state,
        layout: newTree.root,
        panels: newPanels,
        placements: newPlacements,
        activePaneId: action.panelId,
      };
    }

    case 'CLOSE_PANEL': {
      if (!state.panels.has(action.panelId)) return state;
      const newTree = tree.removePanel(action.panelId);
      const newPanels = new Map(state.panels);
      newPanels.delete(action.panelId);
      const newPlacements = new Map(state.placements);
      newPlacements.delete(action.panelId);
      const newActive = state.activePaneId === action.panelId
        ? (newTree.allPanelIds()[0] ?? '')
        : state.activePaneId;
      return {
        ...state,
        layout: newTree.root,
        panels: newPanels,
        placements: newPlacements,
        activePaneId: newActive,
        maximizedPanelId: state.maximizedPanelId === action.panelId ? undefined : state.maximizedPanelId,
      };
    }

    case 'MOVE_PANEL': {
      if (!state.panels.has(action.panelId)) return state;
      const target = tree.findGroup(action.targetGroupId);
      if (!target) return state;
      const newTree = tree.movePanel(action.panelId, target, action.position);
      const newGroup = newTree.groupForPanel(action.panelId);
      const newPlacements = new Map(state.placements);
      newPlacements.set(action.panelId, { type: 'docked', groupId: newGroup!.id });
      return { ...state, layout: newTree.root, placements: newPlacements };
    }

    case 'FLOAT_PANEL': {
      if (!state.panels.has(action.panelId)) return state;
      const placement = state.placements.get(action.panelId);
      const sourceGroupId = placement?.type === 'docked' ? placement.groupId : undefined;
      const newTree = tree.removePanel(action.panelId);
      const newPlacements = new Map(state.placements);
      newPlacements.set(action.panelId, {
        type: 'floating',
        x: action.x, y: action.y,
        width: action.width, height: action.height,
        zIndex: state.nextZIndex,
        sourceGroupId,
      });
      return {
        ...state,
        layout: newTree.root,
        placements: newPlacements,
        nextZIndex: state.nextZIndex + 1,
      };
    }

    case 'DOCK_FLOATING': {
      const placement = state.placements.get(action.panelId);
      if (!placement || placement.type !== 'floating') return state;
      let target = tree.findGroup(action.targetGroupId);
      if (!target) {
        if (placement.sourceGroupId) target = tree.findGroup(placement.sourceGroupId);
        if (!target) target = tree.allGroups()[0];
        if (!target) return state;
      }
      const newTree = tree.insertPanel(target, action.panelId, action.position);
      const newGroup = newTree.groupForPanel(action.panelId);
      const newPlacements = new Map(state.placements);
      newPlacements.set(action.panelId, { type: 'docked', groupId: newGroup!.id });
      return {
        ...state,
        layout: newTree.root,
        placements: newPlacements,
        activePaneId: action.panelId,
      };
    }

    case 'UPDATE_FLOATING': {
      const placement = state.placements.get(action.panelId);
      if (!placement || placement.type !== 'floating') return state;
      const newPlacements = new Map(state.placements);
      newPlacements.set(action.panelId, {
        ...placement,
        ...(action.x !== undefined && { x: action.x }),
        ...(action.y !== undefined && { y: action.y }),
        ...(action.width !== undefined && { width: action.width }),
        ...(action.height !== undefined && { height: action.height }),
        zIndex: state.nextZIndex,
      });
      return { ...state, placements: newPlacements, nextZIndex: state.nextZIndex + 1 };
    }

    case 'UNPIN_PANEL': {
      if (!state.panels.has(action.panelId)) return state;
      const placement = state.placements.get(action.panelId);
      if (placement?.type !== 'docked') return state;
      const group = tree.findGroup(placement.groupId);
      const edge = _inferEdge(state.layout, placement.groupId);
      const newTree = tree.removePanel(action.panelId);
      const newPlacements = new Map(state.placements);
      newPlacements.set(action.panelId, {
        type: 'unpinned',
        edge: edge ?? 'bottom',
        size: 200,
        sourceGroupId: placement.groupId,
      });
      return { ...state, layout: newTree.root, placements: newPlacements };
    }

    case 'PIN_PANEL': {
      const placement = state.placements.get(action.panelId);
      if (!placement || placement.type !== 'unpinned') return state;
      let target = placement.sourceGroupId ? tree.findGroup(placement.sourceGroupId) : null;
      if (!target) target = tree.allGroups()[0];
      if (!target) return state;
      const newTree = tree.insertPanel(target, action.panelId, 'center');
      const newGroup = newTree.groupForPanel(action.panelId);
      const newPlacements = new Map(state.placements);
      newPlacements.set(action.panelId, { type: 'docked', groupId: newGroup!.id });
      return {
        ...state,
        layout: newTree.root,
        placements: newPlacements,
        activePaneId: action.panelId,
      };
    }

    case 'POPOUT_PANEL': {
      if (!state.panels.has(action.panelId)) return state;
      const newTree = tree.removePanel(action.panelId);
      const newPlacements = new Map(state.placements);
      newPlacements.set(action.panelId, {
        type: 'popout',
        windowName: action.windowName,
        x: action.x, y: action.y,
        width: action.width, height: action.height,
      });
      return { ...state, layout: newTree.root, placements: newPlacements };
    }

    case 'DOCK_POPOUT': {
      const placement = state.placements.get(action.panelId);
      if (!placement || placement.type !== 'popout') return state;
      let target = tree.findGroup(action.targetGroupId);
      if (!target) target = tree.allGroups()[0];
      if (!target) return state;
      const newTree = tree.insertPanel(target, action.panelId, action.position);
      const newGroup = newTree.groupForPanel(action.panelId);
      const newPlacements = new Map(state.placements);
      newPlacements.set(action.panelId, { type: 'docked', groupId: newGroup!.id });
      return {
        ...state,
        layout: newTree.root,
        placements: newPlacements,
        activePaneId: action.panelId,
      };
    }

    case 'SET_ACTIVE_PANEL': {
      const group = tree.findGroup(action.groupId);
      if (!group || !group.panels.includes(action.panelId)) return state;
      const newTree = tree.setActivePanel(action.groupId, action.panelId);
      return { ...state, layout: newTree.root, activePaneId: action.panelId };
    }

    case 'MAXIMIZE_PANEL': {
      if (!state.panels.has(action.panelId)) return state;
      return { ...state, maximizedPanelId: action.panelId };
    }

    case 'RESTORE_PANEL': {
      if (state.maximizedPanelId !== action.panelId) return state;
      return { ...state, maximizedPanelId: undefined };
    }

    case 'RESIZE_SPLIT': {
      const split = tree.findSplit(action.splitId);
      if (!split) return state;
      const newTree = tree.resizeSplit(split, action.sizes);
      return { ...state, layout: newTree.root };
    }

    case 'REORDER_TABS': {
      const group = tree.findGroup(action.groupId);
      if (!group) return state;
      const newTree = tree.reorderTabs(group, action.panels);
      return { ...state, layout: newTree.root };
    }

    case 'DOCK_TO_EDGE': {
      if (!state.panels.has(action.panelId)) return state;
      const newTree = tree.removePanel(action.panelId);
      const edgeTree = new LayoutTree(newTree.root);
      const firstGroup = edgeTree.allGroups()[0];
      if (!firstGroup) return state;
      const position = action.edge as DockPosition;
      const finalTree = edgeTree.insertPanel(firstGroup, action.panelId, position);
      const newGroup = finalTree.groupForPanel(action.panelId);
      const newPlacements = new Map(state.placements);
      newPlacements.set(action.panelId, { type: 'docked', groupId: newGroup!.id });
      return { ...state, layout: finalTree.root, placements: newPlacements };
    }

    case 'LOAD_STATE': {
      return action.state;
    }

    default:
      return state;
  }
}

function _inferEdge(layout: import('../types/dock').LayoutNode, groupId: string): import('../types/dock').DockEdge | null {
  if (layout.type === 'tabgroup') return null;
  const idx = layout.children.findIndex(c =>
    c.type === 'tabgroup' ? c.id === groupId : _containsGroupId(c, groupId)
  );
  if (idx === -1) return null;
  if (layout.direction === 'horizontal') {
    if (idx === 0) return 'left';
    if (idx === layout.children.length - 1) return 'right';
  } else {
    if (idx === 0) return 'top';
    if (idx === layout.children.length - 1) return 'bottom';
  }
  return null;
}

function _containsGroupId(node: import('../types/dock').LayoutNode, groupId: string): boolean {
  if (node.type === 'tabgroup') return node.id === groupId;
  return node.children.some(c => _containsGroupId(c, groupId));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run packages/dock-manager-core/src/__tests__/dockReducer.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/dock-manager-core/src/reducer/dockReducer.ts packages/dock-manager-core/src/__tests__/dockReducer.test.ts
git commit -m "feat(rewrite): 16-action reducer with placement map"
```

---

## Task 5: Serialization — v3 Format with v1/v2 Migration

**Files:**
- Create: `packages/dock-manager-core/src/serialization/serializer.ts` (rewrite)
- Test: `packages/dock-manager-core/src/__tests__/serializer.test.ts` (rewrite)

The new v3 format serializes the `placements` map directly. The deserializer reads v1/v2 (separate arrays) and converts to v3. `panels` map is serialized as `Record<string, PanelConfig>` (JSON-friendly). Critical for backward compatibility with existing localStorage data in fi-trading-terminal.

- [ ] **Step 1: Write failing tests**

```ts
// packages/dock-manager-core/src/__tests__/serializer.test.ts
import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  serialize, deserialize,
  saveToLocalStorage, loadFromLocalStorage, clearLocalStorage,
} from '../serialization/serializer';
import type { DockManagerState } from '../types/dock';
import { createDefaultState } from '../reducer/dockReducer';

function makeState(): DockManagerState {
  return {
    layout: {
      type: 'tabgroup', id: 'tg1',
      panels: ['p1', 'p2'], activePanel: 'p1',
    },
    panels: new Map([
      ['p1', { title: 'Panel 1' }],
      ['p2', { title: 'Panel 2' }],
    ]),
    placements: new Map([
      ['p1', { type: 'docked', groupId: 'tg1' }],
      ['p2', { type: 'docked', groupId: 'tg1' }],
    ]),
    activePaneId: 'p1',
    nextZIndex: 1,
  };
}

describe('v3 round-trip', () => {
  test('serialize then deserialize produces equivalent state', () => {
    const state = makeState();
    const serialized = serialize(state);
    const restored = deserialize(serialized);
    expect(restored.panels.get('p1')?.title).toBe('Panel 1');
    expect(restored.placements.get('p1')?.type).toBe('docked');
    expect(restored.layout).toEqual(state.layout);
  });

  test('serialized format has version 3', () => {
    const state = makeState();
    const serialized = serialize(state);
    expect(serialized.version).toBe(3);
  });
});

describe('v1/v2 migration', () => {
  test('deserialize v1 format with separate arrays', () => {
    const v1Data = {
      version: 1,
      layout: {
        type: 'tabgroup', id: 'tg1',
        panels: ['p1'], activePanel: 'p1',
      },
      panels: { p1: { title: 'Panel 1' } },
      floatingPanels: [{
        panelId: 'p2', x: 100, y: 200,
        width: 400, height: 300, zIndex: 1,
      }],
      unpinnedPanels: [],
      popoutPanels: [],
      activePaneId: 'p1',
      nextZIndex: 2,
    };
    const state = deserialize(v1Data as any);
    expect(state.placements.get('p1')?.type).toBe('docked');
    expect(state.placements.get('p2')?.type).toBe('floating');
    expect(state.panels.get('p1')?.title).toBe('Panel 1');
    expect(state.panels.get('p2')).toBeDefined();
  });
});

describe('localStorage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      _store: {} as Record<string, string>,
      getItem(key: string) { return this._store[key] ?? null; },
      setItem(key: string, val: string) { this._store[key] = val; },
      removeItem(key: string) { delete this._store[key]; },
    });
  });

  test('save and load round-trip', () => {
    const state = makeState();
    saveToLocalStorage('test-key', state);
    const loaded = loadFromLocalStorage('test-key');
    expect(loaded).not.toBeNull();
    expect(loaded!.panels.get('p1')?.title).toBe('Panel 1');
  });

  test('load returns null for missing key', () => {
    const loaded = loadFromLocalStorage('nonexistent');
    expect(loaded).toBeNull();
  });

  test('clear removes key', () => {
    const state = makeState();
    saveToLocalStorage('test-key', state);
    clearLocalStorage('test-key');
    expect(loadFromLocalStorage('test-key')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run packages/dock-manager-core/src/__tests__/serializer.test.ts
```

- [ ] **Step 3: Implement serializer**

```ts
// packages/dock-manager-core/src/serialization/serializer.ts
import type { DockManagerState, Placement, PanelConfig, LayoutNode } from '../types/dock';

export interface SerializedDockLayout {
  version: number;
  layout: LayoutNode;
  panels: Record<string, PanelConfig>;
  placements: Record<string, Placement>;
  activePaneId: string;
  nextZIndex: number;
  maximizedPanelId?: string;
}

export function serialize(state: DockManagerState): SerializedDockLayout {
  return {
    version: 3,
    layout: state.layout,
    panels: Object.fromEntries(state.panels),
    placements: Object.fromEntries(state.placements),
    activePaneId: state.activePaneId,
    nextZIndex: state.nextZIndex,
    maximizedPanelId: state.maximizedPanelId,
  };
}

export function deserialize(data: any): DockManagerState {
  if (!data || !data.layout) {
    throw new Error('Invalid serialized layout: missing layout');
  }

  const version = data.version ?? 1;

  if (version >= 3) {
    return {
      layout: data.layout,
      panels: new Map(Object.entries(data.panels ?? {})),
      placements: new Map(Object.entries(data.placements ?? {})),
      activePaneId: data.activePaneId ?? '',
      nextZIndex: data.nextZIndex ?? 1,
      maximizedPanelId: data.maximizedPanelId,
    };
  }

  // v1/v2 migration: convert separate arrays to placements map
  const panels = new Map<string, PanelConfig>(
    Object.entries(data.panels ?? {})
  );
  const placements = new Map<string, Placement>();

  // Docked panels from layout tree
  const layoutPanelIds = collectPanelIds(data.layout);
  for (const panelId of layoutPanelIds) {
    const group = findGroupForPanel(data.layout, panelId);
    placements.set(panelId, { type: 'docked', groupId: group?.id ?? '' });
  }

  // Floating panels
  if (Array.isArray(data.floatingPanels)) {
    for (const fp of data.floatingPanels) {
      placements.set(fp.panelId, {
        type: 'floating',
        x: fp.x, y: fp.y,
        width: fp.width, height: fp.height,
        zIndex: fp.zIndex ?? 1,
        sourceGroupId: fp.sourceTabGroupId,
      });
      if (!panels.has(fp.panelId)) {
        panels.set(fp.panelId, { title: fp.panelId });
      }
    }
  }

  // Unpinned panels
  if (Array.isArray(data.unpinnedPanels)) {
    for (const up of data.unpinnedPanels) {
      placements.set(up.panelId, {
        type: 'unpinned',
        edge: up.edge, size: up.size ?? 200,
        sourceGroupId: up.sourceTabGroupId,
      });
      if (!panels.has(up.panelId)) {
        panels.set(up.panelId, { title: up.panelId });
      }
    }
  }

  // Popout panels
  if (Array.isArray(data.popoutPanels)) {
    for (const pp of data.popoutPanels) {
      placements.set(pp.panelId, {
        type: 'popout',
        windowName: pp.windowName,
        x: pp.x, y: pp.y,
        width: pp.width, height: pp.height,
      });
      if (!panels.has(pp.panelId)) {
        panels.set(pp.panelId, { title: pp.panelId });
      }
    }
  }

  return {
    layout: data.layout,
    panels,
    placements,
    activePaneId: data.activePaneId ?? '',
    nextZIndex: data.nextZIndex ?? 1,
    maximizedPanelId: data.maximizedPanelId,
  };
}

// ── localStorage persistence ──

export function saveToLocalStorage(key: string, state: DockManagerState): void {
  try {
    const data = serialize(state);
    localStorage.setItem(key, JSON.stringify(data));
  } catch { /* quota exceeded or unavailable — silently fail */ }
}

export function loadFromLocalStorage(key: string): DockManagerState | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return deserialize(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearLocalStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch { /* silently fail */ }
}

// ── File export/import ──

export function exportToFile(state: DockManagerState): string {
  return JSON.stringify(serialize(state), null, 2);
}

export function importFromFile(json: string): DockManagerState {
  return deserialize(JSON.parse(json));
}

// ── URL export/import ──

export function exportAsUrl(state: DockManagerState): string {
  const data = serialize(state);
  const encoded = btoa(JSON.stringify(data));
  return `${location.origin}${location.pathname}?layout=${encoded}`;
}

export function importFromUrl(urlString: string): DockManagerState {
  const url = new URL(urlString);
  const encoded = url.searchParams.get('layout');
  if (!encoded) throw new Error('No layout parameter in URL');
  return deserialize(JSON.parse(atob(encoded)));
}

// ── Helpers ──

function collectPanelIds(node: LayoutNode): string[] {
  if (node.type === 'tabgroup') return [...node.panels];
  return node.children.flatMap(c => collectPanelIds(c));
}

function findGroupForPanel(node: LayoutNode, panelId: string): { id: string } | null {
  if (node.type === 'tabgroup') {
    return node.panels.includes(panelId) ? node : null;
  }
  for (const child of node.children) {
    const found = findGroupForPanel(child, panelId);
    if (found) return found;
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run packages/dock-manager-core/src/__tests__/serializer.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/dock-manager-core/src/serialization/serializer.ts packages/dock-manager-core/src/__tests__/serializer.test.ts
git commit -m "feat(rewrite): v3 serialization format with v1/v2 migration"
```

---

## Task 6: DockviewApi — Same Public Surface, New Internals

**Files:**
- Create: `packages/dock-manager-core/src/api/DockviewApi.ts` (rewrite)
- Test: `packages/dock-manager-core/src/__tests__/DockviewApi.test.ts` (rewrite)

Same public method signatures. Internally reads the `placements` map instead of the old `floatingPanels[]` etc. `PanelApi.ts` is unchanged.

- [ ] **Step 1: Write failing tests for key API methods**

Test that `DockviewApi` methods dispatch correct actions and read state correctly. Focus on methods that change due to the new state shape: `getFloatingPanels()`, `isFloating()`, `isPanelPlaced()`, `getAllPanelIds()`.

```ts
// packages/dock-manager-core/src/__tests__/DockviewApi.test.ts
import { describe, test, expect, vi } from 'vitest';
import { DockviewApi } from '../api/DockviewApi';
import type { DockManagerState } from '../types/dock';

function makeState(): DockManagerState {
  return {
    layout: {
      type: 'tabgroup', id: 'tg1',
      panels: ['p1', 'p2'], activePanel: 'p1',
    },
    panels: new Map([
      ['p1', { title: 'P1' }],
      ['p2', { title: 'P2' }],
      ['p3', { title: 'P3 (floating)' }],
    ]),
    placements: new Map([
      ['p1', { type: 'docked', groupId: 'tg1' }],
      ['p2', { type: 'docked', groupId: 'tg1' }],
      ['p3', { type: 'floating', x: 0, y: 0, width: 400, height: 300, zIndex: 1 }],
    ]),
    activePaneId: 'p1',
    nextZIndex: 2,
  };
}

describe('DockviewApi — state queries', () => {
  test('getAllPanelIds returns all panels', () => {
    const dispatch = vi.fn();
    const api = new DockviewApi(() => makeState(), dispatch);
    expect(api.getAllPanelIds().sort()).toEqual(['p1', 'p2', 'p3']);
  });

  test('isFloating returns true for floating panel', () => {
    const dispatch = vi.fn();
    const api = new DockviewApi(() => makeState(), dispatch);
    expect(api.isFloating('p3')).toBe(true);
    expect(api.isFloating('p1')).toBe(false);
  });

  test('getFloatingPanels returns floating panel data', () => {
    const dispatch = vi.fn();
    const api = new DockviewApi(() => makeState(), dispatch);
    const floating = api.getFloatingPanels();
    expect(floating.length).toBe(1);
    expect(floating[0].panelId).toBe('p3');
  });

  test('hasPanel returns true for existing panel', () => {
    const dispatch = vi.fn();
    const api = new DockviewApi(() => makeState(), dispatch);
    expect(api.hasPanel('p1')).toBe(true);
    expect(api.hasPanel('nonexistent')).toBe(false);
  });
});

describe('DockviewApi — actions', () => {
  test('addPanel dispatches ADD_PANEL', () => {
    const dispatch = vi.fn();
    const api = new DockviewApi(() => makeState(), dispatch);
    api.addPanel({ panelId: 'p4', config: { title: 'New' } });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ADD_PANEL', panelId: 'p4' })
    );
  });

  test('closePanel dispatches CLOSE_PANEL', () => {
    const dispatch = vi.fn();
    const api = new DockviewApi(() => makeState(), dispatch);
    api.closePanel('p1');
    expect(dispatch).toHaveBeenCalledWith({ type: 'CLOSE_PANEL', panelId: 'p1' });
  });

  test('maximizePanel dispatches MAXIMIZE_PANEL', () => {
    const dispatch = vi.fn();
    const api = new DockviewApi(() => makeState(), dispatch);
    api.maximizePanel('p1');
    expect(dispatch).toHaveBeenCalledWith({ type: 'MAXIMIZE_PANEL', panelId: 'p1' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run packages/dock-manager-core/src/__tests__/DockviewApi.test.ts
```

- [ ] **Step 3: Implement DockviewApi**

Rewrite `DockviewApi` class with same public methods, but internally reading from `placements` map. The constructor takes `getState: () => DockManagerState` and `dispatch: (action: DockAction) => void`.

Key methods that change:
- `getFloatingPanels()` → filter `placements` for `type === 'floating'`, return in old `FloatingPanel` shape for compat
- `isFloating()` → check `placements.get(id)?.type === 'floating'`
- `getAllPanelIds()` → `Array.from(state.panels.keys())`
- `isPanelPlaced()` → `placements.has(panelId)`
- `getGroupForPanel()` → `LayoutTree.groupForPanel()`

Full implementation: ~400 lines maintaining every public method listed in the exploration above.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run packages/dock-manager-core/src/__tests__/DockviewApi.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/dock-manager-core/src/api/DockviewApi.ts packages/dock-manager-core/src/__tests__/DockviewApi.test.ts
git commit -m "feat(rewrite): DockviewApi with placement map internals"
```

---

## Task 7: DOM Layer — SplitView (Unchanged Logic, Clean File)

**Files:**
- Create: `packages/dock-manager-core/src/dom/views/SplitView.ts` (clean copy)

SplitView is already clean at 346 lines. Copy it as-is — it only depends on types, not on state shape. No test changes needed.

- [ ] **Step 1: Verify SplitView compiles with new types**

The current SplitView imports `SplitNode` and `LayoutNode` from `types/dock`. These types are unchanged in the new types file. Verify:

```bash
npx tsc --noEmit packages/dock-manager-core/src/dom/views/SplitView.ts 2>&1 | head -10
```

If it compiles, no changes needed. If there are type errors, fix the imports.

- [ ] **Step 2: Commit (if any changes were needed)**

```bash
git add packages/dock-manager-core/src/dom/views/SplitView.ts
git commit -m "chore(rewrite): verify SplitView compiles with new types"
```

---

## Task 8: DOM Layer — TabGroupView (Inline Context Menu + ResizeObserver Overflow)

**Files:**
- Create: `packages/dock-manager-core/src/dom/views/TabGroupView.ts` (rewrite)
- Test: `packages/dock-manager-core/src/__tests__/TabGroupView.test.ts`

Merges the current TabGroupView (1,141 lines) + ContextMenuManager (344 lines) + TabOverflowObserver (154 lines) into ~500 lines. Context menu is inline (~60 lines). Tab overflow uses a 20-line ResizeObserver.

- [ ] **Step 1: Write failing tests for TabGroupView**

Test tab rendering, context menu showing/hiding, tab overflow detection, and callback wiring. Tests use JSDOM to create elements and verify DOM output.

Key test areas:
- Renders correct number of tabs with correct `data-tab-id` attributes
- Active tab has `.dock-tab-active` class
- Right-click shows context menu with expected items (Close, Close Others, Float, Save Layout, etc.)
- Tab click fires `onActivateTab` callback
- Close button fires `onCloseTab` callback
- Locked group hides close buttons and disables drag
- Header collapsed mode hides the header

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run packages/dock-manager-core/src/__tests__/TabGroupView.test.ts
```

- [ ] **Step 3: Implement TabGroupView**

The implementation must preserve all CSS classes (`dock-panel-header`, `dock-tab`, `dock-tab-active`, `dock-tab-close`, `dock-context-menu`, `dock-context-menu-item`, etc.) and `data-*` attributes (`data-tab-id`, `data-tabgroup-id`) that e2e tests rely on.

Key structure:
```ts
export interface TabGroupViewCallbacks {
  onActivateTab: (panelId: string) => void;
  onCloseTab: (panelId: string) => void;
  onFloatTab: (panelId: string) => void;
  onMaximizeTab: (panelId: string) => void;
  onUnpinTab: (panelId: string) => void;
  onSaveLayout?: () => void;
  onDragStart: (panelId: string, e: DragEvent) => void;
  onTabReorder: (panels: string[]) => void;
  createContent: (panelId: string, container: HTMLElement) => IDisposable;
  createTab?: (panelId: string, container: HTMLElement, isActive: boolean) => IDisposable;
  createHeaderActions?: (slot: 'left' | 'right' | 'prefix', container: HTMLElement) => IDisposable;
  createWatermark?: (container: HTMLElement) => IDisposable;
}

export class TabGroupView {
  readonly element: HTMLDivElement;
  // ... internal state
  constructor(node: TabGroupNode, callbacks: TabGroupViewCallbacks, resourceStrings: DockResourceStrings) { ... }
  update(node: TabGroupNode): void { ... }
  dispose(): void { ... }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run packages/dock-manager-core/src/__tests__/TabGroupView.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/dock-manager-core/src/dom/views/TabGroupView.ts packages/dock-manager-core/src/__tests__/TabGroupView.test.ts
git commit -m "feat(rewrite): TabGroupView with inline context menu and ResizeObserver overflow"
```

---

## Task 9: DOM Layer — FloatingWindowView

**Files:**
- Create: `packages/dock-manager-core/src/dom/views/FloatingWindowView.ts` (rewrite)

Floating window with 8-direction resize via a single `pointerdown` handler reading `data-resize-dir`. ~300 lines (down from 531).

- [ ] **Step 1: Write failing tests**

Test window creation, drag-to-move, resize from each direction, z-index management, and dispose cleanup.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement FloatingWindowView**

Must preserve CSS classes: `dock-floating-window`, `dock-floating-titlebar`, `dock-floating-resize-handle`. Must preserve `data-panel-id` attribute.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add packages/dock-manager-core/src/dom/views/FloatingWindowView.ts packages/dock-manager-core/src/__tests__/FloatingWindowView.test.ts
git commit -m "feat(rewrite): FloatingWindowView with 8-direction resize"
```

---

## Task 10: DOM Layer — DragManager (Merged)

**Files:**
- Create: `packages/dock-manager-core/src/dom/DragManager.ts` (new, merges 3 files)

Merges DockDragManager (584) + DockIndicatorRenderer (470) + TabReorderManager (175) = 1,229 lines → ~400 lines.

- [ ] **Step 1: Write failing tests**

Test drag start/end, drop indicator positioning, tab reorder via drag, and drop zone detection.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement DragManager**

Must preserve CSS classes: `dock-drop-indicator`, `dock-drag-preview`, `dock-drop-zone-*`. Must use same `dragstart`/`dragover`/`drop` event flow.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add packages/dock-manager-core/src/dom/DragManager.ts packages/dock-manager-core/src/__tests__/DragManager.test.ts
git commit -m "feat(rewrite): DragManager merging drag, indicators, and tab reorder"
```

---

## Task 11: DOM Layer — Overlays (Merged)

**Files:**
- Create: `packages/dock-manager-core/src/dom/Overlays.ts` (new, merges 4 files)

Merges UnpinnedStripView (358) + MaximizeOverlayView (106) + PaneNavigator (238) + PanelFinder (140) = 842 lines → ~300 lines.

- [ ] **Step 1: Write failing tests**

Test each overlay type: unpinned strip rendering, maximize overlay show/hide, pane navigator (Ctrl+Tab), panel finder (Ctrl+P).

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement Overlays**

Must preserve CSS classes:
- Unpinned: `dock-unpinned-strip`, `dock-unpinned-tab`, `dock-unpinned-flyout`
- Maximize: `dock-maximize-overlay`
- Pane navigator: `dock-pane-navigator`
- Panel finder: `dock-panel-finder`

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add packages/dock-manager-core/src/dom/Overlays.ts packages/dock-manager-core/src/__tests__/Overlays.test.ts
git commit -m "feat(rewrite): Overlays merging unpinned, maximize, navigator, finder"
```

---

## Task 12: DOM Layer — DockviewComponent (Orchestrator)

**Files:**
- Create: `packages/dock-manager-core/src/dom/DockviewComponent.ts` (rewrite)
- Test: `packages/dock-manager-core/src/__tests__/DockviewComponent.test.ts` (rewrite)

The orchestrator. ~600 lines (down from 1,290). Inlines FocusManager, StateHistoryManager, RenderContainerManager, KeyboardManager, PopoutWindowManager.

- [ ] **Step 1: Write failing tests**

Test component creation, panel lifecycle (create/destroy), state dispatch, render container management, keyboard shortcut handling, undo/redo.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement DockviewComponent**

Must preserve:
- `DockviewComponentOptions` interface (same props)
- `IDisposable` interface
- CSS classes: `dock-manager-root`, `dock-manager-container`
- `data-*` attributes on root element
- The `api` property returning a `DockviewApi` instance
- The `state` property
- The `dispose()` method

Constructor must:
1. Create root DOM structure
2. Apply theme
3. Set up keyboard shortcuts
4. Create render containers
5. Build the initial view tree from state
6. Wire up state change notifications

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add packages/dock-manager-core/src/dom/DockviewComponent.ts packages/dock-manager-core/src/__tests__/DockviewComponent.test.ts
git commit -m "feat(rewrite): DockviewComponent orchestrator with inlined managers"
```

---

## Task 13: Public Exports — index.ts

**Files:**
- Create: `packages/dock-manager-core/src/index.ts` (rewrite)

Must export the exact same public API surface. Some exports change source files but keep the same names.

- [ ] **Step 1: Write index.ts**

```ts
// packages/dock-manager-core/src/index.ts

// ── Types ──
export type {
  SplitDirection, DockPosition, DockEdge, PanelConfig,
  TabGroupNode, SplitNode, LayoutNode,
  FloatingPanel, PopoutPanel, UnpinnedPanel,
  DockManagerState, PreventableDockEvent,
  HeaderPosition, LayoutConstraints, Placement,
} from './types/dock';
export { createPreventableEvent } from './types/dock';

// ── Resource Strings ──
export type { DockResourceStrings } from './types/resourceStrings';
export { defaultResourceStrings } from './types/resourceStrings';

// ── Reducer & State ──
export { dockReducer, createDefaultState, validateState } from './reducer/dockReducer';
export type { DockAction } from './reducer/dockReducer';

// ── API ──
export { DockviewApi } from './api/DockviewApi';
export type { AddPanelOptions, FloatPanelOptions, MovePanelOptions } from './api/DockviewApi';

// ── Component ──
export { DockviewComponent } from './dom/DockviewComponent';
export type { DockviewComponentOptions, IDisposable } from './dom/DockviewComponent';

// ── Panel API ──
export { PanelApi } from './api/PanelApi';

// ── Layout helpers ──
export {
  findTabGroupForPanel, findFirstTabGroup, findTabGroupById,
  findAllTabGroups, collectAllPanelsOrdered, collectLayoutPanelIds,
  isPanelPlaced, countPanels, removePanel, insertInGroup,
  insertBySplit, insertAtEdge, movePanel, detectPanelEdge,
  findTabGroupByEdge,
} from './layout/LayoutTree';

// ── LayoutTree class (new in rewrite) ──
export { LayoutTree } from './layout/LayoutTree';

// ── Serialization ──
export {
  serialize, deserialize,
  saveToLocalStorage, loadFromLocalStorage, clearLocalStorage,
  exportToFile, importFromFile, exportAsUrl, importFromUrl,
} from './serialization/serializer';
export type { SerializedDockLayout } from './serialization/serializer';

// ── Event emitter ──
export { EventEmitter } from './dom/EventEmitter';

// ── Theming ──
export type { DockTheme, DockThemeColors } from './theme/DockTheme';
export {
  applyTheme, createTheme, themes,
  vsCodeLight, githubLight, warmLight, solarizedLight, sepiaLight, mintLight, lavenderLight,
  vsCodeDark, draculaDark, nordDark, solarizedDark, midnightDark, forestDark, slateDark,
  getThemeByName, getThemesByMode,
} from './theme/DockTheme';

// ── Overlays (replace standalone managers) ──
// KeyboardManager, ContextMenuManager, PaneNavigator, PanelFinder, StateHistoryManager
// are now inlined into DockviewComponent and Overlays.
// Re-export shim classes for backward compat if wrappers import them directly.
export { KeyboardManager } from './dom/compat/KeyboardManager';
export type { KeyboardManagerOptions } from './dom/compat/KeyboardManager';
export { ContextMenuManager } from './dom/compat/ContextMenuManager';
export type { ContextMenuManagerOptions } from './dom/compat/ContextMenuManager';
export { PaneNavigator } from './dom/compat/PaneNavigator';
export type { PaneNavigatorOptions } from './dom/compat/PaneNavigator';
export { StateHistoryManager } from './dom/compat/StateHistoryManager';
export { PanelFinder } from './dom/compat/PanelFinder';
export type { PanelFinderOptions } from './dom/compat/PanelFinder';

// ── Internal (exported for testing) ──
/** @internal */
export { genId, resetIdCounter, syncIdCounter } from './layout/LayoutTree';

// ── Lifecycle utilities ──
export {
  CompositeDisposable, MutableDisposable, toDisposable, listenEvent,
} from './utils/lifecycle';

// ── Debug ──
export { setDockManagerDebug, isDockManagerDebugEnabled } from './utils/debug';

// ── Layout invariant diagnostics ──
export { checkLayoutInvariants, findLostPanels, type InvariantViolation } from './layout/layoutInvariants';
```

Note: Create thin compat shim files under `src/dom/compat/` for the standalone manager classes that are now inlined. Each shim re-exports the type interface and provides a no-op or pass-through constructor so existing import sites compile. These shims are ~10-20 lines each.

- [ ] **Step 2: Create compat shims**

Create `src/dom/compat/` directory with 5 shim files for backward-compatible exports: `KeyboardManager.ts`, `ContextMenuManager.ts`, `PaneNavigator.ts`, `StateHistoryManager.ts`, `PanelFinder.ts`.

Each shim exports the class/interface name with the same constructor signature, delegating to the internal implementation in DockviewComponent or Overlays.

- [ ] **Step 3: Create layoutInvariants compat**

Create `src/layout/layoutInvariants.ts` that re-exports `validateState` as `checkLayoutInvariants` and provides the `findLostPanels` helper using the new placement map.

```ts
// packages/dock-manager-core/src/layout/layoutInvariants.ts
import type { DockManagerState } from '../types/dock';
import { validateState } from '../reducer/dockReducer';
import { LayoutTree } from './LayoutTree';

export type InvariantViolation = { kind: string; detail: string };

export function checkLayoutInvariants(state: DockManagerState): InvariantViolation[] {
  return validateState(state);
}

export function findLostPanels(state: DockManagerState): string[] {
  const tree = new LayoutTree(state.layout);
  const inLayout = new Set(tree.allPanelIds());
  const lost: string[] = [];
  for (const [panelId, placement] of state.placements) {
    if (placement.type === 'docked' && !inLayout.has(panelId)) {
      lost.push(panelId);
    }
  }
  return lost;
}
```

- [ ] **Step 4: Verify build compiles**

```bash
cd /Users/develop/projects/dockmanager && npx tsc --noEmit -p packages/dock-manager-core/tsconfig.json
```

Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/dock-manager-core/src/index.ts packages/dock-manager-core/src/dom/compat/ packages/dock-manager-core/src/layout/layoutInvariants.ts
git commit -m "feat(rewrite): public exports with backward-compat shims"
```

---

## Task 14: Delete Old Files

**Files:**
- Delete: All files that have been replaced by the rewrite

- [ ] **Step 1: Remove old files that are no longer needed**

Delete files that are now merged into the new structure:
```bash
cd /Users/develop/projects/dockmanager/packages/dock-manager-core/src
# These are replaced by the rewrite files already committed
rm -f dom/ContextMenuManager.ts
rm -f dom/DockDragManager.ts
rm -f dom/DockIndicatorRenderer.ts
rm -f dom/TabReorderManager.ts
rm -f dom/FocusManager.ts
rm -f dom/StateHistoryManager.ts
rm -f dom/RenderContainerManager.ts
rm -f dom/KeyboardManager.ts
rm -f dom/TabOverflowObserver.ts
rm -f dom/PopoutWindowManager.ts
rm -f dom/PaneNavigator.ts
rm -f dom/PanelFinder.ts
rm -f dom/views/UnpinnedStripView.ts
rm -f dom/views/MaximizeOverlayView.ts
```

- [ ] **Step 2: Verify build still compiles**

```bash
npx tsc --noEmit -p packages/dock-manager-core/tsconfig.json
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(rewrite): remove old files replaced by consolidated modules"
```

---

## Task 15: Port Unit Tests

**Files:**
- Modify: `packages/dock-manager-core/src/__tests__/*.test.ts`

Port the intent of all existing tests to work with the new data model. Tests that assert on structurally impossible bugs (orphan panel in the old shape) are deleted. Tests that assert on behavior are ported with new setup/assertions.

- [ ] **Step 1: Update test helpers to use new state shape**

Every test that creates a `DockManagerState` needs to use `Map` for `panels` and `placements` instead of `Record` and arrays. Create a shared test utility:

```ts
// packages/dock-manager-core/src/__tests__/testHelpers.ts
import type { DockManagerState, PanelConfig, Placement, TabGroupNode } from '../types/dock';

export function makeTestState(opts?: {
  panels?: Array<[string, PanelConfig]>;
  layout?: import('../types/dock').LayoutNode;
  placements?: Array<[string, Placement]>;
  activePaneId?: string;
}): DockManagerState {
  const layout = opts?.layout ?? {
    type: 'tabgroup' as const, id: 'tg1',
    panels: opts?.panels?.map(([id]) => id) ?? ['p1'],
    activePanel: opts?.panels?.[0]?.[0] ?? 'p1',
  };
  const panelEntries = opts?.panels ?? [['p1', { title: 'Panel 1' }]];
  const placementEntries = opts?.placements ?? panelEntries.map(
    ([id]) => [id, { type: 'docked' as const, groupId: 'tg1' }] as [string, Placement]
  );
  return {
    layout,
    panels: new Map(panelEntries),
    placements: new Map(placementEntries),
    activePaneId: opts?.activePaneId ?? panelEntries[0]?.[0] ?? '',
    nextZIndex: 1,
  };
}
```

- [ ] **Step 2: Port reducer tests**

Update all `dockReducer.test.ts` tests to use `makeTestState()` and assert on `state.placements.get()` instead of `state.floatingPanels[]`.

- [ ] **Step 3: Port component tests**

Update `DockviewComponent.test.ts` to use new state shape.

- [ ] **Step 4: Port API tests**

Update `DockviewApi.test.ts` to use new state shape.

- [ ] **Step 5: Port remaining test files**

Port serializer, invariants, accessibility, header collapse, unpinned strip, and other test files.

- [ ] **Step 6: Delete tests for eliminated bugs**

Delete tests that assert orphan panel, duplicate placement, and other bugs that are now structurally impossible.

- [ ] **Step 7: Run all unit tests**

```bash
npx vitest run --root packages/dock-manager-core
```

Expected: 600-700 tests pass (some removed, some new).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "test(rewrite): port unit tests to new data model"
```

---

## Task 16: CSS — Minor Cleanup

**Files:**
- Modify: `packages/dock-manager-core/src/styles/dock-manager.css`

Consolidate duplicated context menu styles. No visual changes — preserve every pixel of the current look and feel.

- [ ] **Step 1: Check for duplicated styles**

Search for duplicated context menu selectors, redundant declarations.

- [ ] **Step 2: Deduplicate (if found)**

Remove exact duplicates only. Do not change any values, colors, sizes, or behavior.

- [ ] **Step 3: Verify no visual regression**

Build and run the demo app. Verify light and dark themes look identical.

- [ ] **Step 4: Commit**

```bash
git add packages/dock-manager-core/src/styles/dock-manager.css
git commit -m "style(rewrite): consolidate duplicated context menu CSS"
```

---

## Task 17: Build Core Package

**Files:**
- Modify: `packages/dock-manager-core/package.json` (if needed)

- [ ] **Step 1: Build the core package**

```bash
cd /Users/develop/projects/dockmanager && npm run build:core
```

Expected: Clean build with no errors.

- [ ] **Step 2: Fix any type errors**

If there are type errors from the build, fix them. Common issues:
- Missing exports in index.ts
- Type mismatches between old and new interfaces
- Import paths that changed

- [ ] **Step 3: Commit fixes**

```bash
git add -A
git commit -m "fix(rewrite): resolve build errors"
```

---

## Task 18: Update React Wrapper

**Files:**
- Modify: `packages/react-dock-manager/src/components/dock/DockManagerCore.tsx`

The React wrapper imports from `@widgetstools/dock-manager-core`. If the public API surface is preserved, it should compile with minimal changes. The main change is that `DockManagerState.panels` is now a `Map` instead of `Record`.

- [ ] **Step 1: Update DockManagerCore.tsx for Map-based state**

Any code that reads `state.panels[panelId]` needs to change to `state.panels.get(panelId)`. Any code that reads `state.floatingPanels` needs to use the placements map.

- [ ] **Step 2: Build React wrapper**

```bash
cd /Users/develop/projects/dockmanager && npm run build:react
```

Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add packages/react-dock-manager/
git commit -m "feat(rewrite): update React wrapper for new state shape"
```

---

## Task 19: Update Angular Wrapper

**Files:**
- Modify: `packages/angular-dock-manager/src/lib/.../dock-manager-core.component.ts`

Same changes as React wrapper — `Map` instead of `Record` for panels.

- [ ] **Step 1: Update Angular component**

- [ ] **Step 2: Build Angular wrapper**

```bash
cd /Users/develop/projects/dockmanager && npm run build:angular
```

Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add packages/angular-dock-manager/
git commit -m "feat(rewrite): update Angular wrapper for new state shape"
```

---

## Task 20: Update Demo App

**Files:**
- Modify: `apps/demo/src/App.tsx`
- Modify: `apps/demo/src/config/defaultLayout.ts`

Update the demo app to use the new state shape (Map-based panels and placements).

- [ ] **Step 1: Update defaultLayout.ts**

Change `panels: { ... }` to `panels: new Map([...])` and add `placements: new Map([...])`. Remove `floatingPanels`, `unpinnedPanels`, `popoutPanels` arrays.

- [ ] **Step 2: Update App.tsx**

Any state reading code that uses old shape needs updating.

- [ ] **Step 3: Build demo app**

```bash
cd /Users/develop/projects/dockmanager && npm run build:demo
```

Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add apps/demo/
git commit -m "feat(rewrite): update demo app for new state shape"
```

---

## Task 21: Run E2E Tests

**Files:** None (read-only verification)

- [ ] **Step 1: Start dev server**

```bash
cd /Users/develop/projects/dockmanager && npm run dev &
```

- [ ] **Step 2: Run all e2e tests**

```bash
npx playwright test 2>&1 | tail -20
```

Expected: All 59 tests pass. If any fail, they indicate a rewrite bug — the e2e tests themselves must NOT be modified.

- [ ] **Step 3: Fix any failing e2e tests**

For each failure:
1. Read the test to understand what DOM it expects
2. Check that the rewrite produces the correct CSS classes, `data-*` attributes, and DOM structure
3. Fix the rewrite code (not the test)

- [ ] **Step 4: Re-run e2e tests until all pass**

```bash
npx playwright test
```

Expected: 59/59 pass.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(rewrite): resolve e2e test failures"
```

---

## Task 22: Update fi-trading-terminal Apps

**Files:**
- Modify: `/Users/develop/projects/fi-trading-terminal/react-app/` (pack + install new tarballs)
- Modify: `/Users/develop/projects/fi-trading-terminal/angular-app/` (pack + install new tarballs)

- [ ] **Step 1: Pack new tarballs**

```bash
cd /Users/develop/projects/dockmanager
npm pack --workspace=packages/dock-manager-core
npm pack --workspace=packages/react-dock-manager
npm pack --workspace=packages/angular-dock-manager
```

- [ ] **Step 2: Copy tarballs to fi-trading-terminal**

```bash
cp widgetstools-dock-manager-core-*.tgz /Users/develop/projects/fi-trading-terminal/react-app/libs/
cp widgetstools-react-dock-manager-*.tgz /Users/develop/projects/fi-trading-terminal/react-app/libs/
cp widgetstools-dock-manager-core-*.tgz /Users/develop/projects/fi-trading-terminal/angular-app/libs/
cp widgetstools-angular-dock-manager-*.tgz /Users/develop/projects/fi-trading-terminal/angular-app/libs/
```

- [ ] **Step 3: Update package.json versions and rebuild**

```bash
cd /Users/develop/projects/fi-trading-terminal/react-app && npm install && npm run build
cd /Users/develop/projects/fi-trading-terminal/angular-app && npm install && npm run build
```

Expected: Both apps build successfully.

- [ ] **Step 4: Verify fi-trading-terminal react-app renders**

Start the dev server, open in browser, verify the trading terminal renders correctly with all panels.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: upgrade fi-trading-terminal to rewritten dock-manager-core"
```

---

## Task 23: Final Verification and Line Count

**Files:** None (read-only)

- [ ] **Step 1: Run all unit tests**

```bash
npx vitest run --root packages/dock-manager-core 2>&1 | tail -5
```

Expected: 600-700 tests pass.

- [ ] **Step 2: Run all e2e tests**

```bash
npx playwright test 2>&1 | tail -10
```

Expected: 59/59 pass.

- [ ] **Step 3: Count lines**

```bash
find packages/dock-manager-core/src -name '*.ts' ! -path '*__tests__*' ! -path '*test*' | xargs wc -l | tail -1
```

Expected: ~4,800-5,200 lines (target: 4,894).

- [ ] **Step 4: Verify no feature regression**

Manually check in the demo app:
- Tab drag-and-drop between groups
- Tab reorder within a group
- Float a panel, resize it, dock it back
- Maximize/restore
- Unpin/pin panel
- Context menu (all items present)
- Save Layout via context menu
- Keyboard shortcuts (Ctrl+Tab, Ctrl+P)
- Light/dark theme switching
- Splitter resize (both mouse and touch)

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore(rewrite): final verification — all tests pass, ~5K lines"
```

---

## Merge Criteria Checklist

Before merging `rewrite/lean-core` into `main`:

- [ ] All unit tests pass (600-700 ported tests)
- [ ] All 59 e2e tests pass unchanged
- [ ] React wrapper builds
- [ ] Angular wrapper builds
- [ ] Demo app builds and renders
- [ ] fi-trading-terminal react-app builds
- [ ] fi-trading-terminal angular-app builds
- [ ] No visual regression in light or dark theme
- [ ] Source line count is ≤5,200 lines (excluding tests)
- [ ] All public API exports from index.ts match the original
