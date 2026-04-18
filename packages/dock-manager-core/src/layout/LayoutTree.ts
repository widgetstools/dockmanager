import type { LayoutNode, TabGroupNode, SplitNode, DockPosition, DockEdge } from '../types/dock';

// ─── ID generation ─────────────────────────────────────────────────
export function genId(_prefix?: string): string { return crypto.randomUUID(); }
/** @deprecated No-op kept for backward compatibility. */
export function resetIdCounter(): void {}
/** @deprecated No-op kept for backward compatibility. */
export function syncIdCounter(_root: LayoutNode | null): void {}

// ─── LayoutTree class ──────────────────────────────────────────────
export class LayoutTree {
  readonly root: LayoutNode;
  constructor(root: LayoutNode) { this.root = root; }

  findGroup(id: string): TabGroupNode | null { return findGroupInner(this.root, id); }
  findSplit(id: string): SplitNode | null { return findSplitInner(this.root, id); }
  groupForPanel(panelId: string): TabGroupNode | null { return groupForPanelInner(this.root, panelId); }
  allGroups(): TabGroupNode[] { return allGroupsInner(this.root); }
  allPanelIds(): string[] { return allPanelIdsInner(this.root); }

  insertPanel(target: TabGroupNode, panelId: string, position: DockPosition): LayoutTree {
    const newRoot = position === 'center'
      ? insertInGroupInner(this.root, target.id, panelId)
      : insertBySplitInner(this.root, target.id, panelId, position);
    return new LayoutTree(newRoot);
  }

  removePanel(panelId: string): LayoutTree {
    const result = removePanelInner(this.root, panelId);
    return new LayoutTree(result ?? { type: 'tabgroup', id: genId(), panels: [], activePanel: '' });
  }

  movePanel(panelId: string, target: TabGroupNode, position: DockPosition): LayoutTree {
    return new LayoutTree(movePanelInner(this.root, panelId, target.id, position));
  }

  resizeSplit(split: SplitNode, sizes: number[]): LayoutTree {
    return new LayoutTree(updateSizesInner(this.root, split.id, sizes));
  }

  reorderTabs(group: TabGroupNode, panels: string[]): LayoutTree {
    return new LayoutTree(updateTabGroupInner(this.root, group.id, tg => ({
      ...tg, panels,
      activePanel: panels.includes(tg.activePanel) ? tg.activePanel : panels[0] || '',
    })));
  }

  setActivePanel(groupId: string, panelId: string): LayoutTree {
    return new LayoutTree(setActivePanelInner(this.root, groupId, panelId));
  }

  updateGroup(groupId: string, updates: Partial<TabGroupNode>): LayoutTree {
    return new LayoutTree(updateTabGroupInner(this.root, groupId, tg => ({ ...tg, ...updates })));
  }
}

// ─── Internal tree operations ──────────────────────────────────────
function searchTree<T>(node: LayoutNode, match: (n: LayoutNode) => T | null): T | null {
  const result = match(node);
  if (result !== null) return result;
  if (node.type === 'split') {
    for (const child of node.children) {
      const found = searchTree(child, match);
      if (found !== null) return found;
    }
  }
  return null;
}

function findGroupInner(node: LayoutNode, id: string): TabGroupNode | null {
  return searchTree(node, n => n.type === 'tabgroup' && n.id === id ? n : null);
}

function findSplitInner(node: LayoutNode, id: string): SplitNode | null {
  return searchTree(node, n => n.type === 'split' && n.id === id ? n : null);
}

function groupForPanelInner(node: LayoutNode, panelId: string): TabGroupNode | null {
  return searchTree(node, n => n.type === 'tabgroup' && n.panels.includes(panelId) ? n : null);
}

function allGroupsInner(node: LayoutNode): TabGroupNode[] {
  if (node.type === 'tabgroup') return [node];
  return node.children.flatMap(allGroupsInner);
}

function allPanelIdsInner(node: LayoutNode): string[] {
  if (node.type === 'tabgroup') return [...node.panels];
  return node.children.flatMap(allPanelIdsInner);
}

function findTabGroupForPanelInner(node: LayoutNode, panelId: string): string | null {
  return searchTree(node, n => n.type === 'tabgroup' && n.panels.includes(panelId) ? n.id : null);
}

function findFirstTabGroupInner(node: LayoutNode): string | null {
  return searchTree(node, n => n.type === 'tabgroup' ? n.id : null);
}

function removePanelInner(node: LayoutNode, panelId: string): LayoutNode | null {
  if (node.type === 'tabgroup') {
    if (!node.panels.includes(panelId)) return node;
    const remaining = node.panels.filter(p => p !== panelId);
    if (remaining.length === 0) return null;
    return { ...node, panels: remaining, activePanel: node.activePanel === panelId ? remaining[0] : node.activePanel };
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

function insertInGroupInner(root: LayoutNode, targetGroupId: string, panelId: string): LayoutNode {
  if (root.type === 'tabgroup') {
    return root.id === targetGroupId ? { ...root, panels: [...root.panels, panelId], activePanel: panelId } : root;
  }
  return { ...root, children: root.children.map(c => insertInGroupInner(c, targetGroupId, panelId)) };
}

function insertBySplitInner(root: LayoutNode, targetGroupId: string, panelId: string, position: DockPosition): LayoutNode {
  if (position === 'center') return insertInGroupInner(root, targetGroupId, panelId);
  if (root.type === 'tabgroup') {
    if (root.id !== targetGroupId) return root;
    return root.panels.length === 0 ? { ...root, panels: [panelId], activePanel: panelId } : splitGroup(root, panelId, position);
  }
  return { ...root, children: root.children.map(c => insertBySplitInner(c, targetGroupId, panelId, position)) };
}

function mkGroup(panelId: string): TabGroupNode {
  return { type: 'tabgroup', id: genId(), panels: [panelId], activePanel: panelId };
}

function insertAtEdgeInner(root: LayoutNode, panelId: string, edge: DockEdge, sizePercent = 20): LayoutNode {
  if (root.type === 'tabgroup' && root.panels.length === 0) {
    return { ...root, panels: [panelId], activePanel: panelId };
  }
  const newGroup = mkGroup(panelId);
  const isHorizontal = edge === 'left' || edge === 'right';
  const isAfter = edge === 'right' || edge === 'bottom';

  if (root.type === 'split') {
    const dirMatch = isHorizontal ? root.direction === 'horizontal' : root.direction === 'vertical';
    if (dirMatch) {
      const oldTotal = root.sizes.reduce((a, b) => a + b, 0) || 100;
      const scale = (100 - sizePercent) / oldTotal;
      const children = isAfter ? [...root.children, newGroup] : [newGroup, ...root.children];
      const sizes = isAfter ? [...root.sizes.map(s => s * scale), sizePercent] : [sizePercent, ...root.sizes.map(s => s * scale)];
      return { ...root, children, sizes };
    }
  }
  const children = isAfter ? [root, newGroup] : [newGroup, root];
  return {
    type: 'split', id: genId(),
    direction: isHorizontal ? 'horizontal' : 'vertical',
    children,
    sizes: isAfter ? [100 - sizePercent, sizePercent] : [sizePercent, 100 - sizePercent],
  };
}

function movePanelInner(root: LayoutNode, panelId: string, targetGroupId: string, position: DockPosition): LayoutNode {
  const sourceGroupId = findTabGroupForPanelInner(root, panelId);
  if (sourceGroupId === targetGroupId && position === 'center') return root;
  if (sourceGroupId === targetGroupId && position !== 'center') {
    const group = findGroupInner(root, sourceGroupId!);
    if (group && group.panels.length === 1) return root;
  }
  const afterRemove = removePanelInner(root, panelId);
  if (!afterRemove) return mkGroup(panelId);
  if (position === 'center') {
    if (findGroupInner(afterRemove, targetGroupId)) return insertInGroupInner(afterRemove, targetGroupId, panelId);
    const first = findFirstTabGroupInner(afterRemove);
    return first ? insertInGroupInner(afterRemove, first, panelId) : afterRemove;
  }
  if (findGroupInner(afterRemove, targetGroupId)) return insertBySplitInner(afterRemove, targetGroupId, panelId, position);
  return insertAtEdgeInner(afterRemove, panelId, positionToEdge(position));
}

function setActivePanelInner(node: LayoutNode, tabGroupId: string, panelId: string): LayoutNode {
  if (node.type === 'tabgroup') return node.id === tabGroupId && node.panels.includes(panelId) ? { ...node, activePanel: panelId } : node;
  return { ...node, children: node.children.map(c => setActivePanelInner(c, tabGroupId, panelId)) };
}

function updateSizesInner(node: LayoutNode, splitId: string, sizes: number[]): LayoutNode {
  if (node.type === 'tabgroup') return node;
  if (node.id === splitId) return { ...node, sizes };
  return { ...node, children: node.children.map(c => updateSizesInner(c, splitId, sizes)) };
}

function updateTabGroupInner(node: LayoutNode, tabGroupId: string, updater: (tg: TabGroupNode) => TabGroupNode): LayoutNode {
  if (node.type === 'tabgroup') return node.id === tabGroupId ? updater(node) : node;
  return { ...node, children: node.children.map(c => updateTabGroupInner(c, tabGroupId, updater)) };
}

// ─── Helpers ───────────────────────────────────────────────────────
function splitGroup(group: TabGroupNode, panelId: string, position: DockPosition): SplitNode {
  const newGroup = mkGroup(panelId);
  const isHorizontal = position === 'left' || position === 'right';
  const isBefore = position === 'left' || position === 'top';
  return {
    type: 'split', id: genId(),
    direction: isHorizontal ? 'horizontal' : 'vertical',
    children: isBefore ? [newGroup, group] : [group, newGroup],
    sizes: [50, 50],
  };
}

function normalizeSizes(sizes: number[]): number[] {
  const total = sizes.reduce((a, b) => a + b, 0);
  if (total === 0) return sizes.map(() => 100 / sizes.length);
  if (Math.abs(total - 100) < 0.01) return sizes;
  return sizes.map(s => (s / total) * 100);
}

function positionToEdge(position: DockPosition): DockEdge {
  const map: Record<string, DockEdge> = { left: 'left', right: 'right', top: 'top', bottom: 'bottom' };
  return map[position] || 'bottom';
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
    if (node.direction === 'horizontal') pos = i === 0 ? 'left' : i === node.children.length - 1 ? 'right' : '';
    else pos = i === 0 ? 'top' : i === node.children.length - 1 ? 'bottom' : '';
    return detectEdgeInner(node.children[i], panelId, pos ? [...path, pos] : path);
  }
  return 'left';
}

// ─── Compat wrapper functions ──────────────────────────────────────
export function findTabGroupForPanel(node: LayoutNode, panelId: string): string | null { return findTabGroupForPanelInner(node, panelId); }
export function findFirstTabGroup(node: LayoutNode): string | null { return findFirstTabGroupInner(node); }
export function findTabGroupById(node: LayoutNode, id: string): TabGroupNode | null { return findGroupInner(node, id); }
export function findAllTabGroups(node: LayoutNode): TabGroupNode[] { return allGroupsInner(node); }
export function collectAllPanelsOrdered(node: LayoutNode): string[] { return allPanelIdsInner(node); }
export function collectLayoutPanelIds(node: LayoutNode): Set<string> { return new Set(allPanelIdsInner(node)); }

export function countPanels(node: LayoutNode): number {
  return node.type === 'tabgroup' ? node.panels.length : node.children.reduce((sum, c) => sum + countPanels(c), 0);
}

export function removePanel(root: LayoutNode, panelId: string): LayoutNode | null { return removePanelInner(root, panelId); }
export function insertInGroup(root: LayoutNode, targetGroupId: string, panelId: string): LayoutNode { return insertInGroupInner(root, targetGroupId, panelId); }
export function insertBySplit(root: LayoutNode, targetGroupId: string, panelId: string, position: DockPosition): LayoutNode { return insertBySplitInner(root, targetGroupId, panelId, position); }
export function insertAtEdge(root: LayoutNode, panelId: string, edge: DockEdge, sizePercent = 20): LayoutNode { return insertAtEdgeInner(root, panelId, edge, sizePercent); }
export function movePanel(root: LayoutNode, panelId: string, targetGroupId: string, position: DockPosition): LayoutNode { return movePanelInner(root, panelId, targetGroupId, position); }
export function detectPanelEdge(node: LayoutNode, panelId: string): DockEdge { return detectEdgeInner(node, panelId, []); }

export function findTabGroupByEdge(node: LayoutNode, edge: DockEdge): string | null {
  if (node.type === 'tabgroup') return null;
  const isHorizontal = edge === 'left' || edge === 'right';
  if (isHorizontal ? node.direction !== 'horizontal' : node.direction !== 'vertical') return null;
  const child = node.children[edge === 'left' || edge === 'top' ? 0 : node.children.length - 1];
  if (!child) return null;
  return child.type === 'tabgroup' ? child.id : findTabGroupByEdge(child, edge);
}

export function setActivePanel(node: LayoutNode, tabGroupId: string, panelId: string): LayoutNode { return setActivePanelInner(node, tabGroupId, panelId); }
export function updateSizes(node: LayoutNode, splitId: string, sizes: number[]): LayoutNode { return updateSizesInner(node, splitId, sizes); }
export function updateTabGroup(node: LayoutNode, tabGroupId: string, updater: (tg: TabGroupNode) => TabGroupNode): LayoutNode { return updateTabGroupInner(node, tabGroupId, updater); }

export function reorderPanelToFront(node: LayoutNode, tabGroupId: string, panelId: string): LayoutNode {
  return updateTabGroupInner(node, tabGroupId, tg =>
    tg.panels.includes(panelId) ? { ...tg, panels: [panelId, ...tg.panels.filter(p => p !== panelId)], activePanel: panelId } : tg);
}

export function findNextPanel(node: LayoutNode, currentPanelId: string): string | null {
  const all = allPanelIdsInner(node);
  const idx = all.indexOf(currentPanelId);
  return idx === -1 ? all[0] || null : all[(idx + 1) % all.length] || null;
}

export function findPreviousPanel(node: LayoutNode, currentPanelId: string): string | null {
  const all = allPanelIdsInner(node);
  const idx = all.indexOf(currentPanelId);
  return idx === -1 ? all[all.length - 1] || null : all[(idx - 1 + all.length) % all.length] || null;
}

export function isPanelPlaced(
  state: { layout: LayoutNode; floatingPanels: { panelId: string }[]; unpinnedPanels: { panelId: string }[]; popoutPanels?: { panelId: string }[] },
  panelId: string,
): boolean {
  return collectLayoutPanelIds(state.layout).has(panelId)
    || state.floatingPanels.some(fp => fp.panelId === panelId)
    || state.unpinnedPanels.some(up => up.panelId === panelId)
    || !!state.popoutPanels?.some(pp => pp.panelId === panelId);
}
