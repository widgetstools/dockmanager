// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { dockReducer } from '../reducer/dockReducer';
import type { DockManagerState } from '../types/dock';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeDocHostState(): DockManagerState {
  return {
    layout: {
      type: 'split',
      id: 'split1',
      direction: 'horizontal',
      children: [
        {
          type: 'tabgroup',
          id: 'tg-doc',
          panels: ['doc1', 'doc2'],
          activePanel: 'doc1',
        },
        {
          type: 'tabgroup',
          id: 'tg-tools',
          panels: ['tool1'],
          activePanel: 'tool1',
        },
      ],
      sizes: [70, 30],
    },
    panels: {
      doc1: { id: 'doc1', title: 'Document 1', documentOnly: true },
      doc2: { id: 'doc2', title: 'Document 2', documentOnly: true },
      tool1: { id: 'tool1', title: 'Tool Window' },
    },
    floatingPanels: [],
    popoutPanels: [],
    unpinnedPanels: [],
    nextZIndex: 1000,
    activePaneId: 'doc1',
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('Document Host enforcement', () => {
  it('documentOnly panel cannot move to non-document host group (center)', () => {
    const state = makeDocHostState();

    // Try to move doc1 to tg-tools (which has no documentOnly panels) at center
    const result = dockReducer(state, {
      type: 'MOVE_PANEL',
      payload: { panelId: 'doc1', targetTabGroupId: 'tg-tools', position: 'center' },
    });

    // State should not change (move rejected)
    expect(result).toBe(state);
  });

  it('documentOnly panel CAN move to document host group (center)', () => {
    const state = makeDocHostState();

    // Move doc1 to tg-doc (which has documentOnly panels) - this is a no-op (same group center)
    // Instead, let's test: add a third doc group
    const stateWithThreeGroups: DockManagerState = {
      ...state,
      layout: {
        type: 'split',
        id: 'split1',
        direction: 'horizontal',
        children: [
          {
            type: 'tabgroup',
            id: 'tg-doc',
            panels: ['doc1'],
            activePanel: 'doc1',
          },
          {
            type: 'tabgroup',
            id: 'tg-doc2',
            panels: ['doc2'],
            activePanel: 'doc2',
          },
          {
            type: 'tabgroup',
            id: 'tg-tools',
            panels: ['tool1'],
            activePanel: 'tool1',
          },
        ],
        sizes: [40, 30, 30],
      },
    };

    // Move doc1 to tg-doc2 (which has documentOnly panels)
    const result = dockReducer(stateWithThreeGroups, {
      type: 'MOVE_PANEL',
      payload: { panelId: 'doc1', targetTabGroupId: 'tg-doc2', position: 'center' },
    });

    // State should change (move accepted)
    expect(result).not.toBe(stateWithThreeGroups);
    expect(result.activePaneId).toBe('doc1');
  });

  it('non-documentOnly panel can move to any group', () => {
    const state = makeDocHostState();

    // Move tool1 to tg-doc (which has documentOnly panels)
    const result = dockReducer(state, {
      type: 'MOVE_PANEL',
      payload: { panelId: 'tool1', targetTabGroupId: 'tg-doc', position: 'center' },
    });

    // State should change (move accepted)
    expect(result).not.toBe(state);
    expect(result.activePaneId).toBe('tool1');
  });

  it('documentOnly panel CAN move to non-document group via split (not center)', () => {
    const state = makeDocHostState();

    // Move doc1 to tg-tools via split (left position) - this creates a new group
    const result = dockReducer(state, {
      type: 'MOVE_PANEL',
      payload: { panelId: 'doc1', targetTabGroupId: 'tg-tools', position: 'left' },
    });

    // Split positions are allowed (they create new groups)
    expect(result).not.toBe(state);
  });
});
