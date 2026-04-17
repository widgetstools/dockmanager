/**
 * Layout invariant checks.
 *
 * Pure validation helpers that inspect a DockManagerState for structural
 * violations. Used at runtime (behind the debug flag) to surface bugs
 * where drag/drop or reducer operations corrupt the tree or lose panels.
 *
 * Invariants checked:
 *  1. EMPTY_NESTED — no empty tab group is a child of a split. An empty
 *     tab group is only valid as the entire layout (safeEmptyGroup
 *     fallback when no panels are docked).
 *  2. ACTIVE_NOT_IN_PANELS — a tab group's activePanel must be in its
 *     panels[] (or panels is empty).
 *  3. UNKNOWN_PANEL — every panel ID listed inside a tab group must be
 *     registered in state.panels.
 *  4. ORPHAN_PANEL — every panel in state.panels must be placed somewhere
 *     (layout OR floating OR unpinned OR popout).
 *  5. DUP_GROUP_ID — no two tab groups share the same id.
 *  6. DUP_PANEL_PLACEMENT — a panel appears in more than one placement
 *     (layout + floating, two tab groups, etc.).
 */

import type {
  DockManagerState,
  LayoutNode,
  TabGroupNode,
} from '../types/dock';
import { findAllTabGroups, collectLayoutPanelIds } from './LayoutTree';

export type InvariantViolation = {
  kind:
    | 'EMPTY_NESTED'
    | 'ACTIVE_NOT_IN_PANELS'
    | 'UNKNOWN_PANEL'
    | 'ORPHAN_PANEL'
    | 'DUP_GROUP_ID'
    | 'DUP_PANEL_PLACEMENT';
  detail: string;
};

function collectEmptyNestedGroups(
  node: LayoutNode,
  parentType: 'root' | 'split',
): TabGroupNode[] {
  const out: TabGroupNode[] = [];
  if (node.type === 'tabgroup') {
    if (node.panels.length === 0 && parentType === 'split') out.push(node);
    return out;
  }
  for (const child of node.children) {
    out.push(...collectEmptyNestedGroups(child, 'split'));
  }
  return out;
}

export function checkLayoutInvariants(state: DockManagerState): InvariantViolation[] {
  const out: InvariantViolation[] = [];

  // 1. No empty tabgroups as children of splits
  for (const g of collectEmptyNestedGroups(state.layout, 'root')) {
    out.push({
      kind: 'EMPTY_NESTED',
      detail: `empty tabgroup ${g.id} is a split child`,
    });
  }

  const groups = findAllTabGroups(state.layout);

  // 2. activePanel must be in panels (or panels empty)
  for (const g of groups) {
    if (g.panels.length > 0 && !g.panels.includes(g.activePanel)) {
      out.push({
        kind: 'ACTIVE_NOT_IN_PANELS',
        detail: `group ${g.id} active=${g.activePanel} panels=[${g.panels.join(',')}]`,
      });
    }
    for (const pid of g.panels) {
      if (!state.panels.has(pid)) {
        out.push({
          kind: 'UNKNOWN_PANEL',
          detail: `group ${g.id} contains unregistered panel ${pid}`,
        });
      }
    }
  }

  // 3. Every panel in state.panels must be placed somewhere
  const layoutIds = collectLayoutPanelIds(state.layout);
  const floatIds = new Set<string>();
  const unpinIds = new Set<string>();
  const popoutIds = new Set<string>();
  for (const [panelId, placement] of state.placements) {
    if (placement.type === 'floating') floatIds.add(panelId);
    else if (placement.type === 'unpinned') unpinIds.add(panelId);
    else if (placement.type === 'popout') popoutIds.add(panelId);
  }
  for (const id of state.panels.keys()) {
    if (
      !layoutIds.has(id) &&
      !floatIds.has(id) &&
      !unpinIds.has(id) &&
      !popoutIds.has(id)
    ) {
      out.push({
        kind: 'ORPHAN_PANEL',
        detail: `panel ${id} is registered but not placed in layout/floating/unpinned/popout`,
      });
    }
  }

  // 4. Duplicate group IDs
  const seenGroups = new Set<string>();
  for (const g of groups) {
    if (seenGroups.has(g.id)) {
      out.push({ kind: 'DUP_GROUP_ID', detail: `duplicate tab group id ${g.id}` });
    }
    seenGroups.add(g.id);
  }

  // 5. A panel must appear in exactly one placement
  const placementCounts = new Map<string, string[]>();
  const bump = (id: string, where: string) => {
    const arr = placementCounts.get(id) ?? [];
    arr.push(where);
    placementCounts.set(id, arr);
  };
  for (const id of layoutIds) bump(id, 'layout');
  for (const id of floatIds) bump(id, 'floating');
  for (const id of unpinIds) bump(id, 'unpinned');
  for (const id of popoutIds) bump(id, 'popout');
  // Also flag duplicate occurrences within the layout (same panel in two groups)
  for (const g of groups) {
    const seen = new Set<string>();
    for (const pid of g.panels) {
      if (seen.has(pid)) {
        out.push({
          kind: 'DUP_PANEL_PLACEMENT',
          detail: `panel ${pid} appears twice in group ${g.id}`,
        });
      }
      seen.add(pid);
    }
  }
  for (const [id, places] of placementCounts) {
    if (places.length > 1) {
      out.push({
        kind: 'DUP_PANEL_PLACEMENT',
        detail: `panel ${id} present in multiple placements: ${places.join(', ')}`,
      });
    }
  }

  return out;
}

/**
 * Collect panels that were in `before.panels` but are completely gone
 * from `after` (not in panels, not in any placement). Used to detect
 * "lost panel" bugs separately from normal CLOSE_PANEL which legitimately
 * removes from state.panels.
 */
export function findLostPanels(
  before: DockManagerState,
  after: DockManagerState,
): string[] {
  const lost: string[] = [];
  for (const id of before.panels.keys()) {
    if (!after.panels.has(id)) continue; // removed by CLOSE_PANEL — not lost
    // Still registered in state.panels, but vanished from every placement
    const inLayout = collectLayoutPanelIds(after.layout).has(id);
    const inPlacement = after.placements.has(id);
    if (!inLayout && !inPlacement) {
      lost.push(id);
    }
  }
  return lost;
}
