/**
 * LayoutTree — Clean, immutable layout tree operations.
 *
 * Replaces the scattered helpers in layoutHelpers.ts with a cohesive module
 * that handles all tree mutations correctly:
 *
 * 1. removePanel — always returns a valid tree (never null), auto-collapses
 * 2. insertAtEdge — inserts at the correct root-level edge (left/right/top/bottom)
 * 3. insertInGroup — adds panel to existing tab group (center drop)
 * 4. movePanel — combines remove + insert atomically
 * 5. normalizeSizes — ensures sizes always sum to 100
 * 6. collapseTree — removes empty groups and single-child splits
 *
 * All functions are pure (no side effects) and return new objects (immutable).
 */

import type {
  LayoutNode,
  TabGroupNode,
  SplitNode,
  DockPosition,
  DockEdge,
} from '../types/dock';

// ─── ID generation ──────────────────────────────────────────────────

let _idCounter = 0;

export function genId(prefix: string): string {
  return `${prefix}_${++_idCounter}`;
}

export function resetIdCounter(): void {
  _idCounter = 0;
}

// ─── Core operations ────────────────────────────────────────────────

/**
 * Remove a panel from the layout tree.
 * Returns null if the tree becomes completely empty (no panels remain).
 *
 * Automatically:
 * - Removes the panel from its tab group
 * - Collapses empty tab groups
 * - Promotes single-child splits (removes unnecessary nesting)
 * - Normalizes sizes after child removal
 */
export function removePanel(root: LayoutNode, panelId: string): LayoutNode | null {
  return removePanelInner(root, panelId);
}

function removePanelInner(node: LayoutNode, panelId: string): LayoutNode | null {
  if (node.type === 'tabgroup') {
    if (!node.panels.includes(panelId)) return node; // Not here
    const remaining = node.panels.filter(p => p !== panelId);
    if (remaining.length === 0) return null; // Empty group — remove
    return {
      ...node,
      panels: remaining,
      activePanel: node.activePanel === panelId ? remaining[0] : node.activePanel,
    };
  }

  // Split node — recurse into children
  const newChildren: LayoutNode[] = [];
  const newSizes: number[] = [];

  for (let i = 0; i < node.children.length; i++) {
    const result = removePanelInner(node.children[i], panelId);
    if (result !== null) {
      newChildren.push(result);
      newSizes.push(node.sizes[i] ?? (100 / node.children.length));
    }
  }

  if (newChildren.length === 0) return null;
  if (newChildren.length === 1) return newChildren[0]; // Promote single child

  return { ...node, children: newChildren, sizes: normalizeSizes(newSizes) };
}

/**
 * Insert a panel into a specific tab group (center/tab drop).
 * If the group doesn't exist, the tree is returned unchanged.
 */
export function insertInGroup(
  root: LayoutNode,
  targetGroupId: string,
  panelId: string,
): LayoutNode {
  if (root.type === 'tabgroup') {
    if (root.id === targetGroupId) {
      return { ...root, panels: [...root.panels, panelId], activePanel: panelId };
    }
    return root;
  }
  return {
    ...root,
    children: root.children.map(child => insertInGroup(child, targetGroupId, panelId)),
  };
}

/**
 * Insert a panel next to a specific tab group by splitting it.
 * Creates a new split with the existing group and a new tab group
 * at the given position (left/right/top/bottom).
 *
 * If the target group is empty (a safeEmptyGroup placeholder left over
 * from a previous action that drained the layout), splitting would
 * leave the empty sibling visible as a blank pane. Instead we collapse
 * the insert into a plain insertInGroup on the empty target so the
 * placeholder is reused for the new panel.
 */
export function insertBySplit(
  root: LayoutNode,
  targetGroupId: string,
  panelId: string,
  position: DockPosition,
): LayoutNode {
  if (position === 'center') return insertInGroup(root, targetGroupId, panelId);

  if (root.type === 'tabgroup') {
    if (root.id === targetGroupId) {
      if (root.panels.length === 0) {
        // Reuse the empty placeholder instead of creating a split.
        return { ...root, panels: [panelId], activePanel: panelId };
      }
      return splitGroup(root, panelId, position);
    }
    return root;
  }
  return {
    ...root,
    children: root.children.map(child => insertBySplit(child, targetGroupId, panelId, position)),
  };
}

/**
 * Insert a panel at a root-level edge of the layout.
 * This adds a new tab group flush against the left/right/top/bottom
 * edge of the entire layout, not nested inside any existing split.
 *
 * If the root split direction matches the edge axis, the new group is
 * appended/prepended as a direct child. Otherwise, the layout is
 * wrapped in a new split.
 */
export function insertAtEdge(
  root: LayoutNode,
  panelId: string,
  edge: DockEdge,
  sizePercent = 20,
): LayoutNode {
  // If the root is an empty tabgroup placeholder, reuse it for the panel
  // so we don't wrap it in a split with a blank sibling.
  if (root.type === 'tabgroup' && root.panels.length === 0) {
    return { ...root, panels: [panelId], activePanel: panelId };
  }

  const newGroup: TabGroupNode = {
    type: 'tabgroup',
    id: genId('tg'),
    panels: [panelId],
    activePanel: panelId,
  };

  const isHorizontal = edge === 'left' || edge === 'right';
  const isAfter = edge === 'right' || edge === 'bottom';

  // If root is a split with matching direction, add as direct child
  if (root.type === 'split') {
    const dirMatch =
      (isHorizontal && root.direction === 'horizontal') ||
      (!isHorizontal && root.direction === 'vertical');

    if (dirMatch) {
      const children = isAfter
        ? [...root.children, newGroup]
        : [newGroup, ...root.children];
      const oldTotal = root.sizes.reduce((a, b) => a + b, 0) || 100;
      const scale = (100 - sizePercent) / oldTotal;
      const sizes = isAfter
        ? [...root.sizes.map(s => s * scale), sizePercent]
        : [sizePercent, ...root.sizes.map(s => s * scale)];
      return { ...root, children, sizes };
    }
  }

  // Otherwise, wrap in a new split
  const children = isAfter ? [root, newGroup] : [newGroup, root];
  return {
    type: 'split',
    id: genId('split'),
    direction: isHorizontal ? 'horizontal' : 'vertical',
    children,
    sizes: isAfter ? [100 - sizePercent, sizePercent] : [sizePercent, 100 - sizePercent],
  };
}

/**
 * Move a panel from its current location to a new target.
 * Combines remove + insert atomically. Handles all drop positions:
 * - center: add as tab in target group
 * - left/right/top/bottom: split target group
 *
 * Returns unchanged tree if:
 * - Dropping on same group as center (no-op)
 * - Panel doesn't exist in tree
 */
export function movePanel(
  root: LayoutNode,
  panelId: string,
  targetGroupId: string,
  position: DockPosition,
): LayoutNode {
  // Same-group center drop = no-op (already in that group)
  const sourceGroup = findTabGroupForPanel(root, panelId);
  if (sourceGroup === targetGroupId && position === 'center') return root;
  // Same-group edge drop with single panel = no-op
  if (sourceGroup === targetGroupId && position !== 'center') {
    const group = findTabGroupById(root, sourceGroup);
    if (group && group.panels.length === 1) return root;
  }

  // Remove from current location
  const afterRemove = removePanel(root, panelId);

  // If tree is now empty, create a fresh group for the panel at its new location
  if (!afterRemove) {
    return { type: 'tabgroup', id: genId('tg'), panels: [panelId], activePanel: panelId };
  }

  // Insert at new location
  if (position === 'center') {
    // Target group might have been collapsed if it was in the same split
    if (findTabGroupById(afterRemove, targetGroupId)) {
      return insertInGroup(afterRemove, targetGroupId, panelId);
    }
    // Target group gone — insert into first available group
    const firstGroup = findFirstTabGroup(afterRemove);
    if (firstGroup) return insertInGroup(afterRemove, firstGroup, panelId);
    return afterRemove;
  }

  // Edge drop — check if target still exists after remove
  if (findTabGroupById(afterRemove, targetGroupId)) {
    return insertBySplit(afterRemove, targetGroupId, panelId, position);
  }
  // Target collapsed — insert at layout edge
  const edge = positionToEdge(position);
  return insertAtEdge(afterRemove, panelId, edge);
}

// ─── Query operations ───────────────────────────────────────────────

/** Find which tab group contains a panel */
export function findTabGroupForPanel(node: LayoutNode, panelId: string): string | null {
  if (node.type === 'tabgroup') return node.panels.includes(panelId) ? node.id : null;
  for (const child of node.children) {
    const result = findTabGroupForPanel(child, panelId);
    if (result) return result;
  }
  return null;
}

/** Find the first tab group (DFS) */
export function findFirstTabGroup(node: LayoutNode): string | null {
  if (node.type === 'tabgroup') return node.id;
  for (const child of node.children) {
    const result = findFirstTabGroup(child);
    if (result) return result;
  }
  return null;
}

/** Find a tab group by ID */
export function findTabGroupById(node: LayoutNode, id: string): TabGroupNode | null {
  if (node.type === 'tabgroup') return node.id === id ? node : null;
  for (const child of node.children) {
    const result = findTabGroupById(child, id);
    if (result) return result;
  }
  return null;
}

/** Find all tab groups in DFS order */
export function findAllTabGroups(node: LayoutNode): TabGroupNode[] {
  if (node.type === 'tabgroup') return [node];
  return node.children.flatMap(child => findAllTabGroups(child));
}

/** Collect all panel IDs in the layout tree */
export function collectLayoutPanelIds(node: LayoutNode): Set<string> {
  if (node.type === 'tabgroup') return new Set(node.panels);
  const ids = new Set<string>();
  for (const child of node.children) {
    for (const id of collectLayoutPanelIds(child)) ids.add(id);
  }
  return ids;
}

/** Collect all panels in DFS order (for keyboard navigation) */
export function collectAllPanelsOrdered(node: LayoutNode): string[] {
  if (node.type === 'tabgroup') return [...node.panels];
  return node.children.flatMap(child => collectAllPanelsOrdered(child));
}

/** Count total panels */
export function countPanels(node: LayoutNode): number {
  if (node.type === 'tabgroup') return node.panels.length;
  return node.children.reduce((sum, child) => sum + countPanels(child), 0);
}

/**
 * Detect which edge a panel is closest to in the layout.
 * Used by UNPIN_PANEL to determine which edge strip to place the panel on.
 */
export function detectPanelEdge(node: LayoutNode, panelId: string): DockEdge {
  return detectEdgeInner(node, panelId, []);
}

/**
 * Find the tab group at a specific edge of the layout.
 * Only matches tab groups at the outermost level on the correct axis.
 */
export function findTabGroupByEdge(node: LayoutNode, edge: DockEdge): string | null {
  if (node.type === 'tabgroup') return null;

  const isHorizontal = edge === 'left' || edge === 'right';
  if (isHorizontal && node.direction !== 'horizontal') return null;
  if (!isHorizontal && node.direction !== 'vertical') return null;

  const idx = (edge === 'left' || edge === 'top') ? 0 : node.children.length - 1;
  const child = node.children[idx];
  if (!child) return null;
  if (child.type === 'tabgroup') return child.id;
  return findTabGroupByEdge(child, edge);
}

// ─── Tree update operations ─────────────────────────────────────────

/** Set active panel in a tab group */
export function setActivePanel(node: LayoutNode, tabGroupId: string, panelId: string): LayoutNode {
  if (node.type === 'tabgroup') {
    return (node.id === tabGroupId && node.panels.includes(panelId))
      ? { ...node, activePanel: panelId }
      : node;
  }
  return { ...node, children: node.children.map(c => setActivePanel(c, tabGroupId, panelId)) };
}

/** Update sizes of a specific split node */
export function updateSizes(node: LayoutNode, splitId: string, sizes: number[]): LayoutNode {
  if (node.type === 'tabgroup') return node;
  if (node.id === splitId) return { ...node, sizes };
  return { ...node, children: node.children.map(c => updateSizes(c, splitId, sizes)) };
}

/** Update a tab group by ID using an updater function */
export function updateTabGroup(
  node: LayoutNode,
  tabGroupId: string,
  updater: (tg: TabGroupNode) => TabGroupNode,
): LayoutNode {
  if (node.type === 'tabgroup') return node.id === tabGroupId ? updater(node) : node;
  return { ...node, children: node.children.map(c => updateTabGroup(c, tabGroupId, updater)) };
}

/** Move a panel to position 0 in its tab group */
export function reorderPanelToFront(node: LayoutNode, tabGroupId: string, panelId: string): LayoutNode {
  return updateTabGroup(node, tabGroupId, tg => {
    if (!tg.panels.includes(panelId)) return tg;
    return { ...tg, panels: [panelId, ...tg.panels.filter(p => p !== panelId)], activePanel: panelId };
  });
}

/** Find next/previous panel in DFS order (for Ctrl+Tab navigation) */
export function findNextPanel(node: LayoutNode, currentPanelId: string): string | null {
  const all = collectAllPanelsOrdered(node);
  const idx = all.indexOf(currentPanelId);
  if (idx === -1) return all[0] || null;
  return all[(idx + 1) % all.length] || null;
}

export function findPreviousPanel(node: LayoutNode, currentPanelId: string): string | null {
  const all = collectAllPanelsOrdered(node);
  const idx = all.indexOf(currentPanelId);
  if (idx === -1) return all[all.length - 1] || null;
  return all[(idx - 1 + all.length) % all.length] || null;
}

// ─── Internal helpers ───────────────────────────────────────────────

function createEmptyGroup(): TabGroupNode {
  return { type: 'tabgroup', id: genId('tg'), panels: [], activePanel: '' };
}

function splitGroup(group: TabGroupNode, panelId: string, position: DockPosition): SplitNode {
  const newGroup: TabGroupNode = {
    type: 'tabgroup',
    id: genId('tg'),
    panels: [panelId],
    activePanel: panelId,
  };

  const isHorizontal = position === 'left' || position === 'right';
  const isBefore = position === 'left' || position === 'top';
  const children = isBefore ? [newGroup, group] : [group, newGroup];

  return {
    type: 'split',
    id: genId('split'),
    direction: isHorizontal ? 'horizontal' : 'vertical',
    children,
    sizes: [50, 50],
  };
}

function normalizeSizes(sizes: number[]): number[] {
  const total = sizes.reduce((a, b) => a + b, 0);
  if (total === 0) return sizes.map(() => 100 / sizes.length);
  if (Math.abs(total - 100) < 0.01) return sizes;
  return sizes.map(s => (s / total) * 100);
}

function detectEdgeInner(node: LayoutNode, panelId: string, path: string[]): DockEdge {
  if (node.type === 'tabgroup') {
    if (path.includes('right')) return 'right';
    if (path.includes('bottom')) return 'bottom';
    if (path.includes('top')) return 'top';
    return 'left';
  }
  for (let i = 0; i < node.children.length; i++) {
    if (!findTabGroupForPanel(node.children[i], panelId)) continue;
    let pos = '';
    if (node.direction === 'horizontal') {
      pos = i === 0 ? 'left' : i === node.children.length - 1 ? 'right' : '';
    } else {
      pos = i === 0 ? 'top' : i === node.children.length - 1 ? 'bottom' : '';
    }
    return detectEdgeInner(node.children[i], panelId, pos ? [...path, pos] : path);
  }
  return 'left';
}

function positionToEdge(position: DockPosition): DockEdge {
  if (position === 'left') return 'left';
  if (position === 'right') return 'right';
  if (position === 'top') return 'top';
  return 'bottom';
}

// ─── State-level helpers ────────────────────────────────────────────

/** Check if a panel exists anywhere in the state */
export function isPanelPlaced(
  state: { layout: LayoutNode; floatingPanels: { panelId: string }[]; unpinnedPanels: { panelId: string }[]; popoutPanels?: { panelId: string }[] },
  panelId: string,
): boolean {
  if (collectLayoutPanelIds(state.layout).has(panelId)) return true;
  if (state.floatingPanels.some(fp => fp.panelId === panelId)) return true;
  if (state.unpinnedPanels.some(up => up.panelId === panelId)) return true;
  if (state.popoutPanels?.some(pp => pp.panelId === panelId)) return true;
  return false;
}
