// @vitest-environment jsdom
/**
 * Regression test: "content disappears after repeated drag-drop".
 *
 * Bug (fixed): when a panel left a TabGroupView while that group's
 * active panel was unchanged, buildContent() took the `existing`
 * early-return path and left the departing panel's contentSlot entry
 * in the Map. When that same panel later returned and became active,
 * buildContent() found the stale slot, marked its wrapper visible, and
 * bailed out — but the wrapper was empty because the persistent render
 * container had been moved to another group in the interim.
 *
 * Fix: stale slot cleanup now runs at the top of buildContent(), before
 * the `existing` early-return path.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DockviewComponent } from '../dom/DockviewComponent';
import type { DockManagerState } from '../types/dock';
import { resetIdCounter } from '../layout/LayoutTree';

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

function createTestContainer(): HTMLElement {
  const el = document.createElement('div');
  el.style.width = '1000px';
  el.style.height = '600px';
  document.body.appendChild(el);
  return el;
}

// tg_left=[A,B] active=A, tg_right=[C,D] active=C
function createInitialState(): DockManagerState {
  return {
    layout: {
      type: 'split',
      id: 'split1',
      direction: 'horizontal',
      children: [
        { type: 'tabgroup', id: 'tg_left', panels: ['A', 'B'], activePanel: 'A' },
        { type: 'tabgroup', id: 'tg_right', panels: ['C', 'D'], activePanel: 'C' },
      ],
      sizes: [50, 50],
    },
    panels: {
      A: { id: 'A', title: 'A' },
      B: { id: 'B', title: 'B' },
      C: { id: 'C', title: 'C' },
      D: { id: 'D', title: 'D' },
    },
    floatingPanels: [],
    popoutPanels: [],
    unpinnedPanels: [],
    nextZIndex: 1000,
    activePaneId: 'A',
  };
}

function makeFactory() {
  return (panelId: string, container: HTMLElement) => {
    const el = document.createElement('div');
    el.className = 'test-content';
    el.setAttribute('data-content-panel', panelId);
    el.textContent = `Content for ${panelId}`;
    container.appendChild(el);
    return {
      dispose: () => {
        el.remove();
      },
    };
  };
}

describe('TabGroupView stale content slot bug', () => {
  let container: HTMLElement;
  let component: DockviewComponent;

  beforeEach(() => {
    resetIdCounter();
    container = createTestContainer();
  });

  afterEach(() => {
    if (component) component.dispose();
    container.remove();
    document.body.innerHTML = '';
  });

  it('content is visible after panel is selected, deselected, moved out, and moved back', () => {
    component = new DockviewComponent(container, {
      initialState: createInitialState(),
      createContent: makeFactory(),
    });

    // Step 1: select B in tg_left so its content slot is materialised.
    //   tg_left.contentSlots = { A, B }. Persistent container for B is
    //   inside tg_left's B slot wrapper.
    component.dispatch({
      type: 'SET_ACTIVE_PANEL',
      payload: { tabGroupId: 'tg_left', panelId: 'B' },
    });
    // Step 2: re-select A in tg_left. B's slot wrapper gets display=none
    //   but the slot entry and its persistent container are preserved.
    component.dispatch({
      type: 'SET_ACTIVE_PANEL',
      payload: { tabGroupId: 'tg_left', panelId: 'A' },
    });

    // Step 3: move B from tg_left into tg_right.
    //   - tg_left: panelsChanged but active STAYS A. buildContent hits the
    //     `existing A` early-return and LEAVES B's stale slot in the map.
    //   - tg_right: active changes C→B, creates a new slot, bindPlaceholder
    //     moves the persistent container from tg_left to tg_right.
    component.dispatch({
      type: 'MOVE_PANEL',
      payload: { panelId: 'B', targetTabGroupId: 'tg_right', position: 'center' },
    });

    // Sanity: B visible in tg_right right now.
    const tgRightAfterMoveOut = container.querySelector('.dock-tab-group[data-panel-id="B"]');
    expect(tgRightAfterMoveOut, 'tg_right should show B after move').not.toBeNull();

    // Step 4: move B back into tg_left.
    //   - tg_left: active changes A→B. buildContent finds the STALE slot
    //     for B and early-returns. Its wrapper is empty because the
    //     persistent container is still in tg_right.
    component.dispatch({
      type: 'MOVE_PANEL',
      payload: { panelId: 'B', targetTabGroupId: 'tg_left', position: 'center' },
    });

    // After the round trip, tg_left should own panel B and B's content
    // element must live inside tg_left's subtree.
    const tgLeft = container.querySelector('.dock-tab-group[data-panel-id="B"]');
    expect(tgLeft, 'tg_left should be active with panel B after return').not.toBeNull();

    const bContent = container.querySelector('[data-content-panel="B"]');
    expect(bContent, 'B content element must exist').not.toBeNull();

    // Critical assertion — the bug leaves tg_left's B wrapper empty.
    expect(
      tgLeft!.contains(bContent!),
      "B's content element must be inside tg_left after return",
    ).toBe(true);
  });
});
