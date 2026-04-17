/**
 * LayoutTree — Immutable layout tree class with backward-compatible wrapper functions.
 *
 * The LayoutTree class wraps a LayoutNode root and provides immutable operations:
 * every mutation returns a new LayoutTree instance with structural sharing.
 * New node IDs use crypto.randomUUID().
 *
 * Backward-compatible free functions are exported to keep existing imports working.
 */

import type {
  LayoutNode,
  TabGroupNode,
  SplitNode,
  DockPosition,
  DockEdge,
} from '../types/dock';

// ─── ID generation ──────────────────────────────────────────────────

export function genId(_prefix?: string): string {
  return crypto.randomUUID();
}

/** @deprecated No-op. Kept for backward compatibility. */
export function resetIdCounter(): void {
  // no-op — UUIDs don't need a counter
}

/** @deprecated No-op. Kept for backward compatibility. */
export function syncIdCounter(_root: LayoutNode | null): void {
  // no-op — UUIDs don't need syncing
}

// ─── LayoutTree class ──────────────────────────────────────────────

export class LayoutTree {
  readonly root: LayoutNode;

  constructor(root: LayoutNode) {
    this.root = root;
  }

  // ── Lookups ────────────────────────────────────────────────────────

  findGroup(id: string): TabGroupNode | null {
    return findGroupInner(this.root, id);
  }

  findSplit(id: string): SplitNode | null {
    return findSplitInner(this.root, id);
  }

  groupForPanel(panelId: string): TabGroupNode | null {
    return groupForPanelInner(this.root, panelId);
  }

  allGroups(): TabGroupNode[] {
    return allGroupsInner(this.root);
  }

  allPanelIds(): string[] {
    return allPanelIdsInner(this.root);
  }

  // ── Mutations (return new LayoutTree) ─────────────────────────────

  insertPanel(target: TabGroupNode, panelId: string, position: DockPosition): LayoutTree {
    if (position === 'center') {
      const newRoot = insertInGroupInner(this.root, target.id, panelId);
      return new LayoutTree(newRoot);
    }
    const newRoot = insertBySplitInner(this.root, target.id, panelId, position);
    return new LayoutTree(newRoot);
  }

  removePanel(panelId: string): LayoutTree {
    const result = removePanelInner(this.root, panelId);
    if (result === null) {
      // Tree became empty — return a fresh empty group
      return new LayoutTree({
        type: 'tabgroup',
        id: genId(),
        panels: [],
        activePanel: '',
      });
    }
    return new LayoutTree(result);
  }

  movePanel(panelId: string, target: TabGroupNode, position: DockPosition): LayoutTree {
    const newRoot = movePanelInner(this.root, panelId, target.id, position);
    return new LayoutTree(newRoot);
  }

  resizeSplit(split: SplitNode, sizes: number[]): LayoutTree {
    const newRoot = updateSizesInner(this.root, split.id, sizes);
    return new LayoutTree(newRoot);
  }

  reorderTabs(group: TabGroupNode, panels: string[]): LayoutTree {
    const newRoot = updateTabGroupInner(this.root, group.id, tg => ({
      ...tg,
      panels,
      activePanel: panels.includes(tg.activePanel) ? tg.activePanel : panels[0] || '',
    }));
    return new LayoutTree(newRoot);
  }

  setActivePanel(groupId: string, panelId: string): LayoutTree {
    const newRoot = setActivePanelInner(this.root, groupId, panelId);
    return new LayoutTree(newRoot);
  }

  updateGroup(groupId: string, updates: Partial<TabGroupNode>): LayoutTree {
    const newRoot = updateTabGroupInner(this.root, groupId, tg => ({ ...tg, ...updates }));
    return new LayoutTree(newRoot);
  }
}

// ─── Internal tree operations ──────────────────────────────────────

function findGroupInner(node: LayoutNode, id: string): TabGroupNode | null {
  if (node.type === 'tabgroup') return node.id === id ? node : null;
  for (const child of node.children) {
    const result = findGroupInner(child, id);
    if (result) return result;
  }
  return null;
}

function findSplitInner(node: LayoutNode, id: string): SplitNode | null {
  if (node.type === 'tabgroup') return null;
  if (node.id === id) return node;
  for (const child of node.children) {
    const result = findSplitInner(child, id);
    if (result) return result;
  }
  return null;
}

function groupForPanelInner(node: LayoutNode, panelId: string): TabGroupNode | null {
  if (node.type === 'tabgroup') return node.panels.includes(panelId) ? node : null;
  for (const child of node.children) {
    const result = groupForPanelInner(child, panelId);
    if (result) return result;
  }
  return null;
}

function allGroupsInner(node: LayoutNode): TabGroupNode[] {
  if (node.type === 'tabgroup') return [node];
  return node.children.flatMap(child => allGroupsInner(child));
}

function allPanelIdsInner(node: LayoutNode): string[] {
  if (node.type === 'tabgroup') return [...node.panels];
  return node.children.flatMap(child => allPanelIdsInner(child));
}

function removePanelInner(node: LayoutNode, panelId: string): LayoutNode | null {
  if (node.type === 'tabgroup') {
    if (!node.panels.includes(panelId)) return node;
    const remaining = node.panels.filter(p => p !== panelId);
    if (remaining.length === 0) return null;
    return {
      ...node,
      panels: remaining,
      activePanel: node.activePanel === panelId ? remaining[0] : node.activePanel,
    };
  }

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
  if (newChildren.length === 1) return newChildren[0];

  return { ...node, children: newChildren, sizes: normalizeSizes(newSizes) };
}

function insertInGroupInner(
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
    children: root.children.map(child => insertInGroupInner(child, targetGroupId, panelId)),
  };
}

function insertBySplitInner(
  root: LayoutNode,
  targetGroupId: string,
  panelId: string,
  position: DockPosition,
): LayoutNode {
  if (position === 'center') return insertInGroupInner(root, targetGroupId, panelId);

  if (root.type === 'tabgroup') {
    if (root.id === targetGroupId) {
      if (root.panels.length === 0) {
        return { ...root, panels: [panelId], activePanel: panelId };
      }
      return splitGroup(root, panelId, position);
    }
    return root;
  }
  return {
    ...root,
    children: root.children.map(child =>
      insertBySplitInner(child, targetGroupId, panelId, position),
    ),
  };
}

function insertAtEdgeInner(
  root: LayoutNode,
  panelId: string,
  edge: DockEdge,
  sizePercent = 20,
): LayoutNode {
  if (root.type === 'tabgroup' && root.panels.length === 0) {
    return { ...root, panels: [panelId], activePanel: panelId };
  }

  const newGroup: TabGroupNode = {
    type: 'tabgroup',
    id: genId(),
    panels: [panelId],
    activePanel: panelId,
  };

  const isHorizontal = edge === 'left' || edge === 'right';
  const isAfter = edge === 'right' || edge === 'bottom';

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

  const children = isAfter ? [root, newGroup] : [newGroup, root];
  return {
    type: 'split',
    id: genId(),
    direction: isHorizontal ? 'horizontal' : 'vertical',
    children,
    sizes: isAfter ? [100 - sizePercent, sizePercent] : [sizePercent, 100 - sizePercent],
  };
}

function movePanelInner(
  root: LayoutNode,
  panelId: string,
  targetGroupId: string,
  position: DockPosition,
): LayoutNode {
  const sourceGroupId = findTabGroupForPanelInner(root, panelId);
  if (sourceGroupId === targetGroupId && position === 'center') return root;
  if (sourceGroupId === targetGroupId && position !== 'center') {
    const group = findGroupInner(root, sourceGroupId!);
    if (group && group.panels.length === 1) return root;
  }

  const afterRemove = removePanelInner(root, panelId);

  if (!afterRemove) {
    return { type: 'tabgroup', id: genId(), panels: [panelId], activePanel: panelId };
  }

  if (position === 'center') {
    if (findGroupInner(afterRemove, targetGroupId)) {
      return insertInGroupInner(afterRemove, targetGroupId, panelId);
    }
    const firstGroup = findFirstTabGroupInner(afterRemove);
    if (firstGroup) return insertInGroupInner(afterRemove, firstGroup, panelId);
    return afterRemove;
  }

  if (findGroupInner(afterRemove, targetGroupId)) {
    return insertBySplitInner(afterRemove, targetGroupId, panelId, position);
  }
  const edge = positionToEdge(position);
  return insertAtEdgeInner(afterRemove, panelId, edge);
}

function setActivePanelInner(node: LayoutNode, tabGroupId: string, panelId: string): LayoutNode {
  if (node.type === 'tabgroup') {
    return (node.id === tabGroupId && node.panels.includes(panelId))
      ? { ...node, activePanel: panelId }
      : node;
  }
  return { ...node, children: node.children.map(c => setActivePanelInner(c, tabGroupId, panelId)) };
}

function updateSizesInner(node: LayoutNode, splitId: string, sizes: number[]): LayoutNode {
  if (node.type === 'tabgroup') return node;
  if (node.id === splitId) return { ...node, sizes };
  return { ...node, children: node.children.map(c => updateSizesInner(c, splitId, sizes)) };
}

function updateTabGroupInner(
  node: LayoutNode,
  tabGroupId: string,
  updater: (tg: TabGroupNode) => TabGroupNode,
): LayoutNode {
  if (node.type === 'tabgroup') return node.id === tabGroupId ? updater(node) : node;
  return { ...node, children: node.children.map(c => updateTabGroupInner(c, tabGroupId, updater)) };
}

function findTabGroupForPanelInner(node: LayoutNode, panelId: string): string | null {
  if (node.type === 'tabgroup') return node.panels.includes(panelId) ? node.id : null;
  for (const child of node.children) {
    const result = findTabGroupForPanelInner(child, panelId);
    if (result) return result;
  }
  return null;
}

function findFirstTabGroupInner(node: LayoutNode): string | null {
  if (node.type === 'tabgroup') return node.id;
  for (const child of node.children) {
    const result = findFirstTabGroupInner(child);
    if (result) return result;
  }
  return null;
}

// ─── Internal helpers ───────────────────────────────────────────────

function splitGroup(group: TabGroupNode, panelId: string, position: DockPosition): SplitNode {
  const newGroup: TabGroupNode = {
    type: 'tabgroup',
    id: genId(),
    panels: [panelId],
    activePanel: panelId,
  };

  const isHorizontal = position === 'left' || position === 'right';
  const isBefore = position === 'left' || position === 'top';
  const children = isBefore ? [newGroup, group] : [group, newGroup];

  return {
    type: 'split',
    id: genId(),
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
    if (!findTabGroupForPanelInner(node.children[i], panelId)) continue;
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

// ─── Compat wrapper functions ──────────────────────────────────────

/** Find which tab group contains a panel */
export function findTabGroupForPanel(node: LayoutNode, panelId: string): string | null {
  return findTabGroupForPanelInner(node, panelId);
}

/** Find the first tab group (DFS) */
export function findFirstTabGroup(node: LayoutNode): string | null {
  return findFirstTabGroupInner(node);
}

/** Find a tab group by ID */
export function findTabGroupById(node: LayoutNode, id: string): TabGroupNode | null {
  return findGroupInner(node, id);
}

/** Find all tab groups in DFS order */
export function findAllTabGroups(node: LayoutNode): TabGroupNode[] {
  return allGroupsInner(node);
}

/** Collect all panels in DFS order (for keyboard navigation) */
export function collectAllPanelsOrdered(node: LayoutNode): string[] {
  return allPanelIdsInner(node);
}

/** Collect all panel IDs in the layout tree */
export function collectLayoutPanelIds(node: LayoutNode): Set<string> {
  return new Set(allPanelIdsInner(node));
}

/** Count total panels */
export function countPanels(node: LayoutNode): number {
  if (node.type === 'tabgroup') return node.panels.length;
  return node.children.reduce((sum, child) => sum + countPanels(child), 0);
}

/**
 * Remove a panel from the layout tree.
 * Returns null if the tree becomes completely empty.
 */
export function removePanel(root: LayoutNode, panelId: string): LayoutNode | null {
  return removePanelInner(root, panelId);
}

/**
 * Insert a panel into a specific tab group (center/tab drop).
 */
export function insertInGroup(
  root: LayoutNode,
  targetGroupId: string,
  panelId: string,
): LayoutNode {
  return insertInGroupInner(root, targetGroupId, panelId);
}

/**
 * Insert a panel next to a specific tab group by splitting it.
 */
export function insertBySplit(
  root: LayoutNode,
  targetGroupId: string,
  panelId: string,
  position: DockPosition,
): LayoutNode {
  return insertBySplitInner(root, targetGroupId, panelId, position);
}

/**
 * Insert a panel at a root-level edge of the layout.
 */
export function insertAtEdge(
  root: LayoutNode,
  panelId: string,
  edge: DockEdge,
  sizePercent = 20,
): LayoutNode {
  return insertAtEdgeInner(root, panelId, edge, sizePercent);
}

/**
 * Move a panel from its current location to a new target.
 */
export function movePanel(
  root: LayoutNode,
  panelId: string,
  targetGroupId: string,
  position: DockPosition,
): LayoutNode {
  return movePanelInner(root, panelId, targetGroupId, position);
}

/**
 * Detect which edge a panel is closest to in the layout.
 */
export function detectPanelEdge(node: LayoutNode, panelId: string): DockEdge {
  return detectEdgeInner(node, panelId, []);
}

/**
 * Find the tab group at a specific edge of the layout.
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

/** Set active panel in a tab group */
export function setActivePanel(node: LayoutNode, tabGroupId: string, panelId: string): LayoutNode {
  return setActivePanelInner(node, tabGroupId, panelId);
}

/** Update sizes of a specific split node */
export function updateSizes(node: LayoutNode, splitId: string, sizes: number[]): LayoutNode {
  return updateSizesInner(node, splitId, sizes);
}

/** Update a tab group by ID using an updater function */
export function updateTabGroup(
  node: LayoutNode,
  tabGroupId: string,
  updater: (tg: TabGroupNode) => TabGroupNode,
): LayoutNode {
  return updateTabGroupInner(node, tabGroupId, updater);
}

/** Move a panel to position 0 in its tab group */
export function reorderPanelToFront(node: LayoutNode, tabGroupId: string, panelId: string): LayoutNode {
  return updateTabGroupInner(node, tabGroupId, tg => {
    if (!tg.panels.includes(panelId)) return tg;
    return { ...tg, panels: [panelId, ...tg.panels.filter(p => p !== panelId)], activePanel: panelId };
  });
}

/** Find next panel in DFS order (for Ctrl+Tab navigation) */
export function findNextPanel(node: LayoutNode, currentPanelId: string): string | null {
  const all = allPanelIdsInner(node);
  const idx = all.indexOf(currentPanelId);
  if (idx === -1) return all[0] || null;
  return all[(idx + 1) % all.length] || null;
}

/** Find previous panel in DFS order */
export function findPreviousPanel(node: LayoutNode, currentPanelId: string): string | null {
  const all = allPanelIdsInner(node);
  const idx = all.indexOf(currentPanelId);
  if (idx === -1) return all[all.length - 1] || null;
  return all[(idx - 1 + all.length) % all.length] || null;
}

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
